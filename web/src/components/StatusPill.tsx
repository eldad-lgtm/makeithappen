import { STATUS_LABEL } from "@/core/state";
import type { TripStatus } from "@/core/types";

const COLORS: Record<TripStatus, string> = {
  draft: "border-stone-300 bg-stone-100 text-stone-700",
  approval: "border-amber-300 bg-amber-50 text-amber-800",
  approved: "border-green-300 bg-green-50 text-green-800",
  date_collection: "border-sky-300 bg-sky-50 text-sky-800",
  date_proposed: "border-violet-300 bg-violet-50 text-violet-800",
  date_locked: "border-green-400 bg-green-100 text-green-900",
  rejected: "border-red-300 bg-red-50 text-red-800",
  cancelled: "border-stone-300 bg-stone-100 text-stone-500",
  sourcing: "border-sky-300 bg-sky-50 text-sky-800",
  proposal_review: "border-violet-300 bg-violet-50 text-violet-800",
  committed: "border-green-400 bg-green-100 text-green-900",
};

export function StatusPill({ status }: { status: TripStatus }) {
  return <span className={`pill ${COLORS[status]}`}>{STATUS_LABEL[status]}</span>;
}
