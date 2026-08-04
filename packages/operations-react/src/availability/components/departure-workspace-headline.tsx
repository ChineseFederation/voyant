"use client"

import { Badge, cn } from "@voyant-travel/ui/components"
import type { ReactNode } from "react"
import type { DepartureSummary } from "../index.js"
import { StatCard, StatGrid } from "./departure-stat.js"

/**
 * The four figures the operator checks first, all read from the ONE composed
 * departure envelope.
 *
 * Previously these were computed in the browser by summing the allocation
 * manifest's booking rows, which meant the headline silently tracked whatever
 * page of the manifest happened to be loaded and used a settlement rule of its
 * own. The summary's counters are whole-departure aggregates and its
 * settlement is `derivePaidAmountCents` — the same rule the allocation chips
 * colour themselves with — so the headline and the rows can no longer
 * disagree.
 */
export interface DepartureHeadlineMessages {
  pax: string
  total: string
  paid: string
  outstanding: string
  mixedHint: string
  noValue: string
}

export function DepartureHeadline({
  summary,
  formatCurrency,
  messages,
}: {
  summary: DepartureSummary
  formatCurrency: (value: number, currency: string) => string
  messages: DepartureHeadlineMessages
}) {
  const { capacity, bookings } = summary
  const paxValue = capacity.unlimited
    ? "∞"
    : `${capacity.derivedRemainingPax ?? capacity.remainingPax ?? 0} / ${capacity.initialPax ?? 0}`
  // The stored counter is authoritative for selling; the derived one is what
  // the other tables actually consume. Showing the stored figure as a hint is
  // how the drift becomes visible without a second screen.
  const driftHint =
    !capacity.unlimited &&
    capacity.remainingPax !== null &&
    capacity.derivedRemainingPax !== null &&
    capacity.remainingPax !== capacity.derivedRemainingPax
      ? String(capacity.remainingPax)
      : undefined

  const amount = (value: number | null): ReactNode => {
    if (value === null || !bookings.currency) return messages.noValue
    return formatCurrency(value / 100, bookings.currency)
  }
  const mixedHint =
    bookings.currency === null && bookings.count > 0 ? messages.mixedHint : undefined

  const paidPercent =
    bookings.soldAmountCents && bookings.soldAmountCents > 0 && bookings.paidAmountCents !== null
      ? Math.round((bookings.paidAmountCents / bookings.soldAmountCents) * 100)
      : null
  const outstandingPercent = paidPercent === null ? null : Math.max(0, 100 - paidPercent)

  return (
    <StatGrid>
      <StatCard
        label={messages.pax}
        hint={driftHint}
        tone={driftHint === undefined ? "default" : "attention"}
      >
        {paxValue}
      </StatCard>
      <StatCard label={messages.total} hint={mixedHint}>
        {amount(bookings.soldAmountCents)}
      </StatCard>
      <StatCard
        label={messages.paid}
        hint={mixedHint}
        badge={paidPercent === null ? null : <PercentBadge percent={paidPercent} kind="paid" />}
      >
        {amount(bookings.paidAmountCents)}
      </StatCard>
      <StatCard
        label={messages.outstanding}
        hint={mixedHint}
        badge={
          outstandingPercent === null ? null : (
            <PercentBadge percent={outstandingPercent} kind="outstanding" />
          )
        }
      >
        {amount(bookings.outstandingAmountCents)}
      </StatCard>
    </StatGrid>
  )
}

function PercentBadge({ percent, kind }: { percent: number; kind: "paid" | "outstanding" }) {
  const good = kind === "paid" ? percent >= 100 : percent <= 0
  const bad = kind === "paid" ? percent <= 0 : percent >= 100

  return (
    <Badge
      variant="outline"
      className={cn(
        "border-transparent",
        good && "bg-green-500/10 text-green-600 dark:text-green-400",
        bad && "bg-red-500/10 text-red-600 dark:text-red-400",
        !good && !bad && "bg-yellow-500/10 text-yellow-700 dark:text-yellow-400",
      )}
    >
      {`${percent}%`}
    </Badge>
  )
}
