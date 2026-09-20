# MakeItHappen — Product & Technical Plan

**Status:** Rev 3 — implementation-ready
**Date:** 2026-09-04
**Owner:** Eldad Shalt

> **Rev 3 changes:** coordination is peer-to-peer and groups receive escalation only, with
> an admin-selected escalation mode per trip — `relay`, `managed`, or `none` (§3.5, §7.3).
> Verified Meta's Groups API constraints and moved native groups to Phase 2.
>
> **Rev 2 changes:** added provisional users (§5.1), global per-person rate limits (§6.8),
> the RLS/token authorization split (§7.6), observability and spend controls (§7.7),
> prerequisites with lead times (§11.1), and a decisions log (§14).

---

## 1. The problem

Every group of friends has the same dead conversation:

> "We should totally do a long weekend in Athens."
> "Yes! Definitely."
> *(nothing happens for two years)*

The trip doesn't fail because nobody wants to go. It fails because one person has to
become an unpaid project manager: chase eight people for dates, keep a mental
spreadsheet of who answered, re-ask the two who ghosted, then find flights that work,
then collect money. That person burns out around day three and the group chat moves on.

**MakeItHappen removes the project manager.** It is a coordination engine that runs the
trip forward on its own: it asks each person the right question at the right time, chases
the people who don't answer (in a funny, socially acceptable, peer-pressure way), decides
the best dates from everyone's answers, and hands the group a decision instead of a
discussion.

### Product principle: WhatsApp first, web app second

This is the single most important design decision in the whole project, and everything
else follows from it.

**Your friends will not install your app.** Seven out of eight of them will never log in,
never set a password, and never open a dashboard. If participation requires an account,
the product dies at the first step — which is exactly where the group chat already dies.

So:

- **Participants** live entirely inside WhatsApp. They get a message, tap a button, done.
  They can complete *every* required action — approve the trip, submit availability,
  respond to nudges — without ever creating an account. Richer interactions use a
  no-login, tokenized web page opened from the WhatsApp message.
- **Organizers** get the web app: full dashboard, member management, availability
  heatmap, date decision screen, activity timeline.

The web app is the cockpit. WhatsApp is the product.

---

## 2. Scope

### v1 — "Get to a locked date" (this plan)

v1 ends when the group has an agreed set of dates and a shareable trip summary. That is
the hard part and the part that actually blocks trips from happening. It is also fully
shippable and useful on its own.

1. Phone-number signup and login (OTP)
2. Create a trip, describe it, set an approval quorum
3. Invite friends by phone number; multiple admins supported
4. Approval cycle over WhatsApp — approve / reject
5. Availability collection over WhatsApp
6. Escalating, funny nudge engine for non-responders
7. Automatic date recommendation with a plain-language explanation
8. Admin locks the dates; everyone gets the confirmation
9. Web dashboard for organizers; no-login action pages for everyone

### Phase 2 — Travel sourcing (designed for, not built)

Search flights and accommodation via travel APIs, assemble 2–3 costed options, run them
through the same approval cycle. v1 defines the `TravelSearchProvider` interface and the
`sourcing` / `proposal_review` trip states so this slots in without rework.

### Phase 3 — Money (designed for, not built)

**Decision: track only.** The app computes who owes what, shows a settlement ledger, and
generates payment links or bank details. Friends settle among themselves. The app never
holds, transmits, or receives funds.

This is deliberate and worth stating plainly: collecting money from a group and paying it
to a supplier makes you a regulated money transmitter. It requires licensing, KYC/AML,
safeguarding of client funds, and it turns every trip cancellation into a legal dispute
between you and eight friends. Splitwise built a large business on tracking alone. If
real money movement ever becomes necessary, it goes through a licensed provider
(Stripe Connect or similar) so funds never touch your infrastructure — never a
self-built escrow.

### Explicit non-goals for v1

- Native mobile apps. WhatsApp-first makes them low value — participants already have the
  only app they need. Revisit only if organizers ask for it.
- In-app chat. WhatsApp is the chat. Do not compete with it.
- Itinerary planning, day-by-day scheduling, packing lists, expense photos.
- Public/discoverable trips, social features, feeds.
- Multi-language UI. Ship English first; the message-template layer is built for
  localization from day one (see §7.5).

---

## 3. User journey

### 3.1 Organizer, in the web app

1. Signs up with phone number, receives a 6-digit OTP over SMS, enters it, sets a display name.
2. **Create trip** wizard:
   - Title — "Athens Boys Trip"
   - Destination — "Athens, Greece"
   - Length — 3 nights
   - Target window — "May 2027" or an explicit date range
   - Description — free text, shown to everyone
   - **Approval quorum** — how many yes-votes make this real (default: all invited members)
   - **Essential members** — optional; people without whom the trip is pointless (see §6.3)
   - Response deadline — default 7 days
   - **Group callouts** — admin chooses whether this trip has a WhatsApp group and how
     public escalation works (§3.5)
3. **Invite** — add friends by phone number, from device contacts, or share a join link.
   Promote any member to admin.
4. Hits **Send it**. From here the engine drives.

### 3.2 Participant, in WhatsApp

```
MakeItHappen
Eldad wants to make something happen 🇬🇷

ATHENS BOYS TRIP
📍 Athens, Greece · 🗓 3 nights, sometime in May
👥 8 invited · needs 6 yes to happen

"Gyros, ruins, and one questionable decision. Same as always."
— Eldad

Are you in?

[ I'm in 🙌 ]  [ Can't 😞 ]  [ Tell me more ]
```

Taps **I'm in**. That's the entire commitment step. No account, no install, no download.

Once quorum is reached, the same thread asks for availability:

```
MakeItHappen

6 of 8 are in — Athens is happening! 🎉

Now the annoying part, made less annoying.
Which of these 3-night windows work for you?

[ May 7–10 ]  [ May 14–17 ]  [ May 21–24 ]
[ None of these ]  [ Pick my own dates ]
```

Tapping a window records a *yes* and asks about the others. **Pick my own dates** opens a
no-login web page with a calendar where they mark good and bad dates directly.

### 3.3 The nudge engine, from a ghost's point of view

Two people haven't answered. Here's what happens to them, escalating over five days:

| When | Where | What they get |
|---|---|---|
| +24h | Direct | *"Gentle reminder: Athens needs your dates. Takes 4 seconds. Literally 4."* |
| +48h | Direct | *"Dani, 6 people are waiting on you. That's 6 people. Thinking about you. Not in a good way."* |
| +72h | **Group** | *"📊 Athens standings: 6 answered ✅ — Dani and Yossi have not. We're not angry, just visibly disappointed."* |
| +96h | **Group** | *"🐌 Slowest Human Alive award: Dani, 4 days. Previous record holder: Dani, Barcelona 2024."* |
| +120h | Admin | *"Still nothing from Dani. Want to lock dates without them, or extend the deadline?"* |

The group callout is the actual mechanism. Between friends, being publicly and
affectionately named is far more motivating than a push notification — and the humor is
what makes it socially acceptable rather than passive-aggressive. Escalation stops the
instant the person responds, and never mentions anyone who has already answered.

### 3.4 The decision

Once enough answers are in:

```
MakeItHappen

🗓 THE DATES ARE IN

🥇 May 14–17 — works for 7 of 8
   Only Dani can't make it.

🥈 May 21–24 — works for 6 of 8
🥉 May 7–10 — works for 4 of 8

Eldad, lock it in?
[ Lock May 14–17 ]  [ See all options ]
```

Admin confirms, everyone gets the confirmation, and the trip moves to `date_locked`.
In v1 that's the finish line: the group has a real, agreed, on-the-record date — which is
more than the group chat ever produced.

### 3.5 The group is for pressure, not for coordination

**All coordination is peer-to-peer.** Every question the engine asks — are you in, which
dates work, please confirm — goes to each person in their own 1:1 chat with MakeItHappen.
Nothing routine is ever posted to a group.

**The group exists only for escalation.** When someone ghosts, and only then, the callout
lands in the group where everyone can see it.

This division is the whole reason the callout works. A bot that posts every routine
question into the group gets muted within a day, and a muted group has no social power
whatsoever — the callout would land in a channel nobody reads. Keeping the group silent
99% of the time is precisely what makes the 1% land. Scarcity is the mechanism.

It also happens to be the only design that works technically: native WhatsApp groups do
not support interactive messages, so quick-reply buttons exist only in 1:1 chats (§7.3).
Coordination *has* to be peer-to-peer. Convenient.

**The admin chooses the escalation mode** at trip creation:

| Mode | What happens at levels 3–4 | Requirements |
|---|---|---|
| **`relay`** *(default)* | The app composes the callout; the admin sends it to the group they already have with one tap | None |
| **`managed`** | MakeItHappen creates a native WhatsApp group and posts callouts itself | Official Business Account, max 8 participants (§7.3) |
| **`none`** | No public callouts. Escalation stays in DMs and goes to the admin at level 5 | None |

`relay` is the default because it needs no special approval, has no participant cap, and
lands the callout in the group that actually carries the group's social weight — the one
with the history and the inside jokes — rather than a sterile bot-created group nobody
feels attached to. The app still decides *when* to escalate and *what* to say, which is
where all the value is; the admin's thumb is just the delivery mechanism.

Consent matters here. `none` exists because publicly naming someone is a real social act,
and an admin who knows their group is not the roasting type must be able to turn it off.
The mode is visible to members in the trip details, so nobody is publicly called out by a
system they didn't know was watching.

---

## 4. Trip state machine

The state machine is the backbone of the system. Every automated action is a function of
trip state, and nothing mutates a trip except a declared transition.

```
                    ┌─────────┐
                    │  draft  │  organizer still editing
                    └────┬────┘
                         │ send invites
                    ┌────▼─────┐
                    │ approval │  collecting yes/no
                    └────┬─────┘
             ┌───────────┼───────────┐
      quorum │      quorum           │ deadline,
    reached  │   unreachable         │ quorum not met
        ┌────▼─────┐  ┌──▼───────┐  ┌▼──────────┐
        │ approved │  │ rejected │  │ cancelled │
        └────┬─────┘  └──────────┘  └───────────┘
             │ auto
    ┌────────▼──────────┐
    │  date_collection  │  collecting availability + nudging
    └────────┬──────────┘
             │ enough responses
    ┌────────▼──────────┐
    │  date_proposed    │  ranked options awaiting admin
    └────────┬──────────┘
             │ admin locks
    ┌────────▼──────────┐
    │   date_locked     │  ◄── v1 FINISH LINE
    └────────┬──────────┘
             │ Phase 2 ─────────────────────────────┐
    ┌────────▼─────┐  ┌──────────────────┐  ┌───────▼──────┐
    │   sourcing   │─►│ proposal_review  │─►│  committed   │
    └──────────────┘  └──────────────────┘  └──────────────┘
```

`cancelled` is reachable from any state by an admin.

### 4.1 Approval rules

These edge cases are where naive implementations produce trips stuck forever, so they are
specified rather than left to the code:

- **Advance early.** The moment yes-votes reach quorum, transition to `approved`. Do not
  wait for stragglers — waiting is the disease we're curing. Non-responders can still join
  as late arrivals until the deadline.
- **Fail early.** If `invited − no_votes < quorum`, quorum is mathematically unreachable.
  Transition to `rejected` immediately and tell the group honestly. Don't let a dead trip
  keep nudging people.
- **Deadline with quorum unmet** → `cancelled`, with a one-tap "extend by a week" option
  offered to the admin 24h before the deadline hits.
- **Rejecters are dropped** from the member list for later stages. They stop receiving
  messages entirely. This matters: nothing poisons a product faster than messaging someone
  who already said no.
- **Vote changes are allowed** until the phase closes. A yes → no after quorum was reached
  re-evaluates quorum and can send the trip back to `approval`.

---

## 5. Data model

Postgres via Supabase. Every table has row-level security; the access rule throughout is
*you can see a row if you are an active member of its trip.*

```sql
-- Identity ------------------------------------------------------------------
users                 id, phone_e164 (unique), display_name, avatar_url,
                      timezone, locale,
                      is_provisional bool,                -- never logged in yet
                      name_source,                        -- self | inviter
                      auth_user_id (nullable, unique),    -- Supabase auth link
                      claimed_at, messaging_opted_out_at,
                      created_at
                      -- phone_e164 is PII: never exposed to other members
                      -- beyond name + last 4 digits (see §9)
                      -- provisional rows are created at invite time (§5.1)

-- Trips ---------------------------------------------------------------------
trips                 id, title, destination, description,
                      nights, window_start, window_end,   -- the search space
                      quorum,                             -- yes-votes needed
                      response_deadline,
                      status,                             -- the state machine
                      locked_start_date, locked_end_date,
                      escalation_mode,                    -- relay | managed | none
                      wa_group_id,                        -- managed mode only
                      wa_group_invite_link,               -- managed mode only
                      created_by, created_at
                      -- escalation_mode is chosen by the admin (§3.5) and
                      -- visible to all members

-- Pending group callouts awaiting an admin's tap (relay mode) --------------
relay_queue           id, trip_id, admin_user_id, nudge_id,
                      rendered_body, created_at, sent_at, dismissed_at,
                      expires_at
                      -- a callout that goes stale is dropped, not sent late

trip_members          trip_id, user_id, role,             -- admin | member
                      is_essential bool,                  -- see §6.3
                      status,                             -- invited | active
                                                          -- | declined | removed
                      invited_by, invited_at, joined_at
                      PRIMARY KEY (trip_id, user_id)

-- Approval ------------------------------------------------------------------
approvals             trip_id, user_id, decision,         -- yes | no
                      note, decided_at
                      PRIMARY KEY (trip_id, user_id)

-- Availability --------------------------------------------------------------
date_options          id, trip_id, start_date, end_date, label,
                      generated_by                        -- system | admin

date_votes            date_option_id, user_id,
                      preference,                         -- yes | maybe | no
                      updated_at
                      PRIMARY KEY (date_option_id, user_id)

blackout_dates        id, trip_id, user_id, start_date, end_date, reason
                      -- from the web calendar; auto-derives date_votes

-- Engine --------------------------------------------------------------------
scheduled_jobs        id, trip_id, user_id, job_type, run_at,
                      payload jsonb, status,              -- pending | done
                                                          -- | cancelled | failed
                      attempts, last_error
                      -- the durable spine of all automation (§7.4)

nudges                id, trip_id, user_id, phase, level, -- 1..5
                      channel, sent_at, responded_at

action_tokens         token_hash (unique), trip_id, user_id, scope,
                      expires_at, used_at
                      -- no-login web access (§7.3)

message_log           id, trip_id, user_id, direction, channel,
                      template_key, rendered_body, provider_sid,
                      status, error, created_at
                      -- full audit trail; required for compliance and
                      -- indispensable for debugging the engine

trip_activity         id, trip_id, actor_user_id, kind, payload jsonb,
                      created_at
                      -- append-only; powers the timeline UI and digests
```

### 5.1 Provisional users — how WhatsApp-only participants exist

The WhatsApp-first principle creates a problem the schema has to solve explicitly: every
vote, token, and nudge references a `users.id`, but seven of eight participants will never
sign up. There is no row to point at.

So **invitation creates the user.** When an admin adds a phone number, the system
upserts a `users` row with `is_provisional = true`. That row is a real, referenceable
identity — it can vote, hold tokens, and receive messages — it simply has no login.

If that person later signs up with the same number, OTP verification **claims** the
existing row rather than creating a second one: set `auth_user_id`, `claimed_at`, flip
`is_provisional` to false, and every historical vote and trip membership is already
theirs. Phone number in E.164 is the identity key throughout, which is what makes the
claim unambiguous.

Three consequences that are easy to miss:

- **Names come from the inviter.** A provisional user has never told us their name, and
  `"+972 5x-xxx-xx89 hasn't answered yet"` is a useless nudge — the group callout only
  works if it can say "Dani". So a display name is **required** when inviting, not
  optional. `name_source` tracks whether the name is self-chosen or inviter-supplied, so
  the UI can show inviter-supplied names as editable and the user can correct theirs on
  first login.
- **Timezone must be inferred.** Quiet hours (§6.7) need a timezone we were never told.
  Infer from the phone number's country code, fall back to the trip creator's timezone,
  and let the person correct it. Never assume the server's timezone — that's how you text
  someone at 4am.
- **Locale likewise** — inferred from country code, correctable, defaulting to the trip's
  locale.

Deduplication is by normalized E.164, so the same person invited to three trips is one
row with three memberships. Recycled and changed numbers are a known limitation: a claimed
number belongs to whoever verified it by OTP, and a provisional row can be re-claimed by
whoever proves ownership.

### 5.2 Other design notes

**`date_options` are generated, not free-form.** WhatsApp allows at most 3 quick-reply
buttons and 10 list rows per message, so the system proposes a bounded set of concrete
windows rather than asking an open question. This is a constraint that turns out to be a
feature: "which of these three works?" gets answered; "when are you free in May?" does
not.

Generation: slide an `nights`-length window across `[window_start, window_end]`,
prefer weekend-inclusive windows, cluster to at most 10 non-overlapping candidates.
Admins can add options manually.

**`blackout_dates` and `date_votes` coexist.** WhatsApp users vote on options; web users
paint a calendar. Blackout dates automatically derive votes for any overlapping option, so
both inputs feed one scoring function.

**`scheduled_jobs` is the only source of future action.** Nothing in the system relies on
an in-memory timer. Restart-safe by construction.

---

## 6. Core algorithms

These are pure functions with no I/O — given the same input rows they always return the
same result. That makes the interesting logic of this product trivially unit-testable
without a database, a queue, or a WhatsApp account. This separation is the main
testability decision in the plan.

### 6.1 Date scoring

For each `date_option`:

```
score = (2 × yes) + (1 × maybe) − (3 × no)
```

The asymmetry is deliberate. A *no* usually means a hard conflict — a wedding, a work
trip, a paid-for exam — while a *yes* only means "that works." Optimizing for the most
yes-votes produces windows that a few people flatly cannot attend. Penalizing *no*
heavily produces windows that everyone can actually make, which is the real objective.

### 6.2 Hard constraints

An option is disqualified, regardless of score, if:

- `yes + maybe < quorum` — not enough people could attend
- any **essential** member voted `no`
- it overlaps a blackout date of an essential member

### 6.3 Essential members

Admins can flag members as essential: the people without whom the trip has no point — the
groom, the friend whose cousin owns the apartment, the only one with a driver's licence.
Their *no* eliminates a window outright rather than merely penalizing it.

Cheap to build, and it prevents the most demoralizing possible failure mode: an
algorithmically optimal date that the guest of honor can't attend.

### 6.4 Tie-breaking, in order

1. Fewest `no` votes
2. Most `yes` (as opposed to `maybe`)
3. Earliest start date — sooner trips are likelier to actually happen
4. *(Phase 2)* Cheapest travel season

### 6.5 Explaining the result

Every recommendation ships with a plain-language reason:

> "May 14–17 works for 7 of 8. Only Dani can't make it."

Never show a raw score. The number is an implementation detail; the sentence is the
product. Groups accept decisions they understand and relitigate ones they don't.

### 6.6 Auto-lock

If the top option is unanimous among all responders *and* everyone has responded, lock it
automatically and tell the group. When there's nothing to decide, don't manufacture a
decision.

### 6.7 Nudge escalation policy

A pure function:
`(member, phase, escalation_mode, hours_since_ask, nudge_history, now) → NudgeAction | null`

Returns `null` — meaning send nothing — when any of these hold:

- the member has already responded for this phase
- the member has opted out of messaging
- local time is inside quiet hours (22:00–08:00 in the member's timezone)
- a nudge already went out to them within the last 20 hours
- the current level was already sent
- **any global limit in §6.8 is exceeded**

The ladder from §3.3, as data. Levels 1, 2, and 5 are always 1:1; only 3 and 4 are public,
and what "public" means depends on the trip's `escalation_mode` (§3.5):

| Level | Delay | Target | Tone | `relay` | `managed` | `none` |
|---|---|---|---|---|---|---|
| 1 | 24h | direct | Gentle reminder | DM | DM | DM |
| 2 | 48h | direct | Playful, slightly personal | DM | DM | DM |
| 3 | 72h | **public** | Public standings, names non-responders | queued for admin to send | posted to group | **skipped** |
| 4 | 96h | **public** | Comedy award, affectionate roast | queued for admin to send | posted to group | **skipped** |
| 5 | 120h | admin | "Proceed without them, or extend?" | DM to admin | DM to admin | DM to admin |

In `none` mode the ladder does not silently lose its teeth: skipped public levels are
replaced by a firmer direct message at the same timestamps, and level 5 arrives with the
same "proceed without them, or extend?" decision. The escalation still concludes; it just
concludes privately.

In `relay` mode, escalation depends on an admin actually tapping send. If they don't, the
ladder must not stall waiting for them — level 4 and level 5 proceed on schedule
regardless, and an admin who ignores three consecutive relay prompts is offered a switch
to `none` rather than being nagged about nagging.

Guardrails, non-negotiable:

- Escalation stops permanently the moment the person responds
- Never name anyone who has already answered
- Maximum one group callout per trip per 48 hours, no matter how many ghosts
- Every message carries an opt-out path
- Humor punches at the *situation*, never at the person

### 6.8 Global rate limits — per person, not per trip

Every limit in §6.7 is scoped to one trip, which is not enough. A member of three active
trips can satisfy all of them and still be messaged nine times in a day. The person
experiences MakeItHappen as one sender, so the ceilings must be enforced against the
*person*, across every trip they belong to:

| Limit | Ceiling |
|---|---|
| Direct nudges per user, all trips | 1 per 20h, 3 per week |
| Group callouts naming one user, all trips | 1 per 48h |
| Total outbound messages per user per day | 4, including approval and availability asks |
| Concurrent trips actively nudging one user | 2 — beyond that, nudges queue |

When a global limit blocks a nudge, **defer it rather than dropping it**: reschedule past
the window so the escalation ladder resumes intact instead of silently skipping a level.

This is the difference between a product that feels like an attentive friend and one that
feels like a debt collector, and there is no recovering from the second impression.

---

## 7. Architecture

### 7.1 Stack

| Layer | Choice | Why |
|---|---|---|
| Web | Next.js (App Router) + TypeScript | One language across web, API, and jobs; server components keep the dashboard fast |
| UI | Tailwind + shadcn/ui | Fast to build, accessible defaults |
| Database | Supabase Postgres + RLS | Relational data with real constraints; RLS enforces access at the row |
| Auth | Supabase Auth, phone OTP via Twilio Verify | Phone-first signup with no password, matching the product |
| Jobs | `scheduled_jobs` table + `pg_cron` | Durable, debuggable, no extra vendor (§7.4) |
| Messaging | Twilio WhatsApp Business API | Official Meta BSP route (§7.2) |
| Hosting | Vercel | Zero-config for Next.js |

Rationale for TypeScript end-to-end: the domain logic — quorum math, date scoring,
escalation policy — is shared by the web app, the API, and the job runner. One language
means writing it once. It also means a future React Native app reuses the entire domain
layer, not just the API contracts.

### 7.2 Twilio and WhatsApp

Twilio is a Meta-approved WhatsApp Business Solution Provider, so this is the official,
ToS-compliant integration path — with meaningfully less Meta paperwork than going direct.
It also provides Twilio Verify for login OTP, so one vendor and one SDK covers both the
bot and authentication.

**What this constrains — read before designing any message.**

1. **The 24-hour window.** You may send free-form text only within 24 hours of the user's
   last inbound message. Outside that window you may send *only* pre-approved message
   templates.

   This has a direct and non-obvious consequence for the funniest part of the product:
   **spontaneous humor is only possible inside an active session.** A cold nudge to
   someone who hasn't messaged in three days must be a template Meta approved weeks ago.

   The design that resolves it:
   - Maintain a **library of pre-approved template variants** — several approved
     phrasings per nudge level, with variables for names, counts, and dates. Rotate them
     so repeat offenders don't get identical text.
   - Templates carry the variables, and the *variable values* provide the specificity
     ("Dani", "4 days", "6 people waiting") that makes a canned line feel personal.
   - **Inside** a live 24h session, generate free-form replies — this is where genuinely
     dynamic humor is allowed.

   Getting template approval right is a schedule risk, not an afterthought: submit the
   nudge library to Meta in week one, because approval takes days and rejections need
   rewrites.

2. **Interactive limits.** 3 quick-reply buttons, or a list picker with up to 10 rows.
   This is what bounds `date_options` (§5).
3. **Templates are versioned artifacts.** Managed through Twilio's Content API, checked
   into the repo, and referenced by `template_key` — never inline strings in application
   code.
4. **Messaging tier limits.** New senders start with a capped number of business-initiated
   conversations per 24 hours and scale with good-standing usage. Fine for real trips,
   worth knowing before a launch push.
5. **Cost is per message**, varying by template category and destination country. Verify
   current rates against Twilio and Meta pricing during Milestone 2 rather than trusting
   any number written here — this pricing has changed more than once. Budget implication:
   the nudge engine is the main cost driver, which is a second good reason for the
   frequency caps in §6.7.

**Webhook requirements**, all mandatory:

- Validate `X-Twilio-Signature` on every inbound request. An unvalidated webhook lets
  anyone vote as anyone.
- Idempotency on `provider_sid` — Twilio retries, and a double-counted vote corrupts a
  quorum.
- Respond fast, process asynchronously: enqueue and return, don't run the engine inline.
- Consume delivery status callbacks; on `undelivered`, fall back to SMS and flag the
  member as unreachable on WhatsApp.

**Development before approval.** Production requires a registered WhatsApp Sender with
Meta business verification and display-name approval, which takes real calendar time.
Twilio's WhatsApp Sandbox unblocks development immediately — testers opt in by sending a
join code — and the channel abstraction below removes the dependency entirely for local
work.

### 7.3 Channel abstraction

```ts
interface MessagingChannel {
  send(to: PhoneNumber, message: OutboundMessage): Promise<SendResult>;
  sendToGroup(trip: TripId, message: OutboundMessage): Promise<SendResult>;
  supportsButtons: boolean;
  supportsFreeform(session: SessionState): boolean;
}
```

Four implementations, all behind the same interface:

- `TwilioWhatsAppChannel` — production
- `TwilioSmsChannel` — fallback when WhatsApp is undelivered
- `DeepLinkChannel` — renders share text plus `wa.me` links for manual sending. **This is
  what lets you build and demo the entire product before Meta approves your sender**, and
  it doubles as the degraded mode if a number ever gets restricted.
- `ConsoleChannel` — local development and tests; asserts on rendered output

Domain code never imports Twilio. It emits an `OutboundMessage` describing intent, and the
channel decides how to deliver it. Adding Telegram later is one new implementation and
zero changes to the engine.

`sendToGroup` dispatches on the trip's `escalation_mode` (§3.5). The three
implementations, and the real constraints behind the choice:

**`relay` — the app composes, the admin sends.** The callout is written to `relay_queue`
and the admin gets a DM plus a dashboard card: the finished text, a copy button, and a
`wa.me` share link that opens WhatsApp's share sheet so they pick their existing group and
send. No API capability required at all.

Callouts expire. A level-3 "who are we waiting for" message is worthless three days later,
and sending stale peer pressure is worse than sending none — so an unsent callout past
`expires_at` is dropped and logged, never queued up to fire in a batch.

**`managed` — native WhatsApp groups via Meta's Groups API.** This is genuinely
available: Meta shipped the Groups API in October 2025 and opened it to all Official
Business Accounts during 2026, and it is reachable through Twilio. The constraints are
what make it a Phase 2 upgrade rather than the v1 default:

| Constraint | Consequence for this product |
|---|---|
| **Official Business Account required** | The blue-tick tier. A high bar for a new small business, and it gates the whole mode |
| **Max 8 participants per group** | A trip of 9 friends cannot use it. Directly caps the product's group size |
| **No add-participant endpoint** | Members join only via an invite link, optionally with join approval. You cannot assemble the group for them |
| **Interactive messages unsupported** | No quick-reply buttons in groups — text, media, and text/media templates only. This is why coordination must be 1:1 |
| Unavailable for WhatsApp Business app numbers and Coexistence/Multi-solution numbers | Constrains how the sender is onboarded |
| 10,000 groups per number, 1 API business per group | Not a practical limit here |

Because joining is invite-link-only, `managed` mode also introduces a set the rest of the
system doesn't have: **group membership is not trip membership.** Someone can accept the
trip and never join the group. Callouts must therefore never assume the target is present,
and level 5 still reaches the admin directly regardless.

**`none`** makes `sendToGroup` a no-op that records the suppressed callout in
`message_log`, so the escalation ladder's behavior stays observable even when it is
deliberately silent.

**Rejected: Twilio Conversations as a pseudo-group.** Twilio can fan a message out to up
to 50 participants through the business number, which is more people and needs no OBA. But
each recipient sees it in their own 1:1 thread, so a "public" callout arrives privately —
and the entire mechanism of §3.5 is that everyone sees it *together*. It also inherits the
24-hour session window per participant. Worth revisiting only if `relay` proves too
high-friction for admins in practice.

### 7.4 Background jobs

Nudges are the engine, and every nudge is a delayed action. The design must survive
restarts, deploys, and duplicate delivery.

`pg_cron` runs once a minute and calls a secret-protected endpoint that claims due jobs
with `SELECT ... FOR UPDATE SKIP LOCKED`, executes them, and records the result.

Chosen over hosted alternatives because the job table is queryable with plain SQL — when
a nudge fires wrong at 3am, `select * from scheduled_jobs where trip_id = ...` is the
entire debugging session. It adds no vendor, no cost, and no new failure mode. If the
escalation ladder later grows into genuinely complex multi-step workflows, Inngest or
Trigger.dev is the upgrade path, and the job table maps onto either.

Job types: `send_nudge`, `check_approval_deadline`, `close_date_collection`,
`send_digest`, `expire_trip`.

Requirements:

- **Idempotent handlers.** Every job may run twice. Nothing may double-send.
- **Cancellation on state change.** When a member responds, cancel their pending nudges in
  the same transaction. This is the single most important correctness rule in the system —
  nudging someone who already answered is the fastest way to get your number blocked.
- **Bounded retries** with backoff, then `failed` plus an alert.
- Jobs are scheduled in the member's timezone, respecting quiet hours.

### 7.5 Module boundaries

Organized so each unit has one purpose and pure logic never touches I/O:

```
src/
  core/                     ← pure domain logic, zero I/O, heavily unit-tested
    trips/                  state machine, transition guards
    approvals/              quorum math, early-advance and early-fail rules
    scheduling/             option generation, scoring, tie-breaks, explanations
    nudge/                  escalation policy decisions
  channels/                 MessagingChannel implementations
  messages/                 template library, rendering, localization
  jobs/                     runner, handlers, scheduler
  db/                       Supabase client, queries, RLS policies, migrations
    token-scope/            the service-role chokepoint (§7.6) — nothing else
                            in the codebase may hold a service-role client
  observability/            structured logging, alerts, spend ceilings, kill switch
  app/                      Next.js routes, server actions, UI
  integrations/
    travel/                 Phase 2 — TravelSearchProvider interface
  payments/                 Phase 3 — settlement ledger
```

The rule that keeps this honest: `core/` may not import from `channels/`, `db/`, or
`jobs/`. Enforce it with an ESLint import-boundary rule, not good intentions. Everything
subtle about this product lives in `core/`, and it stays testable only if that dependency
arrow never reverses.

`messages/` separates template *keys* from rendered text so localization — Hebrew is the
obvious first addition — is a data change, not a code change.

### 7.6 No-login action pages, and how they coexist with RLS

`action_tokens` grant scoped, expiring, single-purpose access:

`https://makeithappen.app/a/<token>` → "Mark your Athens dates" with no login prompt.

Rules: single scope per token, expires with its phase, hashed at rest, rate-limited,
revoked when the phase closes. Sensitive actions — locking dates, removing members,
changing quorum — always require a real session and admin role. A leaked availability
token should cost you one wrong vote, not the trip.

**The architectural tension.** RLS keys off the authenticated session, and these pages
have no session at all. A token holder is, to Postgres, an anonymous request. So RLS
cannot be the thing that authorizes them — which means the system has two distinct access
paths and they must not be confused:

| Path | Who | Authorization |
|---|---|---|
| **Session** — organizers, logged-in members | Supabase auth JWT | **RLS**, enforced in Postgres |
| **Token** — WhatsApp participants, webhooks, jobs | `action_tokens`, Twilio signature, cron secret | **Application code**, in a server-only trust boundary |

Non-negotiable rules for the token path:

- Token routes are **server-only** — route handlers and server actions, never client
  components. The service role key must be unreachable from anything that reaches a
  browser bundle, and it must never appear in a `NEXT_PUBLIC_`-prefixed variable.
- Every service-role query goes through a **single narrow module** in `db/` that takes an
  already-validated token context and scopes each query to that token's `trip_id` and
  `user_id`. Application code never gets a raw service-role client to use freely. One
  chokepoint is auditable; scattered service-role calls are not.
- Validate first, act second: hash lookup, check scope, expiry, single-use, and that the
  trip is still in the phase the token was minted for.
- The token identifies *one* `user_id` for *one* `trip_id`. It can never enumerate, list
  other trips, or read another member's data.

Same rule applies to the Twilio webhook and the cron endpoint: both bypass RLS, so both
authorize in application code — signature validation and a shared secret respectively —
and both go through the same chokepoint.

The failure mode this prevents is the classic one: a service-role client convenient enough
to reach for in a page component, and suddenly the whole database is readable by anyone
with a browser.

### 7.7 Observability and cost control

As designed so far, the job runner fails silently. A nudge that never fires produces no
error anyone sees — you would learn about it from a friend, weeks later, after a trip
quietly stalled. For a product whose entire value is *automation that reliably happens*,
silent failure is the worst possible bug class, so it gets first-class treatment.

**What must be visible:**

- **Structured logs** on every job execution and every message send, correlated by
  `trip_id` — the unit of debugging is always "what happened to this trip?"
- **Error tracking** (Sentry or equivalent) on web, jobs, and webhooks. Unhandled
  exceptions in a cron-invoked route are otherwise invisible.
- **Alerts** on the handful of signals that actually mean something is broken: any job in
  `failed`, jobs `pending` past `run_at` by more than 15 minutes (the runner is dead —
  this is the one that matters most), inbound webhook error rate, Twilio delivery failure
  rate, and any opt-out event.
- **An internal admin view** listing recent jobs, message log, and stuck trips. This is
  cheap to build on top of `scheduled_jobs` and `message_log` and it will pay for itself
  in the first week of real use.
- **A per-trip timeline** from `trip_activity`, which doubles as the organizer-facing UI
  in §8 — the same data serves debugging and the product.

**Spend ceilings and a kill switch.** Messaging is per-message and the nudge engine is the
volume driver, so a bug in scheduling is not merely embarrassing — it is expensive. Hard
limits, enforced in the sender chokepoint rather than trusted to correct logic upstream:

| Ceiling | Behavior when hit |
|---|---|
| Per-trip message budget | Pause automation, alert the admin |
| Per-account daily and monthly budget | Trip a circuit breaker: stop all outbound, alert |
| Global kill switch (config flag) | Halt every outbound message immediately, no deploy |

The kill switch matters more than the budgets. If the engine starts misbehaving against
real friends' phone numbers, the time to stop it is seconds, and waiting on a deploy is
not seconds.

---

## 8. Web app screens

| Screen | Purpose |
|---|---|
| Login | Phone number → OTP → display name on first run |
| My trips | Cards grouped by state, with what's blocking each one |
| Create trip | The §3.1 wizard |
| **Trip dashboard** | The main screen: state, progress toward quorum, member grid with per-person status, availability heatmap, activity timeline, admin actions |
| Date decision | Ranked options with explanations; lock one |
| Members | Invite, promote to admin, mark essential, remove |
| **Relay card** | On the dashboard when a callout is queued: the finished text, a copy button, a share link, and dismiss. The admin's whole job in one tap (§7.3) |
| Settings | Name, timezone, notification preferences, opt-out; per-trip escalation mode |
| Action pages | No-login approve/reject and availability calendar (§7.6) |

The dashboard exists to answer one question at a glance: *who are we waiting for?* If an
organizer can't see that in under two seconds, the screen has failed.

---

## 9. Privacy, compliance, trust

Phone numbers are the core asset and the core liability.

- **Consent.** Adding someone's number is not consent to message them. The first message
  identifies who invited them and offers an immediate opt-out. This is the whole basis for
  contacting a provisional user (§5.1) who never agreed to anything — the invitation is a
  claim by a friend, not consent, and the first message must earn it.
- **Opt-out is absolute.** Honor `STOP` at the number level across all trips, permanently,
  and log it. Both Meta and Twilio will act on complaints, and losing the sender ends the
  product.
- **Minimal exposure.** Members see other members' names and last 4 digits. Never full
  numbers — a trip group is not an address-book export.
- **RLS on every table** for the session path, plus the application-code chokepoint for
  the token path (§7.6). No table is readable without active membership in its trip.
- **Provisional users have full rights.** Access, correction, deletion, and opt-out must
  work for someone who never signed up. Under GDPR they are data subjects regardless, and
  the token path is how they exercise it.
- **Legal pages** — Terms of Service and Privacy Policy, hosted on the production domain.
  Prerequisites for Meta and Twilio approval, not launch polish.
- **Full audit.** `message_log` records every outbound message. Needed for compliance
  disputes and invaluable for debugging.
- **Retention.** Purge completed and cancelled trips after 12 months. Support account
  deletion with a full cascade.
- **Rate limits** on OTP requests, invitations per user per day, and token endpoints.
  Invite spam is the obvious abuse vector.

---

## 10. Testing

The plan puts effort where bugs are expensive:

| Layer | Approach |
|---|---|
| `core/` | Unit tests, no mocks needed. Full table-driven coverage of quorum math, scoring, tie-breaks, and escalation. Includes property tests: scoring is order-independent, an essential *no* always disqualifies, a responder never gets nudged, and no user exceeds a §6.8 global ceiling under any trip combination. |
| State machine | Every legal transition, and assertions that illegal ones are rejected. |
| Identity | Invite creates a provisional user; OTP login claims it rather than duplicating; votes and memberships survive the claim; the same number across three trips is one row. |
| Jobs | Handlers invoked twice to prove idempotency; cancellation-on-response verified; a globally rate-limited nudge is deferred, not dropped. |
| Escalation modes | All three modes over the full ladder: `none` skips public levels but still concludes at level 5, `relay` proceeds on schedule whether or not the admin sends, and an expired relay callout is dropped rather than sent late. |
| Channels | `ConsoleChannel` asserts rendered output; Twilio calls are mocked. Signature validation and webhook idempotency tested explicitly. |
| Authorization | The one that would hurt most: a token scoped to trip A cannot read trip B, an expired or used token is refused, a token cannot perform an admin action, and no client bundle contains the service role key (assert this in CI). |
| End-to-end | One scripted happy path (create → approve → dates → lock) and one ghost path (nudge ladder to level 5). |
| Manual | A real trip with real friends. Non-negotiable before launch — the humor and the timing cannot be unit-tested, and both are load-bearing. |

---

## 11. Milestones

### 11.1 Prerequisites — start now, they run on calendar time

None of these block writing code, but several block *launching*, and they are measured in
weeks rather than hours. Start them in parallel with M0.

| Prerequisite | Why it's on the critical path |
|---|---|
| **Meta business verification** | Production WhatsApp senders need a WhatsApp Business Account under a verified Meta Business Portfolio. Verification generally requires business registration documents and a matching domain. **Confirm current requirements first** — if a registered entity is needed, that is weeks, and it gates M5 |
| **Domain name** | Required for the WhatsApp display-name review, the legal pages, and the action-page links |
| **Terms of Service + Privacy Policy** | Approval prerequisites, not polish. You are processing phone numbers belonging to people who never signed up |
| **Twilio account** | Account, phone number, Verify service, and sandbox access. Sandbox is available immediately and unblocks M2 |
| **Message template copy** | ~20–30 finished messages: approval, availability, confirmations, and several variants per nudge level with variables marked. A writing task, not a coding task, and Meta cannot approve what isn't written |
| **Supabase + Vercel projects** | Minutes, not weeks, but needed for M0 |

Development environment, all quick: repo and git, pinned Node and package manager,
Supabase CLI for local migrations, secret handling with a strict rule that no
service-role key is ever `NEXT_PUBLIC_`, seed data, the ESLint import-boundary rule
enforcing `core/` purity (§7.5), and CI running tests. One non-obvious item: receiving
Twilio webhooks on localhost needs a tunnel (ngrok or the Twilio CLI), and signature
validation must be configured for the tunnel's public URL or every local webhook fails
validation for reasons that look like a code bug.

### 11.2 Build order

| # | Deliverable | Definition of done |
|---|---|---|
| **M0** | Skeleton | Next.js + Supabase deployed; phone OTP login works end to end; CI green; import boundaries enforced |
| **M1** | Trips & groups | Create a trip, invite members with required display names, roles; provisional users and account claiming (§5.1); dashboard renders; RLS and the token chokepoint verified (§7.6). **Submit the WhatsApp sender registration and template library to Meta now** — approval is the long pole |
| **M2** | Approval loop | Twilio sandbox wired; approval messages with buttons; inbound webhook validated and idempotent; quorum transitions correct |
| **M3** | Availability & decision | Option generation, WhatsApp voting, web calendar, scoring, ranked recommendation with explanations, admin lock |
| **M4** | Nudge engine | `pg_cron` job runner; full escalation ladder in `relay` and `none` modes; relay queue and dashboard card; quiet hours; per-trip and global rate limits (§6.8); cancellation on response; opt-out |
| **M5** | Observability & safety | Error tracking, stuck-job alerting, internal admin view, spend ceilings, and the kill switch (§7.7). **Before** real numbers, not after |
| **M6** | Real trip | Production sender live; run one actual trip with actual friends; fix what breaks |

Two sequencing choices are deliberate. **M1 submits to Meta** because approval is calendar
time you cannot compress and it gates M6; `DeepLinkChannel` and the sandbox keep
development unblocked meanwhile. **M5 precedes M6** because the kill switch and spend
ceilings are worthless after the engine has already misfired at your friends.

`managed` mode is explicitly **not** in the v1 build order. It needs an Official Business
Account and caps groups at 8 participants (§7.3), so it is a Phase 2 upgrade that slots in
behind the `escalation_mode` switch without touching the engine. Shipping `relay` and
`none` first means the escalation ladder is real from M4 with no external approvals
pending — which also removes what was previously the plan's biggest unknown.

---

## 12. Risks

| Risk | Impact | Mitigation |
|---|---|---|
| Meta sender/template approval delayed or rejected | Blocks launch | Submit in M1; `DeepLinkChannel` and sandbox keep development moving; keep template copy tame enough to approve |
| Meta verification requires a registered business entity | Blocks launch by weeks | Investigate in week one (§11.1). If needed, register early — it is paperwork, not engineering, and it parallelizes perfectly |
| Service-role key leaks to the client via a token page | Catastrophic — full database exposure | Server-only routes, single audited chokepoint (§7.6), CI assertion that no client bundle contains the key |
| Scheduling bug floods real friends with messages | Fatal to trust and to the sender | Global per-person caps (§6.8), spend ceilings, and a config-flag kill switch that needs no deploy (§7.7) |
| Job runner dies silently; trips stall unnoticed | Undermines the entire premise | Alert on jobs pending past `run_at` by 15 minutes — the single most important alert in the system (§7.7) |
| Nudges read as spam; number reported | Fatal — kills the channel | Frequency caps, quiet hours, hard stop on response, absolute opt-out, humor that never targets the person |
| Admins don't bother tapping send in `relay` mode | The best feature goes unused | Ladder proceeds regardless (§6.7); one-tap share sheet keeps friction minimal; measure relay send rate as a launch metric (§13). If it's low, `managed` mode becomes the priority |
| Native groups need an Official Business Account and cap at 8 | `managed` mode may never be reachable | It's a Phase 2 upgrade behind a mode switch, not a v1 dependency (§7.3) |
| Public callouts land badly in some friend groups | Social damage, uninstalls | `none` mode; escalation mode visible to all members; humor targets the situation, never the person |
| WhatsApp pricing rises | Nudge engine becomes costly | Caps already limit volume; SMS and deep-link fallbacks exist |
| Travel APIs need contracts and volume | Blocks Phase 2 | Out of v1 scope; interface-only; affiliate deep links are the fallback |
| Nobody responds even when nudged | Trips still stall | Deadlines with auto-advance; admin can always proceed without stragglers |
| Feature creep into itineraries, chat, expenses | Never ships | §2 non-goals are the contract |

---

## 13. Success metrics

One metric matters above the rest: **the share of created trips that reach `date_locked`.**
That is the entire thesis of the product — that software can carry a trip past the point
where group chats abandon it.

Supporting:

- Median time from trip creation to locked dates *(target: under 7 days)*
- Response rate before any nudge vs. after — this measures whether the engine works at all
- Share of participants who completed everything without opening the web app *(should be
  high; it validates WhatsApp-first)*
- Trips per group per year — repeat use is the real signal
- Opt-out rate *(must stay near zero; it is the canary for tone and frequency)*
- **Relay send rate** — the share of queued callouts an admin actually sends. This
  measures whether `relay` mode works as a mechanism at all; if it's low, admins find the
  callout awkward or the friction too high, and either the copy or the mode needs
  rethinking (§7.3)
- Response rate within 12 hours of a public callout vs. a direct nudge — the direct test
  of whether peer pressure is doing anything the DMs weren't already doing

---

## 14. Decisions made

Recorded so they don't get relitigated later:

- **v1 stops at locked dates.** Travel sourcing is Phase 2, money is Phase 3 (§2).
- **Money is tracked, never held.** No escrow, no money transmission, ever built in-house
  (§2).
- **"Trip" is the core entity**, not "event". Staying focused on travel. If non-travel
  gatherings enter scope later, that is a deliberate rename with a migration, not a
  hedge taken now.
- **English only at launch.** Hebrew is the expected first addition, but shipping one
  language halves the Meta template submission in M1. `messages/` is built so adding a
  locale is a data change (§7.5).
- **Twilio as the WhatsApp provider**, using the official Meta BSP route (§7.2).
- **`pg_cron` plus a job table** for automation, over a hosted workflow vendor (§7.4).
- **Coordination is always peer-to-peer; groups receive escalation only** (§3.5). The
  admin picks the escalation mode per trip, and `relay` — app composes, admin taps send —
  is the v1 default. Native `managed` groups are a Phase 2 upgrade gated on an Official
  Business Account.

---

## 15. Open questions

1. **Is an Official Business Account realistically obtainable?** It gates `managed` mode
   entirely. Worth finding out during the M1 Meta paperwork, since it changes whether
   `managed` is a Phase 2 plan or a permanent no. v1 does not depend on the answer.
2. **Default escalation mode for a first-time admin.** The plan defaults to `relay`, but
   an admin who has never seen a callout doesn't know what they're agreeing to. Should the
   wizard show a sample callout before they choose? Probably yes — it's one screen and it
   prevents the worst first impression.
3. **Trip-cost expectations in v1.** Should the create wizard capture a rough per-person
   budget? It's one field, it shapes Phase 2 sourcing, and it surfaces mismatched
   expectations before they become an argument.
4. **Humor calibration.** The roast tone assumes a close friend group. Does it need a
   dial — "gentle" vs. "merciless" — set per trip by the admin? Note that each distinct
   tone needs its own approved templates, so a dial multiplies the M1 writing and
   submission work.
5. **Nudge timing for short-notice trips.** The ladder in §6.7 spans five days. A trip
   proposed for three weeks out cannot afford that. Should escalation delays compress
   proportionally to how soon the trip window opens?
