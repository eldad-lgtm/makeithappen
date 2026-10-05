/**
 * Domain types. Mirrors the data model in PLAN.md §5.
 *
 * Everything in `core/` is pure: no I/O, no React, no storage. That is the
 * boundary rule from PLAN.md §7.5 (enforced by ESLint), and it is why this
 * logic is unit-testable without a database, a queue, or a WhatsApp account.
 */

export type Pref = "yes" | "maybe" | "no";
export type ApprovalDecision = "yes" | "no";

export type TripStatus =
  | "draft"
  | "approval"
  | "approved"
  | "date_collection"
  | "date_proposed"
  | "date_locked"
  | "rejected"
  | "cancelled"
  // Phase 2 — designed for, not built
  | "sourcing"
  | "proposal_review"
  | "committed";

export type EscalationMode = "relay" | "managed" | "none";
/** How hard the engine pushes ghosts. PLAN.md §15 Q4 — adjustable per trip. */
export type PushLevel = "gentle" | "standard" | "spicy";
export type Role = "admin" | "member";
export type MemberStatus = "invited" | "active" | "declined" | "removed";
export type Phase = "approval" | "dates";
export type DateSource = "system" | "admin" | "member";
export type NudgeTarget = "dm" | "group" | "admin";

export interface Member {
  id: string;
  name: string;
  role: Role;
  status: MemberStatus;
  /** Trip is pointless without them: their `no` disqualifies a window (§6.3). */
  isEssential: boolean;
  /** IANA timezone, inferred from the phone's country code if never told (§5.1). */
  timezone: string;
  approval: ApprovalDecision | null;
  /** dateOptionId -> preference */
  votes: Record<string, Pref>;
  optedOut: boolean;
}

export interface DateOption {
  id: string;
  /** ISO yyyy-mm-dd */
  start: string;
  end: string;
  label: string;
  generatedBy: DateSource;
  suggestedById?: string;
}

export interface BlackoutRange {
  userId: string;
  start: string;
  end: string;
}

export interface Trip {
  id: string;
  title: string;
  destination: string;
  description: string;
  nights: number;
  windowStart: string;
  windowEnd: string;
  quorum: number;
  escalationMode: EscalationMode;
  pushLevel: PushLevel;
  status: TripStatus;
  /** When the current phase's question went out — the clock nudges run against. */
  approvalAskedAt: number | null;
  datesAskedAt: number | null;
  responseDeadline: number | null;
  lockedOptionId: string | null;
}

export interface NudgeRecord {
  id: string;
  memberId: string;
  tripId: string;
  phase: Phase;
  level: number;
  target: NudgeTarget;
  at: number;
}

/** Scopes an action token can carry. One scope per token (§7.6). */
export type TokenScope = "approve" | "availability" | "view";
