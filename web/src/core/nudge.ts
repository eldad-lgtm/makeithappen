/**
 * Nudge escalation policy. PLAN.md §6.7, §6.8, and §15 Q4 (push-level dial).
 *
 * A pure decision function. It returns either an action to take or an explicit
 * reason for staying silent — the reasons matter as much as the sends, because
 * "why didn't it nudge?" is the question you actually debug.
 */

import type { EscalationMode, Member, NudgeRecord, Phase, PushLevel } from "./types";

export interface LadderStep {
  level: number;
  afterHours: number;
  target: "dm" | "group" | "admin";
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

export const PUSH_LEVELS: {
  id: PushLevel;
  label: string;
  hint: string;
}[] = [
  { id: "gentle", label: "Gentle", hint: "Slower, private, no roasting" },
  { id: "standard", label: "Standard", hint: "The plan: 24h steps, group callouts" },
  { id: "spicy", label: "Spicy", hint: "Faster ladder, sharper copy" },
];

export interface NudgeAction {
  memberId: string;
  level: number;
  target: "dm" | "group" | "admin";
  body: string;
}

export type NudgeDecision =
  | { send: NudgeAction }
  | { skip: string };

const HOUR = 3600_000;

interface Vars {
  name: string;
  waiting: number;
  answered: string;
  answeredCount: number;
  ghosts: string;
  total: number;
  days: number;
}

type CopyPool = Record<number, ((v: Vars) => string)[]>;

const STANDARD_DM: CopyPool = {
  1: [
    () => `Gentle reminder: Athens needs your dates.\n\nTakes four seconds. Literally four.`,
    () => `Quick one — your Athens dates are the only thing missing.\n\nFour seconds. Less than this message took to read.`,
  ],
  2: [
    (v) =>
      `${v.name}, ${v.waiting} people are waiting on you.\n\nThat's ${v.waiting} people. Thinking about you. Not in a good way.`,
    (v) =>
      `Still nothing, ${v.name}. ${v.waiting} people have answered.\n\nWe both know you've seen this.`,
  ],
};

const STANDARD_GROUP: CopyPool = {
  3: [
    (v) =>
      `ATHENS STANDINGS\n\nAnswered: ${v.answered}\nStill deciding: ${v.ghosts}\n\nWe're not angry. Just visibly disappointed.`,
    (v) =>
      `ATHENS PROGRESS REPORT\n\n${v.answeredCount} of ${v.total} have picked dates.\nOutstanding: ${v.ghosts}\n\nNo pressure. Obviously this is pressure.`,
  ],
  4: [
    (v) =>
      `SLOWEST HUMAN ALIVE AWARD\n\n${v.ghosts} — ${v.days} days.\n\nPrevious record holder: also ${v.ghosts}, Barcelona 2024.`,
    (v) =>
      `Day ${v.days} of waiting for ${v.ghosts}.\n\nThe ruins of Athens have been standing for 2,500 years. They can wait. We cannot.`,
  ],
};

const GENTLE_DM: CopyPool = {
  1: [
    () => `No rush — when you have a minute, Athens still needs your dates.`,
    () => `Friendly nudge: your dates for Athens whenever you're ready.`,
  ],
  2: [
    (v) =>
      `Hey ${v.name} — still hoping for your dates when you can.\n\n${v.waiting} people have answered. No pressure from the group.`,
    (v) => `Still waiting on your Athens dates, ${v.name}. Whenever works.`,
  ],
  3: [
    (v) =>
      `${v.name}, a quiet update: ${v.answeredCount} of ${v.total} have dates in.\n\nStill need yours. No callout, just us.`,
  ],
  4: [
    (v) =>
      `Last private ask, ${v.name}. ${v.days} days in. The admin can lock without you if that's easier.`,
  ],
};

const SPICY_DM: CopyPool = {
  1: [
    () => `Athens. Your dates. Now would be great.\n\nFour seconds. The group is watching the clock.`,
    () => `This is the polite version. Athens needs your dates.`,
  ],
  2: [
    (v) =>
      `${v.name}. ${v.waiting} people have answered. You have not.\n\nThe next one goes to the group.`,
    (v) => `Still nothing, ${v.name}. We both know you've seen this. The group version is worse.`,
  ],
};

const SPICY_GROUP: CopyPool = {
  3: [
    (v) =>
      `ATHENS STANDINGS — and they are not flattering.\n\nIn: ${v.answered}\nGhosting: ${v.ghosts}\n\nName and shame, affectionately.`,
    (v) =>
      `${v.answeredCount} of ${v.total} have dates.\n\nOutstanding: ${v.ghosts}\n\nThis is now a spectator sport.`,
  ],
  4: [
    (v) =>
      `SLOWEST HUMAN ALIVE AWARD (SPICY EDITION)\n\n${v.ghosts} — ${v.days} days.\n\nThe ruins waited 2,500 years. We will not.`,
    (v) =>
      `Day ${v.days}. ${v.ghosts} still has not picked dates.\n\nPrevious record: also ${v.ghosts}. This is a pattern.`,
  ],
};

function poolFor(push: PushLevel, target: string): CopyPool {
  if (push === "gentle") return GENTLE_DM;
  if (push === "spicy") return target === "group" ? SPICY_GROUP : SPICY_DM;
  return target === "group" ? STANDARD_GROUP : STANDARD_DM;
}

export function renderNudge(
  level: number,
  target: string,
  v: Vars,
  salt: number,
  push: PushLevel = "standard",
): string {
  const pool = poolFor(push, target);
  const variants = pool[level];
  if (!variants || variants.length === 0) {
    return `Still waiting on ${v.ghosts}. Lock the dates without them, or give them another day?`;
  }
  return variants[salt % variants.length](v);
}

export interface PolicyInput {
  member: Member;
  phase: Phase;
  mode: EscalationMode;
  pushLevel: PushLevel;
  askedAt: number;
  now: number;
  /** This member's nudge history for this phase. */
  history: NudgeRecord[];
  /** All nudges to this member across every trip — for §6.8 global caps. */
  globalHistory: NudgeRecord[];
  hasResponded: boolean;
  /** Local hour 0–23 in the member's timezone. */
  localHour: number;
}

export function decide(input: PolicyInput): NudgeDecision {
  const { member, phase, mode, pushLevel, askedAt, now, history, globalHistory, hasResponded } =
    input;

  if (hasResponded) return { skip: `${first(member)} already answered` };
  if (member.optedOut) return { skip: `${first(member)} opted out of messaging` };

  const hours = (now - askedAt) / HOUR;
  const ladder = ladderFor(pushLevel);
  const due = [...ladder].reverse().find((s) => hours >= s.afterHours);
  if (!due) return { skip: `too early — ${Math.floor(hours)}h since the ask (${pushLevel})` };

  const alreadySent = history.some((n) => n.level === due.level && n.phase === phase);
  if (alreadySent) return { skip: `level ${due.level} already sent to ${first(member)}` };

  // Gentle never goes public. `none` also keeps public levels as DMs (§6.7).
  const target: "dm" | "group" | "admin" =
    due.target === "group" && (mode === "none" || pushLevel === "gentle") ? "dm" : due.target;

  if (target === "dm" && (input.localHour >= 22 || input.localHour < 8)) {
    return { skip: `quiet hours for ${first(member)} (${input.localHour}:00 local)` };
  }

  if (target === "dm") {
    const recentDm = globalHistory.filter((n) => n.target === "dm" && now - n.at < 20 * HOUR);
    if (recentDm.length > 0) {
      return { skip: `global cap — ${first(member)} was DM'd under 20h ago` };
    }
  }
  if (target === "group") {
    const recentGroup = globalHistory.filter((n) => n.target === "group" && now - n.at < 48 * HOUR);
    if (recentGroup.length > 0) {
      return { skip: `global cap — ${first(member)} was named publicly under 48h ago` };
    }
  }

  return {
    send: { memberId: member.id, level: due.level, target, body: "" },
  };
}

function first(m: Member): string {
  return m.name.split(" ")[0];
}
