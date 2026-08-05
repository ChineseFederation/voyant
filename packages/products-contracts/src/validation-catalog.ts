import { z } from "zod"

import {
  publicCatalogProductDetailSchema,
  publicCatalogProductSummarySchema,
} from "./validation-public.js"
import { languageTagSchema, scheduleTermSchema } from "./validation-shared.js"

export const localizedCatalogProductSummarySchema = publicCatalogProductSummarySchema
export const localizedCatalogProductDetailSchema = publicCatalogProductDetailSchema

export const catalogSearchDocumentSchema = z.object({
  id: z.string(),
  productId: z.string(),
  languageTag: z.string().nullable(),
  name: z.string(),
  slug: z.string().nullable(),
  shortDescription: z.string().nullable(),
  description: z.string().nullable(),
  seoTitle: z.string().nullable(),
  seoDescription: z.string().nullable(),
  sellCurrency: z.string(),
  sellAmountCents: z.number().int().nullable(),
  startDate: z.string().nullable(),
  endDate: z.string().nullable(),
  pax: z.number().int().nullable(),
  // Product family (recast product type). `familyCode` / `familyName` are the
  // canonical merchandising-classification fields; `productTypeCode` /
  // `productTypeName` remain as their compatibility aliases.
  productTypeCode: z.string().nullable(),
  productTypeName: z.string().nullable(),
  familyCode: z.string().nullable(),
  familyName: z.string().nullable(),
  subtypeCode: z.string().nullable(),
  // Resolved duration (explicit-first, itinerary-derived fallback, else null)
  // plus its provenance. `durationDays` is the calculated compatibility value.
  durationMinutes: z.number().int().nullable(),
  durationDays: z.number().int().nullable(),
  durationProvenance: z.enum(["explicit", "itinerary-derived", "unresolved"]),
  // Operator-facing schedule term (Session / Occurrence / Departure), derived
  // from the resolved duration. Denormalized so catalog views can facet on it.
  scheduleTerm: scheduleTermSchema,
  // Actionable review state for unresolved legacy classification/duration.
  reviewRequired: z.boolean(),
  reviewReasons: z.array(z.enum(["missing_family", "unresolved_duration"])),
  categoryIds: z.array(z.string()),
  categoryNames: z.array(z.string()),
  categorySlugs: z.array(z.string()),
  tagIds: z.array(z.string()),
  tagNames: z.array(z.string()),
  capabilities: z.array(z.string()),
  destinationIds: z.array(z.string()),
  destinationNames: z.array(z.string()),
  destinationSlugs: z.array(z.string()),
  locationTitles: z.array(z.string()),
  locationCities: z.array(z.string()),
  locationCountryCodes: z.array(z.string()),
  coverMediaUrl: z.string().nullable(),
  isFeatured: z.boolean(),
  createdAt: z.string().nullable(),
  updatedAt: z.string().nullable(),
})

export const catalogSearchDocumentListQuerySchema = z.object({
  productIds: z.array(z.string()).optional(),
  languageTag: languageTagSchema.optional(),
  fallbackLanguageTags: z.array(languageTagSchema).optional(),
  visibility: z.enum(["public", "all"]).default("public"),
  status: z.enum(["active", "all"]).default("active"),
  limit: z.coerce.number().int().min(1).max(200).default(100),
  offset: z.coerce.number().int().min(0).default(0),
})

export const catalogSearchDocumentListResponseSchema = z.object({
  data: z.array(catalogSearchDocumentSchema),
  total: z.number().int(),
  limit: z.number().int(),
  offset: z.number().int(),
})

export type LocalizedCatalogProductSummary = z.infer<typeof localizedCatalogProductSummarySchema>
export type LocalizedCatalogProductDetail = z.infer<typeof localizedCatalogProductDetailSchema>
export type CatalogSearchDocument = z.infer<typeof catalogSearchDocumentSchema>
export type CatalogSearchDocumentListQuery = z.infer<typeof catalogSearchDocumentListQuerySchema>
export type CatalogSearchDocumentListResponse = z.infer<
  typeof catalogSearchDocumentListResponseSchema
>
