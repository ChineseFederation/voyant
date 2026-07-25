import { appendActionLedgerMutation } from "@voyant-travel/action-ledger"
import { actionLedgerEntries } from "@voyant-travel/action-ledger/schema"
import type { ToolHandlerActionPolicyContext } from "@voyant-travel/tools"
import { eq, sql } from "drizzle-orm"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"

import { availabilitySlotsRef } from "../../src/availability-ref.js"
import { productsRef } from "../../src/products-ref.js"
import { bookingAllocations, bookingItems, bookings } from "../../src/schema.js"
import {
  bookingsService,
  buildBookingReservationCommandFingerprint,
  buildLegacyBookingReservationCommandFingerprint,
} from "../../src/service.js"
import { RESERVE_BOOKING_HANDLER_POLICY } from "../../src/tools.js"

const DB_AVAILABLE = !!process.env.TEST_DATABASE_URL

let seq = 0
function nextBookingNumber() {
  seq += 1
  return `BK-BATCH-${String(seq).padStart(6, "0")}`
}

function reservationAdmitted(idempotencyKey: string): ToolHandlerActionPolicyContext {
  return {
    capabilityId: RESERVE_BOOKING_HANDLER_POLICY.capabilityId,
    capabilityVersion: RESERVE_BOOKING_HANDLER_POLICY.capabilityVersion,
    canonicalName: RESERVE_BOOKING_HANDLER_POLICY.canonicalName,
    actionPolicy: {
      ...RESERVE_BOOKING_HANDLER_POLICY.actionPolicy,
      enforcement: "handler",
      invocation: {
        requiredFields: ["confirmed"],
        optionalFields: ["targetId", "idempotencyKey", "idempotencyFingerprint"],
      },
    },
    invocation: { confirmed: true, idempotencyKey },
  }
}

/**
 * Covers the Phase 2.5 (perf T7) reserveBooking shape: catalog snapshots
 * resolved BEFORE the transaction and ONE batched insert per table inside
 * it. These tests pin the externally observable contract — per-item rows,
 * allocation->item linkage, snapshot precedence, and all-or-nothing
 * rollback — so the batching can't silently change behavior.
 */
describe.skipIf(!DB_AVAILABLE)("bookings reserve — batched inserts", () => {
  // biome-ignore lint/suspicious/noExplicitAny: test db helper type is loaded dynamically -- owner: bookings; existing suppression is intentional pending typed cleanup.
  let db: any

  beforeAll(async () => {
    const { createTestDb, cleanupTestDb } = await import("@voyant-travel/db/test-utils")
    db = createTestDb()
    await cleanupTestDb(db)
    await ensureCatalogTables()
  })

  afterAll(async () => {
    const { closeTestDb } = await import("@voyant-travel/db/test-utils")
    await closeTestDb()
  })

  beforeEach(async () => {
    const { cleanupTestDb } = await import("@voyant-travel/db/test-utils")
    await cleanupTestDb(db)
    await ensureCatalogTables()
  })

  async function ensureCatalogTables() {
    await db.execute(sql`
      create table if not exists products (
        id text primary key,
        name text not null,
        status text not null default 'active',
        description text,
        visibility text not null default 'public',
        activated boolean not null default true,
        reservation_timeout_minutes integer,
        sell_currency text not null default 'EUR',
        sell_amount_cents integer,
        cost_amount_cents integer,
        margin_percent integer,
        supplier_id text,
        start_date date,
        end_date date,
        pax integer
      )
    `)
    await db.execute(sql`
      create table if not exists product_options (
        id text primary key,
        product_id text not null,
        name text not null,
        status text not null default 'active',
        is_default boolean not null default false,
        sort_order integer not null default 0,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now()
      )
    `)
    await db.execute(sql`
      create table if not exists availability_slots (
        id text primary key,
        product_id text not null,
        option_id text,
        facility_id text,
        availability_rule_id text,
        start_time_id text,
        date_local date not null,
        starts_at timestamptz not null,
        ends_at timestamptz,
        timezone text not null,
        status text not null,
        unlimited boolean not null,
        initial_pax integer,
        remaining_pax integer,
        initial_pickups integer,
        remaining_pickups integer,
        remaining_resources integer,
        past_cutoff boolean not null default false,
        too_early boolean not null default false,
        nights integer,
        days integer,
        notes text,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now()
      )
    `)
  }

  async function seedProduct(name: string) {
    const [product] = await db
      .insert(productsRef)
      .values({
        name,
        status: "active",
        visibility: "public",
        activated: true,
        sellCurrency: "EUR",
      })
      .returning()
    if (!product) throw new Error("seedProduct: insert returned no rows")
    return product
  }

  let optionSeq = 0
  async function seedOption(productId: string, name: string) {
    optionSeq += 1
    const id = `popt_${String(optionSeq).padStart(8, "0")}`
    await db.execute(sql`
      insert into product_options (id, product_id, name, status, is_default)
      values (${id}, ${productId}, ${name}, 'active', true)
    `)
    return id
  }

  async function seedSlot(productId: string, dateLocal: string, remainingPax = 10) {
    const [slot] = await db
      .insert(availabilitySlotsRef)
      .values({
        productId,
        dateLocal,
        startsAt: new Date(`${dateLocal}T09:00:00.000Z`),
        endsAt: new Date(`${dateLocal}T11:00:00.000Z`),
        timezone: "Europe/Bucharest",
        status: "open",
        unlimited: false,
        initialPax: remainingPax,
        remainingPax,
      })
      .returning()
    if (!slot) throw new Error("seedSlot: insert returned no rows")
    return slot
  }

  it("a 3-item reserve creates one item + one allocation per input item, each allocation linked to its own item", async () => {
    const productA = await seedProduct("Carpathian Hike")
    const productB = await seedProduct("Danube Cruise")
    const slotA = await seedSlot(productA.id, "2026-07-01", 10)
    const slotB = await seedSlot(productB.id, "2026-07-02", 10)
    const slotC = await seedSlot(productB.id, "2026-07-03", 10)

    const result = await bookingsService.reserveBooking(db, {
      bookingNumber: nextBookingNumber(),
      sellCurrency: "EUR",
      sourceType: "manual" as const,
      holdMinutes: 30,
      items: [
        {
          title: "Hike seat",
          itemType: "unit" as const,
          quantity: 2,
          sellCurrency: "EUR",
          allocationType: "unit" as const,
          availabilitySlotId: slotA.id,
        },
        {
          title: "Cruise cabin day 1",
          itemType: "unit" as const,
          quantity: 1,
          sellCurrency: "EUR",
          allocationType: "unit" as const,
          availabilitySlotId: slotB.id,
        },
        {
          title: "Cruise cabin day 2",
          itemType: "unit" as const,
          quantity: 3,
          sellCurrency: "EUR",
          allocationType: "unit" as const,
          availabilitySlotId: slotC.id,
          // Caller-supplied snapshot must win over the catalog lookup.
          productNameSnapshot: "Custom Label",
        },
      ],
    })

    expect(result.status).toBe("ok")
    if (result.status !== "ok") return

    const items = await db
      .select()
      .from(bookingItems)
      .where(eq(bookingItems.bookingId, result.booking.id))
    const allocations = await db
      .select()
      .from(bookingAllocations)
      .where(eq(bookingAllocations.bookingId, result.booking.id))

    expect(items).toHaveLength(3)
    expect(allocations).toHaveLength(3)

    // Each allocation references the booking item created for the same slot.
    // biome-ignore lint/suspicious/noExplicitAny: drizzle rows in a loosely typed test db -- owner: bookings; existing suppression is intentional pending typed cleanup.
    const itemBySlot = new Map(items.map((item: any) => [item.availabilitySlotId, item]))
    for (const allocation of allocations) {
      const item = itemBySlot.get(allocation.availabilitySlotId)
      expect(item).toBeDefined()
      expect(allocation.bookingItemId).toBe(item.id)
      expect(allocation.quantity).toBe(item.quantity)
      expect(allocation.status).toBe("held")
      expect(allocation.holdExpiresAt).toEqual(result.booking.holdExpiresAt)
    }

    // Per-item slot data + catalog snapshots survived the batching.
    const itemA = itemBySlot.get(slotA.id)
    expect(itemA.serviceDate).toBe("2026-07-01")
    expect(itemA.productId).toBe(productA.id)
    expect(itemA.productNameSnapshot).toBe("Carpathian Hike")
    expect(itemA.status).toBe("on_hold")
    expect(itemA.quantity).toBe(2)

    const itemB = itemBySlot.get(slotB.id)
    expect(itemB.productNameSnapshot).toBe("Danube Cruise")
    expect(itemB.serviceDate).toBe("2026-07-02")

    const itemC = itemBySlot.get(slotC.id)
    expect(itemC.productNameSnapshot).toBe("Custom Label")

    // Capacity was adjusted per item.
    const [refreshedA] = await db
      .select({ remainingPax: availabilitySlotsRef.remainingPax })
      .from(availabilitySlotsRef)
      .where(eq(availabilitySlotsRef.id, slotA.id))
    expect(refreshedA?.remainingPax).toBe(8)
    const [refreshedC] = await db
      .select({ remainingPax: availabilitySlotsRef.remainingPax })
      .from(availabilitySlotsRef)
      .where(eq(availabilitySlotsRef.id, slotC.id))
    expect(refreshedC?.remainingPax).toBe(7)
  })

  it("rolls back the whole reserve when a later item lacks capacity", async () => {
    const product = await seedProduct("Sold Out Tour")
    const slotOk = await seedSlot(product.id, "2026-08-01", 10)
    const slotFull = await seedSlot(product.id, "2026-08-02", 1)

    const result = await bookingsService.reserveBooking(db, {
      bookingNumber: nextBookingNumber(),
      sellCurrency: "EUR",
      sourceType: "manual" as const,
      holdMinutes: 30,
      items: [
        {
          title: "Fits",
          itemType: "unit" as const,
          quantity: 2,
          sellCurrency: "EUR",
          allocationType: "unit" as const,
          availabilitySlotId: slotOk.id,
        },
        {
          title: "Does not fit",
          itemType: "unit" as const,
          quantity: 5,
          sellCurrency: "EUR",
          allocationType: "unit" as const,
          availabilitySlotId: slotFull.id,
        },
      ],
    })

    expect(result.status).toBe("insufficient_capacity")

    const allBookings = await db.select().from(bookings)
    expect(allBookings).toHaveLength(0)
    const allItems = await db.select().from(bookingItems)
    expect(allItems).toHaveLength(0)
    const allAllocations = await db.select().from(bookingAllocations)
    expect(allAllocations).toHaveLength(0)

    // The first slot's capacity adjustment must have been rolled back too.
    const [refreshed] = await db
      .select({ remainingPax: availabilitySlotsRef.remainingPax })
      .from(availabilitySlotsRef)
      .where(eq(availabilitySlotsRef.id, slotOk.id))
    expect(refreshed?.remainingPax).toBe(10)
  })

  it("reserves an item carrying its product's option against an option-less slot", async () => {
    // A slot with option_id = NULL is not option-scoped: it applies to any
    // option of its product. Paths like the storefront compat bootstrap derive
    // and stamp an option id onto the item, so reserving must accept it rather
    // than fail slot_option_mismatch — which made such slots permanently
    // unbookable through the storefront (#2833).
    const product = await seedProduct("Option-less departure")
    const optionId = await seedOption(product.id, "Standard")
    const slot = await seedSlot(product.id, "2026-09-01", 10)

    const result = await bookingsService.reserveBooking(db, {
      bookingNumber: nextBookingNumber(),
      sellCurrency: "EUR",
      sourceType: "manual" as const,
      holdMinutes: 30,
      items: [
        {
          title: "Derived option seat",
          itemType: "unit" as const,
          quantity: 1,
          sellCurrency: "EUR",
          allocationType: "unit" as const,
          availabilitySlotId: slot.id,
          productId: product.id,
          optionId,
        },
      ],
    })

    expect(result.status).toBe("ok")
    if (result.status !== "ok") return

    // The item keeps its derived option id even though the slot is option-less.
    const [item] = await db
      .select()
      .from(bookingItems)
      .where(eq(bookingItems.bookingId, result.booking.id))
    expect(item.optionId).toBe(optionId)
  })

  it("rejects an option from a different product against an option-less slot", async () => {
    // Tolerating a NULL slot option must NOT let a product-level slot record an
    // option that belongs to another product (#2833 review). The option's
    // product ownership is still validated against the slot's product.
    const product = await seedProduct("Option-less departure")
    const otherProduct = await seedProduct("Unrelated product")
    const foreignOptionId = await seedOption(otherProduct.id, "Foreign option")
    const slot = await seedSlot(product.id, "2026-09-02", 10)

    const result = await bookingsService.reserveBooking(db, {
      bookingNumber: nextBookingNumber(),
      sellCurrency: "EUR",
      sourceType: "manual" as const,
      holdMinutes: 30,
      items: [
        {
          title: "Cross-product option seat",
          itemType: "unit" as const,
          quantity: 1,
          sellCurrency: "EUR",
          allocationType: "unit" as const,
          availabilitySlotId: slot.id,
          productId: product.id,
          optionId: foreignOptionId,
        },
      ],
    })

    expect(result.status).toBe("slot_option_mismatch")

    const allBookings = await db.select().from(bookings)
    expect(allBookings).toHaveLength(0)
    // The slot's capacity adjustment must have been rolled back with the reserve.
    const [refreshed] = await db
      .select({ remainingPax: availabilitySlotsRef.remainingPax })
      .from(availabilitySlotsRef)
      .where(eq(availabilitySlotsRef.id, slot.id))
    expect(refreshed?.remainingPax).toBe(10)
  })

  it("still reports slot_not_found for an unknown slot id", async () => {
    const result = await bookingsService.reserveBooking(db, {
      bookingNumber: nextBookingNumber(),
      sellCurrency: "EUR",
      sourceType: "manual" as const,
      items: [
        {
          title: "Ghost",
          itemType: "unit" as const,
          quantity: 1,
          sellCurrency: "EUR",
          allocationType: "unit" as const,
          availabilitySlotId: "avsl_does_not_exist",
        },
      ],
    })

    expect(result.status).toBe("slot_not_found")
  })

  it("replays an audited reservation without consuming capacity twice", async () => {
    const product = await seedProduct("Idempotent departure")
    const slot = await seedSlot(product.id, "2026-09-03", 2)
    const reservation = {
      bookingNumber: nextBookingNumber(),
      sellCurrency: "EUR",
      sourceType: "manual" as const,
      holdMinutes: 30,
      items: [
        {
          title: "Reserved seat",
          itemType: "unit" as const,
          quantity: 1,
          sellCurrency: "EUR",
          allocationType: "unit" as const,
          availabilitySlotId: slot.id,
        },
      ],
    }
    const expectedFingerprint = await buildBookingReservationCommandFingerprint(reservation)
    const runtime = {
      actionLedgerContext: {
        agentId: "agent_reserve",
        actor: "staff",
        callerType: "agent",
      },
      actionLedgerAdmitted: reservationAdmitted("reserve-command-1"),
    }

    const first = await bookingsService.reserveBooking(db, reservation, "usr_reserve", runtime)
    const replay = await bookingsService.reserveBooking(db, reservation, "usr_reserve", runtime)

    expect(first.status).toBe("ok")
    expect(replay.status).toBe("ok")
    if (first.status !== "ok" || replay.status !== "ok") return
    expect(first).toMatchObject({ replayed: false })
    expect(replay).toMatchObject({ replayed: true, booking: { id: first.booking.id } })

    const allBookings = await db.select().from(bookings)
    expect(allBookings).toHaveLength(1)
    const [refreshed] = await db
      .select({ remainingPax: availabilitySlotsRef.remainingPax })
      .from(availabilitySlotsRef)
      .where(eq(availabilitySlotsRef.id, slot.id))
    expect(refreshed?.remainingPax).toBe(1)

    const ledgerEntries = await db
      .select()
      .from(actionLedgerEntries)
      .where(eq(actionLedgerEntries.actionName, "booking.reserve"))
    expect(ledgerEntries).toHaveLength(2)
    const claim = ledgerEntries.find((entry) => entry.status === "requested")
    const completed = ledgerEntries.find((entry) => entry.status === "succeeded")
    expect(claim).toMatchObject({
      actionName: "booking.reserve",
      actionVersion: "v1",
      actionKind: "create",
      evaluatedRisk: "high",
      targetType: "booking_reservation_command",
      targetId: reservation.bookingNumber,
      actorType: "staff",
      principalType: "agent",
      principalId: "agent_reserve",
      callerType: "agent",
      routeOrToolName: "bookings.reserve_booking",
      capabilityId: "bookings:reserve",
      capabilityVersion: "v1",
      authorizationSource: "selected_graph_mcp_handler",
      approvalId: null,
      idempotencyScope: "bookings.reserve_booking:created-command-claim",
      idempotencyKey: "reserve-command-1",
      idempotencyFingerprint: expectedFingerprint,
    })
    expect(completed).toMatchObject({
      actionName: "booking.reserve",
      actionVersion: "v1",
      actionKind: "create",
      evaluatedRisk: "high",
      targetType: "booking",
      targetId: first.booking.id,
      actorType: "staff",
      principalType: "agent",
      principalId: "agent_reserve",
      callerType: "agent",
      routeOrToolName: "bookings.reserve_booking",
      capabilityId: "bookings:reserve",
      capabilityVersion: "v1",
      authorizationSource: "selected_graph_mcp_handler",
      causationActionId: claim?.id,
      approvalId: null,
      idempotencyScope: "bookings.reserve_booking:created-command-result",
      idempotencyKey: "reserve-command-1",
      idempotencyFingerprint: expectedFingerprint,
    })

    const conflictingReservation = { ...reservation, bookingNumber: nextBookingNumber() }
    const conflict = await bookingsService.reserveBooking(
      db,
      conflictingReservation,
      "usr_reserve",
      {
        ...runtime,
      },
    )
    expect(conflict).toMatchObject({
      status: "idempotency_conflict",
      existingActionId: claim?.id,
    })
  })

  it("migrates an exact legacy reservation replay and rejects different commands using its key", async () => {
    const product = await seedProduct("Legacy idempotent departure")
    const slot = await seedSlot(product.id, "2026-09-04", 2)
    const reservation = {
      bookingNumber: nextBookingNumber(),
      sellCurrency: "EUR",
      sourceType: "manual" as const,
      holdMinutes: 30,
      items: [
        {
          title: "Legacy reserved seat",
          itemType: "unit" as const,
          quantity: 1,
          sellCurrency: "EUR",
          allocationType: "unit" as const,
          availabilitySlotId: slot.id,
        },
      ],
    }
    const original = await bookingsService.reserveBooking(db, reservation, "agent_legacy_reserve")
    expect(original.status).toBe("ok")
    if (original.status !== "ok") return

    const context = {
      agentId: "agent_legacy_reserve",
      actor: "staff",
      callerType: "agent",
    }
    const idempotencyKey = "legacy-reserve-command-1"
    const legacyScope = "bookings.reserve_booking:agent_legacy_reserve"
    const legacyFingerprint = await buildLegacyBookingReservationCommandFingerprint(reservation)
    const legacyClaim = await appendActionLedgerMutation(db, {
      context,
      actionName: "booking.reserve",
      actionVersion: "v1",
      actionKind: "create",
      status: "requested",
      evaluatedRisk: "high",
      targetType: "booking_reservation_command",
      targetId: reservation.bookingNumber,
      routeOrToolName: "bookings.reserve_booking",
      capabilityId: "bookings:reserve",
      capabilityVersion: "v1",
      authorizationSource: "selected_graph_mcp_handler",
      idempotencyScope: `${legacyScope}:claim`,
      idempotencyKey,
      idempotencyFingerprint: legacyFingerprint,
      mutationDetail: {
        summary: `Booking reservation ${reservation.bookingNumber} claimed`,
        reversalKind: "none",
      },
    })
    await appendActionLedgerMutation(db, {
      context,
      actionName: "booking.reserve",
      actionVersion: "v1",
      actionKind: "create",
      status: "succeeded",
      evaluatedRisk: "high",
      targetType: "booking",
      targetId: original.booking.id,
      routeOrToolName: "bookings.reserve_booking",
      capabilityId: "bookings:reserve",
      capabilityVersion: "v1",
      authorizationSource: "selected_graph_mcp_handler",
      causationActionId: legacyClaim.entry.id,
      idempotencyScope: `${legacyScope}:result`,
      idempotencyKey,
      idempotencyFingerprint: legacyFingerprint,
      mutationDetail: {
        commandResultRef: `booking:${original.booking.id}`,
        summary: `Booking ${reservation.bookingNumber} reserved`,
        reversalKind: "domain_command",
        reversalCommandId: "booking.status.cancel",
        reversalCommandVersion: "v1",
      },
    })

    const runtime = {
      actionLedgerContext: context,
      actionLedgerAdmitted: reservationAdmitted(idempotencyKey),
      actionLedgerLegacyIdempotencyScope: legacyScope,
      actionLedgerLegacyIdempotencyFingerprint: legacyFingerprint,
    }
    const replay = await bookingsService.reserveBooking(
      db,
      reservation,
      "agent_legacy_reserve",
      runtime,
    )
    expect(replay).toMatchObject({
      status: "ok",
      replayed: true,
      booking: { id: original.booking.id },
    })
    expect(await db.select().from(bookings)).toHaveLength(1)
    const [refreshed] = await db
      .select({ remainingPax: availabilitySlotsRef.remainingPax })
      .from(availabilitySlotsRef)
      .where(eq(availabilitySlotsRef.id, slot.id))
    expect(refreshed?.remainingPax).toBe(1)
    const ledgerEntries = await db
      .select()
      .from(actionLedgerEntries)
      .where(eq(actionLedgerEntries.actionName, "booking.reserve"))
    expect(ledgerEntries).toHaveLength(4)

    const conflictingReservation = { ...reservation, bookingNumber: nextBookingNumber() }
    const conflict = await bookingsService.reserveBooking(
      db,
      conflictingReservation,
      "agent_legacy_reserve",
      {
        ...runtime,
        actionLedgerLegacyIdempotencyFingerprint:
          await buildLegacyBookingReservationCommandFingerprint(conflictingReservation),
      },
    )
    expect(conflict).toMatchObject({
      status: "idempotency_conflict",
      existingActionId: legacyClaim.entry.id,
    })
  })
})
