import { describe, expect, it } from "vitest"

import { bookingCreateCommandError } from "../../src/booking-create-command.js"

describe("booking create command errors", () => {
  it("explains room capacity failures as a corrective action", () => {
    const error = bookingCreateCommandError(
      {
        status: "room_occupancy_insufficient",
        pax: 3,
        occupancyMax: 2,
        shortfall: 1,
      },
      "staff",
    )

    expect(error.message).toMatch(/fit 2 traveler/)
    expect(error.message).toMatch(/Add room capacity for 1 more traveler/)
    expect(error.message).toMatch(/assign every traveler to a room/)
  })

  it("explains traveler and room payload mismatches", () => {
    const error = bookingCreateCommandError(
      { status: "payload_resolver_mismatch", mismatches: [] },
      "staff",
    )

    expect(error.message).toMatch(/traveler-to-room assignments/)
    expect(error.message).toMatch(/assign each traveler key/)
  })

  it("includes the invalid payment field and reason", () => {
    const error = bookingCreateCommandError(
      {
        status: "invalid_payment_schedules",
        issues: [{ path: ["paymentSchedules", 0, "amountCents"], message: "Total is too high" }],
      },
      "staff",
    )

    expect(error.message).toContain("paymentSchedules.0.amountCents: Total is too high")
  })

  // voyant#4805. `invalid_pricing` was the one refusal with no case of its own,
  // so it reached the caller as "The booking command failed validation." with
  // its issues dropped — and because that is the only status that could produce
  // that sentence, the message named nothing the caller did not already know.
  it.each([
    "staff",
    "customer",
  ] as const)("names the pricing rule that refused the booking for %s", (audience) => {
    const error = bookingCreateCommandError(
      {
        status: "invalid_pricing",
        issues: [
          {
            path: ["itemLines"],
            message: "Booking item unit_twin has no active persisted price rule.",
          },
        ],
      },
      audience,
    )

    expect(error.code).toBe("INVALID_INPUT")
    expect(error.message).toContain(
      "itemLines: Booking item unit_twin has no active persisted price rule.",
    )
    expect(error.message).not.toContain("The booking command failed validation")
  })

  it("names the conflicting record for staff instead of reporting a bare conflict", () => {
    const duplicate = bookingCreateCommandError(
      {
        status: "duplicate_booking",
        existingBooking: { id: "bkg_1", bookingNumber: "BK-1042", status: "confirmed" },
      },
      "staff",
    )
    const grouped = bookingCreateCommandError(
      { status: "booking_already_in_group", currentGroupId: "grp_7" },
      "staff",
    )

    expect(duplicate.message).toContain("BK-1042")
    expect(grouped.message).toContain("grp_7")
  })

  // The duplicate guard resolves its person from the contact email on the
  // request, and `upsertPersonFromContact` returns any existing CRM person that
  // matches without checking that the caller owns it. On the anonymous public
  // Commit the match can therefore be a stranger, so this message must never
  // name their booking — the identifier stays in `meta` for the server log.
  it("withholds the existing booking from a customer-facing duplicate refusal", () => {
    const error = bookingCreateCommandError(
      {
        status: "duplicate_booking",
        existingBooking: { id: "bkg_1", bookingNumber: "BK-1042", status: "confirmed" },
      },
      "customer",
    )

    expect(error.message).not.toContain("BK-1042")
    expect(error.message).not.toContain("bkg_1")
    expect(error.message).not.toContain("confirmed")
    expect(error.message).toMatch(/Contact the operator/)
    // The operator still has everything, through the detail that never reaches
    // the response body.
    expect(error.meta).toMatchObject({
      outcome: { existingBooking: { bookingNumber: "BK-1042" } },
    })
  })

  // The domain's message is "This workspace has reached its monthly booking
  // limit (3/5). Upgrade the plan or wait until ...". That is the operator's
  // commercial state, and the public Commit would have shown it to a shopper.
  it("withholds the operator's plan usage from a customer-facing limit refusal", () => {
    const outcome = {
      status: "monthly_booking_limit_reached",
      limit: 5,
      current: 5,
      periodStart: "2026-08-01",
      periodEnd: "2026-08-31",
      message: "This workspace has reached its monthly booking limit (5/5). Upgrade the plan.",
    } as const

    expect(bookingCreateCommandError(outcome, "staff").message).toBe(outcome.message)

    const customer = bookingCreateCommandError(outcome, "customer")
    expect(customer.message).not.toMatch(/limit|plan|workspace|5\/5/i)
    expect(customer.meta).toMatchObject({ outcome: { limit: 5, current: 5 } })
  })

  // Both withheld refusals are the same sentence, so the message does not
  // distinguish them either.
  it("gives the two withheld outcomes an identical customer-facing message", () => {
    const duplicate = bookingCreateCommandError(
      {
        status: "duplicate_booking",
        existingBooking: { id: "bkg_1", bookingNumber: "BK-1042", status: "confirmed" },
      },
      "customer",
    )
    const limited = bookingCreateCommandError(
      {
        status: "monthly_booking_limit_reached",
        limit: 5,
        current: 5,
        periodStart: "2026-08-01",
        periodEnd: "2026-08-31",
        message: "This workspace has reached its monthly booking limit (5/5).",
      },
      "customer",
    )

    expect(duplicate.message).toBe(limited.message)
  })

  // The three `issues[]` siblings must stay formatted the same way; the defect
  // was one of them silently not being.
  it.each([
    ["invalid_payment_schedules", "The payment schedule is invalid"],
    ["invalid_tax_lines", "The tax lines are invalid"],
    ["invalid_pricing", "The pricing is invalid"],
  ] as const)("formats %s issues", (status, prefix) => {
    const error = bookingCreateCommandError(
      { status, issues: [{ path: ["a", 1], message: "why" }] },
      "staff",
    )

    expect(error.message).toBe(`${prefix}: a.1: why`)
  })
})
