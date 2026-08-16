import { identifiedUserId } from "@voyant-travel/core"
import type { AnyDrizzleDb } from "@voyant-travel/db"
import { randomBytesHex, sha256Hex } from "@voyant-travel/hono"
import { eq } from "drizzle-orm"
import { z } from "zod"

import {
  type NewTripEnvelope,
  type TripPublicAccess,
  tripEnvelopes,
  tripPublicAccess,
} from "./schema.js"
import { getTrip } from "./service-trips.js"
import type { Trip } from "./service-types.js"

export const PUBLIC_API_TRIP_CAPABILITY_HEADER = "Voyant-Trip-Capability"
export const PUBLIC_API_TRIP_CAPABILITY_TTL_MS = 30 * 24 * 60 * 60 * 1000

const capabilitySchema = z.string().regex(/^tcap_[a-f0-9]{64}$/)

/** Preferences after the managed storefront runtime validates operator config. */
export const publicApiTripScopeSchema = z
  .object({
    marketId: z.string().min(1).max(255),
    locale: z.string().min(1).max(64),
    currency: z.string().regex(/^[A-Z]{3}$/),
  })
  .strict()

export type PublicApiTripScope = z.infer<typeof publicApiTripScopeSchema>

/**
 * Request identity derived by auth. None of these fields are browser input.
 *
 * Scoped by channel alone since voyant#4624 retired the storefront entity. The
 * channel every public surface resolves to — implicitly Direct — is what a
 * capability is checked against.
 */
export interface PublicApiTripContext {
  channelId: string
  userId?: string | null
  buyerAccountId?: string | null
}

export interface CreatePublicApiTripInput {
  title?: string
  description?: string
  scope: PublicApiTripScope
}

/** Internal handle; a public facade must expose only capability/revision/scope. */
export interface PublicApiTripHandle {
  capability: string
  revision: number
  scope: PublicApiTripScope
  trip: Trip
}

export type PublicApiTripAccessResolution =
  | { ok: true; access: TripPublicAccess; trip: Trip }
  | { ok: false; reason: "invalid" | "expired" | "wrong_channel" | "wrong_owner" | "missing" }

export interface PublicApiTripAccessOptions {
  now?: () => Date
  createCapability?: () => string
  ttlMs?: number
}

/** Creates a portable 256-bit capability. Only its digest is persisted. */
export function createPublicApiTripCapability(): string {
  return `tcap_${randomBytesHex(32)}`
}

/**
 * Create an empty customer itinerary and its capability in one transaction.
 * Traveler and billing data are deliberately collected later, before quote or
 * commitment; the existing full Trip creator remains strict for staff flows.
 */
export async function createPublicApiTrip(
  db: AnyDrizzleDb,
  input: CreatePublicApiTripInput,
  context: PublicApiTripContext,
  options: PublicApiTripAccessOptions = {},
): Promise<PublicApiTripHandle> {
  return db.transaction((tx) =>
    createPublicApiTripInTransaction(tx as unknown as AnyDrizzleDb, input, context, options),
  )
}

/** Package-internal transaction primitive used by the Storefront selection provider. */
export async function createPublicApiTripInTransaction(
  db: AnyDrizzleDb,
  input: CreatePublicApiTripInput,
  context: PublicApiTripContext,
  options: PublicApiTripAccessOptions = {},
): Promise<PublicApiTripHandle> {
  const scope = publicApiTripScopeSchema.parse(input.scope)
  assertActivePublicApiContext(context)
  const capability = (options.createCapability ?? createPublicApiTripCapability)()
  capabilitySchema.parse(capability)
  const capabilityDigest = await sha256Hex(capability)
  const now = options.now?.() ?? new Date()
  const expiresAt = new Date(now.getTime() + (options.ttlMs ?? PUBLIC_API_TRIP_CAPABILITY_TTL_MS))

  const actor = publicApiActor(context)
  const values: NewTripEnvelope = {
    title: input.title,
    description: input.description,
    travelerParty: {},
    constraints: { publicApiScope: scope },
    createdBy: actor,
    updatedBy: actor,
  }
  const [envelope] = await db.insert(tripEnvelopes).values(values).returning()
  if (!envelope) throw new Error("createPublicApiTrip: insert returned no envelope")

  const [access] = await db
    .insert(tripPublicAccess)
    .values({
      envelopeId: envelope.id,
      capabilityDigest,
      channelId: context.channelId,
      marketId: scope.marketId,
      locale: scope.locale,
      currency: scope.currency,
      ownerUserId: authenticatedUserId(context),
      ownerBuyerAccountId: context.buyerAccountId ?? null,
      expiresAt,
      createdAt: now,
      updatedAt: now,
    })
    .returning()
  if (!access) throw new Error("createPublicApiTrip: access insert returned no row")

  return {
    capability,
    revision: access.revision,
    scope,
    trip: { envelope, components: [] },
  }
}

/** Resolve an opaque capability without ever accepting an envelope id. */
export async function resolvePublicApiTripAccess(
  db: AnyDrizzleDb,
  capability: string,
  context: PublicApiTripContext,
  options: Pick<PublicApiTripAccessOptions, "now"> = {},
): Promise<PublicApiTripAccessResolution> {
  if (!capabilitySchema.safeParse(capability).success) return { ok: false, reason: "invalid" }
  assertActivePublicApiContext(context)
  const capabilityDigest = await sha256Hex(capability)
  const now = options.now?.() ?? new Date()
  const [access] = (await db
    .select()
    .from(tripPublicAccess)
    .where(eq(tripPublicAccess.capabilityDigest, capabilityDigest))
    .limit(1)) as TripPublicAccess[]

  if (!access) return { ok: false, reason: "missing" }
  if (access.expiresAt <= now) return { ok: false, reason: "expired" }
  if (access.channelId !== context.channelId) {
    return { ok: false, reason: "wrong_channel" }
  }
  const userId = authenticatedUserId(context)
  if (access.ownerUserId && access.ownerUserId !== userId) {
    return { ok: false, reason: "wrong_owner" }
  }
  if (access.ownerBuyerAccountId && access.ownerBuyerAccountId !== context.buyerAccountId) {
    return { ok: false, reason: "wrong_owner" }
  }

  const trip = await getTrip(db, access.envelopeId)
  if (!trip) return { ok: false, reason: "missing" }
  return { ok: true, access, trip }
}

function authenticatedUserId(context: PublicApiTripContext): string | null {
  return identifiedUserId(context.userId)
}

/**
 * Audit actor persisted on the envelope. Write-only provenance — nothing reads
 * it back apart, so rows written before voyant#4624 keep their `storefront:`
 * prefix and are still legible next to the `channel:` ones written after.
 */
function publicApiActor(context: PublicApiTripContext): string {
  const userId = authenticatedUserId(context)
  return userId
    ? `channel:${context.channelId}:customer:${userId}`
    : `channel:${context.channelId}:anonymous`
}

function assertActivePublicApiContext(context: PublicApiTripContext): void {
  if (!context.channelId.trim()) {
    throw new Error("active_channel_required")
  }
}
