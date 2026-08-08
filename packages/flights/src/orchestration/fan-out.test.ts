import { describe, expect, it } from "vitest"

import type { FlightAdapterContext, FlightConnectorAdapter } from "../contract/adapter.js"
import type { FlightOffer, FlightSearchRequest } from "../contract/types.js"
import { fanOutFlightSearch } from "./fan-out.js"

function makeOffer(overrides: Partial<FlightOffer>): FlightOffer {
  return {
    offerId: overrides.offerId ?? "ofr_default",
    source: overrides.source ?? "test",
    itineraries: [
      {
        segments: [
          {
            segmentId: "s1",
            carrierCode: "BA",
            flightNumber: "177",
            departure: { iataCode: "LHR", at: "2026-10-15T11:00:00+00:00" },
            arrival: { iataCode: "JFK", at: "2026-10-15T14:00:00-04:00" },
            cabin: "economy",
          },
        ],
      },
    ],
    fareBreakdowns: [
      {
        passengerType: "adult",
        passengerCount: 1,
        baseFare: { amount: "500", currency: "USD" },
        taxes: { amount: "100", currency: "USD" },
        total: { amount: "600", currency: "USD" },
      },
    ],
    totalPrice: overrides.totalPrice ?? { amount: "600", currency: "USD" },
    ...overrides,
  }
}

function makeAdapter(
  provider: string,
  behaviour: {
    offers?: FlightOffer[]
    throws?: Error
    delayMs?: number
    maxSlices?: number
    captureContext?: (ctx: FlightAdapterContext) => void
  } = {},
): FlightConnectorAdapter {
  return {
    capabilities: {
      provider,
      declared: [],
      maxSlicesPerSearch: behaviour.maxSlices,
    },
    async searchFlights(ctx) {
      behaviour.captureContext?.(ctx)
      if (behaviour.delayMs) {
        await new Promise((r) => setTimeout(r, behaviour.delayMs))
      }
      if (behaviour.throws) throw behaviour.throws
      return { offers: behaviour.offers ?? [] }
    },
    async priceOffer() {
      throw new Error("not implemented in test")
    },
    async bookFlight() {
      throw new Error("not implemented in test")
    },
    async getOrder() {
      throw new Error("not implemented in test")
    },
    async cancelOrder() {
      throw new Error("not implemented in test")
    },
  }
}

const oneSliceRequest: FlightSearchRequest = {
  slices: [{ origin: "LHR", destination: "JFK", departureDate: "2026-10-15" }],
  passengers: { adults: 1 },
  cabin: "economy",
}

describe("fanOutFlightSearch", () => {
  it("merges identical itineraries from multiple providers, keeping cheapest as primary", async () => {
    const result = await fanOutFlightSearch({
      adapters: [
        {
          connectionId: "conn_amadeus",
          adapter: makeAdapter("amadeus", {
            offers: [
              makeOffer({ source: "amadeus", totalPrice: { amount: "650", currency: "USD" } }),
            ],
          }),
        },
        {
          connectionId: "conn_hisky",
          adapter: makeAdapter("hisky", {
            offers: [
              makeOffer({ source: "hisky", totalPrice: { amount: "600", currency: "USD" } }),
            ],
          }),
        },
      ],
      request: oneSliceRequest,
    })

    expect(result.offers).toHaveLength(1)
    expect(result.offers[0]?.cheapest.totalPrice.amount).toBe("600")
    expect(result.offers[0]?.cheapest.source).toBe("hisky")
    expect(result.offers[0]?.alternates).toHaveLength(1)
    expect(result.offers[0]?.alternates[0]?.source).toBe("amadeus")
    expect(result.offers[0]?.sourceConnectionIds.sort()).toEqual(["conn_amadeus", "conn_hisky"])
  })

  it("sorts merged offers by cheapest price ascending", async () => {
    const result = await fanOutFlightSearch({
      adapters: [
        {
          connectionId: "conn_a",
          adapter: makeAdapter("a", {
            offers: [
              makeOffer({
                offerId: "ofr_expensive",
                source: "a",
                itineraries: [
                  {
                    segments: [
                      {
                        segmentId: "s",
                        carrierCode: "VS",
                        flightNumber: "3",
                        departure: { iataCode: "LHR", at: "2026-10-15T15:00:00+00:00" },
                        arrival: { iataCode: "JFK", at: "2026-10-15T18:00:00-04:00" },
                        cabin: "economy",
                      },
                    ],
                  },
                ],
                totalPrice: { amount: "1000", currency: "USD" },
              }),
              makeOffer({
                offerId: "ofr_cheap",
                source: "a",
                totalPrice: { amount: "300", currency: "USD" },
              }),
            ],
          }),
        },
      ],
      request: oneSliceRequest,
    })

    expect(result.offers).toHaveLength(2)
    expect(result.offers[0]?.cheapest.totalPrice.amount).toBe("300")
    expect(result.offers[1]?.cheapest.totalPrice.amount).toBe("1000")
  })

  it("flags timed-out connections and returns results from responding ones", async () => {
    const result = await fanOutFlightSearch({
      adapters: [
        {
          connectionId: "conn_fast",
          adapter: makeAdapter("fast", { offers: [makeOffer({ source: "fast" })] }),
        },
        {
          connectionId: "conn_slow",
          adapter: makeAdapter("slow", { delayMs: 200 }),
        },
      ],
      request: oneSliceRequest,
      perConnectionTimeoutMs: 50,
    })

    expect(result.offers).toHaveLength(1)
    const fast = result.perConnection.find((c) => c.connectionId === "conn_fast")
    const slow = result.perConnection.find((c) => c.connectionId === "conn_slow")
    expect(fast?.status).toBe("ok")
    expect(slow?.status).toBe("timeout")
  })

  it("flags connections that throw as 'error' without losing other results", async () => {
    const result = await fanOutFlightSearch({
      adapters: [
        {
          connectionId: "conn_ok",
          adapter: makeAdapter("ok", { offers: [makeOffer({})] }),
        },
        {
          connectionId: "conn_fail",
          adapter: makeAdapter("fail", { throws: new Error("provider down") }),
        },
      ],
      request: oneSliceRequest,
    })

    expect(result.offers).toHaveLength(1)
    const fail = result.perConnection.find((c) => c.connectionId === "conn_fail")
    expect(fail?.status).toBe("error")
    expect(fail?.errorMessage).toBe("provider down")
  })

  it("flags connections that don't support the request's slice count as capability_missing", async () => {
    const result = await fanOutFlightSearch({
      adapters: [
        {
          connectionId: "conn_pp",
          adapter: makeAdapter("point-to-point", {
            maxSlices: 1,
            offers: [makeOffer({})],
          }),
        },
      ],
      request: {
        ...oneSliceRequest,
        slices: [
          ...oneSliceRequest.slices,
          { origin: "JFK", destination: "LAX", departureDate: "2026-10-20" },
        ],
      },
    })

    expect(result.offers).toHaveLength(0)
    expect(result.perConnection[0]?.status).toBe("capability_missing")
  })

  it("respects the limit parameter on the merged result", async () => {
    const result = await fanOutFlightSearch({
      adapters: [
        {
          connectionId: "conn_a",
          adapter: makeAdapter("a", {
            offers: [
              makeOffer({ offerId: "1", totalPrice: { amount: "100", currency: "USD" } }),
              makeOffer({
                offerId: "2",
                itineraries: [
                  {
                    segments: [
                      {
                        segmentId: "s",
                        carrierCode: "AA",
                        flightNumber: "1",
                        departure: { iataCode: "LHR", at: "2026-10-15T20:00:00+00:00" },
                        arrival: { iataCode: "JFK", at: "2026-10-15T23:00:00-04:00" },
                        cabin: "economy",
                      },
                    ],
                  },
                ],
                totalPrice: { amount: "200", currency: "USD" },
              }),
            ],
          }),
        },
      ],
      request: oneSliceRequest,
      limit: 1,
    })

    expect(result.offers).toHaveLength(1)
    expect(result.offers[0]?.cheapest.totalPrice.amount).toBe("100")
  })

  it("propagates adapter context fields to each connection", async () => {
    const controller = new AbortController()
    const captured: FlightAdapterContext[] = []

    await fanOutFlightSearch({
      adapters: [
        {
          connectionId: "conn_a",
          adapter: makeAdapter("a", {
            offers: [makeOffer({})],
            captureContext: (ctx) => {
              captured.push(ctx)
            },
          }),
          context: {
            requestId: "req_1",
            correlationId: "corr_1",
            idempotencyKey: "idem_1",
            environment: "sandbox",
            signal: controller.signal,
          },
        },
      ],
      request: oneSliceRequest,
    })

    expect(captured[0]).toMatchObject({
      connectionId: "conn_a",
      requestId: "req_1",
      correlationId: "corr_1",
      idempotencyKey: "idem_1",
      environment: "sandbox",
    })
    expect(captured[0]?.signal).toBe(controller.signal)
  })

  it("does not choose a fake cheapest offer across unconverted currencies", async () => {
    const result = await fanOutFlightSearch({
      adapters: [
        {
          connectionId: "eur-first",
          adapter: makeAdapter("eur-first", {
            offers: [
              makeOffer({ source: "eur-first", totalPrice: { amount: "900", currency: "EUR" } }),
            ],
          }),
        },
        {
          connectionId: "ron-second",
          adapter: makeAdapter("ron-second", {
            offers: [
              makeOffer({ source: "ron-second", totalPrice: { amount: "10", currency: "RON" } }),
            ],
          }),
        },
      ],
      request: oneSliceRequest,
    })

    expect(result.offers[0]?.cheapest.source).toBe("eur-first")
    expect(result.priceRanking).toEqual({
      status: "unranked_mixed_currency",
      unavailableCurrencies: ["EUR", "RON"],
    })
  })

  it("selects and ranks offers using presentation money with provenance", async () => {
    const result = await fanOutFlightSearch({
      adapters: [
        {
          connectionId: "eur",
          adapter: makeAdapter("eur", {
            offers: [makeOffer({ source: "eur", totalPrice: { amount: "10", currency: "EUR" } })],
          }),
        },
        {
          connectionId: "ron",
          adapter: makeAdapter("ron", {
            offers: [makeOffer({ source: "ron", totalPrice: { amount: "40", currency: "RON" } })],
          }),
        },
      ],
      request: oneSliceRequest,
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

    expect(result.offers[0]?.cheapest.source).toBe("ron")
    expect(result.offers[0]?.cheapestPresentationPrice).toEqual({
      native: { amount: "40", currency: "RON" },
      presentation: { amount: "40", currency: "RON" },
    })
    expect(result.offers[0]?.alternatePresentationPrices?.[0]).toMatchObject({
      native: { amount: "10", currency: "EUR" },
      presentation: { amount: "50.00", currency: "RON" },
      fx: { rate: "5", provider: "bnr" },
    })
    expect(result.priceRanking).toEqual({ status: "ranked_presentation", currency: "RON" })
  })
})
