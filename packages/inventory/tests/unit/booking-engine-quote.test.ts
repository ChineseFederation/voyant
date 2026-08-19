import type {
  ComputeQuoteRequest,
  OwnedHandlerContext,
} from "@voyant-travel/catalog/booking-engine"
// agent-quality: file-size exception -- owner: inventory; booking-engine quote modes share one fixture and assertion vocabulary across legacy, supplement, all-in, tiers, and dependency behavior.
import { describe, expect, it, vi } from "vitest"

import {
  createProductsBookingHandler,
  type ResolvedOptionPrice,
  type ResolvedPaxPricingTier,
} from "../../src/booking-engine/handler.js"

const product = {
  id: "prod_a",
  name: "Bulgaria Day Trip",
  status: "active" as const,
  sellAmountCents: 14500,
  sellCurrency: "RON",
}

function makeDb(rows: unknown[]) {
  return {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => rows,
        }),
      }),
    }),
  } as OwnedHandlerContext["db"]
}

function makeCtx(rows: unknown[]): OwnedHandlerContext {
  return {
    db: makeDb(rows),
    adapterContext: {} as never,
  }
}

const baseRequest = (draft?: unknown): ComputeQuoteRequest => ({
  entityModule: "products",
  entityId: product.id,
  scope: { locale: "en", audience: "customer", market: "RO" },
  draft: draft ?? {},
})

describe("createProductsBookingHandler.computeQuote", () => {
  it("falls back to product.sellAmountCents × pax when no resolver hooks are wired", async () => {
    const handler = createProductsBookingHandler({})

    const result = await handler.computeQuote(
      makeCtx([product]),
      baseRequest({ configure: { pax: { adult: 2 } } }),
    )

    expect(result.available).toBe(true)
    const breakdown = result.pricing?.breakdown as Record<string, unknown>
    expect(breakdown?.total).toBe(29000)
    expect(breakdown?.subtotal).toBe(29000)
    const lines = breakdown?.lines as Array<{ totalAmount: number; quantity: number }>
    expect(lines).toHaveLength(1)
    expect(lines[0]?.totalAmount).toBe(29000)
    expect(lines[0]?.quantity).toBe(2)
  })

  it("carries the applicable immutable cancellation policy snapshot as quote evidence", async () => {
    const cancellationSnapshot = {
      schemaVersion: 1,
      policyId: "pol_cancel",
      policyVersionId: "polv_sale",
      version: 1,
      capturedAt: "2026-08-08T09:00:00.000Z",
      rules: [],
    }
    const loadCancellationPolicySnapshot = vi.fn(async () => cancellationSnapshot)
    const handler = createProductsBookingHandler({ loadCancellationPolicySnapshot })

    const result = await handler.computeQuote(
      makeCtx([product]),
      baseRequest({ configure: { pax: { adult: 2 } } }),
    )

    expect(loadCancellationPolicySnapshot).toHaveBeenCalledWith(expect.anything(), {
      productId: product.id,
      at: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
    })
    expect(result.upstreamPayload).toEqual({ cancellationSnapshot })
  })

  it("uses per-band unit prices when the resolver returns matching units", async () => {
    const loadResolvedOptionPrice = vi.fn(
      async (): Promise<ResolvedOptionPrice> => ({
        baseSellAmountCents: 16000,
        unitPrices: [
          {
            unitId: "u_adult",
            unitType: "person",
            travelerCategory: "adult",
            sellAmountCents: 16000,
          },
          {
            unitId: "u_child",
            unitType: "person",
            travelerCategory: "child",
            sellAmountCents: 9500,
          },
          {
            unitId: "u_infant",
            unitType: "person",
            travelerCategory: "infant",
            sellAmountCents: 0,
          },
        ],
      }),
    )
    const loadSlotDate = vi.fn(async () => "2026-06-21")

    const handler = createProductsBookingHandler({
      loadResolvedOptionPrice,
      loadSlotDate,
    })

    const result = await handler.computeQuote(
      makeCtx([product]),
      baseRequest({
        configure: {
          variantId: "opt_default",
          departureSlotId: "slot_1",
          pax: { adult: 2, child: 1, infant: 1 },
        },
      }),
    )

    expect(loadSlotDate).toHaveBeenCalledWith(expect.anything(), "slot_1")
    expect(loadResolvedOptionPrice).toHaveBeenCalledWith(expect.anything(), {
      productId: product.id,
      optionId: "opt_default",
      date: "2026-06-21",
    })

    const breakdown = result.pricing?.breakdown as Record<string, unknown>
    // 2 × 16000 + 1 × 9500 = 41500. Infant (sell=0) drops out.
    expect(breakdown?.total).toBe(41500)
    const lines = breakdown?.lines as Array<{
      quantity: number
      unitAmount: number
      optionId?: string
      optionUnitId?: string
    }>
    expect(lines).toHaveLength(2)
    // Band lines carry the unit they priced. The commit matches its item lines
    // back to these, so a quote without provenance can only be reconciled
    // positionally (voyant#4113).
    expect(lines.map((line) => [line.optionId, line.optionUnitId])).toEqual([
      ["opt_default", "u_adult"],
      ["opt_default", "u_child"],
    ])
    expect(lines.map((l) => `${l.quantity}×${l.unitAmount}`)).toEqual(["2×16000", "1×9500"])
  })

  it("uses baseSellAmountCents × pax for per-booking rules with no unit prices", async () => {
    const handler = createProductsBookingHandler({
      loadSlotDate: async () => "2026-07-15",
      loadResolvedOptionPrice: async () => ({
        baseSellAmountCents: 18000,
        unitPrices: [],
      }),
    })

    const result = await handler.computeQuote(
      makeCtx([product]),
      baseRequest({
        configure: {
          variantId: "opt_default",
          departureSlotId: "slot_1",
          pax: { adult: 3 },
        },
      }),
    )

    const breakdown = result.pricing?.breakdown as Record<string, unknown>
    expect(breakdown?.total).toBe(54000) // 18000 × 3
    const lines = breakdown?.lines as Array<{ unitAmount: number; quantity: number }>
    expect(lines).toHaveLength(1)
    expect(lines[0]?.unitAmount).toBe(18000)
    expect(lines[0]?.quantity).toBe(3)
  })

  it("prices selected product option quantities", async () => {
    const loadResolvedOptionPrice = vi.fn(
      async (): Promise<ResolvedOptionPrice> => ({
        baseSellAmountCents: 25000,
        unitPrices: [
          {
            unitId: "unit_suite",
            unitType: "room",
            travelerCategory: null,
            sellAmountCents: 32000,
          },
        ],
      }),
    )
    const handler = createProductsBookingHandler({
      loadSlotDate: async () => "2026-07-15",
      loadProductOptions: async () => [
        {
          id: "opt_suite",
          name: "Junior suite upgrade",
          units: [{ id: "unit_suite", name: "Suite" }],
        },
      ],
      loadResolvedOptionPrice,
    })

    const result = await handler.computeQuote(
      makeCtx([product]),
      baseRequest({
        configure: {
          departureSlotId: "slot_1",
          optionSelections: [{ optionId: "opt_suite", optionUnitId: "unit_suite", quantity: 2 }],
        },
      }),
    )

    expect(loadResolvedOptionPrice).toHaveBeenCalledWith(expect.anything(), {
      productId: product.id,
      optionId: "opt_suite",
      date: "2026-07-15",
    })
    const breakdown = result.pricing?.breakdown as Record<string, unknown>
    expect(breakdown?.total).toBe(64000)
    const lines = breakdown?.lines as Array<{ label: string; quantity: number; unitAmount: number }>
    expect(lines[0]).toEqual(
      expect.objectContaining({
        label: "Suite",
        quantity: 2,
        unitAmount: 32000,
      }),
    )
  })

  it("prices two Adults from a room's per-person category price (voyant#3586, #4571)", async () => {
    // The Rooms & prices editor stores a room's price per traveler type — a
    // "Double / Adult" row (`travelerCategory` set), not a flat per-room price.
    // Such a room prices per person by band (`pax[band] × price`), independent
    // of how many rooms are selected (rooms are capacity). Before the fix these
    // rows were dropped and the product quoted `no_sell_amount_configured`.
    const loadResolvedOptionPrice = vi.fn(
      async (): Promise<ResolvedOptionPrice> => ({
        baseSellAmountCents: 0,
        unitPrices: [
          {
            unitId: "unit_double",
            unitType: "room",
            travelerCategory: "adult",
            sellAmountCents: 69000,
          },
        ],
      }),
    )
    const handler = createProductsBookingHandler({
      loadSlotDate: async () => "2026-07-27",
      loadProductOptions: async () => [
        { id: "opt_standard", name: "Standard", units: [{ id: "unit_double", name: "Double" }] },
      ],
      loadResolvedOptionPrice,
    })

    const result = await handler.computeQuote(
      makeCtx([product]),
      baseRequest({
        configure: {
          departureSlotId: "slot_1",
          pax: { adult: 2 },
          optionSelections: [
            { optionId: "opt_standard", optionUnitId: "unit_double", quantity: 3 },
          ],
        },
      }),
    )

    expect(result.available).toBe(true)
    const breakdown = result.pricing?.breakdown as Record<string, unknown>
    // 2 adults × €690 = €1,380 — NOT × 3 rooms.
    expect(breakdown?.total).toBe(138000)
    const lines = breakdown?.lines as Array<{ label: string; quantity: number; unitAmount: number }>
    expect(lines).toHaveLength(1)
    expect(lines[0]).toEqual(
      // The band's label, not its code — the shopper reads this line.
      expect.objectContaining({ quantity: 2, unitAmount: 69000, label: "Double — Adult" }),
    )
  })

  it("prices the same traveler band independently for each selected room option", async () => {
    const handler = createProductsBookingHandler({
      loadSlotDate: async () => "2026-07-27",
      loadProductOptions: async () => [
        {
          id: "opt_standard",
          name: "Standard",
          units: [{ id: "unit_standard", name: "Standard room", unitType: "room" }],
        },
        {
          id: "opt_upgrade",
          name: "Upgrade",
          units: [{ id: "unit_upgrade", name: "Upgrade room", unitType: "room" }],
        },
      ],
      loadResolvedOptionPrice: async (_ctx, input) => ({
        baseSellAmountCents: 0,
        unitPrices: [
          {
            unitId: input.optionId === "opt_standard" ? "unit_standard" : "unit_upgrade",
            unitType: "room",
            travelerCategory: "adult",
            sellAmountCents: input.optionId === "opt_standard" ? 12_000 : 15_000,
          },
        ],
      }),
    })

    const result = await handler.computeQuote(
      makeCtx([product]),
      baseRequest({
        configure: {
          departureSlotId: "slot_1",
          pax: { adult: 2 },
          optionSelections: [
            { optionId: "opt_standard", optionUnitId: "unit_standard", quantity: 1 },
            { optionId: "opt_upgrade", optionUnitId: "unit_upgrade", quantity: 1 },
          ],
        },
      }),
    )

    expect(result.available).toBe(true)
    const breakdown = result.pricing?.breakdown as Record<string, unknown>
    expect(breakdown?.total).toBe(54_000)
    expect(breakdown?.lines).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ optionId: "opt_standard", quantity: 2, totalAmount: 24_000 }),
        expect.objectContaining({ optionId: "opt_upgrade", quantity: 2, totalAmount: 30_000 }),
      ]),
    )
  })

  it("scopes mixed-option category room prices to assigned traveler bands", async () => {
    const handler = createProductsBookingHandler({
      loadSlotDate: async () => "2026-07-27",
      loadProductOptions: async () => [
        {
          id: "opt_standard",
          name: "Standard",
          units: [{ id: "unit_standard", name: "Standard room", unitType: "room" }],
        },
        {
          id: "opt_upgrade",
          name: "Upgrade",
          units: [{ id: "unit_upgrade", name: "Upgrade room", unitType: "room" }],
        },
      ],
      loadResolvedOptionPrice: async (_ctx, input) => ({
        baseSellAmountCents: 0,
        unitPrices: [
          {
            unitId: input.optionId === "opt_standard" ? "unit_standard" : "unit_upgrade",
            unitType: "room",
            travelerCategory: "adult",
            sellAmountCents: input.optionId === "opt_standard" ? 12_000 : 15_000,
          },
        ],
      }),
    })

    const result = await handler.computeQuote(
      makeCtx([product]),
      baseRequest({
        configure: {
          departureSlotId: "slot_1",
          pax: { adult: 3 },
          optionSelections: [
            { optionId: "opt_standard", optionUnitId: "unit_standard", quantity: 1 },
            { optionId: "opt_upgrade", optionUnitId: "unit_upgrade", quantity: 1 },
          ],
        },
        travelers: [
          { rowId: "traveler_a", firstName: "A", lastName: "Adult", band: "adult" },
          { rowId: "traveler_b", firstName: "B", lastName: "Adult", band: "adult" },
          { rowId: "traveler_c", firstName: "C", lastName: "Adult", band: "adult" },
        ],
        accommodation: {
          travelerAssignments: {
            traveler_a: "unit_standard",
            traveler_b: "unit_standard",
            traveler_c: "unit_upgrade",
          },
        },
      }),
    )

    expect(result.available).toBe(true)
    const breakdown = result.pricing?.breakdown as Record<string, unknown>
    expect(breakdown?.total).toBe(39_000)
    expect(breakdown?.lines).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ optionId: "opt_standard", quantity: 2, totalAmount: 24_000 }),
        expect.objectContaining({ optionId: "opt_upgrade", quantity: 1, totalAmount: 15_000 }),
      ]),
    )
  })

  it("does not charge a selected category-priced room left empty by explicit assignments", async () => {
    const handler = createProductsBookingHandler({
      loadSlotDate: async () => "2026-07-27",
      loadProductOptions: async () => [
        {
          id: "opt_standard",
          name: "Standard",
          units: [{ id: "unit_standard", name: "Standard room", unitType: "room" }],
        },
        {
          id: "opt_upgrade",
          name: "Upgrade",
          units: [{ id: "unit_upgrade", name: "Upgrade room", unitType: "room" }],
        },
      ],
      loadResolvedOptionPrice: async (_ctx, input) => ({
        baseSellAmountCents: 0,
        unitPrices: [
          {
            unitId: input.optionId === "opt_standard" ? "unit_standard" : "unit_upgrade",
            unitType: "room",
            travelerCategory: "adult",
            sellAmountCents: input.optionId === "opt_standard" ? 12_000 : 15_000,
          },
        ],
      }),
    })

    const result = await handler.computeQuote(
      makeCtx([product]),
      baseRequest({
        configure: {
          departureSlotId: "slot_1",
          pax: { adult: 1 },
          optionSelections: [
            { optionId: "opt_standard", optionUnitId: "unit_standard", quantity: 1 },
            { optionId: "opt_upgrade", optionUnitId: "unit_upgrade", quantity: 1 },
          ],
        },
        travelers: [{ rowId: "traveler_a", firstName: "A", lastName: "Adult", band: "adult" }],
        accommodation: {
          travelerAssignments: { traveler_a: "unit_standard" },
        },
      }),
    )

    expect(result.available).toBe(true)
    const breakdown = result.pricing?.breakdown as Record<string, unknown>
    expect(breakdown?.total).toBe(12_000)
    expect(breakdown?.lines).toEqual([
      expect.objectContaining({ optionId: "opt_standard", quantity: 1, totalAmount: 12_000 }),
    ])
  })

  it("prices category-less per-person room rates from traveler room assignments", async () => {
    const handler = createProductsBookingHandler({
      loadSlotDate: async () => "2026-11-09",
      loadProductOptions: async () => [
        {
          id: "opt_standard",
          name: "Standard",
          units: [
            { id: "unit_double", name: "Double", unitType: "room" },
            { id: "unit_single", name: "Single", unitType: "room" },
          ],
        },
      ],
      loadResolvedOptionPrice: async () => ({
        baseSellAmountCents: 0,
        unitPrices: [
          {
            unitId: "unit_double",
            unitType: "room",
            travelerCategory: null,
            pricingMode: "per_person",
            sellAmountCents: 142_000,
          },
          {
            unitId: "unit_single",
            unitType: "room",
            travelerCategory: null,
            pricingMode: "per_person",
            sellAmountCents: 198_000,
          },
        ],
      }),
    })

    const result = await handler.computeQuote(
      makeCtx([product]),
      baseRequest({
        configure: {
          departureSlotId: "slot_1",
          pax: { adult: 3 },
          optionSelections: [
            { optionId: "opt_standard", optionUnitId: "unit_double", quantity: 1 },
            { optionId: "opt_standard", optionUnitId: "unit_single", quantity: 1 },
          ],
        },
        accommodation: {
          travelerAssignments: {
            traveler_x: "unit_double",
            traveler_y: "unit_double",
            traveler_z: "unit_single",
          },
        },
      }),
    )

    expect(result.available).toBe(true)
    const breakdown = result.pricing?.breakdown as Record<string, unknown>
    expect(breakdown?.total).toBe(482_000)
    expect(breakdown?.lines).toEqual([
      expect.objectContaining({
        label: "Double",
        quantity: 2,
        unitAmount: 142_000,
        totalAmount: 284_000,
        pricingBasis: "per_person",
      }),
      expect.objectContaining({
        label: "Single",
        quantity: 1,
        unitAmount: 198_000,
        totalAmount: 198_000,
        pricingBasis: "per_person",
      }),
    ])
  })

  it("quotes an explicit person fare together with room supplements", async () => {
    const handler = createProductsBookingHandler({
      loadSlotDate: async () => "2026-11-09",
      loadProductOptions: async () => [
        {
          id: "opt_standard",
          name: "Standard",
          units: [
            { id: "unit_adult", name: "Adult", unitType: "person" },
            { id: "unit_single", name: "SGL", unitType: "room" },
            { id: "unit_double", name: "DBL", unitType: "room" },
          ],
        },
      ],
      loadResolvedOptionPrice: async () => ({
        occupancyPriceBasis: "supplement",
        baseSellAmountCents: 0,
        unitPrices: [
          {
            unitId: "unit_adult",
            unitType: "person",
            travelerCategory: null,
            pricingMode: "per_person",
            sellAmountCents: 16_500,
          },
          {
            unitId: "unit_single",
            unitType: "room",
            travelerCategory: null,
            pricingMode: "per_person",
            sellAmountCents: 10_000,
          },
          {
            unitId: "unit_double",
            unitType: "room",
            travelerCategory: null,
            pricingMode: "per_person",
            sellAmountCents: 0,
          },
        ],
      }),
    })

    const result = await handler.computeQuote(
      makeCtx([product]),
      baseRequest({
        configure: {
          departureSlotId: "slot_1",
          pax: { adult: 3 },
          optionSelections: [
            { optionId: "opt_standard", optionUnitId: "unit_adult", quantity: 3 },
            { optionId: "opt_standard", optionUnitId: "unit_single", quantity: 1 },
            { optionId: "opt_standard", optionUnitId: "unit_double", quantity: 1 },
          ],
        },
        travelers: [
          { rowId: "traveler_a", firstName: "A", lastName: "Adult", band: "adult" },
          { rowId: "traveler_b", firstName: "B", lastName: "Adult", band: "adult" },
          { rowId: "traveler_c", firstName: "C", lastName: "Adult", band: "adult" },
        ],
        accommodation: {
          travelerAssignments: {
            traveler_a: "unit_single",
            traveler_b: "unit_double",
            traveler_c: "unit_double",
          },
        },
      }),
    )

    expect(result.available).toBe(true)
    const breakdown = result.pricing?.breakdown as Record<string, unknown>
    expect(breakdown?.total).toBe(59_500)
    expect(breakdown?.lines).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "base",
          optionUnitId: "unit_adult",
          label: "Adult",
          quantity: 3,
          unitAmount: 16_500,
          totalAmount: 49_500,
        }),
        expect.objectContaining({
          kind: "supplement",
          optionUnitId: "unit_single",
          label: "SGL",
          quantity: 1,
          unitAmount: 10_000,
          totalAmount: 10_000,
        }),
      ]),
    )
    expect(breakdown?.lines).toHaveLength(2)
  })

  it("does not add a person fare to an explicitly selected all-in room", async () => {
    const handler = createProductsBookingHandler({
      loadSlotDate: async () => "2026-11-09",
      loadProductOptions: async () => [
        {
          id: "opt_standard",
          name: "Standard",
          units: [
            { id: "unit_adult", name: "Adult", unitType: "person" },
            { id: "unit_double", name: "DBL", unitType: "room" },
          ],
        },
      ],
      loadResolvedOptionPrice: async () => ({
        occupancyPriceBasis: "all_in",
        baseSellAmountCents: 0,
        unitPrices: [
          {
            unitId: "unit_adult",
            unitType: "person",
            travelerCategory: null,
            pricingMode: "per_person",
            sellAmountCents: 16_500,
          },
          {
            unitId: "unit_double",
            unitType: "room",
            travelerCategory: null,
            pricingMode: "per_unit",
            sellAmountCents: 49_500,
          },
        ],
      }),
    })

    const result = await handler.computeQuote(
      makeCtx([product]),
      baseRequest({
        configure: {
          departureSlotId: "slot_1",
          pax: { adult: 3 },
          optionSelections: [
            { optionId: "opt_standard", optionUnitId: "unit_adult", quantity: 3 },
            { optionId: "opt_standard", optionUnitId: "unit_double", quantity: 1 },
          ],
        },
      }),
    )

    expect(result.available).toBe(true)
    const breakdown = result.pricing?.breakdown as Record<string, unknown>
    expect(breakdown?.total).toBe(49_500)
    expect(breakdown?.lines).toEqual([
      expect.objectContaining({
        kind: "base",
        optionUnitId: "unit_double",
        quantity: 1,
        totalAmount: 49_500,
      }),
    ])
  })

  it("uses selected option-unit pax tiers before falling back to the product base price", async () => {
    const loadPaxPricingTier = vi.fn(
      async (
        _ctx: OwnedHandlerContext,
        args: {
          productId: string
          optionUnitId: string
          tierPax: number
          date?: string | null
        },
      ): Promise<ResolvedPaxPricingTier | null> => {
        if (args.tierPax !== 2) return null
        if (args.optionUnitId === "unit_standard_adult") return { pricePerPaxCents: 12000 }
        if (args.optionUnitId === "unit_champagne_adult") return { pricePerPaxCents: 18000 }
        return null
      },
    )
    const handler = createProductsBookingHandler({
      loadProductOptions: async () => [
        {
          id: "opt_standard",
          name: "Standard",
          units: [{ id: "unit_standard_adult", name: "Adult", unitType: "person" }],
        },
        {
          id: "opt_champagne",
          name: "Champagne",
          units: [{ id: "unit_champagne_adult", name: "Adult", unitType: "person" }],
        },
      ],
      loadPaxPricingTier,
    })

    const standard = await handler.computeQuote(
      makeCtx([product]),
      baseRequest({
        configure: {
          optionSelections: [
            { optionId: "opt_standard", optionUnitId: "unit_standard_adult", quantity: 2 },
          ],
        },
      }),
    )
    const champagne = await handler.computeQuote(
      makeCtx([product]),
      baseRequest({
        configure: {
          optionSelections: [
            { optionId: "opt_champagne", optionUnitId: "unit_champagne_adult", quantity: 2 },
          ],
        },
      }),
    )

    expect(loadPaxPricingTier).toHaveBeenCalledWith(expect.anything(), {
      productId: product.id,
      optionUnitId: "unit_standard_adult",
      tierPax: 2,
      date: null,
    })
    expect(loadPaxPricingTier).toHaveBeenCalledWith(expect.anything(), {
      productId: product.id,
      optionUnitId: "unit_champagne_adult",
      tierPax: 2,
      date: null,
    })
    const standardBreakdown = standard.pricing?.breakdown as Record<string, unknown>
    const champagneBreakdown = champagne.pricing?.breakdown as Record<string, unknown>
    expect(standardBreakdown?.total).toBe(24000)
    expect(champagneBreakdown?.total).toBe(36000)
    expect(standardBreakdown?.total).not.toBe(champagneBreakdown?.total)
  })

  it("uses total person occupancy for mixed option-unit pax tier lookups", async () => {
    const loadPaxPricingTier = vi.fn(
      async (
        _ctx: OwnedHandlerContext,
        args: {
          productId: string
          optionUnitId: string
          tierPax: number
          date?: string | null
        },
      ): Promise<ResolvedPaxPricingTier | null> => {
        if (args.tierPax !== 3) return null
        if (args.optionUnitId === "unit_adult") return { pricePerPaxCents: 11000 }
        if (args.optionUnitId === "unit_child") return { pricePerPaxCents: 7000 }
        return null
      },
    )
    const handler = createProductsBookingHandler({
      loadProductOptions: async () => [
        {
          id: "opt_tour",
          name: "Tour",
          units: [
            { id: "unit_adult", name: "Adult", unitType: "person" },
            { id: "unit_child", name: "Child", unitType: "person" },
          ],
        },
      ],
      loadPaxPricingTier,
    })

    const result = await handler.computeQuote(
      makeCtx([product]),
      baseRequest({
        configure: {
          pax: { adult: 2, child: 1 },
          optionSelections: [
            { optionId: "opt_tour", optionUnitId: "unit_adult", quantity: 2 },
            { optionId: "opt_tour", optionUnitId: "unit_child", quantity: 1 },
          ],
        },
      }),
    )

    expect(loadPaxPricingTier).toHaveBeenCalledWith(expect.anything(), {
      productId: product.id,
      optionUnitId: "unit_adult",
      tierPax: 3,
      date: null,
    })
    expect(loadPaxPricingTier).toHaveBeenCalledWith(expect.anything(), {
      productId: product.id,
      optionUnitId: "unit_child",
      tierPax: 3,
      date: null,
    })
    const breakdown = result.pricing?.breakdown as Record<string, unknown>
    expect(breakdown?.total).toBe(29000)
  })

  it("falls through to product.sellAmountCents when the resolver returns null", async () => {
    const handler = createProductsBookingHandler({
      loadSlotDate: async () => "2026-12-01",
      loadResolvedOptionPrice: async () => null,
    })

    const result = await handler.computeQuote(
      makeCtx([product]),
      baseRequest({
        configure: {
          variantId: "opt_default",
          departureSlotId: "slot_1",
          pax: { adult: 1 },
        },
      }),
    )

    const breakdown = result.pricing?.breakdown as Record<string, unknown>
    expect(breakdown?.total).toBe(14500) // product.sellAmountCents × 1
  })

  it("skips the resolver when no slot is selected (single-occupant baseline)", async () => {
    const loadResolvedOptionPrice = vi.fn(async (): Promise<ResolvedOptionPrice | null> => null)

    const handler = createProductsBookingHandler({
      loadResolvedOptionPrice,
      loadSlotDate: async () => "2026-06-21",
    })

    const result = await handler.computeQuote(
      makeCtx([product]),
      baseRequest({ configure: { variantId: "opt_default" } }),
    )

    expect(loadResolvedOptionPrice).not.toHaveBeenCalled()
    const breakdown = result.pricing?.breakdown as Record<string, unknown>
    expect(breakdown?.total).toBe(14500) // single-occupant fallback
  })

  it("respects an inline draft.configure.departureDate when no loadSlotDate is wired", async () => {
    const loadResolvedOptionPrice = vi.fn(
      async (): Promise<ResolvedOptionPrice> => ({
        baseSellAmountCents: 20000,
        unitPrices: [],
      }),
    )

    const handler = createProductsBookingHandler({
      loadResolvedOptionPrice,
    })

    const result = await handler.computeQuote(
      makeCtx([product]),
      baseRequest({
        configure: {
          variantId: "opt_default",
          departureDate: "2026-06-21",
          pax: { adult: 2 },
        },
      }),
    )

    expect(loadResolvedOptionPrice).toHaveBeenCalledWith(expect.anything(), {
      productId: product.id,
      optionId: "opt_default",
      date: "2026-06-21",
    })
    const breakdown = result.pricing?.breakdown as Record<string, unknown>
    expect(breakdown?.total).toBe(40000)
  })
})
