import type { MessageKind } from "@/core/limits";
import type { Phase } from "@/core/types";

/** WhatsApp quick-reply button. `id` is the payload the webhook receives. */
export interface Button {
  id: string;
  label: string; // ≤ 20 chars on WhatsApp
}

/** WhatsApp list-picker row (up to 10). */
export interface ListRow {
  id: string;
  label: string; // ≤ 24 chars
  description?: string; // ≤ 72 chars
}

/**
 * What the domain emits. The channel decides how to deliver it: buttons on
 * WhatsApp, numbered choices on SMS, a share sheet for deep links (§7.3).
 */
export interface OutboundMessage {
  templateKey: string;
  body: string;
  buttons?: Button[];
  list?: { buttonLabel: string; rows: ListRow[] };
  context: {
    tripId?: string;
    userId?: string;
    phase?: Phase;
    kind: MessageKind;
  };
}
