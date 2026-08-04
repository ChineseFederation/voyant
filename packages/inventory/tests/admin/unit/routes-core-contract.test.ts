import { listResponse, listResponseSchema } from "@voyant-travel/types"
import type { InferSelectModel } from "drizzle-orm"
import { describe, expect, it } from "vitest"
import { z } from "zod"

import type { products } from "../../../src/schema-core.js"
import type { productCategories, productTags } from "../../../src/schema-taxonomy.js"

/**
 * Response contract tests (voyant#2114 — inventory core sub-batch) for the
 * product core + association admin routes. Each fixture is typed as the real
 * Drizzle row so column drift breaks compilation; the JSON round-trip
 * (Date → ISO string) mirrors `c.json` so a declared/actual mismatch breaks the
 * test. The schemas below mirror the response shapes declared in
 * `routes-core.ts` and `routes-associations.ts`.
 */

const isoTimestamp = z.string()

const productStatusValues = ["draft", "active", "archived"] as const
const productBookingModeValues = [
  "date",
  "date_time",
  "open",
  "stay",
  "transfer",
  "itinerary",
  "other",
] as const
const productCapacityModeValues = ["free_sale", "limited", "on_request"] as const
const productVisibilityValues = ["public", "private", "hidden"] as const

const classificationSchema = z.object({
  familyCode: z.string().nullable(),
  familyName: z.string().nullable(),
  subtypeCode: z.string().nullable(),
  durationMinutes: z.number().int().nullable(),
  durationDays: z.number().int().nullable(),
  durationProvenance: z.enum(["explicit", "itinerary-derived", "unresolved"]),
  reviewRequired: z.boolean(),
  reviewReasons: z.array(z.enum(["missing_family", "unresolved_duration"])),
})

const productSchema = z.object({
  id: z.string(),
  name: z.string(),
  status: z.enum(productStatusValues),
  description: z.string().nullable(),
  inclusionsHtml: z.string().nullable(),
  exclusionsHtml: z.string().nullable(),
  termsHtml: z.string().nullable(),
  termsShowOnContract: z.boolean(),
  bookingMode: z.enum(productBookingModeValues),
  supplyModel: z.enum(["dynamic", "scheduled"]).optional(),
  capacityMode: z.enum(productCapacityModeValues),
  timezone: z.string().nullable(),
  defaultLanguageTag: z.string().nullable(),
  visibility: z.enum(productVisibilityValues),
  activated: z.boolean(),
  reservationTimeoutMinutes: z.number().int().nullable(),
  sellCurrency: z.string(),
  sellAmountCents: z.number().int().nullable(),
  costAmountCents: z.number().int().nullable(),
  marginPercent: z.number().int().nullable(),
  facilityId: z.string().nullable(),
  supplierId: z.string().nullable(),
  startDate: z.string().nullable(),
  endDate: z.string().nullable(),
  pax: z.number().int().nullable(),
  productTypeId: z.string().nullable(),
  productSubtypeCode: z.string().nullable(),
  durationMinutes: z.number().int().nullable(),
  productTypeName: z.string().nullable().optional(),
  familyCode: z.string().nullable().optional(),
  itineraryDurationDays: z.number().int().nullable().optional(),
  nextDeparture: isoTimestamp.nullable().optional(),
  classification: classificationSchema.optional(),
  contractTemplateId: z.string().nullable(),
  taxClassId: z.string().nullable(),
  customerPaymentPolicy: z.unknown().nullable(),
  tags: z.array(z.string()).nullable(),
  createdAt: isoTimestamp,
  updatedAt: isoTimestamp,
})

const productWithTypeSchema = productSchema.extend({
  productType: z.object({ id: z.string(), name: z.string(), code: z.string() }).nullable(),
})

// Mirrors `recalculateResultSchema` in `routes-maintenance.ts`. The total and
// margin are nullable because a source currency with no resolvable FX rate is
// named in `unconvertibleCurrencies` instead of being folded in (voyant#4162).
const recalculateResultSchema = z.object({
  currency: z.string(),
  costAmountCents: z.number().int().nullable(),
  marginPercent: z.number().int().nullable(),
  byCurrency: z.array(z.object({ currency: z.string(), amountCents: z.number().int() })),
  unconvertibleCurrencies: z.array(z.string()),
})

const productCategorySchema = z.object({
  id: z.string(),
  parentId: z.string().nullable(),
  name: z.string(),
  slug: z.string(),
  description: z.string().nullable(),
  sortOrder: z.number().int(),
  active: z.boolean(),
  customerPaymentPolicy: z.unknown().nullable(),
  metadata: z.record(z.string(), z.unknown()).nullable(),
  createdAt: isoTimestamp,
  updatedAt: isoTimestamp,
})

const productTagSchema = z.object({
  id: z.string(),
  name: z.string(),
  createdAt: isoTimestamp,
  updatedAt: isoTimestamp,
})

const createdAt = new Date("2026-01-01T00:00:00.000Z")
const updatedAt = new Date("2026-01-02T00:00:00.000Z")

const productRow: InferSelectModel<typeof products> = {
  id: "products_0000000000000000000000000",
  name: "Aegean Island Hopping",
  status: "active",
  description: "An eight-day sailing tour.",
  inclusionsHtml: "<ul><li>Skipper</li></ul>",
  exclusionsHtml: null,
  termsHtml: null,
  termsShowOnContract: false,
  bookingMode: "date",
  capacityMode: "limited",
  timezone: "Europe/Athens",
  defaultLanguageTag: "en",
  visibility: "public",
  activated: true,
  reservationTimeoutMinutes: 30,
  sellCurrency: "EUR",
  sellAmountCents: 120000,
  costAmountCents: 80000,
  marginPercent: 33,
  facilityId: null,
  supplierId: null,
  startDate: "2026-06-01",
  endDate: "2026-06-08",
  pax: 8,
  productTypeId: "product_types_0000000000000000000000",
  productSubtypeCode: "boat-tour",
  durationMinutes: 60,
  contractTemplateId: null,
  taxClassId: null,
  customerPaymentPolicy: null,
  tags: ["sailing", "greece"],
  createdAt,
  updatedAt,
}

const resolvedProductRow = {
  ...productRow,
  supplyModel: "scheduled" as const,
  productTypeName: "Tour",
  familyCode: "tour",
  itineraryDurationDays: null,
  nextDeparture: null,
  classification: {
    familyCode: "tour",
    familyName: "Tour",
    subtypeCode: "boat-tour",
    durationMinutes: 60,
    durationDays: 1,
    durationProvenance: "explicit" as const,
    reviewRequired: false,
    reviewReasons: [],
  },
}

const productCategoryRow: InferSelectModel<typeof productCategories> = {
  id: "product_categories_0000000000000000",
  parentId: null,
  name: "Sailing",
  slug: "sailing",
  description: null,
  sortOrder: 0,
  active: true,
  customerPaymentPolicy: null,
  metadata: null,
  createdAt,
  updatedAt,
}

const productTagRow: InferSelectModel<typeof productTags> = {
  id: "product_tags_00000000000000000000000",
  name: "greece",
  createdAt,
  updatedAt,
}

describe("inventory core list response contracts", () => {
  it("the serialized product list satisfies the declared OpenAPI schema", () => {
    const wire = JSON.parse(
      JSON.stringify(listResponse([resolvedProductRow], { total: 1, limit: 50, offset: 0 })),
    )
    const parsed = listResponseSchema(productSchema).safeParse(wire)
    expect(parsed.success ? null : parsed.error.toString()).toBeNull()
  })
})

describe("inventory core single-entity response contracts", () => {
  it("the serialized product { data } envelope satisfies the declared OpenAPI schema", () => {
    const wire = JSON.parse(JSON.stringify({ data: resolvedProductRow }))
    const parsed = z.object({ data: productSchema }).safeParse(wire)
    expect(parsed.success ? null : parsed.error.toString()).toBeNull()
  })

  it("the product-with-type { data } envelope satisfies the declared OpenAPI schema", () => {
    const wire = JSON.parse(
      JSON.stringify({
        data: {
          ...resolvedProductRow,
          productType: { id: productRow.productTypeId, name: "Tour", code: "tour" },
        },
      }),
    )
    const parsed = z.object({ data: productWithTypeSchema }).safeParse(wire)
    expect(parsed.success ? null : parsed.error.toString()).toBeNull()
  })

  it("the product-with-type { data } envelope allows a null product type", () => {
    const wire = JSON.parse(JSON.stringify({ data: { ...resolvedProductRow, productType: null } }))
    const parsed = z.object({ data: productWithTypeSchema }).safeParse(wire)
    expect(parsed.success ? null : parsed.error.toString()).toBeNull()
  })

  it("the recalculate { data } envelope satisfies the declared OpenAPI schema", () => {
    const parsed = z.object({ data: recalculateResultSchema }).safeParse({
      data: {
        currency: "EUR",
        costAmountCents: 80000,
        marginPercent: 33,
        byCurrency: [{ currency: "EUR", amountCents: 80000 }],
        unconvertibleCurrencies: [],
      },
    })
    expect(parsed.success ? null : parsed.error.toString()).toBeNull()
  })

  it("the recalculate { data } envelope carries a withheld total for an unconvertible currency", () => {
    const parsed = z.object({ data: recalculateResultSchema }).safeParse({
      data: {
        currency: "EUR",
        costAmountCents: null,
        marginPercent: null,
        byCurrency: [
          { currency: "EUR", amountCents: 30000 },
          { currency: "TRY", amountCents: 500000 },
        ],
        unconvertibleCurrencies: ["TRY"],
      },
    })
    expect(parsed.success ? null : parsed.error.toString()).toBeNull()
  })

  it("the success envelope satisfies the declared OpenAPI schema", () => {
    const parsed = z.object({ success: z.boolean() }).safeParse({ success: true })
    expect(parsed.success).toBe(true)
  })
})

describe("inventory association response contracts", () => {
  it("the serialized product-categories { data } envelope satisfies the declared schema", () => {
    const wire = JSON.parse(JSON.stringify({ data: [productCategoryRow] }))
    const parsed = z.object({ data: z.array(productCategorySchema) }).safeParse(wire)
    expect(parsed.success ? null : parsed.error.toString()).toBeNull()
  })

  it("the serialized product-tags { data } envelope satisfies the declared schema", () => {
    const wire = JSON.parse(JSON.stringify({ data: [productTagRow] }))
    const parsed = z.object({ data: z.array(productTagSchema) }).safeParse(wire)
    expect(parsed.success ? null : parsed.error.toString()).toBeNull()
  })
})
