import { asc, eq } from "drizzle-orm"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"

import type { BookingCrmSnapshot, BookingCrmTravelerSnapshot } from "./runtime-port.js"
import { bookings, bookingTravelers } from "./schema-core.js"

/**
 * Project a booking into the shape CRM enrichment needs.
 *
 * Deliberately reread from the tables rather than reconstructed from the
 * `booking.confirmed` payload: by the time a subscriber runs, the booking is
 * the authority on its own contact snapshot, and the event carries only the id.
 *
 * Returns `null` for an unknown booking so a subscriber handling a stale or
 * rolled-back event does nothing rather than throwing.
 */
export async function loadBookingCrmSnapshot(
  db: PostgresJsDatabase,
  bookingId: string,
): Promise<BookingCrmSnapshot | null> {
  const [booking] = await db.select().from(bookings).where(eq(bookings.id, bookingId)).limit(1)
  if (!booking) return null

  const travelerRows = await db
    .select({
      personId: bookingTravelers.personId,
      firstName: bookingTravelers.firstName,
      lastName: bookingTravelers.lastName,
      isPrimary: bookingTravelers.isPrimary,
    })
    .from(bookingTravelers)
    .where(eq(bookingTravelers.bookingId, bookingId))
    .orderBy(asc(bookingTravelers.createdAt))

  const travelers: BookingCrmTravelerSnapshot[] = travelerRows.map((row) => ({
    personId: row.personId ?? null,
    firstName: row.firstName,
    lastName: row.lastName,
    isPrimary: row.isPrimary,
  }))

  return {
    bookingId: booking.id,
    bookingNumber: booking.bookingNumber,
    status: booking.status,
    personId: booking.personId ?? null,
    organizationId: booking.organizationId ?? null,
    sourceType: booking.sourceType,
    startDate: booking.startDate ?? null,
    sellCurrency: booking.sellCurrency,
    sellAmountCents: booking.sellAmountCents ?? null,
    billingAddress: {
      line1: booking.contactAddressLine1 ?? null,
      line2: booking.contactAddressLine2 ?? null,
      city: booking.contactCity ?? null,
      region: booking.contactRegion ?? null,
      postalCode: booking.contactPostalCode ?? null,
      country: booking.contactCountry ?? null,
    },
    travelers,
  }
}
