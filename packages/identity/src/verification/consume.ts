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
import { and, eq, gt, isNull, lt, sql } from "drizzle-orm"

import { customerVerificationChallenges } from "./schema.js"

async function hashVerificationCode(code: string) {
  const bytes = new TextEncoder().encode(code)
  const digest = await crypto.subtle.digest("SHA-256", bytes)
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("")
}

export interface ConfirmAndConsumeChallengeByIdInput {
  challengeId: string
  channel?: "email" | "sms"
  purpose: string
  subjectRef: string
  destination?: string
  code: string
  consumedRef: string
  now?: Date
}

export type ConfirmAndConsumeChallengeByIdResult =
  | { status: "consumed"; destination: string }
  | { status: "replay"; destination: string }
  | { status: "rejected" }

/**
 * Confirm and spend one purpose- and subject-bound challenge by its exact id.
 *
 * This is the internal composition primitive for commands that must commit the
 * authorized mutation in the same transaction. Unlike the public confirmation
 * routes, it never searches by destination. Every binding and the code hash is
 * part of the conditional update, so concurrent consumers cannot both win.
 */
export async function confirmAndConsumeChallengeById(
  tx: AnyDrizzleDb,
  input: ConfirmAndConsumeChallengeByIdInput,
): Promise<ConfirmAndConsumeChallengeByIdResult> {
  const now = input.now ?? new Date()
  const destination = input.destination
    ? input.channel === "email"
      ? input.destination.trim().toLowerCase()
      : input.destination.trim()
    : undefined
  const codeHash = await hashVerificationCode(input.code)

  const [consumed] = await tx
    .update(customerVerificationChallenges)
    .set({
      status: "verified",
      verifiedAt: now,
      consumedAt: now,
      consumedRef: input.consumedRef,
      updatedAt: now,
    })
    .where(
      and(
        eq(customerVerificationChallenges.id, input.challengeId),
        input.channel ? eq(customerVerificationChallenges.channel, input.channel) : undefined,
        eq(customerVerificationChallenges.purpose, input.purpose),
        eq(customerVerificationChallenges.subjectRef, input.subjectRef),
        destination ? eq(customerVerificationChallenges.destination, destination) : undefined,
        eq(customerVerificationChallenges.codeHash, codeHash),
        eq(customerVerificationChallenges.status, "pending"),
        lt(customerVerificationChallenges.attemptCount, customerVerificationChallenges.maxAttempts),
        isNull(customerVerificationChallenges.consumedAt),
        gt(customerVerificationChallenges.expiresAt, now),
      ),
    )
    .returning()

  if (consumed) return { status: "consumed", destination: consumed.destination }

  const [replay] = await tx
    .select({ destination: customerVerificationChallenges.destination })
    .from(customerVerificationChallenges)
    .where(
      and(
        eq(customerVerificationChallenges.id, input.challengeId),
        input.channel ? eq(customerVerificationChallenges.channel, input.channel) : undefined,
        eq(customerVerificationChallenges.purpose, input.purpose),
        eq(customerVerificationChallenges.subjectRef, input.subjectRef),
        destination ? eq(customerVerificationChallenges.destination, destination) : undefined,
        eq(customerVerificationChallenges.codeHash, codeHash),
        eq(customerVerificationChallenges.status, "verified"),
        eq(customerVerificationChallenges.consumedRef, input.consumedRef),
      ),
    )
    .limit(1)

  if (replay) return { status: "replay", destination: replay.destination }

  // A wrong code against the exact bound challenge consumes one attempt. Keep
  // this conditional update separate from the successful spend so the code
  // hash never appears in the invalid-attempt predicate, while every other
  // authority binding remains fixed. Concurrent guesses serialize through the
  // row update and cannot bypass maxAttempts.
  await tx
    .update(customerVerificationChallenges)
    .set({
      attemptCount: sql`${customerVerificationChallenges.attemptCount} + 1`,
      status: sql`CASE WHEN ${customerVerificationChallenges.attemptCount} + 1 >= ${customerVerificationChallenges.maxAttempts} THEN 'failed'::customer_verification_status ELSE ${customerVerificationChallenges.status} END`,
      failedAt: sql`CASE WHEN ${customerVerificationChallenges.attemptCount} + 1 >= ${customerVerificationChallenges.maxAttempts} THEN ${now.toISOString()}::timestamptz ELSE ${customerVerificationChallenges.failedAt} END`,
      updatedAt: now,
    })
    .where(
      and(
        eq(customerVerificationChallenges.id, input.challengeId),
        input.channel ? eq(customerVerificationChallenges.channel, input.channel) : undefined,
        eq(customerVerificationChallenges.purpose, input.purpose),
        eq(customerVerificationChallenges.subjectRef, input.subjectRef),
        destination ? eq(customerVerificationChallenges.destination, destination) : undefined,
        eq(customerVerificationChallenges.status, "pending"),
        lt(customerVerificationChallenges.attemptCount, customerVerificationChallenges.maxAttempts),
        isNull(customerVerificationChallenges.consumedAt),
        gt(customerVerificationChallenges.expiresAt, now),
      ),
    )

  return { status: "rejected" }
}

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
