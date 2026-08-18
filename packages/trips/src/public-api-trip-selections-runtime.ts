import type { CatalogCompositeBookingSessionRuntime } from "@voyant-travel/catalog/composite-booking-session-runtime-port"
import type { AnyDrizzleDb } from "@voyant-travel/db"
import { randomBytesHex, sha256Hex } from "@voyant-travel/hono"
import {
  type PublicApiResolvedScope,
  type PublicApiShoppingContext,
  publicApiResolvedScopeSchema,
} from "@voyant-travel/public-api/shopping"
import { and, eq, isNull } from "drizzle-orm"
import { z } from "zod"
import {
  createPublicApiTripInTransaction,
  type PublicApiTripScope,
  resolvePublicApiTripAccess,
} from "./public-api-access.js"
import type { PublicApiTripOfferResolver } from "./public-api-trip-offer-resolver-port.js"
import type { PublicApiTripSelectionsRuntime } from "./public-api-trip-selections-gateway.js"
import type {
  PublicApiTripBooking,
  PublicApiTripBookingCreate,
  PublicApiTripSelection,
  PublicApiTripSelectionCreate,
  PublicApiTripSelectionUpdate,
} from "./public-api-trip-selections-schemas.js"
import type { TripComponent, TripPublicAccess } from "./schema.js"
import {
  type TripPublicApiBookingOperation,
  tripPublicAccess,
  tripPublicBookingOperations,
} from "./schema.js"
import { freezeTripSnapshot } from "./service-snapshots.js"
import {
  addComponent,
  getTrip,
  removeComponent,
  reorderComponents,
  updateTrip,
} from "./service-trips.js"
import type { Trip } from "./service-types.js"
import { type CreateTripComponentBodyInput, createTripComponentBodySchema } from "./validation.js"

const publicApiSelectionItemMetadataSchema = z
  .object({
    version: z.literal(1),
    itemRef: z.string().regex(/^tsi_[a-f0-9]{64}$/),
    kind: z.enum(["product", "flight", "stay", "package"]),
    quantity: z.number().int().min(1).max(99),
  })
  .strict()

type PublicApiOfferSelection = PublicApiTripSelectionCreate["offers"][number]

export class PublicApiTripSelectionUnavailableError extends Error {
  readonly code = "storefront_trip_selection_unavailable"

  constructor(reason = "offer_resolution_unavailable") {
    super(`Storefront Trip selection is unavailable: ${reason}.`)
    this.name = "PublicApiTripSelectionUnavailableError"
  }
}

export class PublicApiTripSelectionAccessError extends Error {
  readonly code = "storefront_trip_selection_not_found"

  constructor() {
    super("Storefront Trip selection was not found.")
    this.name = "PublicApiTripSelectionAccessError"
  }
}

export class PublicApiTripSelectionConflictError extends Error {
  readonly code = "storefront_trip_selection_revision_conflict"

  constructor(
    readonly expectedRevision: number,
    readonly actualRevision: number,
  ) {
    super(
      `Storefront Trip selection revision conflict: expected ${expectedRevision}, actual ${actualRevision}.`,
    )
    this.name = "PublicApiTripSelectionConflictError"
  }
}

export class PublicApiTripSelectionMutationError extends Error {
  readonly code = "storefront_trip_selection_invalid_mutation"

  constructor(message: string) {
    super(message)
    this.name = "PublicApiTripSelectionMutationError"
  }
}

export class PublicApiTripBookingError extends Error {
  constructor(
    readonly code:
      | "storefront_trip_booking_idempotency_conflict"
      | "storefront_trip_booking_pricing_unavailable"
      | "storefront_trip_booking_session_rejected",
  ) {
    super(code)
    this.name = "PublicApiTripBookingError"
  }
}

export interface PublicApiTripSelectionsRuntimeOptions {
  withTransaction<T>(operation: (db: AnyDrizzleDb) => Promise<T>): Promise<T>
  offerResolver?: PublicApiTripOfferResolver
  now?: () => Date
  createSelectionRef?: () => string
  createItemRef?: () => string
  compositeBookingSessions?:
    | CatalogCompositeBookingSessionRuntime
    | Promise<CatalogCompositeBookingSessionRuntime>
}

/** Trips-owned provider for the Storefront gateway's stateful selection port. */
export function createPublicApiTripSelectionsRuntime(
  options: PublicApiTripSelectionsRuntimeOptions,
): PublicApiTripSelectionsRuntime {
  const createItemRef = options.createItemRef ?? (() => `tsi_${randomBytesHex(32)}`)

  return {
    async create(context, input) {
      return options.withTransaction(async (db) => {
        const offers = await resolveOffers(
          options.offerResolver,
          db,
          context,
          input.scope,
          input.offers,
        )
        const itemRefs = offers.map(() =>
          publicApiSelectionItemMetadataSchema.shape.itemRef.parse(createItemRef()),
        )
        const handle = await createPublicApiTripInTransaction(
          db,
          { scope: coreScope(input.scope) },
          context,
          {
            ...(options.now ? { now: options.now } : {}),
            ...(options.createSelectionRef ? { createCapability: options.createSelectionRef } : {}),
          },
        )
        await updateTrip(db, handle.trip.envelope.id, {
          constraints: {
            publicApiScope: handle.scope,
            publicApiResolvedScope: input.scope,
          },
        })
        const components: TripComponent[] = []
        for (const [sequence, resolved] of offers.entries()) {
          components.push(
            await addComponent(db, {
              ...resolved.component,
              envelopeId: handle.trip.envelope.id,
              sequence,
              metadata: withSelectionMetadata(
                resolved.component.metadata,
                itemRefs[sequence] as string,
                input.offers[sequence] as PublicApiOfferSelection,
              ),
            }),
          )
        }
        return selectionResult(handle.capability, handle.revision, input.scope, components)
      })
    },

    async update(context, input) {
      return options.withTransaction(async (db) => {
        const resolved = await resolveAuthorizedSelection(
          db,
          input.selectionRef,
          context,
          options.now,
        )
        const components = selectionComponents(resolved.trip)
        if (resolved.access.revision !== input.expectedRevision) {
          throw new PublicApiTripSelectionConflictError(
            input.expectedRevision,
            resolved.access.revision,
          )
        }

        const mutation = await prepareMutation(
          options.offerResolver,
          db,
          context,
          accessScope(resolved.access),
          input,
          components,
          createItemRef,
          resolved.trip.components.reduce(
            (maximum, component) => Math.max(maximum, component.sequence),
            -1,
          ) + 1,
        )
        const nextRevision = await compareAndSwapRevision(
          db,
          resolved.access,
          input.expectedRevision,
          options.now?.() ?? new Date(),
        )

        if (mutation.kind === "add") {
          await addComponent(db, {
            ...mutation.component,
            envelopeId: resolved.access.envelopeId,
            sequence: mutation.sequence,
            metadata: withSelectionMetadata(
              mutation.component.metadata,
              mutation.itemRef,
              mutation.offer,
            ),
          })
        } else if (mutation.kind === "remove") {
          await removeComponent(db, mutation.component.id)
        } else {
          await reorderComponents(db, {
            envelopeId: resolved.access.envelopeId,
            componentIds: mutation.components.map((component) => component.id),
          })
        }

        const trip = await getTrip(db, resolved.access.envelopeId)
        if (!trip) throw new PublicApiTripSelectionAccessError()
        return selectionResult(
          input.selectionRef,
          nextRevision,
          resolvedScope(resolved.access, trip),
          selectionComponents(trip),
        )
      })
    },

    async book(context, input) {
      if (!options.compositeBookingSessions) {
        throw new PublicApiTripBookingError("storefront_trip_booking_session_rejected")
      }
      const catalog = await options.compositeBookingSessions
      return options.withTransaction(async (db) =>
        bookAuthorizedSelection(db, catalog, context, input, options.now),
      )
    },
  }
}

async function bookAuthorizedSelection(
  db: AnyDrizzleDb,
  catalog: CatalogCompositeBookingSessionRuntime,
  context: PublicApiShoppingContext,
  input: PublicApiTripBookingCreate,
  now: (() => Date) | undefined,
): Promise<PublicApiTripBooking> {
  const resolved = await resolveAuthorizedSelection(db, input.selectionRef, context, now)
  if (resolved.access.revision !== input.expectedRevision) {
    throw new PublicApiTripSelectionConflictError(input.expectedRevision, resolved.access.revision)
  }
  const components = selectionComponents(resolved.trip)
  if (components.length === 0 || components.some((component) => !component.pricingSnapshot)) {
    throw new PublicApiTripBookingError("storefront_trip_booking_pricing_unavailable")
  }

  // `storefront-trip-booking-v1` keeps its spelling deliberately. It is a
  // version token hashed into the operation digest recorded in
  // `trip_public_booking_operations`; renaming it changes every digest, so an
  // in-flight idempotent retry would stop matching its own recorded operation
  // and book twice. The retired name costs nothing here — the `-v1` is what
  // this string means.
  const operationDigest = await sha256Hex(
    ["storefront-trip-booking-v1", resolved.access.capabilityDigest, input.idempotencyKey].join(
      ":",
    ),
  )
  const requestFingerprint = await sha256Hex(
    JSON.stringify({
      version: 1,
      capabilityDigest: resolved.access.capabilityDigest,
      revision: input.expectedRevision,
      channelId: resolved.access.channelId,
      ownerUserId: resolved.access.ownerUserId,
      ownerBuyerAccountId: resolved.access.ownerBuyerAccountId,
      scope: accessScope(resolved.access),
    }),
  )
  const operation = await claimBookingOperation(db, {
    operationDigest,
    envelopeId: resolved.access.envelopeId,
    requestFingerprint,
  })
  if (!operation.claimed) {
    if (operation.record.requestFingerprint !== requestFingerprint) {
      throw new PublicApiTripBookingError("storefront_trip_booking_idempotency_conflict")
    }
    if (!operation.record.outcome) {
      throw new PublicApiTripBookingError("storefront_trip_booking_session_rejected")
    }
    return bookingResult(input.selectionRef, resolved.access.ownerUserId, operation.record.outcome)
  }

  const snapshot = await freezeTripSnapshot(db, {
    envelopeId: resolved.access.envelopeId,
    createdBy: resolved.access.ownerUserId ?? undefined,
  })
  const capability = await deriveBookingCapability(input.selectionRef)
  const outcome = await catalog.createValidatedTripSnapshotSession({
    db,
    idempotencyKey: input.idempotencyKey,
    tripSnapshotId: snapshot.id,
    tripEnvelopeId: resolved.access.envelopeId,
    capability,
    ownerUserId: resolved.access.ownerUserId,
    channel: { channelId: resolved.access.channelId },
    scope: {
      locale: resolved.access.locale,
      market: resolved.access.marketId,
      currency: resolved.access.currency,
    },
  })
  if (outcome.kind !== "session_created") {
    throw new PublicApiTripBookingError(
      outcome.kind === "rejected" && outcome.error.kind === "quote_unavailable"
        ? "storefront_trip_booking_pricing_unavailable"
        : "storefront_trip_booking_session_rejected",
    )
  }
  const [completed] = (await db
    .update(tripPublicBookingOperations)
    .set({
      snapshotId: snapshot.id,
      bookingSessionId: outcome.session.id,
      outcome,
      updatedAt: now?.() ?? new Date(),
    })
    .where(eq(tripPublicBookingOperations.operationDigest, operationDigest))
    .returning()) as TripPublicApiBookingOperation[]
  if (!completed) {
    throw new PublicApiTripBookingError("storefront_trip_booking_session_rejected")
  }
  return bookingResult(input.selectionRef, resolved.access.ownerUserId, outcome)
}

async function claimBookingOperation(
  db: AnyDrizzleDb,
  input: { operationDigest: string; envelopeId: string; requestFingerprint: string },
): Promise<
  | { claimed: true; record: TripPublicApiBookingOperation }
  | { claimed: false; record: TripPublicApiBookingOperation }
> {
  const [claimed] = (await db
    .insert(tripPublicBookingOperations)
    .values(input)
    .onConflictDoNothing()
    .returning()) as TripPublicApiBookingOperation[]
  if (claimed) return { claimed: true, record: claimed }
  const [existing] = (await db
    .select()
    .from(tripPublicBookingOperations)
    .where(eq(tripPublicBookingOperations.operationDigest, input.operationDigest))
    .limit(1)) as TripPublicApiBookingOperation[]
  if (!existing) throw new PublicApiTripBookingError("storefront_trip_booking_session_rejected")
  return { claimed: false, record: existing }
}

async function bookingResult(
  selectionRef: string,
  ownerUserId: string | null,
  outcome: PublicApiTripBooking["outcome"],
): Promise<PublicApiTripBooking> {
  return {
    ...(!ownerUserId
      ? { bookingSessionCapability: await deriveBookingCapability(selectionRef) }
      : {}),
    outcome,
  }
}

async function deriveBookingCapability(selectionRef: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(selectionRef),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  )
  const digest = new Uint8Array(
    await crypto.subtle.sign(
      "HMAC",
      key,
      new TextEncoder().encode("voyant:storefront:trip-booking-capability:v1"),
    ),
  )
  const encoded = btoa(String.fromCharCode(...digest))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "")
  return `bcap_${encoded}`
}

async function resolveOffers(
  resolver: PublicApiTripOfferResolver | undefined,
  db: AnyDrizzleDb,
  context: PublicApiShoppingContext,
  scope: PublicApiResolvedScope,
  offers: PublicApiTripSelectionCreate["offers"],
): Promise<Array<{ component: CreateTripComponentBodyInput }>> {
  const resolved: Array<{ component: CreateTripComponentBodyInput }> = []
  for (const offer of offers) {
    resolved.push(await resolveOffer(resolver, db, context, coreScope(scope), offer))
  }
  return resolved
}

async function resolveOffer(
  resolver: PublicApiTripOfferResolver | undefined,
  db: AnyDrizzleDb,
  context: PublicApiShoppingContext,
  scope: PublicApiTripScope,
  offer: PublicApiOfferSelection,
): Promise<{ component: CreateTripComponentBodyInput }> {
  if (!resolver) throw new PublicApiTripSelectionUnavailableError()
  const input = { ...offer, scope }
  const resolution = resolver.resolveInTransaction
    ? await resolver.resolveInTransaction(db, context, input)
    : await resolver.resolve(context, input)
  if (!resolution) throw new PublicApiTripSelectionUnavailableError("offer_unavailable")
  return { component: createTripComponentBodySchema.parse(resolution.component) }
}

async function resolveAuthorizedSelection(
  db: AnyDrizzleDb,
  selectionRef: string,
  context: PublicApiShoppingContext,
  now: (() => Date) | undefined,
): Promise<{ access: TripPublicAccess; trip: Trip }> {
  const resolution = await resolvePublicApiTripAccess(db, selectionRef, context, {
    ...(now ? { now } : {}),
  })
  if (!resolution.ok) throw new PublicApiTripSelectionAccessError()
  assertScopeIntegrity(resolution.access, resolution.trip)
  return resolution
}

function assertScopeIntegrity(access: TripPublicAccess, trip: Trip): void {
  const constraints = trip.envelope.constraints
  const stored =
    constraints && typeof constraints === "object" && !Array.isArray(constraints)
      ? (constraints as Record<string, unknown>).publicApiScope
      : undefined
  const parsed = z
    .object({ marketId: z.string(), locale: z.string(), currency: z.string() })
    .strict()
    .safeParse(stored)
  if (
    !parsed.success ||
    parsed.data.marketId !== access.marketId ||
    parsed.data.locale !== access.locale ||
    parsed.data.currency !== access.currency
  ) {
    throw new PublicApiTripSelectionAccessError()
  }
  resolvedScope(access, trip)
}

type PreparedMutation =
  | {
      kind: "add"
      offer: PublicApiOfferSelection
      itemRef: string
      sequence: number
      component: CreateTripComponentBodyInput
    }
  | { kind: "remove"; component: TripComponent }
  | { kind: "reorder"; components: TripComponent[] }

async function prepareMutation(
  resolver: PublicApiTripOfferResolver | undefined,
  db: AnyDrizzleDb,
  context: PublicApiShoppingContext,
  scope: PublicApiTripScope,
  input: PublicApiTripSelectionUpdate,
  components: TripComponent[],
  createItemRef: () => string,
  nextSequence: number,
): Promise<PreparedMutation> {
  const byItemRef = new Map(
    components.map((component) => [selectionItem(component).itemRef, component]),
  )
  if (input.mutation.kind === "add") {
    const resolved = await resolveOffer(resolver, db, context, scope, input.mutation.offer)
    return {
      kind: "add",
      offer: input.mutation.offer,
      itemRef: publicApiSelectionItemMetadataSchema.shape.itemRef.parse(createItemRef()),
      sequence: nextSequence,
      component: resolved.component,
    }
  }
  if (input.mutation.kind === "remove") {
    const component = byItemRef.get(input.mutation.itemRef)
    if (!component) {
      throw new PublicApiTripSelectionMutationError("Selection item was not found.")
    }
    return { kind: "remove", component }
  }

  if (
    input.mutation.itemRefs.length !== components.length ||
    new Set(input.mutation.itemRefs).size !== components.length
  ) {
    throw new PublicApiTripSelectionMutationError(
      "Reorder must contain every selection item exactly once.",
    )
  }
  const reordered = input.mutation.itemRefs.map((itemRef) => byItemRef.get(itemRef))
  if (reordered.some((component) => component === undefined)) {
    throw new PublicApiTripSelectionMutationError(
      "Reorder must contain every selection item exactly once.",
    )
  }
  return { kind: "reorder", components: reordered as TripComponent[] }
}

async function compareAndSwapRevision(
  db: AnyDrizzleDb,
  access: TripPublicAccess,
  expectedRevision: number,
  now: Date,
): Promise<number> {
  const nextRevision = expectedRevision + 1
  const [updated] = (await db
    .update(tripPublicAccess)
    .set({ revision: nextRevision, updatedAt: now })
    .where(
      and(
        eq(tripPublicAccess.envelopeId, access.envelopeId),
        eq(tripPublicAccess.capabilityDigest, access.capabilityDigest),
        eq(tripPublicAccess.channelId, access.channelId),
        eq(tripPublicAccess.marketId, access.marketId),
        eq(tripPublicAccess.locale, access.locale),
        eq(tripPublicAccess.currency, access.currency),
        access.ownerUserId === null
          ? isNull(tripPublicAccess.ownerUserId)
          : eq(tripPublicAccess.ownerUserId, access.ownerUserId),
        access.ownerBuyerAccountId === null
          ? isNull(tripPublicAccess.ownerBuyerAccountId)
          : eq(tripPublicAccess.ownerBuyerAccountId, access.ownerBuyerAccountId),
        eq(tripPublicAccess.revision, expectedRevision),
      ),
    )
    .returning()) as TripPublicAccess[]
  if (updated) return updated.revision

  const [actual] = (await db
    .select()
    .from(tripPublicAccess)
    .where(eq(tripPublicAccess.envelopeId, access.envelopeId))
    .limit(1)) as TripPublicAccess[]
  if (!actual) throw new PublicApiTripSelectionAccessError()
  if (!sameAccessBoundary(access, actual)) throw new PublicApiTripSelectionAccessError()
  throw new PublicApiTripSelectionConflictError(expectedRevision, actual.revision)
}

function sameAccessBoundary(expected: TripPublicAccess, actual: TripPublicAccess): boolean {
  return (
    expected.capabilityDigest === actual.capabilityDigest &&
    expected.channelId === actual.channelId &&
    expected.marketId === actual.marketId &&
    expected.locale === actual.locale &&
    expected.currency === actual.currency &&
    expected.ownerUserId === actual.ownerUserId &&
    expected.ownerBuyerAccountId === actual.ownerBuyerAccountId
  )
}

function selectionComponents(trip: Trip): TripComponent[] {
  const active = trip.components.filter(
    (component) => component.status !== "removed" && component.status !== "cancelled",
  )
  for (const component of active) selectionItem(component)
  return active.sort((left, right) => left.sequence - right.sequence)
}

function selectionItem(
  component: TripComponent,
): z.infer<typeof publicApiSelectionItemMetadataSchema> {
  const parsed = publicApiSelectionItemMetadataSchema.safeParse(
    (component.metadata as Record<string, unknown>).publicApiSelection,
  )
  if (!parsed.success) {
    throw new PublicApiTripSelectionAccessError()
  }
  return parsed.data
}

function withSelectionMetadata(
  metadata: Record<string, unknown>,
  itemRef: string,
  offer: PublicApiOfferSelection,
): Record<string, unknown> {
  return {
    ...metadata,
    publicApiSelection: {
      version: 1,
      itemRef,
      kind: offer.kind,
      quantity: offer.quantity ?? 1,
    },
  }
}

function selectionResult(
  selectionRef: string,
  revision: number,
  scope: PublicApiResolvedScope,
  components: TripComponent[],
): PublicApiTripSelection {
  return {
    selectionRef,
    revision,
    scope,
    items: components.map((component) => {
      const item = selectionItem(component)
      return { itemRef: item.itemRef, kind: item.kind, quantity: item.quantity }
    }),
  }
}

function coreScope(scope: PublicApiResolvedScope): PublicApiTripScope {
  return { marketId: scope.marketId, locale: scope.locale, currency: scope.currency }
}

function accessScope(access: TripPublicAccess): PublicApiTripScope {
  return { marketId: access.marketId, locale: access.locale, currency: access.currency }
}

function resolvedScope(access: TripPublicAccess, trip: Trip): PublicApiResolvedScope {
  const constraints = trip.envelope.constraints as Record<string, unknown>
  const scope = publicApiResolvedScopeSchema.safeParse(constraints.publicApiResolvedScope)
  if (!scope.success || !sameScope(access, scope.data)) {
    throw new PublicApiTripSelectionAccessError()
  }
  return scope.data
}

function sameScope(access: TripPublicAccess, scope: PublicApiTripScope): boolean {
  return (
    access.marketId === scope.marketId &&
    access.locale === scope.locale &&
    access.currency === scope.currency
  )
}
