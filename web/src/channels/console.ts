import type { OutboundMessage } from "@/messages/types";
import {
  renderChoicesAsText,
  withinSession,
  type MessagingChannel,
  type SendResult,
  type SessionState,
} from "./types";

/** Local development and tests. Records everything; asserts on rendered output. */
export class ConsoleChannel implements MessagingChannel {
  readonly name = "console" as const;
  readonly supportsButtons = true;
  readonly sent: { to: string; message: OutboundMessage; rendered: string }[] = [];

  constructor(private readonly quiet = false) {}

  supportsFreeform(session: SessionState): boolean {
    return withinSession(session);
  }

  async send(toE164: string, message: OutboundMessage): Promise<SendResult> {
    const { body, choices } = renderChoicesAsText(message);
    this.sent.push({ to: toE164, message, rendered: body });
    if (!this.quiet) {
      console.log(`\n┌─ WhatsApp → ${toE164}  [${message.templateKey}]\n${indent(body)}\n└─`);
    }
    return {
      ok: true,
      channel: "console",
      providerSid: `console-${this.sent.length}-${Date.now()}`,
      renderedBody: body,
      choices,
    };
  }

  async sendToGroup(groupId: string, message: OutboundMessage): Promise<SendResult> {
    this.sent.push({ to: `group:${groupId}`, message, rendered: message.body });
    if (!this.quiet) {
      console.log(`\n┌─ WhatsApp GROUP ${groupId}  [${message.templateKey}]\n${indent(message.body)}\n└─`);
    }
    return { ok: true, channel: "console", providerSid: `console-group-${Date.now()}`, renderedBody: message.body };
  }
}

function indent(s: string): string {
  return s
    .split("\n")
    .map((l) => `│ ${l}`)
    .join("\n");
}
