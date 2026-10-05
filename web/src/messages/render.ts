/**
 * Template rendering. Separates template KEYS from rendered text (§7.5).
 */

import type { ScoredOption } from "@/core/dates";
import type { DateOption } from "@/core/types";
import { explain } from "@/core/dates";
import { OPT_OUT_FOOTER, TEMPLATES, type TemplateVars } from "./templates";
import type { Button, ListRow, OutboundMessage } from "./types";

export const EMPTY_VARS: TemplateVars = {
  tripTitle: "",
  destination: "",
  nights: 0,
  windowLabel: "",
  description: "",
  inviter: "",
  invitedCount: 0,
  quorum: 0,
  yesCount: 0,
  name: "",
  waiting: 0,
  answered: "",
  answeredCount: 0,
  ghosts: "",
  total: 0,
  days: 0,
  link: "",
  topOption: "",
  topCount: 0,
  cannot: "",
  rankedList: "",
  deadlineLabel: "",
  optionLabels: "",
};

export interface RenderOptions {
  /** Rotates variants so repeat offenders don't get identical text. */
  salt?: number;
  /** System/admin messages don't need the opt-out footer; participant messages do (§6.7). */
  footer?: boolean;
}

export interface Rendered {
  templateKey: string;
  body: string;
}

export function render(key: string, vars: Partial<TemplateVars>, opts: RenderOptions = {}): Rendered {
  const t = TEMPLATES[key];
  if (!t) throw new Error(`unknown template: ${key}`);
  const salt = opts.salt ?? 0;
  const variant = t.variants[Math.abs(salt) % t.variants.length];
  const v = { ...EMPTY_VARS, ...vars };
  let body = variant(v);
  const defaultFooter = !key.startsWith("admin.") && !key.startsWith("relay.") && !key.startsWith("system.");
  if (opts.footer ?? defaultFooter) {
    body += OPT_OUT_FOOTER;
  }
  return { templateKey: `${key}#${Math.abs(salt) % t.variants.length}`, body };
}

/* ----------------------------- helpers for vars ---------------------------- */

export function joinNames(names: string[]): string {
  if (names.length === 0) return "";
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

export function firstName(full: string): string {
  return full.trim().split(/\s+/)[0] ?? full;
}

export function rankedListText(ranked: ScoredOption[], total: number): string {
  const medals = ["🥇", "🥈", "🥉"];
  return ranked
    .slice(0, 3)
    .map((s, i) => `${medals[i] ?? "•"} ${s.option.label} — ${explain(s, total)}`)
    .join("\n");
}

export function optionLabelsText(options: DateOption[]): string {
  return options.map((o, i) => `${i + 1}. ${o.label}`).join("\n");
}

/* ------------------------------ button payloads ----------------------------- */
/* Payload grammar is the contract between outbound buttons and the webhook. */

export const PAYLOAD = {
  approve: (tripId: string) => `approve:${tripId}`,
  decline: (tripId: string) => `decline:${tripId}`,
  more: (tripId: string) => `more:${tripId}`,
  vote: (optionId: string, pref: "yes" | "maybe" | "no") => `vote:${optionId}:${pref}`,
  noneWork: (tripId: string) => `none:${tripId}`,
  done: (tripId: string) => `done:${tripId}`,
  extend: (tripId: string) => `extend:${tripId}`,
  proceed: (tripId: string) => `proceed:${tripId}`,
} as const;

export function approvalButtons(tripId: string): Button[] {
  return [
    { id: PAYLOAD.approve(tripId), label: "I'm in 🙌" },
    { id: PAYLOAD.decline(tripId), label: "Can't 😞" },
    { id: PAYLOAD.more(tripId), label: "Tell me more" },
  ];
}

/** Up to 3 options → buttons; more → list rows (WhatsApp limits, §7.2). */
export function dateChoices(
  tripId: string,
  options: DateOption[],
): { buttons?: Button[]; list?: { buttonLabel: string; rows: ListRow[] } } {
  if (options.length <= 3) {
    return { buttons: options.map((o) => ({ id: PAYLOAD.vote(o.id, "yes"), label: o.label.slice(0, 20) })) };
  }
  const rows: ListRow[] = options.slice(0, 9).map((o) => ({
    id: PAYLOAD.vote(o.id, "yes"),
    label: o.label.slice(0, 24),
  }));
  rows.push({ id: PAYLOAD.noneWork(tripId), label: "None of these" });
  return { list: { buttonLabel: "Pick dates", rows } };
}

export function adminDecisionButtons(tripId: string): Button[] {
  return [
    { id: PAYLOAD.proceed(tripId), label: "Lock without them" },
    { id: PAYLOAD.extend(tripId), label: "Extend a week" },
  ];
}

export function message(
  rendered: Rendered,
  context: OutboundMessage["context"],
  extras: Pick<OutboundMessage, "buttons" | "list"> = {},
): OutboundMessage {
  return { templateKey: rendered.templateKey, body: rendered.body, context, ...extras };
}
