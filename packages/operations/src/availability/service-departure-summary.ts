/**
 * The one bounded envelope for an operated Departure.
 *
 * A departure is currently reconstructed by an operator from four screens that
 * each hold a slice of it: the slot row for capacity, the allocation manifest
 * for who is coming, the extras manifest for what they bought, and Finance for
 * whether it made money. Nothing puts the four next to each other, so nothing
 * notices when they disagree.
 *
 * This module **composes** those existing truths and computes none of them:
 *
 *   - capacity, holds, allocations and traveler completeness come from
 *     `service-departure-capacity.ts`
 *   - attention issues come from `service-departure-issues.ts`
 *   - settlement comes from `derivePaidAmountCents`, the same helper the
 *     allocation chips colour themselves with
 *   - money comes from Finance's `getDepartureProfitability` across the
 *     optional runtime port — Operations never recomputes revenue or cost
 *   - the extras rollup comes from Bookings' own slot extras manifest
 *
 * Bounded on purpose. Every field here is a scalar, a small record, or a
 * capped list, so paging the manifest (see `getSlotAllocationManifest`) can
 * never change a headline number: the counters are computed by aggregate over
 * the whole departure, not by counting what a page happened to return.
 */

import type {
  FinanceDepartureProfitabilityReport,
  FinanceDepartureProfitabilityRow,
} from "@voyant-travel/finance-contracts/runtime-port"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"
import { readDepartureProfitabilityReport } from "./departure-profitability-runtime.js"
import type { AvailabilitySlot } from "./schema.js"
import {
  type BookingRow,
  derivePaidAmountCents,
  loadSlotBookingRows,
} from "./service-allocation-manifest-queries.js"
import { getSlotById } from "./service-core.js"
import {
  type DepartureCapacityCounters,
  getDepartureCapacityCounters,
} from "./service-departure-capacity.js"
import {
  type DepartureIssue,
  evaluateDepartureIssues,
  loadDepartureIssueSubjects,
} from "./service-departure-issues.js"

/** Slot + Product Version identity — what this departure *is*. */
export interface DepartureIdentity {
  id: string
  productId: string
  /**
   * The immutable Product Version this departure was materialized from. Null
   * on legacy rows and on products that were never published (#4032).
   */
  productVersionId: string | null
  itineraryId: string | null
  optionId: string | null
  facilityId: string | null
  status: AvailabilitySlot["status"]
  dateLocal: string
  startsAt: string
  endsAt: string | null
  timezone: string
  notes: string | null
}

export interface DepartureBookingQuantities {
  /** Bookings with a live allocation and a live booking status. */
  count: number
  byStatus: Record<string, number>
  /** `Σ bookings.pax` — what was sold. */
  expectedPax: number
  /**
   * Currency the sell/settlement totals are quoted in, or `null` when the
   * departure's bookings disagree. Amounts are never summed across currencies.
   */
  currency: string | null
  /** `Σ sell_amount_cents`, or `null` when the currency is mixed. */
  soldAmountCents: number | null
  /** `Σ derivePaidAmountCents(booking)`, or `null` when the currency is mixed. */
  paidAmountCents: number | null
  /** `soldAmountCents - paidAmountCents`, or `null` when the currency is mixed. */
  outstandingAmountCents: number | null
}

export interface DepartureExtrasRollup {
  /** Extras offered on this departure's product. */
  offered: number
  /** Extras at least one traveler selected. */
  withSelections: number
  /** Σ selected travelers across all extras (one traveler can appear twice). */
  selectedTravelerCount: number
  /** Σ units the guide has to carry. */
  totalQuantity: number
  /** Σ selections still awaiting on-trip collection. */
  outstandingCollectionCount: number
  /** Extras where every selected traveler is marked fulfilled. */
  fulfilledExtraCount: number
}

/** One currency's P&L line, exactly as Finance reported it. */
export interface DepartureFinanceLine {
  currency: string
  revenueCents: number
  actualCostCents: number
  plannedCostCents: number
  profitCents: number
  marginPercent: number | null
  varianceCents: number
}

export interface DepartureFinanceHeadline {
  /** Per-currency lines. Never summed across currencies. */
  perCurrency: DepartureFinanceLine[]
  /** Finance's single-currency rollup in the operator's accounting base. */
  base: DepartureFinanceLine | null
  /** Source currencies Finance could not convert into the base rollup. */
  unconvertibleCurrencies: string[]
}

export interface DepartureOperationsReadiness {
  issues: DepartureIssue[]
  criticalCount: number
  warningCount: number
  /** True when nothing needs the operator's attention. */
  clear: boolean
}

export interface DepartureSummary {
  departure: DepartureIdentity
  capacity: DepartureCapacityCounters
  bookings: DepartureBookingQuantities
  travelers: DepartureCapacityCounters["travelers"]
  allocation: DepartureCapacityCounters["resources"]
  operations: DepartureOperationsReadiness
  /** `null` when the Extras module is not deployed or the read failed. */
  extras: DepartureExtrasRollup | null
  /** `null` when no Finance provider is bound in this deployment. */
  finance: DepartureFinanceHeadline | null
}

export interface GetDepartureSummaryOptions {
  /** Evaluation instant; injectable so a suite can age a hold deterministically. */
  now?: Date
}

/**
 * Compose one departure's summary. Returns `null` when the slot does not
 * exist, matching the other per-slot read models in this package.
 */
export async function getDepartureSummary(
  db: PostgresJsDatabase,
  slotId: string,
  options: GetDepartureSummaryOptions = {},
): Promise<DepartureSummary | null> {
  const now = options.now ?? new Date()

  const slot = await getSlotById(db, slotId)

  if (!slot) return null

  const counters = await getDepartureCapacityCounters(db, slotId, now)
  if (!counters) return null

  const [subjects, bookingRows, extras, profitability] = await Promise.all([
    loadDepartureIssueSubjects(db, slotId, now),
    loadSlotBookingRows(db, slotId),
    loadExtrasRollup(db, slotId),
    readDepartureProfitabilityReport(db, { departureId: slotId }),
  ])

  const issues = evaluateDepartureIssues({
    slotId,
    productVersionId: slot.productVersionId,
    counters,
    ...subjects,
  })

  return {
    departure: {
      id: slot.id,
      productId: slot.productId,
      productVersionId: slot.productVersionId,
      itineraryId: slot.itineraryId,
      optionId: slot.optionId,
      facilityId: slot.facilityId,
      status: slot.status,
      dateLocal: slot.dateLocal,
      startsAt: slot.startsAt.toISOString(),
      endsAt: slot.endsAt ? slot.endsAt.toISOString() : null,
      timezone: slot.timezone,
      notes: slot.notes,
    },
    capacity: counters,
    bookings: rollUpBookingQuantities(counters, bookingRows),
    travelers: counters.travelers,
    allocation: counters.resources,
    operations: {
      issues,
      criticalCount: issues.filter((issue) => issue.severity === "critical").length,
      warningCount: issues.filter((issue) => issue.severity === "warning").length,
      clear: issues.length === 0,
    },
    extras,
    finance: profitability ? rollUpFinance(slotId, profitability) : null,
  }
}

/**
 * Booking money for the departure. Uses `derivePaidAmountCents` — the same
 * settlement rule the allocation chips colour themselves with — rather than
 * inventing a second answer to "how much has this booking actually paid".
 *
 * Totals collapse to `null` the moment the departure's bookings disagree on
 * currency, because there is no honest single number to show; the per-booking
 * rows in the manifest still carry their own.
 */
function rollUpBookingQuantities(
  counters: DepartureCapacityCounters,
  bookingRows: readonly BookingRow[],
): DepartureBookingQuantities {
  const currencies = new Set(
    bookingRows.flatMap((row) => (row.sell_currency ? [row.sell_currency] : [])),
  )
  const currency = currencies.size === 1 ? ([...currencies][0] ?? null) : null

  if (!currency) {
    return {
      count: counters.bookings.active,
      byStatus: counters.bookings.byStatus,
      expectedPax: counters.bookings.expectedPax,
      currency: null,
      soldAmountCents: null,
      paidAmountCents: null,
      outstandingAmountCents: null,
    }
  }

  const soldAmountCents = bookingRows.reduce((sum, row) => sum + (row.sell_amount_cents ?? 0), 0)
  const paidAmountCents = bookingRows.reduce((sum, row) => sum + derivePaidAmountCents(row), 0)

  return {
    count: counters.bookings.active,
    byStatus: counters.bookings.byStatus,
    expectedPax: counters.bookings.expectedPax,
    currency,
    soldAmountCents,
    paidAmountCents,
    outstandingAmountCents: soldAmountCents - paidAmountCents,
  }
}

/**
 * Reduce Finance's departure report to this departure's lines. Finance already
 * filtered by `departureId`, but the report is a list shape shared with the
 * range report, so the id filter is re-applied rather than assumed.
 */
function rollUpFinance(
  slotId: string,
  report: FinanceDepartureProfitabilityReport,
): DepartureFinanceHeadline {
  const toLine = (row: FinanceDepartureProfitabilityRow): DepartureFinanceLine => ({
    currency: row.currency,
    revenueCents: row.revenueCents,
    actualCostCents: row.actualCostCents,
    plannedCostCents: row.plannedCostCents,
    profitCents: row.profitCents,
    marginPercent: row.marginPercent,
    varianceCents: row.varianceCents,
  })

  const baseRows = (report.base?.rows ?? []).filter((row) => row.departureId === slotId)

  return {
    perCurrency: report.rows.filter((row) => row.departureId === slotId).map(toLine),
    base: baseRows[0] ? toLine(baseRows[0]) : null,
    unconvertibleCurrencies: report.base?.unconvertibleCurrencies ?? [],
  }
}

/**
 * Extras headline, read from Bookings' own slot extras manifest so the numbers
 * are the ones the extras screen shows.
 *
 * Imported dynamically: `@voyant-travel/bookings/extras` is a module barrel
 * that also carries the extras route bundle, and a departure summary must not
 * drag Hono routes into every static import closure that touches this service.
 * The same `await import` is what lets a deployment without the Extras tables
 * report `null` instead of failing the whole summary.
 */
async function loadExtrasRollup(
  db: PostgresJsDatabase,
  slotId: string,
): Promise<DepartureExtrasRollup | null> {
  type ExtrasModule = typeof import("@voyant-travel/bookings/extras")
  let manifest: Awaited<ReturnType<ExtrasModule["bookingsExtrasService"]["getSlotExtraManifest"]>>
  try {
    const { bookingsExtrasService } = await import("@voyant-travel/bookings/extras")
    manifest = await bookingsExtrasService.getSlotExtraManifest(db, slotId)
  } catch {
    return null
  }
  if (manifest.status !== "ok") return null

  const summaries = manifest.data.summaries
  return {
    offered: summaries.length,
    withSelections: summaries.filter((summary) => summary.selectedTravelerCount > 0).length,
    selectedTravelerCount: summaries.reduce(
      (sum, summary) => sum + summary.selectedTravelerCount,
      0,
    ),
    totalQuantity: summaries.reduce((sum, summary) => sum + summary.totalQuantity, 0),
    outstandingCollectionCount: summaries.reduce(
      (sum, summary) => sum + summary.outstandingCollectionCount,
      0,
    ),
    fulfilledExtraCount: summaries.filter((summary) => summary.fulfillmentComplete).length,
  }
}
