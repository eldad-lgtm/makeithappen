import { describe, expect, it } from "vitest";
import { decide, inQuietHours, ladderFor, nextStepAt, type PolicyInput } from "./nudge";
import { HOUR, member, nudge, T0 } from "@/test/fixtures";

function input(over: Partial<PolicyInput> = {}): PolicyInput {
  return {
    member: member({ id: "u1", name: "Dana Levi", approval: null }),
    phase: "approval",
    mode: "relay",
    pushLevel: "standard",
    askedAt: T0,
    now: T0,
    history: [],
    globalHistory: [],
    hasResponded: false,
    localHour: 14,
    tripGroupCallouts48h: 0,
    ...over,
  };
}

function expectSend(d: ReturnType<typeof decide>) {
  if (!("send" in d)) throw new Error(`expected send, got skip: ${d.skip}`);
  return d.send;
}
function expectSkip(d: ReturnType<typeof decide>) {
  if (!("skip" in d)) throw new Error(`expected skip, got send level ${d.send.level}`);
  return d;
}

describe("nudge policy (§6.7)", () => {
  it("is silent before the first step and says when to retry", () => {
    const d = expectSkip(decide(input({ now: T0 + 10 * HOUR })));
    expect(d.skip).toMatch(/too early/);
    expect(d.retryInMs).toBe(14 * HOUR);
  });

  it("climbs the standard ladder: DM, DM, group, group, admin", () => {
    const targets = [24, 48, 72, 96, 120].map((h, i) => {
      const history = ladderFor("standard").slice(0, i).map((s) => nudge({ level: s.level, target: s.target, at: T0 + s.afterHours * HOUR }));
      // global history must not block: push the DMs far enough back
      const d = expectSend(decide(input({ now: T0 + h * HOUR + 1, history, globalHistory: [] })));
      return [d.level, d.target];
    });
    expect(targets).toEqual([[1, "dm"], [2, "dm"], [3, "group"], [4, "group"], [5, "admin"]]);
  });

  it("never sends the same level twice", () => {
    const history = [nudge({ level: 1, at: T0 + 24 * HOUR })];
    const d = expectSkip(decide(input({ now: T0 + 30 * HOUR, history })));
    expect(d.skip).toMatch(/level 1 already sent/);
  });

  it("stops the instant the person answers, opts out, or leaves", () => {
    expect(expectSkip(decide(input({ now: T0 + 30 * HOUR, hasResponded: true }))).skip).toMatch(/already answered/);
    expect(expectSkip(decide(input({ now: T0 + 30 * HOUR, member: member({ optedOut: true }) }))).skip).toMatch(/opted out/);
    expect(expectSkip(decide(input({ now: T0 + 30 * HOUR, member: member({ status: "declined" }) }))).skip).toMatch(/no longer/);
  });

  it("respects quiet hours in the member's local time and retries in the morning", () => {
    const d = expectSkip(decide(input({ now: T0 + 30 * HOUR, localHour: 23 })));
    expect(d.skip).toMatch(/quiet hours/);
    expect(d.retryInMs).toBe(9 * HOUR);
    expect(inQuietHours(7)).toBe(true);
    expect(inQuietHours(8)).toBe(false);
    expect(inQuietHours(22)).toBe(true);
  });

  it("escalation mode `none` turns public levels into firmer DMs — never silence", () => {
    const history = [1, 2].map((l) => nudge({ level: l, at: T0 + l * 24 * HOUR }));
    const d = expectSend(decide(input({ now: T0 + 73 * HOUR, mode: "none", history })));
    expect(d.level).toBe(3);
    expect(d.target).toBe("dm");
    expect(d.ladderTarget).toBe("group");
    expect(d.publicSuppressed).toBe(true);
  });

  it("gentle dial is slower and stays private", () => {
    expect(expectSkip(decide(input({ pushLevel: "gentle", now: T0 + 30 * HOUR }))).skip).toMatch(/too early/);
    const d = expectSend(decide(input({ pushLevel: "gentle", now: T0 + 37 * HOUR })));
    expect(d.level).toBe(1);
    expect(ladderFor("gentle").every((s) => s.target !== "group")).toBe(true);
  });

  it("spicy dial is faster", () => {
    const d = expectSend(decide(input({ pushLevel: "spicy", now: T0 + 13 * HOUR })));
    expect(d.level).toBe(1);
  });

  describe("global per-person caps (§6.8)", () => {
    it("defers a DM when another trip DM'd this person under 20h ago", () => {
      const other = nudge({ tripId: "other", at: T0 + 20 * HOUR });
      const d = expectSkip(decide(input({ now: T0 + 25 * HOUR, globalHistory: [other] })));
      expect(d.skip).toMatch(/global cap/);
      expect(d.retryInMs).toBeGreaterThan(0);
      expect(d.retryInMs!).toBeLessThanOrEqual(20 * HOUR);
    });

    it("defers a public callout when named publicly anywhere in 48h", () => {
      const history = [1, 2].map((l) => nudge({ level: l, at: T0 + l * 24 * HOUR }));
      const other = nudge({ tripId: "other", target: "group", at: T0 + 50 * HOUR });
      const d = expectSkip(decide(input({ now: T0 + 73 * HOUR, history, globalHistory: [other] })));
      expect(d.skip).toMatch(/named publicly/);
    });

    it("one group callout per trip per 48h", () => {
      const history = [1, 2].map((l) => nudge({ level: l, at: T0 + l * 24 * HOUR }));
      const d = expectSkip(decide(input({ now: T0 + 73 * HOUR, history, tripGroupCallouts48h: 1 })));
      expect(d.skip).toMatch(/trip cap/);
    });
  });

  it("nextStepAt returns the next unsent rung or null when the ladder is exhausted", () => {
    expect(nextStepAt("standard", T0, [])).toBe(T0 + 24 * HOUR);
    expect(nextStepAt("standard", T0, [1, 2])).toBe(T0 + 72 * HOUR);
    expect(nextStepAt("standard", T0, [1, 2, 3, 4, 5])).toBeNull();
  });
});
