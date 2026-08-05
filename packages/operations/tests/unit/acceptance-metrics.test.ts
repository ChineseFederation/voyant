import { InMemoryLegacyPathUsageStore } from "@voyant-travel/core"
import { describe, expect, it } from "vitest"

import {
  type AcceptanceMetricsProviders,
  acceptanceMetricsSchema,
  computeAcceptanceMetrics,
} from "../../src/acceptance-metrics.js"

function providers(
  overrides: Partial<AcceptanceMetricsProviders> = {},
): AcceptanceMetricsProviders {
  const store = new InMemoryLegacyPathUsageStore()
  return {
    countReadinessFailures: async () => 0,
    countReconciliationDrift: async () => 0,
    countUnassignedTravelers: async () => 0,
    countMissingCosts: async () => 0,
    countRollupDisagreements: async () => 0,
    legacyPathUsage: async () => store.snapshot(),
    ...overrides,
  }
}

describe("computeAcceptanceMetrics", () => {
  it("aggregates every provider count and validates against the schema", async () => {
    const metrics = await computeAcceptanceMetrics(
      providers({
        countReadinessFailures: async () => 3,
        countReconciliationDrift: async () => 2,
        countUnassignedTravelers: async () => 5,
        countMissingCosts: async () => 1,
        countRollupDisagreements: async () => 4,
      }),
    )

    expect(metrics.readinessFailures).toBe(3)
    expect(metrics.reconciliationDrift).toBe(2)
    expect(metrics.unassignedTravelers).toBe(5)
    expect(metrics.missingCosts).toBe(1)
    expect(metrics.rollupDisagreement).toBe(4)
    // Never throws — the shape is exactly what the dashboard contract promises.
    expect(() => acceptanceMetricsSchema.parse(metrics)).not.toThrow()
  })

  it("reports legacy-path usage as zero when nothing has hit the redirects", async () => {
    const metrics = await computeAcceptanceMetrics(providers())
    expect(metrics.legacyPathUsage.totalHits).toBe(0)
    expect(metrics.legacyPathUsage.allZero).toBe(true)
    // Every known key is present at zero — an explicit, checkable zero.
    expect(metrics.legacyPathUsage.byKey.length).toBeGreaterThan(0)
    expect(metrics.legacyPathUsage.byKey.every((r) => r.hits === 0)).toBe(true)
  })

  it("surfaces recorded legacy-path hits and flips allZero off", async () => {
    const store = new InMemoryLegacyPathUsageStore()
    store.record("product.detail", new Date("2026-08-04T10:00:00Z"))
    store.record("extras.detail", new Date("2026-08-04T10:05:00Z"))

    const metrics = await computeAcceptanceMetrics(
      providers({ legacyPathUsage: async () => store.snapshot() }),
    )
    expect(metrics.legacyPathUsage.totalHits).toBe(2)
    expect(metrics.legacyPathUsage.allZero).toBe(false)
    expect(metrics.legacyPathUsage.byKey.find((r) => r.key === "product.detail")?.hits).toBe(1)
  })

  it("emits only counts and route keys — no PII fields", async () => {
    const metrics = await computeAcceptanceMetrics(
      providers({ countUnassignedTravelers: async () => 9 }),
    )
    const serialized = JSON.stringify(metrics)
    // The metric is a count; no traveler identity ever rides along.
    expect(serialized).not.toMatch(/email|firstName|lastName|traveler_id|bookingNumber/i)
    const keys = Object.keys(metrics)
    expect(keys.sort()).toEqual(
      [
        "legacyPathUsage",
        "missingCosts",
        "readinessFailures",
        "reconciliationDrift",
        "rollupDisagreement",
        "unassignedTravelers",
      ].sort(),
    )
  })
})
