/**
 * Message template library. PLAN.md §7.2, §7.5.
 *
 * Every outbound message is a `template_key` plus variables — never an inline
 * string in application code. Outside a live 24h WhatsApp session only
 * pre-approved templates may be sent, so this file IS the submission to Meta:
 * several approved phrasings per nudge level, rotated so repeat offenders
 * don't get identical text.
 *
 * Localisation is a data change: add a locale map with the same keys.
 *
 * Guardrails baked into the copy (§6.7):
 *  - humour punches at the situation, never the person
 *  - never names anyone who has already answered
 *  - every message carries an opt-out path (appended by the renderer)
 */

import type { PushLevel } from "@/core/types";

export interface TemplateVars {
  tripTitle: string;
  destination: string;
  nights: number;
  windowLabel: string;
  description: string;
  inviter: string;
  invitedCount: number;
  quorum: number;
  yesCount: number;
  name: string;
  /** How many people have answered and are waiting on this person. */
  waiting: number;
  /** Comma-joined names of people who have answered (for standings). */
  answered: string;
  answeredCount: number;
  /** Comma-joined names of non-responders. */
  ghosts: string;
  total: number;
  days: number;
  link: string;
  /** Winning option label, e.g. "May 14 – 17". */
  topOption: string;
  topCount: number;
  cannot: string;
  /** Pre-rendered ranked list for the admin decision message. */
  rankedList: string;
  deadlineLabel: string;
  optionLabels: string;
}

export type Renderer = (v: TemplateVars) => string;

export interface Template {
  /** Meta category. `utility` for transactional; nudges are also utility (they relate to an existing interaction). */
  category: "utility" | "authentication";
  variants: Renderer[];
}

export const TEMPLATES: Record<string, Template> = {
  /* ------------------------------------------------------------ approval -- */

  "approval.ask": {
    category: "utility",
    variants: [
      (v) =>
        `*MakeItHappen*\n${v.inviter} wants to make something happen.\n\n*${v.tripTitle.toUpperCase()}*\n📍 ${v.destination} · 🗓 ${v.nights} nights, ${v.windowLabel}\n👥 ${v.invitedCount} invited · needs ${v.quorum} yes to happen\n\n"${v.description}"\n— ${v.inviter}\n\nAre you in?`,
    ],
  },
  "approval.more": {
    category: "utility",
    variants: [
      (v) =>
        `*${v.tripTitle}*\n\n${v.description}\n\n📍 ${v.destination}\n🗓 ${v.nights} nights, ${v.windowLabel}\n👥 ${v.invitedCount} invited, ${v.yesCount} in so far. It happens once ${v.quorum} say yes.\n\nNo booking yet. First we lock dates, then we talk flights. You can say yes now and change your mind until the dates are locked.\n\nAre you in? Tap below, or answer here: ${v.link}`,
    ],
  },
  "approval.received_yes": {
    category: "utility",
    variants: [
      (v) => `You're in. 🙌 ${v.yesCount} of ${v.quorum} needed for ${v.destination}. We'll ping you about dates once it's real.`,
      (v) => `Noted — ${v.name} is in. That's ${v.yesCount} of ${v.quorum}. Next step: dates. Sit tight.`,
    ],
  },
  "approval.received_no": {
    category: "utility",
    variants: [
      (v) => `No worries — you're out of ${v.tripTitle}. We won't message you about it again. Changed your mind? Reply IN.`,
    ],
  },
  "approval.quorum_reached": {
    category: "utility",
    variants: [
      (v) => `${v.yesCount} of ${v.invitedCount} are in — *${v.destination} is happening!* 🎉`,
    ],
  },
  "approval.rejected": {
    category: "utility",
    variants: [
      (v) =>
        `Honest update on ${v.tripTitle}: too many people can't make it, so ${v.quorum} yes is no longer possible. Calling it. ${v.inviter} might try different dates later.`,
    ],
  },
  "approval.cancelled": {
    category: "utility",
    variants: [
      (v) => `${v.tripTitle} didn't reach ${v.quorum} yes by the deadline, so it's been shelved. No more messages about it.`,
    ],
  },
  "approval.late_arrival": {
    category: "utility",
    variants: [
      (v) => `${v.tripTitle} is already happening — and now you're in too. 🙌 Dates are being sorted; you'll get the options next.`,
    ],
  },

  /* --------------------------------------------------------------- dates -- */

  "dates.ask": {
    category: "utility",
    variants: [
      (v) =>
        `Now the annoying part, made less annoying.\nWhich of these ${v.nights}-night windows work for you?\n\n${v.optionLabels}\n\nTap all that work, or pick your own: ${v.link}`,
    ],
  },
  "dates.vote_received": {
    category: "utility",
    variants: [
      (v) => `Got it: *${v.topOption}* works for you. Any of the others? Tap them too, or reply DONE.`,
    ],
  },
  "dates.vote_no_received": {
    category: "utility",
    variants: [
      (v) => `Noted — *${v.topOption}* doesn't work. Which ones do? Or mark your calendar here: ${v.link}`,
    ],
  },
  "dates.votes_complete": {
    category: "utility",
    variants: [
      (v) => `That's all your ${v.destination} dates in. 🙏 You'll hear from us when they're locked.`,
    ],
  },
  "dates.none_work": {
    category: "utility",
    variants: [
      (v) => `None of them? Fair. Mark the dates you CAN do here and we'll factor it in: ${v.link}`,
    ],
  },
  "dates.proposed_admin": {
    category: "utility",
    variants: [
      (v) =>
        `🗓 *THE DATES ARE IN*\n\n${v.rankedList}\n\n${v.name}, lock it in? Open ${v.tripTitle}: ${v.link}`,
    ],
  },
  "dates.locked": {
    category: "utility",
    variants: [
      (v) =>
        `🔒 *${v.tripTitle.toUpperCase()} — DATES LOCKED*\n\n🗓 ${v.topOption}\n📍 ${v.destination}\n\nWorks for ${v.topCount} of ${v.total}. ${v.cannot}\n\nThat's a real date. More than the group chat ever produced.`,
    ],
  },
  "dates.auto_locked": {
    category: "utility",
    variants: [
      (v) =>
        `🔒 Everyone said yes to *${v.topOption}*, so it's locked. ${v.tripTitle} · ${v.destination}. When there's nothing to decide, we don't manufacture a decision.`,
    ],
  },

  /* -------------------------------------------------------------- nudges -- */
  /* Key shape: nudge.<push>.<target>.<level>. Levels 1–2 and suppressed 3–4 are DMs. */

  "nudge.standard.dm.1": {
    category: "utility",
    variants: [
      (v) => `Gentle reminder: ${v.destination} needs your answer.\n\nTakes four seconds. Literally four.`,
      (v) => `Quick one — your answer on ${v.tripTitle} is the only thing missing.\n\nFour seconds. Less than this message took to read.`,
    ],
  },
  "nudge.standard.dm.2": {
    category: "utility",
    variants: [
      (v) => `${v.name}, ${v.waiting} people are waiting on you.\n\nThat's ${v.waiting} people. Thinking about you. Not in a good way.`,
      (v) => `Still nothing, ${v.name}. ${v.waiting} people have answered on ${v.tripTitle}.\n\nWe both know you've seen this.`,
    ],
  },
  "nudge.standard.dm.3": {
    category: "utility",
    variants: [
      (v) => `${v.name}, straight talk: ${v.answeredCount} of ${v.total} have answered on ${v.tripTitle}. The group is waiting on you specifically. ${v.days} days now.`,
    ],
  },
  "nudge.standard.dm.4": {
    category: "utility",
    variants: [
      (v) => `Last one from us, ${v.name}. Day ${v.days}. ${v.inviter} can lock ${v.destination} without you tomorrow — answer now and you're in.`,
    ],
  },
  "nudge.standard.group.3": {
    category: "utility",
    variants: [
      (v) => `📊 *${v.destination.toUpperCase()} STANDINGS*\n\nAnswered ✅: ${v.answered}\nStill deciding: ${v.ghosts}\n\nWe're not angry. Just visibly disappointed.`,
      (v) => `📊 *${v.tripTitle.toUpperCase()} — PROGRESS REPORT*\n\n${v.answeredCount} of ${v.total} have answered.\nOutstanding: ${v.ghosts}\n\nNo pressure. Obviously this is pressure.`,
    ],
  },
  "nudge.standard.group.4": {
    category: "utility",
    variants: [
      (v) => `🐌 *SLOWEST HUMAN ALIVE AWARD*\n\n${v.ghosts} — ${v.days} days.\n\nPrevious record holder: also ${v.ghosts}.`,
      (v) => `Day ${v.days} of waiting for ${v.ghosts}.\n\n${v.destination} has been there a very long time. It can wait. We cannot.`,
    ],
  },

  "nudge.gentle.dm.1": {
    category: "utility",
    variants: [
      (v) => `No rush — when you have a minute, ${v.tripTitle} still needs your answer.`,
      (v) => `Friendly nudge: your answer on ${v.destination}, whenever you're ready.`,
    ],
  },
  "nudge.gentle.dm.2": {
    category: "utility",
    variants: [
      (v) => `Hey ${v.name} — still hoping for your answer on ${v.tripTitle} when you can.\n\n${v.waiting} people have answered. No pressure from the group.`,
    ],
  },
  "nudge.gentle.dm.3": {
    category: "utility",
    variants: [
      (v) => `${v.name}, a quiet update: ${v.answeredCount} of ${v.total} have answered on ${v.tripTitle}.\n\nStill need yours. No callout, just us.`,
    ],
  },
  "nudge.gentle.dm.4": {
    category: "utility",
    variants: [
      (v) => `Last private ask, ${v.name}. ${v.days} days in. ${v.inviter} can lock ${v.destination} without you if that's easier.`,
    ],
  },

  "nudge.spicy.dm.1": {
    category: "utility",
    variants: [
      (v) => `${v.destination}. Your answer. Now would be great.\n\nFour seconds. The group is watching the clock.`,
      (v) => `This is the polite version. ${v.tripTitle} needs your answer.`,
    ],
  },
  "nudge.spicy.dm.2": {
    category: "utility",
    variants: [
      (v) => `${v.name}. ${v.waiting} people have answered. You have not.\n\nThe next one goes to the group.`,
      (v) => `Still nothing, ${v.name}. We both know you've seen this. The group version is worse.`,
    ],
  },
  "nudge.spicy.dm.3": {
    category: "utility",
    variants: [
      (v) => `${v.name}. ${v.answeredCount} of ${v.total}. ${v.days} days. The group would have heard about this by now if ${v.inviter} hadn't turned callouts off. Answer.`,
    ],
  },
  "nudge.spicy.dm.4": {
    category: "utility",
    variants: [
      (v) => `Day ${v.days}, ${v.name}. Tomorrow ${v.destination} gets locked without you. Your move.`,
    ],
  },
  "nudge.spicy.group.3": {
    category: "utility",
    variants: [
      (v) => `📊 *${v.destination.toUpperCase()} STANDINGS* — and they are not flattering.\n\nIn: ${v.answered}\nGhosting: ${v.ghosts}\n\nName and shame, affectionately.`,
      (v) => `${v.answeredCount} of ${v.total} have answered on ${v.tripTitle}.\n\nOutstanding: ${v.ghosts}\n\nThis is now a spectator sport.`,
    ],
  },
  "nudge.spicy.group.4": {
    category: "utility",
    variants: [
      (v) => `🐌 *SLOWEST HUMAN ALIVE AWARD (SPICY EDITION)*\n\n${v.ghosts} — ${v.days} days.\n\n${v.destination} waited this long. We will not.`,
      (v) => `Day ${v.days}. ${v.ghosts} still hasn't answered on ${v.tripTitle}.\n\nPrevious record: also ${v.ghosts}. This is a pattern.`,
    ],
  },

  "nudge.admin.5": {
    category: "utility",
    variants: [
      (v) => `Still nothing from ${v.ghosts} on ${v.tripTitle} after ${v.days} days.\n\nLock without them, or extend the deadline? Decide here: ${v.link}`,
    ],
  },

  /* --------------------------------------------------------------- relay -- */

  "relay.prompt": {
    category: "utility",
    variants: [
      (v) => `📣 Callout ready for the ${v.tripTitle} group. ${v.ghosts} still hasn't answered.\n\nWe wrote it; you send it. One tap: ${v.link}`,
    ],
  },
  "relay.switch_offer": {
    category: "utility",
    variants: [
      (v) => `You've skipped three group callouts for ${v.tripTitle}. Totally fine. Want us to stop queueing them and keep nudges private? ${v.link}`,
    ],
  },

  /* --------------------------------------------------------------- admin -- */

  "admin.deadline_warning": {
    category: "utility",
    variants: [
      (v) => `⏰ ${v.tripTitle} hits its deadline in 24h with ${v.yesCount} of ${v.quorum} yes. Extend by a week, or let it close? ${v.link}`,
    ],
  },
  "admin.trip_sent": {
    category: "utility",
    variants: [
      (v) => `${v.tripTitle} is out to ${v.invitedCount} people. We'll take it from here. Watch it here: ${v.link}`,
    ],
  },

  /* -------------------------------------------------------------- system -- */

  "system.optout_confirmed": {
    category: "utility",
    variants: [
      () => `You're unsubscribed from MakeItHappen across all trips. We won't message this number again. Reply START to come back.`,
    ],
  },
  "system.optin_confirmed": {
    category: "utility",
    variants: [() => `Welcome back. You'll get MakeItHappen messages again.`],
  },
  "system.help": {
    category: "utility",
    variants: [
      (v) =>
        `This is MakeItHappen, coordinating *${v.tripTitle}* for ${v.inviter}. Tap the buttons on the last message, or reply IN / OUT. Reply STOP to never hear from us.`,
    ],
  },
  "system.unknown": {
    category: "utility",
    variants: [
      () => `Didn't catch that. Tap a button on the last message, or reply HELP.`,
    ],
  },
};

export const OPT_OUT_FOOTER = "\n\n_Reply STOP to opt out._";

/** Template key for a nudge decision. */
export function nudgeTemplateKey(push: PushLevel, target: "dm" | "group", level: number): string {
  if (level === 5) return "nudge.admin.5";
  return `nudge.${push}.${target}.${level}`;
}

export function hasTemplate(key: string): boolean {
  return key in TEMPLATES;
}
