/**
 * Environment access. Server-only values are read lazily so `next build`
 * succeeds without secrets, and a missing value fails loudly at first use
 * with the variable's name rather than an undefined somewhere downstream.
 *
 * The service-role key is deliberately NOT exported from here. Only
 * `db/token-scope/client.ts` may read it (PLAN.md §7.6).
 */

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required environment variable ${name}`);
  return v;
}

function optional(name: string, fallback = ""): string {
  return process.env[name] ?? fallback;
}

function int(name: string, fallback: number): number {
  const v = process.env[name];
  const n = v ? Number(v) : NaN;
  return Number.isFinite(n) ? n : fallback;
}

export const env = {
  get NEXT_PUBLIC_SUPABASE_URL() {
    return required("NEXT_PUBLIC_SUPABASE_URL");
  },
  get NEXT_PUBLIC_SUPABASE_ANON_KEY() {
    return required("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  },
  get APP_URL() {
    return optional("NEXT_PUBLIC_APP_URL", "http://localhost:3000").replace(/\/$/, "");
  },

  get MESSAGING_CHANNEL(): "console" | "deeplink" | "twilio" {
    const v = optional("MESSAGING_CHANNEL", "console");
    return v === "twilio" || v === "deeplink" ? v : "console";
  },
  get TWILIO_ACCOUNT_SID() {
    return required("TWILIO_ACCOUNT_SID");
  },
  get TWILIO_AUTH_TOKEN() {
    return required("TWILIO_AUTH_TOKEN");
  },
  get TWILIO_WHATSAPP_FROM() {
    return required("TWILIO_WHATSAPP_FROM");
  },
  get TWILIO_SMS_FROM() {
    return optional("TWILIO_SMS_FROM");
  },
  get TWILIO_WEBHOOK_URL() {
    return optional("TWILIO_WEBHOOK_URL", `${this.APP_URL}/api/webhooks/twilio`).replace(/\/$/, "");
  },

  get CRON_SECRET() {
    return required("CRON_SECRET");
  },
  get ADMIN_PHONES(): string[] {
    return optional("ADMIN_PHONES")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  },

  get MESSAGE_BUDGET_PER_TRIP() {
    return int("MESSAGE_BUDGET_PER_TRIP", 300);
  },
  get MESSAGE_BUDGET_PER_DAY() {
    return int("MESSAGE_BUDGET_PER_DAY", 2000);
  },
  get MESSAGE_BUDGET_PER_MONTH() {
    return int("MESSAGE_BUDGET_PER_MONTH", 20000);
  },
};
