import { beforeEach, describe, expect, it, vi } from "vitest"

const searchAcrossProviders = vi.fn()

vi.mock("@voyant-travel/connect-sdk", () => ({
  createVoyantConnectClient: vi.fn(() => ({ packages: { searchAcrossProviders } })),
}))

import { createVoyantConnectPublicApiPackageSourceProvider } from "./public-api-package-sources.js"

function primitives(env: Record<string, unknown>) {
  return {
    env: vi.fn(() => env),
    database: {},
    storage: {},
    events: {},
    config: {},
  } as never
}

const input = {
  origin: "OTP",
  destination: { countryCode: "IT", city: "Rome" },
  departureDateFrom: "2026-09-01",
  departureDateTo: "2026-09-30",
  nights: { min: 5, max: 7 },
  occupancy: { adults: 2, children: 1, childrenAges: [9] },
  boards: ["AI"],
  pagination: { cursor: "opaque-cursor", limit: 20 },
  scope: {
    marketId: "market_ro",
    locale: "ro-RO",
    currency: "EUR",
    available: {
      marketIds: ["market_ro"],
      locales: ["ro-RO"],
      currencies: ["EUR"],
    },
  },
}

describe("Voyant Connect Storefront package sources", () => {
  beforeEach(() => searchAcrossProviders.mockReset())

  it("keeps credentials and connection identity behind the opaque selection", async () => {
    searchAcrossProviders.mockResolvedValue({
      offers: [
        {
          id: "offer_secret",
          connectionId: "connection_secret",
          supplierId: "supplier_secret",
          productRef: { entityModule: "products", entityId: "product_secret" },
          title: "Rome escape",
          stay: {
            ref: { entityModule: "accommodations", entityId: "hotel_secret" },
            name: "Hotel Public",
            board: "AI",
            checkIn: "2026-09-10",
            checkOut: "2026-09-15",
            nights: 5,
            occupancy: { adults: 2 },
          },
          flights: [
            {
              origin: "OTP",
              destination: "FCO",
              departureAt: "2026-09-10T07:00:00.000Z",
            },
          ],
          pricing: {
            perPerson: { amountMinor: 50000, currency: "EUR", currencyPrecision: 2 },
            total: { amountMinor: 100000, currency: "EUR", currencyPrecision: 2 },
          },
          cancellationPolicy: { refundable: false, penalties: [] },
          expiresAt: "2026-08-08T10:05:00.000Z",
        },
      ],
      connectionDiagnostics: [{ connectionId: "connection_secret", status: "ok" }],
    })
    const provider = createVoyantConnectPublicApiPackageSourceProvider(
      primitives({ VOYANT_API_KEY: "credential_secret", VOYANT_CONNECT_OPERATOR_ID: "op_1" }),
    )
    const sources = await provider.resolveSources({
      context: { channelId: "ch_1" },
      scope: input.scope,
      destination: input.destination,
    })
    const result = await sources[0]?.search(input)

    expect(searchAcrossProviders).toHaveBeenCalledWith(
      expect.objectContaining({
        departure: { airportCodes: ["OTP"] },
        destination: { countryCode: "IT", city: "Rome" },
        flightIncluded: true,
      }),
      { operatorId: "op_1" },
    )
    expect(result).toMatchObject({
      status: "ok",
      offers: [
        {
          nativePrice: { amount: "1000.00", currency: "EUR" },
          title: "Rome escape",
          accommodationName: "Hotel Public",
          boardName: "AI",
        },
      ],
    })
    expect(JSON.stringify(result)).not.toContain("credential_secret")
    expect(result?.offers[0]).not.toHaveProperty("providerData")
    expect(result?.offers[0]?.selection).toEqual({
      target: {
        entityModule: "products",
        entityId: "product_secret",
        sourceKind: "voyant-connect",
        sourceConnectionId: "connection_secret",
        sourceRef: "hotel_secret",
      },
      configure: {
        departureDate: "2026-09-10",
        departureAirportCode: "OTP",
        nights: 5,
        pax: { adult: 2 },
        board: "AI",
      },
      offerExpiresAt: "2026-08-08T10:05:00.000Z",
    })
    expect(JSON.stringify(result?.offers[0]?.selection)).not.toContain("offer_secret")
    expect(JSON.stringify(result?.offers[0]?.selection)).not.toContain("supplier_secret")
  })

  it("fails closed when Connect cannot enforce the requested package filter", async () => {
    const provider = createVoyantConnectPublicApiPackageSourceProvider(
      primitives({ VOYANT_API_KEY: "key", VOYANT_CONNECT_OPERATOR_ID: "op_1" }),
    )
    const [source] = await provider.resolveSources({
      context: { channelId: "ch_1" },
      scope: input.scope,
      destination: input.destination,
    })
    await expect(source?.search({ ...input, minStars: 4 })).rejects.toThrow(
      "does not support a minimum-stars constraint",
    )
    expect(searchAcrossProviders).not.toHaveBeenCalled()
  })

  it("maps the public free-text destination query to Connect's city search", async () => {
    searchAcrossProviders.mockResolvedValue({ offers: [] })
    const provider = createVoyantConnectPublicApiPackageSourceProvider(
      primitives({ VOYANT_API_KEY: "key", VOYANT_CONNECT_OPERATOR_ID: "op_1" }),
    )
    const queryInput = {
      ...input,
      destination: { query: "Paris" },
      boards: undefined,
      pagination: undefined,
    }
    const [source] = await provider.resolveSources({
      context: { channelId: "ch_1" },
      scope: input.scope,
      destination: queryInput.destination,
    })

    await expect(source?.search(queryInput)).resolves.toMatchObject({ status: "empty" })
    expect(searchAcrossProviders).toHaveBeenCalledWith(
      expect.objectContaining({ destination: { city: "Paris" } }),
      { operatorId: "op_1" },
    )
  })

  it("continues to reject coordinates that Connect cannot enforce", async () => {
    const provider = createVoyantConnectPublicApiPackageSourceProvider(
      primitives({ VOYANT_API_KEY: "key", VOYANT_CONNECT_OPERATOR_ID: "op_1" }),
    )
    const [source] = await provider.resolveSources({
      context: { channelId: "ch_1" },
      scope: input.scope,
      destination: { latitude: 48.8566, longitude: 2.3522 },
    })

    await expect(
      source?.search({
        ...input,
        destination: { latitude: 48.8566, longitude: 2.3522 },
      }),
    ).rejects.toThrow("does not support coordinate destinations")
    expect(searchAcrossProviders).not.toHaveBeenCalled()
  })

  it("returns no source when server-owned Connect configuration is absent", async () => {
    const provider = createVoyantConnectPublicApiPackageSourceProvider(primitives({}))
    await expect(
      provider.resolveSources({
        context: { channelId: "ch_1" },
        scope: input.scope,
        destination: input.destination,
      }),
    ).resolves.toEqual([])
  })
})
