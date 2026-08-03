"use client"

import { Badge, Card, CardContent, cn } from "@voyant-travel/ui/components"
import type { ReactNode } from "react"
import type { AllocationManifestBooking, AvailabilitySlotRow } from "../index.js"

export function KpiStrip({
  slot,
  rollup,
  formatCurrency,
  i18nLabels,
}: {
  slot: AvailabilitySlotRow
  rollup: SlotFinancialRollup
  formatCurrency: (value: number, currency: string) => string
  i18nLabels: {
    pax: string
    total: string
    paid: string
    outstanding: string
    mixedHint: string
    noValue: string
  }
}) {
  const paxValue = slot.unlimited ? "∞" : `${slot.remainingPax ?? 0} / ${slot.initialPax ?? 0}`
  const renderAmount = (pick: (totals: CurrencyTotals) => number): ReactNode => {
    if (rollup.entries.length === 0 || !rollup.primaryCurrency) {
      return i18nLabels.noValue
    }
    const primary = rollup.entries.find((entry) => entry.currency === rollup.primaryCurrency)
    return primary
      ? formatCurrency(pick(primary) / 100, primary.currency)
      : formatCurrency(0, rollup.primaryCurrency)
  }
  const renderHint = (pick: (totals: CurrencyTotals) => number): string | undefined => {
    if (rollup.entries.length <= 1) return undefined
    const others = rollup.entries.filter((entry) => entry.currency !== rollup.primaryCurrency)
    if (others.length === 0) return i18nLabels.mixedHint
    return `+ ${others.map((entry) => formatCurrency(pick(entry) / 100, entry.currency)).join(" · ")}`
  }
  const primary = rollup.primaryCurrency
    ? rollup.entries.find((entry) => entry.currency === rollup.primaryCurrency)
    : null
  const paidPercent =
    primary && primary.sellCents > 0
      ? Math.round((primary.paidCents / primary.sellCents) * 100)
      : null
  const outstandingPercent = paidPercent != null ? Math.max(0, 100 - paidPercent) : null

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
      <StatCard label={i18nLabels.pax}>{paxValue}</StatCard>
      <StatCard label={i18nLabels.total} hint={renderHint((t) => t.sellCents)}>
        {renderAmount((t) => t.sellCents)}
      </StatCard>
      <StatCard
        label={i18nLabels.paid}
        hint={renderHint((t) => t.paidCents)}
        badge={paidPercent != null ? renderPercentBadge(paidPercent, paidBadgeClass) : null}
      >
        {renderAmount((t) => t.paidCents)}
      </StatCard>
      <StatCard
        label={i18nLabels.outstanding}
        hint={renderHint((t) => t.outstandingCents)}
        badge={
          outstandingPercent != null
            ? renderPercentBadge(outstandingPercent, outstandingBadgeClass)
            : null
        }
      >
        {renderAmount((t) => t.outstandingCents)}
      </StatCard>
    </div>
  )
}

function StatCard({
  label,
  children,
  hint,
  badge,
}: {
  label: string
  children: ReactNode
  hint?: string
  badge?: ReactNode
}) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-1">
        <div className="text-xs font-medium text-muted-foreground">{label}</div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="text-xl font-semibold tabular-nums leading-none">{children}</div>
          {badge}
        </div>
        {hint ? <div className="text-xs text-muted-foreground">{hint}</div> : null}
      </CardContent>
    </Card>
  )
}

function renderPercentBadge(percent: number, classFor: (percent: number) => string): ReactNode {
  return (
    <Badge variant="outline" className={cn("border-transparent", classFor(percent))}>
      {percent}%
    </Badge>
  )
}

function paidBadgeClass(percent: number): string {
  if (percent <= 0) return "bg-red-500/10 text-red-600 dark:text-red-400"
  if (percent >= 100) return "bg-green-500/10 text-green-600 dark:text-green-400"
  return "bg-yellow-500/10 text-yellow-700 dark:text-yellow-400"
}

function outstandingBadgeClass(percent: number): string {
  if (percent <= 0) return "bg-green-500/10 text-green-600 dark:text-green-400"
  if (percent >= 100) return "bg-red-500/10 text-red-600 dark:text-red-400"
  return "bg-yellow-500/10 text-yellow-700 dark:text-yellow-400"
}

interface CurrencyTotals {
  currency: string
  sellCents: number
  paidCents: number
  outstandingCents: number
}

export interface SlotFinancialRollup {
  primaryCurrency: string | null
  entries: CurrencyTotals[]
}

const FINANCIAL_BOOKING_STATUSES = new Set(["confirmed", "in_progress", "completed"])

export function aggregateSlotFinancials(
  bookings: ReadonlyArray<AllocationManifestBooking>,
  productCurrency: string | null,
): SlotFinancialRollup {
  const byCurrency = new Map<string, CurrencyTotals>()
  for (const booking of bookings) {
    if (!FINANCIAL_BOOKING_STATUSES.has(booking.status)) continue
    const currency = booking.sellCurrency
    if (!currency) continue
    const sell = booking.sellAmountCents ?? 0
    const paid = booking.paidAmountCents ?? 0
    if (sell <= 0 && paid <= 0) continue
    const entry = byCurrency.get(currency) ?? {
      currency,
      sellCents: 0,
      paidCents: 0,
      outstandingCents: 0,
    }
    entry.sellCents += sell
    entry.paidCents += paid
    byCurrency.set(currency, entry)
  }
  for (const entry of byCurrency.values()) {
    entry.outstandingCents = Math.max(0, entry.sellCents - entry.paidCents)
  }
  const entries = [...byCurrency.values()].sort((left, right) => right.sellCents - left.sellCents)
  const primaryCurrency =
    (productCurrency && byCurrency.has(productCurrency) ? productCurrency : null) ??
    entries[0]?.currency ??
    productCurrency ??
    null
  return { primaryCurrency, entries }
}
