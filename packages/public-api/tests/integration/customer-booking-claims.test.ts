import { actionLedgerEntries } from "@voyant-travel/action-ledger/schema"
import { listBookingCustomerAccess } from "@voyant-travel/bookings/customer-access"
import { bookings, customerBookingAccessClaims } from "@voyant-travel/bookings/schema"
import { cleanupTestDb, closeTestDb, createTestDb } from "@voyant-travel/db/test-utils"
import { createMemoryRateLimitStore, handleApiError } from "@voyant-travel/hono"
import { customerVerificationChallenges } from "@voyant-travel/identity/verification/schema"
import { eq } from "drizzle-orm"
import { Hono } from "hono"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"

import { createCustomerPortalApiModule } from "../../src/customer-portal/index.js"
import { createPublicCustomerPortalRoutes } from "../../src/customer-portal/routes-public.js"

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL

describe.skipIf(!TEST_DATABASE_URL)("customer booking claims", () => {
  let db: ReturnType<typeof createTestDb>
  let deliveredCode: string | null
  let deliveryCount: number
  let buyerAccountId: string
  let rateLimitStore: ReturnType<typeof createMemoryRateLimitStore>

  beforeAll(() => {
    db = createTestDb()
  })

  beforeEach(async () => {
    await cleanupTestDb(db)
    deliveredCode = null
    deliveryCount = 0
    buyerAccountId = "personal:claim-user"
    rateLimitStore = createMemoryRateLimitStore()
  })

  afterAll(async () => {
    await closeTestDb()
  })

  function app() {
    return new Hono()
      .onError(handleApiError)
      .use("*", async (c, next) => {
        c.set("db" as never, db)
        c.set("userId" as never, "claim-user")
        c.set("sessionId" as never, "claim-session")
        c.set("actor" as never, "customer")
        c.set("realm" as never, "customer")
        c.set("buyerAccountId" as never, buyerAccountId)
        c.set("buyerAccountKind" as never, "personal")
        await next()
      })
      .route(
        "/",
        createPublicCustomerPortalRoutes({
          codeLength: 6,
          sendEmailChallenge: async (input) => {
            deliveredCode = input.code
            deliveryCount += 1
            return { id: "delivery-1", provider: "test" }
          },
        }),
      )
  }

  async function seedBooking(bookingNumber: string, email = "owner@example.com") {
    const [booking] = await db
      .insert(bookings)
      .values({
        bookingNumber,
        status: "confirmed",
        sourceType: "direct",
        sellCurrency: "EUR",
        contactEmail: email,
      })
      .returning()
    if (!booking) throw new Error("booking fixture was not created")
    return booking
  }

  async function startClaim(bookingReference: string, idempotencyKey = "start-1") {
    return app().request(
      "/booking-claims",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ bookingReference, channel: "email", idempotencyKey }),
      },
      { RATE_LIMIT_STORE: rateLimitStore },
    )
  }

  async function confirmClaim(claimId: string, code: string, idempotencyKey = "confirm-1") {
    return app().request(
      `/booking-claims/${claimId}/confirm`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code, idempotencyKey }),
      },
      { RATE_LIMIT_STORE: rateLimitStore },
    )
  }

  it("answers unresolved references with the same accepted envelope and sends nothing", async () => {
    const unknown = await startClaim("DOES-NOT-EXIST")
    expect(unknown.status).toBe(202)
    expect(await unknown.json()).toEqual({
      data: { claimId: expect.any(String), deliveryStatus: "accepted" },
    })
    expect(deliveryCount).toBe(0)

    await seedBooking("REAL-REFERENCE")
    const real = await startClaim("real-reference", "start-2")
    expect(real.status).toBe(202)
    expect(await real.json()).toEqual({
      data: { claimId: expect.any(String), deliveryStatus: "accepted" },
    })
    expect(deliveryCount).toBe(1)
  })

  it("keeps start idempotency indistinguishable for unresolved, valid, and drifted requests", async () => {
    const unknownFirst = await startClaim("DOES-NOT-EXIST", "opaque-start")
    const unknownReplay = await startClaim("STILL-NOT-REAL", "opaque-start")
    const unknownId = ((await unknownFirst.json()) as { data: { claimId: string } }).data.claimId
    expect(((await unknownReplay.json()) as { data: { claimId: string } }).data.claimId).toBe(
      unknownId,
    )

    await seedBooking("IDEMPOTENT-REAL")
    const realFirst = await startClaim("IDEMPOTENT-REAL", "real-start")
    const realDrift = await startClaim("DOES-NOT-EXIST", "real-start")
    const realId = ((await realFirst.json()) as { data: { claimId: string } }).data.claimId
    expect(realDrift.status).toBe(202)
    expect(((await realDrift.json()) as { data: { claimId: string } }).data.claimId).toBe(realId)
  })

  it("binds separate Buyer Accounts to separate verification challenges", async () => {
    await seedBooking("SHARED-REFERENCE")
    const first = await startClaim("SHARED-REFERENCE", "account-a")
    const firstClaimId = ((await first.json()) as { data: { claimId: string } }).data.claimId

    buyerAccountId = "personal:claim-user-b"
    rateLimitStore = createMemoryRateLimitStore()
    const second = await startClaim("SHARED-REFERENCE", "account-b")
    const secondClaimId = ((await second.json()) as { data: { claimId: string } }).data.claimId

    expect(secondClaimId).not.toBe(firstClaimId)
    expect(await db.select().from(customerVerificationChallenges)).toHaveLength(2)
    expect(await db.select().from(customerBookingAccessClaims)).toHaveLength(2)
  })

  it("rate limits repeated starts for the same Buyer Account and Booking reference", async () => {
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      const response = await startClaim("RATE-LIMITED-REFERENCE", `rate-start-${attempt}`)
      expect(response.status).toBe(202)
    }

    const limited = await startClaim("RATE-LIMITED-REFERENCE", "rate-start-4")
    expect(limited.status).toBe(429)
    expect(await limited.json()).toEqual({ error: "Too Many Requests", code: "rate_limited" })
    expect(limited.headers.get("retry-after")).not.toBeNull()
  })

  it("silently suppresses repeated delivery to the same destination", async () => {
    await seedBooking("DESTINATION-A", "same-destination@example.test")
    await seedBooking("DESTINATION-B", "same-destination@example.test")

    expect((await startClaim("DESTINATION-A", "destination-start-1")).status).toBe(202)
    expect((await startClaim("DESTINATION-B", "destination-start-2")).status).toBe(202)
    expect(deliveryCount).toBe(1)
  })

  it("fails closed when the active Buyer Account changes before confirmation", async () => {
    await seedBooking("ACCOUNT-BOUND")
    const started = await startClaim("ACCOUNT-BOUND")
    const claimId = ((await started.json()) as { data: { claimId: string } }).data.claimId
    if (!deliveredCode) throw new Error("verification code was not delivered")

    buyerAccountId = "personal:another-user"
    const confirmed = await confirmClaim(claimId, deliveredCode)
    expect(confirmed.status).toBe(409)
    expect(await confirmed.json()).toEqual({ error: "invalid_or_expired" })
  })

  it("cannot redirect a challenge started for one Booking to another Booking", async () => {
    await seedBooking("BOOKING-A")
    const bookingB = await seedBooking("BOOKING-B")
    const started = await startClaim("BOOKING-A")
    const claimId = ((await started.json()) as { data: { claimId: string } }).data.claimId
    if (!deliveredCode) throw new Error("verification code was not delivered")

    await db
      .update(customerBookingAccessClaims)
      .set({ bookingId: bookingB.id })
      .where(eq(customerBookingAccessClaims.id, claimId))

    const confirmed = await confirmClaim(claimId, deliveredCode)
    expect(confirmed.status).toBe(409)
    expect(await listBookingCustomerAccess(db, bookingB.id)).toEqual([])
  })

  it("replays confirmation and leaves exactly one Booking Access Grant", async () => {
    const booking = await seedBooking("REPLAY-ONCE")
    const started = await startClaim("REPLAY-ONCE")
    const claimId = ((await started.json()) as { data: { claimId: string } }).data.claimId
    if (!deliveredCode) throw new Error("verification code was not delivered")

    const first = await confirmClaim(claimId, deliveredCode)
    expect(first.status).toBe(200)
    expect((await first.json()).data).toEqual(
      expect.objectContaining({ status: "granted", grantId: expect.any(String) }),
    )

    const replay = await confirmClaim(claimId, deliveredCode)
    expect(replay.status).toBe(200)
    expect((await replay.json()).data).toEqual(
      expect.objectContaining({ status: "replayed", grantId: expect.any(String) }),
    )
    const drift = await confirmClaim(claimId, deliveredCode, "confirm-different")
    expect(drift.status).toBe(409)
    expect(await listBookingCustomerAccess(db, booking.id)).toHaveLength(1)
    expect(
      await db
        .select()
        .from(actionLedgerEntries)
        .where(eq(actionLedgerEntries.idempotencyKey, "confirm-1")),
    ).toHaveLength(1)
  })

  it("declares browser-key reachability without making claim routes anonymous", () => {
    const module = createCustomerPortalApiModule()
    expect(module.publishable).toBe(true)
    expect(module.anonymous).toBeUndefined()
  })
})
