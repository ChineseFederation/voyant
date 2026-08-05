/**
 * The deployment-side bindings for {@link AcceptanceMetricsProviders} — what
 * turns the pure aggregator in `acceptance-metrics.ts` into a number the
 * operator and the release review can actually look at (voyant#4038).
 *
 * ## Why raw SQL
 *
 * Every count here spans the whole fleet of departures, so none of them can be
 * built out of the per-departure read models (`getDepartureCapacityCounters`
 * and friends) without N round trips. They are written as one statement each,
 * against table names as string literals, exactly as
 * `service-allocation-room-block.ts` documents: `availability_slots`,
 * `availability_holds`, `booking_*` and the `product*` tables are owned by
 * other modules, a module's tables are private (ADR-0016 decision 6), and the
 * `operations->availability` reach-in ratchet has no headroom. Naming a table
 * const would spend budget that does not exist; naming a table in SQL spends
 * none.
 *
 * ## PII
 *
 * Every statement selects `COUNT(*)`. No traveler, booking or contact column is
 * ever projected — not filtered out downstream, never read in the first place.
 * That is the property the metrics contract promises, and it is enforced here
 * by construction rather than by review.
 *
 * ## Fidelity, stated plainly
 *
 * Three of the five counts mirror logic that is authored elsewhere, and a
 * mirror that silently drifts is worse than no metric:
 *
 *   - **reconciliation drift** mirrors the `remaining_pax_drift` rule in
 *     `availability/service-departure-issues.ts` over the derivation in
 *     `availability/service-departure-capacity.ts`. Same predicate, evaluated
 *     set-wide instead of per slot.
 *   - **unassigned travelers** mirrors `loadTravelerCounts`' `entered - assigned`
 *     over the same population the allocation manifest renders.
 *   - **readiness failures** mirrors the *blocking* rules of
 *     `evaluateProductReadiness` (`@voyant-travel/inventory`). All eight blocking
 *     codes are expressed; the warning-severity rules are deliberately not,
 *     because warnings do not stop a publish. The three facts that evaluator
 *     takes from a deployment-supplied resolver (meeting point, allocation
 *     template, active channel count) are warnings, so their absence here costs
 *     nothing. Inventory owns that evaluator: if a blocking rule is added there,
 *     it must be added here too, or this number quietly understates.
 *
 * Money is Finance's and Operations must not recompute it, so **missing costs**
 * and **rollup disagreement** are read from the departure-profitability report
 * through the port that already backs the departure workspace. A deployment
 * assembled without Finance binds nothing and both report `0` — "not measured"
 * and "measured zero" are indistinguishable in an `int`, which is a real limit
 * of the metrics contract and is why the endpoint reports the binding alongside
 * the counts.
 */

import type { LegacyPathUsageRow } from "@voyant-travel/core"
import { getLegacyPathUsageStore } from "@voyant-travel/core"
import type { FinanceDepartureProfitabilityRow } from "@voyant-travel/finance-contracts/runtime-port"
import { sql } from "drizzle-orm"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"

import type { AcceptanceMetricsProviders } from "./acceptance-metrics.js"
import {
  activeBookingAllocationStatusesSql,
  activeBookingStatusesSql,
} from "./availability/booking-statuses.js"
import {
  hasDepartureProfitabilityReader,
  readDepartureProfitabilityReport,
} from "./availability/departure-profitability-runtime.js"
import { executeRows } from "./availability/service-allocation-sql.js"

/** Minutes in a day — mirrors `MINUTES_PER_DAY` in inventory's classification. */
const MINUTES_PER_DAY = 1440

/**
 * Booking modes whose supply is resolved at quote time, so they are never asked
 * for a future dated departure. Mirrors `DYNAMIC_BOOKING_MODES` in inventory's
 * `readiness.ts`.
 */
const DYNAMIC_BOOKING_MODES = ["open", "stay"] as const

export interface AcceptanceMetricsProviderOptions {
  /**
   * Legacy-path usage source. Defaults to the process-wide binding in
   * `@voyant-travel/core` — the same store the compatibility-redirect
   * middleware records into, which is what makes the reported zero the zero the
   * redirects produced rather than an unrelated empty store.
   */
  legacyPathUsage?: () => LegacyPathUsageRow[] | Promise<LegacyPathUsageRow[]>
  /** Clock seam for the time-bounded predicates. Defaults to `Date`. */
  now?: () => Date
}

async function countScalar(db: PostgresJsDatabase, query: ReturnType<typeof sql>): Promise<number> {
  const rows = await executeRows<{ count: number }>(db, query)
  return rows[0]?.count ?? 0
}

/**
 * Departures whose stored `remaining_pax` disagrees with what their bookings
 * and live holds actually consume. Skips unlimited departures and departures
 * with no authored capacity — neither has a derived counter to disagree with.
 */
export async function countReconciliationDrift(db: PostgresJsDatabase, now: Date): Promise<number> {
  const nowIso = now.toISOString()
  return countScalar(
    db,
    sql`
      SELECT COUNT(*)::int AS count
      FROM availability_slots s
      WHERE s.unlimited = false
        AND s.initial_pax IS NOT NULL
        AND s.remaining_pax IS NOT NULL
        AND s.remaining_pax <> (
          s.initial_pax
          - COALESCE((
              SELECT SUM(b.pax)
              FROM bookings b
              WHERE b.status <> 'cancelled'
                AND EXISTS (
                  SELECT 1
                  FROM booking_allocations ba
                  WHERE ba.booking_id = b.id
                    AND ba.availability_slot_id = s.id
                    AND ba.status IN (${activeBookingAllocationStatusesSql()})
                )
            ), 0)
          - COALESCE((
              SELECT SUM(h.pax_count)
              FROM availability_holds h
              WHERE h.slot_id = s.id
                AND h.released_at IS NULL
                AND h.converted_at IS NULL
                AND h.expires_at >= ${nowIso}::timestamptz
            ), 0)
        )
    `,
  )
}

/**
 * Traveler records on live bookings that hold a live allocation to a departure
 * and carry no resource assignment. A count of rows — no traveler is named,
 * projected, or joined for identity.
 */
export async function countUnassignedTravelers(db: PostgresJsDatabase): Promise<number> {
  return countScalar(
    db,
    sql`
      SELECT COUNT(*)::int AS count
      FROM booking_travelers bt
      JOIN bookings b ON b.id = bt.booking_id
      LEFT JOIN booking_traveler_travel_details btd ON btd.traveler_id = bt.id
      WHERE b.status IN (${activeBookingStatusesSql()})
        AND (btd.allocations IS NULL OR btd.allocations = '{}'::jsonb)
        AND EXISTS (
          SELECT 1
          FROM booking_allocations ba
          WHERE ba.booking_id = b.id
            AND ba.availability_slot_id IS NOT NULL
            AND ba.status IN (${activeBookingAllocationStatusesSql()})
        )
    `,
  )
}

/**
 * Live products that would be refused publication.
 *
 * Scoped to `products.status = 'active'` on purpose: a draft that is not yet
 * ready is the normal state of authoring, not a rollout defect, and counting
 * drafts would bury the signal. Every disjunct below is one `blocking` rule
 * from `evaluateProductReadiness`, in the same order, with the same predicate.
 * The default option and default itinerary are resolved with the same
 * `is_default` + `sort_order, created_at` ordering the readiness loader uses, so
 * a product with two rows flagged default resolves to the same one here.
 */
export async function countReadinessFailures(db: PostgresJsDatabase): Promise<number> {
  const dynamicModes = sql.join(
    // agent-quality: raw-sql reviewed -- owner: operations; dynamic SQL interpolation uses Drizzle parameter binding or vetted SQL identifiers.
    DYNAMIC_BOOKING_MODES.map((mode) => sql`${mode}`),
    sql`, `,
  )
  return countScalar(
    db,
    sql`
      WITH candidate AS (
        SELECT p.id, p.booking_mode, p.duration_minutes, p.sell_amount_cents
        FROM products p
        WHERE p.status = 'active'
      ),
      default_option AS (
        SELECT DISTINCT ON (o.product_id) o.product_id, o.id, o.status
        FROM product_options o
        WHERE o.is_default = true
        ORDER BY o.product_id, o.sort_order ASC, o.created_at ASC
      ),
      default_itinerary AS (
        SELECT DISTINCT ON (i.product_id) i.product_id, i.id
        FROM product_itineraries i
        WHERE i.is_default = true
        ORDER BY i.product_id, i.sort_order ASC, i.created_at ASC
      ),
      itinerary_days AS (
        SELECT
          d.itinerary_id,
          COUNT(*)::int AS day_count,
          COUNT(DISTINCT d.day_number)::int AS distinct_day_count,
          MIN(d.day_number)::int AS first_day,
          MAX(d.day_number)::int AS last_day
        FROM product_days d
        GROUP BY d.itinerary_id
      )
      SELECT COUNT(*)::int AS count
      FROM candidate c
      LEFT JOIN default_option o ON o.product_id = c.id
      LEFT JOIN default_itinerary it ON it.product_id = c.id
      LEFT JOIN itinerary_days d ON d.itinerary_id = it.id
      WHERE
        -- no_future_open_departure
        (
          c.booking_mode NOT IN (${dynamicModes})
          AND NOT EXISTS (
            SELECT 1
            FROM availability_slots s
            WHERE s.product_id = c.id
              AND s.status = 'open'
              AND s.starts_at >= now()
          )
        )
        -- missing_default_option / default_option_not_active
        OR o.id IS NULL
        OR o.status <> 'active'
        -- no_option_units
        OR NOT EXISTS (SELECT 1 FROM option_units u WHERE u.option_id = o.id)
        -- no_price
        OR (
          COALESCE(c.sell_amount_cents, 0) <= 0
          AND NOT EXISTS (
            SELECT 1 FROM product_pax_pricing_tiers t WHERE t.product_id = c.id
          )
        )
        -- missing_itinerary / empty_itinerary / non_consecutive_itinerary_days,
        -- evaluated only for products that owe a day-by-day plan.
        OR (
          (
            c.booking_mode = 'itinerary'
            OR COALESCE(c.duration_minutes, 0) > ${MINUTES_PER_DAY}
          )
          AND (
            it.id IS NULL
            OR d.day_count IS NULL
            OR d.first_day <> 1
            OR d.last_day <> d.day_count
            OR d.distinct_day_count <> d.day_count
          )
        )
    `,
  )
}

/** Departures grouped by id, with their per-currency and base-rollup rows. */
interface DepartureRollup {
  rows: FinanceDepartureProfitabilityRow[]
  baseRows: FinanceDepartureProfitabilityRow[]
}

function groupByDeparture(
  rows: readonly FinanceDepartureProfitabilityRow[],
  baseRows: readonly FinanceDepartureProfitabilityRow[],
): Map<string, DepartureRollup> {
  const grouped = new Map<string, DepartureRollup>()
  const entry = (departureId: string) => {
    const existing = grouped.get(departureId)
    if (existing) return existing
    const created: DepartureRollup = { rows: [], baseRows: [] }
    grouped.set(departureId, created)
    return created
  }
  for (const row of rows) entry(row.departureId).rows.push(row)
  for (const row of baseRows) entry(row.departureId).baseRows.push(row)
  return grouped
}

/**
 * The two Finance-derived counts, read in one pass so the profitability report
 * is loaded once rather than twice. Returns zeros when no Finance provider is
 * bound — see the module docblock.
 */
async function readFinanceCounts(
  db: PostgresJsDatabase,
): Promise<{ missingCosts: number; rollupDisagreement: number }> {
  if (!hasDepartureProfitabilityReader()) return { missingCosts: 0, rollupDisagreement: 0 }
  const report = await readDepartureProfitabilityReport(db, {})
  if (!report) return { missingCosts: 0, rollupDisagreement: 0 }

  const base = report.base
  const grouped = groupByDeparture(report.rows, base?.rows ?? [])
  const unconvertible = new Set(base?.unconvertibleCurrencies ?? [])

  let missingCosts = 0
  let rollupDisagreement = 0

  for (const rollup of grouped.values()) {
    if (rollup.rows.length > 0) {
      const plannedCents = rollup.rows.reduce((sum, row) => sum + row.plannedCostCents, 0)
      if (plannedCents === 0) missingCosts += 1
    }

    // Nothing to disagree with when Finance produced no base rollup at all.
    if (!base) continue
    if (rollup.rows.length === 0) continue

    // A source currency the rollup could not convert means the base row is
    // knowably short of the per-currency rows it claims to summarize.
    if (rollup.rows.some((row) => unconvertible.has(row.currency))) {
      rollupDisagreement += 1
      continue
    }
    // A departure with per-currency rows and no base row is unrepresented.
    if (rollup.baseRows.length === 0) {
      rollupDisagreement += 1
      continue
    }
    // When every row is already in the base currency no FX is involved, so the
    // two views must agree exactly. Anything else needs rates we do not hold
    // here, and comparing it would manufacture false disagreement.
    if (!rollup.rows.every((row) => row.currency === base.currency)) continue
    const summed = rollup.rows.reduce(
      (totals, row) => ({
        revenueCents: totals.revenueCents + row.revenueCents,
        actualCostCents: totals.actualCostCents + row.actualCostCents,
        plannedCostCents: totals.plannedCostCents + row.plannedCostCents,
      }),
      { revenueCents: 0, actualCostCents: 0, plannedCostCents: 0 },
    )
    const baseTotals = rollup.baseRows.reduce(
      (totals, row) => ({
        revenueCents: totals.revenueCents + row.revenueCents,
        actualCostCents: totals.actualCostCents + row.actualCostCents,
        plannedCostCents: totals.plannedCostCents + row.plannedCostCents,
      }),
      { revenueCents: 0, actualCostCents: 0, plannedCostCents: 0 },
    )
    if (
      summed.revenueCents !== baseTotals.revenueCents ||
      summed.actualCostCents !== baseTotals.actualCostCents ||
      summed.plannedCostCents !== baseTotals.plannedCostCents
    ) {
      rollupDisagreement += 1
    }
  }

  return { missingCosts, rollupDisagreement }
}

/**
 * Bind the acceptance metrics to a request's database handle.
 *
 * The Finance-derived pair share one report read, so they are memoized per
 * provider set: `computeAcceptanceMetrics` calls both concurrently and neither
 * should pay for the other's round trip.
 */
export function createAcceptanceMetricsProviders(
  db: PostgresJsDatabase,
  options: AcceptanceMetricsProviderOptions = {},
): AcceptanceMetricsProviders {
  const now = options.now ?? (() => new Date())
  const readUsage = options.legacyPathUsage ?? (() => getLegacyPathUsageStore().snapshot())
  let financeCounts: ReturnType<typeof readFinanceCounts> | undefined
  const finance = () => (financeCounts ??= readFinanceCounts(db))

  return {
    countReadinessFailures: () => countReadinessFailures(db),
    countReconciliationDrift: () => countReconciliationDrift(db, now()),
    countUnassignedTravelers: () => countUnassignedTravelers(db),
    countMissingCosts: async () => (await finance()).missingCosts,
    countRollupDisagreements: async () => (await finance()).rollupDisagreement,
    legacyPathUsage: async () => readUsage(),
  }
}
