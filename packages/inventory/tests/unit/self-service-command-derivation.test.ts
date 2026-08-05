import type { OwnedHandlerContext } from "@voyant-travel/catalog/booking-engine"
import { describe, expect, it } from "vitest"

import { createProductsBookingHandler } from "../../src/booking-engine/handler.js"

/**
 * A public caller can write the draft, so derivation must treat it as
 * untrusted input rather than as operator intent.
 */
describe("products deriveSelfServiceCommand", () => {
  it("derives a command from the draft and the accepted quote", async () => {
    const result = await derive()

    expect(result).toMatchObject({
      status: "ok",
      command: {
        productId: "prod_1",
        pax: 2,
        personId: "per_1",
        contactEmail: "guest@example.com",
        travelers: [
          expect.objectContaining({ firstName: "Ada", travelerCategory: "adult" }),
          expect.objectContaining({ firstName: "Bo", travelerCategory: "child" }),
        ],
      },
    })
  })

  it("carries the resolved billing address onto the command", async () => {
    const result = await derive()

    // Without these the Booking's contact_* columns come back empty and an
    // invoice cannot state the buyer's county — voyant#4290. `contactRegion`
    // holds the ISO 3166-2 subdivision; a Bucharest Sector rides in
    // `contactCity`, which is what makes `RO-B` unambiguous.
    expect(result).toMatchObject({
      status: "ok",
      command: {
        contactCountry: "RO",
        contactRegion: "RO-B",
        contactCity: "Sector 3",
      },
    })
  })

  it.each([
    ["priceOverride", { priceOverride: { amountCents: 1, reason: "free please" } }],
    ["suppressNotifications", { suppressNotifications: true }],
    ["documentGeneration", { documentGeneration: { contractDocument: true } }],
    ["internalNotes", { internalNotes: "approved by nobody" }],
  ])("never lets a draft's %s reach the command", async (field, patch) => {
    const result = await derive(patch)

    if (result.status !== "ok") throw new Error(`expected ok, got ${result.status}`)
    // The field must be absent outright, not merely falsy: any of these
    // reaching Finance would let a public caller set their own price,
    // silence the operator, or write operator-facing state.
    expect(Object.keys(result.command)).not.toContain(field)
    expect(result.command.sellAmountCentsOverride).not.toBe(1)
  })

  it("rejects a draft with no travelers", async () => {
    expect(await derive({ travelers: [] })).toEqual({
      status: "rejected",
      reason: "incomplete_draft",
    })
  })

  it("rejects when no billing party was resolved", async () => {
    expect(await derive({}, { personId: null, organizationId: null })).toEqual({
      status: "rejected",
      reason: "incomplete_draft",
    })
  })

  it("rejects a product that is not active", async () => {
    expect(await derive({}, undefined, { status: "draft" })).toEqual({
      status: "rejected",
      reason: "entity_not_bookable",
    })
  })

  it("rejects an entity that does not exist", async () => {
    expect(await derive({}, undefined, null)).toEqual({
      status: "rejected",
      reason: "entity_not_found",
    })
  })
})

async function derive(
  draftPatch: Record<string, unknown> = {},
  billingPatch?: { personId: string | null; organizationId: string | null },
  product: { status: string } | null = { status: "active" },
) {
  const handler = createProductsBookingHandler({})
  const derive = handler.deriveSelfServiceCommand
  if (!derive) throw new Error("products handler must implement deriveSelfServiceCommand")

  return derive(context(product), {
    entityModule: "products",
    entityId: "prod_1",
    draft: {
      configure: { pax: { adult: 1, child: 1 } },
      travelers: [
        { firstName: "Ada", lastName: "L", band: "adult" },
        { firstName: "Bo", lastName: "L", band: "child" },
      ],
      ...draftPatch,
    },
    pricing: undefined,
    billing: {
      personId: billingPatch ? billingPatch.personId : "per_1",
      organizationId: billingPatch ? billingPatch.organizationId : null,
      contactFirstName: "Ada",
      contactLastName: "L",
      contactEmail: "guest@example.com",
      contactPhone: null,
      contactCountry: "RO",
      contactRegion: "RO-B",
      contactCity: "Sector 3",
      contactAddressLine1: null,
      contactAddressLine2: null,
      contactPostalCode: null,
    },
  })
}

/**
 * Minimal handler context: derivation only reads the product row, so the
 * double implements exactly the select chain `loadProduct` walks.
 */
function context(product: { status: string } | null): OwnedHandlerContext {
  const rows = product ? [{ id: "prod_1", sellCurrency: "EUR", ...product }] : []
  return {
    db: handlerDb({
      select: () => ({
        from: () => ({
          where: () => ({ limit: async () => rows }),
        }),
      }),
    }),
    adapterContext: {},
  } as OwnedHandlerContext
}

/** Narrow the in-memory double to the driver type at one named seam. */
function handlerDb(value: object): OwnedHandlerContext["db"] {
  return value as OwnedHandlerContext["db"]
}
