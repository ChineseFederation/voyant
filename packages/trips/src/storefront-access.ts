import type { AnyDrizzleDb } from "@voyant-travel/db"
import { randomBytesHex, sha256Hex } from "@voyant-travel/hono"
import { eq } from "drizzle-orm"
import { z } from "zod"

import {
  type NewTripEnvelope,
  type TripStorefrontAccess,
  tripEnvelopes,
  tripStorefrontAccess,
} from "./schema.js"
import { getTrip } from "./service-trips.js"
import type { Trip } from "./service-types.js"

export const STOREFRONT_TRIP_CAPABILITY_HEADER = "Voyant-Trip-Capability"
export const STOREFRONT_TRIP_CAPABILITY_TTL_MS = 30 * 24 * 60 * 60 * 1000

const capabilitySchema = z.string().regex(/^tcap_[a-f0-9]{64}$/)

/** Preferences after the managed storefront runtime validates operator config. */
export const storefrontTripScopeSchema = z
  .object({
    marketId: z.string().min(1).max(255),
    locale: z.string().min(1).max(64),
    currency: z.string().regex(/^[A-Z]{3}$/),
  })
  .strict()

export type StorefrontTripScope = z.infer<typeof storefrontTripScopeSchema>

/** Request identity derived by auth. None of these fields are browser input. */
export interface StorefrontTripContext {
  storefrontId: string
  channelId: string
  userId?: string | null
  buyerAccountId?: string | null
}

export interface CreateStorefrontTripInput {
  title?: string
  description?: string
  scope: StorefrontTripScope
}

/** Internal handle; a public facade must expose only capability/revision/scope. */
export interface StorefrontTripHandle {
  capability: string
  revision: number
  scope: StorefrontTripScope
  trip: Trip
}

export type StorefrontTripAccessResolution =
  | { ok: true; access: TripStorefrontAccess; trip: Trip }
  | { ok: false; reason: "invalid" | "expired" | "wrong_storefront" | "wrong_owner" | "missing" }

export interface StorefrontTripAccessOptions {
  now?: () => Date
  createCapability?: () => string
  ttlMs?: number
}

/** Creates a portable 256-bit capability. Only its digest is persisted. */
export function createStorefrontTripCapability(): string {
  return `tcap_${randomBytesHex(32)}`
}

/**
 * Create an empty customer itinerary and its capability in one transaction.
 * Traveler and billing data are deliberately collected later, before quote or
 * commitment; the existing full Trip creator remains strict for staff flows.
 */
export async function createStorefrontTrip(
  db: AnyDrizzleDb,
  input: CreateStorefrontTripInput,
  context: StorefrontTripContext,
  options: StorefrontTripAccessOptions = {},
): Promise<StorefrontTripHandle> {
  const scope = storefrontTripScopeSchema.parse(input.scope)
  assertActiveStorefrontContext(context)
  const capability = (options.createCapability ?? createStorefrontTripCapability)()
  capabilitySchema.parse(capability)
  const capabilityDigest = await sha256Hex(capability)
  const now = options.now?.() ?? new Date()
  const expiresAt = new Date(now.getTime() + (options.ttlMs ?? STOREFRONT_TRIP_CAPABILITY_TTL_MS))

  return db.transaction(async (tx) => {
    const actor = storefrontActor(context)
    const values: NewTripEnvelope = {
      title: input.title,
      description: input.description,
      travelerParty: {},
      constraints: { storefrontScope: scope },
      createdBy: actor,
      updatedBy: actor,
    }
    const [envelope] = await tx.insert(tripEnvelopes).values(values).returning()
    if (!envelope) throw new Error("createStorefrontTrip: insert returned no envelope")

    const [access] = await tx
      .insert(tripStorefrontAccess)
      .values({
        envelopeId: envelope.id,
        capabilityDigest,
        storefrontId: context.storefrontId,
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
    if (!access) throw new Error("createStorefrontTrip: access insert returned no row")

    return {
      capability,
      revision: access.revision,
      scope,
      trip: { envelope, components: [] },
    }
  })
}

/** Resolve an opaque capability without ever accepting an envelope id. */
export async function resolveStorefrontTripAccess(
  db: AnyDrizzleDb,
  capability: string,
  context: StorefrontTripContext,
  options: Pick<StorefrontTripAccessOptions, "now"> = {},
): Promise<StorefrontTripAccessResolution> {
  if (!capabilitySchema.safeParse(capability).success) return { ok: false, reason: "invalid" }
  assertActiveStorefrontContext(context)
  const capabilityDigest = await sha256Hex(capability)
  const now = options.now?.() ?? new Date()
  const [access] = (await db
    .select()
    .from(tripStorefrontAccess)
    .where(eq(tripStorefrontAccess.capabilityDigest, capabilityDigest))
    .limit(1)) as TripStorefrontAccess[]

  if (!access) return { ok: false, reason: "missing" }
  if (access.expiresAt <= now) return { ok: false, reason: "expired" }
  if (access.storefrontId !== context.storefrontId || access.channelId !== context.channelId) {
    return { ok: false, reason: "wrong_storefront" }
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

function authenticatedUserId(context: StorefrontTripContext): string | null {
  const userId = context.userId?.trim()
  return !userId || userId === "anonymous-storefront" ? null : userId
}

function storefrontActor(context: StorefrontTripContext): string {
  const userId = authenticatedUserId(context)
  return userId
    ? `storefront:${context.storefrontId}:customer:${userId}`
    : `storefront:${context.storefrontId}:anonymous`
}

function assertActiveStorefrontContext(context: StorefrontTripContext): void {
  if (!context.storefrontId.trim() || !context.channelId.trim()) {
    throw new Error("active_storefront_channel_required")
  }
}
