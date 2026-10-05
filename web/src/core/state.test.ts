import { describe, expect, it } from "vitest";
import { assertTransition, canTransition, IllegalTransition, isTerminal, nudgePhaseFor } from "./state";
import type { TripStatus } from "./types";

describe("trip state machine (§4)", () => {
  it("follows the happy path", () => {
    const path: TripStatus[] = ["draft", "approval", "approved", "date_collection", "date_proposed", "date_locked"];
    for (let i = 0; i < path.length - 1; i++) expect(canTransition(path[i], path[i + 1])).toBe(true);
  });

  it("allows date_collection to lock directly (unanimous auto-lock)", () => {
    expect(canTransition("date_collection", "date_locked")).toBe(true);
  });

  it("refuses skipping phases and leaving terminal states", () => {
    expect(canTransition("draft", "date_locked")).toBe(false);
    expect(canTransition("approval", "date_collection")).toBe(false);
    expect(canTransition("rejected", "approval")).toBe(false);
    expect(canTransition("cancelled", "draft")).toBe(false);
  });

  it("re-opening is explicit: locked → date_collection, approved → approval", () => {
    expect(canTransition("date_locked", "date_collection")).toBe(true);
    expect(canTransition("approved", "approval")).toBe(true);
  });

  it("every non-terminal state can be cancelled", () => {
    const all: TripStatus[] = ["draft", "approval", "approved", "date_collection", "date_proposed", "date_locked", "sourcing", "proposal_review", "committed"];
    for (const s of all) expect(canTransition(s, "cancelled")).toBe(true);
  });

  it("assertTransition throws a typed error", () => {
    expect(() => assertTransition("draft", "approved")).toThrow(IllegalTransition);
    expect(() => assertTransition("draft", "approval")).not.toThrow();
  });

  it("knows which phase nudges run for", () => {
    expect(nudgePhaseFor("approval")).toBe("approval");
    expect(nudgePhaseFor("date_collection")).toBe("dates");
    expect(nudgePhaseFor("date_locked")).toBeNull();
    expect(isTerminal("rejected")).toBe(true);
    expect(isTerminal("approval")).toBe(false);
  });
});
