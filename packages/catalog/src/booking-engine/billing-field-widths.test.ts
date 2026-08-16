/**
 * The Session's published billing widths and the Booking create's enforced
 * ones are the same widths.
 *
 * This is the whole of voyant#4734 as one assertion. The two numbers live in
 * two packages and nothing used to compare them, so `address.postal` was
 * published unbounded, accepted at 25 characters by the Session `PATCH`, and
 * refused at 20 by the Booking create — after the card had been captured, and
 * under a field name (`contactPostalCode`) the client had never sent.
 *
 * Both sides are driven, not restated: the widths come out of
 * `defaultBookingFields()` exactly as a storefront reads them off
 * `requirements.bookingFields`, and the refusal comes out of
 * `bookingCreateSchema`, which is the schema the commit actually parses
 * through. Asserting `20 === 20` against a hand-copied constant would pass on
 * the day someone changes one of them, which is the failure this exists to
 * catch.
 */
import { defaultBookingFields } from "@voyant-travel/catalog-contracts/booking-engine/requirements-defaults"
import { BOOKING_SELECTION_BILLING_MAX_LENGTHS } from "@voyant-travel/catalog-contracts/booking-engine/selection-contracts"
import { bookingCreateSchema } from "@voyant-travel/finance"
import { describe, expect, it } from "vitest"

import { BOOKING_SESSION_BILLING_FIELD_TARGETS } from "./sessions-production.js"

function publishedMaxLength(key: string): number | undefined {
  return defaultBookingFields().find((field) => field.key === key)?.maxLength
}

/**
 * Whether the create schema objects to *this* field, ignoring whatever else
 * the surrounding payload is missing. Asked this way rather than by building a
 * fully valid create: the question is what the schema does to one value, and a
 * payload that has to stay valid as the rest of the create evolves is a
 * payload that will eventually be fixed by weakening the assertion.
 */
function rejectsField(target: string, value: string): boolean {
  const result = bookingCreateSchema.safeParse({ [target]: value })
  return (
    !result.success &&
    result.error.issues.some((issue) => issue.path.length === 1 && issue.path[0] === target)
  )
}

describe("billing field widths", () => {
  const entries = Object.entries(BOOKING_SESSION_BILLING_FIELD_TARGETS) as Array<
    [keyof typeof BOOKING_SELECTION_BILLING_MAX_LENGTHS, string]
  >

  it.each(
    entries.filter(([key]) => key.startsWith("address.")),
  )("publishes %s under the width the Booking create enforces on %s", (key, target) => {
    const published = publishedMaxLength(key)
    // Every billing address field the selection carries is advertised. Three
    // of the six were not, which is why a client could not pre-validate the
    // one that bit.
    expect(published).toBe(BOOKING_SELECTION_BILLING_MAX_LENGTHS[key])

    expect(rejectsField(target, "x".repeat(published!))).toBe(false)
    expect(rejectsField(target, "x".repeat(published! + 1))).toBe(true)
  })

  it("names every billing key the selection bounds", () => {
    // The mapping and the widths must cover the same keys, or a field gets a
    // published bound the commit never applies — or worse, the reverse.
    expect(Object.keys(BOOKING_SESSION_BILLING_FIELD_TARGETS).sort()).toEqual(
      Object.keys(BOOKING_SELECTION_BILLING_MAX_LENGTHS).sort(),
    )
  })
})
