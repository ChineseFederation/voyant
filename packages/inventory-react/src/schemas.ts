import {
  duplicateItinerarySchema,
  insertDaySchema,
  insertDayServiceSchema,
  insertDayServiceTranslationSchema,
  insertItinerarySchema,
  insertProductDayTranslationSchema,
  insertProductItineraryTranslationSchema,
  insertProductMediaSchema,
  insertProductTranslationSchema,
  insertVersionSchema,
  reorderProductMediaSchema,
  updateDaySchema,
  updateDayServiceSchema,
  updateDayServiceTranslationSchema,
  updateItinerarySchema,
  updateProductDayTranslationSchema,
  updateProductItineraryTranslationSchema,
  updateProductMediaSchema,
  updateProductTranslationSchema,
} from "@voyant-travel/inventory/validation"
import { listResponseSchema } from "@voyant-travel/types"
import { z } from "zod"

export const paginatedEnvelope = listResponseSchema

export const singleEnvelope = <T extends z.ZodTypeAny>(item: T) => z.object({ data: item })
export const arrayEnvelope = <T extends z.ZodTypeAny>(item: T) => z.object({ data: z.array(item) })

export const successEnvelope = z.object({ success: z.boolean() })

const productListingDepositRuleSchema = z.object({
  kind: z.enum(["none", "percent", "fixed_cents"]),
  percent: z.number().min(0).max(100).optional(),
  amountCents: z.number().int().min(0).optional(),
})

export const productPaymentPolicySchema = z.object({
  deposit: productListingDepositRuleSchema,
  minDaysBeforeDepartureForDeposit: z.number().int().min(0),
  balanceDueDaysBeforeDeparture: z.number().int().min(0),
  balanceDueMinDaysFromNow: z.number().int().min(0),
})

export type ProductPaymentPolicy = z.infer<typeof productPaymentPolicySchema>

export const productClassificationSchema = z.object({
  familyCode: z.string().nullable(),
  familyName: z.string().nullable(),
  subtypeCode: z.string().nullable(),
  durationMinutes: z.number().int().nullable(),
  durationDays: z.number().int().nullable(),
  durationProvenance: z.enum(["explicit", "itinerary-derived", "unresolved"]),
  scheduleTerm: z.enum(["session", "occurrence", "departure"]),
  reviewRequired: z.boolean(),
  reviewReasons: z.array(z.enum(["missing_family", "unresolved_duration"])),
})

export type ProductClassification = z.infer<typeof productClassificationSchema>

export const productRecordSchema = z.object({
  id: z.string(),
  name: z.string(),
  status: z.enum(["draft", "active", "archived"]),
  description: z.string().nullable(),
  inclusionsHtml: z.string().nullable(),
  exclusionsHtml: z.string().nullable(),
  termsHtml: z.string().nullable(),
  termsShowOnContract: z.boolean(),
  bookingMode: z.enum(["date", "date_time", "open", "stay", "transfer", "itinerary", "other"]),
  supplyModel: z.enum(["dynamic", "scheduled"]).optional(),
  capacityMode: z.enum(["free_sale", "limited", "on_request"]),
  timezone: z.string().nullable(),
  defaultLanguageTag: z.string().nullable().optional(),
  visibility: z.enum(["public", "private", "hidden"]),
  activated: z.boolean(),
  reservationTimeoutMinutes: z.number().int().nullable(),
  sellCurrency: z.string(),
  sellAmountCents: z.number().int().nullable(),
  costAmountCents: z.number().int().nullable(),
  marginPercent: z.number().int().nullable(),
  facilityId: z.string().nullable(),
  startDate: z.string().nullable(),
  endDate: z.string().nullable(),
  pax: z.number().int().nullable(),
  productTypeId: z.string().nullable(),
  // Product family (`productTypeId` → family) plus the independent subtype and
  // explicit duration. Merchandising classification, distinct from bookingMode.
  productSubtypeCode: z.string().nullable().optional(),
  durationMinutes: z.number().int().nullable().optional(),
  // List view only — the detail/create/update responses omit these, so keep
  // them optional. `productTypeName` resolves the type id to a label and
  // `nextDeparture` is the earliest upcoming open departure (ISO string).
  productTypeName: z.string().nullable().optional(),
  nextDeparture: z.string().nullable().optional(),
  // Resolved classification (family / subtype / duration / review), attached by
  // the product list + detail read paths. Optional because create/update
  // responses omit it.
  classification: productClassificationSchema.optional(),
  contractTemplateId: z.string().nullable().optional(),
  taxClassId: z.string().nullable(),
  customerPaymentPolicy: productPaymentPolicySchema.nullable().optional(),
  tags: z.array(z.string()),
  createdAt: z.string(),
  updatedAt: z.string(),
})

export type ProductRecord = z.infer<typeof productRecordSchema>

export const productTranslationRecordSchema = z.object({
  id: z.string(),
  productId: z.string(),
  languageTag: z.string(),
  slug: z.string().nullable(),
  name: z.string(),
  shortDescription: z.string().nullable(),
  description: z.string().nullable(),
  inclusionsHtml: z.string().nullable(),
  exclusionsHtml: z.string().nullable(),
  termsHtml: z.string().nullable(),
  seoTitle: z.string().nullable(),
  seoDescription: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

export type ProductTranslationRecord = z.infer<typeof productTranslationRecordSchema>

export const productTypeRecordSchema = z.object({
  id: z.string(),
  name: z.string(),
  code: z.string(),
  description: z.string().nullable(),
  sortOrder: z.number().int(),
  active: z.boolean(),
  metadata: z.record(z.string(), z.unknown()).nullable().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

export type ProductTypeRecord = z.infer<typeof productTypeRecordSchema>

const productCategoryDepositRuleSchema = z.object({
  kind: z.enum(["none", "percent", "fixed_cents"]),
  percent: z.number().min(0).max(100).optional(),
  amountCents: z.number().int().min(0).optional(),
})

export const productCategoryPaymentPolicySchema = z.object({
  deposit: productCategoryDepositRuleSchema,
  minDaysBeforeDepartureForDeposit: z.number().int().min(0),
  balanceDueDaysBeforeDeparture: z.number().int().min(0),
  balanceDueMinDaysFromNow: z.number().int().min(0),
})

export type ProductCategoryPaymentPolicy = z.infer<typeof productCategoryPaymentPolicySchema>

export const productCategoryRecordSchema = z.object({
  id: z.string(),
  parentId: z.string().nullable(),
  name: z.string(),
  slug: z.string(),
  description: z.string().nullable(),
  sortOrder: z.number().int(),
  active: z.boolean(),
  customerPaymentPolicy: productCategoryPaymentPolicySchema.nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).nullable().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

export type ProductCategoryRecord = z.infer<typeof productCategoryRecordSchema>

export const productTagRecordSchema = z.object({
  id: z.string(),
  name: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

export type ProductTagRecord = z.infer<typeof productTagRecordSchema>

export const productOptionRecordSchema = z.object({
  id: z.string(),
  productId: z.string(),
  name: z.string(),
  code: z.string().nullable(),
  description: z.string().nullable(),
  status: z.enum(["draft", "active", "archived"]),
  isDefault: z.boolean(),
  sortOrder: z.number().int(),
  availableFrom: z.string().nullable(),
  availableTo: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

export type ProductOptionRecord = z.infer<typeof productOptionRecordSchema>

export const optionUnitRecordSchema = z.object({
  id: z.string(),
  optionId: z.string(),
  name: z.string(),
  code: z.string().nullable(),
  description: z.string().nullable(),
  unitType: z.enum(["person", "group", "room", "vehicle", "service", "other"]),
  minQuantity: z.number().int().nullable(),
  maxQuantity: z.number().int().nullable(),
  minAge: z.number().int().nullable(),
  maxAge: z.number().int().nullable(),
  occupancyMin: z.number().int().nullable(),
  occupancyMax: z.number().int().nullable(),
  isRequired: z.boolean(),
  isHidden: z.boolean(),
  sortOrder: z.number().int(),
})

export type OptionUnitRecord = z.infer<typeof optionUnitRecordSchema>

export const productItineraryRecordSchema = z.object({
  id: z.string(),
  productId: z.string(),
  name: z.string(),
  isDefault: z.boolean(),
  sortOrder: z.number().int(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

export type ProductItineraryRecord = z.infer<typeof productItineraryRecordSchema>

export const productDayRecordSchema = z.object({
  id: z.string(),
  itineraryId: z.string(),
  dayNumber: z.number().int(),
  title: z.string().nullable(),
  description: z.string().nullable(),
  location: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

export const productDayTranslationRecordSchema = z.object({
  id: z.string(),
  dayId: z.string(),
  languageTag: z.string(),
  title: z.string().nullable(),
  description: z.string().nullable(),
  location: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

export type ProductDayTranslationRecord = z.infer<typeof productDayTranslationRecordSchema>

export type ProductDayRecord = z.infer<typeof productDayRecordSchema>

export const productItineraryTranslationRecordSchema = z.object({
  id: z.string(),
  itineraryId: z.string(),
  languageTag: z.string(),
  name: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

export type ProductItineraryTranslationRecord = z.infer<
  typeof productItineraryTranslationRecordSchema
>

export const productDayServiceRecordSchema = z.object({
  id: z.string(),
  dayId: z.string(),
  supplierServiceId: z.string().nullable(),
  supplierId: z.string().nullable(),
  facilityId: z.string().nullable(),
  serviceType: z.enum(["accommodation", "transfer", "experience", "guide", "meal", "other"]),
  name: z.string(),
  description: z.string().nullable(),
  countryCode: z.string().nullable(),
  startTimeLocal: z.string().nullable(),
  endTimeLocal: z.string().nullable(),
  durationMinutes: z.number().int().nullable(),
  inclusionRole: z.enum(["included", "optional"]),
  travelerScope: z.enum(["all", "adults", "children"]),
  costCurrency: z.string(),
  costAmountCents: z.number().int(),
  quantity: z.number().int(),
  sortOrder: z.number().int().nullable(),
  notes: z.string().nullable(),
  createdAt: z.string(),
})

export type ProductDayServiceRecord = z.infer<typeof productDayServiceRecordSchema>

export const dayServiceTranslationRecordSchema = z.object({
  id: z.string(),
  serviceId: z.string(),
  languageTag: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  notes: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

export type DayServiceTranslationRecord = z.infer<typeof dayServiceTranslationRecordSchema>

export const productVersionRecordSchema = z.object({
  id: z.string(),
  productId: z.string(),
  versionNumber: z.number().int(),
  snapshot: z.unknown(),
  authorId: z.string(),
  notes: z.string().nullable(),
  createdAt: z.string(),
})

export type ProductVersionRecord = z.infer<typeof productVersionRecordSchema>

/**
 * Publish readiness as returned by `GET /products/{id}/readiness`. `code` is a
 * stable identifier the UI translates; `message`/`fix` are English fallbacks
 * for consumers with no message catalogue and are not rendered by this package.
 */
export const productReadinessIssueSchema = z.object({
  code: z.string(),
  severity: z.enum(["blocking", "warning"]),
  field: z.string(),
  message: z.string(),
  fix: z.string(),
})

export type ProductReadinessIssueRecord = z.infer<typeof productReadinessIssueSchema>

export const productReadinessSchema = z.object({
  ready: z.boolean(),
  blocking: z.array(productReadinessIssueSchema),
  warnings: z.array(productReadinessIssueSchema),
  issues: z.array(productReadinessIssueSchema),
})

export type ProductReadinessRecord = z.infer<typeof productReadinessSchema>

export const productReadinessResponse = singleEnvelope(productReadinessSchema)

export const productMediaRecordSchema = z.object({
  id: z.string(),
  productId: z.string(),
  dayId: z.string().nullable(),
  mediaType: z.enum(["image", "video", "document"]),
  name: z.string(),
  url: z.string(),
  storageKey: z.string().nullable(),
  mimeType: z.string().nullable(),
  fileSize: z.number().int().nullable(),
  width: z.number().int().nullable(),
  height: z.number().int().nullable(),
  altText: z.string().nullable(),
  assetId: z.string().nullable(),
  sortOrder: z.number().int(),
  isCover: z.boolean(),
  isOpenGraph: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

export type ProductMediaRecord = z.infer<typeof productMediaRecordSchema>

export const productListResponse = paginatedEnvelope(productRecordSchema)
export const productSingleResponse = singleEnvelope(productRecordSchema)
export const productTranslationListResponse = paginatedEnvelope(productTranslationRecordSchema)
export const productTranslationSingleResponse = singleEnvelope(productTranslationRecordSchema)
export const productDayTranslationListResponse = paginatedEnvelope(
  productDayTranslationRecordSchema,
)
export const productDayTranslationSingleResponse = singleEnvelope(productDayTranslationRecordSchema)
export const productItineraryTranslationListResponse = paginatedEnvelope(
  productItineraryTranslationRecordSchema,
)
export const productItineraryTranslationSingleResponse = singleEnvelope(
  productItineraryTranslationRecordSchema,
)
export const dayServiceTranslationListResponse = paginatedEnvelope(
  dayServiceTranslationRecordSchema,
)
export const dayServiceTranslationSingleResponse = singleEnvelope(dayServiceTranslationRecordSchema)
export const productTypeListResponse = paginatedEnvelope(productTypeRecordSchema)
export const productTypeSingleResponse = singleEnvelope(productTypeRecordSchema)
export const productCategoryListResponse = paginatedEnvelope(productCategoryRecordSchema)
export const productCategorySingleResponse = singleEnvelope(productCategoryRecordSchema)
export const productTagListResponse = paginatedEnvelope(productTagRecordSchema)
export const productTagSingleResponse = singleEnvelope(productTagRecordSchema)
export const productOptionListResponse = paginatedEnvelope(productOptionRecordSchema)
export const productOptionSingleResponse = singleEnvelope(productOptionRecordSchema)
export const optionUnitListResponse = paginatedEnvelope(optionUnitRecordSchema)
export const optionUnitSingleResponse = singleEnvelope(optionUnitRecordSchema)
export const productItinerariesResponse = arrayEnvelope(productItineraryRecordSchema)
export const productItineraryResponse = singleEnvelope(productItineraryRecordSchema)
export const productDaysResponse = arrayEnvelope(productDayRecordSchema)
export const productDayResponse = singleEnvelope(productDayRecordSchema)
export const productDayServicesResponse = arrayEnvelope(productDayServiceRecordSchema)
export const productDayServiceResponse = singleEnvelope(productDayServiceRecordSchema)
export const productVersionsResponse = arrayEnvelope(productVersionRecordSchema)
export const productVersionResponse = singleEnvelope(productVersionRecordSchema)
export const productMediaListResponse = paginatedEnvelope(productMediaRecordSchema)
export const productMediaResponse = singleEnvelope(productMediaRecordSchema)

export const productActionLedgerActionKindSchema = z.enum([
  "read",
  "create",
  "update",
  "delete",
  "execute",
  "approve",
  "reject",
  "reverse",
  "compensate",
  "duplicate",
])

export const productActionLedgerStatusSchema = z.enum([
  "requested",
  "awaiting_approval",
  "approved",
  "denied",
  "succeeded",
  "failed",
  "reversed",
  "compensated",
  "expired",
  "cancelled",
  "superseded",
])

export const productActionLedgerRiskSchema = z.enum(["low", "medium", "high", "critical"])

export const productActionLedgerPrincipalTypeSchema = z.enum([
  "user",
  "api_key",
  "agent",
  "workflow",
  "system",
])

export const productActionLedgerEntrySchema = z.object({
  id: z.string(),
  occurredAt: z.string(),
  actionName: z.string(),
  actionVersion: z.string(),
  actionKind: productActionLedgerActionKindSchema,
  status: productActionLedgerStatusSchema,
  evaluatedRisk: productActionLedgerRiskSchema,
  actorType: z.string().nullable(),
  principalType: productActionLedgerPrincipalTypeSchema,
  principalId: z.string(),
  principalSubtype: z.string().nullable(),
  sessionId: z.string().nullable(),
  apiTokenId: z.string().nullable(),
  internalRequest: z.boolean(),
  delegatedByPrincipalType: productActionLedgerPrincipalTypeSchema.nullable(),
  delegatedByPrincipalId: z.string().nullable(),
  delegationId: z.string().nullable(),
  callerType: z.string().nullable(),
  organizationId: z.string().nullable(),
  routeOrToolName: z.string().nullable(),
  workflowRunId: z.string().nullable(),
  workflowStepId: z.string().nullable(),
  correlationId: z.string().nullable(),
  causationActionId: z.string().nullable(),
  idempotencyScope: z.string().nullable(),
  idempotencyKey: z.string().nullable(),
  idempotencyFingerprint: z.string().nullable(),
  targetType: z.string(),
  targetId: z.string(),
  capabilityId: z.string().nullable(),
  capabilityVersion: z.string().nullable(),
  authorizationSource: z.string().nullable(),
  approvalId: z.string().nullable(),
  amendsActionId: z.string().nullable(),
  createdAt: z.string(),
  mutationSummary: z.string().nullable(),
})

export type ProductActionLedgerEntryRecord = z.infer<typeof productActionLedgerEntrySchema>

export const productActionLedgerListResponse = z.object({
  data: z.array(productActionLedgerEntrySchema),
  pageInfo: z.object({
    nextCursor: z
      .object({
        occurredAt: z.string(),
        id: z.string(),
      })
      .nullable(),
  }),
})

export type ProductActionLedgerListResponse = z.infer<typeof productActionLedgerListResponse>

export {
  duplicateItinerarySchema,
  insertDaySchema,
  insertDayServiceSchema,
  insertDayServiceTranslationSchema,
  insertItinerarySchema,
  insertProductDayTranslationSchema,
  insertProductItineraryTranslationSchema,
  insertProductMediaSchema,
  insertProductTranslationSchema,
  insertVersionSchema,
  reorderProductMediaSchema,
  updateDaySchema,
  updateDayServiceSchema,
  updateDayServiceTranslationSchema,
  updateItinerarySchema,
  updateProductDayTranslationSchema,
  updateProductItineraryTranslationSchema,
  updateProductMediaSchema,
  updateProductTranslationSchema,
}

export type CreateProductItineraryInput = z.input<typeof insertItinerarySchema>
export type UpdateProductItineraryInput = z.input<typeof updateItinerarySchema>
export type DuplicateProductItineraryInput = z.input<typeof duplicateItinerarySchema>
export type CreateProductDayInput = z.input<typeof insertDaySchema>
export type UpdateProductDayInput = z.input<typeof updateDaySchema>
export type CreateProductDayServiceInput = z.input<typeof insertDayServiceSchema>
export type UpdateProductDayServiceInput = z.input<typeof updateDayServiceSchema>
export type CreateProductVersionInput = z.input<typeof insertVersionSchema>
export type CreateProductMediaInput = z.input<typeof insertProductMediaSchema>
export type UpdateProductMediaInput = z.input<typeof updateProductMediaSchema>
export type CreateProductTranslationInput = z.input<typeof insertProductTranslationSchema>
export type UpdateProductTranslationInput = z.input<typeof updateProductTranslationSchema>
export type CreateProductDayTranslationInput = z.input<typeof insertProductDayTranslationSchema>
export type UpdateProductDayTranslationInput = z.input<typeof updateProductDayTranslationSchema>
export type CreateProductItineraryTranslationInput = z.input<
  typeof insertProductItineraryTranslationSchema
>
export type UpdateProductItineraryTranslationInput = z.input<
  typeof updateProductItineraryTranslationSchema
>
export type CreateDayServiceTranslationInput = z.input<typeof insertDayServiceTranslationSchema>
export type UpdateDayServiceTranslationInput = z.input<typeof updateDayServiceTranslationSchema>
export type ReorderProductMediaInput = z.input<typeof reorderProductMediaSchema>
