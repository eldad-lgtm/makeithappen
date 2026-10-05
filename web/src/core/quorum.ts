/** Approval quorum math. PLAN.md §4.1. */

import type { Member } from "./types";

export interface Tally {
  yes: number;
  no: number;
  pending: number;
  invited: number;
}

/** Only people still in the trip count; removed members are not invitees. */
export function invitees(members: Member[]): Member[] {
  return members.filter((m) => m.status !== "removed");
}

export function tally(members: Member[]): Tally {
  let yes = 0;
  let no = 0;
  const inv = invitees(members);
  for (const m of inv) {
    if (m.approval === "yes") yes++;
    else if (m.approval === "no") no++;
  }
  return { yes, no, pending: inv.length - yes - no, invited: inv.length };
}

export type QuorumState = "reached" | "unreachable" | "open";

/**
 * Advance early, fail early.
 *
 * `reached` the moment yes-votes hit quorum — do not wait for stragglers,
 * because waiting is the disease this product cures. `unreachable` as soon as
 * the remaining people cannot get you there, so a dead trip stops nudging.
 */
export function quorumState(members: Member[], quorum: number): QuorumState {
  const t = tally(members);
  if (t.yes >= quorum) return "reached";
  if (t.invited - t.no < quorum) return "unreachable";
  return "open";
}

/** Members still in the trip for later phases. Rejecters are dropped (§4.1). */
export function activeMembers(members: Member[]): Member[] {
  return members.filter((m) => m.approval === "yes" && m.status !== "removed");
}

/** Members who have not yet answered the current phase's question. */
export function pendingFor(members: Member[], phase: "approval" | "dates", optionIds: string[]): Member[] {
  if (phase === "approval") {
    return invitees(members).filter((m) => m.approval === null);
  }
  return activeMembers(members).filter((m) => !hasVotedAll(m, optionIds));
}

export function hasVotedAll(m: Member, optionIds: string[]): boolean {
  if (optionIds.length === 0) return false;
  return optionIds.every((id) => m.votes[id] !== undefined);
}

export function hasVotedAny(m: Member, optionIds: string[]): boolean {
  return optionIds.some((id) => m.votes[id] !== undefined);
}
