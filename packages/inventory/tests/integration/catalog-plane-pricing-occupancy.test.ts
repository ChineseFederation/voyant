/**
 * Regression coverage for #4675: the "price from" aggregate MIN'd every
 * positive unit price, so a single-occupancy *supplement* beat the real
 * per-person fare and storefronts advertised the surcharge.
 *
 * These run the real projection against the migrated test schema — the SQL
 * reads `option_price_rules.occupancy_price_basis`, the room/person unit
 * types and the tier rows, none of which a stubbed loader would exercise.
 */

import type { IndexerSlice } from "@voyant-travel/catalog"
import { createProductPricingProjectionExtension } from "@voyant-travel/commerce"
import {
  optionPriceRules,
  optionUnitPriceRules,
  optionUnitTiers,
  priceCatalogs,
} from "@voyant-travel/commerce/schema"
import { cleanupTestDb, createTestDb } from "@voyant-travel/db/test-utils"
import { availabilitySlots, availabilityStartTimes } from "@voyant-travel/operations"
import { beforeEach, describe, expect, it } from "vitest"

import { optionUnits, productOptions, products } from "../../src/schema.js"

const DB_AVAILABLE = !!process.env.TEST_DATABASE_URL
const db = DB_AVAILABLE ? createTestDb() : (null as never)

const slice: IndexerSlice = {
  vertical: "products",
  locale: "en-GB",
  audience: "customer",
  market: "default",
}

const extension = createProductPricingProjectionExtension()

/**
 * Seed the shape the issue reports: a coach tour with one active default
 * option, an "Adult" per-person unit, single/double room units, a public
 * catalog and one future open departure.
 */
async function seedTour(suffix: string, sellAmountCents: number | null) {
  const [product] = await db
    .insert(products)
    .values({
      name: `Coach Tour ${suffix}`,
      status: "active",
      activated: true,
      visibility: "public",
      sellCurrency: "EUR",
      sellAmountCents,
    })
    .returning()
  const [option] = await db
    .insert(productOptions)
    .values({ productId: product.id, name: "Standard", status: "active", isDefault: true })
    .returning()
  const [adult] = await db
    .insert(optionUnits)
    .values({ optionId: option.id, name: "Adult", unitType: "person", isHidden: false })
    .returning()
  const [single] = await db
    .insert(optionUnits)
    .values({
      optionId: option.id,
      name: "SGL",
      unitType: "room",
      occupancyMin: 1,
      occupancyMax: 1,
      isHidden: false,
    })
    .returning()
  const [double] = await db
    .insert(optionUnits)
    .values({
      optionId: option.id,
      name: "DBL",
      unitType: "room",
      occupancyMin: 2,
      occupancyMax: 2,
      isHidden: false,
    })
    .returning()
  const [catalog] = await db
    .insert(priceCatalogs)
    .values({
      code: `PUBLIC-EUR-${suffix}`,
      name: "Public EUR",
      currencyCode: "EUR",
      catalogType: "public",
      isDefault: true,
      active: true,
    })
    .returning()
  const [startTime] = await db
    .insert(availabilityStartTimes)
    .values({
      productId: product.id,
      optionId: option.id,
      label: "Departure",
      startTimeLocal: "08:00",
      durationMinutes: 480,
      active: true,
    })
    .returning()
  const departsAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
  await db.insert(availabilitySlots).values({
    productId: product.id,
    optionId: option.id,
    startTimeId: startTime.id,
    dateLocal: departsAt.toISOString().slice(0, 10),
    startsAt: departsAt,
    endsAt: new Date(departsAt.getTime() + 8 * 60 * 60 * 1000),
    timezone: "Europe/Bucharest",
    status: "open",
    remainingPax: 30,
    initialPax: 40,
  })

  return { product, option, adult, single, double, catalog }
}

/**
 * Add a second bookable option to a seeded tour, with its own room unit
 * and its own future departure so it passes the projection's bookability
 * check independently.
 */
async function seedSecondOption(productId: string, suffix: string) {
  const [option] = await db
    .insert(productOptions)
    .values({ productId, name: `Option ${suffix}`, status: "active", isDefault: false })
    .returning()
  const [room] = await db
    .insert(optionUnits)
    .values({
      optionId: option.id,
      name: "DBL",
      unitType: "room",
      occupancyMin: 2,
      occupancyMax: 2,
      isHidden: false,
    })
    .returning()
  const [startTime] = await db
    .insert(availabilityStartTimes)
    .values({
      productId,
      optionId: option.id,
      label: "Departure",
      startTimeLocal: "08:00",
      durationMinutes: 480,
      active: true,
    })
    .returning()
  const departsAt = new Date(Date.now() + 45 * 24 * 60 * 60 * 1000)
  await db.insert(availabilitySlots).values({
    productId,
    optionId: option.id,
    startTimeId: startTime.id,
    dateLocal: departsAt.toISOString().slice(0, 10),
    startsAt: departsAt,
    endsAt: new Date(departsAt.getTime() + 8 * 60 * 60 * 1000),
    timezone: "Europe/Bucharest",
    status: "open",
    remainingPax: 30,
    initialPax: 40,
  })

  return { option, room }
}

async function insertDefaultRule(input: {
  productId: string
  optionId: string
  priceCatalogId: string
  occupancyPriceBasis: "supplement" | "all_in" | null
  baseSellAmountCents?: number | null
}) {
  const [rule] = await db
    .insert(optionPriceRules)
    .values({
      productId: input.productId,
      optionId: input.optionId,
      priceCatalogId: input.priceCatalogId,
      name: "Default",
      pricingMode: "per_person",
      isDefault: true,
      active: true,
      occupancyPriceBasis: input.occupancyPriceBasis,
      baseSellAmountCents: input.baseSellAmountCents ?? null,
    })
    .returning()
  return rule
}

function insertUnitPrice(input: {
  optionPriceRuleId: string
  optionId: string
  unitId: string
  sellAmountCents: number
}) {
  return db
    .insert(optionUnitPriceRules)
    .values({
      optionPriceRuleId: input.optionPriceRuleId,
      optionId: input.optionId,
      unitId: input.unitId,
      pricingMode: "per_person",
      sellAmountCents: input.sellAmountCents,
      active: true,
    })
    .returning()
}

async function projectPricing(productId: string) {
  const projected = await extension.project(db, productId, slice)
  return {
    priceFromAmountCents: projected.get("priceFromAmountCents"),
    priceFromCurrency: projected.get("priceFromCurrency"),
    hasPricing: projected.get("hasPricing"),
  }
}

describe.skipIf(!DB_AVAILABLE)("price-from aggregate over occupancy pricing", () => {
  beforeEach(async () => {
    await cleanupTestDb(db)
  })

  it("ignores a single supplement and reports the per-person fare", async () => {
    const tour = await seedTour("supplement", 16_500)
    const rule = await insertDefaultRule({
      productId: tour.product.id,
      optionId: tour.option.id,
      priceCatalogId: tour.catalog.id,
      occupancyPriceBasis: "supplement",
    })
    await insertUnitPrice({
      optionPriceRuleId: rule.id,
      optionId: tour.option.id,
      unitId: tour.adult.id,
      sellAmountCents: 16_500,
    })
    // SGL costs 100 EUR *on top of* the fare; DBL adds nothing.
    await insertUnitPrice({
      optionPriceRuleId: rule.id,
      optionId: tour.option.id,
      unitId: tour.single.id,
      sellAmountCents: 10_000,
    })
    await insertUnitPrice({
      optionPriceRuleId: rule.id,
      optionId: tour.option.id,
      unitId: tour.double.id,
      sellAmountCents: 0,
    })

    expect(await projectPricing(tour.product.id)).toEqual({
      priceFromAmountCents: 16_500,
      priceFromCurrency: "EUR",
      hasPricing: true,
    })
  })

  it("ignores a supplement carried on a tier row", async () => {
    const tour = await seedTour("supplement-tier", null)
    const rule = await insertDefaultRule({
      productId: tour.product.id,
      optionId: tour.option.id,
      priceCatalogId: tour.catalog.id,
      occupancyPriceBasis: "supplement",
      baseSellAmountCents: 16_500,
    })
    const [singleRule] = await insertUnitPrice({
      optionPriceRuleId: rule.id,
      optionId: tour.option.id,
      unitId: tour.single.id,
      sellAmountCents: 0,
    })
    await db.insert(optionUnitTiers).values({
      optionUnitPriceRuleId: singleRule.id,
      minQuantity: 1,
      sellAmountCents: 10_000,
      active: true,
    })

    expect(await projectPricing(tour.product.id)).toEqual({
      priceFromAmountCents: 16_500,
      priceFromCurrency: "EUR",
      hasPricing: true,
    })
  })

  it("ignores room amounts on a legacy rule that still prices a traveler", async () => {
    // `occupancy_price_basis` predates neither the data nor the check that
    // now blocks saving this shape, so rows written before #4395 carry no
    // basis at all. A rule that prices a traveler cannot have standalone
    // room prices, so the room amounts stay out of the aggregate.
    const tour = await seedTour("legacy-null-basis", null)
    const rule = await insertDefaultRule({
      productId: tour.product.id,
      optionId: tour.option.id,
      priceCatalogId: tour.catalog.id,
      occupancyPriceBasis: null,
    })
    await insertUnitPrice({
      optionPriceRuleId: rule.id,
      optionId: tour.option.id,
      unitId: tour.adult.id,
      sellAmountCents: 16_500,
    })
    await insertUnitPrice({
      optionPriceRuleId: rule.id,
      optionId: tour.option.id,
      unitId: tour.single.id,
      sellAmountCents: 10_000,
    })

    expect(await projectPricing(tour.product.id)).toEqual({
      priceFromAmountCents: 16_500,
      priceFromCurrency: "EUR",
      hasPricing: true,
    })
  })

  it("keeps room prices when the rule declares them all-in", async () => {
    const tour = await seedTour("all-in", 40_000)
    const rule = await insertDefaultRule({
      productId: tour.product.id,
      optionId: tour.option.id,
      priceCatalogId: tour.catalog.id,
      occupancyPriceBasis: "all_in",
    })
    await insertUnitPrice({
      optionPriceRuleId: rule.id,
      optionId: tour.option.id,
      unitId: tour.single.id,
      sellAmountCents: 20_000,
    })
    await insertUnitPrice({
      optionPriceRuleId: rule.id,
      optionId: tour.option.id,
      unitId: tour.double.id,
      sellAmountCents: 33_000,
    })

    expect(await projectPricing(tour.product.id)).toEqual({
      priceFromAmountCents: 20_000,
      priceFromCurrency: "EUR",
      hasPricing: true,
    })
  })

  it("keeps room prices when nothing else on the rule prices a traveler", async () => {
    // No basis and no traveler fare: `classifyOccupancyPrice` infers
    // `all_in`, so the room amount is the whole price.
    const tour = await seedTour("inferred-all-in", null)
    const rule = await insertDefaultRule({
      productId: tour.product.id,
      optionId: tour.option.id,
      priceCatalogId: tour.catalog.id,
      occupancyPriceBasis: null,
    })
    await insertUnitPrice({
      optionPriceRuleId: rule.id,
      optionId: tour.option.id,
      unitId: tour.double.id,
      sellAmountCents: 33_000,
    })

    expect(await projectPricing(tour.product.id)).toEqual({
      priceFromAmountCents: 33_000,
      priceFromCurrency: "EUR",
      hasPricing: true,
    })
  })

  it("compares a supplement option's fare against another option's all-in room", async () => {
    // Both amounts are payable, so the cheaper one is the "from" price —
    // room prices do not outrank fares just for being room prices.
    const tour = await seedTour("mixed-options", null)
    const supplementRule = await insertDefaultRule({
      productId: tour.product.id,
      optionId: tour.option.id,
      priceCatalogId: tour.catalog.id,
      occupancyPriceBasis: "supplement",
    })
    await insertUnitPrice({
      optionPriceRuleId: supplementRule.id,
      optionId: tour.option.id,
      unitId: tour.adult.id,
      sellAmountCents: 16_500,
    })
    await insertUnitPrice({
      optionPriceRuleId: supplementRule.id,
      optionId: tour.option.id,
      unitId: tour.single.id,
      sellAmountCents: 10_000,
    })

    const second = await seedSecondOption(tour.product.id, "all-in")
    const allInRule = await insertDefaultRule({
      productId: tour.product.id,
      optionId: second.option.id,
      priceCatalogId: tour.catalog.id,
      occupancyPriceBasis: "all_in",
    })
    await insertUnitPrice({
      optionPriceRuleId: allInRule.id,
      optionId: second.option.id,
      unitId: second.room.id,
      sellAmountCents: 30_000,
    })

    expect(await projectPricing(tour.product.id)).toEqual({
      priceFromAmountCents: 16_500,
      priceFromCurrency: "EUR",
      hasPricing: true,
    })
  })

  it("ignores the base amount of an all-in rule, which nobody is charged", async () => {
    const tour = await seedTour("all-in-stale-base", null)
    const rule = await insertDefaultRule({
      productId: tour.product.id,
      optionId: tour.option.id,
      priceCatalogId: tour.catalog.id,
      occupancyPriceBasis: "all_in",
      baseSellAmountCents: 10_000,
    })
    await insertUnitPrice({
      optionPriceRuleId: rule.id,
      optionId: tour.option.id,
      unitId: tour.double.id,
      sellAmountCents: 33_000,
    })

    expect(await projectPricing(tour.product.id)).toEqual({
      priceFromAmountCents: 33_000,
      priceFromCurrency: "EUR",
      hasPricing: true,
    })
  })

  it("falls back to the product row when only supplements are priced", async () => {
    const tour = await seedTour("supplement-only", 16_500)
    const rule = await insertDefaultRule({
      productId: tour.product.id,
      optionId: tour.option.id,
      priceCatalogId: tour.catalog.id,
      occupancyPriceBasis: "supplement",
    })
    await insertUnitPrice({
      optionPriceRuleId: rule.id,
      optionId: tour.option.id,
      unitId: tour.single.id,
      sellAmountCents: 10_000,
    })

    expect(await projectPricing(tour.product.id)).toEqual({
      priceFromAmountCents: 16_500,
      priceFromCurrency: "EUR",
      hasPricing: true,
    })
  })
})
