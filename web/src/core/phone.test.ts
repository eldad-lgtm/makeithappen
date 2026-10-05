import { describe, expect, it } from "vitest";
import { inferTimezone, isE164, localHour, maskPhone, normalizePhone } from "./phone";

describe("phone identity (§5.1)", () => {
  it("normalises local and international input to E.164", () => {
    expect(normalizePhone("054-123-4567", "IL")?.e164).toBe("+972541234567");
    expect(normalizePhone("+1 (415) 555-2671")?.e164).toBe("+14155552671");
    expect(normalizePhone("0541234567", "IL")?.country).toBe("IL");
  });
  it("rejects garbage", () => {
    expect(normalizePhone("")).toBeNull();
    expect(normalizePhone("hello")).toBeNull();
    expect(normalizePhone("123", "IL")).toBeNull();
  });
  it("isE164 is strict", () => {
    expect(isE164("+972541234567")).toBe(true);
    expect(isE164("972541234567")).toBe(false);
    expect(isE164("+0123")).toBe(false);
  });
  it("members only ever see the last four digits", () => {
    expect(maskPhone("+972541234567")).toBe("•••• 4567");
    expect(maskPhone("+972541234567")).not.toContain("972");
  });
  it("infers a timezone from the country, never the server", () => {
    expect(inferTimezone("IL")).toBe("Asia/Jerusalem");
    expect(inferTimezone("XX", "UTC")).toBe("UTC");
    expect(inferTimezone(undefined)).toBe("UTC");
  });
  it("computes the local hour for quiet-hours checks", () => {
    const noonUtc = Date.UTC(2026, 0, 15, 12, 0, 0); // winter: Jerusalem = UTC+2
    expect(localHour(noonUtc, "Asia/Jerusalem")).toBe(14);
    expect(localHour(noonUtc, "UTC")).toBe(12);
  });
});
