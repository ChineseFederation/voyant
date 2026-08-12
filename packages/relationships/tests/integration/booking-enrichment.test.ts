import type { BookingCrmSnapshot } from "@voyant-travel/bookings/runtime-port"
import { identityService } from "@voyant-travel/identity/service"
import { eq } from "drizzle-orm"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"

import { enrichCrmFromBooking } from "../../src/booking-enrichment/service.js"
import {
  activities,
  activityLinks,
  activityParticipants,
  people,
  personRelationships,
} from "../../src/schema.js"

const DB_AVAILABLE = !!process.env.TEST_DATABASE_URL

function snapshot(overrides: Partial<BookingCrmSnapshot> = {}): BookingCrmSnapshot {
  return {
    bookingId: "bookings_01",
    bookingNumber: "BK-2608-399637",
    status: "confirmed",
    personId: null,
    organizationId: null,
    sourceType: "storefront",
    startDate: "2026-08-22",
    sellCurrency: "RON",
    sellAmountCents: 16000,
    billingAddress: {
      line1: "Str. Republicii 12",
      line2: null,
      city: "Cluj-Napoca",
      region: "RO-CJ",
      postalCode: "400015",
      country: "RO",
    },
    travelers: [],
    ...overrides,
  }
}

describe.skipIf(!DB_AVAILABLE)("enrichCrmFromBooking", () => {
  // biome-ignore lint/suspicious/noExplicitAny: test db typing -- owner: crm; existing suppression is intentional pending typed cleanup.
  let db: any

  beforeAll(async () => {
    const { createTestDb, cleanupTestDb } = await import("@voyant-travel/db/test-utils")
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

  async function seedPerson(firstName = "Myra") {
    const [row] = await db
      .insert(people)
      .values({ firstName, lastName: "Edelstein", tags: [], status: "active" })
      .returning()
    return row
  }

  it("records the booking on the person's timeline", async () => {
    const person = await seedPerson()

    const result = await enrichCrmFromBooking(db, snapshot({ personId: person.id }))

    expect(result.skipped).toBeNull()
    expect(result.activityId).toBeTruthy()

    const [activity] = await db
      .select()
      .from(activities)
      .where(eq(activities.id, result.activityId as string))
    expect(activity.subject).toBe("Booking BK-2608-399637 confirmed")
    expect(activity.status).toBe("done")

    const links = await db
      .select()
      .from(activityLinks)
      .where(eq(activityLinks.activityId, result.activityId as string))
    expect(links.map((link: { entityType: string; entityId: string }) => link)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ entityType: "booking", entityId: "bookings_01" }),
        expect.objectContaining({ entityType: "person", entityId: person.id }),
      ]),
    )
  })

  it("saves the checkout billing address as the person's billing address", async () => {
    const person = await seedPerson()

    const result = await enrichCrmFromBooking(db, snapshot({ personId: person.id }))

    expect(result.addressId).toBeTruthy()
    const addresses = await identityService.listAddressesForEntity(db, "person", person.id)
    expect(addresses).toHaveLength(1)
    expect(addresses[0]).toMatchObject({
      label: "billing",
      line1: "Str. Republicii 12",
      city: "Cluj-Napoca",
      region: "RO-CJ",
      postalCode: "400015",
      country: "RO",
      // First address on file, so it becomes primary.
      isPrimary: true,
    })
  })

  it("does not add a second address for the same place on a repeat booking", async () => {
    const person = await seedPerson()
    await enrichCrmFromBooking(db, snapshot({ personId: person.id }))

    const second = await enrichCrmFromBooking(
      db,
      snapshot({ personId: person.id, bookingId: "bookings_02", bookingNumber: "BK-2606-339104" }),
    )

    expect(second.addressId).toBeNull()
    const addresses = await identityService.listAddressesForEntity(db, "person", person.id)
    expect(addresses).toHaveLength(1)
  })

  it("writes nothing when the checkout collected no address", async () => {
    const person = await seedPerson()

    const result = await enrichCrmFromBooking(
      db,
      snapshot({
        personId: person.id,
        billingAddress: {
          line1: null,
          line2: null,
          city: null,
          region: null,
          postalCode: null,
          country: null,
        },
      }),
    )

    expect(result.addressId).toBeNull()
    expect(await identityService.listAddressesForEntity(db, "person", person.id)).toHaveLength(0)
  })

  it("links co-travelers to the booker in both directions", async () => {
    const booker = await seedPerson("Myra")
    const companion = await seedPerson("Dana")

    const result = await enrichCrmFromBooking(
      db,
      snapshot({
        personId: booker.id,
        travelers: [
          { personId: booker.id, firstName: "Myra", lastName: "Edelstein", isPrimary: true },
          { personId: companion.id, firstName: "Dana", lastName: "Edelstein", isPrimary: false },
        ],
      }),
    )

    expect(result.companionPersonIds).toEqual([companion.id])
    const edges = await db.select().from(personRelationships)
    expect(edges).toHaveLength(2)
    expect(edges.every((edge: { kind: string }) => edge.kind === "travel_companion")).toBe(true)

    const participants = await db
      .select()
      .from(activityParticipants)
      .where(eq(activityParticipants.activityId, result.activityId as string))
    expect(participants).toHaveLength(2)
  })

  it("ignores a traveler pointing at a person that no longer exists", async () => {
    const booker = await seedPerson("Myra")

    const result = await enrichCrmFromBooking(
      db,
      snapshot({
        personId: booker.id,
        travelers: [
          { personId: booker.id, firstName: "Myra", lastName: "Edelstein", isPrimary: true },
          // `booking_travelers.person_id` has no foreign key, so a deleted
          // person leaves a danging id behind.
          { personId: "person_deleted", firstName: "Gone", lastName: "Away", isPrimary: false },
        ],
      }),
    )

    expect(result.companionPersonIds).toEqual([])
    expect(result.activityId).toBeTruthy()
    expect(await db.select().from(personRelationships)).toHaveLength(0)
  })

  it("is a no-op when the same booking is delivered twice", async () => {
    const person = await seedPerson()
    const first = await enrichCrmFromBooking(db, snapshot({ personId: person.id }))

    const replay = await enrichCrmFromBooking(db, snapshot({ personId: person.id }))

    expect(replay.skipped).toBe("already_enriched")
    expect(replay.activityId).toBe(first.activityId)
    expect(await db.select().from(activities)).toHaveLength(1)
    expect(await identityService.listAddressesForEntity(db, "person", person.id)).toHaveLength(1)
  })

  it("skips a booking that resolved no CRM person", async () => {
    const result = await enrichCrmFromBooking(db, snapshot({ personId: null }))

    expect(result.skipped).toBe("no_person")
    expect(await db.select().from(activities)).toHaveLength(0)
  })
})
