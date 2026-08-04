/**
 * Allocation admin-route coverage. The pre-existing `routes.test.ts` has zero
 * occurrences of "allocation": every leg of the departure-workspace surface —
 * manifest, resources, assignment, exports, automations — was only ever
 * exercised through its service functions.
 */

import { availabilitySlots } from "@voyant-travel/availability/schema"
import { newId } from "@voyant-travel/db/lib/typeid"
import { cleanupTestDb, createTestDb } from "@voyant-travel/db/test-utils"
import { sql } from "drizzle-orm"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"
import { Hono } from "hono"
import { beforeAll, beforeEach, describe, expect, it } from "vitest"

import { productOptions, products } from "../../../../inventory/src/schema.js"
import { availabilityAdminRoutes } from "../../../src/availability/routes.js"
import { resources } from "../../../src/resources/schema.js"

const DB_AVAILABLE = Boolean(process.env.TEST_DATABASE_URL)

const json = (body: Record<string, unknown>) => ({
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
})

describe.skipIf(!DB_AVAILABLE)("Availability allocation routes", () => {
  let db: PostgresJsDatabase
  let app: Hono
  let productId: string
  let optionId: string
  let slotId: string

  // One TRUNCATE for the file, not one per test: `cleanupTestDb` truncates the
  // whole ~500-table schema and takes tens of seconds on a cold Postgres, which
  // blows the 60s hook timeout. Each test gets its own departure instead, so
  // they cannot see each other's rows.
  beforeAll(async () => {
    db = createTestDb() as PostgresJsDatabase
    app = new Hono()
    app.use("*", async (c, next) => {
      c.set("db" as never, db)
      c.set("userId" as never, "usr_test")
      await next()
    })
    app.route("/", availabilityAdminRoutes)

    await cleanupTestDb(db)
    productId = newId("products")
    optionId = newId("product_options")
    await db.insert(products).values({
      id: productId,
      name: "Transylvania Coach Tour",
      sellCurrency: "EUR",
      bookingMode: "date",
    })
    await db.insert(productOptions).values({
      id: optionId,
      productId,
      name: "Standard",
      status: "active",
      sortOrder: 0,
    })
  }, 120000)

  beforeEach(async () => {
    slotId = newId("availability_slots")
    await db.insert(availabilitySlots).values({
      id: slotId,
      productId,
      optionId,
      dateLocal: "2026-06-01",
      startsAt: new Date("2026-06-01T08:00:00Z"),
      endsAt: new Date("2026-06-03T18:00:00Z"),
      timezone: "UTC",
      status: "open",
      unlimited: false,
      initialPax: 20,
      remainingPax: 20,
    })
  })

  async function seedBooking(bookingNumber: string, travelerIds: string[]) {
    const bookingId = newId("bookings")
    const bookingItemId = newId("booking_items")
    await db.execute(sql`
      INSERT INTO bookings (id, booking_number, status, sell_currency, pax)
      VALUES (${bookingId}, ${bookingNumber}, 'confirmed', 'EUR', ${travelerIds.length})
    `)
    await db.execute(sql`
      INSERT INTO booking_items
        (id, booking_id, title, status, quantity, sell_currency, product_id, option_id, availability_slot_id)
      VALUES (${bookingItemId}, ${bookingId}, 'Coach seat', 'confirmed', ${travelerIds.length},
              'EUR', ${productId}, ${optionId}, ${slotId})
    `)
    await db.execute(sql`
      INSERT INTO booking_allocations
        (id, booking_id, booking_item_id, product_id, availability_slot_id, quantity, allocation_type, status)
      VALUES (${newId("booking_allocations")}, ${bookingId}, ${bookingItemId}, ${productId},
              ${slotId}, ${travelerIds.length}, 'unit', 'confirmed')
    `)
    for (const travelerId of travelerIds) {
      await db.execute(sql`
        INSERT INTO booking_travelers (id, booking_id, participant_type, first_name, last_name)
        VALUES (${travelerId}, ${bookingId}, 'traveler', 'Test', ${travelerId.slice(-4)})
      `)
    }
    return bookingId
  }

  async function createResource(body: Record<string, unknown>) {
    const res = await app.request(`/slots/${slotId}/allocation/resources`, {
      method: "POST",
      ...json(body),
    })
    expect(res.status).toBe(201)
    return (await res.json()).data as {
      id: string
      updatedAt: string
      capacity: number
      kind: string
    }
  }

  it("serves the manifest with its resources", async () => {
    await createResource({ kind: "room", label: "DBL 1", capacity: 2 })
    const res = await app.request(`/slots/${slotId}/allocation`)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data.resources).toHaveLength(1)
    expect(body.data.summary.bookingCount).toBe(0)
  })

  it("enforces the expectedUpdatedAt precondition on resource update and delete", async () => {
    const room = await createResource({ kind: "room", label: "DBL 1", capacity: 2 })

    const stale = await app.request(`/slots/${slotId}/allocation/resources/${room.id}`, {
      method: "PATCH",
      ...json({ capacity: 3, expectedUpdatedAt: "2020-01-01T00:00:00.000Z" }),
    })
    expect(stale.status).toBe(409)
    expect((await stale.json()).detail.reason).toBe("revision_conflict")

    const fresh = await app.request(`/slots/${slotId}/allocation/resources/${room.id}`, {
      method: "PATCH",
      ...json({ capacity: 3, expectedUpdatedAt: room.updatedAt }),
    })
    expect(fresh.status).toBe(200)
    expect((await fresh.json()).data.capacity).toBe(3)

    const staleDelete = await app.request(
      `/slots/${slotId}/allocation/resources/${room.id}?expectedUpdatedAt=${encodeURIComponent(room.updatedAt)}`,
      { method: "DELETE" },
    )
    expect(staleDelete.status).toBe(409)
  })

  it("places a whole sharing group atomically, or none of it", async () => {
    const travelerIds = [newId("booking_travelers"), newId("booking_travelers")]
    await seedBooking("ALLOC-ROUTE-1", travelerIds)
    const twin = await createResource({ kind: "room", label: "TWIN", capacity: 2 })
    const single = await createResource({ kind: "room", label: "SGL", capacity: 1 })

    const overflow = await app.request(`/slots/${slotId}/allocation/travelers/assignments`, {
      method: "POST",
      ...json({
        kind: "room",
        assignments: travelerIds.map((travelerId) => ({ travelerId, resourceId: single.id })),
      }),
    })
    expect(overflow.status).toBe(409)

    // Nothing landed: the rejected batch rolled back whole.
    const afterFailure = await app.request(`/slots/${slotId}/allocation`)
    const failureBody = await afterFailure.json()
    for (const booking of failureBody.data.bookings) {
      for (const traveler of booking.travelers) {
        expect(traveler.allocations.room).toBeUndefined()
      }
    }

    const ok = await app.request(`/slots/${slotId}/allocation/travelers/assignments`, {
      method: "POST",
      ...json({
        kind: "room",
        assignments: travelerIds.map((travelerId) => ({
          travelerId,
          resourceId: twin.id,
          expectedResourceId: null,
        })),
      }),
    })
    expect(ok.status).toBe(200)
    expect((await ok.json()).data.assigned).toBe(2)
  })

  it("rejects a batch whose optimistic precondition no longer holds", async () => {
    const travelerIds = [newId("booking_travelers")]
    await seedBooking("ALLOC-ROUTE-2", travelerIds)
    const twin = await createResource({ kind: "room", label: "TWIN", capacity: 2 })

    const res = await app.request(`/slots/${slotId}/allocation/travelers/assignments`, {
      method: "POST",
      ...json({
        kind: "room",
        assignments: [
          { travelerId: travelerIds[0], resourceId: twin.id, expectedResourceId: "avr_other" },
        ],
      }),
    })
    expect(res.status).toBe(409)
    expect((await res.json()).detail.reason).toBe("revision_conflict")
  })

  it("previews an auto-allocation without writing it", async () => {
    const travelerIds = [newId("booking_travelers"), newId("booking_travelers")]
    await seedBooking("ALLOC-ROUTE-3", travelerIds)
    await createResource({ kind: "room", label: "DBL 1", capacity: 2 })

    const preview = await app.request(`/slots/${slotId}/allocation/auto-allocate/preview`, {
      method: "POST",
      ...json({ kind: "room" }),
    })
    expect(preview.status).toBe(200)
    const plan = (await preview.json()).data
    expect(plan.assigned).toBe(2)
    expect(plan.violations).toEqual([])
    expect(plan.entries.every((entry: { unchanged: boolean }) => entry.unchanged === false)).toBe(
      true,
    )

    const manifest = await (await app.request(`/slots/${slotId}/allocation`)).json()
    for (const booking of manifest.data.bookings) {
      for (const traveler of booking.travelers) {
        expect(traveler.allocations.room).toBeUndefined()
      }
    }

    const committed = await app.request(`/slots/${slotId}/allocation/auto-allocate`, {
      method: "POST",
      ...json({ kind: "room" }),
    })
    expect(committed.status).toBe(200)
    expect((await committed.json()).data.assigned).toBe(2)
  })

  it("projects allocation conflicts for the requested kind", async () => {
    const travelerIds = [newId("booking_travelers"), newId("booking_travelers")]
    await seedBooking("ALLOC-ROUTE-4", travelerIds)
    await createResource({ kind: "room", label: "SGL", capacity: 1 })

    const res = await app.request(`/slots/${slotId}/allocation/conflicts?kind=room`)
    expect(res.status).toBe(200)
    const conflicts = (await res.json()).data as Array<{ code: string; subjectId: string }>
    expect(conflicts.map((conflict) => conflict.code)).toEqual([
      "traveler_unassigned",
      "traveler_unassigned",
    ])

    const missing = await app.request(`/slots/${newId("availability_slots")}/allocation/conflicts`)
    expect(missing.status).toBe(404)
  })

  it("exports a seating manifest, which the route could not reach before", async () => {
    const travelerIds = [newId("booking_travelers")]
    await seedBooking("ALLOC-ROUTE-5", travelerIds)
    const coach = await createResource({ kind: "vehicle", label: "Coach 1", capacity: 4 })
    const seat = await createResource({
      kind: "vehicle_seat",
      label: "1A",
      capacity: 1,
      parentId: coach.id,
    })
    const assigned = await app.request(`/slots/${slotId}/allocation/travelers/${travelerIds[0]}`, {
      method: "PATCH",
      ...json({ kind: "vehicle_seat", resourceId: seat.id }),
    })
    expect(assigned.status).toBe(200)

    const res = await app.request(
      `/slots/${slotId}/allocation/export-rooming-list?kind=vehicle_seat`,
    )
    expect(res.status).toBe(200)
    expect(res.headers.get("Content-Disposition")).toContain(`seating-`)
    const csv = await res.text()
    expect(csv).toContain("1A")

    const rooming = await app.request(`/slots/${slotId}/allocation/export-rooming-list`)
    expect(rooming.headers.get("Content-Disposition")).toContain("rooming-")
  })

  it("attaches and detaches a fleet resource over HTTP", async () => {
    const coachId = newId("resources")
    await db.insert(resources).values({
      id: coachId,
      kind: "vehicle",
      name: "Setra S 517",
      capacity: 49,
      active: true,
    })

    const attach = await app.request(`/slots/${slotId}/allocation/fleet-resources`, {
      method: "POST",
      ...json({ resourceId: coachId }),
    })
    expect(attach.status).toBe(201)
    expect((await attach.json()).data.created).toBe(true)

    const listed = await app.request(`/slots/${slotId}/allocation/fleet-resources`)
    expect((await listed.json()).data).toHaveLength(1)

    const detach = await app.request(`/slots/${slotId}/allocation/fleet-resources/${coachId}`, {
      method: "DELETE",
    })
    expect(detach.status).toBe(200)
    expect((await detach.json()).data.removedResourceIds).toHaveLength(1)

    const missing = await app.request(`/slots/${slotId}/allocation/fleet-resources/${coachId}`, {
      method: "DELETE",
    })
    expect(missing.status).toBe(404)
  })

  it("replays a retried auto-allocate carrying the same Idempotency-Key", async () => {
    const travelerIds = [newId("booking_travelers"), newId("booking_travelers")]
    await seedBooking("ALLOC-ROUTE-6", travelerIds)
    await createResource({ kind: "room", label: "DBL 1", capacity: 2 })

    const request = () =>
      app.request(`/slots/${slotId}/allocation/auto-allocate`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": "retry-1" },
        body: JSON.stringify({ kind: "room" }),
      })

    const first = await request()
    expect(first.status).toBe(200)
    const second = await request()
    expect(second.status).toBe(200)
    expect(second.headers.get("Idempotency-Replayed")).toBe("true")

    const audit = await db.execute<{ action: string }>(sql`
      SELECT action FROM allocation_audit_log WHERE slot_id = ${slotId} AND action = 'auto-allocate'
    `)
    expect([...audit]).toHaveLength(1)
  })

  it("reports skipped groups instead of 409 when materialising twice", async () => {
    await db.execute(sql`
      INSERT INTO product_option_resource_templates
        (id, product_option_id, kind, capacity, name_pattern, default_count)
      VALUES (${newId("product_option_resource_templates")}, ${optionId}, 'room', 2, 'DBL {sequence}', 3)
    `)

    const first = await app.request(`/slots/${slotId}/allocation/materialize-templates`, {
      method: "POST",
    })
    expect(first.status).toBe(200)
    expect((await first.json()).data).toEqual({ created: 3, skippedExisting: 0 })

    const second = await app.request(`/slots/${slotId}/allocation/materialize-templates`, {
      method: "POST",
    })
    expect(second.status).toBe(200)
    expect((await second.json()).data).toEqual({ created: 0, skippedExisting: 1 })
  })
})
