/**
 * Acceptance dashboard metrics for the unified Product/Departure rollout
 * (voyant#4038). Six health signals the operator and the release review both
 * watch while the transitional surfaces are still live:
 *
 *   - readiness failures        — Products that cannot publish;
 *   - reconciliation drift      — Departures whose stored counters disagree with
 *                                 what their bookings/travelers actually say;
 *   - unassigned travelers      — booked travelers with no resource allocation;
 *   - missing costs             — operated Departures with no planned cost;
 *   - legacy-path usage         — hits on the compatibility redirects, per key;
 *   - rollup disagreement       — Departures where the per-currency P&L and the
 *                                 base-currency rollup disagree.
 *
 * Every metric is a COUNT or a route-keyed usage row. No traveler name, email,
 * booking reference or any other PII is read or emitted — a dashboard is a
 * fleet-wide health surface, not a person finder. The aggregator is pure over an
 * injectable provider set so it unit-tests without a database and each real
 * source is bound at the deployment boundary, exactly like the existing operator
 * dashboard services.
 */

import type { LegacyPathUsageRow } from "@voyant-travel/core"
import { z } from "zod"

/**
 * The data sources the metrics aggregate over. Each returns a scalar count (or,
 * for legacy usage, route-keyed rows) so nothing PII-bearing can leak through
 * the seam. A deployment binds real implementations; a test binds fakes.
 */
export interface AcceptanceMetricsProviders {
  /** Products that fail publish readiness. */
  countReadinessFailures(): Promise<number>
  /** Departures whose stored counters drift from their bookings/travelers. */
  countReconciliationDrift(): Promise<number>
  /** Booked travelers with no resource allocation. */
  countUnassignedTravelers(): Promise<number>
  /** Operated Departures with no planned cost recorded. */
  countMissingCosts(): Promise<number>
  /** Departures whose per-currency and base-currency rollups disagree. */
  countRollupDisagreements(): Promise<number>
  /** Compatibility-redirect usage rows (route keys + counts, never PII). */
  legacyPathUsage(): Promise<LegacyPathUsageRow[]>
}

export const legacyPathUsageRowSchema = z.object({
  key: z.string(),
  family: z.enum(["extras", "catalog", "product", "availability"]),
  hits: z.number().int().min(0),
  lastSeenAt: z.string().nullable(),
})

export const acceptanceMetricsSchema = z.object({
  readinessFailures: z.number().int().min(0),
  reconciliationDrift: z.number().int().min(0),
  unassignedTravelers: z.number().int().min(0),
  missingCosts: z.number().int().min(0),
  rollupDisagreement: z.number().int().min(0),
  legacyPathUsage: z.object({
    /** Σ hits across every compatibility redirect — the "is it zero yet?" number. */
    totalHits: z.number().int().min(0),
    /** True only when every legacy redirect has zero recorded hits. */
    allZero: z.boolean(),
    byKey: z.array(legacyPathUsageRowSchema),
  }),
})

export type AcceptanceMetrics = z.infer<typeof acceptanceMetricsSchema>

/**
 * Compute the acceptance metrics from the bound providers. Runs the independent
 * reads concurrently; every field is a count or a keyed count, so the result is
 * safe to render on any dashboard without a PII review.
 */
export async function computeAcceptanceMetrics(
  providers: AcceptanceMetricsProviders,
): Promise<AcceptanceMetrics> {
  const [
    readinessFailures,
    reconciliationDrift,
    unassignedTravelers,
    missingCosts,
    rollupDisagreement,
    usage,
  ] = await Promise.all([
    providers.countReadinessFailures(),
    providers.countReconciliationDrift(),
    providers.countUnassignedTravelers(),
    providers.countMissingCosts(),
    providers.countRollupDisagreements(),
    providers.legacyPathUsage(),
  ])

  const byKey = [...usage].sort((a, b) => a.key.localeCompare(b.key))
  const totalHits = byKey.reduce((sum, row) => sum + row.hits, 0)

  return {
    readinessFailures,
    reconciliationDrift,
    unassignedTravelers,
    missingCosts,
    rollupDisagreement,
    legacyPathUsage: {
      totalHits,
      allZero: totalHits === 0,
      byKey,
    },
  }
}
