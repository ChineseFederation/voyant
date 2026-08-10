import type {
  AvailabilityCandidate,
  SourceAdapter,
} from "@voyant-travel/catalog-contracts/adapter/contract"
import type { FlightConnectorAdapter, FlightOffer } from "@voyant-travel/flights"
import { describe, expect, it, vi } from "vitest"

import {
  createManagedStorefrontShoppingRuntime,
  createStorefrontShoppingLiveProvider,
  type StorefrontResolvedScope,
  type StorefrontShoppingContext,
} from "../../src/shopping/index.js"

const context = {
  storefrontId: "storefront_trusted",
  channelId: "channel_trusted",
  userId: "user_trusted",
  buyerAccountId: "buyer_trusted",
} satisfies StorefrontShoppingContext

const scope = {
  marketId: "market_ro",
  locale: "ro-RO",
  currency: "EUR",
  available: {
    marketIds: ["market_ro"],
    locales: ["ro-RO"],
    currencies: ["EUR"],
  },
} satisfies StorefrontResolvedScope

function flightOffer(overrides: Partial<FlightOffer> = {}): FlightOffer {
  return {
    offerId: "provider_offer_secret",
    source: "provider_secret",
    itineraries: [
      {
        duration: "PT2H30M",
        segments: [
          {
            segmentId: "segment_secret",
            carrierCode: "RO",
            flightNumber: "101",
            departure: { iataCode: "OTP", at: "2026-09-10T08:00:00+03:00" },
            arrival: { iataCode: "FCO", at: "2026-09-10T09:30:00+02:00" },
            cabin: "economy",
          },
        ],
      },
    ],
    fareBreakdowns: [],
    totalPrice: { amount: "125.00", currency: "EUR" },
    expiresAt: "2026-08-08T10:04:00.000Z",
    providerData: { vendorLocator: "vendor_secret" },
    ...overrides,
  }
}

function flightAdapter(search: FlightConnectorAdapter["searchFlights"]): FlightConnectorAdapter {
  return {
    capabilities: { provider: "secret-provider", declared: [] },
    searchFlights: search,
    async priceOffer() {
      throw new Error("not used")
    },
    async bookFlight() {
      throw new Error("not used")
    },
    async getOrder() {
      throw new Error("not used")
    },
    async cancelOrder() {
      throw new Error("not used")
    },
  }
}

function stayAdapter(searchAvailability: NonNullable<SourceAdapter["searchAvailability"]>) {
  return {
    kind: "secret-stay-source",
    capabilities: {
      verticals: ["accommodations"],
      supportsLiveResolution: true,
      supportsAvailabilitySearch: true,
      supportsDriftDetection: false,
      supportsBookingForwarding: false,
      postBookOperations: [],
    },
    searchAvailability,
  } satisfies SourceAdapter
}

describe("storefront live shopping provider", () => {
  it("maps flight criteria, fans out admitted sources, and retains partial health + expiry", async () => {
    const search = vi.fn(async () => ({ offers: [flightOffer()] }))
    const resolve = vi.fn(async () => ({
      adapters: [
        { connectionId: "connection_secret_ok", adapter: flightAdapter(search) },
        {
          connectionId: "connection_secret_failed",
          adapter: flightAdapter(async () => {
            throw new Error("upstream failed")
          }),
        },
      ],
    }))
    const provider = createStorefrontShoppingLiveProvider({ flights: { resolve } })

    const page = await provider.searchFlights({
      context,
      scope,
      intent: {
        kind: "flight",
        slices: [{ origin: "OTP", destination: "FCO", departureDate: "2026-09-10" }],
        travelers: { adults: 2, childrenAges: [7, 12], infants: 1 },
        cabin: "business",
        directOnly: true,
        pagination: { cursor: "opaque-cursor-0001", limit: 25 },
      },
    })

    expect(resolve).toHaveBeenCalledWith({
      context,
      scope,
      intent: {
        kind: "flight",
        slices: [{ origin: "OTP", destination: "FCO", departureDate: "2026-09-10" }],
        travelers: { adults: 2, childrenAges: [7, 12], infants: 1 },
        cabin: "business",
        directOnly: true,
        pagination: { cursor: "opaque-cursor-0001", limit: 25 },
      },
    })
    expect(search).toHaveBeenCalledWith(
      { connectionId: "connection_secret_ok" },
      {
        slices: [{ origin: "OTP", destination: "FCO", departureDate: "2026-09-10" }],
        passengers: { adults: 2, children: 2, infants: 1 },
        cabin: "business",
        searchOptions: { directOnly: true },
        pagination: { cursor: "opaque-cursor-0001", limit: 25 },
      },
    )
    expect(page.sources).toEqual([{ status: "ok" }, { status: "error" }])
    expect(page.items[0]).toMatchObject({
      nativePrice: { amount: "125.00", currency: "EUR" },
      expiresAt: "2026-08-08T10:04:00.000Z",
      itineraries: [
        {
          segments: [
            {
              origin: { code: "OTP", at: "2026-09-10T08:00:00+03:00" },
              destination: { code: "FCO", at: "2026-09-10T09:30:00+02:00" },
              marketingCarrier: "RO",
              flightNumber: "101",
            },
          ],
        },
      ],
    })
  })

  it("maps trusted scope and stay criteria across sourced availability without public identity leakage", async () => {
    const searchAvailability = vi.fn(async () => ({
      status: "partial" as const,
      candidates: [
        {
          candidateRef: "candidate_secret",
          entity_module: "accommodations",
          entity_id: "accommodation_secret",
          selection: {
            rooms: [
              {
                ratePlanId: "rate_secret",
                roomTypeId: "room_secret",
                occupancy: { adults: 2, children: 1 },
              },
            ],
          },
          price: { amount: "450.00", currency: "EUR" },
          source: { kind: "sourced" as const, connectionId: "connection_secret" },
          expiresAt: new Date("2026-08-08T10:03:00.000Z"),
          providerData: { net: "300.00", supplierRef: "supplier_secret" },
        },
      ],
    }))
    const provider = createStorefrontShoppingLiveProvider({
      stays: {
        resolve: vi.fn(async () => ({
          adapters: [
            {
              connectionId: "connection_secret",
              adapter: stayAdapter(searchAvailability),
            },
          ],
        })),
        present: vi.fn(async () => ({
          title: "Hotel Public",
          roomName: "Family room",
          boardName: "Breakfast",
          bookingTarget: {
            entityModule: "accommodations",
            entityId: "accommodation_canonical",
            sourceKind: "voyant-connect",
            sourceConnectionId: "connection_secret",
            sourceRef: "accommodation_secret",
          },
        })),
      },
    })
    const intent = {
      kind: "stay" as const,
      destination: { countryCode: "IT", city: "Rome", latitude: 41.9, longitude: 12.5 },
      checkIn: "2026-09-10",
      checkOut: "2026-09-15",
      rooms: [{ adults: 2, childrenAges: [6] }],
      minStars: 4,
      pagination: { cursor: "opaque-cursor-0002", limit: 15 },
    }

    const page = await provider.searchStays({ context, scope, intent })

    expect(searchAvailability).toHaveBeenCalledWith(
      { connection_id: "connection_secret" },
      {
        vertical: "accommodations",
        criteriaVersion: "accommodations.v1",
        criteria: {
          destination: { countryCode: "IT", city: "Rome" },
          near: { latitude: 41.9, longitude: 12.5 },
          checkIn: "2026-09-10",
          checkOut: "2026-09-15",
          rooms: [{ adults: 2, children: 1, childrenAges: [6] }],
          minStars: 4,
        },
        scope: { locale: "ro-RO", audience: "storefront", market: "market_ro", currency: "EUR" },
        cursor: "opaque-cursor-0002",
        limit: 15,
      },
    )
    expect(page.sources).toEqual([{ status: "partial" }])
    expect(page.items[0]).toMatchObject({
      title: "Hotel Public",
      expiresAt: "2026-08-08T10:03:00.000Z",
    })

    const issued: Array<Record<string, unknown>> = []
    const runtime = createManagedStorefrontShoppingRuntime({
      markets: {
        listActiveMarkets: async () => [
          {
            id: scope.marketId,
            defaultLocale: scope.locale,
            defaultCurrency: scope.currency,
            locales: [scope.locale],
            currencies: [scope.currency],
          },
        ],
      },
      catalog: { searchSlice: async () => ({ items: [], total: 0 }) },
      live: provider,
      references: {
        redeem: async () => null,
        issue: async (input) => {
          issued.push(input as unknown as Record<string, unknown>)
          return {
            ref: `opaque-reference-${issued.length.toString().padStart(4, "0")}`,
            expiresAt: "2026-08-08T10:05:00.000Z",
          }
        },
      },
      now: () => new Date("2026-08-08T10:00:00.000Z"),
    })
    const publicResult = await runtime.search(context, {
      scope,
      intent: { ...intent, pagination: { limit: 15 } },
    })
    const serialized = JSON.stringify(publicResult)
    expect(serialized).not.toContain("connection_secret")
    expect(serialized).not.toContain("accommodation_secret")
    expect(serialized).not.toContain("supplier_secret")
    expect(serialized).not.toContain("providerData")
    expect(issued).toHaveLength(2)
    expect(JSON.stringify(issued)).not.toContain("supplier_secret")
    expect(issued).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          purpose: "stay-offer",
          payload: {
            selection: expect.objectContaining({
              target: expect.objectContaining({ entityId: "accommodation_canonical" }),
              configure: expect.objectContaining({
                dateRange: { checkIn: "2026-09-10", checkOut: "2026-09-15" },
              }),
            }),
          },
        }),
      ]),
    )
  })

  it("fans out closed dynamic-package sources, maps occupancy, and hides source health identities", async () => {
    const search = vi.fn(async () => ({
      status: "partial" as const,
      offers: [
        {
          nativePrice: { amount: "999.00", currency: "EUR" },
          title: "Rome escape",
          origin: "OTP",
          destination: "Rome",
          departureDate: "2026-09-10",
          nights: 5,
          accommodationName: "Hotel Public",
          expiresAt: "2026-08-08T10:02:00.000Z",
          selection: { upstreamOfferId: "package_offer_secret" },
          providerData: { connectionId: "connection_secret" },
        },
      ],
    }))
    const provider = createStorefrontShoppingLiveProvider({
      packages: {
        resolveSources: vi.fn(async ({ context: trustedContext, scope: trustedScope }) => {
          expect(trustedContext).toBe(context)
          expect(trustedScope).toBe(scope)
          return [
            { continuationKey: "packages-primary", search },
            {
              continuationKey: "packages-failing",
              search: async () => {
                throw new Error("second source failed")
              },
            },
          ]
        }),
      },
    })
    const intent = {
      kind: "package" as const,
      origin: "OTP",
      destination: { countryCode: "IT", city: "Rome" },
      departureDateFrom: "2026-09-01",
      departureDateTo: "2026-09-30",
      nights: { min: 5, max: 7 },
      travelers: { adults: 2, childrenAges: [9], infants: 1 },
      boards: ["AI"],
      minStars: 4,
      pagination: { cursor: "opaque-cursor-0003", limit: 30 },
    }

    const page = await provider.searchPackages({ context, scope, intent })

    expect(search).toHaveBeenCalledWith({
      origin: "OTP",
      destination: { countryCode: "IT", city: "Rome" },
      departureDateFrom: "2026-09-01",
      departureDateTo: "2026-09-30",
      nights: { min: 5, max: 7 },
      occupancy: { adults: 2, children: 1, childrenAges: [9], infants: 1 },
      boards: ["AI"],
      minStars: 4,
      pagination: { cursor: "opaque-cursor-0003", limit: 30 },
      scope: { marketId: "market_ro", locale: "ro-RO", currency: "EUR" },
    })
    expect(page.sources).toEqual([{ status: "partial" }, { status: "error" }])
    expect(page.items[0]).toMatchObject({
      title: "Rome escape",
      expiresAt: "2026-08-08T10:02:00.000Z",
    })
    expect(JSON.stringify(page.sources)).not.toContain("connection_secret")
  })

  it("fails unavailable for unconfigured live domains and reports package timeouts without identities", async () => {
    const unavailable = createStorefrontShoppingLiveProvider({})
    await expect(
      unavailable.searchFlights({
        context,
        scope,
        intent: {
          kind: "flight",
          slices: [{ origin: "OTP", destination: "FCO", departureDate: "2026-09-10" }],
          travelers: { adults: 1 },
        },
      }),
    ).resolves.toEqual({ items: [], sources: [{ status: "unavailable" }] })

    const timed = createStorefrontShoppingLiveProvider({
      perSourceTimeoutMs: 1,
      packages: {
        resolveSources: async () => [
          {
            continuationKey: "packages-slow",
            search: async () => {
              await new Promise((resolve) => setTimeout(resolve, 20))
              return { offers: [] }
            },
          },
        ],
      },
    })
    const page = await timed.searchPackages({
      context,
      scope,
      intent: {
        kind: "package",
        origin: "OTP",
        destination: { city: "Rome" },
        departureDateFrom: "2026-09-01",
        departureDateTo: "2026-09-30",
        nights: { min: 5, max: 7 },
        travelers: { adults: 2 },
      },
    })
    expect(page).toEqual({ items: [], sources: [{ status: "timeout" }] })
  })

  it("fails unavailable when configured resolvers admit no live sources", async () => {
    const provider = createStorefrontShoppingLiveProvider({
      flights: { resolve: async () => ({ adapters: [] }) },
      stays: { resolve: async () => ({}), present: async () => undefined },
      packages: { resolveSources: async () => [] },
    })

    await expect(
      provider.searchFlights({
        context,
        scope,
        intent: {
          kind: "flight",
          slices: [{ origin: "OTP", destination: "FCO", departureDate: "2026-09-10" }],
          travelers: { adults: 1 },
        },
      }),
    ).resolves.toEqual({ items: [], sources: [{ status: "unavailable" }] })
    await expect(
      provider.searchStays({
        context,
        scope,
        intent: {
          kind: "stay",
          destination: { city: "Rome" },
          checkIn: "2026-09-10",
          checkOut: "2026-09-15",
          rooms: [{ adults: 1 }],
        },
      }),
    ).resolves.toEqual({ items: [], sources: [{ status: "unavailable" }] })
    await expect(
      provider.searchPackages({
        context,
        scope,
        intent: {
          kind: "package",
          origin: "OTP",
          destination: { city: "Rome" },
          departureDateFrom: "2026-09-01",
          departureDateTo: "2026-09-30",
          nights: { min: 5, max: 7 },
          travelers: { adults: 2 },
        },
      }),
    ).resolves.toEqual({ items: [], sources: [{ status: "unavailable" }] })
  })

  it("drops a stay whose presentation fails without aborting the live page", async () => {
    const candidate = {
      candidateRef: "candidate_secret",
      entity_module: "accommodations",
      entity_id: "accommodation_secret",
      selection: {
        rooms: [{ roomTypeId: "room_secret", ratePlanId: "rate_secret", occupancy: { adults: 1 } }],
      },
      price: { amount: "450.00", currency: "EUR" },
      source: { kind: "sourced" as const, connectionId: "connection_secret" },
    } satisfies AvailabilityCandidate
    const provider = createStorefrontShoppingLiveProvider({
      stays: {
        resolve: async () => ({
          adapters: [
            {
              connectionId: "connection_secret",
              adapter: stayAdapter(async () => ({
                status: "ok",
                candidates: [candidate, { ...candidate, candidateRef: "candidate_failed" }],
              })),
            },
          ],
        }),
        present: async ({ candidate: presented }) => {
          if (presented.candidateRef === "candidate_failed") throw new Error("catalog unavailable")
          return {
            title: "Hotel Public",
            bookingTarget: {
              entityModule: "accommodations",
              entityId: "accommodation_canonical",
              sourceKind: "voyant-connect",
              sourceConnectionId: "connection_secret",
              sourceRef: "accommodation_secret",
            },
          }
        },
      },
    })

    const page = await provider.searchStays({
      context,
      scope,
      intent: {
        kind: "stay",
        destination: { city: "Rome" },
        checkIn: "2026-09-10",
        checkOut: "2026-09-15",
        rooms: [{ adults: 1 }],
      },
    })

    expect(page.items).toHaveLength(1)
    expect(page.sources).toEqual([{ status: "partial" }])
  })
})
