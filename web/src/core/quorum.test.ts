import { describe, expect, it } from "vitest";
import { activeMembers, pendingFor, quorumState, tally } from "./quorum";
import { member } from "@/test/fixtures";

describe("quorum (§4.1)", () => {
  it("advances the moment yes hits quorum — stragglers don't block", () => {
    const ms = [member({ approval: "yes" }), member({ approval: "yes" }), member({ approval: null }), member({ approval: null })];
    expect(quorumState(ms, 2)).toBe("reached");
  });

  it("fails early when the remaining people can't get you there", () => {
    const ms = [member({ approval: "yes" }), member({ approval: "no" }), member({ approval: "no" }), member({ approval: null })];
    // invited 4, no 2 → at most 2 yes possible, need 3
    expect(quorumState(ms, 3)).toBe("unreachable");
    expect(quorumState(ms, 2)).toBe("open");
  });

  it("removed members are not invitees", () => {
    const ms = [member({ approval: "yes" }), member({ approval: null, status: "removed" })];
    expect(tally(ms)).toEqual({ yes: 1, no: 0, pending: 0, invited: 1 });
    expect(quorumState(ms, 1)).toBe("reached");
  });

  it("only yes-voters carry into the dates phase", () => {
    const ms = [member({ id: "a", approval: "yes" }), member({ id: "b", approval: "no" }), member({ id: "c", approval: null })];
    expect(activeMembers(ms).map((m) => m.id)).toEqual(["a"]);
  });

  it("pendingFor dates requires a vote on every option", () => {
    const ms = [member({ id: "a", votes: { o1: "yes" } }), member({ id: "b", votes: { o1: "yes", o2: "no" } })];
    expect(pendingFor(ms, "dates", ["o1", "o2"]).map((m) => m.id)).toEqual(["a"]);
    expect(pendingFor(ms, "dates", []).length).toBe(2);
  });
});
