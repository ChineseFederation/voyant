// Acceptance tracer (voyant#4038): the SAME Product / Product Version / Slot /
// Departure workspace / Traveler / allocation foundations carry every canonical
// experience family — recurring timed Sessions and single Occurrences alike —
// with NO separate scheduling aggregate.
//
//   * item 1 — the 60-minute whale-watch Boat Tour runs as recurring timed
//     Sessions (several occurrences a day, each bound to the same frozen Version,
//     with a meeting point, capacity and a manifest) and NO itinerary days;
//   * item 3 — a participatory Activity, an opening-hours Attraction Admission,
//     an Event and a Transportation/Transfer each complete
//     create → availability → booking/manifest through the same
//     `getDepartureSummary` workspace read.
//
// The point is proving they need no separate engine: every case is asserted
// against the one shared summary, and the operator-facing schedule term is the
// one resolver deciding Session vs Occurrence vs Departure from Product
// behaviour.

import { newId } from "@voyant-travel/db/lib/typeid"
import { cleanupTestDb, createTestDb } from "@voyant-travel/db/test-utils"
import { availabilitySlots } from "@voyant-travel/operations/schema"
import { sql } from "drizzle-orm"
import { beforeAll, beforeEach, describe, expect, it } from "vitest"

import {
  resolveProductClassification,
  type ScheduleTerm,
} from "../../../../inventory/src/classification.js"
import { products, productTypes } from "../../../../inventory/src/schema.js"
import { getSlotAllocationManifest } from "../../../src/availability/service-allocation.js"
import { getDepartureSummary } from "../../../src/availability/service-departure-summary.js"

const DB_AVAILABLE = !!process.env.TEST_DATABASE_URL

interface FamilySeed {
  familyCode: string
  familyName: string
  subtypeCode: string | null
  durationMinutes: number | null
  /** Itinerary-derived day count, for the multi-day comparison only. */
  itineraryDurationDays: number | null
}

describe.skipIf(!DB_AVAILABLE)("experience families tracer (integration)", () => {
  // biome-ignore lint/suspicious/noExplicitAny: drizzle test client -- owner: operations; matches the sibling availability suites.
  let db: any

  beforeAll(() => {
    db = createTestDb()
  })

  beforeEach(async () => {
    await cleanupTestDb(db)
  })

  async function seedFamily(seed: FamilySeed): Promise<string> {
    const typeId = newId("product_types")
    await db.insert(productTypes).values({
      id: typeId,
      name: seed.familyName,
      code: seed.familyCode,
      active: true,
    })
    return typeId
  }

  async function seedProduct(input: {
    name: string
    productTypeId: string
    subtypeCode: string | null
    durationMinutes: number | null
  }): Promise<string> {
    const productId = newId("products")
    await db.insert(products).values({
      id: productId,
      name: input.name,
      sellCurrency: "EUR",
      bookingMode: "date_time",
      productTypeId: input.productTypeId,
      productSubtypeCode: input.subtypeCode,
      durationMinutes: input.durationMinutes,
    })
    return productId
  }

  /** One timed occurrence bound to a frozen Product Version; no itinerary. */
  async function seedSession(input: {
    productId: string
    productVersionId: string
    startsAt: string
    durationMinutes: number | null
    meetingPoint?: string
    unlimited?: boolean
    pax?: number
  }): Promise<string> {
    const slotId = newId("availability_slots")
    const starts = new Date(input.startsAt)
    const ends = input.durationMinutes
      ? new Date(starts.getTime() + input.durationMinutes * 60_000)
      : null
    await db.insert(availabilitySlots).values({
      id: slotId,
      productId: input.productId,
      productVersionId: input.productVersionId,
      itineraryId: null,
      dateLocal: input.startsAt.slice(0, 10),
      startsAt: starts,
      endsAt: ends,
      timezone: "UTC",
      status: "open",
      unlimited: input.unlimited ?? false,
      initialPax: input.unlimited ? null : (input.pax ?? 12),
      remainingPax: input.unlimited ? null : (input.pax ?? 12),
      notes: input.meetingPoint ?? null,
    })
    return slotId
  }

  async function seedBooking(input: {
    productId: string
    slotId: string
    pax: number
    travelerCount: number
    sellAmountCents: number
  }): Promise<void> {
    const bookingId = newId("bookings")
    const bookingItemId = newId("booking_items")
    const allocationId = newId("booking_allocations")
    await db.execute(sql`
      INSERT INTO bookings (id, booking_number, status, sell_currency, pax, sell_amount_cents)
      VALUES (${bookingId}, ${`B${bookingId.slice(-6)}`}, 'confirmed', 'EUR', ${input.pax}, ${input.sellAmountCents})
    `)
    await db.execute(sql`
      INSERT INTO booking_items (id, booking_id, title, status, quantity, sell_currency, product_id, availability_slot_id)
      VALUES (${bookingItemId}, ${bookingId}, 'Seat', 'confirmed', ${input.pax}, 'EUR', ${input.productId}, ${input.slotId})
    `)
    await db.execute(sql`
      INSERT INTO booking_allocations (
        id, booking_id, booking_item_id, product_id, availability_slot_id,
        quantity, allocation_type, status, hold_expires_at
      )
      VALUES (${allocationId}, ${bookingId}, ${bookingItemId}, ${input.productId}, ${input.slotId}, ${input.pax}, 'unit', 'confirmed', null::timestamptz)
    `)
    for (let index = 0; index < input.travelerCount; index += 1) {
      await db.execute(sql`
        INSERT INTO booking_travelers (id, booking_id, participant_type, first_name, last_name)
        VALUES (${newId("booking_travelers")}, ${bookingId}, 'traveler', 'Ana', ${`Pop${index}`})
      `)
    }
  }

  function scheduleTermFor(seed: FamilySeed): ScheduleTerm {
    return resolveProductClassification({
      family: { code: seed.familyCode, name: seed.familyName },
      subtypeCode: seed.subtypeCode,
      durationMinutes: seed.durationMinutes,
      itineraryDurationDays: seed.itineraryDurationDays,
    }).scheduleTerm
  }

  it("runs the 60-minute Boat Tour as recurring timed Sessions with a meeting point and no itinerary days", async () => {
    const seed: FamilySeed = {
      familyCode: "tour",
      familyName: "Tour",
      subtypeCode: "boat-tour",
      durationMinutes: 60,
      itineraryDurationDays: null,
    }
    // The one resolver names it a Session — not a Departure — from its behaviour.
    expect(scheduleTermFor(seed)).toBe("session")

    const typeId = await seedFamily(seed)
    const productId = await seedProduct({
      name: "Whale-watch Boat Tour",
      productTypeId: typeId,
      subtypeCode: "boat-tour",
      durationMinutes: 60,
    })
    const versionId = newId("product_versions")

    // Three 60-minute occurrences on the same day, all bound to one frozen
    // Version — the recurring-Sessions shape, with a meeting point.
    const nineAm = await seedSession({
      productId,
      productVersionId: versionId,
      startsAt: "2026-07-01T09:00:00Z",
      durationMinutes: 60,
      meetingPoint: "Meet at Pier 3, 15 minutes before departure",
      pax: 20,
    })
    const tenAm = await seedSession({
      productId,
      productVersionId: versionId,
      startsAt: "2026-07-01T10:00:00Z",
      durationMinutes: 60,
      meetingPoint: "Meet at Pier 3, 15 minutes before departure",
      pax: 20,
    })
    await seedSession({
      productId,
      productVersionId: versionId,
      startsAt: "2026-07-01T11:00:00Z",
      durationMinutes: 60,
      meetingPoint: "Meet at Pier 3, 15 minutes before departure",
      pax: 20,
    })

    // Several timed occurrences share the day and the Version — no parallel
    // scheduling aggregate, just Slots.
    const [{ count: sameDay }] = (await db.execute(
      sql`select count(*)::int as count from availability_slots where product_id = ${productId} and date_local = '2026-07-01'`,
    )) as unknown as [{ count: number }]
    expect(sameDay).toBe(3)

    await seedBooking({
      productId,
      slotId: nineAm,
      pax: 4,
      travelerCount: 4,
      sellAmountCents: 4 * 45_00,
    })

    const summary = await getDepartureSummary(db, nineAm)
    expect(summary).not.toBeNull()
    // Same Departure workspace read: capacity, bookings, travelers, manifest.
    expect(summary?.departure.productVersionId).toBe(versionId)
    expect(summary?.departure.itineraryId).toBeNull() // no itinerary days
    expect(summary?.departure.notes).toContain("Pier 3") // meeting point carried
    expect(summary?.bookings.count).toBe(1)
    expect(summary?.bookings.expectedPax).toBe(4)
    expect(summary?.bookings.soldAmountCents).toBe(4 * 45_00)
    expect(summary?.travelers.entered).toBe(4)

    // The manifest is the same allocation manifest every departure uses.
    const manifest = await getSlotAllocationManifest(db, nineAm)
    expect(manifest).not.toBeNull()

    // The 10:00 Session is an independent departure on the same Product/Version.
    const other = await getDepartureSummary(db, tenAm)
    expect(other?.departure.itineraryId).toBeNull()
    expect(other?.bookings.count).toBe(0)
  })

  const smokeFamilies: Array<
    FamilySeed & { name: string; expected: ScheduleTerm; unlimited?: boolean }
  > = [
    {
      name: "Sunrise Kayak Session",
      familyCode: "activity",
      familyName: "Activity",
      subtypeCode: "kayak",
      durationMinutes: 120,
      itineraryDurationDays: null,
      expected: "session",
    },
    {
      name: "Museum Admission",
      familyCode: "attraction",
      familyName: "Attraction",
      subtypeCode: "admission",
      durationMinutes: null,
      itineraryDurationDays: null,
      expected: "occurrence",
      unlimited: true,
    },
    {
      name: "Jazz Festival Night",
      familyCode: "event",
      familyName: "Event",
      subtypeCode: null,
      durationMinutes: null,
      itineraryDurationDays: null,
      expected: "occurrence",
    },
    {
      name: "Airport Transfer",
      familyCode: "transportation",
      familyName: "Transportation",
      subtypeCode: "transfer",
      durationMinutes: 90,
      itineraryDurationDays: null,
      expected: "session",
    },
  ]

  it.each(
    smokeFamilies,
  )("completes create → availability → booking/manifest for $familyName ($expected) with no separate aggregate", async (seed) => {
    expect(scheduleTermFor(seed)).toBe(seed.expected)

    const typeId = await seedFamily(seed)
    const productId = await seedProduct({
      name: seed.name,
      productTypeId: typeId,
      subtypeCode: seed.subtypeCode,
      durationMinutes: seed.durationMinutes,
    })
    const versionId = newId("product_versions")
    const slotId = await seedSession({
      productId,
      productVersionId: versionId,
      startsAt: "2026-08-20T08:00:00Z",
      durationMinutes: seed.durationMinutes,
      unlimited: seed.unlimited,
      pax: 30,
    })

    await seedBooking({
      productId,
      slotId,
      pax: 2,
      travelerCount: 2,
      sellAmountCents: 2 * 30_00,
    })

    const summary = await getDepartureSummary(db, slotId)
    expect(summary).not.toBeNull()
    expect(summary?.departure.itineraryId).toBeNull()
    expect(summary?.departure.productVersionId).toBe(versionId)
    expect(summary?.bookings.count).toBe(1)
    expect(summary?.bookings.expectedPax).toBe(2)
    expect(summary?.travelers.entered).toBe(2)

    const manifest = await getSlotAllocationManifest(db, slotId)
    expect(manifest).not.toBeNull()
  })

  it("names a day-spanning Tour a Departure — the same resolver, different behaviour", async () => {
    // Contrast: an itinerary-derived multi-day Tour is a Departure, proving the
    // term follows behaviour, not family.
    expect(
      scheduleTermFor({
        familyCode: "tour",
        familyName: "Tour",
        subtypeCode: "multi-day-tour",
        durationMinutes: null,
        itineraryDurationDays: 3,
      }),
    ).toBe("departure")
  })
})
