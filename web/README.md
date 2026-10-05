# MakeItHappen — web

The v1 engine from [`../PLAN.md`](../PLAN.md): a WhatsApp-first coordinator that gets a group of friends from "we should go somewhere" to a locked date — with an escalating nudge ladder that keeps the organizer out of the nagging business.

## Stack

Next.js 16 (App Router, server actions, `proxy.ts`) · React 19 · TypeScript strict · Tailwind 4 · Supabase (Postgres + RLS + phone OTP) · Twilio WhatsApp/SMS via REST (no SDK) · Vitest.

## Layout

```
src/
  core/           Pure domain logic. No I/O, no React, no env. Enforced by ESLint + a test.
                  state (trip FSM) · quorum · dates (scoring, blackouts) · nudge (ladder policy)
                  limits (per-person caps, spend ceilings) · tokens · phone
  messages/       Template library keyed by template_key, variant rotation, button payload grammar,
                  inbound intent parsing.
  channels/       MessagingChannel abstraction: Console (dev/tests) · DeepLink (wa.me share links,
                  works before Meta approval) · TwilioWhatsApp · TwilioSms. Signature validation.
  db/             Typed Supabase clients. db/token-scope/client.ts is the ONLY module that reads
                  the service-role key; every privileged call names a Principal.
  engine/         Trip lifecycle (invite, approval, dates, lock, extend, cancel), sends, inbound
                  handling, nudge execution incl. relay queue and managed-group posts.
  jobs/           scheduled_jobs scheduler + idempotent runner. The only source of future action.
  observability/  Structured logs, kill switch, spend circuit, per-person guard.
  app/            Organizer web UI, no-login action pages (/a/[token]), webhooks, cron, /admin.
supabase/
  migrations/     Schema (§5), RLS, RPC functions, pg_cron tick.
  config.toml     Local dev with fixed test OTPs.
```

Two authorization paths, by design (§7.6):

- **Session path** (organizer UI): Supabase anon client + the user's JWT. Postgres RLS is the authority.
- **Token path** (WhatsApp replies, `/a/[token]` links, webhooks, cron): service role, authorized in application code, always through `trusted(principal)` in `db/token-scope/client.ts`.

## Run it locally

```bash
cp .env.example .env.local      # fill in Supabase URL + anon key + service-role key
npm ci
npx supabase start              # local Postgres + Auth; applies supabase/migrations
npm run dev
```

`MESSAGING_CHANNEL=console` prints every outbound WhatsApp message to the terminal with its template key, so the whole product is demoable with zero provider setup. Use `deeplink` to get `wa.me` share links in the dashboard instead.

Log in with a number listed under `[auth.sms.test_otp]` in `supabase/config.toml` and the fixed code.

### Job runner

Nothing in the future happens unless a row exists in `scheduled_jobs`. The tick is `POST /api/cron/run-jobs` with `Authorization: Bearer $CRON_SECRET`. In production the `20260904000003_cron.sql` migration schedules it via `pg_cron` + `pg_net` (set the `app_url` and `cron_secret` Vault secrets). Locally:

```bash
curl -X POST -H "Authorization: Bearer change-me" http://localhost:3000/api/cron/run-jobs
```

### Twilio (real WhatsApp)

1. Set `MESSAGING_CHANNEL=twilio`, the `TWILIO_*` vars, and `TWILIO_WEBHOOK_URL` to the **exact** public URL Twilio will post to (tunnel URL in dev). Signature validation is over that URL; a mismatch looks like a code bug.
2. Point the WhatsApp sender's inbound webhook at `/api/webhooks/twilio` and the status callback at `/api/webhooks/twilio/status`.
3. Submit every key in `src/messages/templates.ts` as a Meta message template; outside the 24h session only approved templates deliver (§7.2).

## Scripts

| command             | what                                                                    |
| ------------------- | ----------------------------------------------------------------------- |
| `npm run dev`       | Next dev server                                                         |
| `npm run typecheck` | `tsc --noEmit`                                                          |
| `npm run lint`      | ESLint incl. the `core/` import-boundary rule                           |
| `npm test`          | Vitest: core, messages, channels, architecture guards                   |
| `npm run build`     | Production build                                                        |

CI (`../.github/workflows/ci.yml`) runs all of the above, greps the client bundle for the service-role key name, and applies the migrations against a vanilla Postgres.

## Safety rails (§7.7, §9)

- `/admin` (numbers in `ADMIN_PHONES`): engine health, failed jobs with retry, message log, **kill switch** — flips `app_settings.outbound_enabled` in seconds, no deploy.
- Spend ceilings per trip / day / month; the account ceiling opens a circuit that halts all sends.
- Per-person caps across all trips: 1 DM per 20h, 3 nudges per week, 4 messages per day, max 2 trips nudging at once. Blocked nudges are deferred, not dropped.
- Quiet hours 22:00–08:00 in the member's own timezone (inferred from the phone's country code).
- `STOP` works everywhere, instantly, and is permanent across trips. Every participant message carries the footer.
- Escalation mode `none` turns public callouts into firmer DMs — the ladder never silently loses its teeth.

## Not in v1

Phase 2 states (`sourcing`, `proposal_review`, `committed`) exist in the FSM and schema but have no behaviour. No payments, ever (§8).
