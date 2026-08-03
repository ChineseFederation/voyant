import type {
  ComputeQuoteRequest,
  OwnedHandlerContext,
  PricingBasis,
} from "@voyant-travel/catalog/booking-engine"
import { describe, expect, it } from "vitest"

import {
  createProductsBookingHandler,
  type OptionUnitBandCandidate,
  type ResolvedOptionPrice,
} from "../../src/booking-engine/handler.js"

/**
 * A person-priced product never renders the journey's units step — the shape
 * descriptor adds `option-units` only for room/vehicle inventory — so its draft
 * reaches the commit with pax bands and no `configure.optionSelections`.
 * Booking creation refuses a command with no item lines when the option has
 * several optional units, which made every Adult / Child product with more than
 * one unit unbookable from the storefront (voyant#4113).
 *
 * These cases quote first and then derive from that exact quote, because the
 * defect is a disagreement between the two halves: anything that only exercises
 * derivation in isolation would not have caught it.
 */
describe("deriveSelfServiceCommand for person-priced products", () => {
  const perBandPrice: ResolvedOptionPrice = {
    baseSellAmountCents: 16000,
    unitPrices: [
      { unitId: "u_adult", unitType: "person", travelerCategory: "adult", sellAmountCents: 16000 },
      { unitId: "u_child", unitType: "person", travelerCategory: "child", sellAmountCents: 9500 },
    ],
  }

  it("derives one item line per pax band from the option's per-band unit prices", async () => {
    const handler = createProductsBookingHandler({
      loadSlotDate: async () => "2026-06-21",
      loadResolvedOptionPrice: async () => perBandPrice,
    })

    const command = await quoteThenDerive(handler, draft({ adult: 2, child: 1 }))

    // Not one merged line: each band reserves its own unit, and the amounts
    // come back from the accepted quote rather than from a fresh price lookup.
    // Titles come from the quote line each item matched, which is what makes
    // the per-band split legible on the booking. The band's label, not its
    // code — a per-product tier code would be unreadable there.
    expect(command.itemLines).toEqual([
      {
        optionId: "opt_1",
        optionUnitId: "u_adult",
        quantity: 2,
        title: "Danube Delta Day Trip — Adult",
        unitSellAmountCents: 16000,
        totalSellAmountCents: 32000,
      },
      {
        optionId: "opt_1",
        optionUnitId: "u_child",
        quantity: 1,
        title: "Danube Delta Day Trip — Child",
        unitSellAmountCents: 9500,
        totalSellAmountCents: 9500,
      },
    ])
    // 2 × 16000 + 1 × 9500 — the item lines account for the whole booking.
    expect(command.sellAmountCentsOverride).toBe(41500)
  })

  it("drops a band the shopper booked nobody into", async () => {
    const handler = createProductsBookingHandler({
      loadSlotDate: async () => "2026-06-21",
      loadResolvedOptionPrice: async () => perBandPrice,
    })

    const command = await quoteThenDerive(handler, draft({ adult: 1 }))

    expect(command.itemLines).toEqual([
      {
        optionId: "opt_1",
        optionUnitId: "u_adult",
        quantity: 1,
        title: "Danube Delta Day Trip — Adult",
        unitSellAmountCents: 16000,
        totalSellAmountCents: 16000,
      },
    ])
  })

  it("maps bands onto units by age window when the price lives on the option", async () => {
    // No per-band unit prices to derive from: the option is priced as a whole,
    // so the units themselves have to say which band reserves which.
    const handler = createProductsBookingHandler({
      loadSlotDate: async () => "2026-06-21",
      loadResolvedOptionPrice: async () => ({ baseSellAmountCents: 18000, unitPrices: [] }),
      loadOptionUnits: async () => units,
    })

    const command = await quoteThenDerive(handler, draft({ adult: 2, child: 1 }))

    expect(command.itemLines?.map((line) => [line.optionUnitId, line.quantity])).toEqual([
      ["u_adult", 2],
      ["u_child_6_12", 1],
    ])
    // 18000 × 3 pax, split across the lines by their traveler counts.
    expect(command.sellAmountCentsOverride).toBe(54000)
    expect(sumLineTotals(command.itemLines)).toBe(54000)
  })

  it("gives a band to a single unit when two units derive the same band", async () => {
    // "Child 6-12" and "Child 0-5" both derive `child`. Giving each the full
    // child count would reserve the same children twice.
    const handler = createProductsBookingHandler({
      loadSlotDate: async () => "2026-06-21",
      loadResolvedOptionPrice: async () => ({ baseSellAmountCents: 18000, unitPrices: [] }),
      loadOptionUnits: async () => units,
    })

    const command = await quoteThenDerive(handler, draft({ adult: 1, child: 2 }))

    expect(command.itemLines?.map((line) => line.optionUnitId)).toEqual(["u_adult", "u_child_6_12"])
    expect(sumLineTotals(command.itemLines)).toBe(command.sellAmountCentsOverride)
  })

  it("charges and reserves one unit when two priced tiers collapse onto a band", async () => {
    // `deriveTravelerCategory` puts every age tier under 18 on `child`, so
    // "Child 6-12" and "Child 0-5" compete for one band. Charging both bills
    // the same child twice and reserves two seats for one traveler
    // (voyant#4118).
    const handler = createProductsBookingHandler({
      loadSlotDate: async () => "2026-06-21",
      loadResolvedOptionPrice: async () => twoChildTiers,
    })

    const command = await quoteThenDerive(handler, draft({ adult: 1, child: 1 }))

    expect(command.itemLines?.map((line) => [line.optionUnitId, line.quantity])).toEqual([
      ["u_adult", 1],
      ["u_child_6_12", 1],
    ])
    // Two travelers, two seats — not the three the ungated loop reserved.
    expect(sumQuantities(command.itemLines)).toBe(2)
    // 16000 + 13600. The 10400 second child tier is not added on top.
    expect(command.sellAmountCentsOverride).toBe(29600)
  })

  it("lets the operator's sort order pick the winner, whatever order the rows arrive in", async () => {
    // `option_unit_price_rules` is selected without an ORDER BY, and the quote
    // and the commit resolve prices in separate calls. Sorting on the unit's
    // own `sort_order` is what stops the two picking different tiers.
    const reversed: ResolvedOptionPrice = {
      ...twoChildTiers,
      unitPrices: [...twoChildTiers.unitPrices].reverse(),
    }
    const handler = createProductsBookingHandler({
      loadSlotDate: async () => "2026-06-21",
      loadResolvedOptionPrice: async () => reversed,
    })

    const command = await quoteThenDerive(handler, draft({ adult: 1, child: 1 }))

    expect(command.itemLines?.map((line) => line.optionUnitId)).toEqual(["u_adult", "u_child_6_12"])
    expect(command.sellAmountCentsOverride).toBe(29600)
  })

  it("passes a contested band to the next tier when the operator's first is free", async () => {
    // A zero-priced unit produced no quote line and no reservation before the
    // dedupe, and still does — claiming the band with it would silently stop
    // charging for children.
    const freeFirstTier: ResolvedOptionPrice = {
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
          sellAmountCents: 0,
          sortOrder: 1,
        },
        {
          unitId: "u_child_0_5",
          unitType: "person",
          travelerCategory: "child",
          sellAmountCents: 10400,
          sortOrder: 2,
        },
      ],
    }
    const handler = createProductsBookingHandler({
      loadSlotDate: async () => "2026-06-21",
      loadResolvedOptionPrice: async () => freeFirstTier,
    })

    const command = await quoteThenDerive(handler, draft({ adult: 1, child: 1 }))

    expect(command.itemLines?.map((line) => line.optionUnitId)).toEqual(["u_adult", "u_child_0_5"])
    expect(command.sellAmountCentsOverride).toBe(26400)
  })

  it("leaves the command without item lines when nothing can resolve the units", async () => {
    // Neither loader is wired, so there is nothing to derive from. Booking
    // creation still applies its own refusal — derivation must not invent a
    // unit to keep the commit moving.
    const handler = createProductsBookingHandler({})

    const command = await quoteThenDerive(handler, draft({ adult: 2 }))

    expect(command.itemLines).toBeUndefined()
  })
})

/** The reporting operator's shape: two child tiers on one option. */
const twoChildTiers: ResolvedOptionPrice = {
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
      travelerCategory: "child",
      sellAmountCents: 10400,
      sortOrder: 2,
    },
  ],
}

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

/**
 * Quote the draft, then derive the create command from that quote — the same
 * order the storefront journey does it in, so the accepted price and the
 * derived item lines have to reconcile the way they would in production.
 */
async function quoteThenDerive(
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
    },
  })
  if (result.status !== "ok") throw new Error(`expected ok, got ${result.status}`)
  return result.command
}

function sumLineTotals(lines: { totalSellAmountCents?: number | null }[] | undefined) {
  return (lines ?? []).reduce((sum, line) => sum + (line.totalSellAmountCents ?? 0), 0)
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
