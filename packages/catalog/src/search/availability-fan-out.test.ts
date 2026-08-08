import type {
  AvailabilityCandidate,
  AvailabilitySearchRequest,
  AvailabilitySearchResult,
  SourceAdapter,
} from "@voyant-travel/catalog-contracts/adapter/contract"
import { describe, expect, it } from "vitest"

import { fanOutAvailabilitySearch } from "./availability-fan-out.js"
import type { OwnedAvailabilitySearchHandler, OwnedSearchContext } from "./owned-search-handler.js"

const REQUEST: AvailabilitySearchRequest = {
  vertical: "accommodations",
  criteria: { destination: "Cairo", nights: 3, adults: 2 },
  criteriaVersion: "accommodations/v1",
  scope: { locale: "en-GB", audience: "customer", market: "GB", currency: "USD" },
}

function candidate(id: string, amount: string, currency = "USD"): AvailabilityCandidate {
  return {
    candidateRef: `ref_${id}`,
    entity_module: "accommodations",
    entity_id: id,
    selection: { ratePlanId: `rate_${id}` },
    price: { amount, currency },
  }
}

function adapter(
  kind: string,
  behaviour: {
    supports?: boolean
    verticals?: string[]
    result?: AvailabilitySearchResult
    throws?: Error
    delayMs?: number
  } = {},
): SourceAdapter {
  const supports = behaviour.supports ?? true
  return {
    kind,
    capabilities: {
      verticals: behaviour.verticals ?? ["accommodations"],
      supportsLiveResolution: true,
      supportsAvailabilitySearch: supports,
      supportsDriftDetection: false,
      supportsBookingForwarding: false,
      postBookOperations: [],
    },
    searchAvailability: supports
      ? async () => {
          if (behaviour.delayMs) await new Promise((r) => setTimeout(r, behaviour.delayMs))
          if (behaviour.throws) throw behaviour.throws
          return behaviour.result ?? { candidates: [], status: "empty" }
        }
      : undefined,
  }
}

function ownedHandler(
  module: string,
  candidates: AvailabilityCandidate[],
): { handler: OwnedAvailabilitySearchHandler; context: OwnedSearchContext } {
  return {
    handler: {
      entityModule: module,
      async searchAvailability() {
        return { candidates, status: "ok" }
      },
    },
    // db / adapterContext aren't touched by these handlers under test.
    context: {} as OwnedSearchContext,
  }
}

describe("fanOutAvailabilitySearch", () => {
  it("merges owned + sourced candidates into one price-ranked list", async () => {
    const result = await fanOutAvailabilitySearch({
      adapters: [
        {
          connectionId: "conn_a",
          adapter: adapter("a", {
            result: { candidates: [candidate("a1", "200")], status: "ok" },
          }),
        },
      ],
      ownedHandlers: [ownedHandler("accommodations", [candidate("owned1", "150")])],
      request: REQUEST,
    })

    expect(result.candidates.map((c) => c.entity_id)).toEqual(["owned1", "a1"])
    expect(result.perConnection).toHaveLength(2)
    expect(result.perConnection.find((c) => c.kind === "owned")?.status).toBe("ok")
  })

  it("flags an adapter that doesn't declare the capability, without failing the search", async () => {
    const result = await fanOutAvailabilitySearch({
      adapters: [
        {
          connectionId: "conn_live",
          adapter: adapter("live", {
            result: { candidates: [candidate("x", "300")], status: "ok" },
          }),
        },
        { connectionId: "conn_none", adapter: adapter("none", { supports: false }) },
      ],
      request: REQUEST,
    })

    expect(result.candidates.map((c) => c.entity_id)).toEqual(["x"])
    expect(result.perConnection.find((c) => c.source === "conn_none")?.status).toBe(
      "capability_missing",
    )
  })

  it("flags a timed-out source and still returns the rest (partial success)", async () => {
    const result = await fanOutAvailabilitySearch({
      adapters: [
        {
          connectionId: "fast",
          adapter: adapter("fast", {
            result: { candidates: [candidate("f", "120")], status: "ok" },
          }),
        },
        { connectionId: "slow", adapter: adapter("slow", { delayMs: 50 }) },
      ],
      request: REQUEST,
      perConnectionTimeoutMs: 10,
    })

    expect(result.candidates.map((c) => c.entity_id)).toEqual(["f"])
    expect(result.perConnection.find((c) => c.source === "slow")?.status).toBe("timeout")
  })

  it("flags a throwing source as error", async () => {
    const result = await fanOutAvailabilitySearch({
      adapters: [
        { connectionId: "boom", adapter: adapter("boom", { throws: new Error("upstream 500") }) },
      ],
      request: REQUEST,
    })

    const boom = result.perConnection.find((c) => c.source === "boom")
    expect(boom?.status).toBe("error")
    expect(boom?.errorMessage).toContain("upstream 500")
    expect(result.candidates).toHaveLength(0)
  })

  it("stamps each candidate's origin so a selection can be routed back to its source", async () => {
    const result = await fanOutAvailabilitySearch({
      adapters: [
        {
          connectionId: "conn_a",
          adapter: adapter("a", { result: { candidates: [candidate("a1", "200")], status: "ok" } }),
        },
      ],
      ownedHandlers: [ownedHandler("accommodations", [candidate("owned1", "150")])],
      request: REQUEST,
    })

    const byId = Object.fromEntries(result.candidates.map((c) => [c.entity_id, c.source]))
    expect(byId.a1).toEqual({ kind: "sourced", connectionId: "conn_a" })
    expect(byId.owned1).toEqual({ kind: "owned", module: "accommodations" })
  })

  it("does not clobber an origin the adapter already set (cross-provider case)", async () => {
    const pre = {
      ...candidate("x", "200"),
      source: { kind: "sourced" as const, connectionId: "upstream_real" },
    }
    const result = await fanOutAvailabilitySearch({
      adapters: [
        {
          connectionId: "conn_aggregator",
          adapter: adapter("agg", { result: { candidates: [pre], status: "ok" } }),
        },
      ],
      request: REQUEST,
    })

    expect(result.candidates[0]?.source).toEqual({ kind: "sourced", connectionId: "upstream_real" })
  })

  it("skips sources that don't feed the requested vertical, without querying them", async () => {
    let flightSearched = false
    // A flight connection whose searchAvailability flips a flag if ever called.
    const flightAdapter: SourceAdapter = {
      kind: "flights",
      capabilities: {
        verticals: ["flights"],
        supportsLiveResolution: true,
        supportsAvailabilitySearch: true,
        supportsDriftDetection: false,
        supportsBookingForwarding: false,
        postBookOperations: [],
      },
      async searchAvailability() {
        flightSearched = true
        return { candidates: [], status: "ok" }
      },
    }
    const result = await fanOutAvailabilitySearch({
      adapters: [
        {
          connectionId: "stays",
          adapter: adapter("stays", {
            result: { candidates: [candidate("s", "100")], status: "ok" },
          }),
        },
        { connectionId: "flights", adapter: flightAdapter },
      ],
      ownedHandlers: [ownedHandler("extras", [candidate("e", "50")])],
      request: REQUEST, // vertical: "accommodations"
    })

    expect(flightSearched).toBe(false)
    expect(result.candidates.map((c) => c.entity_id)).toEqual(["s"])
    expect(result.perConnection.find((c) => c.source === "flights")?.status).toBe(
      "vertical_skipped",
    )
    expect(result.perConnection.find((c) => c.source === "extras")?.status).toBe("vertical_skipped")
  })

  it("surfaces each source's pagination cursor on perConnection", async () => {
    const result = await fanOutAvailabilitySearch({
      adapters: [
        {
          connectionId: "paged",
          adapter: adapter("paged", {
            result: {
              candidates: [candidate("p", "100")],
              status: "partial",
              next_cursor: "cur_2",
            },
          }),
        },
      ],
      request: REQUEST,
    })

    expect(result.perConnection.find((c) => c.source === "paged")?.nextCursor).toBe("cur_2")
  })

  it("applies the merged-result limit after ranking", async () => {
    const result = await fanOutAvailabilitySearch({
      adapters: [
        {
          connectionId: "conn",
          adapter: adapter("conn", {
            result: {
              candidates: [candidate("hi", "900"), candidate("lo", "100"), candidate("mid", "500")],
              status: "ok",
            },
          }),
        },
      ],
      request: REQUEST,
      limit: 2,
    })

    expect(result.candidates.map((c) => c.entity_id)).toEqual(["lo", "mid"])
  })

  it("preserves source order instead of meaninglessly ranking mixed native currencies", async () => {
    const result = await fanOutAvailabilitySearch({
      adapters: [
        {
          connectionId: "mixed",
          adapter: adapter("mixed", {
            result: {
              candidates: [candidate("eur", "900", "EUR"), candidate("ron", "10", "RON")],
              status: "ok",
            },
          }),
        },
      ],
      request: REQUEST,
    })

    expect(result.candidates.map((item) => item.entity_id)).toEqual(["eur", "ron"])
    expect(result.priceRanking).toEqual({
      status: "unranked_mixed_currency",
      unavailableCurrencies: ["EUR", "RON"],
    })
  })

  it("ranks in one shopper-selected currency while preserving native prices and FX provenance", async () => {
    const result = await fanOutAvailabilitySearch({
      adapters: [
        {
          connectionId: "mixed",
          adapter: adapter("mixed", {
            result: {
              candidates: [candidate("eur", "10", "EUR"), candidate("ron", "40", "RON")],
              status: "ok",
            },
          }),
        },
      ],
      request: REQUEST,
      presentation: {
        targetCurrency: "RON",
        quoteFx: async () => ({
          rate: "5",
          provider: "bnr",
          quotedAt: "2026-08-08T08:00:00.000Z",
          validUntil: "2026-08-09T08:00:00.000Z",
        }),
      },
    })

    expect(result.candidates.map((item) => item.entity_id)).toEqual(["ron", "eur"])
    expect(result.candidates.find((item) => item.entity_id === "eur")).toMatchObject({
      price: { amount: "10", currency: "EUR" },
      presentationPrice: {
        native: { amount: "10", currency: "EUR" },
        presentation: { amount: "50.00", currency: "RON" },
        fx: { rate: "5", provider: "bnr" },
      },
    })
    expect(result.priceRanking).toEqual({ status: "ranked_presentation", currency: "RON" })
  })
})
