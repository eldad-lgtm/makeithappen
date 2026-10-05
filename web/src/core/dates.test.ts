import { describe, expect, it } from "vitest";
import { addDays, deriveVotesFromBlackouts, explain, generateOptions, labelFor, mergeVotes, rangesOverlap, rankOptions, scoreOption, shouldAutoLock } from "./dates";
import { member, option } from "@/test/fixtures";

describe("date arithmetic", () => {
  it("adds days across month boundaries without timezone drift", () => {
    expect(addDays("2026-05-30", 3)).toBe("2026-06-02");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });
  it("labels windows readably", () => {
    expect(labelFor("2026-05-15", "2026-05-18")).toMatch(/May/);
  });
  it("overlap is inclusive", () => {
    expect(rangesOverlap("2026-05-01", "2026-05-03", "2026-05-03", "2026-05-05")).toBe(true);
    expect(rangesOverlap("2026-05-01", "2026-05-03", "2026-05-04", "2026-05-05")).toBe(false);
  });
});

describe("generateOptions (§6.3)", () => {
  it("returns at most `max` non-overlapping windows inside the trip window, favouring weekends", () => {
    const opts = generateOptions("2026-05-01", "2026-05-31", 3, 3);
    expect(opts).toHaveLength(3);
    for (const o of opts) {
      expect(o.start >= "2026-05-01").toBe(true);
      expect(o.end <= "2026-05-31").toBe(true);
      expect(addDays(o.start, 3)).toBe(o.end);
    }
    for (let i = 1; i < opts.length; i++) expect(opts[i].start > opts[i - 1].end).toBe(true);
    // 2026-05-01 is a Friday; Friday starts should dominate a 3-night trip
    const fridays = opts.filter((o) => new Date(o.start + "T00:00:00Z").getUTCDay() === 5);
    expect(fridays.length).toBeGreaterThanOrEqual(2);
  });
  it("returns nothing for a window shorter than the trip", () => {
    expect(generateOptions("2026-05-01", "2026-05-02", 3)).toEqual([]);
  });
});

describe("scoring 2×yes + 1×maybe − 3×no (§6.4)", () => {
  const o1 = option("o1", "2026-05-01", "2026-05-04");
  const o2 = option("o2", "2026-05-08", "2026-05-11");

  it("penalises a hard no more than it rewards yeses", () => {
    const ms = [
      member({ name: "Ana", votes: { o1: "yes", o2: "yes" } }),
      member({ name: "Ben", votes: { o1: "yes", o2: "yes" } }),
      member({ name: "Cy", votes: { o1: "yes", o2: "maybe" } }),
      member({ name: "Dee", votes: { o1: "no", o2: "maybe" } }),
    ];
    const s1 = scoreOption(o1, ms, 2);
    const s2 = scoreOption(o2, ms, 2);
    expect(s1.score).toBe(3); // 3*2 - 3
    expect(s2.score).toBe(6); // 2*2 + 2*1
    expect(rankOptions([o1, o2], ms, 2)[0].option.id).toBe("o2");
  });

  it("an essential member's no rules an option out regardless of score", () => {
    const ms = [
      member({ name: "Ana", votes: { o1: "yes" } }),
      member({ name: "Ben", votes: { o1: "yes" } }),
      member({ name: "Cy", votes: { o1: "yes" } }),
      member({ name: "Dee Birthday", isEssential: true, votes: { o1: "no" } }),
    ];
    const s = scoreOption(o1, ms, 2);
    expect(s.eligible).toBe(false);
    expect(explain(s, 4)).toContain("Dee can't make it");
  });

  it("below quorum is ruled out; eligible options outrank ruled-out ones", () => {
    const ms = [member({ votes: { o1: "yes", o2: "maybe" } }), member({ votes: { o1: "no", o2: "maybe" } }), member({ votes: { o1: "no", o2: "no" } })];
    const ranked = rankOptions([o1, o2], ms, 2);
    expect(ranked[0].option.id).toBe("o2");
    expect(ranked[0].eligible).toBe(true);
    expect(ranked[1].eligible).toBe(false);
    expect(ranked[1].ruledOut).toMatch(/below the 2 needed/);
  });

  it("explains in plain language without exposing the score", () => {
    const ms = [member({ name: "Ana Z", votes: { o1: "yes" } }), member({ name: "Ben Y", votes: { o1: "no" } }), member({ name: "Cy X", votes: { o1: "no" } })];
    const txt = explain(scoreOption(o1, ms, 1), 3);
    expect(txt).toBe("Works for 1 of 3. Ben and Cy can't.");
    expect(txt).not.toMatch(/-?\d+ points|score/i);
  });

  it("auto-locks only when everyone active said yes to the top option", () => {
    const ms = [member({ votes: { o1: "yes" } }), member({ votes: { o1: "yes" } })];
    expect(shouldAutoLock(rankOptions([o1], ms, 2), 2)).toBe(true);
    const ms2 = [member({ votes: { o1: "yes" } }), member({ votes: { o1: "maybe" } })];
    expect(shouldAutoLock(rankOptions([o1], ms2, 2), 2)).toBe(false);
    const ms3 = [member({ votes: { o1: "yes" } }), member({ votes: {} })];
    expect(shouldAutoLock(rankOptions([o1], ms3, 1), 2)).toBe(false);
  });
});

describe("blackouts derive votes (§5.2)", () => {
  const o1 = option("o1", "2026-05-01", "2026-05-04");
  const o2 = option("o2", "2026-05-08", "2026-05-11");

  it("overlapping blackout → derived no; explicit votes win", () => {
    const derived = deriveVotesFromBlackouts([o1, o2], [{ userId: "a", start: "2026-05-03", end: "2026-05-05" }]);
    expect(derived).toEqual([{ optionId: "o1", userId: "a", preference: "no" }]);
    const merged = mergeVotes([member({ id: "a", votes: { o1: "maybe" } }), member({ id: "b" })], derived);
    expect(merged[0].votes).toEqual({ o1: "maybe" });
    expect(merged[1].votes).toEqual({});
  });

  it("one entry per (option,user) even with several overlapping blackouts", () => {
    const derived = deriveVotesFromBlackouts([o1], [
      { userId: "a", start: "2026-05-01", end: "2026-05-01" },
      { userId: "a", start: "2026-05-04", end: "2026-05-04" },
    ]);
    expect(derived).toHaveLength(1);
  });
});
