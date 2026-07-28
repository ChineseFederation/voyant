/**
 * Owned-product content builder.
 *
 * Projects an owned product (the products module's own tables) into the
 * vertical-shared `ProductContent` shape so the catalog content service
 * can return rich detail for owned products via the same API that
 * sourced products go through (`getProductContent`).
 *
 * Per sourced-content §3.3: `getProductContent` is the unified read
 * surface for owned + sourced. v1 of service-content.ts only handled
 * sourced (returning null for owned); this helper closes that gap.
 *
 * Locale resolution uses the catalog plane's standard
 * `pickBestCachedLocale` against `product_translations` and
 * `product_option_translations` rows — exact > language-match >
 * fallback-chain > any. Matches the same scoring semantics the sourced
 * cache reads use, so the same `BookingDraft.scope.locale` chain works
 * for both owned and sourced products.
 *
 * The projection reads in parallel:
 *   - `products` row → product summary + tags + supplier
 *   - `product_translations` → localized name + description per locale
 *   - `product_itineraries` + `product_days` + translations → localized
 *     itinerary days + day service labels
 *   - `product_options` + `product_option_translations` → options +
 *     localized labels
 *   - `product_media` → hero + gallery
 */

import type { ContentLocaleMatchKind } from "@voyant-travel/catalog"
import { pickBestCachedLocale } from "@voyant-travel/catalog"
import type { AnyDrizzleDb } from "@voyant-travel/db"
import { and, asc, eq, inArray, sql } from "drizzle-orm"

import {
  type ProductContent,
  productContentSchema,
  validateProductContent,
} from "./content-shape.js"
import {
  productDayServices,
  productDayServiceTranslations,
  productDays,
  productDayTranslations,
  productItineraries,
  productMedia,
  productOptions,
  productOptionTranslations,
  products,
  productTranslations,
} from "./schema.js"

export interface BuildOwnedProductContentOptions {
  /**
   * Ordered locale preference chain — most-preferred first. Same shape
   * the catalog plane's `pickBestCachedLocale` consumes. Pass-through
   * from the caller's `BookingDraft.scope.locale` (storefront /
   * operator UI).
   */
  preferredLocales: ReadonlyArray<string>
}

export interface BuildOwnedProductContentResult {
  /** The owned product projected to ProductContent. */
  content: ProductContent
  /**
   * The locale we actually served — may differ from
   * `preferredLocales[0]` when a fallback was used. Per-product;
   * options that fell back to a different locale don't override this
   * (storefront UI hints at the product level).
   */
  servedLocale: string
  /**
   * How well the served locale matched the chain. Surfaces in the UI
   * as a "served in English" hint when content was served in a
   * non-preferred language.
   */
  matchKind: ContentLocaleMatchKind
}

/**
 * Read the owned product + related rows and project to `ProductContent`,
 * resolving translations against the supplied locale-preference chain.
 * Returns null when the product doesn't exist.
 */
export async function buildOwnedProductContent(
  db: AnyDrizzleDb,
  entityId: string,
  options: BuildOwnedProductContentOptions,
): Promise<BuildOwnedProductContentResult | null> {
  // biome-ignore lint/suspicious/noExplicitAny: drizzle's generic returning Pg infers the row shape but the AnyDrizzleDb wrapper widens it -- owner: inventory; existing suppression is intentional pending typed cleanup.
  const productRow: any = (
    await db.select().from(products).where(eq(products.id, entityId)).limit(1)
  )[0]
  if (!productRow) return null

  const [optionRows, mediaRows, itineraryRows, productTrns] = await Promise.all([
    db
      .select()
      .from(productOptions)
      .where(eq(productOptions.productId, entityId))
      .orderBy(asc(productOptions.sortOrder)),
    db
      .select()
      .from(productMedia)
      .where(eq(productMedia.productId, entityId))
      .orderBy(asc(productMedia.sortOrder), asc(productMedia.createdAt)),
    db
      .select()
      .from(productItineraries)
      .where(eq(productItineraries.productId, entityId))
      .orderBy(asc(productItineraries.sortOrder)),
    db.select().from(productTranslations).where(eq(productTranslations.productId, entityId)),
  ])

  // biome-ignore lint/suspicious/noExplicitAny: drizzle row shape -- owner: inventory; existing suppression is intentional pending typed cleanup.
  const defaultItinerary: any =
    itineraryRows.find((it: { isDefault: boolean }) => it.isDefault) ?? itineraryRows[0]
  const days = defaultItinerary
    ? await db
        .select()
        .from(productDays)
        .where(and(eq(productDays.itineraryId, defaultItinerary.id)))
        .orderBy(asc(productDays.dayNumber))
    : []

  const dayIds = days.map((d: typeof productDays.$inferSelect) => d.id)
  const [dayTrns, dayServiceRows] =
    dayIds.length > 0
      ? await Promise.all([
          db
            .select()
            .from(productDayTranslations)
            .where(inArray(productDayTranslations.dayId, dayIds)),
          db
            .select()
            .from(productDayServices)
            .where(inArray(productDayServices.dayId, dayIds))
            .orderBy(asc(productDayServices.dayId), asc(productDayServices.sortOrder)),
        ])
      : [[], []]

  const dayServiceIds = dayServiceRows.map((s: typeof productDayServices.$inferSelect) => s.id)
  const dayServiceTrns =
    dayServiceIds.length > 0
      ? await db
          .select()
          .from(productDayServiceTranslations)
          .where(inArray(productDayServiceTranslations.serviceId, dayServiceIds))
      : []

  const dayTranslationsByDay = groupBy(dayTrns, (row) => row.dayId)
  const dayServicesByDay = groupBy(dayServiceRows, (row) => row.dayId)
  const serviceTranslationsByService = groupBy(dayServiceTrns, (row) => row.serviceId)

  // Pull option translations in one round-trip for every option in this
  // product. Fan-out per-option would be wasteful when products
  // typically have a small number of options.
  const optionIds = optionRows.map((o: typeof productOptions.$inferSelect) => o.id)
  const optionTrns =
    optionIds.length > 0
      ? await db
          .select()
          .from(productOptionTranslations)
          .where(inArray(productOptionTranslations.optionId, optionIds))
      : []

  // Pick the best product-level translation. Falls through to the
  // source row's name/description when no translation row matches —
  // pickBestCachedLocale returns the closest available, so the
  // server-locale chip reflects what the user actually sees.
  const bestProductTrn = pickBestProductTranslation(productTrns, options.preferredLocales)
  const productServedLocale = bestProductTrn?.served_locale ?? sourceLocaleFor(productRow)
  const productMatchKind: ContentLocaleMatchKind = bestProductTrn?.match_kind ?? "any"

  const productImages = mediaRows.filter(
    (m: typeof productMedia.$inferSelect) =>
      m.dayId === null && m.mediaType === "image" && !m.isBrochure,
  )
  const cover: typeof productMedia.$inferSelect | undefined =
    productImages.find((m: typeof productMedia.$inferSelect) => m.isCover) ??
    productImages[0] ??
    undefined
  const openGraphImage =
    productImages.find((m: typeof productMedia.$inferSelect) => m.isOpenGraph) ?? cover

  const localizedName = bestProductTrn?.candidate.name ?? productRow.name
  const localizedDescription =
    bestProductTrn?.candidate.shortDescription ??
    bestProductTrn?.candidate.description ??
    productRow.description ??
    null
  const localizedInclusions =
    bestProductTrn?.candidate.inclusionsHtml ?? productRow.inclusionsHtml ?? null
  const localizedExclusions =
    bestProductTrn?.candidate.exclusionsHtml ?? productRow.exclusionsHtml ?? null
  const localizedTerms = bestProductTrn?.candidate.termsHtml ?? productRow.termsHtml ?? null
  const localizedSeoTitle = bestProductTrn?.candidate.seoTitle ?? localizedName
  const localizedSeoDescription =
    bestProductTrn?.candidate.seoDescription ??
    localizedDescription ??
    productRow.description ??
    null

  const content: ProductContent = productContentSchema.parse({
    product: {
      id: productRow.id,
      name: localizedName,
      status: productRow.status,
      description: localizedDescription,
      seo_title: localizedSeoTitle,
      seo_description: localizedSeoDescription,
      open_graph_image_url: openGraphImage?.url ?? null,
      open_graph_image_width: openGraphImage?.width ?? null,
      open_graph_image_height: openGraphImage?.height ?? null,
      open_graph_image_type: openGraphImage?.mimeType ?? null,
      open_graph_image_alt: openGraphImage?.altText ?? localizedName,
      inclusions_html: localizedInclusions,
      exclusions_html: localizedExclusions,
      terms_html: localizedTerms,
      contract_template_id: productRow.contractTemplateId ?? null,
      contractTemplateId: productRow.contractTemplateId ?? null,
      hero_image_url: cover?.url ?? null,
      duration_days: estimateDurationDays(days, productRow),
      start_date: dateToIso(productRow.startDate),
      end_date: dateToIso(productRow.endDate),
      sell_currency: productRow.sellCurrency,
      supplier: productRow.supplierId ?? null,
      tags: Array.isArray(productRow.tags) ? productRow.tags : [],
    },
    options: optionRows.map((opt: typeof productOptions.$inferSelect) => {
      const trnsForOption = optionTrns.filter(
        (t: typeof productOptionTranslations.$inferSelect) => t.optionId === opt.id,
      )
      const bestOptionTrn = pickBestOptionTranslation(trnsForOption, options.preferredLocales)
      return {
        id: opt.id,
        name: bestOptionTrn?.candidate.name ?? opt.name,
        description:
          bestOptionTrn?.candidate.shortDescription ??
          bestOptionTrn?.candidate.description ??
          opt.description ??
          null,
        units: [],
        inclusions: [],
      }
    }),
    days: days.map((d: typeof productDays.$inferSelect) => {
      const bestDayTrn = pickBestDayTranslation(
        dayTranslationsByDay.get(d.id) ?? [],
        options.preferredLocales,
        d,
        productRow.defaultLanguageTag,
      )
      const services = (dayServicesByDay.get(d.id) ?? []).map(
        (service: typeof productDayServices.$inferSelect) => {
          const bestServiceTrn = pickBestDayServiceTranslation(
            serviceTranslationsByService.get(service.id) ?? [],
            options.preferredLocales,
          )
          return bestServiceTrn?.candidate.name ?? service.name
        },
      )

      return {
        id: d.id,
        day_number: d.dayNumber,
        title: bestDayTrn?.candidate.title ?? d.title ?? null,
        description: bestDayTrn?.candidate.description ?? d.description ?? null,
        location: bestDayTrn?.candidate.location ?? d.location ?? null,
        // Per-day hero — prefer the cover, fall back to the first sorted
        // image attached to this day in `product_media`.
        hero_image_url: pickDayHeroImage(mediaRows, d.id),
        services,
      }
    }),
    media: mediaRows
      .filter((m: typeof productMedia.$inferSelect) => !m.isBrochure)
      .map((m: typeof productMedia.$inferSelect) => ({
        url: m.url,
        type: mediaType(m.mediaType),
        caption: m.altText ?? null,
        alt: m.altText ?? null,
      })),
    policies: [],
    // Owned products derive departures from `availability_slots`. Pull
    // future-or-current slots only so the catalog sheet doesn't drown
    // operators in expired departures; ordering is chronological so the
    // UI can group consecutive months without sorting client-side.
    departures: await readOwnedProductDepartures(db, entityId, productRow.sellCurrency),
  })

  const validation = validateProductContent(content)
  if (!validation.valid) {
    throw new Error(`owned product ${entityId} projection failed validation: ${validation.reason}`)
  }
  return {
    content,
    servedLocale: productServedLocale,
    matchKind: productMatchKind,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Locale resolution — productTranslations / productOptionTranslations
// ─────────────────────────────────────────────────────────────────────────────

interface ProductTrnCandidate {
  /** Renamed from `languageTag` so `pickBestCachedLocale` can score it. */
  locale: string
  name: string
  shortDescription: string | null
  description: string | null
  inclusionsHtml: string | null
  exclusionsHtml: string | null
  termsHtml: string | null
  seoTitle: string | null
  seoDescription: string | null
}

interface DayTrnCandidate {
  locale: string
  title: string | null
  description: string | null
  location: string | null
}

interface DayServiceTrnCandidate {
  locale: string
  name: string
  description: string | null
  notes: string | null
}

/**
 * Pick the best image to surface on an itinerary day card. Filters
 * media rows to entries with a matching `dayId`, ignores brochures and
 * non-images, then prefers `isCover === true` before falling back to
 * the first sorted entry. `media-rows` is the same list the parent
 * projection already pulled; no extra round-trip.
 */
function pickDayHeroImage(
  mediaRows: ReadonlyArray<typeof productMedia.$inferSelect>,
  dayId: string,
): string | null {
  const dayImages = mediaRows.filter(
    (m) => m.dayId === dayId && m.mediaType === "image" && !m.isBrochure,
  )
  if (dayImages.length === 0) return null
  const cover = dayImages.find((m) => m.isCover)
  return (cover ?? dayImages[0])?.url ?? null
}

/**
 * Map future availability_slots → ProductDeparture[]. Raw SQL keeps the
 * products module from depending on `@voyant-travel/operations` (cross-
 * module schema coupling is avoided per the workspace's separation).
 */
async function readOwnedProductDepartures(
  db: AnyDrizzleDb,
  productId: string,
  sellCurrency: string,
): Promise<ProductContent["departures"]> {
  try {
    const result = await db.execute(sql`
      SELECT
        id,
        starts_at,
        ends_at,
        status,
        initial_pax,
        remaining_pax
      FROM availability_slots
      WHERE product_id = ${productId}
        AND starts_at >= NOW()
      ORDER BY starts_at ASC
      LIMIT 365
    `)
    const rows = Array.isArray(result) ? result : ((result as { rows?: unknown[] }).rows ?? [])
    return rows
      .map((raw): ProductContent["departures"][number] | null => {
        const row = raw as Record<string, unknown>
        const id = typeof row.id === "string" ? row.id : null
        const startsAt = isoOrNull(row.starts_at)
        if (!id || !startsAt) return null
        const status = typeof row.status === "string" ? row.status : null
        const capacity = numberOrNull(row.initial_pax)
        const remaining = numberOrNull(row.remaining_pax)
        return {
          id,
          starts_at: startsAt,
          ends_at: isoOrNull(row.ends_at),
          status,
          capacity,
          remaining,
          // Lowest price hint is for display only; the live engine
          // resolves the actual quote. Fall back to the product's base
          // sell_amount via the content shape's parent currency.
          lowest_price_cents: null,
          currency: sellCurrency,
          note: null,
        }
      })
      .filter((row): row is NonNullable<typeof row> => row !== null)
  } catch {
    // availability_slots may be absent in trimmed test fixtures —
    // empty list is a safe default (matches "on-request" behavior).
    return []
  }
}

function isoOrNull(value: unknown): string | null {
  if (value instanceof Date) {
    const ms = value.getTime()
    return Number.isFinite(ms) ? value.toISOString() : null
  }
  if (typeof value === "string" && value.length > 0) {
    const d = new Date(value)
    return Number.isFinite(d.getTime()) ? d.toISOString() : null
  }
  return null
}

function numberOrNull(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (typeof value === "string") {
    const n = Number(value)
    return Number.isFinite(n) ? n : null
  }
  return null
}

function pickBestProductTranslation(
  rows: ReadonlyArray<typeof productTranslations.$inferSelect>,
  preferred: ReadonlyArray<string>,
) {
  if (rows.length === 0) return null
  const candidates: ProductTrnCandidate[] = rows.map((r) => ({
    locale: r.languageTag,
    name: r.name,
    shortDescription: r.shortDescription,
    description: r.description,
    inclusionsHtml: r.inclusionsHtml,
    exclusionsHtml: r.exclusionsHtml,
    termsHtml: r.termsHtml,
    seoTitle: r.seoTitle,
    seoDescription: r.seoDescription,
  }))
  return pickBestCachedLocale(candidates, preferred)
}

interface OptionTrnCandidate {
  locale: string
  name: string
  shortDescription: string | null
  description: string | null
}

function pickBestOptionTranslation(
  rows: ReadonlyArray<typeof productOptionTranslations.$inferSelect>,
  preferred: ReadonlyArray<string>,
) {
  if (rows.length === 0) return null
  const candidates: OptionTrnCandidate[] = rows.map((r) => ({
    locale: r.languageTag,
    name: r.name,
    shortDescription: r.shortDescription,
    description: r.description,
  }))
  return pickBestCachedLocale(candidates, preferred)
}

function pickBestDayTranslation(
  rows: ReadonlyArray<typeof productDayTranslations.$inferSelect>,
  preferred: ReadonlyArray<string>,
  base: Pick<typeof productDays.$inferSelect, "title" | "description" | "location">,
  defaultLanguageTag: string | null | undefined,
) {
  const normalizedDefaultLanguageTag = defaultLanguageTag?.trim().toLowerCase()
  const translations: DayTrnCandidate[] = rows
    // BCP-47 tags are case-insensitive. Drop every spelling of the declared
    // default locale so an exact-scored stale translation cannot outrank the
    // authoritative base candidate solely because its casing matches the
    // request more closely.
    .filter(
      (r) =>
        !normalizedDefaultLanguageTag ||
        r.languageTag.trim().toLowerCase() !== normalizedDefaultLanguageTag,
    )
    .map((r) => ({
      locale: r.languageTag,
      title: r.title,
      description: r.description,
      location: r.location,
    }))

  if (defaultLanguageTag) {
    // Base day columns are the source of truth for the product's declared
    // default language. Put that candidate first so a stale legacy
    // default-language translation row cannot shadow a successful base edit.
    return pickBestCachedLocale(
      [
        {
          locale: defaultLanguageTag,
          title: base.title,
          description: base.description,
          location: base.location,
        },
        ...translations,
      ],
      preferred,
    )
  }

  const resolved = pickBestCachedLocale(translations, preferred)
  // Older products may not declare their base language. In that case an
  // unrelated translation is not a safer fallback than the base columns.
  return resolved?.match_kind === "exact" || resolved?.match_kind === "language_match"
    ? resolved
    : null
}

function pickBestDayServiceTranslation(
  rows: ReadonlyArray<typeof productDayServiceTranslations.$inferSelect>,
  preferred: ReadonlyArray<string>,
) {
  if (rows.length === 0) return null
  const candidates: DayServiceTrnCandidate[] = rows.map((r) => ({
    locale: r.languageTag,
    name: r.name,
    description: r.description,
    notes: r.notes,
  }))
  return pickBestCachedLocale(candidates, preferred)
}

/**
 * When no translation rows exist for the product, the source row's
 * `name` + `description` are surfaced. We don't know what locale they
 * were authored in — operators tend to author in their default
 * deployment locale (commonly en-GB / en-US for UK / US deployments).
 * The caller's `defaultSourceLocale` would be a cleaner fix; for now
 * we report `und` (BCP 47 "undetermined") so the storefront chip
 * doesn't claim a specific locale we can't verify.
 */
function sourceLocaleFor(_productRow: { id: string }): string {
  return "und"
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function estimateDurationDays(
  days: Array<{ dayNumber: number }>,
  productRow: { startDate: string | null; endDate: string | null },
): number | null {
  if (days.length > 0) {
    const max = Math.max(...days.map((d) => d.dayNumber))
    return Number.isFinite(max) && max > 0 ? max : null
  }
  if (productRow.startDate && productRow.endDate) {
    const start = new Date(productRow.startDate)
    const end = new Date(productRow.endDate)
    if (!Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime())) {
      const diffMs = end.getTime() - start.getTime()
      const days = Math.round(diffMs / (24 * 60 * 60 * 1000))
      return days > 0 ? days : null
    }
  }
  return null
}

function dateToIso(value: string | Date | null | undefined): string | null {
  if (!value) return null
  if (typeof value === "string") return value
  return value.toISOString().slice(0, 10)
}

function mediaType(value: string): "image" | "video" | "document" {
  if (value === "video") return "video"
  if (value === "document") return "document"
  return "image"
}

function groupBy<T>(rows: ReadonlyArray<T>, keyFor: (row: T) => string): Map<string, T[]> {
  const grouped = new Map<string, T[]>()
  for (const row of rows) {
    const key = keyFor(row)
    const bucket = grouped.get(key)
    if (bucket) {
      bucket.push(row)
    } else {
      grouped.set(key, [row])
    }
  }
  return grouped
}
