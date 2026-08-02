import {
  booleanQueryParam,
  languageTagSchema,
  optionUnitTypeSchema,
  productBookingModeSchema,
  productCapacityModeSchema,
  productOptionStatusSchema,
  productStatusSchema,
  productVisibilitySchema,
  typeIdSchema,
  z,
} from "./validation-shared.js"

/**
 * A stable, lowercase kebab-case code — used for Product subtype values so they
 * are durable facet keys (never a display label). Max 64 chars.
 */
export const productSubtypeCodeSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
    message: "must be a lowercase kebab-case stable code (e.g. boat-tour)",
  })

const productDepositRuleSchema = z.object({
  kind: z.enum(["none", "percent", "fixed_cents"]),
  percent: z.number().min(0).max(100).optional(),
  amountCents: z.number().int().min(0).optional(),
})

const productCustomerPaymentPolicySchema = z.object({
  deposit: productDepositRuleSchema,
  minDaysBeforeDepartureForDeposit: z.number().int().min(0),
  balanceDueDaysBeforeDeparture: z.number().int().min(0),
  balanceDueMinDaysFromNow: z.number().int().min(0),
})

const productCoreSchema = z.object({
  name: z.string().min(1).max(255),
  status: productStatusSchema.default("draft"),
  description: z.string().optional().nullable(),
  inclusionsHtml: z.string().optional().nullable(),
  exclusionsHtml: z.string().optional().nullable(),
  termsHtml: z.string().optional().nullable(),
  termsShowOnContract: z.boolean().default(false),
  bookingMode: productBookingModeSchema.default("date"),
  capacityMode: productCapacityModeSchema.default("limited"),
  timezone: z.string().max(100).optional().nullable(),
  defaultLanguageTag: languageTagSchema.optional().nullable(),
  /** @deprecated Compatibility only; channel assignments control distribution. */
  visibility: productVisibilitySchema.default("private"),
  /** @deprecated Compatibility only; a direct storefront is modeled as a Channel. */
  activated: z.boolean().default(false),
  reservationTimeoutMinutes: z.number().int().min(0).optional().nullable(),
  sellCurrency: z.string().min(3).max(3),
  facilityId: z.string().optional().nullable(),
  supplierId: z.string().optional().nullable(),
  productTypeId: z.string().optional().nullable(),
  contractTemplateId: typeIdSchema("contract_templates").optional().nullable(),
  taxClassId: z.string().optional().nullable(),
  startDate: z.string().optional().nullable(),
  endDate: z.string().optional().nullable(),
  pax: z.number().int().positive().optional().nullable(),
  /**
   * Optional Product subtype stable code (e.g. `boat-tour`). Independent from
   * the family (`productTypeId`), booking mode, and duration. Lowercase stable
   * code so it is safe as a catalog facet value.
   */
  productSubtypeCode: productSubtypeCodeSchema.optional().nullable(),
  /**
   * Explicit product duration in minutes (positive). Authored source of
   * truth for duration; the resolver prefers it over the legacy itinerary-day
   * derivation. Null when not authored.
   */
  durationMinutes: z.number().int().positive().optional().nullable(),
  customerPaymentPolicy: productCustomerPaymentPolicySchema.optional().nullable(),
  tags: z.array(z.string()).default([]),
})

const productPricingFields = {
  sellAmountCents: z.number().int().min(0).optional().nullable(),
  costAmountCents: z.number().int().min(0).optional().nullable(),
  marginPercent: z.number().int().optional().nullable(),
}

type OrderedStringRangeIssue = { path: string[]; message: string }

function parseDateOnlyValue(value: string): number | null {
  const match = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(value.trim())
  if (!match) return null

  const [, yearValue, monthValue, dayValue] = match
  const year = Number(yearValue)
  const month = Number(monthValue)
  const day = Number(dayValue)
  const timestamp = Date.UTC(year, month - 1, day)
  const date = new Date(timestamp)

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null
  }

  return timestamp
}

function collectOrderedStringRangeIssues(
  data: Record<string, unknown>,
  minPath: string,
  maxPath: string,
): OrderedStringRangeIssue[] {
  const min = data[minPath]
  const max = data[maxPath]

  const minTime = typeof min === "string" ? parseDateOnlyValue(min) : null
  const maxTime = typeof max === "string" ? parseDateOnlyValue(max) : null

  if (minTime !== null && maxTime !== null && minTime > maxTime) {
    return [{ path: [maxPath], message: `${maxPath} must be on or after ${minPath}` }]
  }

  return []
}

function addOrderedStringRangeIssues(
  ctx: z.RefinementCtx,
  data: Record<string, unknown>,
  minPath: string,
  maxPath: string,
) {
  for (const issue of collectOrderedStringRangeIssues(data, minPath, maxPath)) {
    ctx.addIssue({ code: "custom", ...issue })
  }
}

export const insertProductSchema = productCoreSchema
  .extend(productPricingFields)
  .superRefine((data, ctx) => {
    addOrderedStringRangeIssues(ctx, data, "startDate", "endDate")
  })
// `productCoreSchema` carries `.default(...)` on enum-ish fields so
// insert can omit them. zod's `.partial()` does NOT strip those
// defaults — every PATCH would synthesize `status: "draft"`,
// `visibility: "private"`, etc., and overwrite the row. Re-declare the
// defaulted fields without defaults before partial-ising so PATCH only
// touches the keys the client actually sent.
export const updateProductSchema = productCoreSchema
  .extend({
    status: productStatusSchema,
    bookingMode: productBookingModeSchema,
    capacityMode: productCapacityModeSchema,
    /** @deprecated Compatibility only; channel assignments control distribution. */
    visibility: productVisibilitySchema,
    /** @deprecated Compatibility only; a direct storefront is modeled as a Channel. */
    activated: z.boolean(),
    termsShowOnContract: z.boolean(),
    tags: z.array(z.string()),
  })
  .partial()
  .extend(productPricingFields)
  .superRefine((data, ctx) => {
    addOrderedStringRangeIssues(ctx, data, "startDate", "endDate")
  })
export const selectProductSchema = productCoreSchema.extend({
  id: typeIdSchema("products"),
  sellAmountCents: z.number().int().nullable(),
  costAmountCents: z.number().int().nullable(),
  marginPercent: z.number().int().nullable(),
  productSubtypeCode: z.string().nullable(),
  durationMinutes: z.number().int().nullable(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
})
/**
 * Resolved product classification — the family / subtype / duration triple plus
 * derived review state. Emitted identically by the product list/detail read
 * paths, the catalog-plane projection, and the legacy Catalog search document.
 */
export const productClassificationSchema = z.object({
  familyCode: z.string().nullable(),
  familyName: z.string().nullable(),
  subtypeCode: z.string().nullable(),
  durationMinutes: z.number().int().nullable(),
  durationDays: z.number().int().nullable(),
  durationProvenance: z.enum(["explicit", "itinerary-derived", "unresolved"]),
  reviewRequired: z.boolean(),
  reviewReasons: z.array(z.enum(["missing_family", "unresolved_duration"])),
})
export type ProductClassification = z.infer<typeof productClassificationSchema>

export const productListSortFieldSchema = z.enum([
  "name",
  "status",
  "sellAmount",
  "pax",
  "startDate",
  "endDate",
  "createdAt",
])

export const productListSortDirSchema = z.enum(["asc", "desc"])

export const productListQuerySchema = z.object({
  status: productStatusSchema.optional(),
  bookingMode: productBookingModeSchema.optional(),
  /** @deprecated Compatibility query retained while older API clients migrate. */
  visibility: productVisibilitySchema.optional(),
  /** @deprecated Compatibility query retained while older API clients migrate. */
  activated: booleanQueryParam.optional(),
  facilityId: z.string().optional(),
  supplierId: z.string().optional(),
  productTypeId: z.string().optional(),
  /** Facet on the resolved family stable code (e.g. `tour`). */
  familyCode: z.string().optional(),
  /** Facet on the Product subtype stable code (e.g. `boat-tour`). */
  productSubtypeCode: z.string().optional(),
  contractTemplateId: typeIdSchema("contract_templates").optional(),
  taxClassId: z.string().optional(),
  categoryId: z.string().optional(),
  tag: z.string().optional(),
  search: z.string().optional(),
  // Product-level start/end window (filters `products.startDate`).
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  // Departure window: keep only products with an upcoming open departure whose
  // date falls in [departureFrom, departureTo] (filters availability slots, not
  // the product's own start date).
  departureFrom: z.string().optional(),
  departureTo: z.string().optional(),
  paxMin: z.coerce.number().int().min(0).optional(),
  paxMax: z.coerce.number().int().min(0).optional(),
  sellAmountMin: z.coerce.number().int().min(0).optional(),
  sellAmountMax: z.coerce.number().int().min(0).optional(),
  sortBy: productListSortFieldSchema.default("createdAt"),
  sortDir: productListSortDirSchema.default("desc"),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
})

export const productAggregatesQuerySchema = z.object({
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
})
export type InsertProduct = z.infer<typeof insertProductSchema>
export type UpdateProduct = z.infer<typeof updateProductSchema>
export type SelectProduct = z.infer<typeof selectProductSchema>

const productOptionCoreSchema = z.object({
  name: z.string().min(1).max(255),
  code: z.string().max(100).optional().nullable(),
  description: z.string().optional().nullable(),
  status: productOptionStatusSchema.default("draft"),
  isDefault: z.boolean().default(false),
  sortOrder: z.number().int().default(0),
  availableFrom: z.string().optional().nullable(),
  availableTo: z.string().optional().nullable(),
})
export const insertProductOptionSchema = productOptionCoreSchema.superRefine((data, ctx) => {
  addOrderedStringRangeIssues(ctx, data, "availableFrom", "availableTo")
})
export const updateProductOptionSchema = productOptionCoreSchema
  .extend({
    status: productOptionStatusSchema,
    isDefault: z.boolean(),
    sortOrder: z.number().int(),
  })
  .partial()
  .superRefine((data, ctx) => {
    addOrderedStringRangeIssues(ctx, data, "availableFrom", "availableTo")
  })
export const productOptionListQuerySchema = z.object({
  productId: z.string().optional(),
  status: productOptionStatusSchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
})
export type InsertProductOption = z.infer<typeof insertProductOptionSchema>
export type UpdateProductOption = z.infer<typeof updateProductOptionSchema>

const optionUnitCoreSchema = z.object({
  name: z.string().min(1).max(255),
  code: z.string().max(100).optional().nullable(),
  description: z.string().optional().nullable(),
  unitType: optionUnitTypeSchema.default("person"),
  minQuantity: z.number().int().min(0).optional().nullable(),
  maxQuantity: z.number().int().min(0).optional().nullable(),
  minAge: z.number().int().min(0).optional().nullable(),
  maxAge: z.number().int().min(0).optional().nullable(),
  occupancyMin: z.number().int().min(0).optional().nullable(),
  occupancyMax: z.number().int().min(0).optional().nullable(),
  isRequired: z.boolean().default(false),
  isHidden: z.boolean().default(false),
  sortOrder: z.number().int().default(0),
})

// Room and vehicle units carry capacity that the storefront pricing math
// multiplies by (e.g. `room.occupancy * room.quantity` for per_person
// totals in service-departures). Without occupancyMin set, the multiplier
// silently falls back to 1 and the booking under-charges — see #481.
const OCCUPANCY_REQUIRED_TYPES = new Set(["room", "vehicle"])

type OptionUnitValidationShape = {
  unitType?: string | null | undefined
  minQuantity?: number | null | undefined
  maxQuantity?: number | null | undefined
  minAge?: number | null | undefined
  maxAge?: number | null | undefined
  occupancyMin?: number | null | undefined
  occupancyMax?: number | null | undefined
}

type OptionUnitValidationIssue = { path: string[]; message: string }

function collectOptionUnitQuantityRangeIssues(
  data: OptionUnitValidationShape,
): OptionUnitValidationIssue[] {
  const issues: OptionUnitValidationIssue[] = []
  if (data.minQuantity != null && data.maxQuantity != null && data.maxQuantity < data.minQuantity) {
    issues.push({
      path: ["maxQuantity"],
      message: "maxQuantity must be ≥ minQuantity",
    })
  }
  return issues
}

function collectOptionUnitAgeRangeIssues(
  data: OptionUnitValidationShape,
): OptionUnitValidationIssue[] {
  const issues: OptionUnitValidationIssue[] = []
  if (data.minAge != null && data.maxAge != null && data.maxAge < data.minAge) {
    issues.push({
      path: ["maxAge"],
      message: "maxAge must be ≥ minAge",
    })
  }
  return issues
}

function collectOptionUnitOccupancyIssues(
  data: OptionUnitValidationShape,
): OptionUnitValidationIssue[] {
  const issues: OptionUnitValidationIssue[] = []
  if (
    data.unitType &&
    OCCUPANCY_REQUIRED_TYPES.has(data.unitType) &&
    (data.occupancyMin == null || data.occupancyMin < 1)
  ) {
    issues.push({
      path: ["occupancyMin"],
      message: `${data.unitType} units must declare occupancyMin (≥ 1)`,
    })
  }
  if (
    data.occupancyMin != null &&
    data.occupancyMax != null &&
    data.occupancyMax < data.occupancyMin
  ) {
    issues.push({
      path: ["occupancyMax"],
      message: "occupancyMax must be ≥ occupancyMin",
    })
  }
  return issues
}

function collectOptionUnitIssues(data: OptionUnitValidationShape): OptionUnitValidationIssue[] {
  return [
    ...collectOptionUnitQuantityRangeIssues(data),
    ...collectOptionUnitAgeRangeIssues(data),
    ...collectOptionUnitOccupancyIssues(data),
  ]
}

export const insertOptionUnitSchema = optionUnitCoreSchema.superRefine((data, ctx) => {
  for (const issue of collectOptionUnitIssues(data)) {
    ctx.addIssue({ code: "custom", ...issue })
  }
})

// Partial-update schema only enforces what's statically decidable from the
// patch alone. The "unitType room/vehicle requires occupancyMin" rule needs
// the merged record state, so it lives in the service layer below
// (validateMergedOptionUnit).
export const updateOptionUnitSchema = optionUnitCoreSchema
  .extend({
    unitType: optionUnitTypeSchema,
    isRequired: z.boolean(),
    isHidden: z.boolean(),
    sortOrder: z.number().int(),
  })
  .partial()
  .superRefine((data, ctx) => {
    for (const issue of collectOptionUnitQuantityRangeIssues(data)) {
      ctx.addIssue({ code: "custom", ...issue })
    }
    for (const issue of collectOptionUnitAgeRangeIssues(data)) {
      ctx.addIssue({ code: "custom", ...issue })
    }
    if (
      data.occupancyMin != null &&
      data.occupancyMax != null &&
      data.occupancyMax < data.occupancyMin
    ) {
      const issue = { path: ["occupancyMax"], message: "occupancyMax must be ≥ occupancyMin" }
      ctx.addIssue({ code: "custom", ...issue })
    }
  })

/**
 * Validate the merged state of an option unit — the persisted record with a
 * patch applied. The partial-update schema only sees the patch payload, so
 * it can't catch e.g. PATCH `{ occupancyMin: null }` clearing occupancy on a
 * unit whose persisted unitType is already "room". The service layer fetches
 * the existing row, applies the patch, and runs this against the merged
 * shape before writing.
 */
export function validateMergedOptionUnit(
  merged: OptionUnitValidationShape,
): { ok: true } | { ok: false; issues: OptionUnitValidationIssue[] } {
  const issues = collectOptionUnitIssues(merged)
  return issues.length === 0 ? { ok: true } : { ok: false, issues }
}
export const optionUnitListQuerySchema = z.object({
  optionId: z.string().optional(),
  unitType: optionUnitTypeSchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
})
export type InsertOptionUnit = z.infer<typeof insertOptionUnitSchema>
export type UpdateOptionUnit = z.infer<typeof updateOptionUnitSchema>

export const insertVersionSchema = z.object({
  notes: z.string().max(10000).optional().nullable(),
})
export type InsertVersion = z.infer<typeof insertVersionSchema>

export const insertProductNoteSchema = z.object({
  content: z.string().min(1).max(10000),
})
