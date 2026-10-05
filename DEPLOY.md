# Deploying MakeItHappen

Three managed services, no servers of your own: **Vercel** (app) · **Supabase** (Postgres, RLS, phone auth, scheduler) · **Twilio** (WhatsApp + SMS). Do them in this order; each step produces values the next one needs.

Keep a scratch file with these as you go:

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
NEXT_PUBLIC_APP_URL=            # https://<project>.vercel.app
CRON_SECRET=                    # openssl rand -hex 32
ADMIN_PHONES=                   # your number, E.164
MESSAGING_CHANNEL=deeplink      # until Twilio/Meta are approved, then: twilio
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_WHATSAPP_FROM=
TWILIO_SMS_FROM=
TWILIO_WEBHOOK_URL=             # https://<project>.vercel.app/api/webhooks/twilio
```

---

## 1. Supabase

### 1.1 Create the project
1. [supabase.com/dashboard](https://supabase.com/dashboard) → **New project**. Pick a region close to your users (eu-central for Israel). Save the database password.
2. **Project Settings → API**: copy **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`, **anon public** key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`, **service_role** key → `SUPABASE_SERVICE_ROLE_KEY`.
   The service-role key bypasses RLS. It goes only into Vercel server env; never into anything prefixed `NEXT_PUBLIC_`.

### 1.2 Apply the schema
From `web/`:

```bash
npx supabase login
npx supabase link --project-ref <project-ref>     # ref is in the dashboard URL
npx supabase db push                               # applies supabase/migrations/*.sql in order
```

Verify in **Table Editor**: `users`, `trips`, `trip_members`, `scheduled_jobs`, `message_log`, `app_settings` (two rows: `outbound_enabled=true`, `spend_circuit_open=false`).

### 1.3 Phone OTP sign-in
**Authentication → Sign In / Providers → Phone**:
- Enable **Phone provider**.
- SMS provider: **Twilio** (needs step 2 first — you can come back). Fill Account SID, Auth Token, and a **Messaging Service SID** (Twilio Console → Messaging → Services → create one and add your SMS number to its sender pool).
- Set **SMS OTP expiry** 600s, **OTP length** 6.
- Message template: `Your MakeItHappen code is {{ .Code }}`

**Authentication → Sign In / Providers → Email**: disable (phone is the only identity, §5.1).

**Authentication → URL Configuration**: Site URL = your Vercel URL.

Until Twilio is wired, add a test number under **Authentication → Phone → Test OTPs** so you can log in with a fixed code.

### 1.4 Scheduler (the job runner tick)
Nothing in the future happens without this.

1. **Database → Extensions**: enable `pg_cron` and `pg_net`.
2. **SQL Editor**, run (after you know the Vercel URL and have generated `CRON_SECRET`):

```sql
select vault.create_secret('https://<project>.vercel.app', 'app_url');
select vault.create_secret('<CRON_SECRET>', 'cron_secret');
```

3. Re-run the cron migration so the schedule is created now that the extensions exist — paste the contents of `web/supabase/migrations/20260904000003_cron.sql` into the SQL Editor and run it.
4. Confirm: `select jobname, schedule, active from cron.job;` → `makeithappen-tick`, `* * * * *`.
5. After the app is deployed, check it's firing: `select status, created from net._http_response order by created desc limit 5;` should show 200s.

### 1.5 Hygiene
- **Project Settings → General**: on the Free plan projects pause after 7 days idle, which kills the tick. Use Pro ($25/mo) for anything real, or keep it warm.
- **Database → Backups**: confirm daily backups are on (Pro).

---

## 2. Twilio

Two things: **SMS** (for OTP login and the fallback channel) and **WhatsApp** (the product). SMS is minutes; WhatsApp is a Meta approval process measured in days.

### 2.1 Account + SMS number
1. [console.twilio.com](https://console.twilio.com) → create account, upgrade out of trial (trial can only text verified numbers).
2. **Account Info** on the console home: copy **Account SID** → `TWILIO_ACCOUNT_SID`, **Auth Token** → `TWILIO_AUTH_TOKEN`.
3. **Phone Numbers → Buy a number** with SMS capability → `TWILIO_SMS_FROM` (E.164, e.g. `+1415…`).
   For Israeli recipients an international (US) long-code works for OTP; for high volume look at an alphanumeric sender ID.
4. **Messaging → Services → Create**: add the number to the sender pool. Copy the **Messaging Service SID** for Supabase step 1.3.

### 2.2 WhatsApp sender
1. **Messaging → Senders → WhatsApp senders → Create new sender**. Walks you through **Meta Business verification** (legal business name, address, website — `/legal/privacy` and `/legal/terms` on your Vercel URL satisfy the policy-page requirement).
2. Register a dedicated number (a new Twilio number is simplest; it must not be on a personal WhatsApp account). Set display name and profile.
3. Once approved, the sender shows as `whatsapp:+1…` → `TWILIO_WHATSAPP_FROM`.

**Meanwhile, use the sandbox** to test end to end: **Messaging → Try it out → Send a WhatsApp message**. Each tester sends `join <sandbox-word>` to the sandbox number. Set `TWILIO_WHATSAPP_FROM=whatsapp:+14155238886` (the sandbox number). Sandbox has no templates, so everything only delivers inside a 24h session — fine for testing, not for the nudge ladder.

### 2.3 Webhooks
On the WhatsApp sender (and on the sandbox settings while testing):
- **When a message comes in**: `https://<project>.vercel.app/api/webhooks/twilio` — HTTP POST
- **Status callback URL**: `https://<project>.vercel.app/api/webhooks/twilio/status` — HTTP POST

Set `TWILIO_WEBHOOK_URL` to exactly the first URL. Signature validation hashes that string; a trailing slash or `http` vs `https` mismatch fails every inbound message with a 403 that looks like a code bug.

### 2.4 Message templates (required for the nudge ladder)
Outside a 24h session WhatsApp delivers only Meta-approved templates. **Messaging → Content Template Builder → Create**, one per key in `web/src/messages/templates.ts`:

- Category: **Utility** for `approval.ask`, `dates.ask`, `confirmation.*`, `admin.*`; **Marketing** for the `nudge.*` variants (Meta classifies reminders as marketing — pricing is higher).
- Type: **Quick reply** for anything with ≤3 buttons; **List** for `dates.ask` with >3 options; **Text** otherwise.
- Variables: use `{{1}}`, `{{2}}`… in the same order as the vars in the template body. Every variant of a key (`#0`, `#1`…) is its own template.
- Include the opt-out footer line in every participant-facing template.

Approval is usually under 24h per template. Rejections are almost always for marketing-sounding copy in a Utility category.

### 2.5 Compliance
- STOP/START/HELP are handled by the app (`src/messages/inbound.ts`). Twilio's **Advanced Opt-Out** on the Messaging Service can stay on as a second layer.
- Keep **Messaging → Settings → Geo permissions** limited to countries you actually message.

---

## 3. Vercel

Already created and deployed once from the CLI:

- Project: `eldad-5565s-projects/makeithappen` → [dashboard](https://vercel.com/eldad-5565s-projects/makeithappen)
- Production URL: **https://makeithappen-six.vercel.app** → this is `NEXT_PUBLIC_APP_URL`
- `web/.vercel/project.json` links the local checkout (gitignored).

Still to do in the dashboard:

1. **Settings → Deployment Protection**: set Vercel Authentication to **Preview only** (or Off). The first deploy came up with it **on for production**, which means Twilio webhooks and the pg_cron tick get a login page instead of your routes. Nothing inbound works until this is changed.
2. **Settings → Git**: connect `eldad-lgtm/makeithappen`. The CLI couldn't — the Vercel GitHub App isn't installed on that repo. Install it at [github.com/apps/vercel](https://github.com/apps/vercel) for the `eldad-lgtm` account, then connect. Set **Root Directory** to `web` and production branch to `master`.
3. **Settings → Environment Variables**: add the full list from the top of this file (Production + Preview). Mark everything without `NEXT_PUBLIC_` as Sensitive. Or from `web/`: `npx vercel env add <NAME> production preview`.
4. **Settings → Functions → Region**: pick the one nearest your Supabase region (`fra1` for eu-central).
5. Redeploy after env changes: `npx vercel deploy --prod` from `web/`, or push once Git is connected.

---

## 4. Smoke test

1. Open `/login`, sign in with your number (real OTP via Twilio, or a Supabase test OTP).
2. `/trips/new` → create a trip, invite yourself with a second number.
3. With `MESSAGING_CHANNEL=deeplink`: the dashboard shows `wa.me` links — tap one, the message opens in WhatsApp.
   With `twilio` + sandbox: the approval ask arrives on the invited phone; tap "I'm in"; the dashboard updates.
4. `/admin`: engine health should show the tick running (`overdue_jobs = 0`), the message in the log, no failed jobs.
5. Flip the kill switch, confirm outbound halts, flip it back.

If inbound replies 403: `TWILIO_WEBHOOK_URL` mismatch. If nothing ever sends after a delay: `cron.job` is missing or `net._http_response` shows non-200 — check Vault secrets and `CRON_SECRET`.
