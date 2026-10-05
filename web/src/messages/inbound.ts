/**
 * Inbound intent parsing. Button payloads are exact; free text is matched
 * loosely because people type "yes!!", "im in", "2", "stop", etc.
 */

export type Intent =
  | { kind: "approve"; tripId?: string }
  | { kind: "decline"; tripId?: string }
  | { kind: "more"; tripId?: string }
  | { kind: "vote"; optionId: string; pref: "yes" | "maybe" | "no" }
  /** A bare number: resolved against the `choices` recorded on the last outbound message. */
  | { kind: "index"; index: number; pref: "yes" | "maybe" | "no" }
  | { kind: "none"; tripId?: string }
  | { kind: "done"; tripId?: string }
  | { kind: "extend"; tripId?: string }
  | { kind: "proceed"; tripId?: string }
  | { kind: "stop" }
  | { kind: "start" }
  | { kind: "help" }
  | { kind: "unknown"; text: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function parseIntent(payload: string | null | undefined, body: string | null | undefined): Intent {
  const p = (payload ?? "").trim();
  if (p) {
    const parts = p.split(":");
    const [kind, a, b] = parts;
    switch (kind) {
      case "approve":
      case "decline":
      case "more":
      case "none":
      case "done":
      case "extend":
      case "proceed":
        return { kind, tripId: UUID.test(a ?? "") ? a : undefined };
      case "vote":
        if (UUID.test(a ?? "") && (b === "yes" || b === "maybe" || b === "no")) {
          return { kind: "vote", optionId: a, pref: b };
        }
    }
  }

  const text = (body ?? "").trim().toLowerCase().replace(/[!.…]+$/g, "");
  if (!text) return { kind: "unknown", text: "" };

  if (/^(stop|unsubscribe|cancel|quit|end)$/.test(text)) return { kind: "stop" };
  if (/^(start|unstop|resume)$/.test(text)) return { kind: "start" };
  if (/^(help|info|\?)$/.test(text)) return { kind: "help" };

  if (/^(yes|y|yep|yeah|in|i'?m in|count me in|sure|ok|👍|🙌)$/.test(text)) return { kind: "approve" };
  if (/^(no|n|nope|out|i'?m out|can'?t|cannot|pass|😞|👎)$/.test(text)) return { kind: "decline" };
  if (/^(more|tell me more|details|info)$/.test(text)) return { kind: "more" };
  if (/^(none|none of these|neither)$/.test(text)) return { kind: "none" };
  if (/^(done|that'?s all|finished)$/.test(text)) return { kind: "done" };
  if (/^(extend|wait|more time)$/.test(text)) return { kind: "extend" };
  if (/^(proceed|lock|lock it|go)$/.test(text)) return { kind: "proceed" };

  // "2", "option 2", "2 no", "2 maybe"
  const m = text.match(/^(?:option\s*)?([1-9])(?:\s+(yes|no|maybe))?$/);
  if (m) return { kind: "index", index: Number(m[1]) - 1, pref: (m[2] as "yes" | "no" | "maybe") ?? "yes" };

  return { kind: "unknown", text };
}
