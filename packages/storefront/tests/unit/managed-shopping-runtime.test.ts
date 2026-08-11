import { catalogInventoryRuntimeExtension } from "@voyant-travel/inventory/catalog-runtime-extension"
import { describe, expect, it, vi } from "vitest"

import {
  createManagedStorefrontShoppingRuntime,
  inspirationCatalogSlice,
  type StorefrontInternalFlightOffer,
  type StorefrontInternalPackageOffer,
  type StorefrontShoppingContext,
  StorefrontShoppingScopeError,
} from "../../src/shopping/index.js"

const NOW = new Date("2026-08-08T10:00:00.000Z")
const context = {
  storefrontId: "storefront_public",
  channelId: "channel_web",
  userId: "user_private",
  buyerAccountId: "buyer_private",
} satisfies StorefrontShoppingContext

const market = {
  id: "market_ro",
  defaultLocale: "ro-RO",
  defaultCurrency: "RON",
  locales: ["ro-RO", "en-GB"],
  currencies: ["RON", "EUR"],
  isDefault: true,
}

function dependencies(overrides: Record<string, unknown> = {}) {
  let sequence = 0
  return {
    markets: {
      listActiveMarkets: vi.fn(async () => [market]),
    },
    catalog: {
      searchSlice: vi.fn(async () => ({ items: [], total: 0 })),
    },
    live: {
      searchFlights: vi.fn(async () => ({ items: [], sources: [] })),
      searchStays: vi.fn(async () => ({ items: [], sources: [] })),
      searchPackages: vi.fn(async () => ({ items: [], sources: [] })),
      searchCruises: vi.fn(async () => ({ items: [], sources: [] })),
    },
    references: {
      redeem: vi.fn(async () => null),
      issue: vi.fn(async () => ({
        ref: `opaque-reference-${String(++sequence).padStart(6, "0")}`,
        expiresAt: "2026-08-08T10:10:00.000Z",
      })),
    },
    now: () => NOW,
    ...overrides,
  }
}

describe("managed storefront shopping scope", () => {
  it("uses active trusted channel config, returns defaults/pickers, and passes no PII", async () => {
    const deps = dependencies()
    const runtime = createManagedStorefrontShoppingRuntime(deps)

    await expect(runtime.resolveScope(context, {})).resolves.toEqual({
      marketId: "market_ro",
      locale: "ro-RO",
      currency: "RON",
      available: {
        marketIds: ["market_ro"],
        locales: ["ro-RO", "en-GB"],
        currencies: ["RON", "EUR"],
      },
    })
    expect(deps.markets.listActiveMarkets).toHaveBeenCalledWith({
      storefrontId: "storefront_public",
      channelId: "channel_web",
    })
    expect(JSON.stringify(deps.markets.listActiveMarkets.mock.calls)).not.toContain("user_private")
    expect(JSON.stringify(deps.markets.listActiveMarkets.mock.calls)).not.toContain("buyer_private")
  })

  it("resolves language ranges and currency choices across active markets", async () => {
    const markets = [
      {
        id: "market_eu",
        defaultLocale: "en-GB",
        defaultCurrency: "EUR",
        locales: ["en-GB", "fr-FR", "it-IT"],
        currencies: ["EUR"],
        isDefault: true,
      },
      {
        id: "market_ro",
        defaultLocale: "ro-RO",
        defaultCurrency: "RON",
        locales: ["ro-RO", "en-GB"],
        currencies: ["RON", "EUR"],
      },
      {
        id: "market_uk",
        defaultLocale: "en-GB",
        defaultCurrency: "GBP",
        locales: ["en-GB"],
        currencies: ["GBP", "EUR"],
      },
    ]
    const runtime = createManagedStorefrontShoppingRuntime(
      dependencies({ markets: { listActiveMarkets: vi.fn(async () => markets) } }),
    )

    await expect(runtime.resolveScope(context, { locale: "en" })).resolves.toMatchObject({
      marketId: "market_eu",
      locale: "en-GB",
      currency: "EUR",
      available: {
        marketIds: ["market_eu", "market_ro", "market_uk"],
        locales: ["en-GB", "fr-FR", "it-IT", "ro-RO"],
        currencies: ["EUR", "RON", "GBP"],
      },
    })
    await expect(runtime.resolveScope(context, { locale: "ro" })).resolves.toMatchObject({
      marketId: "market_ro",
      locale: "ro-RO",
      currency: "RON",
    })
    await expect(runtime.resolveScope(context, { currency: "GBP" })).resolves.toMatchObject({
      marketId: "market_eu",
      locale: "en-GB",
      currency: "GBP",
    })
    await expect(
      runtime.resolveScope(context, { locale: "ro", currency: "GBP" }),
    ).resolves.toMatchObject({
      marketId: "market_ro",
      locale: "ro-RO",
      currency: "GBP",
    })
    await expect(
      runtime.resolveScope(context, { locale: "fr-FR", currency: "RON" }),
    ).resolves.toMatchObject({
      marketId: "market_eu",
      locale: "fr-FR",
      currency: "RON",
    })
    await expect(runtime.resolveScope(context, { locale: "en-US" })).rejects.toMatchObject({
      code: "storefront_shopping_scope_unsupported",
      selector: "locale",
    })
  })

  it.each([
    ["marketId", { marketId: "market_inactive" }],
    ["locale", { locale: "de-DE" }],
    ["currency", { currency: "USD" }],
  ] as const)("rejects an unsupported %s instead of trusting or silently switching it", async (_, requested) => {
    const runtime = createManagedStorefrontShoppingRuntime(dependencies())
    await expect(runtime.resolveScope(context, requested)).rejects.toBeInstanceOf(
      StorefrontShoppingScopeError,
    )
  })
})

describe("managed indexed inspiration", () => {
  it("maps product UX groups to server-authored Catalog slices and taxonomy", () => {
    const customerFilterFields = new Set(
      catalogInventoryRuntimeExtension.productFieldPolicy
        .filter(
          (policy) => policy.query === "indexed-column" && policy.visibility.includes("customer"),
        )
        .map((policy) => policy.path.replace(/\[\]$/, "")),
    )
    expect(customerFilterFields.has("familyCode")).toBe(true)
    expect(customerFilterFields.has("subtypeCode")).toBe(true)
    expect(customerFilterFields.has("categorySlugs")).toBe(true)
    expect(inspirationCatalogSlice("tours")).toEqual({
      vertical: "products",
      filters: [{ kind: "eq", field: "familyCode", value: "tour" }],
    })
    expect(inspirationCatalogSlice("activities").filters).toContainEqual({
      kind: "eq",
      field: "familyCode",
      value: "activity",
    })
    expect(inspirationCatalogSlice("attractions").filters).toContainEqual({
      kind: "eq",
      field: "familyCode",
      value: "attraction",
    })
    expect(inspirationCatalogSlice("experiences")).toMatchObject({ vertical: "products" })
    expect(inspirationCatalogSlice("excursions")).toMatchObject({ vertical: "products" })
    expect(inspirationCatalogSlice("stays")).toEqual({ vertical: "accommodations", filters: [] })
    expect(inspirationCatalogSlice("cruises")).toEqual({ vertical: "cruises", filters: [] })
    expect(inspirationCatalogSlice("charters")).toEqual({ vertical: "charters", filters: [] })
  })

  it("preserves each Catalog group's total/cursor and does not invent a global cursor", async () => {
    const deps = dependencies({
      catalog: {
        searchSlice: vi
          .fn()
          .mockResolvedValueOnce({
            items: [{ entityId: "product_1", title: "Tour" }],
            total: 12,
            nextCursor: "catalog-cursor-products-0001",
          })
          .mockResolvedValueOnce({
            items: [{ entityId: "cruise_1", title: "Cruise" }],
            total: 4,
            nextCursor: "catalog-cursor-cruises-0001",
          }),
      },
    })
    const runtime = createManagedStorefrontShoppingRuntime(deps)
    const scope = await runtime.resolveScope(context, {})
    const result = await runtime.search(context, {
      scope,
      intent: {
        kind: "indexed-inspiration",
        groups: [{ group: "tours" }, { group: "cruises" }],
      },
    })

    expect(result).toMatchObject({
      kind: "indexed-inspiration",
      groups: [
        { group: "tours", total: 12, nextCursor: "catalog-cursor-products-0001" },
        { group: "cruises", total: 4, nextCursor: "catalog-cursor-cruises-0001" },
      ],
    })
    expect(result).not.toHaveProperty("nextCursor")
  })
})

describe("managed live shopping", () => {
  const flightIntent = {
    kind: "flight" as const,
    slices: [{ origin: "OTP", destination: "LHR", departureDate: "2026-09-10" }],
    travelers: { adults: 1 },
  }

  function flight(amount: string, currency: string, marker: string): StorefrontInternalFlightOffer {
    return {
      nativePrice: { amount, currency },
      selection: { providerOffer: marker },
      providerData: { connectionId: `connection_${marker}`, net: "secret" },
      itineraries: [
        {
          segments: [
            {
              origin: { code: "OTP", at: "2026-09-10T08:00:00.000Z" },
              destination: { code: "LHR", at: "2026-09-10T11:00:00.000Z" },
              marketingCarrier: "RO",
              flightNumber: marker,
            },
          ],
        },
      ],
    }
  }

  it("normalizes mixed currency with shared FX, sorts comparably, and keeps provider data opaque", async () => {
    const deps = dependencies({
      live: {
        searchFlights: vi.fn(async () => ({
          items: [flight("100", "EUR", "100"), flight("450", "RON", "450")],
          sources: [{ status: "ok" }, { status: "timeout" }],
        })),
        searchStays: vi.fn(),
        searchPackages: vi.fn(),
        searchCruises: vi.fn(),
      },
      quoteFx: vi.fn(async () => ({
        rate: "5",
        provider: "voyant-data-fx",
        quotedAt: NOW.toISOString(),
        validUntil: "2026-08-09T10:00:00.000Z",
      })),
    })
    const runtime = createManagedStorefrontShoppingRuntime(deps)
    const scope = await runtime.resolveScope(context, {})
    const result = await runtime.search(context, { scope, intent: flightIntent })

    expect(result.kind).toBe("flight")
    if (result.kind !== "flight") return
    expect(result.offers.map((offer) => offer.price.presentation.amount)).toEqual(["450", "500.00"])
    expect(result.offers.map((offer) => Number(offer.price.presentation.amount))).toEqual(
      [...result.offers]
        .map((offer) => Number(offer.price.presentation.amount))
        .sort((left, right) => left - right),
    )
    expect(result.offers.map((offer) => offer.itineraries[0]?.segments[0]?.flightNumber)).toEqual([
      "450",
      "100",
    ])
    expect(result.coverage).toEqual({ status: "partial", succeeded: 1, failed: 0, timedOut: 1 })
    expect(JSON.stringify(result)).not.toContain("connection_")
    expect(JSON.stringify(result)).not.toContain("secret")
    expect(JSON.stringify(result)).not.toContain("user_private")
    expect(JSON.stringify(result)).not.toContain("buyer_private")
    expect(deps.references.issue).toHaveBeenCalledWith(
      expect.objectContaining({
        purpose: "flight-offer",
        ttlSeconds: 900,
        replay: "single-use",
        owner: { userId: "user_private", buyerAccountId: "buyer_private" },
      }),
    )
  })

  it("drops non-comparable prices without FX and marks partial instead of mixing currencies", async () => {
    const deps = dependencies({
      live: {
        searchFlights: vi.fn(async () => ({
          items: [flight("100", "EUR", "100"), flight("450", "RON", "450")],
          sources: [{ status: "ok" }],
        })),
        searchStays: vi.fn(),
        searchPackages: vi.fn(),
        searchCruises: vi.fn(),
      },
    })
    const runtime = createManagedStorefrontShoppingRuntime(deps)
    const scope = await runtime.resolveScope(context, {})
    const result = await runtime.search(context, { scope, intent: flightIntent })
    expect(result.kind).toBe("flight")
    if (result.kind !== "flight") return
    expect(result.offers).toHaveLength(1)
    expect(result.offers[0]?.price.presentation.currency).toBe("RON")
    expect(result.coverage.status).toBe("partial")
  })

  it("forwards only trusted context and no body provider selectors to the live port", async () => {
    const deps = dependencies()
    const runtime = createManagedStorefrontShoppingRuntime(deps)
    const scope = await runtime.resolveScope(context, {})
    await runtime.search(context, { scope, intent: flightIntent })
    const serialized = JSON.stringify(deps.live.searchFlights.mock.calls)
    expect(serialized).not.toContain("providerId")
    expect(serialized).not.toContain("connectionId")
    expect(serialized).toContain("user_private")
    expect(serialized).toContain("buyer_private")
    expect(serialized).toContain("channel_web")
  })

  it("seals per-source live cursors and redeems them only for the bound intent", async () => {
    let continuationPayload: Readonly<Record<string, unknown>> | undefined
    const redeem = vi.fn(async () =>
      continuationPayload ? { payload: continuationPayload } : null,
    )
    const issue = vi.fn(async (input) => {
      if (input.purpose === "live-continuation") continuationPayload = input.payload
      return {
        ref: "opaque-live-continuation-0001",
        expiresAt: "2026-08-08T10:04:00.000Z",
      }
    })
    const searchFlights = vi
      .fn()
      .mockResolvedValueOnce({
        items: [],
        sources: [{ status: "partial" }],
        continuation: { sources: [{ key: "flight:connection_secret", cursor: "raw-page-2" }] },
      })
      .mockResolvedValueOnce({ items: [], sources: [{ status: "empty" }] })
    const runtime = createManagedStorefrontShoppingRuntime(
      dependencies({
        references: { issue, redeem },
        live: { searchFlights, searchStays: vi.fn(), searchPackages: vi.fn() },
      }),
    )
    const scope = await runtime.resolveScope(context, {})
    const first = await runtime.search(context, { scope, intent: flightIntent })
    expect(first).toMatchObject({ nextCursor: "opaque-live-continuation-0001" })
    expect(JSON.stringify(first)).not.toContain("connection_secret")
    expect(JSON.stringify(first)).not.toContain("raw-page-2")

    await runtime.search(context, {
      scope,
      intent: { ...flightIntent, pagination: { cursor: "opaque-live-continuation-0001" } },
    })
    expect(redeem).toHaveBeenCalledWith(
      expect.objectContaining({
        purpose: "live-continuation",
        storefrontId: "storefront_public",
        channelId: "channel_web",
        owner: { userId: "user_private", buyerAccountId: "buyer_private" },
        scope: { marketId: "market_ro", locale: "ro-RO", currency: "RON" },
      }),
    )
    expect(searchFlights.mock.calls[1]?.[0]).toMatchObject({
      intent: flightIntent,
      continuation: {
        sources: [{ key: "flight:connection_secret", cursor: "raw-page-2" }],
      },
    })
    expect(searchFlights.mock.calls[1]?.[0].intent.pagination).toBeUndefined()

    await expect(
      runtime.search(context, {
        scope,
        intent: {
          ...flightIntent,
          slices: [{ origin: "OTP", destination: "CDG", departureDate: "2026-09-10" }],
          pagination: { cursor: "opaque-live-continuation-0001" },
        },
      }),
    ).rejects.toThrow("Storefront shopping continuation is invalid")
  })

  it("binds references to different trusted account owners", async () => {
    const deps = dependencies({
      live: {
        searchFlights: vi.fn(async () => ({ items: [flight("450", "RON", "450")], sources: [] })),
        searchStays: vi.fn(),
        searchPackages: vi.fn(),
        searchCruises: vi.fn(),
      },
    })
    const runtime = createManagedStorefrontShoppingRuntime(deps)
    const scope = await runtime.resolveScope(context, {})
    await runtime.search(context, { scope, intent: flightIntent })
    await runtime.search(
      { ...context, userId: "user_other", buyerAccountId: "buyer_other" },
      { scope, intent: flightIntent },
    )
    expect(deps.references.issue.mock.calls.map(([call]) => call.owner)).toEqual([
      { userId: "user_private", buyerAccountId: "buyer_private" },
      { userId: "user_other", buyerAccountId: "buyer_other" },
    ])
  })

  it("rejects opaque references whose issuer exceeds the bounded TTL", async () => {
    const deps = dependencies({
      references: {
        redeem: vi.fn(async () => null),
        issue: vi.fn(async () => ({
          ref: "opaque-reference-too-long-ttl",
          expiresAt: "2026-08-08T11:00:00.000Z",
        })),
      },
      live: {
        searchFlights: vi.fn(async () => ({ items: [flight("450", "RON", "450")], sources: [] })),
        searchStays: vi.fn(),
        searchPackages: vi.fn(),
        searchCruises: vi.fn(),
      },
    })
    const runtime = createManagedStorefrontShoppingRuntime(deps)
    const scope = await runtime.resolveScope(context, {})
    await expect(runtime.search(context, { scope, intent: flightIntent })).rejects.toThrow(
      "opaque_reference_expiry_invalid",
    )
  })

  it("accepts the bounded TTL when reference persistence advances the clock", async () => {
    let currentTime = NOW.getTime()
    const deps = dependencies({
      now: () => new Date(currentTime),
      references: {
        redeem: vi.fn(async () => null),
        issue: vi.fn(async (input: { ttlSeconds: number }) => {
          currentTime += 50
          return {
            ref: "opaque-reference-after-persistence",
            expiresAt: new Date(currentTime + input.ttlSeconds * 1_000).toISOString(),
          }
        }),
      },
      live: {
        searchFlights: vi.fn(async () => ({ items: [flight("450", "RON", "450")], sources: [] })),
        searchStays: vi.fn(),
        searchPackages: vi.fn(),
        searchCruises: vi.fn(),
      },
    })
    const runtime = createManagedStorefrontShoppingRuntime(deps)
    const scope = await runtime.resolveScope(context, {})

    await expect(runtime.search(context, { scope, intent: flightIntent })).resolves.toMatchObject({
      kind: "flight",
      offers: [{ offerRef: "opaque-reference-after-persistence" }],
    })
  })

  it("seals provider-native package pricing for Trip freeze without trusting presentation FX", async () => {
    const packageOffer = {
      nativePrice: { amount: "1000.00", currency: "RON" },
      title: "Rome escape",
      origin: "OTP",
      destination: "Rome",
      departureDate: "2026-09-10",
      nights: 5,
      accommodationName: "Hotel Roma",
      expiresAt: "2026-08-08T10:08:00.000Z",
      selection: {
        target: {
          entityModule: "products",
          entityId: "product_package_1",
          sourceKind: "voyant-connect",
          sourceConnectionId: "connection_server_only",
          sourceRef: "source_package_1",
        },
        configure: {
          departureDate: "2026-09-10",
          departureAirportCode: "OTP",
          nights: 5,
          pax: { adult: 2 },
          ratePlanId: "rate_1",
        },
        offerExpiresAt: "2026-08-08T10:08:00.000Z",
      },
    } satisfies StorefrontInternalPackageOffer
    const issue = vi.fn(async () => ({
      ref: "opaque-package-reference-0001",
      expiresAt: "2026-08-08T10:10:00.000Z",
    }))
    const runtime = createManagedStorefrontShoppingRuntime(
      dependencies({
        references: { redeem: vi.fn(async () => null), issue },
        live: {
          searchFlights: vi.fn(),
          searchStays: vi.fn(),
          searchPackages: vi.fn(async () => ({
            items: [packageOffer],
            sources: [{ status: "ok" }],
          })),
          searchCruises: vi.fn(),
        },
      }),
    )
    const scope = await runtime.resolveScope(context, {})

    await runtime.search(context, {
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

    expect(issue).toHaveBeenCalledWith(
      expect.objectContaining({
        purpose: "package-offer",
        payload: expect.objectContaining({
          estimatedPricing: {
            currency: "RON",
            subtotalAmountCents: 100_000,
            taxAmountCents: 0,
            totalAmountCents: 100_000,
            priceExpiresAt: "2026-08-08T10:08:00.000Z",
            warnings: ["non_binding_storefront_estimate"],
          },
        }),
      }),
    )
    expect(JSON.stringify(issue.mock.calls)).not.toContain("presentation")
  })
})
