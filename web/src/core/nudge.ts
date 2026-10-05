/**
 * Nudge escalation policy. PLAN.md §6.7, §6.8, and §15 Q4 (push-level dial).
 *
 * A pure decision function. It returns either an action to take or an explicit
 * reason for staying silent — the reasons matter as much as the sends, because
 * "why didn't it nudge?" is the question you actually debug.
 *
 * This module decides WHEN and WHERE. The copy lives in `messages/` keyed by
 * template, because outside a 24h WhatsApp session every message must be a
 * pre-approved template (§7.2) — not a string generated here.
 */

import type { EscalationMode, Member, NudgeRecord, NudgeTarget, Phase, PushLevel } from "./types";

export interface LadderStep {
  level: number;
  afterHours: number;
  target: NudgeTarget;
  tone: string;
}

const STANDARD_LADDER: LadderStep[] = [
  { level: 1, afterHours: 24, target: "dm", tone: "Gentle reminder" },
  { level: 2, afterHours: 48, target: "dm", tone: "Playful, slightly personal" },
  { level: 3, afterHours: 72, target: "group", tone: "Public standings" },
  { level: 4, afterHours: 96, target: "group", tone: "Affectionate roast" },
  { level: 5, afterHours: 120, target: "admin", tone: "Proceed, or extend?" },
];

/** Gentle: slower, no public roast. Spicy: faster, sharper copy. */
const GENTLE_LADDER: LadderStep[] = [
  { level: 1, afterHours: 36, target: "dm", tone: "Soft reminder" },
  { level: 2, afterHours: 84, target: "dm", tone: "Warm follow-up" },
  { level: 3, afterHours: 132, target: "dm", tone: "Private standings" },
  { level: 4, afterHours: 180, target: "dm", tone: "Last private ask" },
  { level: 5, afterHours: 228, target: "admin", tone: "Proceed, or extend?" },
];

const SPICY_LADDER: LadderStep[] = [
  { level: 1, afterHours: 12, target: "dm", tone: "Immediate poke" },
  { level: 2, afterHours: 24, target: "dm", tone: "Named and waiting" },
  { level: 3, afterHours: 36, target: "group", tone: "Public standings" },
  { level: 4, afterHours: 48, target: "group", tone: "Comedy award" },
  { level: 5, afterHours: 72, target: "admin", tone: "Proceed, or extend?" },
];

export const LADDER = STANDARD_LADDER;

export function ladderFor(level: PushLevel): LadderStep[] {
  if (level === "gentle") return GENTLE_LADDER;
  if (level === "spicy") return SPICY_LADDER;
  return STANDARD_LADDER;
}

export const PUSH_LEVELS: { id: PushLevel; label: string; hint: string }[] = [
  { id: "gentle", label: "Gentle", hint: "Slower, private, no roasting" },
  { id: "standard", label: "Standard", hint: "The plan: 24h steps, group callouts" },
  { id: "spicy", label: "Spicy", hint: "Faster ladder, sharper copy" },
];

export const QUIET_HOURS = { start: 22, end: 8 } as const;

export function inQuietHours(localHour: number): boolean {
  return localHour >= QUIET_HOURS.start || localHour < QUIET_HOURS.end;
}

export interface NudgeAction {
  memberId: string;
  level: number;
  target: NudgeTarget;
  /** The target the ladder wanted before mode/push adjustments; used to pick copy. */
  ladderTarget: NudgeTarget;
  /** `true` when a public level was converted to a firmer DM (`none` mode / gentle). */
  publicSuppressed: boolean;
}

export type NudgeDecision = { send: NudgeAction } | { skip: string; retryInMs?: number };

const HOUR = 3600_000;

export interface PolicyInput {
  member: Member;
  phase: Phase;
  mode: EscalationMode;
  pushLevel: PushLevel;
  askedAt: number;
  now: number;
  /** This member's nudge history for this trip + phase. */
  history: NudgeRecord[];
  /** All nudges to this member across every trip — for §6.8 global caps. */
  globalHistory: NudgeRecord[];
  hasResponded: boolean;
  /** Local hour 0–23 in the member's timezone. */
  localHour: number;
  /** Group callouts for this trip in the last 48h (any member). Max one per trip per 48h. */
  tripGroupCallouts48h: number;
}

export function decide(input: PolicyInput): NudgeDecision {
  const { member, phase, mode, pushLevel, askedAt, now, history, globalHistory, hasResponded } =
    input;

  if (hasResponded) return { skip: `${first(member)} already answered` };
  if (member.optedOut) return { skip: `${first(member)} opted out of messaging` };
  if (member.status === "removed" || member.status === "declined") {
    return { skip: `${first(member)} is no longer in the trip` };
  }

  const hours = (now - askedAt) / HOUR;
  const ladder = ladderFor(pushLevel);
  const due = [...ladder].reverse().find((s) => hours >= s.afterHours);
  if (!due) {
    const next = ladder[0];
    return {
      skip: `too early — ${Math.floor(hours)}h since the ask (${pushLevel})`,
      retryInMs: Math.max(0, next.afterHours * HOUR - (now - askedAt)),
    };
  }

  const alreadySent = history.some((n) => n.level === due.level && n.phase === phase);
  if (alreadySent) return { skip: `level ${due.level} already sent to ${first(member)}` };

  // Public levels become firmer DMs when the admin turned callouts off (`none`)
  // or chose the gentle dial. The ladder never silently loses its teeth (§6.7).
  const suppressPublic = due.target === "group" && (mode === "none" || pushLevel === "gentle");
  const target: NudgeTarget = suppressPublic ? "dm" : due.target;

  if (target === "dm" && inQuietHours(input.localHour)) {
    const untilMorning = ((QUIET_HOURS.end - input.localHour + 24) % 24) * HOUR;
    return {
      skip: `quiet hours for ${first(member)} (${input.localHour}:00 local)`,
      retryInMs: untilMorning || HOUR,
    };
  }

  if (target === "dm") {
    const recentDm = globalHistory.filter((n) => n.target === "dm" && now - n.at < 20 * HOUR);
    if (recentDm.length > 0) {
      const oldest = Math.min(...recentDm.map((n) => n.at));
      return {
        skip: `global cap — ${first(member)} was DM'd under 20h ago`,
        retryInMs: 20 * HOUR - (now - oldest) + 60_000,
      };
    }
  }

  if (target === "group") {
    const recentGroup = globalHistory.filter((n) => n.target === "group" && now - n.at < 48 * HOUR);
    if (recentGroup.length > 0) {
      const oldest = Math.min(...recentGroup.map((n) => n.at));
      return {
        skip: `global cap — ${first(member)} was named publicly under 48h ago`,
        retryInMs: 48 * HOUR - (now - oldest) + 60_000,
      };
    }
    if (input.tripGroupCallouts48h > 0) {
      return { skip: `trip cap — one group callout per 48h`, retryInMs: 12 * HOUR };
    }
  }

  return {
    send: {
      memberId: member.id,
      level: due.level,
      target,
      ladderTarget: due.target,
      publicSuppressed: suppressPublic,
    },
  };
}

/** When should the runner next look at this member? The next ladder step. */
export function nextStepAt(pushLevel: PushLevel, askedAt: number, sentLevels: number[]): number | null {
  const ladder = ladderFor(pushLevel);
  const next = ladder.find((s) => !sentLevels.includes(s.level));
  if (!next) return null;
  return askedAt + next.afterHours * HOUR;
}

function first(m: Member): string {
  return m.name.split(" ")[0];
}
