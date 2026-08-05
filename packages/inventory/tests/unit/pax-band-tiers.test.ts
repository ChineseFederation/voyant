import type {
  ComputeQuoteRequest,
  OwnedHandlerContext,
  PaxBandSpecV1,
  PricingBasis,
} from "@voyant-travel/catalog/booking-engine"
import { paxBandBaseCode } from "@voyant-travel/catalog/booking-engine"
import { describe, expect, it } from "vitest"

import {
  createProductsBookingHandler,
  type OptionUnitBandCandidate,
  type ResolvedOptionPrice,
} from "../../src/booking-engine/handler.js"
import {
  paxBandCodesByCategoryId,
  type TravelerCategoryRow,
} from "../../src/booking-engine/product-runtime-support.js"

/**
 * An operator selling "Child 6-12" at one price and "Child 0-5" at another had
 * no correct configuration: every age window under 18 collapsed onto a single
 * `child` band, so the journey asked for one child count and only the
 * first-sorting tier was ever sold. #4118 stopped the double charge that came
 * of it; this is the fix that makes the second tier reachable (voyant#4121).
 */
describe("paxBandCodesByCategoryId", () => {
  it("leaves the first tier of each category on its bare code", () => {
    // What every product with one tier per category emits — and what stored
    // sessions, accepted quotes and traveler rows are already keyed on.
    const codes = paxBandCodesByCategoryId([
      category({ id: "pc_adult", name: "Adult", categoryType: "adult" }),
      category({ id: "pc_child", name: "Child", categoryType: "child" }),
    ])

    expect([...codes.values()]).toEqual(["adult", "child"])
  })

  it("qualifies each further tier of a category by its id", () => {
    const codes = paxBandCodesByCategoryId([
      category({ id: "pc_adult", name: "Adult", categoryType: "adult" }),
      category({ id: "pc_c1", name: "Child 6-12", categoryType: "child" }),
      category({ id: "pc_c2", name: "Child 0-5", categoryType: "child" }),
    ])

    // The first child tier keeps `child`, so the tier that used to win the
    // contested band still answers to the code sessions stored for it.
    expect(codes.get("pc_c1")).toBe("child")
    expect(codes.get("pc_c2")).toBe("child:pc_c2")
    expect(paxBandBaseCode("child:pc_c2")).toBe("child")
  })

  it("gives no code to categories the journey never offers", () => {
    // Rooms and vehicles are inventory, not people; internal-use-only
    // categories are not sold. Neither may be keyed on downstream.
    const codes = paxBandCodesByCategoryId([
      category({ id: "pc_room", name: "Double", categoryType: "room" }),
      category({ id: "pc_net", name: "Net rate", categoryType: "adult", internalUseOnly: true }),
      category({ id: "pc_adult", name: "Adult", categoryType: "adult" }),
    ])

    expect([...codes.keys()]).toEqual(["pc_adult"])
    // The internal-only adult category did not consume the bare `adult` code.
    expect(codes.get("pc_adult")).toBe("adult")
  })
})

describe("quoting and committing a product with two child tiers", () => {
  /** The reporting operator's option: Adult 16000, Child 6-12 13600, Child 0-5 10400. */
  const tieredPrice: ResolvedOptionPrice = {
    baseSellAmountCents: 16000,
    unitPrices: [
      {
        unitId: "u_adult",
        unitType: "person",
        travelerCategory: "adult",
        sellAmountCents: 16000,
        sortOrder: 0,
      },
      {
        unitId: "u_child_6_12",
        unitType: "person",
        travelerCategory: "child",
        sellAmountCents: 13600,
        sortOrder: 1,
      },
      {
        unitId: "u_child_0_5",
        unitType: "person",
        travelerCategory: "child:pc_c2",
        sellAmountCents: 10400,
        sortOrder: 2,
      },
    ],
  }

  it("offers a band per tier instead of collapsing them onto Child", async () => {
    const handler = createProductsBookingHandler({
      loadPaxBands: async () => tieredBands,
      loadSlotDate: async () => "2026-06-21",
      loadResolvedOptionPrice: async () => tieredPrice,
    })

    const quote = await computeQuote(handler, draft({ adult: 1 }))

    expect(quote.requirements?.paxBands.map((band) => band.code)).toEqual([
      "adult",
      "child",
      "child:pc_c2",
    ])
  })

  it("sells the second child tier at its own price", async () => {
    // Before the fix this booking was unreachable: `pax.child` was the only
    // child count the journey collected, and it always bought the 6-12 tier.
    const handler = createProductsBookingHandler({
      loadPaxBands: async () => tieredBands,
      loadSlotDate: async () => "2026-06-21",
      loadResolvedOptionPrice: async () => tieredPrice,
    })

    const command = await quoteThenDerive(handler, draft({ adult: 1, "child:pc_c2": 1 }))

    expect(command.itemLines?.map((line) => [line.optionUnitId, line.quantity])).toEqual([
      ["u_adult", 1],
      ["u_child_0_5", 1],
    ])
    expect(command.sellAmountCentsOverride).toBe(26400)
  })

  it("charges both tiers when the shopper books one of each", async () => {
    // The #4118 band-claim guard used to drop this second line — the two tiers
    // contended for `child`. With distinct codes there is nothing to contend.
    const handler = createProductsBookingHandler({
      loadPaxBands: async () => tieredBands,
      loadSlotDate: async () => "2026-06-21",
      loadResolvedOptionPrice: async () => tieredPrice,
    })

    const command = await quoteThenDerive(handler, draft({ adult: 1, child: 1, "child:pc_c2": 1 }))

    expect(command.itemLines?.map((line) => [line.optionUnitId, line.quantity])).toEqual([
      ["u_adult", 1],
      ["u_child_6_12", 1],
      ["u_child_0_5", 1],
    ])
    // 16000 + 13600 + 10400 — three travelers, three seats, three prices.
    expect(command.sellAmountCentsOverride).toBe(40000)
    expect(sumQuantities(command.itemLines)).toBe(3)
  })

  it("labels the quote lines with the operator's own tier names", async () => {
    const handler = createProductsBookingHandler({
      loadPaxBands: async () => tieredBands,
      loadSlotDate: async () => "2026-06-21",
      loadResolvedOptionPrice: async () => tieredPrice,
    })

    // Not "— child:pc_c2": the shopper reads this breakdown, so the line
    // carries the operator's own name for the tier.
    const quote = await computeQuote(handler, draft({ adult: 1, "child:pc_c2": 1 }))

    expect(quoteLineLabels(quote.pricing)).toEqual([
      "Danube Delta Day Trip — Adult",
      "Danube Delta Day Trip — Child 0-5",
    ])
  })

  it("keeps a draft written before tiers existed resolving to the first tier", async () => {
    // `pax.child` is what live sessions and accepted quotes carry. It must
    // still buy the tier the operator's sort order put first — the same one
    // #4118's tie-break picked — rather than resolving to nothing.
    const handler = createProductsBookingHandler({
      loadPaxBands: async () => tieredBands,
      loadSlotDate: async () => "2026-06-21",
      loadResolvedOptionPrice: async () => tieredPrice,
    })

    const command = await quoteThenDerive(handler, draft({ adult: 1, child: 2 }))

    expect(command.itemLines?.map((line) => [line.optionUnitId, line.quantity])).toEqual([
      ["u_adult", 1],
      ["u_child_6_12", 2],
    ])
    expect(command.sellAmountCentsOverride).toBe(43200)
  })

  it("types a tiered traveler by the category the tier belongs to", async () => {
    // Booking parties carry the canonical category, not the product's tier.
    const handler = createProductsBookingHandler({
      loadPaxBands: async () => tieredBands,
      loadSlotDate: async () => "2026-06-21",
      loadResolvedOptionPrice: async () => tieredPrice,
    })

    const command = await quoteThenDerive(handler, draft({ adult: 1, "child:pc_c2": 1 }))

    expect(command.travelers?.map((traveler) => traveler.travelerCategory)).toEqual([
      "adult",
      "child",
    ])
  })

  it("reserves a unit per tier when the price lives on the option", async () => {
    // No per-band unit price to derive from: the bands say which unit each
    // tier reserves, matching on the unit's own age window rather than
    // sending both child tiers to whichever unit sorts first.
    const handler = createProductsBookingHandler({
      loadPaxBands: async () => tieredBands,
      loadSlotDate: async () => "2026-06-21",
      loadResolvedOptionPrice: async () => ({ baseSellAmountCents: 18000, unitPrices: [] }),
      loadOptionUnits: async () => units,
    })

    const command = await quoteThenDerive(handler, draft({ adult: 1, child: 1, "child:pc_c2": 1 }))

    expect(command.itemLines?.map((line) => [line.optionUnitId, line.quantity])).toEqual([
      ["u_adult", 1],
      ["u_child_6_12", 1],
      ["u_child_0_5", 1],
    ])
  })
})

const tieredBands: PaxBandSpecV1[] = [
  { code: "adult", label: "Adult", minAge: 13, minCount: 1, maxCount: 8 },
  { code: "child", label: "Child 6-12", minAge: 6, maxAge: 12, minCount: 0, maxCount: 6 },
  { code: "child:pc_c2", label: "Child 0-5", maxAge: 5, minCount: 0, maxCount: 6 },
]

const units: OptionUnitBandCandidate[] = [
  { id: "u_adult", unitType: "person", minAge: 18, maxAge: null },
  { id: "u_child_6_12", unitType: "person", minAge: 6, maxAge: 12 },
  { id: "u_child_0_5", unitType: "person", minAge: 0, maxAge: 5 },
]

const product = {
  id: "prod_1",
  name: "Danube Delta Day Trip",
  status: "active" as const,
  sellAmountCents: 16000,
  sellCurrency: "RON",
}

function category(overrides: Partial<TravelerCategoryRow>): TravelerCategoryRow {
  return {
    id: "pc_1",
    name: "Adult",
    categoryType: "adult",
    minAge: null,
    maxAge: null,
    internalUseOnly: false,
    ...overrides,
  }
}

function draft(pax: Record<string, number>) {
  return {
    configure: { variantId: "opt_1", departureSlotId: "slot_1", pax },
    travelers: Object.entries(pax).flatMap(([band, count]) =>
      Array.from({ length: count }, (_, index) => ({
        firstName: `${band}-${index}`,
        lastName: "Traveler",
        band,
      })),
    ),
  }
}

async function computeQuote(
  handler: ReturnType<typeof createProductsBookingHandler>,
  draftPayload: ReturnType<typeof draft>,
) {
  const quote = await handler.computeQuote(context(), {
    entityModule: "products",
    entityId: product.id,
    scope: { locale: "en", audience: "customer", market: "RO" },
    draft: draftPayload,
  } satisfies ComputeQuoteRequest)
  expect(quote.available).toBe(true)
  return quote
}

/**
 * Quote first, then derive the create command from that quote — the order the
 * journey does it in, so the accepted price and the derived item lines have to
 * reconcile the way they would in production.
 */
async function quoteThenDerive(
  handler: ReturnType<typeof createProductsBookingHandler>,
  draftPayload: ReturnType<typeof draft>,
) {
  const quote = await computeQuote(handler, draftPayload)
  const derive = handler.deriveSelfServiceCommand
  if (!derive) throw new Error("products handler must implement deriveSelfServiceCommand")
  const result = await derive(context(), {
    entityModule: "products",
    entityId: product.id,
    draft: draftPayload,
    pricing: quote.pricing as PricingBasis,
    billing: {
      personId: "per_1",
      organizationId: null,
      contactFirstName: "Ada",
      contactLastName: "Traveler",
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
  if (result.status !== "ok") throw new Error(`expected ok, got ${result.status}`)
  return result.command
}

function quoteLineLabels(pricing: PricingBasis | undefined): string[] {
  const breakdown = pricing?.breakdown as { lines?: Array<{ label?: string }> } | undefined
  return (breakdown?.lines ?? []).map((line) => line.label ?? "")
}

function sumQuantities(lines: { quantity: number }[] | undefined) {
  return (lines ?? []).reduce((sum, line) => sum + line.quantity, 0)
}

/** Derivation only reads the product row, so the double implements exactly
 *  the select chain `loadProduct` walks. */
function context(): OwnedHandlerContext {
  return {
    db: {
      select: () => ({
        from: () => ({ where: () => ({ limit: async () => [product] }) }),
      }),
    },
    adapterContext: {},
  } as unknown as OwnedHandlerContext
}
