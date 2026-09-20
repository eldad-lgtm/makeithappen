/**
 * Domain types. Mirrors the data model in PLAN.md §5.
 *
 * Everything in `core/` is pure: no I/O, no React, no storage. That is the
 * boundary rule from PLAN.md §7.5, and it is why this logic is unit-testable
 * and reusable in the real build rather than prototype throwaway.
 */

export type Pref = "yes" | "maybe" | "no";
export type ApprovalDecision = "yes" | "no";

export type TripStatus =
  | "draft"
  | "approval"
  | "date_collection"
  | "date_proposed"
  | "date_locked"
  | "rejected"
  | "cancelled";

export type EscalationMode = "relay" | "managed" | "none";
/** How hard the engine pushes ghosts. PLAN.md §15 Q4 — adjustable per trip. */
export type PushLevel = "gentle" | "standard" | "spicy";
export type Role = "admin" | "member";
export type Phase = "approval" | "dates";
export type DateSource = "system" | "admin" | "member";

export interface Member {
  id: string;
  name: string;
  phone: string;
  role: Role;
  /** Trip is pointless without them: their `no` disqualifies a window (§6.3). */
  isEssential: boolean;
  /** null = provisional, never logged in (§5.1). */
  claimed: boolean;
  approval: ApprovalDecision | null;
  approvalAt: number | null;
  /** dateOptionId -> preference */
  votes: Record<string, Pref>;
  votesCompletedAt: number | null;
  optedOut: boolean;
}

export interface DateOption {
  id: string;
  /** ISO yyyy-mm-dd */
  start: string;
  end: string;
  label: string;
  generatedBy: DateSource;
  /** Set when a person suggested this window. */
  suggestedById?: string;
}

export interface Trip {
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
  createdAt: number;
  /** When the current phase's question went out — the clock nudges run against. */
  approvalAskedAt: number | null;
  datesAskedAt: number | null;
  lockedOptionId: string | null;
  /** Set once every invitee has answered yes/no and the all-hands note went out. */
  allApprovalsAnnouncedAt: number | null;
}

export interface NudgeRecord {
  id: string;
  memberId: string;
  phase: Phase;
  level: number;
  target: "dm" | "group" | "admin";
  at: number;
}

export interface RelayItem {
  id: string;
  level: number;
  body: string;
  createdAt: number;
  expiresAt: number;
  sentAt: number | null;
  dismissedAt: number | null;
}

export interface ChatMessage {
  id: string;
  /** null = the friends' group thread */
  memberId: string | null;
  from: "bot" | "member" | "admin";
  authorName?: string;
  body: string;
  at: number;
  /** Tappable quick replies, WhatsApp-style. Max 3 per message (§7.2). */
  replies?: QuickReply[];
}

export interface QuickReply {
  label: string;
  action: QuickReplyAction;
}

export type QuickReplyAction =
  | { kind: "approve" }
  | { kind: "decline" }
  | { kind: "vote"; optionId: string; pref: Pref }
  | { kind: "openCalendar" }
  | { kind: "suggestDates" };

/** Every decision the engine makes, including the ones to stay silent. */
export interface LogEntry {
  id: string;
  at: number;
  kind: "transition" | "sent" | "suppressed" | "queued" | "cancelled" | "action";
  detail: string;
}
