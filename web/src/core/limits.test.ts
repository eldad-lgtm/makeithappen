import { describe, expect, it } from "vitest";
import { checkPersonCaps, checkSpend, DEFAULT_CEILINGS, type OutboundCounts } from "./limits";

const zero: OutboundCounts = { userToday: 0, userDm20h: 0, userDmWeek: 0, userActiveTrips: 1, tripTotal: 0, accountToday: 0, accountMonth: 0 };

describe("person caps (§6.8)", () => {
  it("4 messages a day, across all trips, for any kind except admin", () => {
    expect(checkPersonCaps("ask", { ...zero, userToday: 4 }).ok).toBe(false);
    expect(checkPersonCaps("confirmation", { ...zero, userToday: 4 }).ok).toBe(false);
    expect(checkPersonCaps("admin", { ...zero, userToday: 40 }).ok).toBe(true);
  });
  it("nudge-specific: one DM per 20h, three per week, two trips at once", () => {
    expect(checkPersonCaps("nudge_dm", { ...zero, userDm20h: 1 })).toMatchObject({ ok: false, reason: expect.stringMatching(/20h/) });
    expect(checkPersonCaps("nudge_dm", { ...zero, userDmWeek: 3 })).toMatchObject({ ok: false, reason: expect.stringMatching(/week/) });
    expect(checkPersonCaps("nudge_dm", { ...zero, userActiveTrips: 3 })).toMatchObject({ ok: false, reason: expect.stringMatching(/2 trips/) });
    expect(checkPersonCaps("ask", { ...zero, userDm20h: 1, userDmWeek: 3 }).ok).toBe(true);
  });
  it("blocked verdicts carry a retry hint — defer, don't drop", () => {
    const v = checkPersonCaps("nudge_dm", { ...zero, userDm20h: 1 });
    expect(v.ok === false && v.retryInMs).toBeGreaterThan(0);
  });
});

describe("spend ceilings (§7.7)", () => {
  it("trip budget pauses the trip; account budget trips the circuit", () => {
    expect(checkSpend({ ...zero, tripTotal: DEFAULT_CEILINGS.perTrip })).toMatchObject({ ok: false, scope: "trip" });
    expect(checkSpend({ ...zero, accountToday: DEFAULT_CEILINGS.perDay })).toMatchObject({ ok: false, scope: "account" });
    expect(checkSpend({ ...zero, accountMonth: DEFAULT_CEILINGS.perMonth })).toMatchObject({ ok: false, scope: "account" });
    expect(checkSpend(zero).ok).toBe(true);
  });
  it("accepts custom ceilings", () => {
    expect(checkSpend({ ...zero, tripTotal: 5 }, { perTrip: 5, perDay: 10, perMonth: 10 }).ok).toBe(false);
  });
});
