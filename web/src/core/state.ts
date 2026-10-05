/**
 * Trip state machine. PLAN.md §4.
 *
 * Nothing mutates a trip's status except a declared transition. The table
 * below is the whole law; `canTransition` is the only question anyone asks.
 */

import type { TripStatus } from "./types";

const TRANSITIONS: Record<TripStatus, readonly TripStatus[]> = {
  draft: ["approval", "cancelled"],
  approval: ["approved", "rejected", "cancelled"],
  approved: ["date_collection", "approval", "cancelled"],
  date_collection: ["date_proposed", "date_locked", "approval", "cancelled"],
  date_proposed: ["date_locked", "date_collection", "cancelled"],
  date_locked: ["sourcing", "date_collection", "cancelled"],
  rejected: [],
  cancelled: [],
  // Phase 2
  sourcing: ["proposal_review", "cancelled"],
  proposal_review: ["committed", "sourcing", "cancelled"],
  committed: ["cancelled"],
};

export function canTransition(from: TripStatus, to: TripStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

export class IllegalTransition extends Error {
  constructor(
    public readonly from: TripStatus,
    public readonly to: TripStatus,
  ) {
    super(`illegal trip transition ${from} → ${to}`);
    this.name = "IllegalTransition";
  }
}

export function assertTransition(from: TripStatus, to: TripStatus): void {
  if (!canTransition(from, to)) throw new IllegalTransition(from, to);
}

export const TERMINAL_STATES: readonly TripStatus[] = ["rejected", "cancelled"];

export function isTerminal(s: TripStatus): boolean {
  return TERMINAL_STATES.includes(s);
}

/** States in which the nudge engine is active, and for which phase. */
export function nudgePhaseFor(s: TripStatus): "approval" | "dates" | null {
  if (s === "approval") return "approval";
  if (s === "date_collection") return "dates";
  return null;
}

/** Human labels for the dashboard. */
export const STATUS_LABEL: Record<TripStatus, string> = {
  draft: "Draft",
  approval: "Collecting yes/no",
  approved: "Approved",
  date_collection: "Collecting dates",
  date_proposed: "Dates proposed",
  date_locked: "Dates locked",
  rejected: "Rejected",
  cancelled: "Cancelled",
  sourcing: "Sourcing travel",
  proposal_review: "Reviewing proposals",
  committed: "Committed",
};

/** One sentence: what is this trip waiting for? (§8 — the dashboard's job.) */
export function blockingReason(
  status: TripStatus,
  pending: number,
  quorum: number,
  yes: number,
): string {
  switch (status) {
    case "draft":
      return "Not sent yet.";
    case "approval":
      return `Needs ${Math.max(0, quorum - yes)} more yes — waiting on ${pending}.`;
    case "approved":
      return "Approved. Asking for dates.";
    case "date_collection":
      return `Waiting on ${pending} for dates.`;
    case "date_proposed":
      return "Ranked options ready — admin needs to lock.";
    case "date_locked":
      return "Dates locked. Done for v1.";
    case "rejected":
      return "Quorum unreachable.";
    case "cancelled":
      return "Cancelled.";
    default:
      return STATUS_LABEL[status];
  }
}
