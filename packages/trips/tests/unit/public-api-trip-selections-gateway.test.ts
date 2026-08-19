/**
 * Moved from `public-api`'s shopping gateway tests with the gateway itself
 * (voyant#4627). The assertions are unchanged — the validation boundary in
 * front of a Trip-selection runtime is the same one, it just lives with the
 * routes it guards now.
 */
import { describe, expect, it, vi } from "vitest"

import {
  createPublicApiTripSelectionsGateway,
  PublicApiTripSelectionsUnavailableError,
} from "../../src/public-api-trip-selections-gateway.js"
import { publicApiTripSelectionUpdateSchema } from "../../src/public-api-trip-selections-schemas.js"

const scope = {
  marketId: "market_ro",
  locale: "ro-RO",
  currency: "RON",
  available: { marketIds: ["market_ro"], locales: ["ro-RO"], currencies: ["RON"] },
}

const context = { channelId: "chan_server", userId: null, buyerAccountId: null }

describe("public Trip-selection gateway", () => {
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
    const gateway = createPublicApiTripSelectionsGateway({
      resolveScope: async () => scope,
      selections: {
        create,
        update,
        book: async () => {
          throw new Error("not used")
        },
      },
    })

    const created = await gateway.create(context, {
      scope: { currency: "RON" },
      offers: [{ kind: "flight", offerRef: "flight-offer-000001" }],
    })
    const updated = await gateway.update(context, {
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
      publicApiTripSelectionUpdateSchema.parse({
        selectionRef: created.selectionRef,
        mutation: { kind: "remove", itemRef: "selection-item-000001" },
      }),
    ).toThrow()
  })

  it("fails explicitly when an optional deployment provider is absent", async () => {
    await expect(
      createPublicApiTripSelectionsGateway({}).update(context, {
        selectionRef: "selection-ref-00000001",
        expectedRevision: 0,
        mutation: { kind: "remove", itemRef: "selection-item-000001" },
      }),
    ).rejects.toBeInstanceOf(PublicApiTripSelectionsUnavailableError)
  })

  /**
   * The scope check is the reason the gateway still talks to the shopping
   * layer at all: a runtime that answered outside the resolved scope would
   * price the selection in something other than what the shopper was shown.
   */
  it("rejects a runtime result outside the resolved scope", async () => {
    const gateway = createPublicApiTripSelectionsGateway({
      resolveScope: async () => scope,
      selections: {
        create: async () => ({
          selectionRef: "selection-ref-00000001",
          revision: 0,
          scope: { ...scope, currency: "EUR", available: scope.available },
          items: [],
        }),
        update: vi.fn(),
        book: vi.fn(),
      },
    })

    await expect(
      gateway.create(context, {
        scope: { currency: "RON" },
        offers: [{ kind: "flight", offerRef: "flight-offer-000001" }],
      }),
    ).rejects.toThrow(/outside the resolved shopping scope/)
  })
})
