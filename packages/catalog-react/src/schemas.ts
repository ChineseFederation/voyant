import { z } from "zod"

const indexerDocumentSchema = z.object({
  id: z.string(),
  fields: z.record(z.string(), z.unknown()),
  embeddings: z.record(z.string(), z.array(z.number())).optional(),
  embedding_model_id: z.string().optional(),
})

const searchHitSchema = z.object({
  id: z.string(),
  score: z.number(),
  document: indexerDocumentSchema,
  highlights: z.record(z.string(), z.unknown()).optional(),
})

const facetBucketSchema = z.object({
  value: z.union([z.string(), z.number()]),
  count: z.number(),
})

const publicApiCatalogCardTaxonSchema = z.object({
  id: z.string().nullable(),
  name: z.string().nullable(),
  slug: z.string().nullable(),
})

const publicApiCatalogCardOfferSchema = z.object({
  id: z.string().nullable(),
  name: z.string().nullable(),
  discountKind: z.string().nullable(),
  discountPercent: z.number().nullable(),
  discountAmountCents: z.number().nullable(),
  minPax: z.number().nullable().optional(),
})

const publicApiCatalogCardSchema = z.object({
  id: z.string(),
  name: z.string().nullable(),
  slug: z.string().nullable(),
  primaryCategory: publicApiCatalogCardTaxonSchema.nullable(),
  media: z.object({
    thumbnailUrl: z.string().nullable(),
    coverMediaUrl: z.string().nullable(),
  }),
  priceFrom: z
    .object({
      amountCents: z.number(),
      currency: z.string().nullable(),
      originalAmountCents: z.number().nullable(),
    })
    .nullable(),
  offerBadges: z.array(publicApiCatalogCardOfferSchema),
  departures: z.object({
    upcomingCount: z.number().nullable(),
    /** ISO 8601 instant. */
    nextDepartureAt: z.string().nullable(),
    /** Bare calendar date (YYYY-MM-DD) in `timezone`. */
    nextDepartureDate: z.string().nullable(),
    /** ISO 8601 instant; null when the departure declares no end. */
    nextDepartureEndsAt: z.string().nullable().default(null),
    /** Bare calendar date (YYYY-MM-DD) in `timezone`. */
    nextDepartureEndDate: z.string().nullable().default(null),
    /** IANA zone the bare-date fields above (and `months`/`dates`) are in. */
    timezone: z.string().nullable().default(null),
    months: z.array(z.string()),
    dates: z.array(z.string()),
  }),
  destinations: z.object({
    regions: z.array(z.string()),
    countries: z.array(z.string()),
    cities: z.array(z.string()),
    ids: z.array(z.string()),
    slugs: z.array(z.string()),
  }),
  coordinates: z
    .object({
      latitude: z.number(),
      longitude: z.number(),
    })
    .nullable(),
})

export const catalogSearchResponseSchema = z.object({
  vertical: z.string(),
  mode: z.enum(["keyword", "hybrid", "semantic"]),
  total: z.number(),
  totalRelation: z.enum(["eq", "gte"]).optional(),
  next_cursor: z.string().optional(),
  hits: z.array(searchHitSchema),
  cards: z.array(publicApiCatalogCardSchema).optional(),
  facets: z.record(z.string(), z.array(facetBucketSchema)).optional(),
})

export type CatalogSearchResponse = z.infer<typeof catalogSearchResponseSchema>
export type CatalogSearchHit = z.infer<typeof searchHitSchema>
export type CatalogSearchDocument = z.infer<typeof indexerDocumentSchema>
export type CatalogFacetBucket = z.infer<typeof facetBucketSchema>
