import { listResponse, listResponseSchema } from "@voyant-travel/types"
import type { InferSelectModel } from "drizzle-orm"
import { describe, expect, it } from "vitest"
import { z } from "zod"
import type { departurePriceOverrides } from "./schema-departure-overrides.js"
import type {
  dropoffPriceRules,
  extraPriceRules,
  optionPriceRules,
  optionStartTimeRules,
  optionUnitPriceRules,
  optionUnitTiers,
  pickupPriceRules,
} from "./schema-option-rules.js"

/**
 * Response contract tests (voyant#2114 / voyant#2208 — Admin Batch 2b) for the
 * pricing rule admin routes. Each fixture is typed as the real Drizzle row so
 * column drift breaks compilation; the JSON round-trip (Date → ISO string)
 * mirrors `c.json` so a declared/actual mismatch breaks the test. The schemas
 * below mirror the response shapes declared in `routes-rules.ts`.
 */

const isoTimestamp = z.string()
const metadataSchema = z.record(z.string(), z.unknown()).nullable()

const optionPriceRuleSchema = z.object({
  id: z.string(),
  productId: z.string(),
  optionId: z.string(),
  priceCatalogId: z.string(),
  priceScheduleId: z.string().nullable(),
  cancellationPolicyId: z.string().nullable(),
  code: z.string().nullable(),
  name: z.string(),
  description: z.string().nullable(),
  pricingMode: z.string(),
  occupancyPriceBasis: z.enum(["supplement", "all_in"]).nullable(),
  baseSellAmountCents: z.number().int().nullable(),
  baseCostAmountCents: z.number().int().nullable(),
  minPerBooking: z.number().int().nullable(),
  maxPerBooking: z.number().int().nullable(),
  allPricingCategories: z.boolean(),
  isDefault: z.boolean(),
  active: z.boolean(),
  notes: z.string().nullable(),
  metadata: metadataSchema,
  createdAt: isoTimestamp,
  updatedAt: isoTimestamp,
})

const optionUnitPriceRuleSchema = z.object({
  id: z.string(),
  optionPriceRuleId: z.string(),
  optionId: z.string(),
  unitId: z.string(),
  pricingCategoryId: z.string().nullable(),
  pricingMode: z.string(),
  sellAmountCents: z.number().int().nullable(),
  costAmountCents: z.number().int().nullable(),
  minQuantity: z.number().int().nullable(),
  maxQuantity: z.number().int().nullable(),
  active: z.boolean(),
  sortOrder: z.number().int(),
  notes: z.string().nullable(),
  metadata: metadataSchema,
  createdAt: isoTimestamp,
  updatedAt: isoTimestamp,
})

const optionStartTimeRuleSchema = z.object({
  id: z.string(),
  optionPriceRuleId: z.string(),
  optionId: z.string(),
  startTimeId: z.string(),
  ruleMode: z.string(),
  adjustmentType: z.string().nullable(),
  sellAdjustmentCents: z.number().int().nullable(),
  costAdjustmentCents: z.number().int().nullable(),
  adjustmentBasisPoints: z.number().int().nullable(),
  active: z.boolean(),
  notes: z.string().nullable(),
  createdAt: isoTimestamp,
  updatedAt: isoTimestamp,
})

const optionUnitTierSchema = z.object({
  id: z.string(),
  optionUnitPriceRuleId: z.string(),
  minQuantity: z.number().int(),
  maxQuantity: z.number().int().nullable(),
  sellAmountCents: z.number().int().nullable(),
  costAmountCents: z.number().int().nullable(),
  active: z.boolean(),
  sortOrder: z.number().int(),
  createdAt: isoTimestamp,
  updatedAt: isoTimestamp,
})

const pickupPriceRuleSchema = z.object({
  id: z.string(),
  optionPriceRuleId: z.string(),
  optionId: z.string(),
  pickupPointId: z.string(),
  pricingMode: z.string(),
  sellAmountCents: z.number().int().nullable(),
  costAmountCents: z.number().int().nullable(),
  active: z.boolean(),
  sortOrder: z.number().int(),
  notes: z.string().nullable(),
  createdAt: isoTimestamp,
  updatedAt: isoTimestamp,
})

const dropoffPriceRuleSchema = z.object({
  id: z.string(),
  optionPriceRuleId: z.string(),
  optionId: z.string(),
  facilityId: z.string().nullable(),
  dropoffCode: z.string().nullable(),
  dropoffName: z.string(),
  pricingMode: z.string(),
  sellAmountCents: z.number().int().nullable(),
  costAmountCents: z.number().int().nullable(),
  active: z.boolean(),
  sortOrder: z.number().int(),
  notes: z.string().nullable(),
  createdAt: isoTimestamp,
  updatedAt: isoTimestamp,
})

const extraPriceRuleSchema = z.object({
  id: z.string(),
  optionPriceRuleId: z.string(),
  optionId: z.string(),
  productExtraId: z.string().nullable(),
  optionExtraConfigId: z.string().nullable(),
  pricingMode: z.string(),
  sellAmountCents: z.number().int().nullable(),
  costAmountCents: z.number().int().nullable(),
  active: z.boolean(),
  sortOrder: z.number().int(),
  notes: z.string().nullable(),
  metadata: metadataSchema,
  createdAt: isoTimestamp,
  updatedAt: isoTimestamp,
})

const departurePriceOverrideSchema = z.object({
  id: z.string(),
  departureId: z.string(),
  optionId: z.string(),
  optionUnitId: z.string(),
  priceCatalogId: z.string(),
  sellAmountCents: z.number().int(),
  costAmountCents: z.number().int().nullable(),
  notes: z.string().nullable(),
  active: z.boolean(),
  metadata: metadataSchema,
  createdAt: isoTimestamp,
  updatedAt: isoTimestamp,
})

const createdAt = new Date("2026-01-01T00:00:00.000Z")
const updatedAt = new Date("2026-01-02T00:00:00.000Z")

const optionPriceRuleRow: InferSelectModel<typeof optionPriceRules> = {
  id: "option_price_rules_0000000000000000000",
  productId: "product_0000000000000000000000000000",
  optionId: "option_00000000000000000000000000000",
  priceCatalogId: "price_catalogs_00000000000000000000000",
  priceScheduleId: null,
  cancellationPolicyId: null,
  code: "STD",
  name: "Standard adult",
  description: null,
  pricingMode: "per_person",
  occupancyPriceBasis: "supplement",
  baseSellAmountCents: 10000,
  baseCostAmountCents: null,
  minPerBooking: null,
  maxPerBooking: null,
  allPricingCategories: true,
  isDefault: false,
  active: true,
  notes: null,
  metadata: null,
  createdAt,
  updatedAt,
}

const optionUnitPriceRuleRow: InferSelectModel<typeof optionUnitPriceRules> = {
  id: "option_unit_price_rules_00000000000000",
  optionPriceRuleId: "option_price_rules_0000000000000000000",
  optionId: "option_00000000000000000000000000000",
  unitId: "unit_000000000000000000000000000000000",
  pricingCategoryId: null,
  pricingMode: "per_unit",
  sellAmountCents: 5000,
  costAmountCents: null,
  minQuantity: null,
  maxQuantity: null,
  active: true,
  sortOrder: 0,
  notes: null,
  metadata: null,
  createdAt,
  updatedAt,
}

const optionStartTimeRuleRow: InferSelectModel<typeof optionStartTimeRules> = {
  id: "option_start_time_rules_00000000000000",
  optionPriceRuleId: "option_price_rules_0000000000000000000",
  optionId: "option_00000000000000000000000000000",
  startTimeId: "start_time_0000000000000000000000000",
  ruleMode: "included",
  adjustmentType: null,
  sellAdjustmentCents: null,
  costAdjustmentCents: null,
  adjustmentBasisPoints: null,
  active: true,
  notes: null,
  createdAt,
  updatedAt,
}

const optionUnitTierRow: InferSelectModel<typeof optionUnitTiers> = {
  id: "option_unit_tiers_0000000000000000000",
  optionUnitPriceRuleId: "option_unit_price_rules_00000000000000",
  minQuantity: 1,
  maxQuantity: null,
  sellAmountCents: 5000,
  costAmountCents: null,
  active: true,
  sortOrder: 0,
  createdAt,
  updatedAt,
}

const pickupPriceRuleRow: InferSelectModel<typeof pickupPriceRules> = {
  id: "pickup_price_rules_0000000000000000000",
  optionPriceRuleId: "option_price_rules_0000000000000000000",
  optionId: "option_00000000000000000000000000000",
  pickupPointId: "pickup_point_000000000000000000000000",
  pricingMode: "included",
  sellAmountCents: null,
  costAmountCents: null,
  active: true,
  sortOrder: 0,
  notes: null,
  createdAt,
  updatedAt,
}

const dropoffPriceRuleRow: InferSelectModel<typeof dropoffPriceRules> = {
  id: "dropoff_price_rules_000000000000000000",
  optionPriceRuleId: "option_price_rules_0000000000000000000",
  optionId: "option_00000000000000000000000000000",
  facilityId: null,
  dropoffCode: null,
  dropoffName: "Airport",
  pricingMode: "included",
  sellAmountCents: null,
  costAmountCents: null,
  active: true,
  sortOrder: 0,
  notes: null,
  createdAt,
  updatedAt,
}

const extraPriceRuleRow: InferSelectModel<typeof extraPriceRules> = {
  id: "extra_price_rules_0000000000000000000",
  optionPriceRuleId: "option_price_rules_0000000000000000000",
  optionId: "option_00000000000000000000000000000",
  productExtraId: null,
  optionExtraConfigId: null,
  // `addon_pricing_mode` domain — `unavailable` is part of the enum (§3)
  pricingMode: "unavailable",
  sellAmountCents: null,
  costAmountCents: null,
  active: true,
  sortOrder: 0,
  notes: null,
  metadata: null,
  createdAt,
  updatedAt,
}

const departurePriceOverrideRow: InferSelectModel<typeof departurePriceOverrides> = {
  id: "departure_price_overrides_000000000000",
  departureId: "departure_0000000000000000000000000000",
  optionId: "option_00000000000000000000000000000",
  optionUnitId: "option_unit_0000000000000000000000000",
  priceCatalogId: "price_catalogs_00000000000000000000000",
  sellAmountCents: 12000,
  costAmountCents: null,
  notes: null,
  active: true,
  metadata: null,
  createdAt,
  updatedAt,
}

const cases = [
  ["option price rule", optionPriceRuleSchema, optionPriceRuleRow],
  ["option unit price rule", optionUnitPriceRuleSchema, optionUnitPriceRuleRow],
  ["option start time rule", optionStartTimeRuleSchema, optionStartTimeRuleRow],
  ["option unit tier", optionUnitTierSchema, optionUnitTierRow],
  ["pickup price rule", pickupPriceRuleSchema, pickupPriceRuleRow],
  ["dropoff price rule", dropoffPriceRuleSchema, dropoffPriceRuleRow],
  ["extra price rule", extraPriceRuleSchema, extraPriceRuleRow],
  ["departure price override", departurePriceOverrideSchema, departurePriceOverrideRow],
] as const

describe("pricing-rules list response contracts", () => {
  for (const [label, schema, row] of cases) {
    it(`the serialized ${label} list satisfies the declared OpenAPI schema`, () => {
      const wire = JSON.parse(
        JSON.stringify(listResponse([row], { total: 1, limit: 50, offset: 0 })),
      )
      const parsed = listResponseSchema(schema).safeParse(wire)
      expect(parsed.success ? null : parsed.error.toString()).toBeNull()
    })
  }
})

describe("pricing-rules single-entity response contracts", () => {
  for (const [label, schema, row] of cases) {
    it(`the serialized ${label} { data } envelope satisfies the declared OpenAPI schema`, () => {
      const wire = JSON.parse(JSON.stringify({ data: row }))
      const parsed = z.object({ data: schema }).safeParse(wire)
      expect(parsed.success ? null : parsed.error.toString()).toBeNull()
    })
  }

  it("the delete envelope satisfies the declared OpenAPI schema", () => {
    const parsed = z.object({ success: z.boolean() }).safeParse({ success: true })
    expect(parsed.success).toBe(true)
  })
})
