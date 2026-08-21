import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import {
  grantBookingCustomerAccess,
  hasActiveBookingCustomerAccess,
  listAccessibleBookingIds,
  listBookingCustomerAccess,
  revokeBookingCustomerAccess,
} from "../../src/customer-access.js"
import {
  bookingCustomerAccessCommands,
  bookingCustomerAccessGrants,
  bookings,
} from "../../src/schema.js"

const DB_AVAILABLE = !!process.env.TEST_DATABASE_URL

describe.skipIf(!DB_AVAILABLE)("booking customer access", () => {
  let db: ReturnType<typeof import("@voyant-travel/db/test-utils").createTestDb>

  beforeAll(async () => {
    const { createTestDb } = await import("@voyant-travel/db/test-utils")
    db = createTestDb()
  })

  beforeEach(async () => {
    await db.delete(bookingCustomerAccessCommands)
    await db.delete(bookingCustomerAccessGrants)
    await db.delete(bookings)
  })

  afterAll(async () => {
    const { closeTestDb } = await import("@voyant-travel/db/test-utils")
    await closeTestDb()
  })

  it("creates one owner grant and replays the same command", async () => {
    const [booking] = await db
      .insert(bookings)
      .values({ bookingNumber: "ACCESS-1", status: "confirmed", sellCurrency: "EUR" })
      .returning()
    if (!booking) throw new Error("booking fixture was not created")

    const command = {
      bookingId: booking.id,
      buyerAccount: { id: "personal:user_1", kind: "personal" as const },
      role: "owner" as const,
      source: "authenticated_commit" as const,
      proofRef: "bks_test",
      grantedByPrincipalId: "user_1",
      idempotencyKey: "commit-1",
    }

    const created = await db.transaction((tx) => grantBookingCustomerAccess(tx, command))
    const replayed = await db.transaction((tx) => grantBookingCustomerAccess(tx, command))

    expect(created.status).toBe("created")
    expect(replayed).toMatchObject({ status: "replayed", grant: { id: created.grant?.id } })
    expect(await db.select().from(bookingCustomerAccessGrants)).toHaveLength(1)
    expect(await db.select().from(bookingCustomerAccessCommands)).toHaveLength(1)
    await expect(
      listAccessibleBookingIds(db, {
        buyerAccount: { id: "personal:user_1", kind: "personal" },
      }),
    ).resolves.toEqual([booking.id])
  })

  it("rejects idempotency drift without changing the original grant", async () => {
    const [booking] = await db
      .insert(bookings)
      .values({ bookingNumber: "ACCESS-2", status: "confirmed", sellCurrency: "EUR" })
      .returning()
    if (!booking) throw new Error("booking fixture was not created")
    const base = {
      bookingId: booking.id,
      buyerAccount: { id: "personal:user_2", kind: "personal" as const },
      role: "owner" as const,
      source: "staff_grant" as const,
      proofRef: "staff-command-1",
      grantedByPrincipalId: "staff_1",
      idempotencyKey: "grant-2",
    }

    await db.transaction((tx) => grantBookingCustomerAccess(tx, base))
    const drifted = await db.transaction((tx) =>
      grantBookingCustomerAccess(tx, {
        ...base,
        buyerAccount: { ...base.buyerAccount, id: "personal:user_3" },
      }),
    )

    expect(drifted.status).toBe("idempotency_conflict")
    expect(await listBookingCustomerAccess(db, booking.id)).toHaveLength(1)
  })

  it("revokes immediately, replays exactly, and rejects changed revocation evidence", async () => {
    const [booking] = await db
      .insert(bookings)
      .values({ bookingNumber: "ACCESS-3", status: "confirmed", sellCurrency: "EUR" })
      .returning()
    if (!booking) throw new Error("booking fixture was not created")
    const granted = await db.transaction((tx) =>
      grantBookingCustomerAccess(tx, {
        bookingId: booking.id,
        buyerAccount: { id: "business:org_1", kind: "business" },
        role: "owner",
        source: "authenticated_commit",
        proofRef: "session_3",
        grantedByPrincipalId: "member_1",
        grantedByMembershipId: "membership_1",
        grantedByMembershipRole: "member",
        idempotencyKey: "grant-3",
      }),
    )
    if (!granted.grant) throw new Error("grant fixture was not created")
    expect(granted.grant).toMatchObject({
      grantedByMembershipId: "membership_1",
      grantedByMembershipRole: "member",
    })
    expect(
      await hasActiveBookingCustomerAccess(db, {
        bookingId: booking.id,
        buyerAccountId: "business:org_1",
      }),
    ).toBe(true)
    const command = {
      bookingId: booking.id,
      grantId: granted.grant.id,
      reason: "Account requested removal",
      revokedByPrincipalId: "staff_1",
      idempotencyKey: "revoke-3",
    }

    const revoked = await db.transaction((tx) => revokeBookingCustomerAccess(tx, command))
    const replayed = await db.transaction((tx) => revokeBookingCustomerAccess(tx, command))
    const drifted = await db.transaction((tx) =>
      revokeBookingCustomerAccess(tx, { ...command, reason: "Different reason" }),
    )
    const newConflict = {
      ...command,
      idempotencyKey: "revoke-3-conflict",
      reason: "Different reason",
    }
    const firstConflict = await db.transaction((tx) => revokeBookingCustomerAccess(tx, newConflict))
    const replayedConflict = await db.transaction((tx) =>
      revokeBookingCustomerAccess(tx, newConflict),
    )

    expect(revoked.status).toBe("revoked")
    expect(replayed.status).toBe("replayed")
    expect(drifted.status).toBe("idempotency_conflict")
    expect(firstConflict.status).toBe("idempotency_conflict")
    expect(replayedConflict.status).toBe("idempotency_conflict")
    expect(
      await hasActiveBookingCustomerAccess(db, {
        bookingId: booking.id,
        buyerAccountId: "business:org_1",
      }),
    ).toBe(false)
  })

  it("reactivates the same natural grant instead of copying it", async () => {
    const [booking] = await db
      .insert(bookings)
      .values({ bookingNumber: "ACCESS-4", status: "confirmed", sellCurrency: "EUR" })
      .returning()
    if (!booking) throw new Error("booking fixture was not created")
    const common = {
      bookingId: booking.id,
      buyerAccount: { id: "personal:user_4", kind: "personal" as const },
      role: "owner" as const,
      source: "staff_grant" as const,
      proofRef: "staff-command-4",
      grantedByPrincipalId: "staff_1",
    }
    const first = await db.transaction((tx) =>
      grantBookingCustomerAccess(tx, { ...common, idempotencyKey: "grant-4a" }),
    )
    if (!first.grant) throw new Error("grant fixture was not created")
    await db.transaction((tx) =>
      revokeBookingCustomerAccess(tx, {
        bookingId: booking.id,
        grantId: first.grant.id,
        reason: "Temporary removal",
        revokedByPrincipalId: "staff_1",
        idempotencyKey: "revoke-4",
      }),
    )

    const second = await db.transaction((tx) =>
      grantBookingCustomerAccess(tx, { ...common, idempotencyKey: "grant-4b" }),
    )

    expect(second).toMatchObject({ status: "reactivated", grant: { id: first.grant.id } })
    expect(await listBookingCustomerAccess(db, booking.id)).toHaveLength(1)
  })
})
