"use server";

import { revalidatePath } from "next/cache";
import { trusted } from "@/db/token-scope/client";
import { isPlatformAdmin, requireUser } from "@/lib/auth/session";
import { env } from "@/lib/env";
import { setKillSwitch, tripCircuit } from "@/observability/guard";

async function requirePlatformAdmin() {
  const s = await requireUser();
  if (!isPlatformAdmin(s.appUser, env.ADMIN_PHONES)) throw new Error("forbidden");
  return trusted({ kind: "system", reason: `platform admin ${s.appUser.id}` });
}

/** The kill switch (§7.7): seconds, not a deploy. */
export async function toggleKillSwitch(formData: FormData): Promise<void> {
  const t = await requirePlatformAdmin();
  await setKillSwitch(t, String(formData.get("enable")) === "1");
  revalidatePath("/admin");
}

export async function resetCircuit(): Promise<void> {
  const t = await requirePlatformAdmin();
  await tripCircuit(t, false);
  revalidatePath("/admin");
}

export async function retryJob(formData: FormData): Promise<void> {
  const t = await requirePlatformAdmin();
  await t.db.from("scheduled_jobs").update({ status: "pending", attempts: 0, last_error: null, run_at: new Date().toISOString() }).eq("id", String(formData.get("job_id")));
  revalidatePath("/admin");
}
