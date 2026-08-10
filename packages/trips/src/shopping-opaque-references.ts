import type { AnyDrizzleDb } from "@voyant-travel/db"
import { randomBytesHex, sha256Hex } from "@voyant-travel/hono"
import type {
  StorefrontOpaqueReferenceIssuer,
  StorefrontShoppingContext,
} from "@voyant-travel/storefront/shopping"
import { and, eq, gt, isNull, sql } from "drizzle-orm"
import { z } from "zod"

import type { TripShoppingReference } from "./schema.js"
import { tripShoppingReferences } from "./schema.js"
import type {
  StorefrontTripOfferComponent,
  StorefrontTripOfferResolver,
} from "./storefront-trip-offer-resolver-port.js"
import { tripComponentPricingSnapshotSchema } from "./validation.js"

const MAX_REFERENCE_TTL_SECONDS = 24 * 60 * 60
const referenceSchema = z.string().regex(/^sref_[a-f0-9]{64}$/)
const purposeSchema = z.enum([
  "catalog-item",
  "flight-offer",
  "stay-offer",
  "package-offer",
  "live-continuation",
  "cruise-offer",
])
const replaySchema = z.enum(["multi-use", "single-use"])
const scopeSchema = z
  .object({
    marketId: z.string().min(1).max(128),
    locale: z.string().min(1).max(64),
    currency: z.string().regex(/^[A-Z]{3}$/),
  })
  .strict()
const payloadSchema = z.record(z.string(), z.unknown())
const packageSelectionSchema = z
  .object({
    target: z
      .object({
        entityModule: z.literal("products"),
        entityId: z.string().min(1),
        sourceKind: z.string().min(1),
        sourceConnectionId: z.string().min(1),
        sourceRef: z.string().min(1),
      })
      .strict(),
    configure: z
      .object({
        departureDate: z.iso.date(),
        departureAirportCode: z.string().regex(/^[A-Z]{3}$/),
        nights: z.number().int().positive(),
        pax: z.record(z.string(), z.number().int().nonnegative()),
        roomTypeId: z.string().min(1).optional(),
        ratePlanId: z.string().min(1).optional(),
        board: z.string().min(1).optional(),
      })
      .strict()
      .refine(
        (value) => Boolean(value.roomTypeId || value.ratePlanId || value.board),
        "package rate pin required",
      )
      .refine((value) => (value.pax.adult ?? 0) > 0, "package adult pax required"),
    offerExpiresAt: z.string().datetime({ offset: true }),
  })
  .strict()

const staySelectionSchema = z
  .object({
    target: z
      .object({
        entityModule: z.literal("accommodations"),
        entityId: z.string().min(1),
        sourceKind: z.string().min(1),
        sourceConnectionId: z.string().min(1).optional(),
        sourceRef: z.string().min(1).optional(),
      })
      .strict()
      .superRefine((target, ctx) => {
        if (target.sourceKind !== "owned" && (!target.sourceConnectionId || !target.sourceRef)) {
          ctx.addIssue({ code: "custom", message: "sourced stay identity required" })
        }
      }),
    configure: z
      .object({
        dateRange: z.object({ checkIn: z.iso.date(), checkOut: z.iso.date() }).strict(),
        pax: z.record(z.string(), z.number().int().nonnegative()),
        roomTypeId: z.string().min(1).optional(),
        ratePlanId: z.string().min(1).optional(),
      })
      .strict(),
    rooms: z
      .array(
        z
          .object({
            roomTypeId: z.string().min(1),
            ratePlanId: z.string().min(1),
            occupancy: z
              .object({
                adults: z.number().int().positive(),
                children: z.number().int().nonnegative().optional(),
                childrenAges: z.array(z.number().int().nonnegative()).optional(),
                infants: z.number().int().nonnegative().optional(),
              })
              .strict()
              .optional(),
          })
          .strict(),
      )
      .min(1),
  })
  .strict()

const cruiseSelectionSchema = z
  .object({
    target: z
      .object({
        entityModule: z.literal("cruises"),
        entityId: z.string().min(1),
        sourceKind: z.string().min(1),
        sourceConnectionId: z.string().min(1),
        sourceRef: z.string().min(1),
      })
      .strict(),
    configure: z
      .object({
        sailingId: z.string().min(1),
        cabinCategoryId: z.string().min(1),
        occupancy: z.number().int().positive(),
        passengerComposition: z
          .object({
            adults: z.number().int().nonnegative(),
            children: z.number().int().nonnegative().optional(),
            childAges: z.array(z.number().int().nonnegative()).optional(),
            infants: z.number().int().nonnegative().optional(),
            seniors: z.number().int().nonnegative().optional(),
          })
          .strict(),
        fareCode: z.string().min(1).nullable(),
        fareVariant: z.enum(["cruise_only", "air_inclusive"]),
        bookingTerms: z.record(z.string(), z.unknown()).nullable(),
      })
      .strict(),
  })
  .strict()

export type ShoppingReferencePurpose = z.infer<typeof purposeSchema>

export type ShoppingReferenceResolution =
  | { ok: true; reference: TripShoppingReference }
  | { ok: false; reason: "invalid" | "unavailable" }

export interface TripShoppingReferenceRuntimeOptions {
  withTransaction<T>(operation: (db: AnyDrizzleDb) => Promise<T>): Promise<T>
  now?: () => Date
  createReference?: () => string
}

export interface ShoppingReferenceBoundary {
  referenceDigest: string
  purpose: ShoppingReferencePurpose
  storefrontId: string
  channelId: string
  ownerUserId: string | null
  ownerBuyerAccountId: string | null
  marketId: string
  locale: string
  currency: string
  liveKind?: "flight" | "stay" | "package"
  intentFingerprint?: string
  now: Date
}

/** Narrow persistence contract; claimSingle must be an atomic compare-and-set. */
export interface TripShoppingReferenceStore {
  insert(reference: TripShoppingReference): Promise<void>
  claimSingle(boundary: ShoppingReferenceBoundary): Promise<TripShoppingReference | null>
  readMulti(boundary: ShoppingReferenceBoundary): Promise<TripShoppingReference | null>
}

export interface TripShoppingReferenceRuntime {
  issuer: StorefrontOpaqueReferenceIssuer
  offerResolver: StorefrontTripOfferResolver
}

/**
 * Durable Storefront issuer plus Trips redemption adapter. The adapter returns
 * only a Trips component; it never returns the stored row or provider payload
 * through a public Storefront result.
 */
export function createTripShoppingReferenceRuntime(
  options: TripShoppingReferenceRuntimeOptions,
): TripShoppingReferenceRuntime {
  const now = options.now ?? (() => new Date())

  return {
    issuer: {
      issue: (input) =>
        options.withTransaction((db) =>
          issueShoppingReference(postgresShoppingReferenceStore(db), input, {
            now,
            ...(options.createReference ? { createReference: options.createReference } : {}),
          }),
        ),
      redeem: (input) =>
        options.withTransaction((db) =>
          redeemContinuation(postgresShoppingReferenceStore(db), input, now),
        ),
    },
    offerResolver: {
      async resolve(context, input) {
        return options.withTransaction((db) =>
          resolveShoppingReference(postgresShoppingReferenceStore(db), context, input, now),
        )
      },
      async resolveInTransaction(db, context, input) {
        return resolveShoppingReference(postgresShoppingReferenceStore(db), context, input, now)
      },
    },
  }
}

/** Store-injected variant used by alternative durable adapters and concurrency tests. */
export function createTripShoppingReferenceRuntimeWithStore(
  store: TripShoppingReferenceStore,
  options: Omit<TripShoppingReferenceRuntimeOptions, "withTransaction"> = {},
): TripShoppingReferenceRuntime {
  const now = options.now ?? (() => new Date())
  return {
    issuer: {
      issue: (input) =>
        issueShoppingReference(store, input, {
          now,
          ...(options.createReference ? { createReference: options.createReference } : {}),
        }),
      redeem: (input) => redeemContinuation(store, input, now),
    },
    offerResolver: {
      async resolve(context, input) {
        return resolveShoppingReference(store, context, input, now)
      },
    },
  }
}

async function redeemContinuation(
  store: TripShoppingReferenceStore,
  input: Parameters<StorefrontOpaqueReferenceIssuer["redeem"]>[0],
  now: () => Date,
): Promise<{ payload: Readonly<Record<string, unknown>> } | null> {
  const resolution = await redeemShoppingReference(store, input.ref, {
    purpose: "live-continuation",
    context: {
      storefrontId: input.storefrontId,
      channelId: input.channelId,
      userId: input.owner.userId,
      buyerAccountId: input.owner.buyerAccountId,
    },
    scope: input.scope,
    continuationBinding: {
      kind: input.kind,
      intentFingerprint: input.intentFingerprint,
    },
    now,
  })
  if (!resolution.ok) return null
  try {
    return { payload: payloadSchema.parse(resolution.reference.payload) }
  } catch {
    return null
  }
}

/** Creates a 256-bit capability and persists only its SHA-256 digest. */
export async function issueTripShoppingReference(
  db: AnyDrizzleDb,
  rawInput: Parameters<StorefrontOpaqueReferenceIssuer["issue"]>[0],
  options: { now?: () => Date; createReference?: () => string } = {},
): Promise<{ ref: string; expiresAt: string }> {
  return issueShoppingReference(postgresShoppingReferenceStore(db), rawInput, options)
}

async function issueShoppingReference(
  store: TripShoppingReferenceStore,
  rawInput: Parameters<StorefrontOpaqueReferenceIssuer["issue"]>[0],
  options: { now?: () => Date; createReference?: () => string } = {},
): Promise<{ ref: string; expiresAt: string }> {
  const purpose = purposeSchema.parse(rawInput.purpose)
  const replay = replaySchema.parse(rawInput.replay)
  const scope = scopeSchema.parse(rawInput.scope)
  const payload = payloadSchema.parse(rawInput.payload)
  const ttlSeconds = z
    .number()
    .int()
    .min(1)
    .max(MAX_REFERENCE_TTL_SECONDS)
    .parse(rawInput.ttlSeconds)
  const storefrontId = requiredBinding(rawInput.storefrontId)
  const channelId = requiredBinding(rawInput.channelId)
  const ownerUserId = managedUserId(rawInput.owner.userId)
  const ownerBuyerAccountId = optionalBinding(rawInput.owner.buyerAccountId)
  const ref = referenceSchema.parse(
    (options.createReference ?? (() => `sref_${randomBytesHex(32)}`))(),
  )
  const referenceDigest = await sha256Hex(ref)
  const createdAt = options.now?.() ?? new Date()
  const expiresAt = new Date(createdAt.getTime() + ttlSeconds * 1000)

  try {
    await store.insert({
      referenceDigest,
      purpose,
      storefrontId,
      channelId,
      ownerUserId,
      ownerBuyerAccountId,
      marketId: scope.marketId,
      locale: scope.locale,
      currency: scope.currency,
      replay,
      payload,
      expiresAt,
      consumedAt: null,
      createdAt,
    })
  } catch {
    // Do not let a driver error carrying bound JSON parameters reach request
    // logging or a public error serializer.
    throw new Error("shopping_reference_issue_failed")
  }

  return { ref, expiresAt: expiresAt.toISOString() }
}

/**
 * Redeems against the complete trust boundary. Single-use rows are claimed by
 * one conditional UPDATE, so concurrent callers cannot both receive payload.
 */
export async function redeemTripShoppingReference(
  db: AnyDrizzleDb,
  rawReference: string,
  input: {
    purpose: ShoppingReferencePurpose
    context: StorefrontShoppingContext
    scope: { marketId: string; locale: string; currency: string }
    continuationBinding?: {
      kind: "flight" | "stay" | "package"
      intentFingerprint: string
    }
    now?: () => Date
  },
): Promise<ShoppingReferenceResolution> {
  return redeemShoppingReference(postgresShoppingReferenceStore(db), rawReference, input)
}

async function redeemShoppingReference(
  store: TripShoppingReferenceStore,
  rawReference: string,
  input: {
    purpose: ShoppingReferencePurpose
    context: StorefrontShoppingContext
    scope: { marketId: string; locale: string; currency: string }
    continuationBinding?: {
      kind: "flight" | "stay" | "package"
      intentFingerprint: string
    }
    now?: () => Date
  },
): Promise<ShoppingReferenceResolution> {
  if (!referenceSchema.safeParse(rawReference).success) return { ok: false, reason: "invalid" }
  const purpose = purposeSchema.parse(input.purpose)
  const scope = scopeSchema.parse(input.scope)
  const storefrontId = requiredBinding(input.context.storefrontId)
  const channelId = requiredBinding(input.context.channelId)
  const ownerUserId = managedUserId(input.context.userId)
  const ownerBuyerAccountId = optionalBinding(input.context.buyerAccountId)
  const referenceDigest = await sha256Hex(rawReference)
  const now = input.now?.() ?? new Date()
  const boundary: ShoppingReferenceBoundary = {
    referenceDigest,
    purpose,
    storefrontId,
    channelId,
    ownerUserId,
    ownerBuyerAccountId,
    marketId: scope.marketId,
    locale: scope.locale,
    currency: scope.currency,
    ...(input.continuationBinding
      ? {
          liveKind: input.continuationBinding.kind,
          intentFingerprint: input.continuationBinding.intentFingerprint,
        }
      : {}),
    now,
  }

  const singleUse = await store.claimSingle(boundary)
  if (singleUse) return { ok: true, reference: singleUse }
  const multiUse = await store.readMulti(boundary)
  return multiUse ? { ok: true, reference: multiUse } : { ok: false, reason: "unavailable" }
}

function postgresShoppingReferenceStore(db: AnyDrizzleDb): TripShoppingReferenceStore {
  const whereBoundary = (boundary: ShoppingReferenceBoundary) =>
    and(
      eq(tripShoppingReferences.referenceDigest, boundary.referenceDigest),
      eq(tripShoppingReferences.purpose, boundary.purpose),
      eq(tripShoppingReferences.storefrontId, boundary.storefrontId),
      eq(tripShoppingReferences.channelId, boundary.channelId),
      boundary.ownerUserId === null
        ? isNull(tripShoppingReferences.ownerUserId)
        : eq(tripShoppingReferences.ownerUserId, boundary.ownerUserId),
      boundary.ownerBuyerAccountId === null
        ? isNull(tripShoppingReferences.ownerBuyerAccountId)
        : eq(tripShoppingReferences.ownerBuyerAccountId, boundary.ownerBuyerAccountId),
      eq(tripShoppingReferences.marketId, boundary.marketId),
      eq(tripShoppingReferences.locale, boundary.locale),
      eq(tripShoppingReferences.currency, boundary.currency),
      boundary.liveKind
        ? sql`${tripShoppingReferences.payload}->>'kind' = ${boundary.liveKind}`
        : undefined,
      boundary.intentFingerprint
        ? sql`${tripShoppingReferences.payload}->>'intentFingerprint' = ${boundary.intentFingerprint}`
        : undefined,
      gt(tripShoppingReferences.expiresAt, boundary.now),
    )

  return {
    async insert(reference) {
      await db.insert(tripShoppingReferences).values(reference)
    },
    async claimSingle(boundary) {
      const [claimed] = (await db
        .update(tripShoppingReferences)
        .set({ consumedAt: boundary.now })
        .where(
          and(
            whereBoundary(boundary),
            eq(tripShoppingReferences.replay, "single-use"),
            isNull(tripShoppingReferences.consumedAt),
          ),
        )
        .returning()) as TripShoppingReference[]
      return claimed ?? null
    },
    async readMulti(boundary) {
      const [reference] = (await db
        .select()
        .from(tripShoppingReferences)
        .where(
          and(
            whereBoundary(boundary),
            eq(tripShoppingReferences.replay, "multi-use"),
            isNull(tripShoppingReferences.consumedAt),
          ),
        )
        .limit(1)) as TripShoppingReference[]
      return reference ?? null
    },
  }
}

async function resolveShoppingReference(
  store: TripShoppingReferenceStore,
  context: StorefrontShoppingContext,
  input: Parameters<StorefrontTripOfferResolver["resolve"]>[1],
  now: () => Date,
): Promise<{ component: StorefrontTripOfferComponent } | null> {
  const resolvedAt = now()
  const resolution = await redeemShoppingReference(store, input.offerRef, {
    purpose: purposeForSelectionKind(input.kind),
    context,
    scope: input.scope,
    now: () => resolvedAt,
  })
  return resolution.ok ? resolvedComponent(resolution.reference, resolvedAt) : null
}

function componentFromReference(
  reference: TripShoppingReference,
  now: Date,
): StorefrontTripOfferComponent {
  const payload = payloadSchema.parse(reference.payload)
  if (reference.purpose === "catalog-item") {
    const catalog = z
      .object({
        entityModule: z.string().min(1),
        entityId: z.string().min(1),
        estimatedPricing: tripComponentPricingSnapshotSchema.optional(),
      })
      .passthrough()
      .parse(payload)
    return {
      kind: "catalog_booking",
      catalogRef: {
        entityModule: catalog.entityModule,
        entityId: catalog.entityId,
        sourceKind: "owned",
      },
      ...(catalog.estimatedPricing ? { estimatedPricing: catalog.estimatedPricing } : {}),
      metadata: {},
    }
  }

  if (reference.purpose === "package-offer") {
    const payload = z
      .object({
        selection: packageSelectionSchema,
        providerData: z.never().optional(),
        estimatedPricing: tripComponentPricingSnapshotSchema.optional(),
      })
      .strict()
      .parse(reference.payload)
    if (Date.parse(payload.selection.offerExpiresAt) <= now.getTime()) {
      throw new Error("package_offer_expired")
    }
    const { target, configure } = payload.selection
    return {
      kind: "catalog_booking",
      catalogRef: target,
      ...(payload.estimatedPricing ? { estimatedPricing: payload.estimatedPricing } : {}),
      metadata: {
        bookingDraftV1: {
          entity: {
            module: target.entityModule,
            id: target.entityId,
            sourceKind: target.sourceKind,
            sourceConnectionId: target.sourceConnectionId,
            sourceRef: target.sourceRef,
          },
          configure,
        },
      },
    }
  }

  if (reference.purpose === "stay-offer") {
    const payload = z
      .object({
        selection: staySelectionSchema,
        providerData: z.never().optional(),
        estimatedPricing: tripComponentPricingSnapshotSchema.optional(),
      })
      .strict()
      .parse(reference.payload)
    const { target, configure, rooms } = payload.selection
    return {
      kind: "catalog_booking",
      catalogRef: target,
      ...(payload.estimatedPricing ? { estimatedPricing: payload.estimatedPricing } : {}),
      metadata: {
        bookingDraftV1: {
          entity: {
            module: target.entityModule,
            id: target.entityId,
            sourceKind: target.sourceKind,
            sourceConnectionId: target.sourceConnectionId,
            sourceRef: target.sourceRef,
          },
          configure,
          accommodation: {
            rooms: rooms.map(({ roomTypeId, ratePlanId, occupancy }) => ({
              optionUnitId: roomTypeId,
              ratePlanId,
              quantity: 1,
              ...(occupancy ? { occupancy } : {}),
            })),
            travelerAssignments: {},
          },
        },
      },
    }
  }

  if (reference.purpose === "cruise-offer") {
    const payload = z
      .object({
        selection: cruiseSelectionSchema,
        providerData: z.never().optional(),
        estimatedPricing: tripComponentPricingSnapshotSchema.optional(),
      })
      .strict()
      .parse(reference.payload)
    const { target, configure } = payload.selection
    return {
      kind: "catalog_booking",
      catalogRef: target,
      ...(payload.estimatedPricing ? { estimatedPricing: payload.estimatedPricing } : {}),
      metadata: {
        bookingDraftV1: {
          entity: {
            module: target.entityModule,
            id: target.entityId,
            sourceKind: target.sourceKind,
            sourceConnectionId: target.sourceConnectionId,
            sourceRef: target.sourceRef,
          },
          configure,
        },
        storefrontShopping: {
          version: 1,
          purpose: reference.purpose,
          selection: payload.selection,
        },
      },
    }
  }

  const offer = z
    .object({
      selection: z.record(z.string(), z.unknown()),
      providerData: z.record(z.string(), z.unknown()).optional(),
      estimatedPricing: tripComponentPricingSnapshotSchema.optional(),
    })
    .strict()
    .parse(payload)
  const durableSelection = {
    version: 1,
    purpose: reference.purpose,
    selection: offer.selection,
    ...(offer.providerData ? { providerData: offer.providerData } : {}),
  }
  return reference.purpose === "flight-offer"
    ? {
        kind: "flight_placeholder",
        ...(offer.estimatedPricing ? { estimatedPricing: offer.estimatedPricing } : {}),
        metadata: {
          flightDraft: { selectedOffer: offer.selection },
          storefrontShopping: durableSelection,
        },
      }
    : {
        kind: "catalog_booking",
        ...(offer.estimatedPricing ? { estimatedPricing: offer.estimatedPricing } : {}),
        metadata: { storefrontShopping: durableSelection },
      }
}

function resolvedComponent(
  reference: TripShoppingReference,
  now: Date,
): { component: StorefrontTripOfferComponent } | null {
  try {
    return { component: componentFromReference(reference, now) }
  } catch {
    // Persisted provider/source payload is never attached to a thrown parse
    // error that could cross into request logging.
    return null
  }
}

function purposeForSelectionKind(kind: "product" | "flight" | "stay" | "package" | "cruise") {
  const purposes = {
    product: "catalog-item",
    flight: "flight-offer",
    stay: "stay-offer",
    package: "package-offer",
    cruise: "cruise-offer",
  } as const
  return purposes[kind]
}

function requiredBinding(value: string): string {
  const normalized = value.trim()
  if (!normalized) throw new Error("active_storefront_channel_required")
  return normalized
}

function optionalBinding(value: string | null | undefined): string | null {
  const normalized = value?.trim()
  return normalized ? normalized : null
}

function managedUserId(value: string | null | undefined): string | null {
  const normalized = optionalBinding(value)
  return normalized === "anonymous-storefront" ? null : normalized
}
