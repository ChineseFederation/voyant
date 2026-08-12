import type { BookingCrmSnapshot } from "@voyant-travel/bookings/runtime-port"
import { identityService } from "@voyant-travel/identity/service"
import { and, eq, inArray, sql } from "drizzle-orm"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"

import {
  activities,
  activityLinks,
  activityParticipants,
  people,
  personRelationships,
} from "../schema.js"
import { personEntityType } from "../service/accounts-shared.js"

/** What a single enrichment pass wrote. Empty fields mean "nothing to write". */
export interface BookingCrmEnrichmentResult {
  activityId: string | null
  addressId: string | null
  companionPersonIds: readonly string[]
  /** Set when the pass did nothing, so callers can log a cause rather than a silence. */
  skipped: "no_person" | "already_enriched" | null
}

const EMPTY: BookingCrmEnrichmentResult = {
  activityId: null,
  addressId: null,
  companionPersonIds: [],
  skipped: null,
}

function trimmed(value: string | null | undefined): string | null {
  const text = typeof value === "string" ? value.trim() : ""
  return text ? text : null
}

/**
 * The address fields the operator would recognise as "the same address".
 *
 * Line 2 and region are deliberately excluded: they are the fields a checkout
 * most often leaves blank on a repeat booking, and including them would make
 * the second booking add a near-duplicate row rather than recognise the first.
 */
function addressKey(address: {
  line1: string | null
  city: string | null
  postalCode: string | null
  country: string | null
}): string | null {
  const parts = [address.line1, address.city, address.postalCode, address.country].map((part) =>
    trimmed(part)?.toLowerCase(),
  )
  return parts.some(Boolean) ? parts.join("|") : null
}

/**
 * Project a confirmed booking onto the person who made it.
 *
 * Writes three things the operator otherwise has to enter by hand: a timeline
 * activity, the billing address the checkout already collected, and a
 * travel-companion edge per co-traveler who resolved to their own person.
 *
 * Idempotent by construction — `booking.confirmed` is redelivered on retry, and
 * the booking's own activity link is the key that makes a replay a no-op. Every
 * write is scoped to tables this module owns, except the address, which goes
 * through Identity's service (the relationships->identity pair the baseline
 * already carries).
 */
export async function enrichCrmFromBooking(
  db: PostgresJsDatabase,
  snapshot: BookingCrmSnapshot,
): Promise<BookingCrmEnrichmentResult> {
  const personId = snapshot.personId
  // A booking with no CRM person is a booking there is nothing to enrich —
  // a staff-entered organization booking, or one whose contact carried no
  // dedupe key at all.
  if (!personId) return { ...EMPTY, skipped: "no_person" }

  // Serialize concurrent enrichment of the SAME booking. The guard below is a
  // read followed by a write, so two simultaneous redeliveries would otherwise
  // both find no link and both write an activity. Held to the end of the
  // caller's transaction and scoped to this booking, so bookings never wait on
  // each other.
  await db.execute(
    // agent-quality: raw-sql reviewed -- owner: crm; dynamic SQL interpolation uses Drizzle parameter binding or vetted SQL identifiers.
    sql`select pg_advisory_xact_lock(hashtext(${`relationships.booking-enrichment:${snapshot.bookingId}`}))`,
  )

  const [existingLink] = await db
    .select({ activityId: activityLinks.activityId })
    .from(activityLinks)
    .where(
      and(
        eq(activityLinks.entityType, "booking"),
        eq(activityLinks.entityId, snapshot.bookingId),
        eq(activityLinks.role, "primary"),
      ),
    )
    .limit(1)
  if (existingLink) {
    return { ...EMPTY, activityId: existingLink.activityId, skipped: "already_enriched" }
  }

  // `booking_travelers.person_id` carries no foreign key, so it can name a
  // person who has since been deleted. Both writes below do have one, and an
  // unchecked stale id would roll back the whole enrichment over a traveler
  // record nobody is looking at.
  const travelerPersonIds = await livePersonIds(
    db,
    snapshot.travelers.flatMap((traveler) => (traveler.personId ? [traveler.personId] : [])),
  )

  const activityId = await writeBookingActivity(db, snapshot, personId, travelerPersonIds)
  const addressId = await writeBillingAddress(db, snapshot, personId)
  const companionPersonIds = await writeTravelCompanions(db, snapshot, personId, travelerPersonIds)

  return { activityId, addressId, companionPersonIds, skipped: null }
}

async function livePersonIds(
  db: PostgresJsDatabase,
  candidates: readonly string[],
): Promise<readonly string[]> {
  const unique = [...new Set(candidates)]
  if (unique.length === 0) return []
  const rows = await db.select({ id: people.id }).from(people).where(inArray(people.id, unique))
  return rows.map((row) => row.id)
}

async function writeBookingActivity(
  db: PostgresJsDatabase,
  snapshot: BookingCrmSnapshot,
  personId: string,
  travelerPersonIds: readonly string[],
): Promise<string | null> {
  const now = new Date()
  const [activity] = await db
    .insert(activities)
    .values({
      subject: `Booking ${snapshot.bookingNumber} confirmed`,
      type: "note",
      status: "done",
      completedAt: now,
      description: bookingActivityDescription(snapshot),
    })
    .returning({ id: activities.id })
  if (!activity) return null

  await db.insert(activityLinks).values([
    {
      activityId: activity.id,
      entityType: "booking",
      entityId: snapshot.bookingId,
      role: "primary",
    },
    { activityId: activity.id, entityType: "person", entityId: personId, role: "related" },
  ])

  // The billing person plus every traveler who resolved to their own record, so
  // the activity reads as "who this booking was for", not just who paid.
  const participantIds = new Set<string>([personId, ...travelerPersonIds])
  await db
    .insert(activityParticipants)
    .values(
      [...participantIds].map((id) => ({
        activityId: activity.id,
        personId: id,
        isPrimary: id === personId,
      })),
    )
    .onConflictDoNothing({
      target: [activityParticipants.activityId, activityParticipants.personId],
    })

  return activity.id
}

function bookingActivityDescription(snapshot: BookingCrmSnapshot): string {
  const parts = [`Booking ${snapshot.bookingNumber} (${snapshot.sourceType})`]
  if (snapshot.startDate) parts.push(`departing ${snapshot.startDate}`)
  if (snapshot.sellAmountCents != null) {
    parts.push(`${(snapshot.sellAmountCents / 100).toFixed(2)} ${snapshot.sellCurrency}`)
  }
  const travelerCount = snapshot.travelers.length
  if (travelerCount > 0) {
    parts.push(`${travelerCount} traveler${travelerCount === 1 ? "" : "s"}`)
  }
  return parts.join(" · ")
}

async function writeBillingAddress(
  db: PostgresJsDatabase,
  snapshot: BookingCrmSnapshot,
  personId: string,
): Promise<string | null> {
  const address = {
    line1: trimmed(snapshot.billingAddress.line1),
    line2: trimmed(snapshot.billingAddress.line2),
    city: trimmed(snapshot.billingAddress.city),
    region: trimmed(snapshot.billingAddress.region),
    postalCode: trimmed(snapshot.billingAddress.postalCode),
    country: trimmed(snapshot.billingAddress.country),
  }
  const key = addressKey(address)
  // Checkout did not collect one. Nothing to save, and an empty row would be
  // worse than no row.
  if (!key) return null

  const existing = await identityService.listAddressesForEntity(db, personEntityType, personId)
  if (existing.some((row) => addressKey(row) === key)) return null

  const created = await identityService.createAddress(db, {
    entityType: personEntityType,
    entityId: personId,
    label: "billing",
    ...address,
    // Only claim primary when the person has nothing on file. A checkout
    // address must not silently displace one an operator curated.
    isPrimary: existing.length === 0,
    notes: `Captured from booking ${snapshot.bookingNumber}`,
  })
  return created?.id ?? null
}

async function writeTravelCompanions(
  db: PostgresJsDatabase,
  snapshot: BookingCrmSnapshot,
  personId: string,
  travelerPersonIds: readonly string[],
): Promise<readonly string[]> {
  const companionIds = new Set(travelerPersonIds.filter((id) => id !== personId))
  if (companionIds.size === 0) return []

  // Symmetric, so either person's Relationships tab shows the other. Written
  // here rather than through `createPersonRelationship` because that one throws
  // on a duplicate edge, and a redelivered event must be a no-op.
  const edges = [...companionIds].flatMap((companionId) => [
    {
      fromPersonId: personId,
      toPersonId: companionId,
      kind: "travel_companion" as const,
      inverseKind: "travel_companion" as const,
      notes: `Traveled together on booking ${snapshot.bookingNumber}`,
    },
    {
      fromPersonId: companionId,
      toPersonId: personId,
      kind: "travel_companion" as const,
      inverseKind: "travel_companion" as const,
      notes: `Traveled together on booking ${snapshot.bookingNumber}`,
    },
  ])

  await db
    .insert(personRelationships)
    .values(edges)
    .onConflictDoNothing({
      target: [
        personRelationships.fromPersonId,
        personRelationships.toPersonId,
        personRelationships.kind,
      ],
    })

  return [...companionIds]
}
