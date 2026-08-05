// agent-quality: file-size exception -- owner: inventory; existing service module stays co-located until a dedicated split preserves behavior and tests.
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"

import { resolveProductClassification } from "./classification.js"
import {
  destinations,
  destinationTranslations,
  productCapabilities,
  productCategories,
  productCategoryProducts,
  productDayServices,
  productDayServiceTranslations,
  productDays,
  productDayTranslations,
  productDestinations,
  productFaqs,
  productFeatures,
  productItineraries,
  productItineraryTranslations,
  productLocations,
  productMedia,
  products,
  productTagProducts,
  productTags,
  productTranslations,
  productTypes,
  productVisibilitySettings,
} from "./schema.js"
import type {
  CatalogSearchDocument,
  CatalogSearchDocumentListQuery,
  LocalizedCatalogProductDetail,
} from "./validation-catalog.js"

type CatalogProductRow = typeof products.$inferSelect

type HydrateCatalogProductOptions = {
  includeContent?: boolean
  /**
   * Fold each product's default itinerary (days + day-services, localized)
   * into the detail payload. Opt-in — the day/service joins only run for
   * callers that render the day-by-day plan (issue voyant#2910). Implies
   * `includeContent` semantics: the itinerary only rides the detail shape.
   */
  includeItinerary?: boolean
  languageTag?: string | null
  fallbackLanguageTags?: string[]
}

/** Localized day-service line within a folded itinerary. */
export type CatalogItineraryDayService = {
  id: string
  serviceType: string
  name: string
  description: string | null
  sortOrder: number | null
}

/** Localized day within a folded itinerary. */
export type CatalogItineraryDay = {
  id: string
  dayNumber: number
  title: string | null
  description: string | null
  location: string | null
  thumbnailUrl: string | null
  services: CatalogItineraryDayService[]
}

/**
 * The product's default itinerary, folded into the read-model document.
 * Departure-specific overrides stay on `getStorefrontDepartureItinerary`;
 * this is the product-level default only (issue voyant#2910).
 */
export type CatalogItinerary = {
  id: string
  name: string
  days: CatalogItineraryDay[]
}

export const DEFAULT_CATALOG_SEARCH_FALLBACK_LANGUAGE_TAGS = ["en", "ro"] as const

function normalizeDate(value: Date | string | null | undefined): string | null {
  if (!value) {
    return null
  }

  return value instanceof Date ? value.toISOString() : value
}

function normalizeDateTime(value: Date | string | null | undefined): string | null {
  if (!value) {
    return null
  }

  return value instanceof Date ? value.toISOString() : value
}

function normalizeLanguageTag(value: string | null | undefined) {
  const normalized = value?.trim().toLowerCase()
  return normalized || null
}

/**
 * Cap applied to `description` on summary (list) payloads. Full richtext
 * bodies stay on detail lookups (`includeContent: true`); see #1686 —
 * unbounded per-row content drives Worker isolates toward the memory
 * ceiling under storefront list load.
 */
const SUMMARY_DESCRIPTION_MAX_LENGTH = 500

function trimSummaryDescription(description: string | null) {
  if (!description || description.length <= SUMMARY_DESCRIPTION_MAX_LENGTH) {
    return description
  }

  return description.slice(0, SUMMARY_DESCRIPTION_MAX_LENGTH)
}

function normalizeLanguageTagList(values: Array<string | null | undefined>) {
  return Array.from(
    new Set(
      values
        .map((value) => normalizeLanguageTag(value))
        .filter((value): value is string => Boolean(value)),
    ),
  )
}

function resolveFallbackLanguageTags(languageTag?: string | null, fallbackLanguageTags?: string[]) {
  const normalizedPrimary = normalizeLanguageTag(languageTag)
  return normalizeLanguageTagList([normalizedPrimary, ...(fallbackLanguageTags ?? [])])
}

/**
 * Pick the first translation row matching the ordered fallback language
 * tags, mirroring the product-level selection in `loadCatalogHydrationData`.
 * Returns `null` when no candidate locales are configured (so callers fall
 * back to the base row's own columns).
 */
function pickTranslationByFallback<T extends { languageTag: string }>(
  rows: T[],
  fallbackLanguageTags: string[],
): T | null {
  if (fallbackLanguageTags.length === 0) return null
  return (
    fallbackLanguageTags
      .map((languageTag) =>
        rows.find((row) => normalizeLanguageTag(row.languageTag) === languageTag),
      )
      .find(Boolean) ?? null
  )
}

function groupBy<T, K>(rows: T[], keyOf: (row: T) => K): Map<K, T[]> {
  const map = new Map<K, T[]>()
  for (const row of rows) {
    const key = keyOf(row)
    const existing = map.get(key) ?? []
    existing.push(row)
    map.set(key, existing)
  }
  return map
}

/**
 * Load each product's default itinerary — days + day-services with their
 * `product_day_translations` / `product_day_service_translations` resolved
 * by the same fallback-locale chain the rest of the document uses — and the
 * first per-day media as a thumbnail. All inventory-owned tables. Only the
 * product default (`is_default = true`) is folded here; departure overrides
 * stay on `getStorefrontDepartureItinerary` (issue voyant#2910).
 */
async function loadDefaultItineraries(
  db: PostgresJsDatabase,
  productIds: string[],
  fallbackLanguageTags: string[],
): Promise<Map<string, CatalogItinerary>> {
  const byProduct = new Map<string, CatalogItinerary>()
  if (productIds.length === 0) return byProduct

  const itineraryRows = await db
    .select({
      id: productItineraries.id,
      productId: productItineraries.productId,
      name: productItineraries.name,
    })
    .from(productItineraries)
    .where(
      and(
        inArray(productItineraries.productId, productIds),
        eq(productItineraries.isDefault, true),
      ),
    )
    .orderBy(asc(productItineraries.sortOrder), asc(productItineraries.createdAt))

  // One default per product (the partial unique index enforces this, but keep
  // the first deterministically in case older data drifted).
  const itineraryByProduct = new Map<string, (typeof itineraryRows)[number]>()
  for (const row of itineraryRows) {
    if (!itineraryByProduct.has(row.productId)) itineraryByProduct.set(row.productId, row)
  }
  const itineraryIds = [...itineraryByProduct.values()].map((row) => row.id)
  if (itineraryIds.length === 0) return byProduct

  const [itineraryTranslationRows, dayRows] = await Promise.all([
    fallbackLanguageTags.length > 0
      ? db
          .select({
            itineraryId: productItineraryTranslations.itineraryId,
            languageTag: productItineraryTranslations.languageTag,
            name: productItineraryTranslations.name,
          })
          .from(productItineraryTranslations)
          .where(
            and(
              inArray(productItineraryTranslations.itineraryId, itineraryIds),
              inArray(productItineraryTranslations.languageTag, fallbackLanguageTags),
            ),
          )
      : Promise.resolve([]),
    db
      .select({
        id: productDays.id,
        itineraryId: productDays.itineraryId,
        dayNumber: productDays.dayNumber,
        title: productDays.title,
        description: productDays.description,
        location: productDays.location,
      })
      .from(productDays)
      .where(inArray(productDays.itineraryId, itineraryIds))
      .orderBy(asc(productDays.dayNumber)),
  ])

  const dayIds = dayRows.map((row) => row.id)

  const [dayTranslationRows, serviceRows, dayMediaRows] =
    dayIds.length > 0
      ? await Promise.all([
          fallbackLanguageTags.length > 0
            ? db
                .select({
                  dayId: productDayTranslations.dayId,
                  languageTag: productDayTranslations.languageTag,
                  title: productDayTranslations.title,
                  description: productDayTranslations.description,
                  location: productDayTranslations.location,
                })
                .from(productDayTranslations)
                .where(
                  and(
                    inArray(productDayTranslations.dayId, dayIds),
                    inArray(productDayTranslations.languageTag, fallbackLanguageTags),
                  ),
                )
            : Promise.resolve([]),
          db
            .select({
              id: productDayServices.id,
              dayId: productDayServices.dayId,
              serviceType: productDayServices.serviceType,
              name: productDayServices.name,
              description: productDayServices.description,
              sortOrder: productDayServices.sortOrder,
            })
            .from(productDayServices)
            .where(inArray(productDayServices.dayId, dayIds))
            .orderBy(asc(productDayServices.sortOrder), asc(productDayServices.createdAt)),
          db
            .select({
              dayId: productMedia.dayId,
              url: productMedia.url,
              isCover: productMedia.isCover,
              sortOrder: productMedia.sortOrder,
            })
            .from(productMedia)
            .where(
              and(inArray(productMedia.productId, productIds), inArray(productMedia.dayId, dayIds)),
            )
            .orderBy(
              desc(productMedia.isCover),
              asc(productMedia.sortOrder),
              asc(productMedia.createdAt),
            ),
        ])
      : [[], [], []]

  const serviceIds = serviceRows.map((row) => row.id)
  const serviceTranslationRows =
    serviceIds.length > 0 && fallbackLanguageTags.length > 0
      ? await db
          .select({
            serviceId: productDayServiceTranslations.serviceId,
            languageTag: productDayServiceTranslations.languageTag,
            name: productDayServiceTranslations.name,
            description: productDayServiceTranslations.description,
          })
          .from(productDayServiceTranslations)
          .where(
            and(
              inArray(productDayServiceTranslations.serviceId, serviceIds),
              inArray(productDayServiceTranslations.languageTag, fallbackLanguageTags),
            ),
          )
      : []

  const itineraryTranslationsById = groupBy(itineraryTranslationRows, (row) => row.itineraryId)
  const daysByItinerary = groupBy(dayRows, (row) => row.itineraryId)
  const dayTranslationsByDay = groupBy(dayTranslationRows, (row) => row.dayId)
  const servicesByDay = groupBy(serviceRows, (row) => row.dayId)
  const serviceTranslationsByService = groupBy(serviceTranslationRows, (row) => row.serviceId)

  const thumbnailByDay = new Map<string, string>()
  for (const row of dayMediaRows) {
    if (row.dayId && !thumbnailByDay.has(row.dayId)) thumbnailByDay.set(row.dayId, row.url)
  }

  for (const [productId, itinerary] of itineraryByProduct) {
    const nameTranslation = pickTranslationByFallback(
      itineraryTranslationsById.get(itinerary.id) ?? [],
      fallbackLanguageTags,
    )
    const days = (daysByItinerary.get(itinerary.id) ?? []).map<CatalogItineraryDay>((day) => {
      const dayTranslation = pickTranslationByFallback(
        dayTranslationsByDay.get(day.id) ?? [],
        fallbackLanguageTags,
      )
      const services = (servicesByDay.get(day.id) ?? []).map<CatalogItineraryDayService>(
        (service) => {
          const serviceTranslation = pickTranslationByFallback(
            serviceTranslationsByService.get(service.id) ?? [],
            fallbackLanguageTags,
          )
          return {
            id: service.id,
            serviceType: service.serviceType,
            name: serviceTranslation?.name ?? service.name,
            description: serviceTranslation?.description ?? service.description ?? null,
            sortOrder: service.sortOrder ?? null,
          }
        },
      )
      return {
        id: day.id,
        dayNumber: day.dayNumber,
        title: dayTranslation?.title ?? day.title ?? null,
        description: dayTranslation?.description ?? day.description ?? null,
        location: dayTranslation?.location ?? day.location ?? null,
        thumbnailUrl: thumbnailByDay.get(day.id) ?? null,
        services,
      }
    })

    byProduct.set(productId, {
      id: itinerary.id,
      name: nameTranslation?.name ?? itinerary.name,
      days,
    })
  }

  return byProduct
}

async function loadCatalogHydrationData(
  db: PostgresJsDatabase,
  productRows: CatalogProductRow[],
  options: HydrateCatalogProductOptions = {},
) {
  const productIds = productRows.map((product) => product.id)
  const productTypeIds = Array.from(
    new Set(
      productRows
        .map((product) => product.productTypeId)
        .filter((value): value is string => Boolean(value)),
    ),
  )
  const fallbackLanguageTags = resolveFallbackLanguageTags(
    options.languageTag,
    options.fallbackLanguageTags,
  )

  const [
    categoryRows,
    tagRows,
    translationRows,
    typeRows,
    capabilityRows,
    mediaRows,
    featuredRows,
    featureRows,
    faqRows,
    destinationRows,
    locationRows,
  ] = await Promise.all([
    db
      .select({
        productId: productCategoryProducts.productId,
        id: productCategories.id,
        parentId: productCategories.parentId,
        name: productCategories.name,
        slug: productCategories.slug,
        description: productCategories.description,
        sortOrder: productCategories.sortOrder,
      })
      .from(productCategoryProducts)
      .innerJoin(productCategories, eq(productCategories.id, productCategoryProducts.categoryId))
      .where(
        and(
          inArray(productCategoryProducts.productId, productIds),
          eq(productCategories.active, true),
        ),
      )
      .orderBy(
        asc(productCategoryProducts.sortOrder),
        asc(productCategories.sortOrder),
        asc(productCategories.name),
      ),
    db
      .select({
        productId: productTagProducts.productId,
        id: productTags.id,
        name: productTags.name,
      })
      .from(productTagProducts)
      .innerJoin(productTags, eq(productTags.id, productTagProducts.tagId))
      .where(inArray(productTagProducts.productId, productIds))
      .orderBy(asc(productTags.name)),
    fallbackLanguageTags.length > 0
      ? db
          .select({
            productId: productTranslations.productId,
            languageTag: productTranslations.languageTag,
            slug: productTranslations.slug,
            name: productTranslations.name,
            shortDescription: productTranslations.shortDescription,
            description: productTranslations.description,
            inclusionsHtml: productTranslations.inclusionsHtml,
            exclusionsHtml: productTranslations.exclusionsHtml,
            termsHtml: productTranslations.termsHtml,
            seoTitle: productTranslations.seoTitle,
            seoDescription: productTranslations.seoDescription,
            updatedAt: productTranslations.updatedAt,
          })
          .from(productTranslations)
          .where(
            and(
              inArray(productTranslations.productId, productIds),
              inArray(productTranslations.languageTag, fallbackLanguageTags),
            ),
          )
      : Promise.resolve([]),
    productTypeIds.length > 0
      ? db
          .select({
            id: productTypes.id,
            code: productTypes.code,
            name: productTypes.name,
            description: productTypes.description,
          })
          .from(productTypes)
          // Inactive controls whether a family can be selected for new edits;
          // it must not erase the meaning of products already assigned to it.
          .where(inArray(productTypes.id, productTypeIds))
      : Promise.resolve([]),
    db
      .select({
        productId: productCapabilities.productId,
        capability: productCapabilities.capability,
      })
      .from(productCapabilities)
      .where(
        and(
          inArray(productCapabilities.productId, productIds),
          eq(productCapabilities.enabled, true),
        ),
      )
      .orderBy(asc(productCapabilities.capability)),
    db
      .select({
        productId: productMedia.productId,
        id: productMedia.id,
        dayId: productMedia.dayId,
        mediaType: productMedia.mediaType,
        name: productMedia.name,
        url: productMedia.url,
        mimeType: productMedia.mimeType,
        width: productMedia.width,
        height: productMedia.height,
        altText: productMedia.altText,
        sortOrder: productMedia.sortOrder,
        isCover: productMedia.isCover,
        isOpenGraph: productMedia.isOpenGraph,
        isBrochure: productMedia.isBrochure,
        isBrochureCurrent: productMedia.isBrochureCurrent,
        brochureVersion: productMedia.brochureVersion,
      })
      .from(productMedia)
      .where(inArray(productMedia.productId, productIds))
      .orderBy(
        desc(productMedia.isCover),
        asc(productMedia.sortOrder),
        asc(productMedia.createdAt),
      ),
    db
      .select({ productId: productVisibilitySettings.productId })
      .from(productVisibilitySettings)
      .where(
        and(
          inArray(productVisibilitySettings.productId, productIds),
          eq(productVisibilitySettings.isFeatured, true),
        ),
      ),
    options.includeContent
      ? db
          .select({
            productId: productFeatures.productId,
            id: productFeatures.id,
            featureType: productFeatures.featureType,
            title: productFeatures.title,
            description: productFeatures.description,
            sortOrder: productFeatures.sortOrder,
          })
          .from(productFeatures)
          .where(inArray(productFeatures.productId, productIds))
          .orderBy(asc(productFeatures.sortOrder), asc(productFeatures.createdAt))
      : Promise.resolve([]),
    options.includeContent
      ? db
          .select({
            productId: productFaqs.productId,
            id: productFaqs.id,
            question: productFaqs.question,
            answer: productFaqs.answer,
            sortOrder: productFaqs.sortOrder,
          })
          .from(productFaqs)
          .where(inArray(productFaqs.productId, productIds))
          .orderBy(asc(productFaqs.sortOrder), asc(productFaqs.createdAt))
      : Promise.resolve([]),
    db
      .select({
        productId: productDestinations.productId,
        destinationId: destinations.id,
        parentId: destinations.parentId,
        slug: destinations.slug,
        canonicalPlaceId: destinations.canonicalPlaceId,
        destinationType: destinations.destinationType,
        latitude: destinations.latitude,
        longitude: destinations.longitude,
        sortOrder: productDestinations.sortOrder,
        fallbackSortOrder: destinations.sortOrder,
        translationLanguageTag: destinationTranslations.languageTag,
        translationName: destinationTranslations.name,
        translationDescription: destinationTranslations.description,
        translationSeoTitle: destinationTranslations.seoTitle,
        translationSeoDescription: destinationTranslations.seoDescription,
      })
      .from(productDestinations)
      .innerJoin(destinations, eq(destinations.id, productDestinations.destinationId))
      .leftJoin(
        destinationTranslations,
        and(
          eq(destinationTranslations.destinationId, destinations.id),
          fallbackLanguageTags.length > 0
            ? inArray(destinationTranslations.languageTag, fallbackLanguageTags)
            : sql`true`,
        ),
      )
      .where(inArray(productDestinations.productId, productIds))
      .orderBy(
        asc(productDestinations.sortOrder),
        asc(destinations.sortOrder),
        asc(destinationTranslations.languageTag),
      ),
    db
      .select({
        productId: productLocations.productId,
        id: productLocations.id,
        locationType: productLocations.locationType,
        title: productLocations.title,
        address: productLocations.address,
        city: productLocations.city,
        countryCode: productLocations.countryCode,
        latitude: productLocations.latitude,
        longitude: productLocations.longitude,
        sortOrder: productLocations.sortOrder,
      })
      .from(productLocations)
      .where(inArray(productLocations.productId, productIds))
      .orderBy(asc(productLocations.sortOrder), asc(productLocations.createdAt)),
  ])

  const categoriesByProduct = new Map<string, Array<(typeof categoryRows)[number]>>()
  for (const row of categoryRows) {
    const existing = categoriesByProduct.get(row.productId) ?? []
    existing.push(row)
    categoriesByProduct.set(row.productId, existing)
  }

  const tagsByProduct = new Map<string, Array<(typeof tagRows)[number]>>()
  for (const row of tagRows) {
    const existing = tagsByProduct.get(row.productId) ?? []
    existing.push(row)
    tagsByProduct.set(row.productId, existing)
  }

  const translationsByProduct = new Map<string, Array<(typeof translationRows)[number]>>()
  for (const row of translationRows) {
    const existing = translationsByProduct.get(row.productId) ?? []
    existing.push(row)
    translationsByProduct.set(row.productId, existing)
  }

  const capabilitiesByProduct = new Map<string, string[]>()
  for (const row of capabilityRows) {
    const existing = capabilitiesByProduct.get(row.productId) ?? []
    existing.push(row.capability)
    capabilitiesByProduct.set(row.productId, existing)
  }

  const mediaByProduct = new Map<string, Array<(typeof mediaRows)[number]>>()
  for (const row of mediaRows) {
    const existing = mediaByProduct.get(row.productId) ?? []
    existing.push(row)
    mediaByProduct.set(row.productId, existing)
  }

  const featuresByProduct = new Map<string, Array<(typeof featureRows)[number]>>()
  for (const row of featureRows) {
    const existing = featuresByProduct.get(row.productId) ?? []
    existing.push(row)
    featuresByProduct.set(row.productId, existing)
  }

  const faqsByProduct = new Map<string, Array<(typeof faqRows)[number]>>()
  for (const row of faqRows) {
    const existing = faqsByProduct.get(row.productId) ?? []
    existing.push(row)
    faqsByProduct.set(row.productId, existing)
  }

  const destinationsByProduct = new Map<
    string,
    Array<{
      id: string
      parentId: string | null
      slug: string
      canonicalPlaceId: string | null
      destinationType: string
      latitude: number | null
      longitude: number | null
      sortOrder: number
      name: string
      description: string | null
      seoTitle: string | null
      seoDescription: string | null
    }>
  >()
  const destinationRowsByProductAndDestination = new Map<
    string,
    Array<(typeof destinationRows)[number]>
  >()
  for (const row of destinationRows) {
    const key = `${row.productId}:${row.destinationId}`
    const existing = destinationRowsByProductAndDestination.get(key) ?? []
    existing.push(row)
    destinationRowsByProductAndDestination.set(key, existing)
  }
  for (const rows of destinationRowsByProductAndDestination.values()) {
    const first = rows[0]
    if (!first) {
      continue
    }

    const translated =
      fallbackLanguageTags.length === 0
        ? rows[0]
        : (fallbackLanguageTags
            .map((languageTag) =>
              rows.find((row) => normalizeLanguageTag(row.translationLanguageTag) === languageTag),
            )
            .find(Boolean) ?? rows[0])

    const mapped = {
      id: first.destinationId,
      parentId: first.parentId ?? null,
      slug: first.slug,
      canonicalPlaceId: first.canonicalPlaceId ?? null,
      destinationType: first.destinationType,
      latitude: first.latitude ?? null,
      longitude: first.longitude ?? null,
      sortOrder: first.sortOrder ?? first.fallbackSortOrder ?? 0,
      name: translated?.translationName ?? first.slug,
      description: translated?.translationDescription ?? null,
      seoTitle: translated?.translationSeoTitle ?? null,
      seoDescription: translated?.translationSeoDescription ?? null,
    }

    const existing = destinationsByProduct.get(first.productId) ?? []
    existing.push(mapped)
    destinationsByProduct.set(first.productId, existing)
  }

  const locationsByProduct = new Map<string, Array<(typeof locationRows)[number]>>()
  for (const row of locationRows) {
    const existing = locationsByProduct.get(row.productId) ?? []
    existing.push(row)
    locationsByProduct.set(row.productId, existing)
  }

  const typeById = new Map(typeRows.map((row) => [row.id, row] as const))
  const featuredIds = new Set(featuredRows.map((row) => row.productId))

  // Itinerary folding is opt-in (detail-only) — the day/service joins run
  // only when a caller asks for the day-by-day plan (issue voyant#2910).
  const itineraryByProduct = options.includeItinerary
    ? await loadDefaultItineraries(db, productIds, fallbackLanguageTags)
    : new Map<string, CatalogItinerary>()

  const translationByProduct = new Map<string, (typeof translationRows)[number] | null>()
  for (const productId of productIds) {
    const rows = translationsByProduct.get(productId) ?? []
    const selected =
      fallbackLanguageTags.length === 0
        ? null
        : (fallbackLanguageTags
            .map((languageTag) =>
              rows.find((row) => normalizeLanguageTag(row.languageTag) === languageTag),
            )
            .find(Boolean) ?? null)
    translationByProduct.set(productId, selected)
  }

  return {
    categoriesByProduct,
    tagsByProduct,
    translationByProduct,
    capabilitiesByProduct,
    mediaByProduct,
    featuresByProduct,
    faqsByProduct,
    destinationsByProduct,
    locationsByProduct,
    typeById,
    featuredIds,
    itineraryByProduct,
  }
}

export const catalogProductsService = {
  async hydrateProducts(
    db: PostgresJsDatabase,
    productRows: CatalogProductRow[],
    options: HydrateCatalogProductOptions = {},
  ) {
    if (productRows.length === 0) {
      return []
    }

    const hydrationData = await loadCatalogHydrationData(db, productRows, options)

    return productRows.map((product) => {
      const translation = hydrationData.translationByProduct.get(product.id) ?? null
      const allMedia = (hydrationData.mediaByProduct.get(product.id) ?? []).map((row) => ({
        id: row.id,
        dayId: row.dayId,
        mediaType: row.mediaType,
        name: row.name,
        url: row.url,
        mimeType: row.mimeType ?? null,
        width: row.width ?? null,
        height: row.height ?? null,
        altText: row.altText ?? null,
        sortOrder: row.sortOrder,
        isCover: row.isCover,
        isOpenGraph: row.isOpenGraph,
        isBrochure: row.isBrochure,
        isBrochureCurrent: row.isBrochureCurrent,
        brochureVersion: row.brochureVersion ?? null,
      }))
      const productLevelMedia = allMedia.filter((item) => item.dayId === null)
      const brochureWithScope =
        productLevelMedia.find((item) => item.isBrochure && item.isBrochureCurrent) ??
        productLevelMedia.find((item) => item.isBrochure) ??
        null
      const brochure = brochureWithScope
        ? (({ dayId: _dayId, ...item }) => item)(brochureWithScope)
        : null
      const media = allMedia
        .filter((item) => !item.isBrochure)
        .map(({ dayId: _dayId, ...item }) => item)
      const eligibleProductMedia = productLevelMedia
        .filter((item) => !item.isBrochure)
        .map(({ dayId: _dayId, ...item }) => item)
      const openGraphImage =
        eligibleProductMedia.find((item) => item.isOpenGraph && item.mediaType === "image") ??
        eligibleProductMedia.find((item) => item.isCover && item.mediaType === "image") ??
        eligibleProductMedia.find((item) => item.mediaType === "image") ??
        null

      const base = {
        id: product.id,
        name: translation?.name ?? product.name,
        description: translation?.description ?? product.description ?? null,
        inclusionsHtml: translation?.inclusionsHtml ?? product.inclusionsHtml ?? null,
        exclusionsHtml: translation?.exclusionsHtml ?? product.exclusionsHtml ?? null,
        termsHtml: translation?.termsHtml ?? product.termsHtml ?? null,
        contentLanguageTag: translation?.languageTag ?? null,
        slug: translation?.slug ?? null,
        shortDescription: translation?.shortDescription ?? null,
        seoTitle: translation?.seoTitle ?? translation?.name ?? product.name,
        seoDescription:
          translation?.seoDescription ??
          translation?.shortDescription ??
          translation?.description ??
          product.description ??
          null,
        bookingMode: product.bookingMode,
        capacityMode: product.capacityMode,
        visibility: product.visibility,
        sellCurrency: product.sellCurrency,
        sellAmountCents: product.sellAmountCents ?? null,
        startDate: normalizeDate(product.startDate),
        endDate: normalizeDate(product.endDate),
        pax: product.pax ?? null,
        contractTemplateId: product.contractTemplateId ?? null,
        productType: product.productTypeId
          ? (hydrationData.typeById.get(product.productTypeId) ?? null)
          : null,
        categories: (hydrationData.categoriesByProduct.get(product.id) ?? []).map((row) => ({
          id: row.id,
          parentId: row.parentId ?? null,
          name: row.name,
          slug: row.slug,
          description: row.description ?? null,
          sortOrder: row.sortOrder,
        })),
        tags: (hydrationData.tagsByProduct.get(product.id) ?? []).map((row) => ({
          id: row.id,
          name: row.name,
        })),
        capabilities: hydrationData.capabilitiesByProduct.get(product.id) ?? [],
        destinations: (hydrationData.destinationsByProduct.get(product.id) ?? []).map((row) => ({
          id: row.id,
          parentId: row.parentId,
          slug: row.slug,
          canonicalPlaceId: row.canonicalPlaceId,
          name: row.name,
          description: row.description,
          seoTitle: row.seoTitle,
          seoDescription: row.seoDescription,
          destinationType: row.destinationType,
          latitude: row.latitude,
          longitude: row.longitude,
          sortOrder: row.sortOrder,
        })),
        locations: (hydrationData.locationsByProduct.get(product.id) ?? []).map((row) => ({
          id: row.id,
          locationType: row.locationType,
          title: row.title,
          address: row.address ?? null,
          city: row.city ?? null,
          countryCode: row.countryCode ?? null,
          latitude: row.latitude ?? null,
          longitude: row.longitude ?? null,
          sortOrder: row.sortOrder,
        })),
        coverMedia:
          eligibleProductMedia.find((item) => item.isCover) ?? eligibleProductMedia[0] ?? null,
        isFeatured: hydrationData.featuredIds.has(product.id),
      }

      if (!options.includeContent) {
        // Summary (list) shape: heavy richtext fields are nulled and the
        // long-form description is capped. Detail callers pass
        // `includeContent: true` and keep the full content (#1686).
        return {
          ...base,
          description: trimSummaryDescription(base.description),
          inclusionsHtml: null,
          exclusionsHtml: null,
          termsHtml: null,
        }
      }

      return {
        ...base,
        brochure,
        openGraphImage,
        media,
        features: (hydrationData.featuresByProduct.get(product.id) ?? []).map((row) => ({
          id: row.id,
          featureType: row.featureType,
          title: row.title,
          description: row.description ?? null,
          sortOrder: row.sortOrder,
        })),
        faqs: (hydrationData.faqsByProduct.get(product.id) ?? []).map((row) => ({
          id: row.id,
          question: row.question,
          answer: row.answer,
          sortOrder: row.sortOrder,
        })),
        // Only present the key when itinerary folding was requested, so the
        // default (non-itinerary) document shape is unchanged (voyant#2910).
        ...(options.includeItinerary
          ? { itinerary: hydrationData.itineraryByProduct.get(product.id) ?? null }
          : {}),
      }
    })
  },

  async listSearchDocuments(
    db: PostgresJsDatabase,
    query: CatalogSearchDocumentListQuery,
  ): Promise<{
    data: CatalogSearchDocument[]
    total: number
    limit: number
    offset: number
  }> {
    const conditions = []

    if (query.status === "active") {
      conditions.push(eq(products.status, "active"), eq(products.activated, true))
    }

    if (query.visibility === "public") {
      conditions.push(eq(products.visibility, "public"))
    }

    if (query.productIds && query.productIds.length > 0) {
      conditions.push(inArray(products.id, query.productIds))
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined

    const [rows, countResult] = await Promise.all([
      db
        .select()
        .from(products)
        .where(where)
        .orderBy(asc(products.createdAt), asc(products.id))
        .limit(query.limit)
        .offset(query.offset),
      db.select({ count: sql<number>`count(*)::int` }).from(products).where(where),
    ])

    const localizedProducts = (await this.hydrateProducts(db, rows, {
      includeContent: true,
      languageTag: query.languageTag,
      fallbackLanguageTags:
        query.fallbackLanguageTags ??
        (query.languageTag ? [...DEFAULT_CATALOG_SEARCH_FALLBACK_LANGUAGE_TAGS] : []),
    })) as LocalizedCatalogProductDetail[]

    const rowById = new Map(rows.map((row) => [row.id, row] as const))

    // Legacy itinerary-derived duration (max day number of the default
    // itinerary, falling back to the first itinerary), fetched in bulk so the
    // resolver's fallback matches list/detail and catalog-plane exactly.
    const itineraryDurationByProduct = new Map<string, number>()
    if (rows.length > 0) {
      const itineraryRows = await db
        .select({
          id: productItineraries.id,
          productId: productItineraries.productId,
          isDefault: productItineraries.isDefault,
          sortOrder: productItineraries.sortOrder,
        })
        .from(productItineraries)
        .where(
          inArray(
            productItineraries.productId,
            rows.map((row) => row.id),
          ),
        )
        .orderBy(
          asc(productItineraries.productId),
          desc(productItineraries.isDefault),
          asc(productItineraries.sortOrder),
        )
      const selectedItineraryByProduct = new Map<string, string>()
      for (const itinerary of itineraryRows) {
        if (!selectedItineraryByProduct.has(itinerary.productId)) {
          selectedItineraryByProduct.set(itinerary.productId, itinerary.id)
        }
      }
      const productByItinerary = new Map(
        [...selectedItineraryByProduct].map(([productId, itineraryId]) => [itineraryId, productId]),
      )
      const selectedItineraryIds = [...productByItinerary.keys()]
      if (selectedItineraryIds.length > 0) {
        const durationRows = await db
          .select({
            itineraryId: productDays.itineraryId,
            maxDay: sql<number | null>`max(${productDays.dayNumber})`,
          })
          .from(productDays)
          .where(inArray(productDays.itineraryId, selectedItineraryIds))
          .groupBy(productDays.itineraryId)
        for (const durationRow of durationRows) {
          const productId = productByItinerary.get(durationRow.itineraryId)
          if (productId && durationRow.maxDay != null && durationRow.maxDay > 0) {
            itineraryDurationByProduct.set(productId, durationRow.maxDay)
          }
        }
      }
    }

    return {
      data: localizedProducts.map<CatalogSearchDocument>((product) => {
        const sourceRow = rowById.get(product.id)
        const classification = resolveProductClassification({
          family: product.productType?.code
            ? { code: product.productType.code, name: product.productType.name ?? "" }
            : null,
          subtypeCode: sourceRow?.productSubtypeCode ?? null,
          durationMinutes: sourceRow?.durationMinutes ?? null,
          itineraryDurationDays: itineraryDurationByProduct.get(product.id) ?? null,
        })
        return {
          id: `${product.id}:${product.contentLanguageTag ?? "default"}`,
          productId: product.id,
          languageTag: product.contentLanguageTag,
          name: product.name,
          slug: product.slug,
          shortDescription: product.shortDescription,
          description: product.description,
          seoTitle: product.seoTitle,
          seoDescription: product.seoDescription,
          sellCurrency: product.sellCurrency,
          sellAmountCents: product.sellAmountCents,
          startDate: product.startDate,
          endDate: product.endDate,
          pax: product.pax,
          productTypeCode: product.productType?.code ?? null,
          productTypeName: product.productType?.name ?? null,
          familyCode: classification.familyCode,
          familyName: classification.familyName,
          subtypeCode: classification.subtypeCode,
          durationMinutes: classification.durationMinutes,
          durationDays: classification.durationDays,
          durationProvenance: classification.durationProvenance,
          scheduleTerm: classification.scheduleTerm,
          reviewRequired: classification.reviewRequired,
          reviewReasons: classification.reviewReasons,
          categoryIds: product.categories.map((category) => category.id),
          categoryNames: product.categories.map((category) => category.name),
          categorySlugs: product.categories.map((category) => category.slug),
          tagIds: product.tags.map((tag) => tag.id),
          tagNames: product.tags.map((tag) => tag.name),
          capabilities: product.capabilities,
          destinationIds: product.destinations.map((destination) => destination.id),
          destinationNames: product.destinations.map((destination) => destination.name),
          destinationSlugs: product.destinations.map((destination) => destination.slug),
          locationTitles: product.locations.map((location) => location.title),
          locationCities: product.locations
            .map((location) => location.city)
            .filter((value): value is string => Boolean(value)),
          locationCountryCodes: product.locations
            .map((location) => location.countryCode)
            .filter((value): value is string => Boolean(value)),
          coverMediaUrl: product.coverMedia?.url ?? null,
          isFeatured: product.isFeatured,
          createdAt: normalizeDateTime(rowById.get(product.id)?.createdAt),
          updatedAt: normalizeDateTime(rowById.get(product.id)?.updatedAt),
        }
      }),
      total: countResult[0]?.count ?? 0,
      limit: query.limit,
      offset: query.offset,
    }
  },

  async getSearchDocumentByProductId(
    db: PostgresJsDatabase,
    productId: string,
    query: Partial<Omit<CatalogSearchDocumentListQuery, "productIds" | "limit" | "offset">> = {},
  ) {
    const result = await this.listSearchDocuments(db, {
      visibility: query.visibility ?? "public",
      status: query.status ?? "active",
      ...query,
      productIds: [productId],
      limit: 1,
      offset: 0,
    })

    return result.data[0] ?? null
  },
}
