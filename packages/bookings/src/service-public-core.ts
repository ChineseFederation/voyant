// agent-quality: file-size exception -- owner: bookings; existing service module stays co-located until a dedicated split preserves behavior and tests.
import { and, asc, desc, eq, inArray, or } from "drizzle-orm"
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
import type {
  BookingOverviewItemEnricher,
  BookingPersonResolverContact,
  ResolveBookingBillingPerson,
  ResolveBookingTravelerPerson,
} from "./route-runtime.js"
import {
  bookingAllocations,
  bookingDocuments,
  bookingFulfillments,
  bookingItems,
  bookingItemTravelers,
  bookingSessionStates,
  bookings,
  bookingTravelers,
} from "./schema.js"
import { type BookingServiceRuntime, bookingsService } from "./service.js"
import type {
  InternalBookingOverviewLookupQuery,
  PublicBookingOverviewAccessQuery,
  PublicBookingOverviewLookupQuery,
  PublicBookingSessionMutationInput,
  PublicBookingSessionRepriceInput,
  PublicBookingSessionState,
  PublicUpdateBookingSessionInput,
  PublicUpsertBookingSessionStateInput,
} from "./validation-public.js"
import { publicBookingSessionTravelerInputSchema } from "./validation-public.js"

/**
 * Optional resolver bundle for storefront/public booking flows. When
 * supplied, billing-contact + traveler payloads are run through the
 * caller's resolver to look up (or create) the matching CRM person
 * and the booking / traveler rows pick up the resulting `person_id`.
 * Default (omitted) behaviour is the historic one: rows land with
 * `person_id = NULL`. See issue #961.
 */
export interface PublicBookingsServiceResolvers {
  resolveBillingPerson?: ResolveBookingBillingPerson
  resolveTravelerPerson?: ResolveBookingTravelerPerson
}

const BOOKING_PERSON_SOURCE = "storefront-booking" as const

async function safeResolveTravelerPerson(
  db: PostgresJsDatabase,
  resolver: ResolveBookingTravelerPerson | undefined,
  participant: {
    firstName: string
    lastName: string
    email: string | null
    phone: string | null
    preferredLanguage: string | null
  },
  bookingId: string,
): Promise<string | null> {
  if (!resolver) return null
  const contact: BookingPersonResolverContact = {
    firstName: participant.firstName,
    lastName: participant.lastName,
    email: participant.email,
    phone: participant.phone,
    preferredLanguage: participant.preferredLanguage,
  }
  try {
    return await resolver(db, contact, {
      bookingId,
      source: BOOKING_PERSON_SOURCE,
      sourceRef: bookingId,
    })
  } catch (error) {
    // Person resolution is best-effort — a CRM hiccup must not block
    // the actual booking. Log and fall back to `null` so the traveler
    // row still lands without a person link.
    console.error("[bookings] resolveTravelerPerson failed for booking", bookingId, error)
    return null
  }
}

const travelerParticipantTypeValues = ["traveler", "occupant"] as const
const travelerParticipantTypes = new Set<string>(travelerParticipantTypeValues)
const WIZARD_STATE_KEY = "wizard" as const

type PublicBookingSessionTravelerInput = NonNullable<
  PublicUpdateBookingSessionInput["travelers"]
>[number]

type SessionPricingCatalog = {
  id: string
  currencyCode: string | null
}

type SessionPricingOption = {
  id: string
  name: string
  isDefault: boolean
}

type SessionPricingRule = {
  id: string
  optionId: string
  pricingMode: string
  baseSellAmountCents: number | null
  isDefault: boolean
}

type SessionPricingUnitPrice = {
  id: string
  optionPriceRuleId: string
  optionId: string
  unitId: string
  unitName: string | null
  unitType: string | null
  occupancyMax: number | null
  pricingCategoryId: string | null
  pricingMode: string
  sellAmountCents: number | null
  minQuantity: number | null
  maxQuantity: number | null
}

type SessionPricingCategory = {
  id: string
  name: string
  code: string | null
  categoryType: string
  minAge: number | null
  maxAge: number | null
  metadata: Record<string, unknown> | null
  sortOrder: number
}

function normalizeDate(value: Date | string | null | undefined) {
  if (!value) {
    return null
  }

  if (value instanceof Date) {
    return value.toISOString().slice(0, 10)
  }

  return value
}

function normalizeDateTime(value: Date | string | null | undefined) {
  if (!value) {
    return null
  }

  return value instanceof Date ? value.toISOString() : value
}

function getRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function getNestedRecord(record: Record<string, unknown> | null, keys: string[]) {
  for (const key of keys) {
    const value = getRecord(record?.[key])
    if (value) {
      return value
    }
  }

  return null
}

function getRecordString(record: Record<string, unknown> | null, keys: string[]) {
  for (const key of keys) {
    const value = record?.[key]
    if (typeof value === "string" && value.length > 0) {
      return value
    }
  }

  return null
}

function getBillingPartyType(
  record: Record<string, unknown> | null,
): "individual" | "company" | null {
  const value = getRecordString(record, ["partyType", "type"])
  return value === "individual" || value === "company" ? value : null
}

function getArray(value: unknown) {
  return Array.isArray(value) ? value : null
}

function extractBookingContactFromStatePayload(
  payload: Record<string, unknown> | null | undefined,
) {
  const root = getRecord(payload)
  const stepData = getNestedRecord(root, ["stepData", "steps"])
  const billingRecord =
    getNestedRecord(root, ["billing", "billingContact", "contact"]) ??
    getNestedRecord(stepData, ["billing", "billingContact", "contact"])
  const billing = getNestedRecord(billingRecord, ["billing", "contact"]) ?? billingRecord

  if (!billing) {
    return null
  }

  return {
    contactFirstName: getRecordString(billing, ["firstName"]),
    contactLastName: getRecordString(billing, ["lastName"]),
    contactPartyType: getBillingPartyType(billing),
    contactTaxId: getRecordString(billing, ["taxId", "vatNumber", "vatId"]),
    contactEmail: getRecordString(billing, ["email"]),
    contactPhone: getRecordString(billing, ["phone"]),
    contactCountry: getRecordString(billing, ["country"]),
    contactRegion: getRecordString(billing, ["state", "region"]),
    contactCity: getRecordString(billing, ["city"]),
    contactAddressLine1: getRecordString(billing, ["addressLine1", "address1", "line1"]),
    contactAddressLine2: getRecordString(billing, ["addressLine2", "address2", "line2"]),
    contactPostalCode: getRecordString(billing, ["postalCode", "postal", "zip"]),
  }
}

function extractBookingTravelersFromStatePayload(
  payload: Record<string, unknown> | null | undefined,
): PublicBookingSessionTravelerInput[] | null {
  const root = getRecord(payload)
  const stepData = getNestedRecord(root, ["stepData", "steps"])
  const travelersRecord =
    getNestedRecord(root, ["travelers"]) ?? getNestedRecord(stepData, ["travelers"])
  const travelers =
    getArray(travelersRecord?.travelers) ??
    getArray(root?.travelers) ??
    getArray(stepData?.travelers)

  if (!travelers) {
    return null
  }

  const parsed = publicBookingSessionTravelerInputSchema.array().safeParse(travelers)
  return parsed.success ? parsed.data : null
}

function countTravelerParticipants(participants: Array<{ participantType: string }>) {
  return participants.filter((participant) =>
    travelerParticipantTypes.has(participant.participantType),
  ).length
}

async function resolveTravelerPersonForParticipant(
  db: PostgresJsDatabase,
  resolver: ResolveBookingTravelerPerson | undefined,
  participant: PublicBookingSessionTravelerInput,
  bookingId: string,
  existingPersonId?: string | null,
) {
  if (existingPersonId) {
    return existingPersonId
  }

  return safeResolveTravelerPerson(
    db,
    resolver,
    {
      firstName: participant.firstName,
      lastName: participant.lastName,
      email: participant.email ?? null,
      phone: participant.phone ?? null,
      preferredLanguage: participant.preferredLanguage ?? null,
    },
    bookingId,
  )
}

async function syncTravelerRowsFromStatePayload(
  db: PostgresJsDatabase,
  bookingId: string,
  payload: Record<string, unknown>,
  resolvers: PublicBookingsServiceResolvers,
  userId?: string,
) {
  const travelers = extractBookingTravelersFromStatePayload(payload)
  if (!travelers) {
    return
  }

  const existingTravelers = await db
    .select()
    .from(bookingTravelers)
    .where(
      and(
        eq(bookingTravelers.bookingId, bookingId),
        inArray(bookingTravelers.participantType, [...travelerParticipantTypeValues]),
      ),
    )
    .orderBy(asc(bookingTravelers.createdAt))

  const existingById = new Map(existingTravelers.map((traveler) => [traveler.id, traveler]))
  const usedExistingIds = new Set<string>()

  for (const participant of travelers) {
    const matchingExisting =
      (participant.id ? existingById.get(participant.id) : undefined) ??
      (participant.id
        ? undefined
        : existingTravelers.find((traveler) => !usedExistingIds.has(traveler.id)))
    const hasStableContactPoint = Boolean(participant.email?.trim() || participant.phone?.trim())
    const reusablePersonId =
      participant.id || !hasStableContactPoint ? (matchingExisting?.personId ?? null) : null
    const personId = await resolveTravelerPersonForParticipant(
      db,
      resolvers.resolveTravelerPerson,
      participant,
      bookingId,
      reusablePersonId,
    )
    const travelerRecord = {
      participantType: participant.participantType,
      travelerCategory: participant.travelerCategory ?? null,
      firstName: participant.firstName,
      lastName: participant.lastName,
      email: participant.email ?? null,
      phone: participant.phone ?? null,
      preferredLanguage: participant.preferredLanguage ?? null,
      specialRequests: participant.specialRequests ?? null,
      isPrimary: participant.isPrimary,
      notes: participant.notes ?? null,
      personId,
    }

    if (matchingExisting) {
      await bookingsService.updateTravelerRecord(db, matchingExisting.id, travelerRecord)
      usedExistingIds.add(matchingExisting.id)
      continue
    }

    const created = await bookingsService.createTravelerRecord(
      db,
      bookingId,
      travelerRecord,
      userId,
    )
    if (created) {
      usedExistingIds.add(created.id)
    }
  }

  for (const existing of existingTravelers) {
    if (!usedExistingIds.has(existing.id)) {
      await bookingsService.deleteTravelerRecord(db, existing.id)
    }
  }

  const travelerCount = countTravelerParticipants(travelers)
  await bookingsService.updateBooking(db, bookingId, {
    pax: travelerCount > 0 ? travelerCount : null,
  })
}

function normalizeSessionState(
  bookingId: string,
  state:
    | {
        stateKey: string
        currentStep: string | null
        completedSteps: string[] | null
        payload: Record<string, unknown> | null
        version: number
        createdAt: Date | string
        updatedAt: Date | string
      }
    | null
    | undefined,
): PublicBookingSessionState | null {
  if (!state) {
    return null
  }

  return {
    sessionId: bookingId,
    stateKey: WIZARD_STATE_KEY,
    currentStep: state.currentStep ?? null,
    completedSteps: state.completedSteps ?? [],
    payload: state.payload ?? {},
    version: state.version,
    createdAt: normalizeDateTime(state.createdAt)!,
    updatedAt: normalizeDateTime(state.updatedAt)!,
  }
}

async function getWizardSessionState(db: PostgresJsDatabase, bookingId: string) {
  const [state] = await db
    .select()
    .from(bookingSessionStates)
    .where(
      and(
        eq(bookingSessionStates.bookingId, bookingId),
        eq(bookingSessionStates.stateKey, WIZARD_STATE_KEY),
      ),
    )
    .limit(1)

  return normalizeSessionState(bookingId, state)
}

async function upsertWizardSessionState(
  db: PostgresJsDatabase,
  bookingId: string,
  input: PublicUpsertBookingSessionStateInput,
) {
  const [existing] = await db
    .select()
    .from(bookingSessionStates)
    .where(
      and(
        eq(bookingSessionStates.bookingId, bookingId),
        eq(bookingSessionStates.stateKey, WIZARD_STATE_KEY),
      ),
    )
    .limit(1)

  const payload = input.replacePayload
    ? input.payload
    : {
        ...(existing?.payload ?? {}),
        ...input.payload,
      }

  const completedSteps = input.completedSteps ?? existing?.completedSteps ?? []
  const currentStep =
    input.currentStep === undefined ? (existing?.currentStep ?? null) : (input.currentStep ?? null)

  if (existing) {
    const [updated] = await db
      .update(bookingSessionStates)
      .set({
        currentStep,
        completedSteps,
        payload,
        version: existing.version + 1,
        updatedAt: new Date(),
      })
      .where(eq(bookingSessionStates.id, existing.id))
      .returning()

    return normalizeSessionState(bookingId, updated ?? existing)
  }

  const [created] = await db
    .insert(bookingSessionStates)
    .values({
      bookingId,
      stateKey: WIZARD_STATE_KEY,
      currentStep,
      completedSteps,
      payload,
      version: 1,
    })
    .returning()

  return normalizeSessionState(bookingId, created)
}

function resolveTierAmount(
  tiers: Array<{
    minQuantity: number
    maxQuantity: number | null
    sellAmountCents: number | null
  }>,
  quantity: number,
  fallbackAmount: number | null,
) {
  const tier = tiers.find(
    (candidate) =>
      quantity >= candidate.minQuantity &&
      (candidate.maxQuantity === null || quantity <= candidate.maxQuantity),
  )

  return tier?.sellAmountCents ?? fallbackAmount
}

function computeLineTotal(
  pricingMode: string,
  unitSellAmountCents: number | null,
  quantity: number,
  fallbackAmount: number | null,
) {
  switch (pricingMode) {
    case "free":
    case "included":
      return 0
    case "on_request":
      return null
    case "per_unit":
    case "per_person":
      return unitSellAmountCents === null ? null : unitSellAmountCents * quantity
    default:
      return unitSellAmountCents ?? fallbackAmount
  }
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

  if (!booking) {
    return null
  }

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
  if (email) {
    const authorized = participants.some((participant) =>
      constantTimeEqualString(participant.email?.trim().toLowerCase() ?? "", email),
    )
    if (!authorized) {
      return null
    }
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

function constantTimeEqualString(left: string, right: string) {
  let result = left.length ^ right.length
  const length = Math.max(left.length, right.length)

  for (let index = 0; index < length; index += 1) {
    result |= (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0)
  }

  return result === 0
}

function buildUnitWarnings(
  unit:
    | {
        name: string
        unitType: string | null
        minQuantity: number | null
        maxQuantity: number | null
        occupancyMin: number | null
        occupancyMax: number | null
      }
    | null
    | undefined,
  quantity: number,
  sessionPax: number | null,
) {
  const warnings: string[] = []

  if (!unit) {
    return warnings
  }

  if (unit.minQuantity !== null && quantity < unit.minQuantity) {
    warnings.push(`Selected quantity is below the minimum for ${unit.name}.`)
  }

  if (unit.maxQuantity !== null && quantity > unit.maxQuantity) {
    warnings.push(`Selected quantity is above the maximum for ${unit.name}.`)
  }

  if (sessionPax && unit.occupancyMin !== null && quantity * unit.occupancyMin > sessionPax) {
    warnings.push(`Selected ${unit.name} quantity exceeds the current traveler count.`)
  }

  if (sessionPax && unit.occupancyMax !== null && quantity * unit.occupancyMax < sessionPax) {
    warnings.push(`Selected ${unit.name} quantity does not cover the current traveler count.`)
  }

  return warnings
}

/**
 * Resolves the catalog-scoped pricing snapshot for a product (options → option
 * price rules → per-unit price rules → tiers). The snapshot is the same data
 * the storefront booking session uses to compute a total — exposing it as a
 * standalone admin preview lets operator dialogs, tour-sheet exports, and
 * reconciliation flows see the same numbers the customer would see, without
 * creating a throwaway session.
 *
 * Returns `null` when the product isn't publicly visible or there's no active
 * catalog / matching option (caller can decide whether to 404 or surface a
 * "pricing unavailable for this selection" message).
 */
export async function resolveSessionPricingSnapshot(
  db: PostgresJsDatabase,
  productId: string,
  input: {
    catalogId?: string | undefined
    departureId?: string | undefined
    optionId?: string | undefined
    /** Public/session flows require storefront-visible products. Admin previews can price active internal products. */
    requirePublicProduct?: boolean | undefined
  },
) {
  const productConditions = [eq(productsRef.id, productId), eq(productsRef.status, "active")]
  if (input.requirePublicProduct ?? true) {
    productConditions.push(eq(productsRef.activated, true), eq(productsRef.visibility, "public"))
  }

  const [product] = await db
    .select({
      id: productsRef.id,
    })
    .from(productsRef)
    .where(and(...productConditions))
    .limit(1)

  if (!product) {
    return null
  }

  const catalog = input.catalogId
    ? await db
        .select({
          id: priceCatalogsRef.id,
          currencyCode: priceCatalogsRef.currencyCode,
        })
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
        .select({
          id: priceCatalogsRef.id,
          currencyCode: priceCatalogsRef.currencyCode,
        })
        .from(priceCatalogsRef)
        .where(and(eq(priceCatalogsRef.catalogType, "public"), eq(priceCatalogsRef.active, true)))
        .orderBy(desc(priceCatalogsRef.isDefault), asc(priceCatalogsRef.name))
        .limit(1)
        .then((rows) => rows[0] ?? null)

  if (!catalog) {
    return null
  }

  const optionConditions = [
    eq(productOptionsRef.productId, productId),
    eq(productOptionsRef.status, "active"),
  ]

  if (input.optionId) {
    optionConditions.push(eq(productOptionsRef.id, input.optionId))
  }

  const options = await db
    .select({
      id: productOptionsRef.id,
      name: productOptionsRef.name,
      isDefault: productOptionsRef.isDefault,
    })
    .from(productOptionsRef)
    .where(and(...optionConditions))
    .orderBy(desc(productOptionsRef.isDefault), asc(productOptionsRef.sortOrder))

  if (options.length === 0) {
    return null
  }

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
    catalog: catalog satisfies SessionPricingCatalog,
    options: options satisfies SessionPricingOption[],
    rules: rules satisfies SessionPricingRule[],
    pricingCategories: pricingCategories satisfies SessionPricingCategory[],
    unitPrices: unitPrices.map((row) => {
      const override = departureOverrideByUnitId.get(row.unitId)
      return {
        ...row,
        sellAmountCents: override?.sellAmountCents ?? row.sellAmountCents,
        tiers: override ? [] : (tiersByUnitPriceId.get(row.id) ?? []),
      }
    }) satisfies Array<
      SessionPricingUnitPrice & {
        tiers: Array<{
          minQuantity: number
          maxQuantity: number | null
          sellAmountCents: number | null
        }>
      }
    >,
  }
}

async function buildSessionSnapshot(db: PostgresJsDatabase, bookingId: string) {
  const [booking, participants, items, allocations, itemParticipantLinks, state] =
    await Promise.all([
      bookingsService.getBookingById(db, bookingId),
      db
        .select()
        .from(bookingTravelers)
        .where(eq(bookingTravelers.bookingId, bookingId))
        .orderBy(asc(bookingTravelers.createdAt)),
      db
        .select()
        .from(bookingItems)
        .where(eq(bookingItems.bookingId, bookingId))
        .orderBy(asc(bookingItems.createdAt)),
      db
        .select()
        .from(bookingAllocations)
        .where(eq(bookingAllocations.bookingId, bookingId))
        .orderBy(asc(bookingAllocations.createdAt)),
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
        .where(eq(bookingItems.bookingId, bookingId))
        .orderBy(asc(bookingItemTravelers.createdAt)),
      getWizardSessionState(db, bookingId),
    ])

  if (!booking) {
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

  const hasTraveler = countTravelerParticipants(participants) > 0
  const hasTravelers = participants.length > 0
  const hasPrimaryTraveler = participants.some((participant) => participant.isPrimary)
  const hasItems = items.length > 0
  const hasAllocations = allocations.length > 0

  return {
    sessionId: booking.id,
    bookingNumber: booking.bookingNumber,
    status: booking.status,
    externalBookingRef: booking.externalBookingRef ?? null,
    communicationLanguage: booking.communicationLanguage ?? null,
    sellCurrency: booking.sellCurrency,
    sellAmountCents: booking.sellAmountCents ?? null,
    startDate: normalizeDate(booking.startDate),
    endDate: normalizeDate(booking.endDate),
    pax: booking.pax ?? null,
    holdExpiresAt: normalizeDateTime(booking.holdExpiresAt),
    confirmedAt: normalizeDateTime(booking.confirmedAt),
    expiredAt: normalizeDateTime(booking.expiredAt),
    cancelledAt: normalizeDateTime(booking.cancelledAt),
    completedAt: normalizeDateTime(booking.completedAt),
    travelers: participants.map((participant) => ({
      id: participant.id,
      participantType: participant.participantType,
      travelerCategory: participant.travelerCategory ?? null,
      firstName: participant.firstName,
      lastName: participant.lastName,
      email: participant.email ?? null,
      phone: participant.phone ?? null,
      preferredLanguage: participant.preferredLanguage ?? null,
      specialRequests: participant.specialRequests ?? null,
      isPrimary: participant.isPrimary,
      notes: participant.notes ?? null,
    })),
    items: items.map((item) => ({
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
    })),
    allocations: allocations.map((allocation) => ({
      id: allocation.id,
      bookingItemId: allocation.bookingItemId ?? null,
      productId: allocation.productId ?? null,
      optionId: allocation.optionId ?? null,
      optionUnitId: allocation.optionUnitId ?? null,
      pricingCategoryId: allocation.pricingCategoryId ?? null,
      availabilitySlotId: allocation.availabilitySlotId ?? null,
      quantity: allocation.quantity,
      allocationType: allocation.allocationType,
      status: allocation.status,
      holdExpiresAt: normalizeDateTime(allocation.holdExpiresAt),
      confirmedAt: normalizeDateTime(allocation.confirmedAt),
      releasedAt: normalizeDateTime(allocation.releasedAt),
    })),
    checklist: {
      hasTravelers,
      hasPrimaryTraveler,
      hasItems,
      hasAllocations,
      readyForConfirmation:
        booking.status === "on_hold" &&
        hasTravelers &&
        hasTraveler &&
        hasPrimaryTraveler &&
        hasItems &&
        hasAllocations,
    },
    state,
  }
}

export const publicBookingsService = {
  getSessionById(db: PostgresJsDatabase, bookingId: string) {
    return buildSessionSnapshot(db, bookingId)
  },

  async getSessionState(db: PostgresJsDatabase, bookingId: string) {
    const booking = await bookingsService.getBookingById(db, bookingId)
    if (!booking) {
      return null
    }

    return getWizardSessionState(db, bookingId)
  },

  async updateSessionState(
    db: PostgresJsDatabase,
    bookingId: string,
    input: PublicUpsertBookingSessionStateInput,
    resolvers: PublicBookingsServiceResolvers = {},
    userId?: string,
  ) {
    const booking = await bookingsService.getBookingById(db, bookingId)
    if (!booking) {
      return { status: "not_found" as const }
    }

    const state = await upsertWizardSessionState(db, bookingId, input)
    if (!state) {
      return { status: "not_found" as const }
    }

    const bookingContact = extractBookingContactFromStatePayload(state.payload)
    if (bookingContact) {
      // The billing contact is a mutable snapshot. The server-stamped booking
      // owner is immutable; true guests remain unowned (both columns null).
      await bookingsService.updateBooking(db, bookingId, bookingContact)
    }

    await syncTravelerRowsFromStatePayload(db, bookingId, state.payload, resolvers, userId)

    return { status: "ok" as const, state }
  },

  async updateSession(
    db: PostgresJsDatabase,
    bookingId: string,
    input: PublicUpdateBookingSessionInput,
    userId?: string,
    resolvers: PublicBookingsServiceResolvers = {},
  ) {
    const booking = await bookingsService.getBookingById(db, bookingId)
    if (!booking) {
      return { status: "not_found" as const }
    }

    if (
      input.externalBookingRef !== undefined ||
      input.communicationLanguage !== undefined ||
      input.pax !== undefined
    ) {
      await bookingsService.updateBooking(db, bookingId, {
        externalBookingRef: input.externalBookingRef,
        communicationLanguage: input.communicationLanguage,
        pax: input.pax,
      })
    }

    const travelers = input.travelers
    const removedTravelerIds = input.removedTravelerIds ?? []

    for (const travelerId of removedTravelerIds) {
      const participant = await bookingsService.getTravelerRecordById(db, bookingId, travelerId)
      if (participant) {
        await bookingsService.deleteTravelerRecord(db, participant.id)
      }
    }

    if (travelers) {
      for (const participant of travelers) {
        if (participant.id) {
          const existing = await bookingsService.getTravelerRecordById(
            db,
            bookingId,
            participant.id,
          )
          if (!existing) {
            return { status: "participant_not_found" as const }
          }

          await bookingsService.updateTravelerRecord(db, participant.id, {
            participantType: participant.participantType,
            travelerCategory: participant.travelerCategory ?? null,
            firstName: participant.firstName,
            lastName: participant.lastName,
            email: participant.email ?? null,
            phone: participant.phone ?? null,
            preferredLanguage: participant.preferredLanguage ?? null,
            specialRequests: participant.specialRequests ?? null,
            isPrimary: participant.isPrimary,
            notes: participant.notes ?? null,
          })
          continue
        }

        const personId = await safeResolveTravelerPerson(
          db,
          resolvers.resolveTravelerPerson,
          {
            firstName: participant.firstName,
            lastName: participant.lastName,
            email: participant.email ?? null,
            phone: participant.phone ?? null,
            preferredLanguage: participant.preferredLanguage ?? null,
          },
          bookingId,
        )
        await bookingsService.createTravelerRecord(
          db,
          bookingId,
          {
            participantType: participant.participantType,
            travelerCategory: participant.travelerCategory ?? null,
            firstName: participant.firstName,
            lastName: participant.lastName,
            email: participant.email ?? null,
            phone: participant.phone ?? null,
            preferredLanguage: participant.preferredLanguage ?? null,
            specialRequests: participant.specialRequests ?? null,
            isPrimary: participant.isPrimary,
            notes: participant.notes ?? null,
            personId,
          },
          userId,
        )
      }
    }

    if (input.holdMinutes !== undefined || input.holdExpiresAt !== undefined) {
      const holdResult = await bookingsService.extendBookingHold(
        db,
        bookingId,
        {
          holdMinutes: input.holdMinutes,
          holdExpiresAt: input.holdExpiresAt,
        },
        userId,
      )

      if (holdResult.status !== "ok") {
        return holdResult
      }
    }

    if (input.pax === undefined && (travelers || removedTravelerIds.length > 0)) {
      const participants = await db
        .select({ participantType: bookingTravelers.participantType })
        .from(bookingTravelers)
        .where(eq(bookingTravelers.bookingId, bookingId))
      const travelerCount = countTravelerParticipants(participants)
      await bookingsService.updateBooking(db, bookingId, {
        pax: travelerCount > 0 ? travelerCount : null,
      })
    }

    const session = await buildSessionSnapshot(db, bookingId)
    return session ? { status: "ok" as const, session } : { status: "not_found" as const }
  },

  async repriceSession(
    db: PostgresJsDatabase,
    bookingId: string,
    input: PublicBookingSessionRepriceInput,
  ) {
    const [booking, items] = await Promise.all([
      bookingsService.getBookingById(db, bookingId),
      db
        .select()
        .from(bookingItems)
        .where(eq(bookingItems.bookingId, bookingId))
        .orderBy(asc(bookingItems.createdAt)),
    ])

    if (!booking) {
      return { status: "not_found" as const }
    }

    const selectedItemIds = input.selections.map((selection) => selection.itemId)
    const itemById = new Map(items.map((item) => [item.id, item]))

    for (const selection of input.selections) {
      if (!itemById.has(selection.itemId)) {
        return { status: "invalid_selection" as const }
      }
    }

    const requestedUnitIds = Array.from(
      new Set(
        input.selections
          .map((selection) => selection.optionUnitId)
          .filter((value): value is string => Boolean(value)),
      ),
    )

    const requestedUnits =
      requestedUnitIds.length > 0
        ? await db.select().from(optionUnitsRef).where(inArray(optionUnitsRef.id, requestedUnitIds))
        : []
    const requestedUnitById = new Map(requestedUnits.map((unit) => [unit.id, unit]))

    const pricingWarnings: string[] = []
    const pricedItems: Array<{
      itemId: string
      title: string
      productId: string | null
      optionId: string | null
      optionUnitId: string | null
      optionUnitName: string | null
      optionUnitType: string | null
      pricingCategoryId: string | null
      quantity: number
      pricingMode: string
      unitSellAmountCents: number | null
      totalSellAmountCents: number | null
      warnings: string[]
    }> = []

    let resolvedCatalogId: string | null = input.catalogId ?? null
    let resolvedCurrency = booking.sellCurrency

    for (const selection of input.selections) {
      const item = itemById.get(selection.itemId)
      if (!item?.productId) {
        return { status: "invalid_selection" as const }
      }

      const optionId =
        selection.optionId === undefined
          ? (item.optionId ?? undefined)
          : (selection.optionId ?? undefined)
      const quantity = selection.quantity ?? item.quantity
      const pricingCategoryId =
        selection.pricingCategoryId === undefined
          ? (item.pricingCategoryId ?? null)
          : (selection.pricingCategoryId ?? null)
      const selectedUnitId =
        selection.optionUnitId === undefined
          ? (item.optionUnitId ?? null)
          : (selection.optionUnitId ?? null)

      const snapshot = await resolveSessionPricingSnapshot(db, item.productId, {
        catalogId: input.catalogId,
        departureId: item.availabilitySlotId ?? undefined,
        optionId,
      })
      if (!snapshot) {
        return { status: "pricing_unavailable" as const }
      }

      resolvedCatalogId = snapshot.catalog.id
      resolvedCurrency = snapshot.catalog.currencyCode ?? booking.sellCurrency

      const option =
        snapshot.options.find((candidate) => candidate.id === optionId) ??
        snapshot.options[0] ??
        null
      if (!option) {
        return { status: "pricing_unavailable" as const }
      }

      const rule =
        snapshot.rules.find(
          (candidate) => candidate.optionId === option.id && candidate.isDefault,
        ) ??
        snapshot.rules.find((candidate) => candidate.optionId === option.id) ??
        null
      if (!rule) {
        return { status: "pricing_unavailable" as const }
      }

      const ruleUnitPrices = snapshot.unitPrices.filter(
        (candidate) => candidate.optionPriceRuleId === rule.id,
      )

      const unitPriceCandidates = ruleUnitPrices.filter((candidate) => {
        if (selectedUnitId && candidate.unitId !== selectedUnitId) {
          return false
        }

        if (pricingCategoryId && candidate.pricingCategoryId !== pricingCategoryId) {
          return false
        }

        if (candidate.minQuantity !== null && quantity < candidate.minQuantity) {
          return false
        }

        if (candidate.maxQuantity !== null && quantity > candidate.maxQuantity) {
          return false
        }

        return true
      })

      const fallbackUnitPrice =
        !pricingCategoryId && !selectedUnitId
          ? (ruleUnitPrices.find(
              (candidate) =>
                candidate.pricingCategoryId === null &&
                (candidate.minQuantity === null || quantity >= candidate.minQuantity) &&
                (candidate.maxQuantity === null || quantity <= candidate.maxQuantity),
            ) ?? null)
          : null

      const unitPrice = unitPriceCandidates[0] ?? fallbackUnitPrice
      if (
        (selectedUnitId || ruleUnitPrices.length > 0) &&
        !unitPrice &&
        rule.pricingMode !== "per_booking"
      ) {
        return { status: "pricing_unavailable" as const }
      }

      const unit = selectedUnitId ? (requestedUnitById.get(selectedUnitId) ?? null) : null
      const unitSellAmountCents = unitPrice
        ? resolveTierAmount(unitPrice.tiers, quantity, unitPrice.sellAmountCents)
        : rule.baseSellAmountCents
      const pricingMode = unitPrice?.pricingMode ?? rule.pricingMode
      const totalSellAmountCents = computeLineTotal(
        pricingMode,
        unitSellAmountCents,
        quantity,
        rule.baseSellAmountCents,
      )
      const warnings = buildUnitWarnings(unit, quantity, booking.pax ?? null)

      if (selectedUnitId && !unit) {
        warnings.push("Selected room/unit metadata is not available in the current catalog.")
      }

      if (pricingMode === "on_request") {
        warnings.push("Selected option requires manual pricing confirmation.")
      }

      pricingWarnings.push(...warnings)
      pricedItems.push({
        itemId: item.id,
        title: item.title,
        productId: item.productId ?? null,
        optionId: option.id,
        optionUnitId: selectedUnitId,
        optionUnitName: unit?.name ?? unitPrice?.unitName ?? null,
        optionUnitType: unit?.unitType ?? unitPrice?.unitType ?? null,
        pricingCategoryId,
        quantity,
        pricingMode,
        unitSellAmountCents,
        totalSellAmountCents,
        warnings,
      })
    }

    const totalSellAmountCents = items.reduce((total, item) => {
      const repriced = pricedItems.find((candidate) => candidate.itemId === item.id)
      return total + (repriced?.totalSellAmountCents ?? item.totalSellAmountCents ?? 0)
    }, 0)

    let session = null

    if (input.applyToSession) {
      const activeAllocations =
        selectedItemIds.length > 0
          ? await db
              .select()
              .from(bookingAllocations)
              .where(
                and(
                  eq(bookingAllocations.bookingId, bookingId),
                  inArray(bookingAllocations.bookingItemId, selectedItemIds),
                  or(
                    eq(bookingAllocations.status, "held"),
                    eq(bookingAllocations.status, "confirmed"),
                  ),
                ),
              )
          : []
      const activeAllocationsByItemId = new Map<string, typeof activeAllocations>()
      for (const allocation of activeAllocations) {
        const existing = activeAllocationsByItemId.get(allocation.bookingItemId) ?? []
        existing.push(allocation)
        activeAllocationsByItemId.set(allocation.bookingItemId, existing)
      }

      const quantityChangedWithActiveAllocation = pricedItems.some((pricedItem) => {
        const item = itemById.get(pricedItem.itemId)
        return Boolean(
          item &&
            item.quantity !== pricedItem.quantity &&
            (activeAllocationsByItemId.get(pricedItem.itemId)?.length ?? 0) > 0,
        )
      })

      if (quantityChangedWithActiveAllocation) {
        return { status: "quantity_change_requires_reallocation" as const }
      }

      await db.transaction(async (tx) => {
        for (const pricedItem of pricedItems) {
          await tx
            .update(bookingItems)
            .set({
              optionId: pricedItem.optionId,
              optionUnitId: pricedItem.optionUnitId,
              pricingCategoryId: pricedItem.pricingCategoryId,
              quantity: pricedItem.quantity,
              sellCurrency: resolvedCurrency,
              unitSellAmountCents: pricedItem.unitSellAmountCents,
              totalSellAmountCents: pricedItem.totalSellAmountCents,
              updatedAt: new Date(),
            })
            .where(eq(bookingItems.id, pricedItem.itemId))

          await tx
            .update(bookingAllocations)
            .set({
              optionId: pricedItem.optionId,
              optionUnitId: pricedItem.optionUnitId,
              pricingCategoryId: pricedItem.pricingCategoryId,
              updatedAt: new Date(),
            })
            .where(
              and(
                eq(bookingAllocations.bookingId, bookingId),
                eq(bookingAllocations.bookingItemId, pricedItem.itemId),
                or(
                  eq(bookingAllocations.status, "held"),
                  eq(bookingAllocations.status, "confirmed"),
                ),
              ),
            )
        }

        await tx
          .update(bookings)
          .set({
            sellCurrency: resolvedCurrency,
            sellAmountCents: totalSellAmountCents,
            updatedAt: new Date(),
          })
          .where(eq(bookings.id, bookingId))
      })

      session = await buildSessionSnapshot(db, bookingId)
    }

    return {
      status: "ok" as const,
      pricing: {
        sessionId: bookingId,
        catalogId: resolvedCatalogId,
        currencyCode: resolvedCurrency,
        totalSellAmountCents,
        items: pricedItems,
        warnings: Array.from(new Set(pricingWarnings)),
        appliedToSession: input.applyToSession,
      },
      session,
    }
  },

  async confirmSession(
    db: PostgresJsDatabase,
    bookingId: string,
    input: PublicBookingSessionMutationInput,
    userId?: string,
    runtime: BookingServiceRuntime = {},
  ) {
    const result = await bookingsService.confirmBooking(db, bookingId, input, userId, runtime)
    if (result.status !== "ok") {
      return result
    }

    const session = await buildSessionSnapshot(db, bookingId)
    return session ? { status: "ok" as const, session } : { status: "not_found" as const }
  },

  async expireSession(
    db: PostgresJsDatabase,
    bookingId: string,
    input: PublicBookingSessionMutationInput,
    userId?: string,
    runtime: BookingServiceRuntime = {},
  ) {
    const result = await bookingsService.expireBooking(db, bookingId, input, userId, runtime)
    if (result.status !== "ok") {
      return result
    }

    const session = await buildSessionSnapshot(db, bookingId)
    return session ? { status: "ok" as const, session } : { status: "not_found" as const }
  },

  async getOverview(
    db: PostgresJsDatabase,
    query: PublicBookingOverviewLookupQuery,
    enrichers?: Partial<Record<string, BookingOverviewItemEnricher>>,
  ) {
    return buildOverviewSnapshot(db, query, enrichers)
  },

  async getOverviewByGuestAccess(
    db: PostgresJsDatabase,
    query: PublicBookingOverviewAccessQuery,
    enrichers?: Partial<Record<string, BookingOverviewItemEnricher>>,
  ) {
    return buildOverviewSnapshot(db, query, enrichers)
  },

  async getOverviewByLookup(
    db: PostgresJsDatabase,
    query: InternalBookingOverviewLookupQuery,
    enrichers?: Partial<Record<string, BookingOverviewItemEnricher>>,
  ) {
    return buildOverviewSnapshot(db, query, enrichers)
  },
}
