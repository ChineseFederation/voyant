import {
  confirmBookingAccessClaim,
  prepareBookingAccessClaimStart,
  startBookingAccessClaim,
} from "@voyant-travel/bookings/customer-access-claims"
import type { CustomerBuyerContext } from "@voyant-travel/hono"
import {
  type CustomerVerificationSenders,
  type CustomerVerificationServiceOptions,
  confirmAndConsumeChallengeById,
  createCustomerVerificationService,
} from "@voyant-travel/identity/verification"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"

export interface StartCustomerBookingClaimInput {
  bookingReference: string
  channel?: "email" | "sms"
  idempotencyKey: string
}

export interface ConfirmCustomerBookingClaimInput {
  code: string
  idempotencyKey: string
}

export interface CustomerBookingClaimServiceOptions extends CustomerVerificationServiceOptions {
  senders: CustomerVerificationSenders
  allowDestination?(channel: "email" | "sms", destination: string): Promise<boolean>
}

export interface CustomerBookingClaimCompletionAudit {
  append(
    tx: PostgresJsDatabase,
    input: {
      claimId: string
      grantId: string
      idempotencyKey: string
      requestFingerprint: string
    },
  ): Promise<void>
}

export type StartCustomerBookingClaimResult = { status: "accepted"; claimId: string }

export type ConfirmCustomerBookingClaimResult =
  | { status: "granted" | "replayed"; grantId: string }
  | { status: "invalid_or_expired" | "idempotency_conflict" }

function normalizeBookingReference(reference: string) {
  return reference.trim().toLocaleUpperCase("en-US")
}

async function fingerprint(value: unknown) {
  const bytes = new TextEncoder().encode(JSON.stringify(value))
  const digest = await crypto.subtle.digest("SHA-256", bytes)
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("")
}

const CROCKFORD_BASE32 = "0123456789abcdefghjkmnpqrstvwxyz"

async function stableClaimId(buyerAccountId: string, idempotencyKey: string) {
  const digest = await fingerprint({ buyerAccountId, idempotencyKey })
  let value = BigInt(`0x${digest.slice(0, 32)}`)
  let suffix = ""
  for (let index = 0; index < 26; index += 1) {
    suffix = CROCKFORD_BASE32[Number(value & 31n)] + suffix
    value >>= 5n
  }
  return `bkcl_${suffix}`
}

function accountRef(buyer: CustomerBuyerContext) {
  return { id: buyer.buyerAccountId, kind: buyer.kind }
}

function isEligibleBooking(
  booking: { organizationId: string | null },
  buyer: CustomerBuyerContext,
) {
  if (buyer.kind === "personal") return booking.organizationId === null
  return booking.organizationId === buyer.relationshipOrganizationId
}

function selectDestination(
  booking: { contactEmail: string | null; contactPhone: string | null },
  requestedChannel?: "email" | "sms",
): { channel: "email" | "sms"; destination: string } | null {
  const channel = requestedChannel ?? (booking.contactEmail ? "email" : "sms")
  const destination = channel === "email" ? booking.contactEmail : booking.contactPhone
  if (!destination?.trim()) return null
  return { channel, destination: destination.trim() }
}

/**
 * Starts a booking-scoped proof without disclosing whether the reference was
 * resolved. Invalid and ineligible references receive an unpersisted opaque id
 * and the same accepted result as a delivered challenge.
 */
export async function startCustomerBookingClaim(
  db: PostgresJsDatabase,
  buyer: CustomerBuyerContext,
  input: StartCustomerBookingClaimInput,
  options: CustomerBookingClaimServiceOptions,
): Promise<StartCustomerBookingClaimResult> {
  const bookingReference = normalizeBookingReference(input.bookingReference)
  const requestFingerprint = await fingerprint({
    bookingReference,
    channel: input.channel ?? null,
  })
  // The response id depends only on the authenticated Buyer Account and the
  // idempotency key. Valid, invalid, suppressed, and failed starts therefore
  // have identical replay behavior and cannot become a Booking oracle.
  const claimId = await stableClaimId(buyer.buyerAccountId, input.idempotencyKey)

  const prepared = await prepareBookingAccessClaimStart(db, {
    buyerAccountId: buyer.buyerAccountId,
    idempotencyKey: input.idempotencyKey,
    requestFingerprint,
    normalizedBookingReference: bookingReference,
  })
  if (prepared.status === "replayed") {
    return { status: "accepted", claimId: prepared.claimId }
  }
  if (prepared.status === "idempotency_conflict") {
    return { status: "accepted", claimId: prepared.claimId }
  }
  const booking = prepared.status === "ready" ? prepared.booking : null
  const destination = booking ? selectDestination(booking, input.channel) : null

  if (!booking || !destination || !isEligibleBooking(booking, buyer)) {
    return { status: "accepted", claimId }
  }
  if (
    options.allowDestination &&
    !(await options.allowDestination(destination.channel, destination.destination))
  ) {
    return { status: "accepted", claimId }
  }

  const verification = createCustomerVerificationService(options)
  try {
    return await db.transaction(async (tx) => {
      const txDb = tx as PostgresJsDatabase
      const challenge =
        destination.channel === "email"
          ? await verification.startEmailChallenge(
              txDb,
              {
                email: destination.destination,
                purpose: "booking_access_claim",
                subjectRef: `booking:${booking.id}:claim:${claimId}`,
              },
              options.senders,
            )
          : await verification.startSmsChallenge(
              txDb,
              {
                phone: destination.destination,
                purpose: "booking_access_claim",
                subjectRef: `booking:${booking.id}:claim:${claimId}`,
              },
              options.senders,
            )

      const started = await startBookingAccessClaim(txDb, {
        claimId,
        bookingId: booking.id,
        buyerAccount: accountRef(buyer),
        challengeId: challenge.id,
        idempotencyKey: input.idempotencyKey,
        requestFingerprint,
        expiresAt: challenge.expiresAt,
        now: options.now?.(),
      })
      if (started.status === "idempotency_conflict") {
        return { status: "accepted" as const, claimId: started.claim.id }
      }
      return { status: "accepted" as const, claimId: started.claim.id }
    })
  } catch {
    // Delivery configuration and provider failures must not turn this endpoint
    // into a Booking-reference oracle; the caller receives the same accepted
    // envelope as an unresolved or ineligible reference.
    return { status: "accepted", claimId }
  }
}

/** Confirms only the challenge id and bindings already stored on the claim. */
export async function confirmCustomerBookingClaim(
  db: PostgresJsDatabase,
  buyer: CustomerBuyerContext,
  claimId: string,
  input: ConfirmCustomerBookingClaimInput,
  options: Pick<CustomerVerificationServiceOptions, "now"> & {
    completionAudit?: CustomerBookingClaimCompletionAudit
  } = {},
): Promise<ConfirmCustomerBookingClaimResult> {
  const requestFingerprint = await fingerprint({ claimId, code: input.code })

  return db.transaction(async (tx) => {
    const txDb = tx as PostgresJsDatabase
    const result = await confirmBookingAccessClaim(
      txDb,
      {
        claimId,
        buyerAccount: accountRef(buyer),
        code: input.code,
        principalId: buyer.userId,
        membershipId: buyer.kind === "business" ? buyer.membershipId : null,
        membershipRole: buyer.kind === "business" ? buyer.membershipRole : null,
        idempotencyKey: input.idempotencyKey,
        requestFingerprint,
        now: options.now?.(),
      },
      {
        async consumeChallenge(challengeTx, challengeInput) {
          const consumed = await confirmAndConsumeChallengeById(challengeTx, {
            challengeId: challengeInput.challengeId,
            purpose: challengeInput.expectedPurpose,
            subjectRef: challengeInput.expectedSubjectRef,
            code: challengeInput.code,
            consumedRef: `booking-claim:${claimId}`,
            now: options.now?.(),
          })
          return consumed.status === "rejected"
            ? { status: "invalid" as const }
            : { status: "verified" as const }
        },
      },
    )

    if (result.status === "granted" || result.status === "replayed") {
      if (result.status === "granted") {
        await options.completionAudit?.append(txDb, {
          claimId,
          grantId: result.grantId,
          idempotencyKey: input.idempotencyKey,
          requestFingerprint,
        })
      }
      return { status: result.status, grantId: result.grantId }
    }
    // Narrowing `result` here still carries the domain command's wider status
    // union, and this transport deliberately collapses "invalid", "expired" and
    // "not_found" into one answer, so the reply is written out rather than
    // forwarded.
    if (result.status === "idempotency_conflict") return { status: "idempotency_conflict" }
    return { status: "invalid_or_expired" }
  })
}
