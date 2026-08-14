import {
  optionPriceRules,
  optionUnitPriceRules,
  priceCatalogs,
  pricingCategories,
} from "@voyant-travel/commerce/schema"
import { cleanupTestDb, createTestDb } from "@voyant-travel/db/test-utils"
import { beforeEach, describe, expect, it, vi } from "vitest"

import type { CreateProductsBookingHandlerOptions } from "../../src/booking-engine/handler.js"
import { optionUnits, productOptions, products } from "../../src/schema.js"

/**
 * The runtime's two readers of a product's traveler categories — the pax-band
 * loader that shapes the journey and the price resolver that quotes it — are
 * closures inside `registerProductBookingHandler`, so this captures the very
 * options object production registers rather than re-deriving the queries.
 */
const capture = vi.hoisted(() => ({ options: null as CreateProductsBookingHandlerOptions | null }))

vi.mock("@voyant-travel/inventory/booking-engine", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/booking-engine.js")>()
  return {
    ...actual,
    createProductsBookingHandler: (options: CreateProductsBookingHandlerOptions) => {
      capture.options = options
      return actual.createProductsBookingHandler(options)
    },
  }
})

const { registerProductBookingHandler } = await import(
  "../../src/booking-engine/product-runtime.js"
)

const DB_AVAILABLE = Boolean(process.env.TEST_DATABASE_URL)
const db = DB_AVAILABLE ? createTestDb() : (null as never)
const DATE = "2026-09-14"

/**
 * The pricing editor lets a unit price row name a shared/global category — one
 * scoped to no product at all — and operators do: "Double / Adult" against the
 * operator-wide Adult. The runtime used to load only the categories the product
 * hierarchy owns, so that row resolved to no band and the €690 room price was
 * dropped, quoting the product at zero (voyant#4571).
 */
describe.skipIf(!DB_AVAILABLE)("booking runtime with shared pricing categories", () => {
  beforeEach(() => cleanupTestDb(db))

  it("prices a room whose per-person price names the operator-wide Adult", async () => {
    const fixture = await seedRoomPrices({ productScopedAdult: false })
    const { bands, price } = await resolveShape(fixture)

    expect(price?.unitPrices).toEqual([
      expect.objectContaining({ travelerCategory: "adult", sellAmountCents: 69_000 }),
    ])
    // The band the price is charged against has to be one the shopper was
    // offered, or `paxBandUnitCharges` counts zero travelers for it and the
    // room falls back out of the quote again.
    expect(bands?.map((band) => band.code)).toContain("adult")
  })

  it("keeps the product's own Adult on the code the journey offers it under", async () => {
    // Both an operator-wide Adult and the product's own Adult exist, and the
    // shared one sorts first. Resolving prices from a category set the band
    // loader does not see hands the product's Adult a second-tier code here and
    // the bare `adult` there — the price then matches no band at all.
    const fixture = await seedRoomPrices({ productScopedAdult: true })
    const { bands, price } = await resolveShape(fixture)

    const offered = new Set(bands?.map((band) => band.code))
    expect(price?.unitPrices).toHaveLength(2)
    for (const unitPrice of price?.unitPrices ?? []) {
      expect(offered).toContain(unitPrice.travelerCategory)
    }
    // Two adult tiers, two distinct codes — neither shadows the other.
    expect(new Set(price?.unitPrices.map((unitPrice) => unitPrice.travelerCategory)).size).toBe(2)
  })
})

async function resolveShape(fixture: Awaited<ReturnType<typeof seedRoomPrices>>) {
  capture.options = null
  registerProductBookingHandler({ register: () => {} } as never, {} as never)
  const options = capture.options
  if (!options) throw new Error("the product booking handler was not registered")

  const ctx = { db } as never
  const [bands, price] = await Promise.all([
    options.loadPaxBands?.(ctx, fixture.productId),
    options.loadResolvedOptionPrice?.(ctx, {
      productId: fixture.productId,
      optionId: fixture.optionId,
      date: DATE,
    }),
  ])
  return { bands, price }
}

async function seedRoomPrices(input: { productScopedAdult: boolean }) {
  const [product] = await db
    .insert(products)
    .values({ name: "Turkey by the coast", sellCurrency: "EUR" })
    .returning()
  if (!product) throw new Error("failed to seed product")
  const [option] = await db
    .insert(productOptions)
    .values({ productId: product.id, name: "Rooms", status: "active", isDefault: true })
    .returning()
  if (!option) throw new Error("failed to seed option")
  const [doubleUnit] = await db
    .insert(optionUnits)
    .values({
      optionId: option.id,
      name: "Double",
      unitType: "room",
      occupancyMin: 2,
      occupancyMax: 2,
      maxQuantity: 4,
    })
    .returning()
  if (!doubleUnit) throw new Error("failed to seed unit")

  // Scoped to nothing: the operator-wide traveler type the pricing editor
  // offers on every product.
  const [sharedAdult] = await db
    .insert(pricingCategories)
    .values({ code: "ADULT", name: "Adult", categoryType: "adult", sortOrder: 0, active: true })
    .returning()
  if (!sharedAdult) throw new Error("failed to seed the shared category")
  const [productAdult] = input.productScopedAdult
    ? await db
        .insert(pricingCategories)
        .values({
          productId: product.id,
          code: "ADULT-TURKEY",
          name: "Adult (coast rate)",
          categoryType: "adult",
          sortOrder: 1,
          active: true,
        })
        .returning()
    : []

  const [catalog] = await db
    .insert(priceCatalogs)
    .values({
      code: "QA-EUR",
      name: "QA EUR",
      currencyCode: "EUR",
      catalogType: "public",
      isDefault: true,
      active: true,
    })
    .returning()
  if (!catalog) throw new Error("failed to seed catalog")
  const [priceRule] = await db
    .insert(optionPriceRules)
    .values({
      productId: product.id,
      optionId: option.id,
      priceCatalogId: catalog.id,
      name: "Default room prices",
      pricingMode: "per_person",
      isDefault: true,
      active: true,
    })
    .returning()
  if (!priceRule) throw new Error("failed to seed option price rule")
  await db.insert(optionUnitPriceRules).values([
    {
      optionPriceRuleId: priceRule.id,
      optionId: option.id,
      unitId: doubleUnit.id,
      pricingCategoryId: sharedAdult.id,
      pricingMode: "per_person" as const,
      sellAmountCents: 69_000,
      active: true,
    },
    ...(productAdult
      ? [
          {
            optionPriceRuleId: priceRule.id,
            optionId: option.id,
            unitId: doubleUnit.id,
            pricingCategoryId: productAdult.id,
            pricingMode: "per_person" as const,
            sellAmountCents: 74_000,
            active: true,
          },
        ]
      : []),
  ])

  return { productId: product.id, optionId: option.id, unitId: doubleUnit.id }
}
