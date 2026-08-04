"use client"

import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  cn,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@voyant-travel/ui/components"
import { ExternalLink, TriangleAlert, Wallet } from "lucide-react"
import type { AvailabilityUiMessages } from "../i18n/index.js"
import type { DepartureFinanceLine, DepartureSummary } from "../index.js"
import { DepartureSection, StatCard, StatGrid } from "./departure-stat.js"

/**
 * Financials: Finance's own P&L for the departure.
 *
 * This section used to sum `sellAmountCents` across the allocation manifest's
 * bookings in the browser and call the result revenue. It was not revenue — it
 * was what was sold, before credit notes, before supplier cost, before FX, and
 * it silently tracked whichever page of the manifest was loaded. Finance owns
 * those figures, the summary carries them across the optional runtime port,
 * and Operations renders them without recomputing anything.
 *
 * `finance === null` means no Finance provider is bound to this deployment.
 * That is a DIFFERENT fact from "this departure made nothing", so it renders as
 * an explicit unavailable state rather than as a grid of zeros — the booking
 * settlement figures stay visible underneath because they come from Bookings,
 * not from Finance.
 */
export function DepartureFinancialsSection({
  summary,
  messages,
  formatCurrency,
  formatNumber,
  onOpenFinanceReport,
}: {
  summary: DepartureSummary | null
  messages: AvailabilityUiMessages
  formatCurrency: (value: number, currency: string) => string
  formatNumber: (value: number) => string
  onOpenFinanceReport?: () => void
}) {
  const details = messages.details
  const copy = details.departure.financials
  const noValue = details.noValue
  const finance = summary?.finance ?? null
  const bookings = summary?.bookings ?? null

  const openReport = onOpenFinanceReport ? (
    <Button variant="outline" onClick={onOpenFinanceReport}>
      <ExternalLink data-icon="inline-start" aria-hidden="true" />
      {copy.openReportAction}
    </Button>
  ) : null

  return (
    <div className="flex flex-col gap-8">
      <DepartureSection
        slot="departure-financials"
        title={copy.title}
        description={copy.description}
        actions={openReport}
      >
        {finance === null ? (
          <Empty data-slot="departure-finance-unavailable" className="border">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Wallet aria-hidden="true" />
              </EmptyMedia>
              <EmptyTitle>{copy.unavailableTitle}</EmptyTitle>
              <EmptyDescription>{copy.unavailableDescription}</EmptyDescription>
            </EmptyHeader>
            {openReport}
          </Empty>
        ) : finance.perCurrency.length === 0 && finance.base === null ? (
          <Empty data-slot="departure-finance-empty" className="border">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Wallet aria-hidden="true" />
              </EmptyMedia>
              <EmptyTitle>{copy.emptyTitle}</EmptyTitle>
              <EmptyDescription>{copy.emptyDescription}</EmptyDescription>
            </EmptyHeader>
            {openReport}
          </Empty>
        ) : (
          <div className="flex flex-col gap-4">
            {finance.base ? (
              <div>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {copy.baseTitle}
                </h3>
                <StatGrid className="sm:grid-cols-4">
                  <StatCard label={copy.columnRevenue}>
                    {formatCurrency(finance.base.revenueCents / 100, finance.base.currency)}
                  </StatCard>
                  <StatCard label={copy.columnActualCost}>
                    {formatCurrency(finance.base.actualCostCents / 100, finance.base.currency)}
                  </StatCard>
                  <StatCard
                    label={copy.columnProfit}
                    tone={finance.base.profitCents < 0 ? "attention" : "default"}
                  >
                    {formatCurrency(finance.base.profitCents / 100, finance.base.currency)}
                  </StatCard>
                  <StatCard label={copy.columnMargin}>
                    {finance.base.marginPercent === null
                      ? noValue
                      : `${formatNumber(finance.base.marginPercent)}%`}
                  </StatCard>
                </StatGrid>
              </div>
            ) : null}

            {finance.perCurrency.length > 0 ? (
              <div className="overflow-x-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{copy.columnCurrency}</TableHead>
                      <TableHead>{copy.columnRevenue}</TableHead>
                      <TableHead>{copy.columnPlannedCost}</TableHead>
                      <TableHead>{copy.columnActualCost}</TableHead>
                      <TableHead>{copy.columnVariance}</TableHead>
                      <TableHead>{copy.columnProfit}</TableHead>
                      <TableHead>{copy.columnMargin}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {finance.perCurrency.map((line) => (
                      <FinanceRow
                        key={line.currency}
                        line={line}
                        formatCurrency={formatCurrency}
                        formatNumber={formatNumber}
                        noValue={noValue}
                      />
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : null}

            {finance.unconvertibleCurrencies.length > 0 ? (
              <Alert variant="destructive">
                <TriangleAlert aria-hidden="true" />
                <AlertTitle>{copy.unconvertibleTitle}</AlertTitle>
                <AlertDescription>
                  {copy.unconvertibleDescription.replace(
                    "{currencies}",
                    finance.unconvertibleCurrencies.join(", "),
                  )}
                </AlertDescription>
              </Alert>
            ) : null}
          </div>
        )}
      </DepartureSection>

      <DepartureSection slot="departure-settlement" title={copy.settlementTitle}>
        <StatGrid className="sm:grid-cols-3">
          <StatCard label={copy.settlementSoldLabel}>
            {formatSettlement(
              bookings?.soldAmountCents,
              bookings?.currency,
              formatCurrency,
              noValue,
            )}
          </StatCard>
          <StatCard label={copy.settlementPaidLabel}>
            {formatSettlement(
              bookings?.paidAmountCents,
              bookings?.currency,
              formatCurrency,
              noValue,
            )}
          </StatCard>
          <StatCard
            label={copy.settlementOutstandingLabel}
            tone={
              bookings?.outstandingAmountCents && bookings.outstandingAmountCents > 0
                ? "attention"
                : "default"
            }
          >
            {formatSettlement(
              bookings?.outstandingAmountCents,
              bookings?.currency,
              formatCurrency,
              noValue,
            )}
          </StatCard>
        </StatGrid>
        {bookings && bookings.currency === null && bookings.count > 0 ? (
          <p className="text-sm text-muted-foreground">{copy.mixedCurrenciesHint}</p>
        ) : null}
      </DepartureSection>
    </div>
  )
}

function FinanceRow({
  line,
  formatCurrency,
  formatNumber,
  noValue,
}: {
  line: DepartureFinanceLine
  formatCurrency: (value: number, currency: string) => string
  formatNumber: (value: number) => string
  noValue: string
}) {
  const money = (cents: number) => formatCurrency(cents / 100, line.currency)

  return (
    <TableRow>
      <TableCell className="font-medium">{line.currency}</TableCell>
      <TableCell className="tabular-nums">{money(line.revenueCents)}</TableCell>
      <TableCell className="tabular-nums">{money(line.plannedCostCents)}</TableCell>
      <TableCell className="tabular-nums">{money(line.actualCostCents)}</TableCell>
      <TableCell
        className={cn("tabular-nums", line.varianceCents > 0 && "text-red-600 dark:text-red-400")}
      >
        {money(line.varianceCents)}
      </TableCell>
      <TableCell
        className={cn("tabular-nums", line.profitCents < 0 && "text-red-600 dark:text-red-400")}
      >
        {money(line.profitCents)}
      </TableCell>
      <TableCell className="tabular-nums">
        {line.marginPercent === null ? noValue : `${formatNumber(line.marginPercent)}%`}
      </TableCell>
    </TableRow>
  )
}

function formatSettlement(
  cents: number | null | undefined,
  currency: string | null | undefined,
  formatCurrency: (value: number, currency: string) => string,
  noValue: string,
): string {
  if (cents === null || cents === undefined || !currency) return noValue
  return formatCurrency(cents / 100, currency)
}
