/**
 * `booking_allocations.booking_item_id` is `ON DELETE CASCADE`, so deleting a
 * Booking Item takes its allocation rows with it. Before this suite, nothing
 * gave the seats back first: `availability_slots.remaining_pax` stayed
 * decremented forever with no allocation row left to reconcile from.
 *
 * The same gap applied to `quantity` edits — the item moved, the allocation
 * did not.
 *
 * These tests drive the real service methods against a live database and
 * assert on the slot row, not on a return value, because the leak is
 * invisible from the caller's side.
 */

import { eq } from "drizzle-orm"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"

import { availabilitySlotsRef } from "../../src/availability-ref.js"
import { bookingAllocations, bookingItems, bookings } from "../../src/schema.js"
import { bookingsService } from "../../src/service.js"

const DB_AVAILABLE = Boolean(process.env.TEST_DATABASE_URL)

describe.skipIf(!DB_AVAILABLE)("booking item allocation capacity", () => {
  let db: ReturnType<typeof import("@voyant-travel/db/test-utils").createTestDb>
  let sequence = 0

  beforeAll(async () => {
    const { cleanupTestDb, createTestDb } = await import("@voyant-travel/db/test-utils")
    db = createTestDb()
    await cleanupTestDb(db)
  })

  beforeEach(async () => {
    const { cleanupTestDb } = await import("@voyant-travel/db/test-utils")
    await cleanupTestDb(db)
  })

  afterAll(async () => {
    const { closeTestDb } = await import("@voyant-travel/db/test-utils")
    await closeTestDb()
  })

  /**
   * A confirmed booking holding `quantity` seats on an open slot that
   * started with `initialPax` and has `initialPax - quantity` left.
   */
  async function seedAllocatedItem(
    options: {
      quantity?: number
      initialPax?: number
      slotStatus?: "open" | "closed" | "sold_out"
      allocationStatus?: "held" | "confirmed" | "cancelled"
      withSlot?: boolean
    } = {},
  ) {
    const quantity = options.quantity ?? 1
    const initialPax = options.initialPax ?? 5
    const withSlot = options.withSlot ?? true
    sequence += 1

    const [booking] = await db
      .insert(bookings)
      .values({
        bookingNumber: `BK-CAP-${String(sequence).padStart(6, "0")}`,
        sellCurrency: "EUR",
        status: "confirmed",
      })
      .returning()

    const [slot] = withSlot
      ? await db
          .insert(availabilitySlotsRef)
          .values({
            productId: "prod_capacity",
            dateLocal: "2026-09-10",
            startsAt: new Date("2026-09-10T08:00:00.000Z"),
            timezone: "Europe/Bucharest",
            status: options.slotStatus ?? "open",
            unlimited: false,
            initialPax,
            remainingPax: initialPax - quantity,
          })
          .returning()
      : [null]

    const [item] = await db
      .insert(bookingItems)
      .values({
        bookingId: booking!.id,
        title: "Istanbul 7 days",
        status: "confirmed",
        quantity,
        sellCurrency: "EUR",
        unitSellAmountCents: 10_000,
        totalSellAmountCents: 10_000 * quantity,
        productId: "prod_capacity",
        availabilitySlotId: slot?.id ?? null,
      })
      .returning()

    const [allocation] = await db
      .insert(bookingAllocations)
      .values({
        bookingId: booking!.id,
        bookingItemId: item!.id,
        productId: "prod_capacity",
        availabilitySlotId: slot?.id ?? null,
        quantity,
        status: options.allocationStatus ?? "confirmed",
      })
      .returning()

    return { booking: booking!, slot, item: item!, allocation: allocation! }
  }

  async function readSlot(slotId: string) {
    const [row] = await db
      .select({
        remainingPax: availabilitySlotsRef.remainingPax,
        status: availabilitySlotsRef.status,
      })
      .from(availabilitySlotsRef)
      .where(eq(availabilitySlotsRef.id, slotId))
    return row
  }

  async function readAllocations(bookingId: string) {
    return db.select().from(bookingAllocations).where(eq(bookingAllocations.bookingId, bookingId))
  }

  describe("deleteItem", () => {
    it("returns the seats its allocation held before cascading it away", async () => {
      const { slot, item, booking } = await seedAllocatedItem({ quantity: 2, initialPax: 5 })
      expect((await readSlot(slot!.id))?.remainingPax).toBe(3)

      await bookingsService.deleteItem(db, item.id)

      expect((await readSlot(slot!.id))?.remainingPax).toBe(5)
      expect(await readAllocations(booking.id)).toHaveLength(0)
    })

    it("reopens a slot that the booking had sold out", async () => {
      const { slot, item } = await seedAllocatedItem({
        quantity: 2,
        initialPax: 2,
        slotStatus: "sold_out",
      })
      expect(await readSlot(slot!.id)).toMatchObject({ remainingPax: 0, status: "sold_out" })

      await bookingsService.deleteItem(db, item.id)

      expect(await readSlot(slot!.id)).toMatchObject({ remainingPax: 2, status: "open" })
    })

    it("still releases when the departure has since closed", async () => {
      // A closed departure refuses ordinary capacity mutations. Releasing
      // into one has to keep working or the seats leak precisely when an
      // operator is cleaning up a booking on a closed date.
      const { slot, item } = await seedAllocatedItem({
        quantity: 1,
        initialPax: 4,
        slotStatus: "closed",
      })

      await bookingsService.deleteItem(db, item.id)

      expect(await readSlot(slot!.id)).toMatchObject({ remainingPax: 4, status: "closed" })
    })

    it("leaves capacity alone for an allocation that already gave its seat back", async () => {
      const { slot, item } = await seedAllocatedItem({
        quantity: 1,
        initialPax: 5,
        allocationStatus: "cancelled",
      })
      // Seeded as if the release already happened.
      await db
        .update(availabilitySlotsRef)
        .set({ remainingPax: 5 })
        .where(eq(availabilitySlotsRef.id, slot!.id))

      await bookingsService.deleteItem(db, item.id)

      expect((await readSlot(slot!.id))?.remainingPax).toBe(5)
    })

    it("deletes a manually authored item that holds no allocation", async () => {
      const { booking } = await seedAllocatedItem()
      const manual = await bookingsService.createItem(db, booking.id, {
        title: "Airport transfer",
        itemType: "service",
        quantity: 1,
        sellCurrency: "EUR",
        totalSellAmountCents: 4_000,
      })
      if (!manual) throw new Error("createItem returned null")

      await expect(bookingsService.deleteItem(db, manual.id)).resolves.toMatchObject({
        id: manual.id,
      })
    })

    it("records the released allocation ids on the activity log entry", async () => {
      const { item, allocation, booking } = await seedAllocatedItem()
      await bookingsService.deleteItem(db, item.id)

      const { bookingActivityLog } = await import("../../src/schema.js")
      const entries = await db
        .select()
        .from(bookingActivityLog)
        .where(eq(bookingActivityLog.bookingId, booking.id))
      const deletion = entries.find((entry) =>
        String(entry.description).includes("Istanbul 7 days"),
      )
      expect(deletion?.metadata).toMatchObject({ releasedAllocationIds: [allocation.id] })
    })
  })

  describe("updateItem", () => {
    it("takes another seat when the quantity goes up", async () => {
      const { slot, item, booking } = await seedAllocatedItem({ quantity: 1, initialPax: 5 })

      await bookingsService.updateItem(db, item.id, { quantity: 3 })

      expect((await readSlot(slot!.id))?.remainingPax).toBe(2)
      expect((await readAllocations(booking.id))[0]?.quantity).toBe(3)
    })

    it("gives seats back when the quantity goes down", async () => {
      const { slot, item, booking } = await seedAllocatedItem({ quantity: 3, initialPax: 5 })

      await bookingsService.updateItem(db, item.id, { quantity: 1 })

      expect((await readSlot(slot!.id))?.remainingPax).toBe(4)
      expect((await readAllocations(booking.id))[0]?.quantity).toBe(1)
    })

    it("refuses to oversell the departure", async () => {
      const { slot, item, booking } = await seedAllocatedItem({ quantity: 1, initialPax: 2 })

      await expect(bookingsService.updateItem(db, item.id, { quantity: 4 })).rejects.toThrow(
        "insufficient_capacity",
      )

      // The whole update is one transaction: nothing moved.
      expect((await readSlot(slot!.id))?.remainingPax).toBe(1)
      expect((await readAllocations(booking.id))[0]?.quantity).toBe(1)
      const [row] = await db.select().from(bookingItems).where(eq(bookingItems.id, item.id))
      expect(row?.quantity).toBe(1)
      expect(booking.id).toBeTruthy()
    })

    it("leaves capacity alone when the quantity is unchanged", async () => {
      const { slot, item } = await seedAllocatedItem({ quantity: 2, initialPax: 5 })

      await bookingsService.updateItem(db, item.id, { quantity: 2, title: "Renamed" })

      expect((await readSlot(slot!.id))?.remainingPax).toBe(3)
    })

    it("moves an allocation that has no slot without touching availability", async () => {
      // Sourced inventory: the allocation is real but the authoritative
      // capacity lives at the supplier, not in a local slot.
      const { item, booking } = await seedAllocatedItem({ quantity: 1, withSlot: false })

      await bookingsService.updateItem(db, item.id, { quantity: 2 })

      expect((await readAllocations(booking.id))[0]?.quantity).toBe(2)
    })
  })
})
