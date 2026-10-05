import type { DateOption, Member, NudgeRecord } from "@/core/types";

let seq = 0;

export function member(over: Partial<Member> = {}): Member {
  seq++;
  return {
    id: over.id ?? `u${seq}`,
    name: over.name ?? `Person ${seq}`,
    role: "member",
    status: "active",
    isEssential: false,
    timezone: "Asia/Jerusalem",
    approval: "yes",
    votes: {},
    optedOut: false,
    ...over,
  };
}

export function option(id: string, start: string, end: string): DateOption {
  return { id, start, end, label: `${start}→${end}`, generatedBy: "system" };
}

export function nudge(over: Partial<NudgeRecord> & { at: number }): NudgeRecord {
  seq++;
  return {
    id: `n${seq}`,
    memberId: over.memberId ?? "u1",
    tripId: over.tripId ?? "t1",
    phase: over.phase ?? "approval",
    level: over.level ?? 1,
    target: over.target ?? "dm",
    at: over.at,
  };
}

export const HOUR = 3600_000;
export const T0 = Date.UTC(2026, 4, 1, 12, 0, 0); // 2026-05-01 12:00Z
