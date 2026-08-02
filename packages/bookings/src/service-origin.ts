import type { AnyDrizzleDb } from "@voyant-travel/db"
import { eq } from "drizzle-orm"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"

import {
  type BookingOrigin,
  type BookingOriginLegacyTransactionIds,
  type BookingOriginSource,
  bookingOrigins,
  type NewBookingOrigin,
} from "./schema-origin.js"

export interface UpsertBookingOriginInput {
  bookingId: string
  originSource: BookingOriginSource
  proposalVersionId?: string | null
  tripSnapshotId?: string | null
  reservationPlanId?: string | null
  catalogPriceResponseId?: string | null
  catalogSnapshotId?: string | null
  providerSourceKind?: string | null
  providerSourceProvider?: string | null
  providerSourceConnectionId?: string | null
  providerSourceRef?: string | null
  providerOrderRef?: string | null
  storefrontId?: string | null
  channelId?: string | null
  legacyTransactionOfferId?: string | null
  legacyTransactionOrderId?: string | null
  legacyTransactionIds?: BookingOriginLegacyTransactionIds | null
  metadata?: Record<string, unknown> | null
}

export interface LegacyBookingTransactionLink {
  offerId: string | null
  orderId: string | null
}

export interface DirectB2CBookingOriginItemInput {
  sourceSnapshotId?: string | null
  metadata?: Record<string, unknown> | null
}

export interface DirectB2CBookingOriginInput {
  bookingId: string
  externalBookingRef?: string | null
  storefrontId?: string | null
  channelId?: string | null
  items?: DirectB2CBookingOriginItemInput[]
  buyerKind?: "guest" | "personal" | "business"
}

export interface CatalogReservationBookingOriginInput {
  bookingId: string
  tripEnvelopeId?: string | null
  tripComponentId?: string | null
  reservationPlanId?: string | null
  catalogPriceResponseId?: string | null
  catalogSnapshotId?: string | null
  providerSourceKind?: string | null
  providerSourceProvider?: string | null
  providerSourceConnectionId?: string | null
  providerSourceRef?: string | null
  providerOrderRef?: string | null
  storefrontId?: string | null
  channelId?: string | null
  metadata?: Record<string, unknown> | null
}

function nullable<T>(value: T | null | undefined): T | null {
  return value ?? null
}

function buildLegacyTransactionIds(
  input: Pick<
    UpsertBookingOriginInput,
    "legacyTransactionIds" | "legacyTransactionOfferId" | "legacyTransactionOrderId"
  >,
): BookingOriginLegacyTransactionIds | null {
  if (input.legacyTransactionIds !== undefined) {
    return input.legacyTransactionIds
  }

  const offerId = nullable(input.legacyTransactionOfferId)
  const orderId = nullable(input.legacyTransactionOrderId)

  if (!offerId && !orderId) {
    return null
  }

  return { offerId, orderId }
}

export function toBookingOriginInsert(
  input: UpsertBookingOriginInput,
  now = new Date(),
): NewBookingOrigin {
  return {
    bookingId: input.bookingId,
    originSource: input.originSource,
    proposalVersionId: nullable(input.proposalVersionId),
    tripSnapshotId: nullable(input.tripSnapshotId),
    reservationPlanId: nullable(input.reservationPlanId),
    catalogPriceResponseId: nullable(input.catalogPriceResponseId),
    catalogSnapshotId: nullable(input.catalogSnapshotId),
    providerSourceKind: nullable(input.providerSourceKind),
    providerSourceProvider: nullable(input.providerSourceProvider),
    providerSourceConnectionId: nullable(input.providerSourceConnectionId),
    providerSourceRef: nullable(input.providerSourceRef),
    providerOrderRef: nullable(input.providerOrderRef),
    storefrontId: nullable(input.storefrontId),
    channelId: nullable(input.channelId),
    legacyTransactionOfferId: nullable(input.legacyTransactionOfferId),
    legacyTransactionOrderId: nullable(input.legacyTransactionOrderId),
    legacyTransactionIds: buildLegacyTransactionIds(input),
    metadata: nullable(input.metadata),
    createdAt: now,
    updatedAt: now,
  }
}

function uniqueNonEmpty(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value?.trim())))]
}

function singleOrNull(values: string[]): string | null {
  return values.length === 1 ? (values[0] ?? null) : null
}

export function toDirectB2CBookingOriginInput(
  input: DirectB2CBookingOriginInput,
): UpsertBookingOriginInput {
  const catalogSnapshotIds = uniqueNonEmpty(input.items?.map((item) => item.sourceSnapshotId) ?? [])

  return {
    bookingId: input.bookingId,
    originSource: "direct_b2c",
    catalogSnapshotId: singleOrNull(catalogSnapshotIds),
    storefrontId: nullable(input.storefrontId),
    channelId: nullable(input.channelId),
    metadata: {
      source: "public_bookings_service.create_session",
      externalBookingRef: nullable(input.externalBookingRef),
      catalogSnapshotIds,
      itemCount: input.items?.length ?? 0,
      buyerKind: input.buyerKind ?? "guest",
    },
  }
}

export function toCatalogReservationBookingOriginInput(
  input: CatalogReservationBookingOriginInput,
): UpsertBookingOriginInput {
  return {
    bookingId: input.bookingId,
    originSource: "catalog_price_availability",
    reservationPlanId: nullable(input.reservationPlanId),
    catalogPriceResponseId: nullable(input.catalogPriceResponseId),
    catalogSnapshotId: nullable(input.catalogSnapshotId),
    providerSourceKind: nullable(input.providerSourceKind),
    providerSourceProvider: nullable(input.providerSourceProvider),
    providerSourceConnectionId: nullable(input.providerSourceConnectionId),
    providerSourceRef: nullable(input.providerSourceRef),
    providerOrderRef: nullable(input.providerOrderRef),
    storefrontId: nullable(input.storefrontId),
    channelId: nullable(input.channelId),
    metadata: {
      source: "bookings.submit_reservation_plan",
      tripEnvelopeId: nullable(input.tripEnvelopeId),
      tripComponentId: nullable(input.tripComponentId),
      ...(input.metadata ?? {}),
    },
  }
}

export async function upsertBookingOrigin(
  db: AnyDrizzleDb,
  input: UpsertBookingOriginInput,
): Promise<BookingOrigin> {
  const values = toBookingOriginInsert(input)

  // Cast: AnyDrizzleDb's union does not unify insert().onConflictDoNothing()
  // across drivers, though all supported Postgres drivers implement it.
  const [origin] = await (db as PostgresJsDatabase)
    .insert(bookingOrigins)
    .values(values)
    .onConflictDoNothing({ target: bookingOrigins.bookingId })
    .returning()

  if (origin) return origin

  const existing = await getBookingOriginByBookingId(db as PostgresJsDatabase, input.bookingId)
  if (existing) return existing

  throw new Error("Unable to persist booking origin")
}

export async function getBookingOriginByBookingId(
  db: PostgresJsDatabase,
  bookingId: string,
): Promise<BookingOrigin | null> {
  const [origin] = await db
    .select()
    .from(bookingOrigins)
    .where(eq(bookingOrigins.bookingId, bookingId))
    .limit(1)

  return origin ?? null
}

function readLegacyId(
  ids: BookingOriginLegacyTransactionIds | null,
  key: "offerId" | "orderId",
): string | null {
  const value = ids?.[key]
  return typeof value === "string" && value.length > 0 ? value : null
}

export function getLegacyTransactionLinkFromBookingOrigin(
  origin: BookingOrigin | null,
): LegacyBookingTransactionLink | null {
  if (!origin) {
    return null
  }

  const offerId =
    origin.legacyTransactionOfferId ?? readLegacyId(origin.legacyTransactionIds, "offerId")
  const orderId =
    origin.legacyTransactionOrderId ?? readLegacyId(origin.legacyTransactionIds, "orderId")

  if (!offerId && !orderId) {
    return null
  }

  return { offerId, orderId }
}
