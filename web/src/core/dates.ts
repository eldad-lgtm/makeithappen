/**
 * Date option generation, scoring, and explanation. PLAN.md §6.1 – §6.6.
 */

import type { BlackoutRange, DateOption, Member, Pref } from "./types";

/** WhatsApp list pickers allow 10 rows; quick-reply buttons allow 3 (§7.2). */
export const MAX_DATE_OPTIONS = 10;
export const MAX_BUTTON_OPTIONS = 3;

/* ------------------------------ date helpers ------------------------------ */

export function parseISO(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

export function toISO(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function addDays(iso: string, n: number): string {
  const d = parseISO(iso);
  d.setUTCDate(d.getUTCDate() + n);
  return toISO(d);
}

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

export function labelFor(start: string, end: string): string {
  const s = parseISO(start);
  const e = parseISO(end);
  const sm = MONTHS[s.getUTCMonth()];
  const em = MONTHS[e.getUTCMonth()];
  return sm === em
    ? `${sm} ${s.getUTCDate()} – ${e.getUTCDate()}`
    : `${sm} ${s.getUTCDate()} – ${em} ${e.getUTCDate()}`;
}

/* ---------------------------- option generation --------------------------- */

/**
 * Slide an `nights`-length window across the search space, prefer
 * weekend-inclusive windows, and return at most `max` non-overlapping options.
 *
 * Capped at 3 by default because WhatsApp allows only 3 quick-reply buttons
 * (§7.2). That constraint is a feature: "which of these three works?" gets
 * answered, "when are you free in May?" does not.
 */
export function generateOptions(
  windowStart: string,
  windowEnd: string,
  nights: number,
  max = 3,
): DateOption[] {
  const candidates: { start: string; end: string; weekendScore: number }[] = [];
  let cursor = windowStart;
  const lastStart = addDays(windowEnd, -nights);

  while (cursor <= lastStart) {
    const end = addDays(cursor, nights);
    // Prefer weekend-inclusive windows. Friday starts win (Fri–Mon for a
    // 3-night trip); Thursday is next; Saturday-start is a weaker fit.
    const startDow = parseISO(cursor).getUTCDay();
    let weekendScore = 0;
    for (let i = 0; i <= nights; i++) {
      const dow = parseISO(addDays(cursor, i)).getUTCDay();
      if (dow === 6 || dow === 0) weekendScore += 2;
    }
    if (startDow === 5) weekendScore += 5;
    else if (startDow === 4) weekendScore += 3;
    else if (startDow === 6) weekendScore += 1;
    candidates.push({ start: cursor, end, weekendScore });
    cursor = addDays(cursor, 1);
  }

  candidates.sort((a, b) => b.weekendScore - a.weekendScore || (a.start < b.start ? -1 : 1));

  const picked: { start: string; end: string }[] = [];
  for (const c of candidates) {
    if (picked.length >= max) break;
    const overlaps = picked.some((p) => !(c.end < p.start || c.start > p.end));
    if (!overlaps) picked.push({ start: c.start, end: c.end });
  }

  picked.sort((a, b) => (a.start < b.start ? -1 : 1));
  return picked.map((p, i) => ({
    id: `opt-${i + 1}`,
    start: p.start,
    end: p.end,
    label: labelFor(p.start, p.end),
    generatedBy: "system" as const,
  }));
}

/** A nights-length window a person (or admin) wants on the ballot. */
export function suggestedWindow(
  start: string,
  nights: number,
  id: string,
  generatedBy: DateOption["generatedBy"],
  suggestedById?: string,
): DateOption {
  const end = addDays(start, nights);
  return {
    id,
    start,
    end,
    label: labelFor(start, end),
    generatedBy,
    suggestedById,
  };
}

export function sameWindow(a: DateOption, start: string, end: string): boolean {
  return a.start === start && a.end === end;
}

export function inTripWindow(
  start: string,
  end: string,
  windowStart: string,
  windowEnd: string,
): boolean {
  return start >= windowStart && end <= windowEnd;
}

export function rangesOverlap(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return !(aEnd < bStart || aStart > bEnd);
}

/* -------------------------------- blackouts ------------------------------- */

/**
 * Web users paint a calendar; WhatsApp users tap options. Blackout dates
 * automatically derive a `no` vote for any overlapping option so both inputs
 * feed one scoring function (§5.2). Returns only the derived votes; explicit
 * votes always win over derived ones.
 */
export function deriveVotesFromBlackouts(
  options: DateOption[],
  blackouts: BlackoutRange[],
): { optionId: string; userId: string; preference: Pref }[] {
  const out: { optionId: string; userId: string; preference: Pref }[] = [];
  for (const o of options) {
    const blockedUsers = new Set<string>();
    for (const b of blackouts) {
      if (rangesOverlap(o.start, o.end, b.start, b.end)) blockedUsers.add(b.userId);
    }
    for (const userId of blockedUsers) out.push({ optionId: o.id, userId, preference: "no" });
  }
  return out;
}

/** Apply derived votes without overriding explicit ones. */
export function mergeVotes(
  members: Member[],
  derived: { optionId: string; userId: string; preference: Pref }[],
): Member[] {
  const byUser = new Map<string, Record<string, Pref>>();
  for (const d of derived) {
    const m = byUser.get(d.userId) ?? {};
    m[d.optionId] = d.preference;
    byUser.set(d.userId, m);
  }
  return members.map((m) => {
    const extra = byUser.get(m.id);
    if (!extra) return m;
    return { ...m, votes: { ...extra, ...m.votes } };
  });
}

/* --------------------------------- scoring -------------------------------- */

export interface ScoredOption {
  option: DateOption;
  yes: number;
  maybe: number;
  no: number;
  responded: number;
  couldAttend: number;
  score: number;
  eligible: boolean;
  /** Why it was ruled out, if it was. */
  ruledOut: string | null;
  /** Names of people who voted no. */
  cannotAttend: string[];
}

const WEIGHT: Record<Pref, number> = { yes: 2, maybe: 1, no: -3 };

/**
 * score = 2×yes + 1×maybe − 3×no
 *
 * The asymmetry is deliberate. A `no` is usually a hard conflict — a wedding, a
 * work trip, a paid-for exam — while a `yes` only means "that works".
 * Optimizing for most yes-votes produces windows a few people flatly cannot
 * attend; penalizing `no` heavily produces windows everyone can actually make.
 */
export function scoreOption(
  option: DateOption,
  members: Member[],
  quorum: number,
): ScoredOption {
  let yes = 0;
  let maybe = 0;
  let no = 0;
  let score = 0;
  const cannotAttend: string[] = [];
  const essentialBlockers: string[] = [];

  for (const m of members) {
    const pref = m.votes[option.id];
    if (!pref) continue;
    if (pref === "yes") yes++;
    else if (pref === "maybe") maybe++;
    else {
      no++;
      cannotAttend.push(m.name.split(" ")[0]);
      if (m.isEssential) essentialBlockers.push(m.name.split(" ")[0]);
    }
    score += WEIGHT[pref];
  }

  const couldAttend = yes + maybe;
  let ruledOut: string | null = null;
  if (essentialBlockers.length > 0) {
    ruledOut = `${essentialBlockers.join(" and ")} can't make it, and the trip needs them`;
  } else if (couldAttend < quorum) {
    ruledOut = `only ${couldAttend} of ${members.length} could attend — below the ${quorum} needed`;
  }

  return {
    option,
    yes,
    maybe,
    no,
    responded: yes + maybe + no,
    couldAttend,
    score,
    eligible: ruledOut === null,
    ruledOut,
    cannotAttend,
  };
}

/** Ranked best-first. Eligible options always outrank ruled-out ones. */
export function rankOptions(
  options: DateOption[],
  members: Member[],
  quorum: number,
): ScoredOption[] {
  return options
    .map((o) => scoreOption(o, members, quorum))
    .sort((a, b) => {
      if (a.eligible !== b.eligible) return a.eligible ? -1 : 1;
      if (b.score !== a.score) return b.score - a.score; // primary: score
      if (a.no !== b.no) return a.no - b.no; // fewest no
      if (b.yes !== a.yes) return b.yes - a.yes; // most firm yes
      return a.option.start < b.option.start ? -1 : 1; // earliest — sooner happens
    });
}

/**
 * Plain-language reason. Never show the raw score to members: the number is an
 * implementation detail, the sentence is the product. Groups accept decisions
 * they understand and relitigate ones they don't (§6.5).
 */
export function explain(s: ScoredOption, total: number): string {
  if (!s.eligible) return `Ruled out — ${s.ruledOut}.`;
  const base = `Works for ${s.couldAttend} of ${total}.`;
  if (s.cannotAttend.length === 0) return `${base} Everyone can make it.`;
  if (s.cannotAttend.length === 1) return `${base} Only ${s.cannotAttend[0]} can't make it.`;
  const last = s.cannotAttend[s.cannotAttend.length - 1];
  return `${base} ${s.cannotAttend.slice(0, -1).join(", ")} and ${last} can't.`;
}

/** Auto-lock only when there is genuinely nothing to decide (§6.6). */
export function shouldAutoLock(ranked: ScoredOption[], activeCount: number): boolean {
  const top = ranked[0];
  if (!top || !top.eligible) return false;
  return top.responded === activeCount && top.yes === activeCount;
}
