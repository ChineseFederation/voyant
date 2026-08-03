import { and, asc, desc, eq, inArray } from "drizzle-orm"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"
import { applyOverviewEnrichers } from "./overview-enrichment.js"
import {
  departurePriceOverridesRef,
  optionPriceRulesRef,
  optionUnitPriceRulesRef,
  optionUnitTiersRef,
  priceCatalogsRef,
  pricingCategoriesRef,
} from "./pricing-ref.js"
import { optionUnitsRef, productOptionsRef, productsRef } from "./products-ref.js"
import type { BookingOverviewItemEnricher } from "./route-runtime.js"
import {
  bookingDocuments,
  bookingFulfillments,
  bookingItems,
  bookingItemTravelers,
  bookings,
  bookingTravelers,
} from "./schema.js"
import type {
  InternalBookingOverviewLookupQuery,
  PublicBookingOverviewAccessQuery,
  PublicBookingOverviewLookupQuery,
} from "./validation-public.js"

function normalizeDate(value: Date | string | null | undefined) {
  if (!value) return null
  return value instanceof Date ? value.toISOString().slice(0, 10) : value
}

function normalizeDateTime(value: Date | string | null | undefined) {
  if (!value) return null
  return value instanceof Date ? value.toISOString() : value
}

function constantTimeEqualString(left: string, right: string) {
  let result = left.length ^ right.length
  const length = Math.max(left.length, right.length)

  for (let index = 0; index < length; index += 1) {
    result |= (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0)
  }

  return result === 0
}

async function buildOverviewSnapshot(
  db: PostgresJsDatabase,
  query: {
    bookingId?: string | null
    bookingNumber?: string | null
    bookingCode?: string | null
    email?: string | null
  },
  enrichers?: Partial<Record<string, BookingOverviewItemEnricher>>,
) {
  const bookingLookupNumber = query.bookingNumber ?? query.bookingCode ?? null
  const [booking] = await db
    .select()
    .from(bookings)
    .where(
      query.bookingId
        ? eq(bookings.id, query.bookingId)
        : bookingLookupNumber
          ? eq(bookings.bookingNumber, bookingLookupNumber)
          : eq(bookings.id, "__missing__"),
    )
    .limit(1)

  if (!booking) return null

  const [participants, items, itemParticipantLinks, documents, fulfillments] = await Promise.all([
    db
      .select()
      .from(bookingTravelers)
      .where(eq(bookingTravelers.bookingId, booking.id))
      .orderBy(asc(bookingTravelers.createdAt)),
    db
      .select()
      .from(bookingItems)
      .where(eq(bookingItems.bookingId, booking.id))
      .orderBy(asc(bookingItems.createdAt)),
    db
      .select({
        id: bookingItemTravelers.id,
        bookingItemId: bookingItemTravelers.bookingItemId,
        travelerId: bookingItemTravelers.travelerId,
        role: bookingItemTravelers.role,
        isPrimary: bookingItemTravelers.isPrimary,
      })
      .from(bookingItemTravelers)
      .innerJoin(bookingItems, eq(bookingItems.id, bookingItemTravelers.bookingItemId))
      .where(eq(bookingItems.bookingId, booking.id))
      .orderBy(asc(bookingItemTravelers.createdAt)),
    db
      .select()
      .from(bookingDocuments)
      .where(eq(bookingDocuments.bookingId, booking.id))
      .orderBy(asc(bookingDocuments.createdAt)),
    db
      .select()
      .from(bookingFulfillments)
      .where(eq(bookingFulfillments.bookingId, booking.id))
      .orderBy(asc(bookingFulfillments.createdAt)),
  ])

  const email = query.email?.trim().toLowerCase() ?? null
  if (
    email &&
    !participants.some((participant) =>
      constantTimeEqualString(participant.email?.trim().toLowerCase() ?? "", email),
    )
  ) {
    return null
  }

  const itemLinksByItemId = new Map<
    string,
    Array<{
      id: string
      travelerId: string
      role: (typeof bookingItemTravelers.$inferSelect)["role"]
      isPrimary: boolean
    }>
  >()

  for (const link of itemParticipantLinks) {
    const existing = itemLinksByItemId.get(link.bookingItemId) ?? []
    existing.push({
      id: link.id,
      travelerId: link.travelerId,
      role: link.role,
      isPrimary: link.isPrimary,
    })
    itemLinksByItemId.set(link.bookingItemId, existing)
  }

  const overviewItems = items.map((item) => ({
    id: item.id,
    title: item.title,
    description: item.description ?? null,
    itemType: item.itemType,
    status: item.status,
    serviceDate: normalizeDate(item.serviceDate),
    startsAt: normalizeDateTime(item.startsAt),
    endsAt: normalizeDateTime(item.endsAt),
    quantity: item.quantity,
    sellCurrency: item.sellCurrency,
    unitSellAmountCents: item.unitSellAmountCents ?? null,
    totalSellAmountCents: item.totalSellAmountCents ?? null,
    costCurrency: item.costCurrency ?? null,
    unitCostAmountCents: item.unitCostAmountCents ?? null,
    totalCostAmountCents: item.totalCostAmountCents ?? null,
    notes: item.notes ?? null,
    productId: item.productId ?? null,
    optionId: item.optionId ?? null,
    optionUnitId: item.optionUnitId ?? null,
    pricingCategoryId: item.pricingCategoryId ?? null,
    travelerLinks: itemLinksByItemId.get(item.id) ?? [],
  }))

  const enrichedItems = await applyOverviewEnrichers(db, overviewItems, enrichers)

  return {
    bookingId: booking.id,
    bookingNumber: booking.bookingNumber,
    revision: booking.revision,
    status: booking.status,
    sellCurrency: booking.sellCurrency,
    sellAmountCents: booking.sellAmountCents ?? null,
    startDate: normalizeDate(booking.startDate),
    endDate: normalizeDate(booking.endDate),
    pax: booking.pax ?? null,
    confirmedAt: normalizeDateTime(booking.confirmedAt),
    cancelledAt: normalizeDateTime(booking.cancelledAt),
    completedAt: normalizeDateTime(booking.completedAt),
    travelers: participants.map((participant) => ({
      id: participant.id,
      participantType: participant.participantType,
      firstName: participant.firstName,
      lastName: participant.lastName,
      isPrimary: participant.isPrimary,
    })),
    items: enrichedItems,
    documents: documents.map((document) => ({
      id: document.id,
      travelerId: document.travelerId ?? null,
      type: document.type,
      fileName: document.fileName,
      fileUrl: document.fileUrl,
    })),
    fulfillments: fulfillments.map((fulfillment) => ({
      id: fulfillment.id,
      bookingItemId: fulfillment.bookingItemId ?? null,
      travelerId: fulfillment.travelerId ?? null,
      fulfillmentType: fulfillment.fulfillmentType,
      deliveryChannel: fulfillment.deliveryChannel,
      status: fulfillment.status,
      artifactUrl: fulfillment.artifactUrl ?? null,
    })),
  }
}

/** Resolve the catalog pricing snapshot used by the operator preview. */
export async function resolveSessionPricingSnapshot(
  db: PostgresJsDatabase,
  productId: string,
  input: {
    catalogId?: string
    departureId?: string
    optionId?: string
    requirePublicProduct?: boolean
  },
) {
  const productConditions = [eq(productsRef.id, productId), eq(productsRef.status, "active")]
  if (input.requirePublicProduct ?? true) {
    productConditions.push(eq(productsRef.activated, true), eq(productsRef.visibility, "public"))
  }

  const [product] = await db
    .select({ id: productsRef.id })
    .from(productsRef)
    .where(and(...productConditions))
    .limit(1)
  if (!product) return null

  const catalog = input.catalogId
    ? await db
        .select({ id: priceCatalogsRef.id, currencyCode: priceCatalogsRef.currencyCode })
        .from(priceCatalogsRef)
        .where(
          and(
            eq(priceCatalogsRef.id, input.catalogId),
            eq(priceCatalogsRef.catalogType, "public"),
            eq(priceCatalogsRef.active, true),
          ),
        )
        .limit(1)
        .then((rows) => rows[0] ?? null)
    : await db
        .select({ id: priceCatalogsRef.id, currencyCode: priceCatalogsRef.currencyCode })
        .from(priceCatalogsRef)
        .where(and(eq(priceCatalogsRef.catalogType, "public"), eq(priceCatalogsRef.active, true)))
        .orderBy(desc(priceCatalogsRef.isDefault), asc(priceCatalogsRef.name))
        .limit(1)
        .then((rows) => rows[0] ?? null)
  if (!catalog) return null

  const optionConditions = [
    eq(productOptionsRef.productId, productId),
    eq(productOptionsRef.status, "active"),
  ]
  if (input.optionId) optionConditions.push(eq(productOptionsRef.id, input.optionId))

  const options = await db
    .select({
      id: productOptionsRef.id,
      name: productOptionsRef.name,
      isDefault: productOptionsRef.isDefault,
    })
    .from(productOptionsRef)
    .where(and(...optionConditions))
    .orderBy(desc(productOptionsRef.isDefault), asc(productOptionsRef.sortOrder))
  if (options.length === 0) return null

  const optionIds = options.map((option) => option.id)
  const [rules, unitPrices] = await Promise.all([
    db
      .select({
        id: optionPriceRulesRef.id,
        optionId: optionPriceRulesRef.optionId,
        pricingMode: optionPriceRulesRef.pricingMode,
        baseSellAmountCents: optionPriceRulesRef.baseSellAmountCents,
        isDefault: optionPriceRulesRef.isDefault,
      })
      .from(optionPriceRulesRef)
      .where(
        and(
          eq(optionPriceRulesRef.productId, productId),
          inArray(optionPriceRulesRef.optionId, optionIds),
          eq(optionPriceRulesRef.priceCatalogId, catalog.id),
          eq(optionPriceRulesRef.active, true),
        ),
      )
      .orderBy(desc(optionPriceRulesRef.isDefault), asc(optionPriceRulesRef.name)),
    db
      .select({
        id: optionUnitPriceRulesRef.id,
        optionPriceRuleId: optionUnitPriceRulesRef.optionPriceRuleId,
        optionId: optionUnitPriceRulesRef.optionId,
        unitId: optionUnitPriceRulesRef.unitId,
        unitName: optionUnitsRef.name,
        unitType: optionUnitsRef.unitType,
        occupancyMax: optionUnitsRef.occupancyMax,
        pricingCategoryId: optionUnitPriceRulesRef.pricingCategoryId,
        pricingMode: optionUnitPriceRulesRef.pricingMode,
        sellAmountCents: optionUnitPriceRulesRef.sellAmountCents,
        minQuantity: optionUnitPriceRulesRef.minQuantity,
        maxQuantity: optionUnitPriceRulesRef.maxQuantity,
      })
      .from(optionUnitPriceRulesRef)
      .innerJoin(optionUnitsRef, eq(optionUnitsRef.id, optionUnitPriceRulesRef.unitId))
      .where(
        and(
          inArray(optionUnitPriceRulesRef.optionId, optionIds),
          eq(optionUnitPriceRulesRef.active, true),
        ),
      )
      .orderBy(asc(optionUnitPriceRulesRef.sortOrder), asc(optionUnitPriceRulesRef.createdAt)),
  ])

  const pricingCategoryIds = Array.from(
    new Set(unitPrices.flatMap((row) => (row.pricingCategoryId ? [row.pricingCategoryId] : []))),
  )
  const [tiers, departureOverrides, pricingCategories] = await Promise.all([
    unitPrices.length > 0
      ? db
          .select({
            id: optionUnitTiersRef.id,
            optionUnitPriceRuleId: optionUnitTiersRef.optionUnitPriceRuleId,
            minQuantity: optionUnitTiersRef.minQuantity,
            maxQuantity: optionUnitTiersRef.maxQuantity,
            sellAmountCents: optionUnitTiersRef.sellAmountCents,
            sortOrder: optionUnitTiersRef.sortOrder,
          })
          .from(optionUnitTiersRef)
          .where(
            and(
              inArray(
                optionUnitTiersRef.optionUnitPriceRuleId,
                unitPrices.map((row) => row.id),
              ),
              eq(optionUnitTiersRef.active, true),
            ),
          )
          .orderBy(asc(optionUnitTiersRef.sortOrder), asc(optionUnitTiersRef.minQuantity))
      : Promise.resolve([]),
    input.departureId
      ? db
          .select({
            optionUnitId: departurePriceOverridesRef.optionUnitId,
            sellAmountCents: departurePriceOverridesRef.sellAmountCents,
          })
          .from(departurePriceOverridesRef)
          .where(
            and(
              eq(departurePriceOverridesRef.departureId, input.departureId),
              eq(departurePriceOverridesRef.priceCatalogId, catalog.id),
              eq(departurePriceOverridesRef.active, true),
            ),
          )
      : Promise.resolve([]),
    pricingCategoryIds.length > 0
      ? db
          .select({
            id: pricingCategoriesRef.id,
            name: pricingCategoriesRef.name,
            code: pricingCategoriesRef.code,
            categoryType: pricingCategoriesRef.categoryType,
            minAge: pricingCategoriesRef.minAge,
            maxAge: pricingCategoriesRef.maxAge,
            metadata: pricingCategoriesRef.metadata,
            sortOrder: pricingCategoriesRef.sortOrder,
          })
          .from(pricingCategoriesRef)
          .where(
            and(
              inArray(pricingCategoriesRef.id, pricingCategoryIds),
              eq(pricingCategoriesRef.active, true),
            ),
          )
          .orderBy(asc(pricingCategoriesRef.sortOrder), asc(pricingCategoriesRef.name))
      : Promise.resolve([]),
  ])

  const tiersByUnitPriceId = new Map<string, typeof tiers>()
  for (const tier of tiers) {
    const existing = tiersByUnitPriceId.get(tier.optionUnitPriceRuleId) ?? []
    existing.push(tier)
    tiersByUnitPriceId.set(tier.optionUnitPriceRuleId, existing)
  }
  const departureOverrideByUnitId = new Map(
    departureOverrides.map((row) => [row.optionUnitId, row] as const),
  )

  return {
    catalog,
    options,
    rules,
    pricingCategories,
    unitPrices: unitPrices.map((row) => {
      const override = departureOverrideByUnitId.get(row.unitId)
      return {
        ...row,
        sellAmountCents: override?.sellAmountCents ?? row.sellAmountCents,
        tiers: override ? [] : (tiersByUnitPriceId.get(row.id) ?? []),
      }
    }),
  }
}

export const publicBookingsService = {
  getOverview(
    db: PostgresJsDatabase,
    query: PublicBookingOverviewLookupQuery,
    enrichers?: Partial<Record<string, BookingOverviewItemEnricher>>,
  ) {
    return buildOverviewSnapshot(db, query, enrichers)
  },

  getOverviewByGuestAccess(
    db: PostgresJsDatabase,
    query: PublicBookingOverviewAccessQuery,
    enrichers?: Partial<Record<string, BookingOverviewItemEnricher>>,
  ) {
    return buildOverviewSnapshot(db, query, enrichers)
  },

  getOverviewByLookup(
    db: PostgresJsDatabase,
    query: InternalBookingOverviewLookupQuery,
    enrichers?: Partial<Record<string, BookingOverviewItemEnricher>>,
  ) {
    return buildOverviewSnapshot(db, query, enrichers)
  },
}
