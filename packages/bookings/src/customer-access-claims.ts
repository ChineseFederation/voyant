import { and, eq, sql } from "drizzle-orm"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"

import { type BuyerAccountRef, grantBookingCustomerAccess } from "./customer-access.js"
import { bookings } from "./schema-core.js"
import {
  type CustomerBookingAccessClaim,
  customerBookingAccessClaims,
} from "./schema-customer-access.js"

export type PrepareBookingAccessClaimStartResult =
  | { status: "replayed"; claimId: string }
  | { status: "idempotency_conflict"; claimId: string }
  | { status: "not_found" }
  | {
      status: "ready"
      booking: {
        id: string
        organizationId: string | null
        contactEmail: string | null
        contactPhone: string | null
      }
    }

/** Owner-owned lookup used before a transport creates a verification challenge. */
export async function prepareBookingAccessClaimStart(
  db: PostgresJsDatabase,
  input: {
    buyerAccountId: string
    idempotencyKey: string
    requestFingerprint: string
    normalizedBookingReference: string
  },
): Promise<PrepareBookingAccessClaimStartResult> {
  const [existing] = await db
    .select({
      id: customerBookingAccessClaims.id,
      requestFingerprint: customerBookingAccessClaims.requestFingerprint,
    })
    .from(customerBookingAccessClaims)
    .where(
      and(
        eq(customerBookingAccessClaims.buyerAccountId, input.buyerAccountId),
        eq(customerBookingAccessClaims.idempotencyKey, input.idempotencyKey),
      ),
    )
    .limit(1)
  if (existing) {
    return existing.requestFingerprint === input.requestFingerprint
      ? { status: "replayed", claimId: existing.id }
      : { status: "idempotency_conflict", claimId: existing.id }
  }

  const [booking] = await db
    .select({
      id: bookings.id,
      organizationId: bookings.organizationId,
      contactEmail: bookings.contactEmail,
      contactPhone: bookings.contactPhone,
    })
    .from(bookings)
    .where(sql`upper(${bookings.bookingNumber}) = ${input.normalizedBookingReference}`)
    .limit(1)
  return booking ? { status: "ready", booking } : { status: "not_found" }
}

export interface StartBookingAccessClaimInput {
  claimId?: string
  bookingId: string
  buyerAccount: BuyerAccountRef
  challengeId: string
  idempotencyKey: string
  requestFingerprint: string
  expiresAt: Date
  now?: Date
}

export type StartBookingAccessClaimResult =
  | { status: "created" | "replayed"; claim: CustomerBookingAccessClaim }
  | { status: "idempotency_conflict"; claim: CustomerBookingAccessClaim }

export interface ConfirmBookingAccessClaimInput {
  claimId: string
  buyerAccount: BuyerAccountRef
  code: string
  principalId: string
  membershipId?: string | null
  membershipRole?: string | null
  idempotencyKey: string
  requestFingerprint: string
  now?: Date
}

export interface BookingAccessClaimChallengeConsumer {
  consumeChallenge(
    tx: PostgresJsDatabase,
    input: {
      challengeId: string
      code: string
      expectedPurpose: "booking_access_claim"
      expectedSubjectRef: string
    },
  ): Promise<{ status: "verified" | "invalid" | "expired" }>
}

export type ConfirmBookingAccessClaimResult =
  | {
      status: "granted" | "replayed"
      claim: CustomerBookingAccessClaim
      grantId: string
    }
  | { status: "invalid" | "expired" | "not_found" | "idempotency_conflict" }

function assertBuyerAccount(account: BuyerAccountRef) {
  if (!account.id.startsWith(`${account.kind}:`) || account.id.length <= account.kind.length + 1) {
    throw new Error("Buyer Account id does not match its kind")
  }
}

/** Persist a claim already bound to a server-created verification challenge. */
export async function startBookingAccessClaim(
  tx: PostgresJsDatabase,
  input: StartBookingAccessClaimInput,
): Promise<StartBookingAccessClaimResult> {
  assertBuyerAccount(input.buyerAccount)
  const [created] = await tx
    .insert(customerBookingAccessClaims)
    .values({
      ...(input.claimId ? { id: input.claimId } : {}),
      bookingId: input.bookingId,
      buyerAccountId: input.buyerAccount.id,
      buyerAccountKind: input.buyerAccount.kind,
      challengeId: input.challengeId,
      status: "pending",
      idempotencyKey: input.idempotencyKey,
      requestFingerprint: input.requestFingerprint,
      createdAt: input.now ?? new Date(),
      expiresAt: input.expiresAt,
    })
    .onConflictDoNothing({
      target: [
        customerBookingAccessClaims.buyerAccountId,
        customerBookingAccessClaims.idempotencyKey,
      ],
    })
    .returning()
  if (created) return { status: "created", claim: created }

  const [existing] = await tx
    .select()
    .from(customerBookingAccessClaims)
    .where(
      and(
        eq(customerBookingAccessClaims.buyerAccountId, input.buyerAccount.id),
        eq(customerBookingAccessClaims.idempotencyKey, input.idempotencyKey),
      ),
    )
    .limit(1)
  if (!existing) throw new Error("Booking access claim could not be persisted or replayed")
  if (
    existing.bookingId !== input.bookingId ||
    existing.buyerAccountKind !== input.buyerAccount.kind ||
    existing.challengeId !== input.challengeId ||
    existing.requestFingerprint !== input.requestFingerprint ||
    existing.expiresAt.getTime() !== input.expiresAt.getTime()
  ) {
    return { status: "idempotency_conflict", claim: existing }
  }
  return { status: "replayed", claim: existing }
}

/**
 * Confirm a claim inside the caller's transaction.
 *
 * The challenge consumer receives the same transaction and the challenge id
 * stored on the claim. It must verify and consume that exact row; callers may
 * not replace the subject or destination with request data.
 */
export async function confirmBookingAccessClaim(
  tx: PostgresJsDatabase,
  input: ConfirmBookingAccessClaimInput,
  runtime: BookingAccessClaimChallengeConsumer,
): Promise<ConfirmBookingAccessClaimResult> {
  assertBuyerAccount(input.buyerAccount)
  const [claim] = await tx
    .select()
    .from(customerBookingAccessClaims)
    .where(eq(customerBookingAccessClaims.id, input.claimId))
    .limit(1)
    .for("update")
  if (
    !claim ||
    claim.buyerAccountId !== input.buyerAccount.id ||
    claim.buyerAccountKind !== input.buyerAccount.kind
  ) {
    return { status: "not_found" }
  }

  if (claim.status === "granted") {
    if (
      claim.confirmationIdempotencyKey !== input.idempotencyKey ||
      claim.confirmationRequestFingerprint !== input.requestFingerprint
    ) {
      return { status: "idempotency_conflict" }
    }
    return claim.grantId
      ? { status: "replayed", claim, grantId: claim.grantId }
      : { status: "not_found" }
  }
  const now = input.now ?? new Date()
  if (claim.status === "expired" || claim.expiresAt.getTime() <= now.getTime()) {
    if (claim.status === "pending") {
      await tx
        .update(customerBookingAccessClaims)
        .set({ status: "expired" })
        .where(eq(customerBookingAccessClaims.id, claim.id))
    }
    return { status: "expired" }
  }
  if (claim.status !== "pending") return { status: "invalid" }

  const proof = await runtime.consumeChallenge(tx, {
    challengeId: claim.challengeId,
    code: input.code,
    expectedPurpose: "booking_access_claim",
    expectedSubjectRef: `booking:${claim.bookingId}:claim:${claim.id}`,
  })
  if (proof.status === "expired") {
    await tx
      .update(customerBookingAccessClaims)
      .set({ status: "expired" })
      .where(eq(customerBookingAccessClaims.id, claim.id))
    return { status: "expired" }
  }
  if (proof.status !== "verified") return { status: "invalid" }

  const granted = await grantBookingCustomerAccess(tx, {
    bookingId: claim.bookingId,
    buyerAccount: input.buyerAccount,
    role: "owner",
    source: "verified_booking_claim",
    proofRef: claim.challengeId,
    grantedByPrincipalId: input.principalId,
    grantedByMembershipId: input.membershipId ?? null,
    grantedByMembershipRole: input.membershipRole ?? null,
    idempotencyKey: `claim:${claim.id}`,
    now,
  })
  if (!granted.grant) {
    return {
      status: granted.status === "idempotency_conflict" ? "idempotency_conflict" : "not_found",
    }
  }
  const [completed] = await tx
    .update(customerBookingAccessClaims)
    .set({
      status: "granted",
      grantedAt: now,
      grantId: granted.grant.id,
      confirmationIdempotencyKey: input.idempotencyKey,
      confirmationRequestFingerprint: input.requestFingerprint,
    })
    .where(eq(customerBookingAccessClaims.id, claim.id))
    .returning()
  if (!completed) throw new Error("Booking access claim disappeared while confirming")
  return { status: "granted", claim: completed, grantId: granted.grant.id }
}
