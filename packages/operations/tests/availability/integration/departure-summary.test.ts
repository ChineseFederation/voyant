import { newId } from "@voyant-travel/db/lib/typeid"
import { cleanupTestDb, createTestDb } from "@voyant-travel/db/test-utils"
import { availabilitySlots } from "@voyant-travel/operations/schema"
import { sql } from "drizzle-orm"
import { beforeAll, beforeEach, describe, expect, it } from "vitest"
import { products } from "../../../../inventory/src/schema.js"
import { getSlotAllocationManifest } from "../../../src/availability/service-allocation.js"
import { getDepartureCapacityCounters } from "../../../src/availability/service-departure-capacity.js"
import {
  type DepartureIssueCode,
  getDepartureIssues,
} from "../../../src/availability/service-departure-issues.js"
import { getDepartureSummary } from "../../../src/availability/service-departure-summary.js"

const DB_AVAILABLE = !!process.env.TEST_DATABASE_URL

/**
 * The reconciliation the departure workspace exists for: a departure whose
 * booked pax and entered travelers disagree, and which is carrying an
 * allocation that expired without anyone releasing it. Both are asserted by
 * their stable issue code, and both are asserted to clear once repaired — a
 * detector that never goes quiet is as useless as one that never fires.
 */
describe.skipIf(!DB_AVAILABLE)("departure summary (integration)", () => {
  // biome-ignore lint/suspicious/noExplicitAny: drizzle test client -- owner: availability; matches the sibling availability suites.
  let db: any
  let productId: string
  let productVersionId: string
  let slotId: string

  beforeAll(() => {
    db = createTestDb()
  })

  beforeEach(async () => {
    await cleanupTestDb(db)
    productId = newId("products")
    productVersionId = newId("product_versions")
    slotId = newId("availability_slots")
    await db.insert(products).values({
      id: productId,
      name: "Carpathian Ridge Trek",
      sellCurrency: "EUR",
      bookingMode: "date",
    })
    await db.insert(availabilitySlots).values({
      id: slotId,
      productId,
      productVersionId,
      dateLocal: "2026-09-14",
      startsAt: new Date("2026-09-14T06:00:00Z"),
      timezone: "UTC",
      status: "open",
      unlimited: false,
      initialPax: 12,
      remainingPax: 12,
    })
  })

  async function seedBooking(input: {
    pax: number
    travelerCount: number
    status?: "confirmed" | "in_progress" | "completed" | "cancelled"
    allocationStatus?: "held" | "confirmed" | "fulfilled" | "released"
    /** ISO instant; postgres.js rejects a bound `Date`, so seeds pass a string. */
    holdExpiresAt?: string | null
    sellAmountCents?: number
    resourceId?: string
  }) {
    const bookingId = newId("bookings")
    const bookingItemId = newId("booking_items")
    const allocationId = newId("booking_allocations")
    await db.execute(sql`
      INSERT INTO bookings (id, booking_number, status, sell_currency, pax, sell_amount_cents)
      VALUES (
        ${bookingId},
        ${`B${bookingId.slice(-6)}`},
        ${input.status ?? "confirmed"},
        'EUR',
        ${input.pax},
        ${input.sellAmountCents ?? 0}
      )
    `)
    await db.execute(sql`
      INSERT INTO booking_items (id, booking_id, title, status, quantity, sell_currency, product_id, availability_slot_id)
      VALUES (${bookingItemId}, ${bookingId}, 'Departure seat', 'confirmed', ${input.pax}, 'EUR', ${productId}, ${slotId})
    `)
    await db.execute(sql`
      INSERT INTO booking_allocations (
        id, booking_id, booking_item_id, product_id, availability_slot_id,
        quantity, allocation_type, status, hold_expires_at
      )
      VALUES (
        ${allocationId}, ${bookingId}, ${bookingItemId}, ${productId}, ${slotId},
        ${input.pax}, 'unit', ${input.allocationStatus ?? "confirmed"},
        ${input.holdExpiresAt ?? null}::timestamptz
      )
    `)

    const travelerIds: string[] = []
    for (let index = 0; index < input.travelerCount; index += 1) {
      const travelerId = newId("booking_travelers")
      travelerIds.push(travelerId)
      await db.execute(sql`
        INSERT INTO booking_travelers (id, booking_id, participant_type, first_name, last_name)
        VALUES (${travelerId}, ${bookingId}, 'traveler', 'Ana', ${`Pop${index}`})
      `)
      if (input.resourceId) {
        await db.execute(sql`
          INSERT INTO booking_traveler_travel_details (traveler_id, allocations)
          VALUES (${travelerId}, ${JSON.stringify({ room: input.resourceId })}::jsonb)
        `)
      }
    }

    return { bookingId, allocationId, travelerIds }
  }

  function codesFor(issues: ReadonlyArray<{ code: DepartureIssueCode }>) {
    return issues.map((issue) => issue.code)
  }

  it("flags booked pax without travelers and an allocation held past its expiry", async () => {
    // Four seats sold, only one name entered.
    await seedBooking({ pax: 4, travelerCount: 1, sellAmountCents: 400_00 })
    // A second booking whose hold lapsed a day ago and was never released.
    const stale = await seedBooking({
      pax: 2,
      travelerCount: 2,
      allocationStatus: "held",
      holdExpiresAt: "2026-09-13T06:00:00Z",
      sellAmountCents: 200_00,
    })

    const now = new Date("2026-09-14T05:00:00Z")
    const counters = await getDepartureCapacityCounters(db, slotId, now)
    expect(counters?.bookings.expectedPax).toBe(6)
    expect(counters?.travelers.entered).toBe(3)
    expect(counters?.travelers.missing).toBe(3)
    expect(counters?.allocations.held).toBe(1)
    expect(counters?.allocations.confirmed).toBe(1)
    expect(counters?.allocations.staleHeld).toBe(1)
    // 12 authored − 6 sold; nothing is on a live checkout hold.
    expect(counters?.derivedRemainingPax).toBe(6)
    expect(counters?.remainingPax).toBe(12)

    const issues = await getDepartureIssues(db, slotId, { now, counters: counters ?? undefined })
    expect(codesFor(issues ?? [])).toContain("travelers_missing_for_booked_pax")
    expect(codesFor(issues ?? [])).toContain("stale_held_allocation")
    // The stale row is named, not just counted, so the UI can link to it.
    expect((issues ?? []).find((issue) => issue.code === "stale_held_allocation")).toMatchObject({
      severity: "warning",
      subjectType: "booking_allocation",
      subjectId: stale.allocationId,
      count: 1,
    })
    // The stored counter never moved, so the drift is reported too.
    expect(codesFor(issues ?? [])).toContain("remaining_pax_drift")
  })

  it("clears both issues once the travelers are entered and the hold is confirmed", async () => {
    const shortBooking = await seedBooking({ pax: 4, travelerCount: 1, sellAmountCents: 400_00 })
    const stale = await seedBooking({
      pax: 2,
      travelerCount: 2,
      allocationStatus: "held",
      holdExpiresAt: "2026-09-13T06:00:00Z",
      sellAmountCents: 200_00,
    })

    const now = new Date("2026-09-14T05:00:00Z")
    // Repair 1: enter the three missing names.
    for (let index = 0; index < 3; index += 1) {
      await db.execute(sql`
        INSERT INTO booking_travelers (id, booking_id, participant_type, first_name, last_name)
        VALUES (
          ${newId("booking_travelers")}, ${shortBooking.bookingId}, 'traveler', 'Ion', ${`Ionescu${index}`}
        )
      `)
    }
    // Repair 2: confirm the lapsed hold.
    await db.execute(sql`
      UPDATE booking_allocations
      SET status = 'confirmed', hold_expires_at = NULL
      WHERE id = ${stale.allocationId}
    `)
    // Repair 3: reconcile the stored counter with what is actually consumed.
    await db.execute(sql`
      UPDATE availability_slots SET remaining_pax = 6 WHERE id = ${slotId}
    `)

    const issues = await getDepartureIssues(db, slotId, { now })
    const codes = codesFor(issues ?? [])
    expect(codes).not.toContain("travelers_missing_for_booked_pax")
    expect(codes).not.toContain("stale_held_allocation")
    expect(codes).not.toContain("remaining_pax_drift")
  })

  it("reports allocations left behind on a cancelled booking", async () => {
    const cancelled = await seedBooking({ pax: 2, travelerCount: 2, status: "cancelled" })

    const issues = await getDepartureIssues(db, slotId)
    expect(issues?.find((issue) => issue.code === "allocation_on_cancelled_booking")).toMatchObject(
      {
        subjectType: "booking",
        subjectId: cancelled.bookingId,
        count: 1,
      },
    )
    // The cancelled booking must not be counted as demand.
    const counters = await getDepartureCapacityCounters(db, slotId)
    expect(counters?.bookings.active).toBe(0)
    expect(counters?.bookings.cancelledWithLiveAllocation).toBe(1)
    expect(counters?.bookings.expectedPax).toBe(0)
  })

  it("composes one bounded envelope carrying the Product Version identity", async () => {
    await seedBooking({ pax: 2, travelerCount: 2, sellAmountCents: 200_00 })

    const summary = await getDepartureSummary(db, slotId)
    expect(summary?.departure.productVersionId).toBe(productVersionId)
    expect(summary?.departure.productId).toBe(productId)
    expect(summary?.bookings.count).toBe(1)
    expect(summary?.bookings.expectedPax).toBe(2)
    expect(summary?.bookings.currency).toBe("EUR")
    expect(summary?.bookings.soldAmountCents).toBe(200_00)
    expect(summary?.bookings.paidAmountCents).toBe(0)
    expect(summary?.bookings.outstandingAmountCents).toBe(200_00)
    expect(summary?.travelers.entered).toBe(2)
    // No Finance provider is bound in a package-level suite.
    expect(summary?.finance).toBeNull()
    expect(summary?.operations.issues.length).toBeGreaterThan(0)
  })

  it("keeps the manifest's headline counters stable while paging", async () => {
    for (let index = 0; index < 3; index += 1) {
      await seedBooking({ pax: 1, travelerCount: 2, sellAmountCents: 100_00 })
    }

    const whole = await getSlotAllocationManifest(db, slotId)
    expect(whole?.bookings).toHaveLength(3)
    expect(whole?.pagination).toEqual({ limit: null, offset: 0, total: 3 })
    expect(whole?.summary.bookingCount).toBe(3)
    expect(whole?.summary.travelerCount).toBe(6)

    const page = await getSlotAllocationManifest(db, slotId, { limit: 1, offset: 1 })
    expect(page?.bookings).toHaveLength(1)
    expect(page?.pagination).toEqual({ limit: 1, offset: 1, total: 3 })
    // The point of the change: the page shows one booking, the counters still
    // describe the whole departure.
    expect(page?.summary.bookingCount).toBe(3)
    expect(page?.summary.travelerCount).toBe(6)
    // Chip numbering is departure-local, so page 2's booking is still #2.
    expect(page?.bookings[0]?.bookingSequence).toBe(2)
    expect(page?.bookings[0]?.id).toBe(whole?.bookings[1]?.id)
  })

  /**
   * Whether a departure has a rooming plan at all, resolved the same way the
   * materializer resolves which templates it would create from. The seeded slot
   * carries no `option_id` — a PRODUCT-LEVEL departure, which
   * `materializeSlotResourcesFromTemplateDefaultsLocked` serves by drawing from
   * every option of the product. Counting only the slot's own option answered
   * zero for all of them and hid a plan the materializer would have created.
   */
  it("counts the product's option templates on a product-level departure", async () => {
    const optionId = newId("product_options")
    await db.execute(sql`
      INSERT INTO product_options (id, product_id, name)
      VALUES (${optionId}, ${productId}, 'Standard')
    `)
    await db.execute(sql`
      INSERT INTO product_option_resource_templates
        (id, product_option_id, kind, capacity, name_pattern)
      VALUES (
        ${newId("product_option_resource_templates")}, ${optionId}, 'room', 2, 'DBL {sequence}'
      )
    `)
    await seedBooking({ pax: 2, travelerCount: 2 })

    const counters = await getDepartureCapacityCounters(db, slotId)
    expect(counters?.resources.templated).toBe(1)
    expect(counters?.resources.planned).toBe(true)

    // Declared but never laid out — the one state this warning is for.
    const issues = await getDepartureIssues(db, slotId, { counters: counters ?? undefined })
    expect(codesFor(issues ?? [])).toContain("allocation_resources_missing")
  })

  it("says nothing about rooms on a departure whose catalog declares none", async () => {
    await seedBooking({ pax: 2, travelerCount: 2 })

    const counters = await getDepartureCapacityCounters(db, slotId)
    expect(counters?.resources.templated).toBe(0)
    expect(counters?.resources.planned).toBe(false)

    const issues = await getDepartureIssues(db, slotId, { counters: counters ?? undefined })
    expect(codesFor(issues ?? [])).not.toContain("allocation_resources_missing")
    expect(codesFor(issues ?? [])).not.toContain("travelers_unassigned")
  })

  it("reports a resource holding more travelers than it can seat", async () => {
    const resourceId = newId("allocation_resources")
    await db.execute(sql`
      INSERT INTO allocation_resources (id, slot_id, kind, label, capacity, sort_order, flags)
      VALUES (${resourceId}, ${slotId}, 'room', 'DBL 1', 1, 0, '{}'::jsonb)
    `)
    await seedBooking({ pax: 2, travelerCount: 2, resourceId })

    const issues = await getDepartureIssues(db, slotId)
    expect(issues?.find((issue) => issue.code === "resource_over_capacity")).toMatchObject({
      severity: "critical",
      subjectType: "allocation_resource",
      subjectId: resourceId,
      count: 1,
    })
  })
})
