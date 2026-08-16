import { and, desc, eq } from "drizzle-orm"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"

import { type CustomerVerificationChallenge, customerVerificationChallenges } from "./schema.js"
import type {
  ConfirmEmailVerificationChallengeInput,
  ConfirmSmsVerificationChallengeInput,
  CustomerVerificationChallengeRecord,
  PublicApiVerificationChannel,
  StartEmailVerificationChallengeInput,
  StartSmsVerificationChallengeInput,
} from "./validation.js"

export interface PublicApiVerificationServiceOptions {
  codeLength?: number
  expiresInSeconds?: number
  maxAttempts?: number
  now?: () => Date
}

export interface PublicApiVerificationDeliveryResult {
  id?: string
  provider?: string
}

export type PublicApiVerificationNotificationChannel = "email" | "sms" | (string & {})

export interface PublicApiVerificationNotificationPayload {
  to: string
  channel: PublicApiVerificationNotificationChannel
  provider?: string
  template: string
  data?: unknown
  subject?: string
  text?: string
}

export interface PublicApiVerificationNotificationResult {
  id?: string
  provider: string
}

export interface PublicApiVerificationNotificationProvider {
  readonly name: string
  readonly channels: ReadonlyArray<PublicApiVerificationNotificationChannel>
  send(
    payload: PublicApiVerificationNotificationPayload,
  ): Promise<PublicApiVerificationNotificationResult>
}

export interface PublicApiVerificationEmailSendInput {
  email: string
  code: string
  purpose: string
  locale?: string | null
  expiresAt: Date
  metadata?: Record<string, unknown> | null
}

export interface PublicApiVerificationSmsSendInput {
  phone: string
  code: string
  purpose: string
  locale?: string | null
  expiresAt: Date
  metadata?: Record<string, unknown> | null
}

export interface PublicApiVerificationSenders {
  sendEmailChallenge?: (
    input: PublicApiVerificationEmailSendInput,
  ) => Promise<PublicApiVerificationDeliveryResult | undefined>
  sendSmsChallenge?: (
    input: PublicApiVerificationSmsSendInput,
  ) => Promise<PublicApiVerificationDeliveryResult | undefined>
}

export interface PublicApiVerificationProviderOptions {
  email?: {
    provider?: string
    template?: string
    subject?: string | ((input: PublicApiVerificationEmailSendInput) => string)
  }
  sms?: {
    provider?: string
    template?: string
  }
}

export class PublicApiVerificationError extends Error {
  constructor(
    message: string,
    readonly code:
      | "sender_not_configured"
      | "challenge_not_found"
      | "challenge_expired"
      | "challenge_invalid"
      | "challenge_failed",
  ) {
    super(message)
    this.name = "PublicApiVerificationError"
  }
}

function normalizeEmail(value: string) {
  return value.trim().toLowerCase()
}

function normalizePhone(value: string) {
  return value.trim()
}

function generateVerificationCode(length: number) {
  const chars = "0123456789"
  const bytes = new Uint8Array(length)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (byte) => chars[byte % chars.length]).join("")
}

async function hashVerificationCode(code: string) {
  const bytes = new TextEncoder().encode(code)
  const digest = await crypto.subtle.digest("SHA-256", bytes)
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("")
}

function toChallengeRecord(
  row: CustomerVerificationChallenge,
): CustomerVerificationChallengeRecord {
  return {
    id: row.id,
    channel: row.channel,
    destination: row.destination,
    purpose: row.purpose,
    status: row.status,
    expiresAt: row.expiresAt,
    verifiedAt: row.verifiedAt ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

function requireChallengeRow(
  row: CustomerVerificationChallenge | undefined,
  operation: string,
): CustomerVerificationChallenge {
  if (!row) {
    throw new Error(`Storefront verification ${operation} did not return a challenge row`)
  }

  return row
}

async function getLatestChallenge(
  db: PostgresJsDatabase,
  channel: PublicApiVerificationChannel,
  destination: string,
  purpose: string,
) {
  const [row] = await db
    .select()
    .from(customerVerificationChallenges)
    .where(
      and(
        eq(customerVerificationChallenges.channel, channel),
        eq(customerVerificationChallenges.destination, destination),
        eq(customerVerificationChallenges.purpose, purpose),
      ),
    )
    .orderBy(
      desc(customerVerificationChallenges.updatedAt),
      desc(customerVerificationChallenges.createdAt),
    )
    .limit(1)

  return row ?? null
}

async function startChallenge(
  db: PostgresJsDatabase,
  channel: PublicApiVerificationChannel,
  destination: string,
  purpose: string,
  metadata: Record<string, unknown> | null | undefined,
  subjectRef: string | null | undefined,
  options?: PublicApiVerificationServiceOptions,
) {
  const now = options?.now?.() ?? new Date()
  const codeLength = Math.max(4, Math.min(8, options?.codeLength ?? 6))
  const maxAttempts = Math.max(1, options?.maxAttempts ?? 5)
  const expiresInSeconds = Math.max(60, options?.expiresInSeconds ?? 600)
  const expiresAt = new Date(now.getTime() + expiresInSeconds * 1000)
  const code = generateVerificationCode(codeLength)
  const codeHash = await hashVerificationCode(code)
  const existing = await getLatestChallenge(db, channel, destination, purpose)

  if (existing && existing.status === "pending" && existing.expiresAt > now) {
    const [updated] = await db
      .update(customerVerificationChallenges)
      .set({
        codeHash,
        attemptCount: 0,
        maxAttempts,
        expiresAt,
        lastSentAt: now,
        failedAt: null,
        verifiedAt: null,
        metadata: metadata ?? null,
        subjectRef: subjectRef ?? null,
        updatedAt: now,
      })
      .where(eq(customerVerificationChallenges.id, existing.id))
      .returning()

    return { challenge: requireChallengeRow(updated, "update"), code }
  }

  if (existing && existing.status === "pending" && existing.expiresAt <= now) {
    await db
      .update(customerVerificationChallenges)
      .set({
        status: "expired",
        failedAt: now,
        updatedAt: now,
      })
      .where(eq(customerVerificationChallenges.id, existing.id))
  }

  const [created] = await db
    .insert(customerVerificationChallenges)
    .values({
      channel,
      destination,
      purpose,
      codeHash,
      status: "pending",
      attemptCount: 0,
      maxAttempts,
      expiresAt,
      lastSentAt: now,
      metadata: metadata ?? null,
      subjectRef: subjectRef ?? null,
      createdAt: now,
      updatedAt: now,
    })
    .returning()

  return { challenge: requireChallengeRow(created, "insert"), code }
}

async function confirmChallenge(
  db: PostgresJsDatabase,
  channel: PublicApiVerificationChannel,
  destination: string,
  purpose: string,
  code: string,
  options?: PublicApiVerificationServiceOptions,
) {
  const now = options?.now?.() ?? new Date()
  const row = await getLatestChallenge(db, channel, destination, purpose)

  if (!row || row.status !== "pending") {
    throw new PublicApiVerificationError("Verification challenge not found", "challenge_not_found")
  }

  if (row.expiresAt <= now) {
    await db
      .update(customerVerificationChallenges)
      .set({
        status: "expired",
        failedAt: now,
        updatedAt: now,
      })
      .where(eq(customerVerificationChallenges.id, row.id))

    throw new PublicApiVerificationError("Verification challenge expired", "challenge_expired")
  }

  if (row.codeHash !== (await hashVerificationCode(code))) {
    const nextAttemptCount = row.attemptCount + 1
    const terminal = nextAttemptCount >= row.maxAttempts

    await db
      .update(customerVerificationChallenges)
      .set({
        attemptCount: nextAttemptCount,
        status: terminal ? "failed" : row.status,
        failedAt: terminal ? now : row.failedAt,
        updatedAt: now,
      })
      .where(eq(customerVerificationChallenges.id, row.id))

    throw new PublicApiVerificationError(
      terminal ? "Verification challenge failed" : "Invalid verification code",
      terminal ? "challenge_failed" : "challenge_invalid",
    )
  }

  const [verified] = await db
    .update(customerVerificationChallenges)
    .set({
      status: "verified",
      verifiedAt: now,
      updatedAt: now,
    })
    .where(eq(customerVerificationChallenges.id, row.id))
    .returning()

  return requireChallengeRow(verified, "confirm")
}

/**
 * Name what a deployment *can* deliver on, not just what it cannot.
 *
 * A bare "no provider for sms" tells an operator nothing they can act on and
 * tells a storefront nothing it can fall back to (voyant#3948). Listing the
 * covered channels does both: the operator sees the provider set was resolved
 * and only misses this channel, and a storefront that collected a phone number
 * learns email is still a usable route to a verified contact. The channel names
 * are not sensitive — a storefront has to know them to offer them.
 */
function unconfiguredChannelMessage(
  payload: PublicApiVerificationNotificationPayload,
  coveredChannels: ReadonlyArray<PublicApiVerificationNotificationChannel>,
): string {
  if (payload.provider) {
    return `No verification notification provider named "${payload.provider}" is registered`
  }
  if (coveredChannels.length === 0) {
    return `No verification notification provider is registered, so no channel can deliver a challenge. Configure a provider that declares the "${payload.channel}" channel.`
  }
  return `No verification notification provider registered for channel "${payload.channel}". Registered providers cover: ${[...coveredChannels].sort().join(", ")}.`
}

export function createPublicApiVerificationSendersFromProviders(
  providers: ReadonlyArray<PublicApiVerificationNotificationProvider>,
  options: PublicApiVerificationProviderOptions = {},
): PublicApiVerificationSenders {
  const byChannel = new Map<
    PublicApiVerificationNotificationChannel,
    PublicApiVerificationNotificationProvider
  >()
  const byName = new Map<string, PublicApiVerificationNotificationProvider>()

  for (const provider of providers) {
    byName.set(provider.name, provider)
    for (const channel of provider.channels) {
      byChannel.set(channel, provider)
    }
  }

  async function send(payload: PublicApiVerificationNotificationPayload) {
    const provider = payload.provider
      ? byName.get(payload.provider)
      : byChannel.get(payload.channel)
    if (!provider) {
      throw new PublicApiVerificationError(
        unconfiguredChannelMessage(payload, [...byChannel.keys()]),
        "sender_not_configured",
      )
    }

    return provider.send(payload)
  }

  return {
    async sendEmailChallenge(input) {
      const subject =
        typeof options.email?.subject === "function"
          ? options.email.subject(input)
          : options.email?.subject

      const result = await send({
        to: input.email,
        channel: "email",
        provider: options.email?.provider,
        template: options.email?.template ?? "storefront-verification-email",
        subject,
        data: {
          code: input.code,
          purpose: input.purpose,
          locale: input.locale ?? null,
          expiresAt: input.expiresAt.toISOString(),
          metadata: input.metadata ?? null,
        },
      })

      return { id: result.id, provider: result.provider }
    },
    async sendSmsChallenge(input) {
      const result = await send({
        to: input.phone,
        channel: "sms",
        provider: options.sms?.provider,
        template: options.sms?.template ?? "storefront-verification-sms",
        data: {
          code: input.code,
          purpose: input.purpose,
          locale: input.locale ?? null,
          expiresAt: input.expiresAt.toISOString(),
          metadata: input.metadata ?? null,
        },
        text: `${input.code} is your verification code.`,
      })

      return { id: result.id, provider: result.provider }
    },
  }
}

export function createPublicApiVerificationService(options?: PublicApiVerificationServiceOptions) {
  return {
    async startEmailChallenge(
      db: PostgresJsDatabase,
      input: StartEmailVerificationChallengeInput,
      senders: PublicApiVerificationSenders,
    ) {
      const email = normalizeEmail(input.email)
      const { challenge, code } = await startChallenge(
        db,
        "email",
        email,
        input.purpose,
        input.metadata,
        input.subjectRef,
        options,
      )

      if (!senders.sendEmailChallenge) {
        throw new PublicApiVerificationError(
          "Email verification sender not configured",
          "sender_not_configured",
        )
      }

      try {
        await senders.sendEmailChallenge({
          email,
          code,
          purpose: input.purpose,
          locale: input.locale ?? null,
          expiresAt: challenge.expiresAt,
          metadata: input.metadata,
        })
      } catch (error) {
        const now = options?.now?.() ?? new Date()
        await db
          .update(customerVerificationChallenges)
          .set({
            status: "failed",
            failedAt: now,
            updatedAt: now,
          })
          .where(eq(customerVerificationChallenges.id, challenge.id))
        throw error
      }

      return toChallengeRecord(challenge)
    },

    async startSmsChallenge(
      db: PostgresJsDatabase,
      input: StartSmsVerificationChallengeInput,
      senders: PublicApiVerificationSenders,
    ) {
      const phone = normalizePhone(input.phone)
      const { challenge, code } = await startChallenge(
        db,
        "sms",
        phone,
        input.purpose,
        input.metadata,
        input.subjectRef,
        options,
      )

      if (!senders.sendSmsChallenge) {
        throw new PublicApiVerificationError(
          "SMS verification sender not configured",
          "sender_not_configured",
        )
      }

      try {
        await senders.sendSmsChallenge({
          phone,
          code,
          purpose: input.purpose,
          locale: input.locale ?? null,
          expiresAt: challenge.expiresAt,
          metadata: input.metadata,
        })
      } catch (error) {
        const now = options?.now?.() ?? new Date()
        await db
          .update(customerVerificationChallenges)
          .set({
            status: "failed",
            failedAt: now,
            updatedAt: now,
          })
          .where(eq(customerVerificationChallenges.id, challenge.id))
        throw error
      }

      return toChallengeRecord(challenge)
    },

    async confirmEmailChallenge(
      db: PostgresJsDatabase,
      input: ConfirmEmailVerificationChallengeInput,
    ) {
      const verified = await confirmChallenge(
        db,
        "email",
        normalizeEmail(input.email),
        input.purpose,
        input.code,
        options,
      )
      return toChallengeRecord(verified)
    },

    async confirmSmsChallenge(db: PostgresJsDatabase, input: ConfirmSmsVerificationChallengeInput) {
      const verified = await confirmChallenge(
        db,
        "sms",
        normalizePhone(input.phone),
        input.purpose,
        input.code,
        options,
      )
      return toChallengeRecord(verified)
    },
  }
}
