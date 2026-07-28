import {
  optionPriceRules,
  optionUnitPriceRules,
  priceCatalogs,
} from "@voyant-travel/commerce/schema"
import { cleanupTestDb, createTestDb } from "@voyant-travel/db/test-utils"
import { eq } from "drizzle-orm"
import { beforeEach, describe, expect, it } from "vitest"

import {
  applyProductUnitConfiguration,
  type ProductUnitConfigurationError,
  previewProductUnitConfiguration,
} from "../../src/product-unit-configuration.js"
import { optionUnits, productOptions, products } from "../../src/schema.js"

const DB_AVAILABLE = Boolean(process.env.TEST_DATABASE_URL)
const db = DB_AVAILABLE ? createTestDb() : (null as never)

describe("product unit approval integrity", () => {
  it("rejects a modified approval plan before opening a transaction", async () => {
    await expect(
      applyProductUnitConfiguration({} as never, {
        status: "ready",
        productId: "prod_1",
        optionId: "opt_1",
        optionPriceRuleId: "oprule_1",
        currencyCode: "EUR",
        beforeRevision: "modified",
        afterRevision: "modified",
        units: [
          {
            unitId: "unit_twin",
            unitPriceRuleId: "uprice_twin",
            name: "Twin",
            changed: false,
            before: { maxQuantity: 3, sellAmountCents: 52_000 },
            after: { maxQuantity: 2, sellAmountCents: 54_000 },
          },
        ],
      }),
    ).rejects.toMatchObject<ProductUnitConfigurationError>({ code: "invalid_plan" })
  })
})

describe.skipIf(!DB_AVAILABLE)("atomic product unit configuration", () => {
  beforeEach(() => cleanupTestDb(db))

  it("does not change inventory when a requested unit price is unsupported", async () => {
    const fixture = await seedRoomConfiguration({ twinHasPriceRule: false })
    const preview = await previewProductUnitConfiguration(db, {
      productId: fixture.productId,
      optionPriceRuleId: fixture.optionPriceRuleId,
      changes: [{ unitId: fixture.twinUnitId, maxQuantity: 2, sellAmountCents: 54_000 }],
    })

    expect(preview).toMatchObject({
      status: "invalid",
      issues: [{ code: "unit_price_rule_missing", unitId: fixture.twinUnitId }],
    })
    await expect(applyProductUnitConfiguration(db, preview as never)).rejects.toThrow()

    const [twin] = await db
      .select({ maxQuantity: optionUnits.maxQuantity })
      .from(optionUnits)
      .where(eq(optionUnits.id, fixture.twinUnitId))
    expect(twin?.maxQuantity).toBe(3)
  })

  it("previews every unit, applies twin-only quantity and price atomically, and replays safely", async () => {
    const fixture = await seedRoomConfiguration({ twinHasPriceRule: true })
    const preview = await previewProductUnitConfiguration(db, {
      productId: fixture.productId,
      optionPriceRuleId: fixture.optionPriceRuleId,
      changes: [{ unitId: fixture.twinUnitId, maxQuantity: 2, sellAmountCents: 54_000 }],
    })

    expect(preview).toMatchObject({
      status: "ready",
      currencyCode: "EUR",
      units: [
        {
          unitId: fixture.doubleUnitId,
          changed: false,
          before: { maxQuantity: 4, sellAmountCents: 52_000 },
          after: { maxQuantity: 4, sellAmountCents: 52_000 },
        },
        {
          unitId: fixture.twinUnitId,
          changed: true,
          before: { maxQuantity: 3, sellAmountCents: 52_000 },
          after: { maxQuantity: 2, sellAmountCents: 54_000 },
        },
      ],
    })
    if (preview.status !== "ready") throw new Error("expected a ready preview")

    await expect(applyProductUnitConfiguration(db, preview)).resolves.toMatchObject({
      status: "applied",
      afterRevision: preview.afterRevision,
    })
    await expect(applyProductUnitConfiguration(db, preview)).resolves.toMatchObject({
      status: "replayed",
      afterRevision: preview.afterRevision,
    })

    const units = await db
      .select({ id: optionUnits.id, maxQuantity: optionUnits.maxQuantity })
      .from(optionUnits)
    expect(units).toEqual(
      expect.arrayContaining([
        { id: fixture.doubleUnitId, maxQuantity: 4 },
        { id: fixture.twinUnitId, maxQuantity: 2 },
      ]),
    )
    const prices = await db
      .select({
        unitId: optionUnitPriceRules.unitId,
        sellAmountCents: optionUnitPriceRules.sellAmountCents,
      })
      .from(optionUnitPriceRules)
    expect(prices).toEqual(
      expect.arrayContaining([
        { unitId: fixture.doubleUnitId, sellAmountCents: 52_000 },
        { unitId: fixture.twinUnitId, sellAmountCents: 54_000 },
      ]),
    )
  })
})

async function seedRoomConfiguration(input: { twinHasPriceRule: boolean }) {
  const [product] = await db
    .insert(products)
    .values({ name: "Bucharest rooms", sellCurrency: "EUR" })
    .returning()
  if (!product) throw new Error("failed to seed product")
  const [option] = await db
    .insert(productOptions)
    .values({ productId: product.id, name: "Rooms", status: "active", isDefault: true })
    .returning()
  if (!option) throw new Error("failed to seed option")
  const [doubleUnit, twinUnit] = await db
    .insert(optionUnits)
    .values([
      {
        optionId: option.id,
        name: "Double",
        unitType: "room",
        occupancyMin: 2,
        occupancyMax: 2,
        maxQuantity: 4,
      },
      {
        optionId: option.id,
        name: "Twin",
        unitType: "room",
        occupancyMin: 2,
        occupancyMax: 2,
        maxQuantity: 3,
      },
    ])
    .returning()
  if (!doubleUnit || !twinUnit) throw new Error("failed to seed units")
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
      pricingMode: "per_unit",
      sellAmountCents: 52_000,
      active: true,
    },
    ...(input.twinHasPriceRule
      ? [
          {
            optionPriceRuleId: priceRule.id,
            optionId: option.id,
            unitId: twinUnit.id,
            pricingMode: "per_unit" as const,
            sellAmountCents: 52_000,
            active: true,
          },
        ]
      : []),
  ])
  return {
    productId: product.id,
    optionPriceRuleId: priceRule.id,
    doubleUnitId: doubleUnit.id,
    twinUnitId: twinUnit.id,
  }
}
