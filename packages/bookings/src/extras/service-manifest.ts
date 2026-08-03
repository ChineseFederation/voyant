import { newId } from "@voyant-travel/db/lib/typeid"
import { and, asc, desc, eq, inArray, or } from "drizzle-orm"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"
import type { z } from "zod"

import { availabilitySlotsRef } from "../availability-ref.js"
import {
  bookingAllocations,
  bookingItems,
  bookingItemTravelers,
  bookings,
  bookingTravelers,
} from "../schema.js"
import { productExtrasRef } from "./product-extra-ref.js"
import { extraParticipantSelections } from "./schema.js"
import type {
  slotExtraCollectionBulkSchema,
  slotExtraManifestQuerySchema,
  slotExtraSelectionBulkSchema,
  slotExtraSelectionPatchSchema,
} from "./validation.js"

type SlotExtraManifestQuery = z.infer<typeof slotExtraManifestQuerySchema>
type SlotExtraSelectionPatch = z.infer<typeof slotExtraSelectionPatchSchema>
type SlotExtraSelectionBulk = z.infer<typeof slotExtraSelectionBulkSchema>
type SlotExtraCollectionBulk = z.infer<typeof slotExtraCollectionBulkSchema>

const activeBookingStatusesForSlot = ["confirmed", "in_progress", "completed"] as const

const activeAllocationStatusesForSlot = ["held", "confirmed", "fulfilled"] as const

function defaultCollectionStatus(collectionMode: string) {
  if (collectionMode === "cash_on_trip" || collectionMode === "external") return "pending"
  return "not_required"
}

function selectionKey(travelerId: string, productExtraId: string) {
  return `${travelerId}:${productExtraId}`
}

function fullName(firstName: string, lastName: string) {
  return [firstName, lastName].filter(Boolean).join(" ").trim()
}

function metadataProductExtraId(metadata: Record<string, unknown> | null | undefined) {
  return typeof metadata?.productExtraId === "string" ? metadata.productExtraId : null
}

/** One row of the per-traveler selection matrix, as projected by the manifest. */
type SlotExtraSelectionRow = {
  productExtraId: string
  status: string
  selected: boolean
  quantity: number
  collectionStatus: string
  collectionCurrency: string | null
  collectionAmountCents: number | null
}

/**
 * Departure-level rollup for each Extra offered on the slot: how many units the
 * guide has to carry, who they belong to, what still has to be collected, and
 * whether fulfillment is finished.
 *
 * Kept derived rather than stored — the selection matrix is already the source
 * of truth and a stored counter would only drift away from it.
 */
export function summarizeSlotExtras(
  extras: ReadonlyArray<typeof productExtrasRef.$inferSelect>,
  eligibleTravelerCount: number,
  selections: ReadonlyArray<SlotExtraSelectionRow>,
) {
  return extras.map((extra) => {
    const rows = selections.filter((selection) => selection.productExtraId === extra.id)
    const selectedRows = rows.filter((selection) => selection.selected)
    const currencies = new Set(
      selectedRows.flatMap((selection) =>
        selection.collectionCurrency ? [selection.collectionCurrency] : [],
      ),
    )
    const countStatus = (status: string) =>
      rows.filter((selection) => selection.status === status).length
    const countCollection = (status: string) =>
      selectedRows.filter((selection) => selection.collectionStatus === status).length
    const pendingCollectionCount = countCollection("pending")
    const fulfilledTravelerCount = countStatus("fulfilled")
    // Only a single agreed currency can be summed; anything else has to stay
    // null so a caller cannot add euros to lei.
    const sharedCurrency = currencies.size === 1 ? ([...currencies][0] ?? null) : null

    return {
      productExtraId: extra.id,
      name: extra.name,
      code: extra.code,
      supplierId: extra.supplierId,
      // Applicability as configured on the Product / Option, carried through so
      // the manifest explains *why* a traveler is or isn't on the list.
      selectionType: extra.selectionType,
      pricingMode: extra.pricingMode,
      pricedPerPerson: extra.pricedPerPerson,
      collectionMode: extra.collectionMode,
      eligibleTravelerCount,
      selectedTravelerCount: selectedRows.length,
      totalQuantity: selectedRows.reduce((sum, selection) => sum + selection.quantity, 0),
      fulfilledTravelerCount,
      cancelledTravelerCount: countStatus("cancelled"),
      noShowTravelerCount: countStatus("no_show"),
      collection: {
        notRequired: countCollection("not_required"),
        pending: pendingCollectionCount,
        collected: countCollection("collected"),
        waived: countCollection("waived"),
        refunded: countCollection("refunded"),
      },
      /** Null when selected travelers disagree on currency — the caller must not sum across them. */
      collectionCurrency: sharedCurrency,
      collectionAmountCents: sharedCurrency
        ? selectedRows.reduce((sum, selection) => sum + (selection.collectionAmountCents ?? 0), 0)
        : null,
      outstandingCollectionCount: pendingCollectionCount,
      /** True once every selected traveler has been marked fulfilled. */
      fulfillmentComplete:
        selectedRows.length > 0 && fulfilledTravelerCount === selectedRows.length,
    }
  })
}

export const bookingsExtrasManifestService = {
  async getSlotExtraManifest(
    db: PostgresJsDatabase,
    slotId: string,
    query: SlotExtraManifestQuery = { includeInactiveExtras: false },
  ) {
    const [slot] = await db
      .select()
      .from(availabilitySlotsRef)
      .where(eq(availabilitySlotsRef.id, slotId))
      .limit(1)

    if (!slot) return { status: "slot_not_found" as const }

    const extraConditions = [eq(productExtrasRef.productId, slot.productId)]
    if (!query.includeInactiveExtras) {
      extraConditions.push(eq(productExtrasRef.active, true))
      extraConditions.push(eq(productExtrasRef.showOnSlotManifest, true))
    }

    const [extras, travelers] = await Promise.all([
      db
        .select()
        .from(productExtrasRef)
        .where(and(...extraConditions))
        .orderBy(asc(productExtrasRef.sortOrder), asc(productExtrasRef.name)),
      db
        .selectDistinct({
          id: bookingTravelers.id,
          bookingId: bookingTravelers.bookingId,
          bookingNumber: bookings.bookingNumber,
          bookingStatus: bookings.status,
          participantType: bookingTravelers.participantType,
          travelerCategory: bookingTravelers.travelerCategory,
          firstName: bookingTravelers.firstName,
          lastName: bookingTravelers.lastName,
          email: bookingTravelers.email,
          phone: bookingTravelers.phone,
          isPrimary: bookingTravelers.isPrimary,
          createdAt: bookingTravelers.createdAt,
        })
        .from(bookingTravelers)
        .innerJoin(bookings, eq(bookings.id, bookingTravelers.bookingId))
        .innerJoin(bookingAllocations, eq(bookingAllocations.bookingId, bookings.id))
        .where(
          and(
            eq(bookingAllocations.availabilitySlotId, slotId),
            inArray(bookings.status, [...activeBookingStatusesForSlot]),
            inArray(bookingAllocations.status, [...activeAllocationStatusesForSlot]),
            or(
              eq(bookingTravelers.participantType, "traveler"),
              eq(bookingTravelers.participantType, "occupant"),
            ),
          ),
        )
        .orderBy(
          asc(bookings.bookingNumber),
          desc(bookingTravelers.isPrimary),
          asc(bookingTravelers.createdAt),
        ),
    ])

    const bookingIds = [...new Set(travelers.map((traveler) => traveler.bookingId))]
    const productExtraIds = extras.map((extra) => extra.id)
    const productExtraIdSet = new Set(productExtraIds)

    const [rawExtraItems, persistedSelections] =
      bookingIds.length > 0 && productExtraIds.length > 0
        ? await Promise.all([
            db
              .select()
              .from(bookingItems)
              .where(
                and(
                  inArray(bookingItems.bookingId, bookingIds),
                  eq(bookingItems.itemType, "extra"),
                ),
              ),
            db
              .select()
              .from(extraParticipantSelections)
              .where(
                and(
                  inArray(extraParticipantSelections.bookingId, bookingIds),
                  inArray(extraParticipantSelections.productExtraId, productExtraIds),
                ),
              ),
          ])
        : [[], []]

    const extraItems = rawExtraItems.filter((item) =>
      productExtraIdSet.has(metadataProductExtraId(item.metadata) ?? ""),
    )
    const itemIds = extraItems.map((item) => item.id)
    const itemLinks =
      itemIds.length > 0
        ? await db
            .select()
            .from(bookingItemTravelers)
            .where(inArray(bookingItemTravelers.bookingItemId, itemIds))
        : []

    const itemById = new Map(extraItems.map((item) => [item.id, item]))
    const itemSelectionsByKey = new Map<
      string,
      {
        bookingItemId: string
        quantity: number
        unitSellAmountCents: number | null
        totalSellAmountCents: number | null
        sellCurrency: string
      }
    >()

    for (const link of itemLinks) {
      const item = itemById.get(link.bookingItemId)
      const productExtraId = metadataProductExtraId(item?.metadata)
      if (!item || !productExtraId) continue
      itemSelectionsByKey.set(selectionKey(link.travelerId, productExtraId), {
        bookingItemId: item.id,
        quantity: item.quantity,
        unitSellAmountCents: item.unitSellAmountCents,
        totalSellAmountCents: item.totalSellAmountCents,
        sellCurrency: item.sellCurrency,
      })
    }

    const persistedByKey = new Map(
      persistedSelections.map((selection) => [
        selectionKey(selection.travelerId, selection.productExtraId),
        selection,
      ]),
    )

    const selections = travelers.flatMap((traveler) =>
      extras.map((extra) => {
        const key = selectionKey(traveler.id, extra.id)
        const persisted = persistedByKey.get(key)
        const itemSelection = itemSelectionsByKey.get(key)
        const status = persisted?.status ?? (itemSelection ? "selected" : "cancelled")
        const collectionMode = persisted?.collectionMode ?? extra.collectionMode
        const selected = status === "selected" || status === "fulfilled"
        return {
          bookingId: traveler.bookingId,
          travelerId: traveler.id,
          productExtraId: extra.id,
          optionExtraConfigId: persisted?.optionExtraConfigId ?? null,
          bookingItemId: persisted?.bookingItemId ?? itemSelection?.bookingItemId ?? null,
          status,
          selected,
          // The quantity the traveler actually bought. Absent a priced booking
          // item, a selected extra still counts as one unit so the guide's
          // headcount is never short.
          quantity: selected ? (itemSelection?.quantity ?? 1) : 0,
          collectionMode,
          collectionStatus: persisted?.collectionStatus ?? defaultCollectionStatus(collectionMode),
          collectionCurrency: persisted?.collectionCurrency ?? itemSelection?.sellCurrency ?? null,
          collectionAmountCents:
            persisted?.collectionAmountCents ?? itemSelection?.totalSellAmountCents ?? null,
          collectedAt: persisted?.collectedAt ?? null,
          collectedBy: persisted?.collectedBy ?? null,
          notes: persisted?.notes ?? null,
          metadata: persisted?.metadata ?? null,
          source: persisted ? "selection" : itemSelection ? "booking_item" : "empty",
        }
      }),
    )

    return {
      status: "ok" as const,
      data: {
        slot,
        extras,
        travelers: travelers.map((traveler) => ({
          ...traveler,
          fullName: fullName(traveler.firstName, traveler.lastName),
        })),
        selections,
        summaries: summarizeSlotExtras(extras, travelers.length, selections),
      },
    }
  },

  async setSlotExtraSelection(
    db: PostgresJsDatabase,
    slotId: string,
    input: SlotExtraSelectionPatch,
    actorId?: string,
  ) {
    const validation = await validateSlotSelection(db, slotId, input)
    if (validation.status !== "ok") return validation

    const existingItem = await findBookingExtraItem(
      db,
      input.bookingId,
      input.travelerId,
      input.productExtraId,
    )
    const collectionMode = validation.extra.collectionMode
    const bookingItemId =
      existingItem?.bookingItemId ??
      (collectionMode === "booking_total" && input.status !== "cancelled"
        ? await createBookingTotalExtraItem(db, {
            bookingId: input.bookingId,
            travelerId: input.travelerId,
            productId: validation.slot.productId,
            optionId: validation.slot.optionId,
            extra: validation.extra,
            optionExtraConfigId: input.optionExtraConfigId ?? null,
            sellCurrency: input.collectionCurrency ?? validation.booking.sellCurrency,
            unitSellAmountCents: input.collectionAmountCents ?? null,
            totalSellAmountCents: input.collectionAmountCents ?? null,
            slotId,
          })
        : null)
    const collectionStatus =
      input.collectionStatus ??
      (input.status === "cancelled" ? "not_required" : defaultCollectionStatus(collectionMode))
    const collectedAt = collectionStatus === "collected" ? new Date() : null

    const [row] = await db
      .insert(extraParticipantSelections)
      .values({
        bookingId: input.bookingId,
        bookingItemId,
        travelerId: input.travelerId,
        productExtraId: input.productExtraId,
        optionExtraConfigId: input.optionExtraConfigId ?? null,
        status: input.status,
        collectionMode,
        collectionStatus,
        collectionCurrency: input.collectionCurrency ?? existingItem?.sellCurrency ?? null,
        collectionAmountCents:
          input.collectionAmountCents ?? existingItem?.totalSellAmountCents ?? null,
        collectedAt,
        collectedBy: collectedAt ? (actorId ?? null) : null,
        notes: input.notes ?? null,
        metadata: input.metadata ?? null,
      })
      .onConflictDoUpdate({
        target: [
          extraParticipantSelections.bookingId,
          extraParticipantSelections.travelerId,
          extraParticipantSelections.productExtraId,
        ],
        set: {
          bookingItemId,
          optionExtraConfigId: input.optionExtraConfigId ?? null,
          status: input.status,
          collectionMode,
          collectionStatus,
          collectionCurrency: input.collectionCurrency ?? existingItem?.sellCurrency ?? null,
          collectionAmountCents:
            input.collectionAmountCents ?? existingItem?.totalSellAmountCents ?? null,
          collectedAt,
          collectedBy: collectedAt ? (actorId ?? null) : null,
          notes: input.notes ?? null,
          metadata: input.metadata ?? null,
          updatedAt: new Date(),
        },
      })
      .returning()

    return { status: "ok" as const, data: row ?? null }
  },

  async bulkSetSlotExtraSelections(
    db: PostgresJsDatabase,
    slotId: string,
    input: SlotExtraSelectionBulk,
    actorId?: string,
  ) {
    const rows = []
    for (const selection of input.selections) {
      const result = await this.setSlotExtraSelection(db, slotId, selection, actorId)
      if (result.status !== "ok") return result
      rows.push(result.data)
    }
    return { status: "ok" as const, data: rows }
  },

  async bulkUpdateSlotExtraCollections(
    db: PostgresJsDatabase,
    slotId: string,
    input: SlotExtraCollectionBulk,
    actorId?: string,
  ) {
    const manifest = await this.getSlotExtraManifest(db, slotId)
    if (manifest.status !== "ok") return manifest
    const travelerById = new Map(manifest.data.travelers.map((traveler) => [traveler.id, traveler]))
    const extra = manifest.data.extras.find((candidate) => candidate.id === input.productExtraId)
    if (!extra) return { status: "extra_not_found" as const }

    const rows = []
    for (const travelerId of input.travelerIds) {
      const traveler = travelerById.get(travelerId)
      if (!traveler) return { status: "traveler_not_found" as const }
      const result = await this.setSlotExtraSelection(
        db,
        slotId,
        {
          bookingId: traveler.bookingId,
          travelerId,
          productExtraId: input.productExtraId,
          status: "selected",
          collectionStatus: input.collectionStatus,
          collectionCurrency: input.collectionCurrency,
          collectionAmountCents: input.collectionAmountCents,
          notes: input.notes,
        },
        actorId,
      )
      if (result.status !== "ok") return result
      rows.push(result.data)
    }

    return { status: "ok" as const, data: rows }
  },
}

async function validateSlotSelection(
  db: PostgresJsDatabase,
  slotId: string,
  input: SlotExtraSelectionPatch,
) {
  const [slot] = await db
    .select()
    .from(availabilitySlotsRef)
    .where(eq(availabilitySlotsRef.id, slotId))
    .limit(1)
  if (!slot) return { status: "slot_not_found" as const }

  const [extra] = await db
    .select()
    .from(productExtrasRef)
    .where(
      and(
        eq(productExtrasRef.id, input.productExtraId),
        eq(productExtrasRef.productId, slot.productId),
      ),
    )
    .limit(1)
  if (!extra) return { status: "extra_not_found" as const }

  const [traveler] = await db
    .select({ id: bookingTravelers.id, sellCurrency: bookings.sellCurrency })
    .from(bookingTravelers)
    .innerJoin(bookings, eq(bookings.id, bookingTravelers.bookingId))
    .innerJoin(bookingAllocations, eq(bookingAllocations.bookingId, bookings.id))
    .where(
      and(
        eq(bookingTravelers.id, input.travelerId),
        eq(bookingTravelers.bookingId, input.bookingId),
        eq(bookingAllocations.availabilitySlotId, slotId),
        inArray(bookings.status, [...activeBookingStatusesForSlot]),
        inArray(bookingAllocations.status, [...activeAllocationStatusesForSlot]),
      ),
    )
    .limit(1)
  if (!traveler) return { status: "traveler_not_found" as const }

  return { status: "ok" as const, slot, extra, booking: { sellCurrency: traveler.sellCurrency } }
}

async function findBookingExtraItem(
  db: PostgresJsDatabase,
  bookingId: string,
  travelerId: string,
  productExtraId: string,
) {
  const rows = await db
    .select({
      bookingItemId: bookingItems.id,
      sellCurrency: bookingItems.sellCurrency,
      unitSellAmountCents: bookingItems.unitSellAmountCents,
      totalSellAmountCents: bookingItems.totalSellAmountCents,
      metadata: bookingItems.metadata,
    })
    .from(bookingItems)
    .innerJoin(bookingItemTravelers, eq(bookingItemTravelers.bookingItemId, bookingItems.id))
    .where(
      and(
        eq(bookingItems.bookingId, bookingId),
        eq(bookingItems.itemType, "extra"),
        eq(bookingItemTravelers.travelerId, travelerId),
      ),
    )

  return rows.find((row) => metadataProductExtraId(row.metadata) === productExtraId) ?? null
}

async function createBookingTotalExtraItem(
  db: PostgresJsDatabase,
  input: {
    bookingId: string
    travelerId: string
    productId: string
    optionId: string | null
    extra: typeof productExtrasRef.$inferSelect
    optionExtraConfigId: string | null
    sellCurrency: string
    unitSellAmountCents: number | null
    totalSellAmountCents: number | null
    slotId: string
  },
) {
  const bookingItemId = newId("booking_items")
  const now = new Date()
  await db.insert(bookingItems).values({
    id: bookingItemId,
    bookingId: input.bookingId,
    title: input.extra.name,
    description: input.extra.description,
    itemType: "extra",
    status: "confirmed",
    quantity: 1,
    sellCurrency: input.sellCurrency,
    unitSellAmountCents: input.unitSellAmountCents,
    totalSellAmountCents: input.totalSellAmountCents,
    productId: input.productId,
    optionId: input.optionId,
    metadata: {
      productExtraId: input.extra.id,
      optionExtraConfigId: input.optionExtraConfigId,
      pricingMode: input.extra.pricingMode,
      pricedPerPerson: input.extra.pricedPerPerson,
      availabilitySlotId: input.slotId,
    },
    createdAt: now,
    updatedAt: now,
  })

  await db.insert(bookingItemTravelers).values({
    id: newId("booking_item_travelers"),
    bookingItemId,
    travelerId: input.travelerId,
    role: "traveler",
    isPrimary: false,
  })

  return bookingItemId
}
