import { describe, expect, it, vi } from "vitest"

import { createClosedStorefrontShoppingLiveProvider } from "../../src/shopping/closed-live-provider.js"

const context = { storefrontId: "sf_1", channelId: "ch_1" }
const scope = {
  marketId: "market_ro",
  locale: "ro-RO",
  currency: "EUR",
  available: { marketIds: ["market_ro"], locales: ["ro-RO"], currencies: ["EUR"] },
}

function primitives() {
  return {
    env: vi.fn(() => ({ SERVER_SECRET: "credential_secret" })),
    database: { resolve: vi.fn(() => ({ id: "db" })) },
    storage: {},
    events: {},
    config: {},
  } as never
}

function markets(active = true) {
  return {
    listActiveMarkets: vi.fn(async () =>
      active
        ? [
            {
              id: "market_ro",
              defaultLocale: "ro-RO",
              defaultCurrency: "EUR",
              locales: ["ro-RO"],
              currencies: ["EUR"],
            },
          ]
        : [],
    ),
  }
}

describe("closed Storefront live provider", () => {
  it("fans out only admitted stay-capable adapters and the owned accommodations handler", async () => {
    const sourcedSearch = vi.fn(async () => ({
      status: "ok" as const,
      candidates: [
        {
          candidateRef: "stay_1",
          entity_module: "accommodations",
          entity_id: "hotel_1",
          selection: { roomTypeId: "room_1", ratePlanId: "rate_1" },
          price: { amount: "300.00", currency: "EUR" },
        },
      ],
    }))
    const ignoredSearch = vi.fn()
    const ownedSearch = vi.fn(async () => ({ candidates: [], status: "empty" as const }))
    const adapters = new Map([
      [
        "stay_connection",
        {
          capabilities: {
            verticals: ["accommodations"],
            supportsAvailabilitySearch: true,
          },
          searchAvailability: sourcedSearch,
        },
      ],
      [
        "cruise_connection",
        {
          capabilities: { verticals: ["cruises"], supportsAvailabilitySearch: true },
          searchAvailability: ignoredSearch,
        },
      ],
    ])
    const registry = {
      connections: () => [...adapters.keys()],
      resolveByConnection: (id: string) => adapters.get(id),
    }
    const catalogServices = {
      ensureSourceRegistry: vi.fn(async () => registry),
      getOwnedAvailabilitySearchHandlers: () => ({
        modules: () => ["accommodations"],
        resolve: () => ({ entityModule: "accommodations", searchAvailability: ownedSearch }),
      }),
    }
    const provider = createClosedStorefrontShoppingLiveProvider({
      primitives: primitives(),
      catalogServices: catalogServices as never,
      markets: markets(),
      loadStayPresentation: vi.fn(async () => ({
        title: "Hotel Public",
        roomName: "Public room",
      })),
    })

    const result = await provider.searchStays({
      context,
      scope,
      intent: {
        kind: "stay",
        destination: { city: "Rome" },
        checkIn: "2026-09-10",
        checkOut: "2026-09-15",
        rooms: [{ adults: 2 }],
      },
    })

    expect(sourcedSearch).toHaveBeenCalledOnce()
    expect(ownedSearch).toHaveBeenCalledOnce()
    expect(ignoredSearch).not.toHaveBeenCalled()
    expect(result.items).toEqual([
      expect.objectContaining({ title: "Hotel Public", roomName: "Public room" }),
    ])
    expect(JSON.stringify(result)).not.toContain("credential_secret")
  })

  it("rejects an inactive storefront/channel before resolving supply", async () => {
    const ensureSourceRegistry = vi.fn()
    const provider = createClosedStorefrontShoppingLiveProvider({
      primitives: primitives(),
      catalogServices: {
        ensureSourceRegistry,
        getOwnedAvailabilitySearchHandlers: vi.fn(),
      } as never,
      markets: markets(false),
    })
    await expect(
      provider.searchStays({
        context,
        scope,
        intent: {
          kind: "stay",
          destination: { city: "Rome" },
          checkIn: "2026-09-10",
          checkOut: "2026-09-15",
          rooms: [{ adults: 2 }],
        },
      }),
    ).rejects.toThrow("active market scope")
    expect(ensureSourceRegistry).not.toHaveBeenCalled()
  })

  it("keeps flights unavailable while no admitted flight adapter resolver exists", async () => {
    const provider = createClosedStorefrontShoppingLiveProvider({
      primitives: primitives(),
      catalogServices: {} as never,
      markets: markets(),
    })
    await expect(
      provider.searchFlights({
        context,
        scope,
        intent: {
          kind: "flight",
          slices: [{ origin: "OTP", destination: "FCO", departureDate: "2026-09-10" }],
          travelers: { adults: 2 },
        },
      }),
    ).resolves.toEqual({ items: [], sources: [{ status: "unavailable" }] })
  })
})
