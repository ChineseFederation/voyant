import { newId } from "@voyant-travel/db/lib/typeid"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"

import { bookings, bookingTravelers } from "./schema-core.js"
import type { BookingItemCancellationTermsSnapshotV1 } from "./schema-items.js"
import { bookingAllocations, bookingItems, bookingItemTravelers } from "./schema-items.js"
import { upsertBookingOrigin } from "./service-origin.js"

export interface SourcedBookingTravelerInput {
  firstName: string
  lastName: string
  email?: string | null
  phone?: string | null
  category?: "adult" | "child" | "infant" | "senior" | "other" | null
  isPrimary?: boolean
}

export interface CreateSourcedBookingCommitmentInput {
  bookingNumber: string
  personId?: string | null
  organizationId?: string | null
  contactFirstName?: string | null
  contactLastName?: string | null
  contactEmail?: string | null
  contactPhone?: string | null
  contactCountry?: string | null
  /** Administrative subdivision, preferably ISO 3166-2 (voyant#4290). */
  contactRegion?: string | null
  contactCity?: string | null
  contactAddressLine1?: string | null
  contactAddressLine2?: string | null
  contactPostalCode?: string | null
  /** System-derived evidence such as storefront contract acceptance. */
  internalNotes?: string | null
  sellCurrency: string
  sellAmountCents: number
  title: string
  description?: string | null
  quantity: number
  serviceDate?: string | null
  endDate?: string | null
  startsAt?: Date | null
  endsAt?: Date | null
  travelers: SourcedBookingTravelerInput[]
  entityModule: string
  entityId: string
  sourceKind: string
  sourceProvider?: string | null
  sourceConnectionId: string
  sourceRef: string
  upstreamRef: string
  channelId?: string | null
  supplierOperationId: string
  now: Date
  cancellationTermsEvidence?: Omit<
    BookingItemCancellationTermsSnapshotV1,
    "sellCurrency" | "totalSellAmountCents" | "serviceDate"
  > | null
}

export interface CreateSourcedBookingCommitmentResult {
  bookingId: string
  bookingItemId: string
  allocationIds: string[]
}

/**
 * Materialize a supplier-secured component as the first-party commercial
 * commitment. The caller owns the surrounding transaction and must serialize
 * on its Supplier Operation before invoking this service.
 */
export async function createSourcedBookingCommitment(
  db: PostgresJsDatabase,
  input: CreateSourcedBookingCommitmentInput,
): Promise<CreateSourcedBookingCommitmentResult> {
  const bookingId = newId("bookings")
  const bookingItemId = newId("booking_items")
  const allocationId = newId("booking_allocations")
  const startDate = input.startsAt?.toISOString().slice(0, 10) ?? input.serviceDate ?? null
  const endDate = input.endsAt?.toISOString().slice(0, 10) ?? input.endDate ?? null

  await db.insert(bookings).values({
    id: bookingId,
    bookingNumber: input.bookingNumber,
    status: "confirmed",
    personId: input.personId ?? null,
    organizationId: input.organizationId ?? null,
    sourceType: "api_partner",
    externalBookingRef: input.upstreamRef,
    contactFirstName: input.contactFirstName ?? null,
    contactLastName: input.contactLastName ?? null,
    contactEmail: input.contactEmail ?? null,
    contactPhone: input.contactPhone ?? null,
    contactCountry: input.contactCountry ?? null,
    contactRegion: input.contactRegion ?? null,
    contactCity: input.contactCity ?? null,
    contactAddressLine1: input.contactAddressLine1 ?? null,
    contactAddressLine2: input.contactAddressLine2 ?? null,
    contactPostalCode: input.contactPostalCode ?? null,
    internalNotes: input.internalNotes ?? null,
    sellCurrency: input.sellCurrency,
    sellAmountCents: input.sellAmountCents,
    startDate,
    endDate,
    pax: input.travelers.length || input.quantity,
    acceptedAt: input.now,
    confirmedAt: input.now,
    createdAt: input.now,
    updatedAt: input.now,
  })

  await db.insert(bookingItems).values({
    id: bookingItemId,
    bookingId,
    title: input.title,
    description: input.description ?? null,
    itemType: "service",
    status: "confirmed",
    serviceDate: input.serviceDate ?? null,
    startsAt: input.startsAt ?? null,
    endsAt: input.endsAt ?? null,
    quantity: input.quantity,
    sellCurrency: input.sellCurrency,
    unitSellAmountCents: Math.round(input.sellAmountCents / input.quantity),
    totalSellAmountCents: input.sellAmountCents,
    productNameSnapshot: input.title,
    sourceOfferId: input.sourceRef,
    cancellationTermsSnapshot: input.cancellationTermsEvidence
      ? {
          ...input.cancellationTermsEvidence,
          sellCurrency: input.sellCurrency,
          totalSellAmountCents: input.sellAmountCents,
          serviceDate: input.serviceDate ?? startDate,
        }
      : null,
    metadata: {
      entityModule: input.entityModule,
      entityId: input.entityId,
      supplierOperationId: input.supplierOperationId,
      upstreamRef: input.upstreamRef,
    },
    createdAt: input.now,
    updatedAt: input.now,
  })

  await db.insert(bookingAllocations).values({
    id: allocationId,
    bookingId,
    bookingItemId,
    quantity: input.quantity,
    allocationType: "unit",
    status: "confirmed",
    confirmedAt: input.now,
    metadata: {
      sourceKind: input.sourceKind,
      sourceConnectionId: input.sourceConnectionId,
      upstreamRef: input.upstreamRef,
      supplierOperationId: input.supplierOperationId,
    },
    createdAt: input.now,
    updatedAt: input.now,
  })

  const travelers = input.travelers.map((traveler) => ({
    id: newId("booking_travelers"),
    bookingId,
    firstName: traveler.firstName,
    lastName: traveler.lastName,
    email: traveler.email ?? null,
    phone: traveler.phone ?? null,
    travelerCategory: traveler.category ?? null,
    isPrimary: traveler.isPrimary ?? false,
    createdAt: input.now,
    updatedAt: input.now,
  }))
  if (travelers.length > 0) {
    await db.insert(bookingTravelers).values(travelers)
    await db.insert(bookingItemTravelers).values(
      travelers.map((traveler) => ({
        id: newId("booking_item_travelers"),
        bookingItemId,
        travelerId: traveler.id,
        role: "traveler" as const,
        isPrimary: traveler.isPrimary,
        createdAt: input.now,
      })),
    )
  }

  await upsertBookingOrigin(db, {
    bookingId,
    originSource: "provider_source_order",
    providerSourceKind: input.sourceKind,
    providerSourceProvider: input.sourceProvider ?? null,
    providerSourceConnectionId: input.sourceConnectionId,
    providerSourceRef: input.sourceRef,
    providerOrderRef: input.upstreamRef,
    channelId: input.channelId ?? null,
    metadata: {
      entityModule: input.entityModule,
      entityId: input.entityId,
      supplierOperationId: input.supplierOperationId,
    },
  })

  return { bookingId, bookingItemId, allocationIds: [allocationId] }
}
