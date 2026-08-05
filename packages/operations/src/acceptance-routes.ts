/**
 * The acceptance dashboard read-model: `GET /v1/admin/operations/acceptance/aggregates`.
 *
 * Follows the `/aggregates` convention the availability dashboard already
 * established (`availability/routes-core.ts`) — an `OpenAPIHono` sub-chain, one
 * `createRoute` per leg, a `{ data }` envelope — so the operator dashboard
 * reaches these six signals through the same shape as every other aggregate it
 * renders.
 *
 * Two deliberate departures from that convention:
 *
 *   - **No read-through snapshot and no `max-age`.** The availability
 *     aggregates are cached for 60s because they are a KPI tile. Legacy-path
 *     usage is the input to a *deletion gate*: someone asks "is it zero yet?",
 *     clicks the superseded link to check the redirect still works, and reloads.
 *     A cached zero would answer the question wrong at exactly the moment it
 *     matters, so this leg is `no-store`.
 *   - **A `meta` sibling next to `data`.** `acceptanceMetricsSchema` is all
 *     counts, and an unbound Finance provider reports `0` for missing costs and
 *     rollup disagreement — indistinguishable from a measured zero. Rather than
 *     widen the PII-free metrics contract to carry provenance, the envelope
 *     says whether Finance was bound for this read.
 */

import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi"
import { openApiValidationHook } from "@voyant-travel/hono"

import { acceptanceMetricsSchema, computeAcceptanceMetrics } from "./acceptance-metrics.js"
import { createAcceptanceMetricsProviders } from "./acceptance-metrics-providers.js"
import { hasDepartureProfitabilityReader } from "./availability/departure-profitability-runtime.js"
import type { Env } from "./availability/routes-shared.js"

const acceptanceMetricsMetaSchema = z.object({
  /**
   * False when this deployment binds no Finance profitability provider, in
   * which case `missingCosts` and `rollupDisagreement` are `0` because nothing
   * measured them — not because they were measured at zero.
   */
  financeProviderBound: z.boolean(),
})

const getAcceptanceAggregatesRoute = createRoute({
  method: "get",
  path: "/acceptance/aggregates",
  description:
    "Acceptance dashboard metrics for the unified Product/Departure rollout: readiness " +
    "failures, reconciliation drift, unassigned travelers, missing costs, compatibility " +
    "redirect (legacy-path) usage, and rollup disagreement. Every field is a count or a " +
    "route-keyed usage row — no traveler identity is read or emitted. Served uncached: " +
    "legacy-path usage gates a deletion review and must not answer from a snapshot.",
  responses: {
    200: {
      description: "Acceptance dashboard metrics",
      content: {
        "application/json": {
          schema: z.object({
            data: acceptanceMetricsSchema,
            meta: acceptanceMetricsMetaSchema,
          }),
        },
      },
    },
  },
})

export const acceptanceAdminRoutes = new OpenAPIHono<Env>({
  defaultHook: openApiValidationHook,
}).openapi(getAcceptanceAggregatesRoute, async (c) => {
  c.header("Cache-Control", "private, no-store")
  const data = await computeAcceptanceMetrics(createAcceptanceMetricsProviders(c.get("db")))
  return c.json({ data, meta: { financeProviderBound: hasDepartureProfitabilityReader() } }, 200)
})

export type AcceptanceAdminRoutes = typeof acceptanceAdminRoutes
