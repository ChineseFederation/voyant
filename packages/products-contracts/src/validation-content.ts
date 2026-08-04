import {
  booleanQueryParam,
  dayServiceInclusionRoleSchema,
  dayServiceTravelerScopeSchema,
  destinationTypeSchema,
  languageTagSchema,
  localTimeOfDaySchema,
  productFeatureTypeSchema,
  productLocationTypeSchema,
  serviceTypeSchema,
  z,
} from "./validation-shared.js"

const productFeatureCoreSchema = z.object({
  featureType: productFeatureTypeSchema.default("highlight"),
  title: z.string().min(1).max(255),
  description: z.string().optional().nullable(),
  sortOrder: z.number().int().default(0),
})
const productFaqCoreSchema = z.object({
  question: z.string().min(1).max(1000),
  answer: z.string().min(1).max(10000),
  sortOrder: z.number().int().default(0),
})
const productLocationCoreSchema = z.object({
  locationType: productLocationTypeSchema.default("point_of_interest"),
  title: z.string().min(1).max(255),
  address: z.string().max(1000).optional().nullable(),
  city: z.string().max(255).optional().nullable(),
  countryCode: z.string().min(2).max(2).optional().nullable(),
  latitude: z.number().min(-90).max(90).optional().nullable(),
  longitude: z.number().min(-180).max(180).optional().nullable(),
  googlePlaceId: z.string().max(255).optional().nullable(),
  applePlaceId: z.string().max(255).optional().nullable(),
  tripadvisorLocationId: z.string().max(255).optional().nullable(),
  sortOrder: z.number().int().default(0),
})
const destinationCoreSchema = z.object({
  parentId: z.string().optional().nullable(),
  slug: z.string().min(1).max(255),
  code: z.string().max(100).optional().nullable(),
  canonicalPlaceId: z.string().min(1).max(255).optional().nullable(),
  destinationType: destinationTypeSchema.default("destination"),
  latitude: z.number().min(-90).max(90).optional().nullable(),
  longitude: z.number().min(-180).max(180).optional().nullable(),
  sortOrder: z.number().int().default(0),
  active: z.boolean().default(true),
  metadata: z.record(z.string(), z.unknown()).optional().nullable(),
})
const destinationTranslationCoreSchema = z.object({
  languageTag: languageTagSchema,
  name: z.string().min(1).max(255),
  description: z.string().optional().nullable(),
  seoTitle: z.string().max(255).optional().nullable(),
  seoDescription: z.string().optional().nullable(),
})
const productDestinationCoreSchema = z.object({
  destinationId: z.string(),
  sortOrder: z.number().int().default(0),
})

export const insertProductFeatureSchema = productFeatureCoreSchema
export const updateProductFeatureSchema = productFeatureCoreSchema.partial()
export const productFeatureListQuerySchema = z.object({
  productId: z.string().optional(),
  featureType: productFeatureTypeSchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
})
export const insertProductFaqSchema = productFaqCoreSchema
export const updateProductFaqSchema = productFaqCoreSchema.partial()
export const productFaqListQuerySchema = z.object({
  productId: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
})
export const insertProductLocationSchema = productLocationCoreSchema
export const updateProductLocationSchema = productLocationCoreSchema.partial()
export const productLocationListQuerySchema = z.object({
  productId: z.string().optional(),
  locationType: productLocationTypeSchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
})
export const insertDestinationSchema = destinationCoreSchema
export const updateDestinationSchema = destinationCoreSchema.partial()
export const destinationListQuerySchema = z.object({
  parentId: z.string().optional(),
  active: booleanQueryParam.optional(),
  search: z.string().optional(),
  languageTag: languageTagSchema.optional(),
  destinationType: destinationTypeSchema.optional(),
  canonicalPlaceId: z.string().trim().min(1).max(255).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
})
export const insertDestinationTranslationSchema = destinationTranslationCoreSchema
export const updateDestinationTranslationSchema = destinationTranslationCoreSchema.partial()
export const destinationTranslationListQuerySchema = z.object({
  destinationId: z.string().optional(),
  languageTag: languageTagSchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
})

const productCategoryTranslationCoreSchema = z.object({
  languageTag: languageTagSchema,
  name: z.string().min(1).max(255),
  description: z.string().optional().nullable(),
  seoTitle: z.string().max(255).optional().nullable(),
  seoDescription: z.string().optional().nullable(),
})
export const insertProductCategoryTranslationSchema = productCategoryTranslationCoreSchema
export const updateProductCategoryTranslationSchema = productCategoryTranslationCoreSchema.partial()
export const productCategoryTranslationListQuerySchema = z.object({
  categoryId: z.string().optional(),
  languageTag: languageTagSchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
})

// Tag translations are minimal: just `name`. Tags are short labels;
// description / SEO blurbs aren't needed (per #502 non-goals).
const productTagTranslationCoreSchema = z.object({
  languageTag: languageTagSchema,
  name: z.string().min(1).max(255),
})
export const insertProductTagTranslationSchema = productTagTranslationCoreSchema
export const updateProductTagTranslationSchema = productTagTranslationCoreSchema.partial()
export const productTagTranslationListQuerySchema = z.object({
  tagId: z.string().optional(),
  languageTag: languageTagSchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
})
export const insertProductDestinationSchema = productDestinationCoreSchema
export const updateProductDestinationSchema = productDestinationCoreSchema.partial()
export const productDestinationListQuerySchema = z.object({
  productId: z.string().optional(),
  destinationId: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
})

export type InsertProductFeature = z.infer<typeof insertProductFeatureSchema>
export type UpdateProductFeature = z.infer<typeof updateProductFeatureSchema>
export type InsertProductFaq = z.infer<typeof insertProductFaqSchema>
export type UpdateProductFaq = z.infer<typeof updateProductFaqSchema>
export type InsertProductLocation = z.infer<typeof insertProductLocationSchema>
export type UpdateProductLocation = z.infer<typeof updateProductLocationSchema>
export type InsertDestination = z.infer<typeof insertDestinationSchema>
export type UpdateDestination = z.infer<typeof updateDestinationSchema>
export type InsertDestinationTranslation = z.infer<typeof insertDestinationTranslationSchema>
export type UpdateDestinationTranslation = z.infer<typeof updateDestinationTranslationSchema>
export type InsertProductDestination = z.infer<typeof insertProductDestinationSchema>
export type UpdateProductDestination = z.infer<typeof updateProductDestinationSchema>
export type InsertProductCategoryTranslation = z.infer<
  typeof insertProductCategoryTranslationSchema
>
export type UpdateProductCategoryTranslation = z.infer<
  typeof updateProductCategoryTranslationSchema
>
export type InsertProductTagTranslation = z.infer<typeof insertProductTagTranslationSchema>
export type UpdateProductTagTranslation = z.infer<typeof updateProductTagTranslationSchema>

const productTranslationCoreSchema = z.object({
  languageTag: languageTagSchema,
  slug: z.string().max(255).optional().nullable(),
  name: z.string().min(1).max(255),
  shortDescription: z.string().optional().nullable(),
  description: z.string().optional().nullable(),
  inclusionsHtml: z.string().optional().nullable(),
  exclusionsHtml: z.string().optional().nullable(),
  termsHtml: z.string().optional().nullable(),
  seoTitle: z.string().max(255).optional().nullable(),
  seoDescription: z.string().optional().nullable(),
})
const optionTranslationCoreSchema = z.object({
  languageTag: languageTagSchema,
  name: z.string().min(1).max(255),
  shortDescription: z.string().optional().nullable(),
  description: z.string().optional().nullable(),
})

export const insertProductTranslationSchema = productTranslationCoreSchema
export const updateProductTranslationSchema = productTranslationCoreSchema.partial()
export const productTranslationListQuerySchema = z.object({
  productId: z.string().optional(),
  languageTag: languageTagSchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
})
const productDayTranslationCoreSchema = z.object({
  languageTag: languageTagSchema,
  title: z.string().max(255).optional().nullable(),
  description: z.string().optional().nullable(),
  location: z.string().max(255).optional().nullable(),
})
export const insertProductDayTranslationSchema = productDayTranslationCoreSchema
export const updateProductDayTranslationSchema = productDayTranslationCoreSchema.partial()
export const productDayTranslationListQuerySchema = z.object({
  dayId: z.string().optional(),
  languageTag: languageTagSchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
})
export type InsertProductDayTranslation = z.infer<typeof insertProductDayTranslationSchema>
export type UpdateProductDayTranslation = z.infer<typeof updateProductDayTranslationSchema>

const productItineraryTranslationCoreSchema = z.object({
  languageTag: languageTagSchema,
  name: z.string().min(1).max(255),
})
export const insertProductItineraryTranslationSchema = productItineraryTranslationCoreSchema
export const updateProductItineraryTranslationSchema =
  productItineraryTranslationCoreSchema.partial()
export const productItineraryTranslationListQuerySchema = z.object({
  itineraryId: z.string().optional(),
  languageTag: languageTagSchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
})
export type InsertProductItineraryTranslation = z.infer<
  typeof insertProductItineraryTranslationSchema
>
export type UpdateProductItineraryTranslation = z.infer<
  typeof updateProductItineraryTranslationSchema
>

export const insertProductOptionTranslationSchema = optionTranslationCoreSchema
export const updateProductOptionTranslationSchema = optionTranslationCoreSchema.partial()
export const productOptionTranslationListQuerySchema = z.object({
  optionId: z.string().optional(),
  languageTag: languageTagSchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
})
export const insertOptionUnitTranslationSchema = optionTranslationCoreSchema
export const updateOptionUnitTranslationSchema = optionTranslationCoreSchema.partial()
export const optionUnitTranslationListQuerySchema = z.object({
  unitId: z.string().optional(),
  languageTag: languageTagSchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
})

export type InsertProductTranslation = z.infer<typeof insertProductTranslationSchema>
export type UpdateProductTranslation = z.infer<typeof updateProductTranslationSchema>
export type InsertProductOptionTranslation = z.infer<typeof insertProductOptionTranslationSchema>
export type UpdateProductOptionTranslation = z.infer<typeof updateProductOptionTranslationSchema>
export type InsertOptionUnitTranslation = z.infer<typeof insertOptionUnitTranslationSchema>
export type UpdateOptionUnitTranslation = z.infer<typeof updateOptionUnitTranslationSchema>

const itineraryCoreSchema = z.object({
  name: z.string().min(1).max(255),
  isDefault: z.boolean().default(false),
  sortOrder: z.number().int().default(0),
})
export const insertItinerarySchema = itineraryCoreSchema
export const updateItinerarySchema = itineraryCoreSchema.partial()
export const duplicateItinerarySchema = z.object({
  name: z.string().min(1).max(255).optional(),
})
export type InsertItinerary = z.infer<typeof insertItinerarySchema>
export type UpdateItinerary = z.infer<typeof updateItinerarySchema>
export type DuplicateItinerary = z.infer<typeof duplicateItinerarySchema>

const dayCoreSchema = z.object({
  dayNumber: z.number().int().positive(),
  title: z.string().max(255).optional().nullable(),
  description: z.string().optional().nullable(),
  location: z.string().max(255).optional().nullable(),
})
export const insertDaySchema = dayCoreSchema
export const updateDaySchema = dayCoreSchema.partial()
export type InsertDay = z.infer<typeof insertDaySchema>
export type UpdateDay = z.infer<typeof updateDaySchema>

const dayServiceCoreSchema = z.object({
  serviceType: serviceTypeSchema,
  name: z.string().min(1).max(255),
  description: z.string().optional().nullable(),
  countryCode: z.string().min(2).max(2).optional().nullable(),
  supplierServiceId: z.string().optional().nullable(),
  // Operational fields (voyant#4035): a costing row becomes an operable one.
  // A supplier the departure line is delivered by, alongside the existing loose
  // `supplierServiceId`, and a Place/facility the service happens at. Both are
  // soft references (plain ids) — inventory does not own suppliers/facilities.
  supplierId: z.string().optional().nullable(),
  facilityId: z.string().optional().nullable(),
  // When the service happens within its day, in the departure's local time.
  // `durationMinutes` is an alternative to an explicit end time.
  startTimeLocal: localTimeOfDaySchema.optional().nullable(),
  endTimeLocal: localTimeOfDaySchema.optional().nullable(),
  durationMinutes: z.number().int().min(0).optional().nullable(),
  inclusionRole: dayServiceInclusionRoleSchema.default("included"),
  travelerScope: dayServiceTravelerScopeSchema.default("all"),
  costCurrency: z.string().min(3).max(3),
  costAmountCents: z.number().int().min(0),
  quantity: z.number().int().positive().default(1),
  sortOrder: z.number().int().optional().nullable(),
  notes: z.string().optional().nullable(),
})
export const insertDayServiceSchema = dayServiceCoreSchema
export const updateDayServiceSchema = dayServiceCoreSchema.partial()
export type InsertDayService = z.infer<typeof insertDayServiceSchema>
export type UpdateDayService = z.infer<typeof updateDayServiceSchema>

const dayServiceTranslationCoreSchema = z.object({
  languageTag: languageTagSchema,
  name: z.string().min(1).max(255),
  description: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
})
export const insertDayServiceTranslationSchema = dayServiceTranslationCoreSchema
export const updateDayServiceTranslationSchema = dayServiceTranslationCoreSchema.partial()
export const dayServiceTranslationListQuerySchema = z.object({
  serviceId: z.string().optional(),
  languageTag: languageTagSchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
})
export type InsertDayServiceTranslation = z.infer<typeof insertDayServiceTranslationSchema>
export type UpdateDayServiceTranslation = z.infer<typeof updateDayServiceTranslationSchema>

const productMediaTypeSchema = z.enum(["image", "video", "document"])
const productMediaCoreSchema = z.object({
  mediaType: productMediaTypeSchema,
  name: z.string().min(1).max(500),
  url: z.string().min(1).max(2048),
  storageKey: z.string().max(1024).optional().nullable(),
  mimeType: z.string().max(255).optional().nullable(),
  fileSize: z.number().int().min(0).optional().nullable(),
  width: z.number().int().positive().optional().nullable(),
  height: z.number().int().positive().optional().nullable(),
  altText: z.string().max(1000).optional().nullable(),
  assetId: z.string().max(255).optional().nullable(),
  sortOrder: z.number().int().default(0),
  isCover: z.boolean().default(false),
  isBrochure: z.boolean().default(false),
  isBrochureCurrent: z.boolean().default(false),
  brochureVersion: z.number().int().min(1).optional().nullable(),
})
export const insertProductMediaSchema = productMediaCoreSchema.extend({
  dayId: z.string().optional().nullable(),
})
export const updateProductMediaSchema = productMediaCoreSchema.partial()
export const upsertProductBrochureSchema = productMediaCoreSchema
  .omit({
    mediaType: true,
    isCover: true,
    isBrochure: true,
    isBrochureCurrent: true,
    brochureVersion: true,
  })
  .extend({
    mimeType: z.string().max(255).optional().nullable().default("application/pdf"),
  })
export const productMediaListQuerySchema = z.object({
  dayId: z.string().optional(),
  mediaType: productMediaTypeSchema.optional(),
  isBrochure: booleanQueryParam.optional(),
  isBrochureCurrent: booleanQueryParam.optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
})
export const reorderProductMediaSchema = z.object({
  items: z.array(z.object({ id: z.string(), sortOrder: z.number().int() })),
})
export const setProductOpenGraphMediaSchema = z.object({
  mediaId: z.string().nullable(),
})
export type InsertProductMedia = z.infer<typeof insertProductMediaSchema>
export type UpdateProductMedia = z.infer<typeof updateProductMediaSchema>
export type UpsertProductBrochure = z.infer<typeof upsertProductBrochureSchema>
export type ProductMediaListQuery = z.infer<typeof productMediaListQuerySchema>
export type ReorderProductMedia = z.infer<typeof reorderProductMediaSchema>
export type SetProductOpenGraphMedia = z.infer<typeof setProductOpenGraphMediaSchema>

const productTypeCoreSchema = z.object({
  name: z.string().min(1).max(255),
  code: z
    .string()
    .min(1)
    .max(100)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Code must be lowercase kebab-case"),
  description: z.string().optional().nullable(),
  sortOrder: z.number().int().default(0),
  active: z.boolean().default(true),
  metadata: z.record(z.string(), z.unknown()).optional().nullable(),
})
export const insertProductTypeSchema = productTypeCoreSchema
// Codes are durable identifiers used by catalog views, integrations, and saved
// filters. Operators can rename the display label, but changing a code after
// creation would silently reinterpret existing products.
export const updateProductTypeSchema = productTypeCoreSchema.omit({ code: true }).partial().strict()
export const productTypeListQuerySchema = z.object({
  active: booleanQueryParam.optional(),
  search: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
})
export type InsertProductType = z.infer<typeof insertProductTypeSchema>
export type UpdateProductType = z.infer<typeof updateProductTypeSchema>

const productCategoryDepositRuleSchema = z.object({
  kind: z.enum(["none", "percent", "fixed_cents"]),
  percent: z.number().min(0).max(100).optional(),
  amountCents: z.number().int().min(0).optional(),
})

const productCategoryPaymentPolicySchema = z.object({
  deposit: productCategoryDepositRuleSchema,
  minDaysBeforeDepartureForDeposit: z.number().int().min(0),
  balanceDueDaysBeforeDeparture: z.number().int().min(0),
  balanceDueMinDaysFromNow: z.number().int().min(0),
})

const productCategoryCoreSchema = z.object({
  name: z.string().min(1).max(255),
  slug: z.string().min(1).max(255),
  parentId: z.string().optional().nullable(),
  description: z.string().optional().nullable(),
  sortOrder: z.number().int().default(0),
  active: z.boolean().default(true),
  customerPaymentPolicy: productCategoryPaymentPolicySchema.optional().nullable(),
  metadata: z.record(z.string(), z.unknown()).optional().nullable(),
})
export const insertProductCategorySchema = productCategoryCoreSchema
export const updateProductCategorySchema = productCategoryCoreSchema.partial()
export const productCategoryListQuerySchema = z.object({
  parentId: z.string().optional(),
  active: booleanQueryParam.optional(),
  search: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
})
export type InsertProductCategory = z.infer<typeof insertProductCategorySchema>
export type UpdateProductCategory = z.infer<typeof updateProductCategorySchema>

const productTagCoreSchema = z.object({
  name: z.string().min(1).max(255),
})
export const insertProductTagSchema = productTagCoreSchema
export const updateProductTagSchema = productTagCoreSchema.partial()
export const productTagListQuerySchema = z.object({
  search: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
})
export type InsertProductTag = z.infer<typeof insertProductTagSchema>
export type UpdateProductTag = z.infer<typeof updateProductTagSchema>
