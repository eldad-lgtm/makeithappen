import { describe, expect, it } from "vitest";
import { ConsoleChannel } from "./console";
import { computeTwilioSignature, validateTwilioSignature } from "./twilio/signature";
import { renderChoicesAsText, withinSession, SESSION_WINDOW_MS } from "./types";
import type { OutboundMessage } from "@/messages/types";

const msg: OutboundMessage = {
  templateKey: "approval.ask#0",
  body: "Lisbon in May?",
  context: { tripId: "t1", userId: "u1", kind: "ask" },
  buttons: [
    { id: "approve:t1", label: "I'm in" },
    { id: "decline:t1", label: "Can't" },
  ],
};

describe("ConsoleChannel", () => {
  it("records sends and renders buttons as a numbered list with matching choice ids", async () => {
    const ch = new ConsoleChannel(true);
    const r = await ch.send("+972541234567", msg);
    expect(r.ok).toBe(true);
    expect(r.channel).toBe("console");
    expect(r.providerSid).toBeTruthy();
    expect(r.renderedBody).toContain("1️⃣ I'm in");
    expect(r.renderedBody).toContain("2️⃣ Can't");
    expect(r.choices).toEqual(["approve:t1", "decline:t1"]);
    expect(ch.sent).toHaveLength(1);
    expect(ch.sent[0].to).toBe("+972541234567");
  });
  it("renders list rows the same way, and plain messages untouched", () => {
    const plain = renderChoicesAsText({ ...msg, buttons: undefined });
    expect(plain.body).toBe("Lisbon in May?");
    expect(plain.choices).toEqual([]);
    const list = renderChoicesAsText({ ...msg, buttons: undefined, list: { buttonLabel: "Pick", rows: [{ id: "a", label: "A" }] } });
    expect(list.choices).toEqual(["a"]);
  });
  it("tracks the 24h session window", () => {
    const now = Date.now();
    expect(withinSession({ lastInboundAt: null }, now)).toBe(false);
    expect(withinSession({ lastInboundAt: now - SESSION_WINDOW_MS + 1000 }, now)).toBe(true);
    expect(withinSession({ lastInboundAt: now - SESSION_WINDOW_MS - 1000 }, now)).toBe(false);
  });
});

describe("Twilio signature validation (§7.2)", () => {
  // Worked example from Twilio's security docs.
  const token = "12345";
  const url = "https://mycompany.com/myapp.php?foo=1&bar=2";
  const params = {
    CallSid: "CA1234567890ABCDE",
    Caller: "+12349013030",
    Digits: "1234",
    From: "+12349013030",
    To: "+18005551212",
  };

  it("reproduces Twilio's documented signature", () => {
    expect(computeTwilioSignature(token, url, params)).toBe("0/KCTR6DLpKmkAf8muzZqo1nDgQ=");
  });
  it("accepts the right signature and rejects everything else", () => {
    const sig = computeTwilioSignature(token, url, params);
    expect(validateTwilioSignature(token, url, params, sig)).toBe(true);
    expect(validateTwilioSignature(token, url, params, null)).toBe(false);
    expect(validateTwilioSignature(token, url, params, sig.slice(0, -1) + "A")).toBe(false);
    expect(validateTwilioSignature("wrong", url, params, sig)).toBe(false);
    expect(validateTwilioSignature(token, url, { ...params, Digits: "9999" }, sig)).toBe(false);
    expect(validateTwilioSignature(token, url.replace("foo=1", "foo=2"), params, sig)).toBe(false);
  });
});
