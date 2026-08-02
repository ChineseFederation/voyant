import type { BookingActionSourceSnapshot } from "@voyant-travel/bookings-contracts/booking-actions"
import { describe, expect, it } from "vitest"

import type { BookingActionProjection } from "../../src/booking-actions/schema.js"
import {
  bookingActionSourceIdentity,
  deriveBookingActionState,
  findMissingBookingActionProjectionIds,
  resolveBookingActionDeadline,
  shouldReplaceBookingActionProjection,
} from "../../src/booking-actions/service.js"

function paymentSnapshot(localDate: string, timeZone: string): BookingActionSourceSnapshot {
  return {
    sourceModule: "finance",
    sourceType: "booking_payment_schedule",
    sourceId: "bps_test",
    sourceUpdatedAt: "2026-03-01T00:00:00.000Z",
    kind: "balance_due",
    bookingId: "book_test",
    bookingSessionId: null,
    deadline: { semantics: "local_date_end", localDate, timeZone },
    sourceState: "open",
    satisfiedAt: null,
    escalationPolicy: { dueWindowSeconds: 86_400, escalateAfterSeconds: 259_200 },
    operatorNextAction: "collect_payment",
    customerVisible: true,
    customerNextAction: "make_payment",
    safeMetadata: {},
  }
}

describe("booking action deadlines", () => {
  it("resolves local date end through the named zone across DST", () => {
    expect(
      resolveBookingActionDeadline(paymentSnapshot("2026-03-29", "Europe/Bucharest")),
    ).toMatchObject({
      dueAt: new Date("2026-03-29T20:59:59.999Z"),
      dueLocalDate: "2026-03-29",
      timeZone: "Europe/Bucharest",
      deadlineSemantics: "local_date_end",
    })
  })
})

describe("booking action state", () => {
  const row = {
    sourceState: "open",
    dueAt: new Date("2026-08-10T12:00:00.000Z"),
    dueWindowSeconds: 86_400,
    escalateAfterSeconds: 172_800,
  } as Pick<
    BookingActionProjection,
    "sourceState" | "dueAt" | "dueWindowSeconds" | "escalateAfterSeconds"
  >

  it.each([
    ["2026-08-08T11:59:59.999Z", "scheduled"],
    ["2026-08-09T12:00:00.000Z", "due"],
    ["2026-08-10T12:00:00.000Z", "overdue"],
    ["2026-08-12T12:00:00.000Z", "escalated"],
  ] as const)("derives %s as %s", (asOf, expected) => {
    expect(deriveBookingActionState(row, new Date(asOf))).toBe(expected)
  })

  it("preserves authoritative terminal state regardless of time", () => {
    expect(
      deriveBookingActionState(
        { ...row, sourceState: "satisfied" },
        new Date("2030-01-01T00:00:00.000Z"),
      ),
    ).toBe("satisfied")
  })
})

describe("convergent projection decisions", () => {
  const current = {
    sourceUpdatedAt: new Date("2026-08-02T10:00:00.000Z"),
    fingerprint: "same",
  }

  it("ignores duplicate and out-of-order snapshots", () => {
    expect(shouldReplaceBookingActionProjection(current, current)).toBe(false)
    expect(
      shouldReplaceBookingActionProjection(current, {
        sourceUpdatedAt: new Date("2026-08-02T09:59:59.999Z"),
        fingerprint: "different",
      }),
    ).toBe(false)
  })

  it("accepts a changed snapshot at the current or a later source revision", () => {
    expect(
      shouldReplaceBookingActionProjection(current, {
        sourceUpdatedAt: current.sourceUpdatedAt,
        fingerprint: "updated",
      }),
    ).toBe(true)
  })

  it("finds deleted source rows during a deterministic rebuild", () => {
    const retained = {
      id: "bkap_retained",
      sourceModule: "finance",
      sourceType: "booking_payment_schedule",
      sourceId: "bps_retained",
    }
    const removed = { ...retained, id: "bkap_removed", sourceId: "bps_removed" }
    expect(
      findMissingBookingActionProjectionIds(
        [retained, removed],
        new Set([bookingActionSourceIdentity(retained)]),
      ),
    ).toEqual(["bkap_removed"])
  })
})
