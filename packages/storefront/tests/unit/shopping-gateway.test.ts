import { describe, expect, it, vi } from "vitest"

import {
  createStorefrontShoppingGateway,
  type StorefrontResolvedScope,
  type StorefrontShoppingContext,
  type StorefrontShoppingResult,
  StorefrontShoppingUnavailableError,
  storefrontPresentationMoneySchema,
  storefrontShoppingRequestSchema,
  storefrontShoppingRuntimePort,
  storefrontTripSelectionsRuntimePort,
  storefrontTripSelectionUpdateSchema,
} from "../../src/shopping/index.js"

const context = {
  storefrontId: "storefront_public",
  channelId: "channel_web",
  userId: "user_managed_123",
  buyerAccountId: "buyer_account_123",
} satisfies StorefrontShoppingContext
const scope: StorefrontResolvedScope = {
  marketId: "market_ro",
  locale: "ro-RO",
  currency: "RON",
  available: {
    marketIds: ["market_ro", "market_gb"],
    locales: ["ro-RO", "en-GB"],
    currencies: ["RON", "EUR"],
  },
}

describe("storefront shopping schemas", () => {
  it.each([
    "tenant",
    "tenantId",
    "organization",
    "organizationId",
    "engine",
    "engineId",
    "storefront",
    "storefrontId",
    "storefrontChannel",
    "channel",
    "channelId",
    "provider",
    "providerId",
    "connectionId",
    "source",
    "sourceId",
    "userId",
    "buyerAccountId",
  ])("rejects browser trust selector %s", (selector) => {
    expect(() =>
      storefrontShoppingRequestSchema.parse({
        scope: { currency: "EUR", [selector]: "attacker-controlled" },
        intent: {
          kind: "flight",
          slices: [{ origin: "OTP", destination: "LHR", departureDate: "2026-09-01" }],
          travelers: { adults: 1 },
        },
      }),
    ).toThrow()
  })

  it("models indexed inspiration as independently paginated groups", () => {
    const request = storefrontShoppingRequestSchema.parse({
      scope: {},
      intent: {
        kind: "indexed-inspiration",
        groups: [
          { group: "tours", query: "Danube", pagination: { cursor: "tour-cursor-0000001" } },
          { group: "activities", destination: { city: "Bucharest" } },
          { group: "stays", destination: { countryCode: "RO" } },
        ],
      },
    })

    expect(request.intent).toMatchObject({ kind: "indexed-inspiration" })
    expect(() =>
      storefrontShoppingRequestSchema.parse({
        scope: {},
        intent: {
          kind: "indexed-inspiration",
          groups: [{ group: "tours" }],
          cursor: "fake-global-cursor",
        },
      }),
    ).toThrow()
  })

  it("requires Voyant Data FX provenance for converted presentation money", () => {
    expect(() =>
      storefrontPresentationMoneySchema.parse({
        native: { amount: "100.00", currency: "EUR" },
        presentation: { amount: "497.50", currency: "RON" },
      }),
    ).toThrow(/FX provenance/)

    expect(
      storefrontPresentationMoneySchema.parse({
        native: { amount: "100.00", currency: "EUR" },
        presentation: { amount: "497.50", currency: "RON" },
        fx: {
          provider: "voyant-data-fx",
          rate: "4.975",
          quotedAt: "2026-08-08T10:00:00+00:00",
        },
      }),
    ).toBeTruthy()
  })
})

describe("storefront shopping gateway", () => {
  it("resolves scope server-side and preserves vertical discrimination", async () => {
    const resolveScope = vi.fn(async () => scope)
    const search = vi.fn(
      async (_context, input): Promise<StorefrontShoppingResult> => ({
        kind: "flight",
        scope: input.scope,
        offers: [],
        coverage: { status: "partial", succeeded: 1, failed: 1, timedOut: 0 },
      }),
    )
    const gateway = createStorefrontShoppingGateway({ shopping: { resolveScope, search } })

    const result = await gateway.search(context, {
      scope: { marketId: "market_ro", locale: "ro-RO", currency: "RON" },
      intent: {
        kind: "flight",
        slices: [{ origin: "OTP", destination: "LHR", departureDate: "2026-09-01" }],
        travelers: { adults: 2 },
      },
    })

    expect(result.kind).toBe("flight")
    expect(resolveScope).toHaveBeenCalledWith(context, {
      marketId: "market_ro",
      locale: "ro-RO",
      currency: "RON",
    })
    expect(search).toHaveBeenCalledWith(context, expect.objectContaining({ scope }))
  })

  it("rejects provider results outside the resolved scope", async () => {
    const gateway = createStorefrontShoppingGateway({
      shopping: {
        resolveScope: async () => scope,
        search: async (_context, input) => ({
          kind: "stay",
          scope: { ...input.scope, currency: "EUR" },
          offers: [],
          coverage: { status: "complete", succeeded: 1, failed: 0, timedOut: 0 },
        }),
      },
    })

    await expect(
      gateway.search(context, {
        scope: {},
        intent: {
          kind: "stay",
          destination: { city: "Bucharest" },
          checkIn: "2026-09-01",
          checkOut: "2026-09-03",
          rooms: [{ adults: 2 }],
        },
      }),
    ).rejects.toThrow(/outside the resolved shopping scope/)
  })

  it("keeps Trip selection mutations opaque and revision checked", async () => {
    const create = vi.fn(async (_context, input) => ({
      selectionRef: "selection-ref-00000001",
      revision: 0,
      scope: input.scope,
      items: [{ itemRef: "selection-item-000001", kind: "flight" as const, quantity: 1 }],
    }))
    const update = vi.fn(async (_context, input) => ({
      selectionRef: input.selectionRef,
      revision: input.expectedRevision + 1,
      scope,
      items: [],
    }))
    const gateway = createStorefrontShoppingGateway({
      shopping: { resolveScope: async () => scope, search: vi.fn() },
      tripSelections: { create, update },
    })

    const created = await gateway.createTripSelection(context, {
      scope: { currency: "RON" },
      offers: [{ kind: "flight", offerRef: "flight-offer-000001" }],
    })
    const updated = await gateway.updateTripSelection(context, {
      selectionRef: created.selectionRef,
      expectedRevision: created.revision,
      mutation: { kind: "remove", itemRef: created.items[0]?.itemRef },
    })

    expect(updated.revision).toBe(1)
    expect(update).toHaveBeenCalledWith(
      context,
      expect.objectContaining({ expectedRevision: 0, selectionRef: created.selectionRef }),
    )
    expect(() =>
      storefrontTripSelectionUpdateSchema.parse({
        selectionRef: created.selectionRef,
        mutation: { kind: "remove", itemRef: "selection-item-000001" },
      }),
    ).toThrow()
  })

  it("fails explicitly when optional deployment providers are absent", async () => {
    const gateway = createStorefrontShoppingGateway({})
    await expect(gateway.search(context, {})).rejects.toBeInstanceOf(
      StorefrontShoppingUnavailableError,
    )
  })
})

describe("storefront shopping graph ports", () => {
  it("validate provider method surfaces", () => {
    expect(() => storefrontShoppingRuntimePort.test({} as never)).toThrow(/resolveScope/)
    expect(() => storefrontTripSelectionsRuntimePort.test({} as never)).toThrow(/create/)
  })
})
