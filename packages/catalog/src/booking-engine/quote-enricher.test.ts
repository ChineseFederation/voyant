/**
 * Focused tests for the `contentEnricher` hook on `quoteEntity`. The
 * full quote path needs a real DB — these tests stub the drizzle
 * insert chain just enough to verify the hook's call contract:
 *   - Called with the right input when wired and live-resolve succeeds.
 *   - Result attached to the quote response as `shape`.
 *   - Errors swallowed + reported via `onEnricherError` instead of
 *     failing the quote.
 *   - Skipped when the entity is not available (failed live-resolve).
 */

import type { BookingRequirementsV1 } from "@voyant-travel/catalog-contracts/booking-engine/requirements-contracts"
import {
  DEFAULT_PAX_BANDS,
  defaultBookingFields,
  defaultRequirementsFlags,
  defaultTravelerFields,
} from "@voyant-travel/catalog-contracts/booking-engine/requirements-defaults"
import { describe, expect, it, vi } from "vitest"
import type { LiveResolveResult, SourceAdapter } from "../adapter/contract.js"
import { type QuoteContentEnricher, quoteEntity } from "./quote.js"
import { createSourceAdapterRegistry } from "./registry.js"

function makeStubDb() {
  // Mirrors enough of the drizzle chain for `.insert(...).values(...).returning()`.
  return {
    insert() {
      return {
        values(_v: unknown) {
          return {
            async returning() {
              return [{ id: "cquo_x" }]
            },
          }
        },
      }
    },
  } as never
}

function makeAdapter(liveResolve: SourceAdapter["liveResolve"]): SourceAdapter {
  return {
    kind: "stub",
    capabilities: {
      verticals: ["products"],
      supportsLiveResolution: true,
      supportsDriftDetection: false,
      supportsBookingForwarding: false,
      postBookOperations: [],
    },
    connect: async () => undefined,
    pause: async () => undefined,
    disconnect: async () => undefined,
    getState: async () => "active",
    discover: async () => ({ projections: [], next_cursor: undefined }),
    liveResolve,
  }
}

const baseRequest = {
  entityModule: "products",
  entityId: "prod_abc",
  sourceKind: "stub",
  scope: { locale: "en-GB", audience: "customer", market: "GB", currency: "GBP" },
  adapterContext: { connection_id: "conn_1" },
} as const

const okLiveResolve: SourceAdapter["liveResolve"] = async (
  _ctx,
  _req,
): Promise<LiveResolveResult> => ({
  values: { prod_abc: { priceCents: 10000, currency: "GBP" } },
})

const failLiveResolve: SourceAdapter["liveResolve"] = async (
  _ctx,
  _req,
): Promise<LiveResolveResult> => ({
  values: {},
  failed: { prod_abc: "not_found" },
})

const sampleShape: BookingRequirementsV1 = {
  ...defaultRequirementsFlags(),
  paxBands: DEFAULT_PAX_BANDS,
  paxBandsAllowedTotal: { min: 1, max: 8 },
  travelerFields: defaultTravelerFields(),
  bookingFields: defaultBookingFields(),
  paymentIntents: ["hold", "card"],
}

describe("quoteEntity — contentEnricher hook", () => {
  it("attaches the enricher's BookingRequirementsV1 to the quote result", async () => {
    const enricher: QuoteContentEnricher = vi.fn(async () => sampleShape)
    const registry = createSourceAdapterRegistry()
    registry.register(makeAdapter(okLiveResolve))

    const result = await quoteEntity(
      makeStubDb(),
      { registry, contentEnricher: enricher },
      baseRequest,
    )
    expect(result.available).toBe(true)
    expect(result.shape).toEqual(sampleShape)
    expect(enricher).toHaveBeenCalledTimes(1)
  })

  it("threads entity identity + scope into the enricher input", async () => {
    let captured: Parameters<QuoteContentEnricher>[0] | null = null
    const enricher: QuoteContentEnricher = async (input) => {
      captured = input
      return sampleShape
    }
    const registry = createSourceAdapterRegistry()
    registry.register(makeAdapter(okLiveResolve))

    await quoteEntity(makeStubDb(), { registry, contentEnricher: enricher }, baseRequest)
    expect(captured).not.toBeNull()
    expect(captured!.entityModule).toBe("products")
    expect(captured!.entityId).toBe("prod_abc")
    expect(captured!.sourceKind).toBe("stub")
    expect(captured!.scope.locale).toBe("en-GB")
    expect(captured!.scope.market).toBe("GB")
    expect(captured!.scope.currency).toBe("GBP")
  })

  it("omits shape when no enricher is wired (today's default)", async () => {
    const registry = createSourceAdapterRegistry()
    registry.register(makeAdapter(okLiveResolve))
    const result = await quoteEntity(makeStubDb(), { registry }, baseRequest)
    expect(result.shape).toBeUndefined()
  })

  it("skips the enricher when live-resolve fails (entity not available)", async () => {
    const enricher: QuoteContentEnricher = vi.fn(async () => sampleShape)
    const registry = createSourceAdapterRegistry()
    registry.register(makeAdapter(failLiveResolve))

    const result = await quoteEntity(
      makeStubDb(),
      { registry, contentEnricher: enricher },
      baseRequest,
    )
    expect(result.available).toBe(false)
    expect(result.shape).toBeUndefined()
    expect(enricher).not.toHaveBeenCalled()
  })

  it("swallows enricher errors and reports via onEnricherError — quote still succeeds", async () => {
    const enricher: QuoteContentEnricher = async () => {
      throw new Error("content-service unreachable")
    }
    const errors: Array<{ entityModule: string; entityId: string; reason: string }> = []
    const registry = createSourceAdapterRegistry()
    registry.register(makeAdapter(okLiveResolve))

    const result = await quoteEntity(
      makeStubDb(),
      { registry, contentEnricher: enricher, onEnricherError: (e) => errors.push(e) },
      baseRequest,
    )

    // Quote succeeded — the enricher error didn't block.
    expect(result.available).toBe(true)
    expect(result.shape).toBeUndefined()
    // Diagnostic surfaced.
    expect(errors).toHaveLength(1)
    expect(errors[0]?.entityModule).toBe("products")
    expect(errors[0]?.entityId).toBe("prod_abc")
    expect(errors[0]?.reason).toContain("content-service unreachable")
  })

  it("returns shape: undefined when the enricher returns null (entity has no content)", async () => {
    const enricher: QuoteContentEnricher = async () => null
    const registry = createSourceAdapterRegistry()
    registry.register(makeAdapter(okLiveResolve))

    const result = await quoteEntity(
      makeStubDb(),
      { registry, contentEnricher: enricher },
      baseRequest,
    )
    expect(result.available).toBe(true)
    expect(result.shape).toBeUndefined()
  })
})
