import { InMemoryLegacyPathUsageStore, setLegacyPathUsageStore } from "@voyant-travel/core"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"
import { Hono } from "hono"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { acceptanceMetricsSchema } from "../../src/acceptance-metrics.js"
import {
  configureDepartureProfitabilityReader,
  resetDepartureProfitabilityReader,
} from "../../src/availability/departure-profitability-runtime.js"
import type { Env } from "../../src/availability/routes-shared.js"
import { operationsAdminRoutes } from "../../src/routes.js"

/**
 * Wiring test for `GET /v1/admin/operations/acceptance/aggregates`.
 *
 * The aggregator itself is unit-tested in `acceptance-metrics.test.ts`; what is
 * proved here is that the route exists on the mounted admin surface, resolves
 * its providers from the request's database handle, and serializes the shape the
 * contract declares. The database is a scripted `execute()` — the providers are
 * raw SQL, so that is the whole surface they need — and the counts are keyed off
 * the statement text so each provider's own query is asserted to have run.
 */

interface ScriptedDb {
  db: PostgresJsDatabase
  statements: string[]
}

function scriptedDb(counts: { readiness: number; drift: number; unassigned: number }): ScriptedDb {
  const statements: string[] = []
  const execute = async (query: { toString?: () => string } | unknown) => {
    // Drizzle's SQL object carries the fragment list; the queryChunks text is
    // enough to tell the three statements apart without a real dialect.
    const text = JSON.stringify(query)
    statements.push(text)
    if (text.includes("products p")) return [{ count: counts.readiness }]
    if (text.includes("availability_slots s")) return [{ count: counts.drift }]
    if (text.includes("booking_travelers bt")) return [{ count: counts.unassigned }]
    return []
  }
  return { db: { execute } as unknown as PostgresJsDatabase, statements }
}

function mount(db: PostgresJsDatabase) {
  const app = new Hono<Env>()
  app.use("*", async (c, next) => {
    c.set("db", db)
    return next()
  })
  app.route("/", operationsAdminRoutes)
  return app
}

beforeEach(() => {
  setLegacyPathUsageStore(new InMemoryLegacyPathUsageStore())
})

afterEach(() => {
  resetDepartureProfitabilityReader()
})

describe("GET /acceptance/aggregates", () => {
  it("serves the computed metrics from the request's database handle", async () => {
    const { db, statements } = scriptedDb({ readiness: 3, drift: 2, unassigned: 5 })

    const response = await mount(db).request("/acceptance/aggregates")

    expect(response.status).toBe(200)
    const body = (await response.json()) as { data: unknown; meta: unknown }
    const metrics = acceptanceMetricsSchema.parse(body.data)
    expect(metrics.readinessFailures).toBe(3)
    expect(metrics.reconciliationDrift).toBe(2)
    expect(metrics.unassignedTravelers).toBe(5)
    // Every provider's own statement actually ran against the request handle.
    expect(statements).toHaveLength(3)
    expect(body.meta).toEqual({ financeProviderBound: false })
  })

  it("is served uncached — a gate metric must not answer from a snapshot", async () => {
    const { db } = scriptedDb({ readiness: 0, drift: 0, unassigned: 0 })

    const response = await mount(db).request("/acceptance/aggregates")

    expect(response.headers.get("cache-control")).toBe("private, no-store")
  })

  it("reports legacy-path usage from the store the redirect middleware records into", async () => {
    const store = new InMemoryLegacyPathUsageStore()
    store.record("product.detail", new Date("2026-08-04T10:00:00Z"))
    store.record("extras.detail", new Date("2026-08-04T10:05:00Z"))
    store.record("extras.detail", new Date("2026-08-04T10:06:00Z"))
    setLegacyPathUsageStore(store)
    const { db } = scriptedDb({ readiness: 0, drift: 0, unassigned: 0 })

    const response = await mount(db).request("/acceptance/aggregates")

    const metrics = acceptanceMetricsSchema.parse(
      ((await response.json()) as { data: unknown }).data,
    )
    expect(metrics.legacyPathUsage.totalHits).toBe(3)
    expect(metrics.legacyPathUsage.allZero).toBe(false)
    expect(metrics.legacyPathUsage.byKey.find((row) => row.key === "extras.detail")?.hits).toBe(2)
    // Keys that were never hit still report, explicitly, at zero.
    expect(
      metrics.legacyPathUsage.byKey.find((row) => row.key === "catalog.scheduled.index"),
    ).toEqual({ key: "catalog.scheduled.index", family: "catalog", hits: 0, lastSeenAt: null })
  })

  it("derives the money counts from the bound Finance provider and says it was bound", async () => {
    const { db } = scriptedDb({ readiness: 0, drift: 0, unassigned: 0 })
    configureDepartureProfitabilityReader(async () => ({
      rows: [
        // No planned cost recorded at all.
        row("avsl_1", "EUR", { planned: 0, actual: 100, revenue: 500 }),
        // Planned cost present, and its base row disagrees with it.
        row("avsl_2", "EUR", { planned: 400, actual: 400, revenue: 900 }),
        // Priced in a currency the rollup could not convert.
        row("avsl_3", "JPY", { planned: 700, actual: 700, revenue: 1000 }),
      ],
      base: {
        currency: "EUR",
        unconvertibleCurrencies: ["JPY"],
        rows: [
          row("avsl_1", "EUR", { planned: 0, actual: 100, revenue: 500 }),
          row("avsl_2", "EUR", { planned: 400, actual: 400, revenue: 111 }),
          row("avsl_3", "EUR", { planned: 0, actual: 0, revenue: 0 }),
        ],
      },
    }))

    const response = await mount(db).request("/acceptance/aggregates")
    const body = (await response.json()) as { data: unknown; meta: unknown }
    const metrics = acceptanceMetricsSchema.parse(body.data)

    expect(metrics.missingCosts).toBe(1)
    expect(metrics.rollupDisagreement).toBe(2)
    expect(body.meta).toEqual({ financeProviderBound: true })
  })

  it("emits no PII — the serialized body is counts and route keys only", async () => {
    const { db } = scriptedDb({ readiness: 1, drift: 1, unassigned: 7 })

    const response = await mount(db).request("/acceptance/aggregates")

    const serialized = JSON.stringify(((await response.json()) as { data: unknown }).data)
    expect(serialized).not.toMatch(/email|firstName|lastName|traveler_id|bookingNumber/i)
  })
})

function row(
  departureId: string,
  currency: string,
  amounts: { planned: number; actual: number; revenue: number },
) {
  return {
    departureId,
    productId: null,
    departureDate: null,
    currency,
    revenueCents: amounts.revenue,
    actualCostCents: amounts.actual,
    plannedCostCents: amounts.planned,
    profitCents: amounts.revenue - amounts.actual,
    marginPercent: null,
    varianceCents: amounts.planned - amounts.actual,
  }
}
