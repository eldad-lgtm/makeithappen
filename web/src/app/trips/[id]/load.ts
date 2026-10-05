import "server-only";

import { notFound } from "next/navigation";
import type { RelayQueueRow, TripActivityRow } from "@/db/database.types";
import { loadTrip, type TripAggregate } from "@/db/queries";
import { requireUser } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export interface TripPageData {
  agg: TripAggregate;
  me: { id: string; name: string; isAdmin: boolean };
  relay: RelayQueueRow[];
  activity: TripActivityRow[];
  names: Map<string, string>;
}

/** Session-path load for every trip page: RLS decides what this user can see. */
export async function loadTripPage(tripId: string): Promise<TripPageData> {
  const s = await requireUser();
  const supabase = await createSupabaseServerClient();
  const agg = await loadTrip(supabase, tripId, "session");
  if (!agg) notFound();

  const me = agg.members.find((m) => m.id === s.appUser.id);
  const isAdmin = me?.role === "admin";

  const [relay, activity] = await Promise.all([
    isAdmin
      ? supabase.from("relay_queue").select("*").eq("trip_id", tripId).is("sent_at", null).is("dismissed_at", null).gt("expires_at", new Date().toISOString()).order("created_at", { ascending: false })
      : Promise.resolve({ data: [] as RelayQueueRow[] }),
    supabase.from("trip_activity").select("*").eq("trip_id", tripId).order("created_at", { ascending: false }).limit(60),
  ]);

  return {
    agg,
    me: { id: s.appUser.id, name: s.appUser.display_name, isAdmin: !!isAdmin },
    relay: (relay.data ?? []) as RelayQueueRow[],
    activity: (activity.data ?? []) as TripActivityRow[],
    names: new Map(agg.members.map((m) => [m.id, m.name])),
  };
}
