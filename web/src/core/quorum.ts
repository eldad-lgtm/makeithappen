/** Approval quorum math. PLAN.md §4.1. */

import type { Member } from "./types";

export interface Tally {
  yes: number;
  no: number;
  pending: number;
  invited: number;
}

export function tally(members: Member[]): Tally {
  let yes = 0;
  let no = 0;
  for (const m of members) {
    if (m.approval === "yes") yes++;
    else if (m.approval === "no") no++;
  }
  return { yes, no, pending: members.length - yes - no, invited: members.length };
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
  return members.filter((m) => m.approval === "yes");
}
