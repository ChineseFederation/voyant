import { describe, expect, it, vi } from "vitest"

import {
  createPublicApiShoppingGateway,
  type PublicApiResolvedScope,
  type PublicApiShoppingContext,
  type PublicApiShoppingResult,
  PublicApiShoppingUnavailableError,
  publicApiPresentationMoneySchema,
  publicApiShoppingRequestSchema,
  publicApiShoppingRuntimePort,
} from "../../src/shopping/index.js"

const context = {
  channelId: "channel_web",
  userId: "user_managed_123",
  buyerAccountId: "buyer_account_123",
} satisfies PublicApiShoppingContext
const scope: PublicApiResolvedScope = {
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
    "publicChannel",
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
      publicApiShoppingRequestSchema.parse({
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
    const request = publicApiShoppingRequestSchema.parse({
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
      publicApiShoppingRequestSchema.parse({
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
      publicApiPresentationMoneySchema.parse({
        native: { amount: "100.00", currency: "EUR" },
        presentation: { amount: "497.50", currency: "RON" },
      }),
    ).toThrow(/FX provenance/)

    expect(
      publicApiPresentationMoneySchema.parse({
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
      async (_context, input): Promise<PublicApiShoppingResult> => ({
        kind: "flight",
        scope: input.scope,
        offers: [],
        coverage: { status: "partial", succeeded: 1, failed: 1, timedOut: 0 },
      }),
    )
    const gateway = createPublicApiShoppingGateway({ shopping: { resolveScope, search } })

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
    const gateway = createPublicApiShoppingGateway({
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

  it("fails explicitly when optional deployment providers are absent", async () => {
    const gateway = createPublicApiShoppingGateway({})
    await expect(gateway.search(context, {})).rejects.toBeInstanceOf(
      PublicApiShoppingUnavailableError,
    )
  })
})

describe("storefront shopping graph ports", () => {
  it("validate provider method surfaces", () => {
    expect(() => publicApiShoppingRuntimePort.test({} as never)).toThrow(/resolveScope/)
  })
})
