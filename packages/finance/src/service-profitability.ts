// agent-quality: file-size exception -- owner: finance; existing service module stays co-located until a dedicated split preserves behavior and tests.
import { bookingItems, bookingTravelers } from "@voyant-travel/bookings/schema"
import type {
  DepartureProfitabilityQuery,
  ProductProfitabilityQuery,
  TravelerProfitabilityQuery,
} from "@voyant-travel/finance-contracts"
import { and, eq, inArray, isNotNull, isNull, ne, sql } from "drizzle-orm"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"

import { type FxMoneyInput, resolveFxMoneyBaseAmount } from "./fx-money.js"
import { type InvoiceFxOptions, resolveInvoiceFxSettingsOrDefault } from "./invoice-fx.js"
import {
  costCategories,
  invoices,
  supplierCostAllocations,
  supplierInvoiceLines,
  supplierInvoices,
} from "./schema.js"
import { executeBoundaryRows, normalizeDateOnly, sqlList } from "./service-boundary-sql.js"
import { type DeparturePlannedCost, resolveDeparturePlannedCosts } from "./service-planned-cost.js"

/**
 * FX runtime for the profitability read model. Carries the operator FX settings
 * (which name the accounting base currency, default "RON") and the exchange-rate
 * resolver used to convert legacy, un-snapshotted rows. Threaded from the finance
 * route runtime so the rollup matches how invoices were snapshotted at write time.
 */
export type ProfitabilityFxRuntime = InvoiceFxOptions

/**
 * Profitability read model (RFC §8). Computed on read, never stored. Amounts are
 * grouped **per currency** and never summed across currencies (no FX in v1).
 *
 * - Revenue  = issued customer invoices (AR), attributed to a departure by
 *   splitting each booking's invoiced total across its departures in proportion
 *   to the departures' booked sell amounts (`booking_items`). Credit notes net
 *   the revenue down.
 * - Actual cost = `supplier_cost_allocations` targeted at the departure/product.
 * - Planned cost = the frozen day-service resolver (voyant#4037) for any
 *   version-bound departure; `booking_items.totalCostAmountCents` remains a
 *   documented fallback for departures with no `product_version_id`. The two are
 *   never mixed within a departure, and which departures used the fallback is
 *   surfaced as `plannedCostCaveat` rather than silently blended.
 * - Profit = revenue − actual cost. Variance = planned − actual cost.
 *
 * Two further figures account for supplier cost that reaches no departure, and
 * are reported separately because they mean different things: `unattributed` is
 * cost someone allocated to nothing on purpose, `unallocated` is the
 * under-allocated remainder of an invoice that carries no allocation row at all.
 */

export interface ProfitabilityCostByServiceType {
  serviceType: string
  currency: string
  amountCents: number
}

export interface ProfitabilityUnattributed {
  currency: string
  amountCents: number
}

/**
 * The under-allocated remainder of recorded AP cost: a supplier invoice's total
 * minus every allocation row written against it, whatever those rows target.
 *
 * Deliberately separate from {@link ProfitabilityUnattributed}. "We decided this
 * cost belongs to no departure" (an allocation row with
 * `targetType = 'unattributed'`) and "nobody has allocated this yet" (no row at
 * all) are different operational signals, and only the second one is a backlog.
 * Together with the departure/product-targeted allocations the three figures
 * partition an invoice's total.
 */
export interface ProfitabilityUnallocated {
  currency: string
  amountCents: number
}

/**
 * Planned-cost provenance for the report (voyant#4037). Version-bound departures
 * take the frozen day-service resolver; the rest fall back to `booking_items`.
 * This names the fallback departures explicitly so a consumer can show the
 * report is only as complete as its cost sources, instead of trusting a blended
 * figure. `versionResolvedCount` is how many departures the resolver costed;
 * `linesMissingCostBlock` counts resolved lines whose day service carried no
 * declared cost block (a `missing_planned_cost` signal).
 */
export interface ProfitabilityPlannedCostCaveat {
  fallbackDepartureIds: string[]
  versionResolvedCount: number
  linesMissingCostBlock: number
}

export interface DepartureProfitabilityRow {
  departureId: string
  departureLabel: string | null
  productId: string | null
  productName: string | null
  departureDate: string | null
  currency: string
  revenueCents: number
  actualCostCents: number
  plannedCostCents: number
  profitCents: number
  marginPercent: number | null
  varianceCents: number
}

export interface DepartureProfitabilityBaseRollup {
  currency: string
  rows: DepartureProfitabilityRow[]
  costByServiceType: ProfitabilityCostByServiceType[]
  unattributedCents: number
  unallocatedCents: number
  /** Source currencies with no resolvable FX rate — excluded from the rollup. */
  unconvertibleCurrencies: string[]
}

export interface DepartureProfitabilityReport {
  rows: DepartureProfitabilityRow[]
  costByServiceType: ProfitabilityCostByServiceType[]
  unattributed: ProfitabilityUnattributed[]
  unallocated: ProfitabilityUnallocated[]
  plannedCostCaveat?: ProfitabilityPlannedCostCaveat
  base?: DepartureProfitabilityBaseRollup
}

export interface ProductProfitabilityRow {
  productId: string
  productName: string | null
  currency: string
  departureCount: number
  revenueCents: number
  actualCostCents: number
  plannedCostCents: number
  profitCents: number
  marginPercent: number | null
  varianceCents: number
}

export interface ProductProfitabilityBaseRollup {
  currency: string
  rows: ProductProfitabilityRow[]
  costByServiceType: ProfitabilityCostByServiceType[]
  unattributedCents: number
  unallocatedCents: number
  unconvertibleCurrencies: string[]
}

export interface ProductProfitabilityReport {
  rows: ProductProfitabilityRow[]
  costByServiceType: ProfitabilityCostByServiceType[]
  unattributed: ProfitabilityUnattributed[]
  unallocated: ProfitabilityUnallocated[]
  plannedCostCaveat?: ProfitabilityPlannedCostCaveat
  base?: ProductProfitabilityBaseRollup
}

interface CurrencyTotals {
  revenue: number
  actual: number
  planned: number
}

interface DepartureAcc {
  departureId: string
  productId: string | null
  productName: string | null
  departureLabel: string | null
  departureDate: string | null
  byCurrency: Map<string, CurrencyTotals>
  /**
   * Accounting-base accumulators (end-to-end FX §). `base` holds amounts that
   * were snapshotted in the accounting base at the transaction-date rate; they
   * are summed verbatim — no re-conversion. `residual` holds original-currency
   * amounts from rows with no base snapshot (legacy/forward-only), converted once
   * the per-currency fallback rates are known.
   */
  base: CurrencyTotals
  residual: Map<string, CurrencyTotals>
}

/** Snapshot/residual split for the aggregate (non-departure) cost breakdowns. */
interface BaseSplit {
  snapshotBase: number
  residual: Map<string, number>
}

const num = (value: unknown): number => Number(value ?? 0)

function bucket(map: Map<string, CurrencyTotals>, currency: string): CurrencyTotals {
  let entry = map.get(currency)
  if (!entry) {
    entry = { revenue: 0, actual: 0, planned: 0 }
    map.set(currency, entry)
  }
  return entry
}

function newBaseSplit(): BaseSplit {
  return { snapshotBase: 0, residual: new Map() }
}

function addResidual(map: Map<string, number>, currency: string, amount: number): void {
  if (amount === 0) return
  map.set(currency, (map.get(currency) ?? 0) + amount)
}

/** Resolve a base split to a single accounting-base figure via the rate map. */
function resolveBaseSplit(
  split: BaseSplit,
  rates: Map<string, number>,
  unconvertible: Set<string>,
): number {
  let total = split.snapshotBase
  for (const [currency, amount] of split.residual) {
    const rate = rates.get(currency)
    if (rate == null) {
      if (amount !== 0) unconvertible.add(currency)
      continue
    }
    total += amount * rate
  }
  return total
}

function margin(profitCents: number, revenueCents: number): number | null {
  if (revenueCents <= 0) return null
  return Math.round((profitCents / revenueCents) * 1000) / 10
}

interface LoadedAccumulators {
  baseCurrency: string
  departures: Map<string, DepartureAcc>
  productActualCost: Array<{ productId: string; currency: string; amountCents: number }>
  productActualCostBase: Map<string, BaseSplit>
  costByServiceType: ProfitabilityCostByServiceType[]
  costByServiceTypeBase: Map<string, BaseSplit>
  unattributed: ProfitabilityUnattributed[]
  unattributedBase: BaseSplit
  unallocated: ProfitabilityUnallocated[]
  unallocatedBase: BaseSplit
  plannedCostCaveat: ProfitabilityPlannedCostCaveat
}

/**
 * Shared loader: runs the source queries once and assembles a per-departure
 * accumulator plus the cost-breakdown aggregates that both reports surface.
 *
 * Each money source carries TWO base figures: the sum of recorded base snapshots
 * (already in `baseCurrency`, summed verbatim) and the original-currency residual
 * from rows lacking a snapshot (converted later via fallback rates). This keeps
 * the rollup faithful to the rate that was in effect when each invoice was
 * issued, instead of re-valuing everything at the latest rate.
 */
async function loadDepartureAccumulators(
  db: PostgresJsDatabase,
  baseCurrency: string,
): Promise<LoadedAccumulators> {
  const base = baseCurrency
  // Net sign for AR (credit notes subtract). Reused for total + base + residual.
  // agent-quality: raw-sql reviewed -- owner: finance; dynamic SQL interpolation uses Drizzle parameter binding or vetted SQL identifiers.
  const arSign = sql`case when ${invoices.invoiceType} = 'credit_note' then -1 else 1 end`
  // True when an invoice/allocation has a usable base snapshot in the accounting base.
  // agent-quality: raw-sql reviewed -- owner: finance; dynamic SQL interpolation uses Drizzle parameter binding or vetted SQL identifiers.
  const invSnapshotted = sql`${invoices.baseCurrency} = ${base} and ${invoices.baseTotalCents} is not null`
  // agent-quality: raw-sql reviewed -- owner: finance; dynamic SQL interpolation uses Drizzle parameter binding or vetted SQL identifiers.
  const allocSnapshotted = sql`${supplierInvoices.baseCurrency} = ${base} and ${supplierCostAllocations.baseAmountCents} is not null`
  // True when a supplier invoice carries a usable base snapshot AND a non-zero
  // total, so a part of it (a line, or the unallocated remainder) can be
  // pro-rated into the accounting base at the invoice's own issue-date rate.
  // agent-quality: raw-sql reviewed -- owner: finance; dynamic SQL interpolation uses Drizzle parameter binding or vetted SQL identifiers.
  const apProRatable = sql`${supplierInvoices.baseCurrency} = ${base} and ${supplierInvoices.baseTotalCents} is not null and ${supplierInvoices.totalCents} <> 0`
  // Under-allocated remainder per invoice: the total minus every allocation row
  // against it, regardless of what those rows target. `greatest(…, 0)` guards
  // the one path that can outrun the write-time over-allocation check — editing
  // an invoice's header total downwards does not re-validate its allocations.
  // agent-quality: raw-sql reviewed -- owner: finance; dynamic SQL interpolation uses Drizzle parameter binding or vetted SQL identifiers.
  const allocatedCents = sql`coalesce((select sum(${supplierCostAllocations.amountCents}) from ${supplierCostAllocations} where ${supplierCostAllocations.supplierInvoiceId} = ${supplierInvoices.id}), 0)`
  // agent-quality: raw-sql reviewed -- owner: finance; dynamic SQL interpolation uses Drizzle parameter binding or vetted SQL identifiers.
  const remainderCents = sql`greatest(${supplierInvoices.totalCents} - ${allocatedCents}, 0)`

  const [
    itemRows,
    invoiceRows,
    departureCostRows,
    productCostRows,
    serviceTypeRows,
    unattributedRows,
    unallocatedRows,
  ] = await Promise.all([
    // Booked sell + planned cost per (departure, booking), with display snapshots.
    db
      .select({
        departureId: bookingItems.availabilitySlotId,
        bookingId: bookingItems.bookingId,
        productId: sql<string | null>`max(${bookingItems.productId})`,
        productName: sql<string | null>`max(${bookingItems.productNameSnapshot})`,
        departureLabel: sql<string | null>`max(${bookingItems.departureLabelSnapshot})`,
        departureDate: sql<
          string | null
        >`to_char(min(${bookingItems.startsAt}) at time zone 'UTC', 'YYYY-MM-DD')`,
        sellCurrency: bookingItems.sellCurrency,
        sellCents: sql<number>`coalesce(sum(${bookingItems.totalSellAmountCents}), 0)::bigint`,
        costCurrency: bookingItems.costCurrency,
        plannedCostCents: sql<number>`coalesce(sum(${bookingItems.totalCostAmountCents}), 0)::bigint`,
      })
      .from(bookingItems)
      .where(isNotNull(bookingItems.availabilitySlotId))
      .groupBy(
        bookingItems.availabilitySlotId,
        bookingItems.bookingId,
        bookingItems.sellCurrency,
        bookingItems.costCurrency,
      ),
    // Invoiced AR per (booking, currency). Credit notes net down; proforma/draft/void excluded.
    // `baseTotalCents` sums recorded base snapshots; `residualTotalCents` is the
    // original-currency remainder from invoices without one.
    db
      .select({
        bookingId: invoices.bookingId,
        currency: invoices.currency,
        totalCents: sql<number>`coalesce(sum(${arSign} * ${invoices.totalCents}), 0)::bigint`,
        baseTotalCents: sql<number>`coalesce(sum(${arSign} * (case when ${invSnapshotted} then ${invoices.baseTotalCents} else 0 end)), 0)::bigint`,
        residualTotalCents: sql<number>`coalesce(sum(${arSign} * (case when ${invSnapshotted} then 0 else ${invoices.totalCents} end)), 0)::bigint`,
      })
      .from(invoices)
      .where(
        and(
          ne(invoices.status, "void"),
          ne(invoices.status, "draft"),
          ne(invoices.invoiceType, "proforma"),
        ),
      )
      .groupBy(invoices.bookingId, invoices.currency),
    // Actual cost: departure-targeted allocations per (departure, currency).
    db
      .select({
        departureId: supplierCostAllocations.departureId,
        currency: supplierInvoices.currency,
        amountCents: sql<number>`coalesce(sum(${supplierCostAllocations.amountCents}), 0)::bigint`,
        baseAmountCents: sql<number>`coalesce(sum(case when ${allocSnapshotted} then ${supplierCostAllocations.baseAmountCents} else 0 end), 0)::bigint`,
        residualAmountCents: sql<number>`coalesce(sum(case when ${allocSnapshotted} then 0 else ${supplierCostAllocations.amountCents} end), 0)::bigint`,
      })
      .from(supplierCostAllocations)
      .innerJoin(
        supplierInvoices,
        eq(supplierCostAllocations.supplierInvoiceId, supplierInvoices.id),
      )
      .where(
        and(
          eq(supplierCostAllocations.targetType, "departure"),
          isNotNull(supplierCostAllocations.departureId),
          ne(supplierInvoices.status, "void"),
          isNull(supplierInvoices.deletedAt),
        ),
      )
      .groupBy(supplierCostAllocations.departureId, supplierInvoices.currency),
    // Actual cost: product-targeted allocations per (product, currency) — not tied to a departure.
    db
      .select({
        productId: supplierCostAllocations.productId,
        currency: supplierInvoices.currency,
        amountCents: sql<number>`coalesce(sum(${supplierCostAllocations.amountCents}), 0)::bigint`,
        baseAmountCents: sql<number>`coalesce(sum(case when ${allocSnapshotted} then ${supplierCostAllocations.baseAmountCents} else 0 end), 0)::bigint`,
        residualAmountCents: sql<number>`coalesce(sum(case when ${allocSnapshotted} then 0 else ${supplierCostAllocations.amountCents} end), 0)::bigint`,
      })
      .from(supplierCostAllocations)
      .innerJoin(
        supplierInvoices,
        eq(supplierCostAllocations.supplierInvoiceId, supplierInvoices.id),
      )
      .where(
        and(
          eq(supplierCostAllocations.targetType, "product"),
          isNotNull(supplierCostAllocations.productId),
          ne(supplierInvoices.status, "void"),
          isNull(supplierInvoices.deletedAt),
        ),
      )
      .groupBy(supplierCostAllocations.productId, supplierInvoices.currency),
    // Cost breakdown by configurable cost category. Summed from supplier-invoice
    // LINE totals (not allocations) so categorizing a line shows up immediately,
    // even before the cost is allocated to a departure. Lines without a category
    // fall to "Uncategorized". Base = line total pro-rated by the invoice's
    // snapshotted base/total ratio.
    db
      .select({
        serviceType: sql<string>`coalesce(${costCategories.name}, 'Uncategorized')`,
        currency: supplierInvoices.currency,
        amountCents: sql<number>`coalesce(sum(${supplierInvoiceLines.totalAmountCents}), 0)::bigint`,
        baseAmountCents: sql<number>`coalesce(sum(case when ${apProRatable} then round(${supplierInvoiceLines.totalAmountCents}::numeric * ${supplierInvoices.baseTotalCents} / ${supplierInvoices.totalCents}) else 0 end), 0)::bigint`,
        residualAmountCents: sql<number>`coalesce(sum(case when ${apProRatable} then 0 else ${supplierInvoiceLines.totalAmountCents} end), 0)::bigint`,
      })
      .from(supplierInvoiceLines)
      .innerJoin(supplierInvoices, eq(supplierInvoiceLines.supplierInvoiceId, supplierInvoices.id))
      .leftJoin(costCategories, eq(supplierInvoiceLines.costCategoryId, costCategories.id))
      .where(and(ne(supplierInvoices.status, "void"), isNull(supplierInvoices.deletedAt)))
      // agent-quality: raw-sql reviewed -- owner: finance; dynamic SQL interpolation uses Drizzle parameter binding or vetted SQL identifiers.
      .groupBy(sql`coalesce(${costCategories.name}, 'Uncategorized')`, supplierInvoices.currency),
    // Recorded-but-unattributed cost — appears in AP totals, excluded from P&L.
    db
      .select({
        currency: supplierInvoices.currency,
        amountCents: sql<number>`coalesce(sum(${supplierCostAllocations.amountCents}), 0)::bigint`,
        baseAmountCents: sql<number>`coalesce(sum(case when ${allocSnapshotted} then ${supplierCostAllocations.baseAmountCents} else 0 end), 0)::bigint`,
        residualAmountCents: sql<number>`coalesce(sum(case when ${allocSnapshotted} then 0 else ${supplierCostAllocations.amountCents} end), 0)::bigint`,
      })
      .from(supplierCostAllocations)
      .innerJoin(
        supplierInvoices,
        eq(supplierCostAllocations.supplierInvoiceId, supplierInvoices.id),
      )
      .where(
        and(
          eq(supplierCostAllocations.targetType, "unattributed"),
          ne(supplierInvoices.status, "void"),
          isNull(supplierInvoices.deletedAt),
        ),
      )
      .groupBy(supplierInvoices.currency),
    // Under-allocated remainder — recorded AP cost that carries NO allocation
    // row at all. Invariant §6.1(4) permits under-allocation and stores nothing
    // for the leftover, so it exists only as arithmetic on the invoice: without
    // this query the shortfall is invisible and silently inflates margin.
    //
    // One formula covers both allocation modes. In whole-invoice mode the cap is
    // the invoice total; in per-line mode it is each line's total, and since
    // `validateAllocations` holds every line at or under its own total,
    // Σ(lineTotal − Σalloc) collapses to (Σ lineTotal − Σ alloc). Anchoring on
    // the header total additionally catches a header that outruns its lines.
    //
    // Base treatment mirrors the cost-by-category query: the remainder is
    // pro-rated by the invoice's snapshotted base/total ratio (its issue-date
    // rate), never re-valued at today's rate; invoices without a snapshot fall
    // to the residual bucket and convert once via the fallback rate.
    db
      .select({
        currency: supplierInvoices.currency,
        amountCents: sql<number>`coalesce(sum(${remainderCents}), 0)::bigint`,
        baseAmountCents: sql<number>`coalesce(sum(case when ${apProRatable} then round(${remainderCents}::numeric * ${supplierInvoices.baseTotalCents} / ${supplierInvoices.totalCents}) else 0 end), 0)::bigint`,
        residualAmountCents: sql<number>`coalesce(sum(case when ${apProRatable} then 0 else ${remainderCents} end), 0)::bigint`,
      })
      .from(supplierInvoices)
      .where(and(ne(supplierInvoices.status, "void"), isNull(supplierInvoices.deletedAt)))
      .groupBy(supplierInvoices.currency),
  ])

  const departures = new Map<string, DepartureAcc>()
  const ensure = (departureId: string): DepartureAcc => {
    let acc = departures.get(departureId)
    if (!acc) {
      acc = {
        departureId,
        productId: null,
        productName: null,
        departureLabel: null,
        departureDate: null,
        byCurrency: new Map(),
        base: { revenue: 0, actual: 0, planned: 0 },
        residual: new Map(),
      }
      departures.set(departureId, acc)
    }
    return acc
  }
  const ensureResidual = (acc: DepartureAcc, currency: string): CurrencyTotals => {
    let entry = acc.residual.get(currency)
    if (!entry) {
      entry = { revenue: 0, actual: 0, planned: 0 }
      acc.residual.set(currency, entry)
    }
    return entry
  }

  // Booking totals + per-departure sell, for proportional revenue attribution.
  const bookingTotalSell = new Map<string, number>()
  const bookingSlotSell = new Map<string, Array<{ departureId: string; sellCents: number }>>()

  // booking_items planned cost, stashed per (departure, currency) rather than
  // added to the accumulator here: the source switch below decides, per
  // departure, whether the frozen resolver or this fallback wins (voyant#4037).
  const bookingItemsPlanned = new Map<string, Map<string, number>>()
  const stashBookingItemsPlanned = (departureId: string, currency: string, cents: number): void => {
    let byCurrency = bookingItemsPlanned.get(departureId)
    if (!byCurrency) {
      byCurrency = new Map()
      bookingItemsPlanned.set(departureId, byCurrency)
    }
    byCurrency.set(currency, (byCurrency.get(currency) ?? 0) + cents)
  }

  for (const row of itemRows) {
    const departureId = row.departureId
    if (!departureId) continue
    const acc = ensure(departureId)
    acc.productId ??= row.productId
    acc.productName ??= row.productName
    acc.departureLabel ??= row.departureLabel
    acc.departureDate ??= row.departureDate

    const sellCents = num(row.sellCents)
    const plannedCost = num(row.plannedCostCents)
    if (row.costCurrency && plannedCost !== 0) {
      stashBookingItemsPlanned(departureId, row.costCurrency, plannedCost)
    }

    bookingTotalSell.set(row.bookingId, (bookingTotalSell.get(row.bookingId) ?? 0) + sellCents)
    const slots = bookingSlotSell.get(row.bookingId) ?? []
    slots.push({ departureId, sellCents })
    bookingSlotSell.set(row.bookingId, slots)
  }

  // Attribute invoiced AR to departures proportionally by sell amount. Bookings
  // with zero sell split equally across their distinct departures.
  interface InvoiceAcc {
    currency: string
    totalCents: number
    baseTotalCents: number
    residualTotalCents: number
  }
  const invoicesByBooking = new Map<string, InvoiceAcc[]>()
  for (const row of invoiceRows) {
    const list = invoicesByBooking.get(row.bookingId) ?? []
    list.push({
      currency: row.currency,
      totalCents: num(row.totalCents),
      baseTotalCents: num(row.baseTotalCents),
      residualTotalCents: num(row.residualTotalCents),
    })
    invoicesByBooking.set(row.bookingId, list)
  }

  for (const [bookingId, invoiceList] of invoicesByBooking) {
    const slots = bookingSlotSell.get(bookingId)
    if (!slots || slots.length === 0) continue // invoice for a booking with no slotted items → not departure-attributable
    const totalSell = bookingTotalSell.get(bookingId) ?? 0
    for (const slot of slots) {
      const ratio = totalSell > 0 ? slot.sellCents / totalSell : 1 / slots.length
      const acc = ensure(slot.departureId)
      for (const inv of invoiceList) {
        bucket(acc.byCurrency, inv.currency).revenue += inv.totalCents * ratio
        acc.base.revenue += inv.baseTotalCents * ratio
        if (inv.residualTotalCents !== 0) {
          ensureResidual(acc, inv.currency).revenue += inv.residualTotalCents * ratio
        }
      }
    }
  }

  for (const row of departureCostRows) {
    if (!row.departureId) continue
    const acc = ensure(row.departureId)
    bucket(acc.byCurrency, row.currency).actual += num(row.amountCents)
    acc.base.actual += num(row.baseAmountCents)
    ensureResidual(acc, row.currency).actual += num(row.residualAmountCents)
  }

  // Resolve friendly labels from availability_slots (+ product name) for every
  // departure — fills cost-only departures that have no booking-item snapshot.
  const departureIds = [...departures.keys()]
  if (departureIds.length > 0) {
    const slotRows = await executeBoundaryRows<{
      id: string
      date_local: Date | string
      product_id: string | null
      product_name: string | null
    }>(
      db,
      // agent-quality: raw-sql reviewed -- owner: finance; Availability/Product are read-only profitability label sources and ids are parameter-bound.
      sql`
        SELECT avs.id, avs.date_local, avs.product_id, p.name AS product_name
        FROM availability_slots avs
        LEFT JOIN products p ON avs.product_id = p.id
        WHERE avs.id IN (${sqlList(departureIds)})
      `,
    )
    for (const slot of slotRows) {
      const acc = departures.get(slot.id)
      if (!acc) continue
      const dateLocal = normalizeDateOnly(slot.date_local)
      acc.departureLabel ??= dateLocal
      acc.departureDate ??= dateLocal
      acc.productId ??= slot.product_id
      acc.productName ??= slot.product_name
    }
  }

  // Planned-cost source switch (voyant#4037). A departure bound to a Product
  // Version takes the frozen day-service resolver — the whole point of the
  // tracer; every other departure keeps its stashed `booking_items` figure as a
  // documented fallback. Sources are never mixed within a departure. The
  // resolver fires no cross-module query when nothing is version-bound.
  const versionResolved = await resolveDeparturePlannedCosts(db, departureIds)
  const plannedCostCaveat: ProfitabilityPlannedCostCaveat = {
    fallbackDepartureIds: [],
    versionResolvedCount: 0,
    linesMissingCostBlock: 0,
  }
  const addPlanned = (acc: DepartureAcc, currency: string, cents: number): void => {
    if (cents === 0) return
    bucket(acc.byCurrency, currency).planned += cents
    // Planned cost is a budget figure with no recorded FX, so it always routes
    // through the fallback conversion (latest rate for that currency).
    ensureResidual(acc, currency).planned += cents
  }
  for (const departureId of departureIds) {
    const acc = departures.get(departureId)
    if (!acc) continue
    const resolved: DeparturePlannedCost | undefined = versionResolved.get(departureId)
    if (resolved) {
      // Version-bound: authoritative, even when partial. A missing declared
      // block leaves that line uncosted and is reported, not back-filled from
      // booking_items (which would silently mix sources).
      plannedCostCaveat.versionResolvedCount += 1
      plannedCostCaveat.linesMissingCostBlock += resolved.linesMissingCostBlock
      for (const [currency, cents] of resolved.byCurrency) addPlanned(acc, currency, cents)
    } else {
      const stash = bookingItemsPlanned.get(departureId)
      if (stash) {
        for (const [currency, cents] of stash) addPlanned(acc, currency, cents)
        plannedCostCaveat.fallbackDepartureIds.push(departureId)
      }
    }
  }

  const productActualCost: Array<{ productId: string; currency: string; amountCents: number }> = []
  const productActualCostBase = new Map<string, BaseSplit>()
  for (const row of productCostRows) {
    if (!row.productId) continue
    productActualCost.push({
      productId: row.productId,
      currency: row.currency,
      amountCents: num(row.amountCents),
    })
    let split = productActualCostBase.get(row.productId)
    if (!split) {
      split = newBaseSplit()
      productActualCostBase.set(row.productId, split)
    }
    split.snapshotBase += num(row.baseAmountCents)
    addResidual(split.residual, row.currency, num(row.residualAmountCents))
  }

  const costByServiceType: ProfitabilityCostByServiceType[] = []
  const costByServiceTypeBase = new Map<string, BaseSplit>()
  for (const row of serviceTypeRows) {
    const amountCents = num(row.amountCents)
    if (amountCents !== 0) {
      costByServiceType.push({ serviceType: row.serviceType, currency: row.currency, amountCents })
    }
    let split = costByServiceTypeBase.get(row.serviceType)
    if (!split) {
      split = newBaseSplit()
      costByServiceTypeBase.set(row.serviceType, split)
    }
    split.snapshotBase += num(row.baseAmountCents)
    addResidual(split.residual, row.currency, num(row.residualAmountCents))
  }

  const unattributed: ProfitabilityUnattributed[] = []
  const unattributedBase = newBaseSplit()
  for (const row of unattributedRows) {
    const amountCents = num(row.amountCents)
    if (amountCents !== 0) unattributed.push({ currency: row.currency, amountCents })
    unattributedBase.snapshotBase += num(row.baseAmountCents)
    addResidual(unattributedBase.residual, row.currency, num(row.residualAmountCents))
  }

  const unallocated: ProfitabilityUnallocated[] = []
  const unallocatedBase = newBaseSplit()
  for (const row of unallocatedRows) {
    const amountCents = num(row.amountCents)
    if (amountCents !== 0) unallocated.push({ currency: row.currency, amountCents })
    unallocatedBase.snapshotBase += num(row.baseAmountCents)
    addResidual(unallocatedBase.residual, row.currency, num(row.residualAmountCents))
  }

  return {
    baseCurrency: base,
    departures,
    productActualCost,
    productActualCostBase,
    costByServiceType,
    costByServiceTypeBase,
    unattributed,
    unattributedBase,
    unallocated,
    unallocatedBase,
    plannedCostCaveat,
  }
}

function withinDateRange(date: string | null, from?: string, to?: string): boolean {
  if (!from && !to) return true
  if (!date) return false
  if (from && date < from) return false
  if (to && date > to) return false
  return true
}

export async function getDepartureProfitability(
  db: PostgresJsDatabase,
  query: DepartureProfitabilityQuery,
  options: ProfitabilityFxRuntime = {},
): Promise<DepartureProfitabilityReport> {
  const baseCurrency = (await resolveInvoiceFxSettingsOrDefault(db, options)).baseCurrency
  const loaded = await loadDepartureAccumulators(db, baseCurrency)
  const {
    departures,
    costByServiceType,
    costByServiceTypeBase,
    unattributed,
    unattributedBase,
    unallocated,
    unallocatedBase,
    plannedCostCaveat,
  } = loaded

  const rows: DepartureProfitabilityRow[] = []
  const filtered: DepartureAcc[] = []
  for (const acc of departures.values()) {
    if (query.departureId && acc.departureId !== query.departureId) continue
    if (query.productId && acc.productId !== query.productId) continue
    if (!withinDateRange(acc.departureDate, query.from, query.to)) continue
    filtered.push(acc)

    for (const [currency, totals] of acc.byCurrency) {
      if (query.currency && currency !== query.currency) continue
      const revenueCents = Math.round(totals.revenue)
      const actualCostCents = Math.round(totals.actual)
      const plannedCostCents = Math.round(totals.planned)
      const profitCents = revenueCents - actualCostCents
      rows.push({
        departureId: acc.departureId,
        departureLabel: acc.departureLabel,
        productId: acc.productId,
        productName: acc.productName,
        departureDate: acc.departureDate,
        currency,
        revenueCents,
        actualCostCents,
        plannedCostCents,
        profitCents,
        marginPercent: margin(profitCents, revenueCents),
        varianceCents: plannedCostCents - actualCostCents,
      })
    }
  }

  rows.sort(
    (a, b) =>
      (a.departureDate ?? "").localeCompare(b.departureDate ?? "") ||
      a.departureId.localeCompare(b.departureId) ||
      a.currency.localeCompare(b.currency),
  )

  // Accounting-base rollup. Always present and computed in the operator base
  // currency: snapshots are summed verbatim, only legacy residuals are converted.
  const residualCurrencies = collectResidualCurrencies(
    filtered.flatMap((acc) => [...acc.residual.keys()]),
    costByServiceTypeBase,
    unattributedBase,
    unallocatedBase,
  )
  const { rates, unconvertible } = await buildBaseRates(
    db,
    residualCurrencies,
    baseCurrency,
    options,
  )

  const baseRows: DepartureProfitabilityRow[] = filtered
    .map((acc) => {
      const totals = baseFromAcc(acc.base, acc.residual, rates)
      const revenueCents = Math.round(totals.revenue)
      const actualCostCents = Math.round(totals.actual)
      const plannedCostCents = Math.round(totals.planned)
      const profitCents = revenueCents - actualCostCents
      return {
        departureId: acc.departureId,
        departureLabel: acc.departureLabel,
        productId: acc.productId,
        productName: acc.productName,
        departureDate: acc.departureDate,
        currency: baseCurrency,
        revenueCents,
        actualCostCents,
        plannedCostCents,
        profitCents,
        marginPercent: margin(profitCents, revenueCents),
        varianceCents: plannedCostCents - actualCostCents,
      }
    })
    .sort(
      (a, b) =>
        (a.departureDate ?? "").localeCompare(b.departureDate ?? "") ||
        a.departureId.localeCompare(b.departureId),
    )

  return {
    rows,
    costByServiceType: filterCostByCurrency(costByServiceType, query.currency),
    unattributed: filterCostByCurrency(unattributed, query.currency),
    unallocated: filterCostByCurrency(unallocated, query.currency),
    plannedCostCaveat,
    base: {
      currency: baseCurrency,
      rows: baseRows,
      costByServiceType: baseCostByServiceType(costByServiceTypeBase, rates, baseCurrency),
      unattributedCents: Math.round(resolveBaseSplit(unattributedBase, rates, new Set())),
      unallocatedCents: Math.round(resolveBaseSplit(unallocatedBase, rates, new Set())),
      unconvertibleCurrencies: unconvertible,
    },
  }
}

export async function getProductProfitability(
  db: PostgresJsDatabase,
  query: ProductProfitabilityQuery,
  options: ProfitabilityFxRuntime = {},
): Promise<ProductProfitabilityReport> {
  const baseCurrency = (await resolveInvoiceFxSettingsOrDefault(db, options)).baseCurrency
  const loaded = await loadDepartureAccumulators(db, baseCurrency)
  const {
    departures,
    productActualCost,
    productActualCostBase,
    costByServiceType,
    costByServiceTypeBase,
    unattributed,
    unattributedBase,
    unallocated,
    unallocatedBase,
    plannedCostCaveat,
  } = loaded

  interface ProductAcc {
    productId: string
    productName: string | null
    byCurrency: Map<string, CurrencyTotals & { departures: Set<string> }>
    base: CurrencyTotals
    residual: Map<string, CurrencyTotals>
    baseDepartures: Set<string>
  }
  const products = new Map<string, ProductAcc>()
  const ensureProduct = (productId: string): ProductAcc => {
    let acc = products.get(productId)
    if (!acc) {
      acc = {
        productId,
        productName: null,
        byCurrency: new Map(),
        base: { revenue: 0, actual: 0, planned: 0 },
        residual: new Map(),
        baseDepartures: new Set(),
      }
      products.set(productId, acc)
    }
    return acc
  }
  const productBucket = (acc: ProductAcc, currency: string) => {
    let entry = acc.byCurrency.get(currency)
    if (!entry) {
      entry = { revenue: 0, actual: 0, planned: 0, departures: new Set() }
      acc.byCurrency.set(currency, entry)
    }
    return entry
  }
  const productResidual = (acc: ProductAcc, currency: string) => {
    let entry = acc.residual.get(currency)
    if (!entry) {
      entry = { revenue: 0, actual: 0, planned: 0 }
      acc.residual.set(currency, entry)
    }
    return entry
  }

  for (const dep of departures.values()) {
    if (!dep.productId) continue
    if (!withinDateRange(dep.departureDate, query.from, query.to)) continue
    const acc = ensureProduct(dep.productId)
    acc.productName ??= dep.productName
    for (const [currency, totals] of dep.byCurrency) {
      if (query.currency && currency !== query.currency) continue
      const entry = productBucket(acc, currency)
      entry.revenue += totals.revenue
      entry.actual += totals.actual
      entry.planned += totals.planned
      entry.departures.add(dep.departureId)
    }
    // Base rollup aggregates across currencies (no currency filter).
    acc.base.revenue += dep.base.revenue
    acc.base.actual += dep.base.actual
    acc.base.planned += dep.base.planned
    acc.baseDepartures.add(dep.departureId)
    for (const [currency, res] of dep.residual) {
      const entry = productResidual(acc, currency)
      entry.revenue += res.revenue
      entry.actual += res.actual
      entry.planned += res.planned
    }
  }

  // Product-level allocations (cost attributed to a product, not a departure).
  for (const row of productActualCost) {
    if (query.currency && row.currency !== query.currency) continue
    productBucket(ensureProduct(row.productId), row.currency).actual += row.amountCents
  }
  for (const [productId, split] of productActualCostBase) {
    const acc = ensureProduct(productId)
    acc.base.actual += split.snapshotBase
    for (const [currency, amount] of split.residual) {
      productResidual(acc, currency).actual += amount
    }
  }

  const rows: ProductProfitabilityRow[] = []
  for (const acc of products.values()) {
    for (const [currency, totals] of acc.byCurrency) {
      const revenueCents = Math.round(totals.revenue)
      const actualCostCents = Math.round(totals.actual)
      const plannedCostCents = Math.round(totals.planned)
      const profitCents = revenueCents - actualCostCents
      rows.push({
        productId: acc.productId,
        productName: acc.productName,
        currency,
        departureCount: totals.departures.size,
        revenueCents,
        actualCostCents,
        plannedCostCents,
        profitCents,
        marginPercent: margin(profitCents, revenueCents),
        varianceCents: plannedCostCents - actualCostCents,
      })
    }
  }

  rows.sort(
    (a, b) => a.productId.localeCompare(b.productId) || a.currency.localeCompare(b.currency),
  )

  const residualCurrencies = collectResidualCurrencies(
    [...products.values()].flatMap((acc) => [...acc.residual.keys()]),
    costByServiceTypeBase,
    unattributedBase,
    unallocatedBase,
  )
  const { rates, unconvertible } = await buildBaseRates(
    db,
    residualCurrencies,
    baseCurrency,
    options,
  )

  const baseRows: ProductProfitabilityRow[] = [...products.values()]
    .map((acc) => {
      const totals = baseFromAcc(acc.base, acc.residual, rates)
      const revenueCents = Math.round(totals.revenue)
      const actualCostCents = Math.round(totals.actual)
      const plannedCostCents = Math.round(totals.planned)
      const profitCents = revenueCents - actualCostCents
      return {
        productId: acc.productId,
        productName: acc.productName,
        currency: baseCurrency,
        departureCount: acc.baseDepartures.size,
        revenueCents,
        actualCostCents,
        plannedCostCents,
        profitCents,
        marginPercent: margin(profitCents, revenueCents),
        varianceCents: plannedCostCents - actualCostCents,
      }
    })
    .sort((a, b) => a.productId.localeCompare(b.productId))

  return {
    rows,
    costByServiceType: filterCostByCurrency(costByServiceType, query.currency),
    unattributed: filterCostByCurrency(unattributed, query.currency),
    unallocated: filterCostByCurrency(unallocated, query.currency),
    plannedCostCaveat,
    base: {
      currency: baseCurrency,
      rows: baseRows,
      costByServiceType: baseCostByServiceType(costByServiceTypeBase, rates, baseCurrency),
      unattributedCents: Math.round(resolveBaseSplit(unattributedBase, rates, new Set())),
      unallocatedCents: Math.round(resolveBaseSplit(unallocatedBase, rates, new Set())),
      unconvertibleCurrencies: unconvertible,
    },
  }
}

function filterCostByCurrency<T extends { currency: string }>(rows: T[], currency?: string): T[] {
  return currency ? rows.filter((row) => row.currency === currency) : rows
}

// ---------- per-traveller P&L (RFC §6) ----------

export interface TravelerProfitabilityRow {
  travelerId: string
  travelerName: string
  bookingId: string
  currency: string
  revenueCents: number
  actualCostCents: number
  plannedCostCents: number
  profitCents: number
  marginPercent: number | null
  varianceCents: number
}

export interface TravelerProfitabilityReport {
  departureId: string
  currency: string
  travelerCount: number
  rows: TravelerProfitabilityRow[]
}

/**
 * Derive per-traveller P&L for one departure in a single currency. Revenue is a
 * booking's departure-attributed invoiced AR split equally across that booking's
 * travellers; planned cost likewise; actual departure cost is split equally
 * across all the departure's travellers (`equal` method — `per_pax` parity).
 */
export async function getTravelerProfitability(
  db: PostgresJsDatabase,
  query: TravelerProfitabilityQuery,
): Promise<TravelerProfitabilityReport> {
  const departureId = query.departureId
  const currency = query.currency.toUpperCase()
  const empty: TravelerProfitabilityReport = { departureId, currency, travelerCount: 0, rows: [] }

  const depItemRows = await db
    .select({
      bookingId: bookingItems.bookingId,
      depSell: sql<number>`coalesce(sum(${bookingItems.totalSellAmountCents}), 0)::bigint`,
      depPlanned: sql<number>`coalesce(sum(case when ${bookingItems.costCurrency} = ${currency} then ${bookingItems.totalCostAmountCents} else 0 end), 0)::bigint`,
    })
    .from(bookingItems)
    .where(eq(bookingItems.availabilitySlotId, departureId))
    .groupBy(bookingItems.bookingId)

  const bookingIds = depItemRows.map((r) => r.bookingId)
  if (bookingIds.length === 0) return empty

  const [totalSellRows, invoiceRows, actualRows, travelerRows] = await Promise.all([
    db
      .select({
        bookingId: bookingItems.bookingId,
        totalSell: sql<number>`coalesce(sum(${bookingItems.totalSellAmountCents}), 0)::bigint`,
      })
      .from(bookingItems)
      .where(inArray(bookingItems.bookingId, bookingIds))
      .groupBy(bookingItems.bookingId),
    db
      .select({
        bookingId: invoices.bookingId,
        total: sql<number>`coalesce(sum(case when ${invoices.invoiceType} = 'credit_note' then -${invoices.totalCents} else ${invoices.totalCents} end), 0)::bigint`,
      })
      .from(invoices)
      .where(
        and(
          inArray(invoices.bookingId, bookingIds),
          eq(invoices.currency, currency),
          ne(invoices.status, "void"),
          ne(invoices.status, "draft"),
          ne(invoices.invoiceType, "proforma"),
        ),
      )
      .groupBy(invoices.bookingId),
    db
      .select({
        amount: sql<number>`coalesce(sum(${supplierCostAllocations.amountCents}), 0)::bigint`,
      })
      .from(supplierCostAllocations)
      .innerJoin(
        supplierInvoices,
        eq(supplierCostAllocations.supplierInvoiceId, supplierInvoices.id),
      )
      .where(
        and(
          eq(supplierCostAllocations.targetType, "departure"),
          eq(supplierCostAllocations.departureId, departureId),
          eq(supplierInvoices.currency, currency),
          ne(supplierInvoices.status, "void"),
          isNull(supplierInvoices.deletedAt),
        ),
      ),
    db
      .select({
        id: bookingTravelers.id,
        bookingId: bookingTravelers.bookingId,
        firstName: bookingTravelers.firstName,
        lastName: bookingTravelers.lastName,
      })
      .from(bookingTravelers)
      .where(
        and(
          inArray(bookingTravelers.bookingId, bookingIds),
          eq(bookingTravelers.participantType, "traveler"),
        ),
      ),
  ])

  const totalSellByBooking = new Map(totalSellRows.map((r) => [r.bookingId, num(r.totalSell)]))
  const invoicedByBooking = new Map(invoiceRows.map((r) => [r.bookingId, num(r.total)]))
  const depByBooking = new Map(
    depItemRows.map((r) => [
      r.bookingId,
      { depSell: num(r.depSell), depPlanned: num(r.depPlanned) },
    ]),
  )

  const travelersByBooking = new Map<string, Array<{ id: string; name: string }>>()
  for (const t of travelerRows) {
    const list = travelersByBooking.get(t.bookingId) ?? []
    list.push({ id: t.id, name: `${t.firstName} ${t.lastName}`.trim() })
    travelersByBooking.set(t.bookingId, list)
  }

  const travelerCount = travelerRows.length
  if (travelerCount === 0) return empty
  const actualPerTraveler = num(actualRows[0]?.amount) / travelerCount

  const rows: TravelerProfitabilityRow[] = []
  for (const bookingId of bookingIds) {
    const travelers = travelersByBooking.get(bookingId)
    if (!travelers || travelers.length === 0) continue
    const dep = depByBooking.get(bookingId) ?? { depSell: 0, depPlanned: 0 }
    const totalSell = totalSellByBooking.get(bookingId) ?? 0
    const ratio = totalSell > 0 ? dep.depSell / totalSell : 1
    const revenuePerTraveler = ((invoicedByBooking.get(bookingId) ?? 0) * ratio) / travelers.length
    const plannedPerTraveler = dep.depPlanned / travelers.length
    for (const traveler of travelers) {
      const revenueCents = Math.round(revenuePerTraveler)
      const actualCostCents = Math.round(actualPerTraveler)
      const plannedCostCents = Math.round(plannedPerTraveler)
      const profitCents = revenueCents - actualCostCents
      rows.push({
        travelerId: traveler.id,
        travelerName: traveler.name,
        bookingId,
        currency,
        revenueCents,
        actualCostCents,
        plannedCostCents,
        profitCents,
        marginPercent: margin(profitCents, revenueCents),
        varianceCents: plannedCostCents - actualCostCents,
      })
    }
  }
  rows.sort(
    (a, b) =>
      a.bookingId.localeCompare(b.bookingId) || a.travelerName.localeCompare(b.travelerName),
  )
  return { departureId, currency, travelerCount, rows }
}

// ---------- base-currency rollup (FX) ----------

/** Distinct residual currencies that need a fallback conversion rate. */
function collectResidualCurrencies(
  perRow: string[],
  ...splits: Array<Map<string, BaseSplit> | BaseSplit>
): Set<string> {
  const set = new Set<string>(perRow)
  for (const split of splits) {
    if (split instanceof Map) {
      for (const s of split.values()) for (const c of s.residual.keys()) set.add(c)
    } else {
      for (const c of split.residual.keys()) set.add(c)
    }
  }
  return set
}

/**
 * Resolve a fallback conversion rate for each residual currency → base. Used ONLY
 * for legacy rows that predate the base-amount snapshot (forward-only): persisted
 * FX rate first (then the runtime resolver). No date is passed, so these use the
 * latest available rate. Snapshotted rows never reach here — they are summed at
 * their own issue-date rate. Currencies with no rate are reported as unconvertible
 * and excluded from the rollup rather than guessed.
 */
async function buildBaseRates(
  db: PostgresJsDatabase,
  currencies: Iterable<string>,
  base: string,
  options: ProfitabilityFxRuntime = {},
): Promise<{ rates: Map<string, number>; unconvertible: string[] }> {
  const rates = new Map<string, number>()
  const unconvertible: string[] = []
  for (const currency of new Set(currencies)) {
    if (currency === base) {
      rates.set(currency, 1)
      continue
    }
    const probeInput: FxMoneyInput = { amountCents: 1_000_000, currency }
    const probe = await resolveFxMoneyBaseAmount(db, probeInput, {
      ...options,
      targetBaseCurrency: base,
    })
    if (probe.baseAmountCents != null && probe.baseCurrency === base) {
      rates.set(currency, probe.baseAmountCents / 1_000_000)
    } else {
      unconvertible.push(currency)
    }
  }
  return { rates, unconvertible }
}

/** Snapshot base + converted residuals → a single accounting-base figure set. */
function baseFromAcc(
  snapshot: CurrencyTotals,
  residual: Map<string, CurrencyTotals>,
  rates: Map<string, number>,
): CurrencyTotals {
  const out: CurrencyTotals = {
    revenue: snapshot.revenue,
    actual: snapshot.actual,
    planned: snapshot.planned,
  }
  for (const [currency, res] of residual) {
    const rate = rates.get(currency)
    if (rate == null) continue
    out.revenue += res.revenue * rate
    out.actual += res.actual * rate
    out.planned += res.planned * rate
  }
  return out
}

/** Resolve the cost-by-category breakdown into the accounting base currency. */
function baseCostByServiceType(
  splits: Map<string, BaseSplit>,
  rates: Map<string, number>,
  base: string,
): ProfitabilityCostByServiceType[] {
  const out: ProfitabilityCostByServiceType[] = []
  for (const [serviceType, split] of splits) {
    const amountCents = Math.round(resolveBaseSplit(split, rates, new Set()))
    if (amountCents !== 0) out.push({ serviceType, currency: base, amountCents })
  }
  return out
}

// ---------- CSV export (accountant sharing) ----------

const csvField = (value: string | number | null | undefined): string => {
  const str = value == null ? "" : String(value)
  return /[",\n\r]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str
}
const csvRow = (cells: Array<string | number | null | undefined>): string =>
  cells.map(csvField).join(",")
// BOM + CRLF so Excel opens UTF-8 correctly (mirrors availability exports).
const csvDocument = (rows: string[]): string => `﻿${rows.join("\r\n")}\r\n`
const major = (cents: number): string => (cents / 100).toFixed(2)
const marginCell = (value: number | null): string => (value == null ? "" : value.toFixed(1))

/**
 * Trailing block for AP cost that never reached a departure, per currency. The
 * two kinds stay on separate lines because they are separate signals:
 * `explicitly_unattributed` was allocated to nothing on purpose, whereas
 * `unallocated_remainder` is the under-allocated leftover nobody has touched.
 *
 * Emitted only when there is something to report, so an export from a fully
 * allocated ledger is byte-identical to one produced before this block existed.
 */
function unaccountedCostRows(report: {
  unattributed: ProfitabilityUnattributed[]
  unallocated: ProfitabilityUnallocated[]
}): string[] {
  const entries: Array<[string, { currency: string; amountCents: number }]> = [
    ...report.unattributed.map((entry): [string, typeof entry] => [
      "explicitly_unattributed",
      entry,
    ]),
    ...report.unallocated.map((entry): [string, typeof entry] => ["unallocated_remainder", entry]),
  ]
  if (entries.length === 0) return []
  return [
    "",
    csvRow(["unaccounted_cost", "currency", "amount"]),
    ...entries.map(([kind, entry]) => csvRow([kind, entry.currency, major(entry.amountCents)])),
  ]
}

export function buildDepartureProfitabilityCsv(report: DepartureProfitabilityReport): string {
  const header = [
    "departure_id",
    "departure",
    "product_id",
    "product",
    "date",
    "currency",
    "revenue",
    "actual_cost",
    "planned_cost",
    "profit",
    "margin_percent",
    "variance",
  ]
  const rows = report.rows.map((r) =>
    csvRow([
      r.departureId,
      r.departureLabel,
      r.productId,
      r.productName,
      r.departureDate,
      r.currency,
      major(r.revenueCents),
      major(r.actualCostCents),
      major(r.plannedCostCents),
      major(r.profitCents),
      marginCell(r.marginPercent),
      major(r.varianceCents),
    ]),
  )
  return csvDocument([csvRow(header), ...rows, ...unaccountedCostRows(report)])
}

export function buildProductProfitabilityCsv(report: ProductProfitabilityReport): string {
  const header = [
    "product_id",
    "product",
    "currency",
    "departures",
    "revenue",
    "actual_cost",
    "planned_cost",
    "profit",
    "margin_percent",
    "variance",
  ]
  const rows = report.rows.map((r) =>
    csvRow([
      r.productId,
      r.productName,
      r.currency,
      r.departureCount,
      major(r.revenueCents),
      major(r.actualCostCents),
      major(r.plannedCostCents),
      major(r.profitCents),
      marginCell(r.marginPercent),
      major(r.varianceCents),
    ]),
  )
  return csvDocument([csvRow(header), ...rows, ...unaccountedCostRows(report)])
}
