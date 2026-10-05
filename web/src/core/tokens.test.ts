import { describe, expect, it } from "vitest";
import { tokenTtlMs, validateToken, type TokenRow } from "./tokens";
import { HOUR, T0 } from "@/test/fixtures";

const DAY = 24 * HOUR;
const row = (over: Partial<TokenRow> = {}): TokenRow => ({ tripId: "t", userId: "u", scope: "approve", expiresAt: T0 + DAY, usedAt: null, ...over });

describe("action tokens (§7.6)", () => {
  it("a token carries exactly one scope", () => {
    expect(validateToken(row(), "availability", "approval", T0)).toEqual({ ok: false, reason: "wrong_scope" });
    expect(validateToken(row(), "approve", "approval", T0)).toEqual({ ok: true });
  });
  it("expires", () => {
    expect(validateToken(row(), "approve", "approval", T0 + DAY)).toEqual({ ok: false, reason: "expired" });
  });
  it("dies with its phase, not its trip", () => {
    expect(validateToken(row(), "approve", "approved", T0)).toEqual({ ok: false, reason: "wrong_phase" });
    expect(validateToken(row({ scope: "availability" }), "availability", "date_collection", T0)).toEqual({ ok: true });
    expect(validateToken(row({ scope: "availability" }), "availability", "date_locked", T0)).toEqual({ ok: false, reason: "wrong_phase" });
    expect(validateToken(row({ scope: "view" }), "view", "date_locked", T0)).toEqual({ ok: true });
  });
  it("approve tokens are reusable so people can change their mind until the phase closes", () => {
    expect(validateToken(row({ usedAt: T0 - HOUR }), "approve", "approval", T0)).toEqual({ ok: true });
  });
  it("TTL is bounded by the response deadline plus a grace day", () => {
    expect(tokenTtlMs("approve", null, T0)).toBe(14 * DAY);
    expect(tokenTtlMs("view", null, T0)).toBe(30 * DAY);
    expect(tokenTtlMs("approve", T0 + 2 * DAY, T0)).toBe(3 * DAY);
    expect(tokenTtlMs("approve", T0 - DAY, T0)).toBe(14 * DAY);
  });
});
