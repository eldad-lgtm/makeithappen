import { describe, expect, it } from "vitest";
import { ladderFor } from "@/core/nudge";
import type { PushLevel } from "@/core/types";
import { parseIntent } from "./inbound";
import { adminDecisionButtons, approvalButtons, dateChoices, PAYLOAD, render } from "./render";
import { hasTemplate, nudgeTemplateKey, OPT_OUT_FOOTER, TEMPLATES } from "./templates";
import { option } from "@/test/fixtures";

const TRIP = "11111111-2222-4333-8444-555555555555";
const OPT = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";

describe("template library (§7.5)", () => {
  it("every ladder rung on every dial has copy, for both the public and the suppressed-to-DM case", () => {
    for (const push of ["gentle", "standard", "spicy"] as PushLevel[]) {
      for (const step of ladderFor(push)) {
        if (step.target === "admin") continue;
        expect(hasTemplate(nudgeTemplateKey(push, step.target, step.level)), `${push}/${step.target}/${step.level}`).toBe(true);
        if (step.target === "group") {
          expect(hasTemplate(nudgeTemplateKey(push, "dm", step.level)), `${push}/dm/${step.level} (suppressed public)`).toBe(true);
        }
      }
    }
  });

  it("rotates variants by salt and keys the rendered template with the variant", () => {
    const key = Object.keys(TEMPLATES).find((k) => TEMPLATES[k].variants.length > 1)!;
    const a = render(key, { name: "Dana", tripTitle: "Lisbon" }, { salt: 0 });
    const b = render(key, { name: "Dana", tripTitle: "Lisbon" }, { salt: 1 });
    expect(a.templateKey).toBe(`${key}#0`);
    expect(b.templateKey).toBe(`${key}#1`);
    expect(a.body).not.toBe(b.body);
  });

  it("participant messages carry the opt-out footer; admin/system/relay messages don't", () => {
    const participant = Object.keys(TEMPLATES).find((k) => !/^(admin|relay|system)\./.test(k))!;
    const system = Object.keys(TEMPLATES).find((k) => /^(admin|relay|system)\./.test(k))!;
    expect(render(participant, {}).body.endsWith(OPT_OUT_FOOTER)).toBe(true);
    expect(render(system, {}).body.endsWith(OPT_OUT_FOOTER)).toBe(false);
    expect(render(system, {}, { footer: true }).body.endsWith(OPT_OUT_FOOTER)).toBe(true);
  });

  it("no template leaks an unfilled placeholder", () => {
    for (const [k, t] of Object.entries(TEMPLATES)) {
      t.variants.forEach((_, i) => {
        const body = render(k, { name: "Dana", tripTitle: "X", destination: "Y", inviter: "Z" }, { salt: i }).body;
        expect(body, `${k}#${i}`).not.toMatch(/\{\{|\}\}|undefined|NaN/);
      });
    }
  });

  it("throws on an unknown key rather than sending garbage", () => {
    expect(() => render("nope.nothing", {})).toThrow(/unknown template/);
  });
});

describe("WhatsApp interactive limits (§7.2)", () => {
  it("approval and admin decisions fit in 3 buttons", () => {
    expect(approvalButtons(TRIP).length).toBeLessThanOrEqual(3);
    expect(adminDecisionButtons(TRIP).length).toBeLessThanOrEqual(3);
    for (const b of approvalButtons(TRIP)) expect(b.label.length).toBeLessThanOrEqual(20);
  });
  it("≤3 options → buttons; more → a list of ≤10 rows ending with 'None of these'", () => {
    const three = [1, 2, 3].map((i) => option(`o${i}`, `2026-05-0${i}`, `2026-05-0${i + 3}`));
    expect(dateChoices(TRIP, three).buttons).toHaveLength(3);
    const many = Array.from({ length: 12 }, (_, i) => option(`o${i}`, "2026-05-01", "2026-05-04"));
    const list = dateChoices(TRIP, many).list!;
    expect(list.rows.length).toBeLessThanOrEqual(10);
    expect(list.rows.at(-1)!.id).toBe(PAYLOAD.noneWork(TRIP));
    for (const r of list.rows) expect(r.label.length).toBeLessThanOrEqual(24);
  });
});

describe("inbound intent parsing", () => {
  it("round-trips the payload grammar", () => {
    expect(parseIntent(PAYLOAD.approve(TRIP), null)).toEqual({ kind: "approve", tripId: TRIP });
    expect(parseIntent(PAYLOAD.decline(TRIP), "whatever")).toEqual({ kind: "decline", tripId: TRIP });
    expect(parseIntent(PAYLOAD.vote(OPT, "maybe"), null)).toEqual({ kind: "vote", optionId: OPT, pref: "maybe" });
    expect(parseIntent(PAYLOAD.noneWork(TRIP), null)).toEqual({ kind: "none", tripId: TRIP });
    expect(parseIntent(PAYLOAD.proceed(TRIP), null)).toEqual({ kind: "proceed", tripId: TRIP });
    expect(parseIntent(PAYLOAD.extend(TRIP), null)).toEqual({ kind: "extend", tripId: TRIP });
  });
  it("rejects malformed payloads instead of trusting them", () => {
    expect(parseIntent("vote:not-a-uuid:yes", null)).toEqual({ kind: "unknown", text: "" });
    expect(parseIntent(`vote:${OPT}:sure`, "sure")).toEqual({ kind: "approve" });
    expect(parseIntent("approve:junk", null)).toEqual({ kind: "approve", tripId: undefined });
  });
  it("understands how people actually type", () => {
    expect(parseIntent(null, "YES!!").kind).toBe("approve");
    expect(parseIntent(null, "im in").kind).toBe("approve");
    expect(parseIntent(null, "can't").kind).toBe("decline");
    expect(parseIntent(null, "Nope.").kind).toBe("decline");
    expect(parseIntent(null, "2")).toEqual({ kind: "index", index: 1, pref: "yes" });
    expect(parseIntent(null, "option 3 no")).toEqual({ kind: "index", index: 2, pref: "no" });
    expect(parseIntent(null, "lock it").kind).toBe("proceed");
  });
  it("STOP / START / HELP are carrier-mandated and always recognised", () => {
    for (const s of ["STOP", "stop", "Unsubscribe", "QUIT"]) expect(parseIntent(null, s).kind).toBe("stop");
    expect(parseIntent(null, "START").kind).toBe("start");
    expect(parseIntent(null, "help").kind).toBe("help");
    expect(parseIntent(null, "?").kind).toBe("help");
  });
  it("free text with no match is unknown, lowercased", () => {
    expect(parseIntent(null, "What about June?")).toEqual({ kind: "unknown", text: "what about june?" });
  });
});
