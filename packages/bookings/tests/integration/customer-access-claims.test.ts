import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"

import {
  confirmBookingAccessClaim,
  startBookingAccessClaim,
} from "../../src/customer-access-claims.js"
import {
  bookingCustomerAccessCommands,
  bookingCustomerAccessGrants,
  bookings,
  customerBookingAccessClaims,
} from "../../src/schema.js"

const DB_AVAILABLE = !!process.env.TEST_DATABASE_URL

describe.skipIf(!DB_AVAILABLE)("customer booking access claims", () => {
  let db: ReturnType<typeof import("@voyant-travel/db/test-utils").createTestDb>

  beforeAll(async () => {
    const { createTestDb } = await import("@voyant-travel/db/test-utils")
    db = createTestDb()
  })

  beforeEach(async () => {
    await db.delete(customerBookingAccessClaims)
    await db.delete(bookingCustomerAccessCommands)
    await db.delete(bookingCustomerAccessGrants)
    await db.delete(bookings)
  })

  afterAll(async () => {
    const { closeTestDb } = await import("@voyant-travel/db/test-utils")
    await closeTestDb()
  })

  it("consumes the exact stored challenge and grants only its fixed Buyer Account", async () => {
    const [booking] = await db
      .insert(bookings)
      .values({ bookingNumber: "CLAIM-1", status: "confirmed", sellCurrency: "EUR" })
      .returning()
    if (!booking) throw new Error("booking fixture was not created")
    const account = { id: "personal:claim_user_1", kind: "personal" as const }
    const started = await db.transaction((tx) =>
      startBookingAccessClaim(tx, {
        bookingId: booking.id,
        buyerAccount: account,
        challengeId: "vrch_exact_1",
        idempotencyKey: "claim-start-1",
        requestFingerprint: "request-1",
        expiresAt: new Date("2026-08-20T00:00:00.000Z"),
        now: new Date("2026-08-19T22:00:00.000Z"),
      }),
    )
    if (!started.claim) throw new Error("claim fixture was not created")
    const consumeChallenge = vi.fn(async () => ({ status: "verified" as const }))

    const confirmed = await db.transaction((tx) =>
      confirmBookingAccessClaim(
        tx,
        {
          claimId: started.claim.id,
          buyerAccount: account,
          code: "123456",
          principalId: "claim_user_1",
          idempotencyKey: "claim-confirm-1",
          requestFingerprint: "confirm-request-1",
          now: new Date("2026-08-19T22:01:00.000Z"),
        },
        { consumeChallenge },
      ),
    )

    expect(confirmed.status).toBe("granted")
    expect(consumeChallenge).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        challengeId: "vrch_exact_1",
        code: "123456",
        expectedPurpose: "booking_access_claim",
        expectedSubjectRef: `booking:${booking.id}:claim:${started.claim.id}`,
      }),
    )
    expect(await db.select().from(bookingCustomerAccessGrants)).toHaveLength(1)

    const replay = await db.transaction((tx) =>
      confirmBookingAccessClaim(
        tx,
        {
          claimId: started.claim.id,
          buyerAccount: account,
          code: "123456",
          principalId: "claim_user_1",
          idempotencyKey: "claim-confirm-1",
          requestFingerprint: "confirm-request-1",
        },
        { consumeChallenge },
      ),
    )
    const drift = await db.transaction((tx) =>
      confirmBookingAccessClaim(
        tx,
        {
          claimId: started.claim.id,
          buyerAccount: account,
          code: "123456",
          principalId: "claim_user_1",
          idempotencyKey: "claim-confirm-2",
          requestFingerprint: "confirm-request-1",
        },
        { consumeChallenge },
      ),
    )
    expect(replay.status).toBe("replayed")
    expect(drift.status).toBe("idempotency_conflict")
    expect(consumeChallenge).toHaveBeenCalledTimes(1)
  })
})
