import "server-only";

import { labelFor, rankOptions } from "@/core/dates";
import { activeMembers, invitees, pendingFor, tally } from "@/core/quorum";
import type { Member, Phase } from "@/core/types";
import type { TripAggregate } from "@/db/queries";
import { firstName, joinNames, optionLabelsText, rankedListText } from "@/messages/render";
import type { TemplateVars } from "@/messages/templates";

/** Common variables for any message about a trip. */
export function tripVars(agg: TripAggregate): Partial<TemplateVars> {
  const t = agg.trip;
  const tl = tally(agg.members);
  return {
    tripTitle: t.title,
    destination: t.destination,
    nights: t.nights,
    windowLabel: windowLabel(t.windowStart, t.windowEnd),
    description: t.description || "No description yet.",
    inviter: firstName(agg.creatorName),
    invitedCount: tl.invited,
    quorum: t.quorum,
    yesCount: tl.yes,
    total: activeMembers(agg.members).length || tl.invited,
    optionLabels: optionLabelsText(agg.options),
  };
}

/** Variables for a message to or about one member in a phase. */
export function memberVars(agg: TripAggregate, member: Member, phase: Phase, now = Date.now()): Partial<TemplateVars> {
  const optionIds = agg.options.map((o) => o.id);
  const pool = phase === "approval" ? invitees(agg.members) : activeMembers(agg.members);
  const pending = pendingFor(agg.members, phase, optionIds);
  const answered = pool.filter((m) => !pending.some((p) => p.id === m.id));
  const askedAt = phase === "approval" ? agg.trip.approvalAskedAt : agg.trip.datesAskedAt;
  const days = askedAt ? Math.max(1, Math.floor((now - askedAt) / 86_400_000)) : 0;

  return {
    ...tripVars(agg),
    name: firstName(member.name),
    waiting: answered.length,
    answered: joinNames(answered.map((m) => firstName(m.name))),
    answeredCount: answered.length,
    ghosts: joinNames(pending.map((m) => firstName(m.name))),
    total: pool.length,
    days,
  };
}

export function decisionVars(agg: TripAggregate): Partial<TemplateVars> {
  const active = activeMembers(agg.members);
  const ranked = rankOptions(agg.options, active, agg.trip.quorum);
  const top = ranked[0];
  return {
    ...tripVars(agg),
    rankedList: rankedListText(ranked, active.length),
    topOption: top?.option.label ?? "",
    topCount: top?.couldAttend ?? 0,
    total: active.length,
    cannot:
      top && top.cannotAttend.length > 0
        ? `${joinNames(top.cannotAttend)} can't make it.`
        : "Everyone can make it.",
  };
}

export function windowLabel(start: string, end: string): string {
  const s = new Date(start + "T00:00:00Z");
  const e = new Date(end + "T00:00:00Z");
  const fmt = (d: Date, withYear: boolean) =>
    d.toLocaleDateString("en-GB", { month: "long", ...(withYear ? { year: "numeric" } : {}), timeZone: "UTC" });
  if (s.getUTCMonth() === e.getUTCMonth() && s.getUTCFullYear() === e.getUTCFullYear()) {
    return `sometime in ${fmt(s, true)}`;
  }
  return `${labelFor(start, end)}`;
}
