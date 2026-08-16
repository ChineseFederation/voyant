/**
 * Single-use consumption of a verified storefront challenge.
 *
 * A verified challenge is a bearer credential: without consumption it would
 * authorize an unlimited number of bookings, and without binding it would
 * authorize a booking for a draft or a contact it was never verified against.
 *
 * Consumption is one conditional UPDATE so that concurrent callers cannot both
 * win, and it takes a transaction because it must commit atomically with
 * whatever it authorizes. For booking creation that means running inside the
 * create command, after the durable claim — an exact idempotent retry replays
 * the original booking without re-entering this path.
 */
import type { AnyDrizzleDb } from "@voyant-travel/db"
import { and, eq, gt, isNull } from "drizzle-orm"

import { customerVerificationChallenges } from "./schema.js"

/** Purpose marking a challenge as authorizing one self-service booking create. */
export const PUBLIC_API_VERIFICATION_BOOKING_CREATE_PURPOSE = "booking_create" as const

/** How long a verified challenge stays spendable. */
const DEFAULT_CONSUMPTION_WINDOW_SECONDS = 30 * 60

export interface ConsumeVerifiedChallengeInput {
  challengeId: string
  /** Must equal the purpose the challenge was started with. */
  purpose: string
  /** The draft the challenge was bound to at start. */
  subjectRef: string
  /**
   * The normalized contact the challenge proved control of. Passing the
   * booking's billing contact here is what stops a challenge verified for one
   * address from authorizing a booking billed to another.
   */
  destination: string
  /** What is consuming it — the created booking id. */
  consumedRef: string
  now?: Date
  consumptionWindowSeconds?: number
}

export type ConsumeVerifiedChallengeResult =
  | { status: "consumed"; destination: string }
  | { status: "rejected" }

/**
 * Spend a verified challenge, or report that it cannot be spent.
 *
 * Every condition lives in the UPDATE predicate rather than in a preceding
 * read, so there is no window between checking and spending.
 */
export async function consumeVerifiedChallenge(
  tx: AnyDrizzleDb,
  input: ConsumeVerifiedChallengeInput,
): Promise<ConsumeVerifiedChallengeResult> {
  const now = input.now ?? new Date()
  const windowSeconds = Math.max(
    60,
    input.consumptionWindowSeconds ?? DEFAULT_CONSUMPTION_WINDOW_SECONDS,
  )
  const verifiedAfter = new Date(now.getTime() - windowSeconds * 1000)

  const [row] = await tx
    .update(customerVerificationChallenges)
    .set({ consumedAt: now, consumedRef: input.consumedRef, updatedAt: now })
    .where(
      and(
        eq(customerVerificationChallenges.id, input.challengeId),
        eq(customerVerificationChallenges.status, "verified"),
        isNull(customerVerificationChallenges.consumedAt),
        eq(customerVerificationChallenges.purpose, input.purpose),
        eq(customerVerificationChallenges.subjectRef, input.subjectRef),
        eq(customerVerificationChallenges.destination, input.destination),
        gt(customerVerificationChallenges.verifiedAt, verifiedAfter),
      ),
    )
    .returning()

  return row ? { status: "consumed", destination: row.destination } : { status: "rejected" }
}

/**
 * Read the destination a challenge was verified for, without spending it.
 *
 * Applies the same binding predicate as consumption — purpose, subject, and
 * verification window — so a caller cannot learn the destination of a
 * challenge that could not authorize this booking anyway. Returns null when
 * the challenge is unusable, so the route reports "verification required"
 * rather than distinguishing why.
 */
export async function peekVerifiedChallengeDestination(
  db: AnyDrizzleDb,
  input: {
    challengeId: string
    purpose: string
    subjectRef: string
    now?: Date
    consumptionWindowSeconds?: number
  },
): Promise<{ channel: "email" | "sms"; destination: string } | null> {
  const now = input.now ?? new Date()
  const windowSeconds = Math.max(
    60,
    input.consumptionWindowSeconds ?? DEFAULT_CONSUMPTION_WINDOW_SECONDS,
  )
  const verifiedAfter = new Date(now.getTime() - windowSeconds * 1000)

  const rows = await db
    .select({
      channel: customerVerificationChallenges.channel,
      destination: customerVerificationChallenges.destination,
    })
    .from(customerVerificationChallenges)
    .where(
      and(
        eq(customerVerificationChallenges.id, input.challengeId),
        eq(customerVerificationChallenges.status, "verified"),
        isNull(customerVerificationChallenges.consumedAt),
        eq(customerVerificationChallenges.purpose, input.purpose),
        eq(customerVerificationChallenges.subjectRef, input.subjectRef),
        gt(customerVerificationChallenges.verifiedAt, verifiedAfter),
      ),
    )
    .limit(1)

  const row = rows[0]
  return row ? { channel: row.channel, destination: row.destination } : null
}
