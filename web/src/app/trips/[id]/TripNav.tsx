import Link from "next/link";
import { StatusPill } from "@/components/StatusPill";
import type { Trip } from "@/core/types";

export function TripNav({ trip, isAdmin, active }: { trip: Trip; isAdmin: boolean; active: "dashboard" | "members" | "dates" | "settings" }) {
  const tabs = [
    { id: "dashboard", href: `/trips/${trip.id}`, label: "Dashboard" },
    { id: "members", href: `/trips/${trip.id}/members`, label: "Members" },
    { id: "dates", href: `/trips/${trip.id}/dates`, label: "Dates" },
    ...(isAdmin ? [{ id: "settings", href: `/trips/${trip.id}/settings`, label: "Settings" }] : []),
  ];
  return (
    <div className="mb-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold">{trip.title}</h1>
        <StatusPill status={trip.status} />
      </div>
      <p className="text-sm text-muted">
        📍 {trip.destination} · {trip.nights} nights · {trip.windowStart} → {trip.windowEnd} · needs {trip.quorum} yes · callouts:{" "}
        <span className="font-medium">{trip.escalationMode}</span> · push: <span className="font-medium">{trip.pushLevel}</span>
      </p>
      <nav className="mt-4 flex gap-1 border-b border-border text-sm">
        {tabs.map((t) => (
          <Link
            key={t.id}
            href={t.href}
            className={`-mb-px border-b-2 px-3 py-2 ${active === t.id ? "border-accent font-medium" : "border-transparent text-muted hover:text-fg"}`}
          >
            {t.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
