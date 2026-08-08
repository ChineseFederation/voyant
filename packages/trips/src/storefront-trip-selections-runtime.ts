import type { AnyDrizzleDb } from "@voyant-travel/db"
import { randomBytesHex } from "@voyant-travel/hono"
import {
  type StorefrontResolvedScope,
  type StorefrontShoppingContext,
  type StorefrontTripSelection,
  type StorefrontTripSelectionCreate,
  type StorefrontTripSelectionsRuntime,
  type StorefrontTripSelectionUpdate,
  storefrontResolvedScopeSchema,
} from "@voyant-travel/storefront/shopping"
import { and, eq, isNull } from "drizzle-orm"
import { z } from "zod"

import type { TripComponent, TripStorefrontAccess } from "./schema.js"
import { tripStorefrontAccess } from "./schema.js"
import {
  addComponent,
  getTrip,
  removeComponent,
  reorderComponents,
  updateTrip,
} from "./service-trips.js"
import type { Trip } from "./service-types.js"
import {
  createStorefrontTripInTransaction,
  resolveStorefrontTripAccess,
  type StorefrontTripScope,
} from "./storefront-access.js"
import type { StorefrontTripOfferResolver } from "./storefront-trip-offer-resolver-port.js"
import { type CreateTripComponentBodyInput, createTripComponentBodySchema } from "./validation.js"

const storefrontSelectionItemMetadataSchema = z
  .object({
    version: z.literal(1),
    itemRef: z.string().regex(/^tsi_[a-f0-9]{64}$/),
    kind: z.enum(["product", "flight", "stay", "package"]),
    quantity: z.number().int().min(1).max(99),
  })
  .strict()

type StorefrontOfferSelection = StorefrontTripSelectionCreate["offers"][number]

export class StorefrontTripSelectionUnavailableError extends Error {
  readonly code = "storefront_trip_selection_unavailable"

  constructor(reason = "offer_resolution_unavailable") {
    super(`Storefront Trip selection is unavailable: ${reason}.`)
    this.name = "StorefrontTripSelectionUnavailableError"
  }
}

export class StorefrontTripSelectionAccessError extends Error {
  readonly code = "storefront_trip_selection_not_found"

  constructor() {
    super("Storefront Trip selection was not found.")
    this.name = "StorefrontTripSelectionAccessError"
  }
}

export class StorefrontTripSelectionConflictError extends Error {
  readonly code = "storefront_trip_selection_revision_conflict"

  constructor(
    readonly expectedRevision: number,
    readonly actualRevision: number,
  ) {
    super(
      `Storefront Trip selection revision conflict: expected ${expectedRevision}, actual ${actualRevision}.`,
    )
    this.name = "StorefrontTripSelectionConflictError"
  }
}

export class StorefrontTripSelectionMutationError extends Error {
  readonly code = "storefront_trip_selection_invalid_mutation"

  constructor(message: string) {
    super(message)
    this.name = "StorefrontTripSelectionMutationError"
  }
}

export interface StorefrontTripSelectionsRuntimeOptions {
  withTransaction<T>(operation: (db: AnyDrizzleDb) => Promise<T>): Promise<T>
  offerResolver?: StorefrontTripOfferResolver
  now?: () => Date
  createSelectionRef?: () => string
  createItemRef?: () => string
}

/** Trips-owned provider for the Storefront gateway's stateful selection port. */
export function createStorefrontTripSelectionsRuntime(
  options: StorefrontTripSelectionsRuntimeOptions,
): StorefrontTripSelectionsRuntime {
  const createItemRef = options.createItemRef ?? (() => `tsi_${randomBytesHex(32)}`)

  return {
    async create(context, input) {
      const offers = await resolveOffers(options.offerResolver, context, input.scope, input.offers)
      const itemRefs = offers.map(() =>
        storefrontSelectionItemMetadataSchema.shape.itemRef.parse(createItemRef()),
      )

      return options.withTransaction(async (db) => {
        const handle = await createStorefrontTripInTransaction(
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
            storefrontScope: handle.scope,
            storefrontResolvedScope: input.scope,
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
                input.offers[sequence] as StorefrontOfferSelection,
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
          throw new StorefrontTripSelectionConflictError(
            input.expectedRevision,
            resolved.access.revision,
          )
        }

        const mutation = await prepareMutation(
          options.offerResolver,
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
        if (!trip) throw new StorefrontTripSelectionAccessError()
        return selectionResult(
          input.selectionRef,
          nextRevision,
          resolvedScope(resolved.access, trip),
          selectionComponents(trip),
        )
      })
    },
  }
}

async function resolveOffers(
  resolver: StorefrontTripOfferResolver | undefined,
  context: StorefrontShoppingContext,
  scope: StorefrontResolvedScope,
  offers: StorefrontTripSelectionCreate["offers"],
): Promise<Array<{ component: CreateTripComponentBodyInput }>> {
  const resolved: Array<{ component: CreateTripComponentBodyInput }> = []
  for (const offer of offers) {
    resolved.push(await resolveOffer(resolver, context, coreScope(scope), offer))
  }
  return resolved
}

async function resolveOffer(
  resolver: StorefrontTripOfferResolver | undefined,
  context: StorefrontShoppingContext,
  scope: StorefrontTripScope,
  offer: StorefrontOfferSelection,
): Promise<{ component: CreateTripComponentBodyInput }> {
  if (!resolver) throw new StorefrontTripSelectionUnavailableError()
  const resolution = await resolver.resolve(context, { ...offer, scope })
  if (!resolution) throw new StorefrontTripSelectionUnavailableError("offer_unavailable")
  return { component: createTripComponentBodySchema.parse(resolution.component) }
}

async function resolveAuthorizedSelection(
  db: AnyDrizzleDb,
  selectionRef: string,
  context: StorefrontShoppingContext,
  now: (() => Date) | undefined,
): Promise<{ access: TripStorefrontAccess; trip: Trip }> {
  const resolution = await resolveStorefrontTripAccess(db, selectionRef, context, {
    ...(now ? { now } : {}),
  })
  if (!resolution.ok) throw new StorefrontTripSelectionAccessError()
  assertScopeIntegrity(resolution.access, resolution.trip)
  return resolution
}

function assertScopeIntegrity(access: TripStorefrontAccess, trip: Trip): void {
  const constraints = trip.envelope.constraints
  const stored =
    constraints && typeof constraints === "object" && !Array.isArray(constraints)
      ? (constraints as Record<string, unknown>).storefrontScope
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
    throw new StorefrontTripSelectionAccessError()
  }
  resolvedScope(access, trip)
}

type PreparedMutation =
  | {
      kind: "add"
      offer: StorefrontOfferSelection
      itemRef: string
      sequence: number
      component: CreateTripComponentBodyInput
    }
  | { kind: "remove"; component: TripComponent }
  | { kind: "reorder"; components: TripComponent[] }

async function prepareMutation(
  resolver: StorefrontTripOfferResolver | undefined,
  context: StorefrontShoppingContext,
  scope: StorefrontTripScope,
  input: StorefrontTripSelectionUpdate,
  components: TripComponent[],
  createItemRef: () => string,
  nextSequence: number,
): Promise<PreparedMutation> {
  const byItemRef = new Map(
    components.map((component) => [selectionItem(component).itemRef, component]),
  )
  if (input.mutation.kind === "add") {
    const resolved = await resolveOffer(resolver, context, scope, input.mutation.offer)
    return {
      kind: "add",
      offer: input.mutation.offer,
      itemRef: storefrontSelectionItemMetadataSchema.shape.itemRef.parse(createItemRef()),
      sequence: nextSequence,
      component: resolved.component,
    }
  }
  if (input.mutation.kind === "remove") {
    const component = byItemRef.get(input.mutation.itemRef)
    if (!component) {
      throw new StorefrontTripSelectionMutationError("Selection item was not found.")
    }
    return { kind: "remove", component }
  }

  if (
    input.mutation.itemRefs.length !== components.length ||
    new Set(input.mutation.itemRefs).size !== components.length
  ) {
    throw new StorefrontTripSelectionMutationError(
      "Reorder must contain every selection item exactly once.",
    )
  }
  const reordered = input.mutation.itemRefs.map((itemRef) => byItemRef.get(itemRef))
  if (reordered.some((component) => component === undefined)) {
    throw new StorefrontTripSelectionMutationError(
      "Reorder must contain every selection item exactly once.",
    )
  }
  return { kind: "reorder", components: reordered as TripComponent[] }
}

async function compareAndSwapRevision(
  db: AnyDrizzleDb,
  access: TripStorefrontAccess,
  expectedRevision: number,
  now: Date,
): Promise<number> {
  const nextRevision = expectedRevision + 1
  const [updated] = (await db
    .update(tripStorefrontAccess)
    .set({ revision: nextRevision, updatedAt: now })
    .where(
      and(
        eq(tripStorefrontAccess.envelopeId, access.envelopeId),
        eq(tripStorefrontAccess.capabilityDigest, access.capabilityDigest),
        eq(tripStorefrontAccess.storefrontId, access.storefrontId),
        eq(tripStorefrontAccess.channelId, access.channelId),
        eq(tripStorefrontAccess.marketId, access.marketId),
        eq(tripStorefrontAccess.locale, access.locale),
        eq(tripStorefrontAccess.currency, access.currency),
        access.ownerUserId === null
          ? isNull(tripStorefrontAccess.ownerUserId)
          : eq(tripStorefrontAccess.ownerUserId, access.ownerUserId),
        access.ownerBuyerAccountId === null
          ? isNull(tripStorefrontAccess.ownerBuyerAccountId)
          : eq(tripStorefrontAccess.ownerBuyerAccountId, access.ownerBuyerAccountId),
        eq(tripStorefrontAccess.revision, expectedRevision),
      ),
    )
    .returning()) as TripStorefrontAccess[]
  if (updated) return updated.revision

  const [actual] = (await db
    .select()
    .from(tripStorefrontAccess)
    .where(eq(tripStorefrontAccess.envelopeId, access.envelopeId))
    .limit(1)) as TripStorefrontAccess[]
  if (!actual) throw new StorefrontTripSelectionAccessError()
  if (!sameAccessBoundary(access, actual)) throw new StorefrontTripSelectionAccessError()
  throw new StorefrontTripSelectionConflictError(expectedRevision, actual.revision)
}

function sameAccessBoundary(expected: TripStorefrontAccess, actual: TripStorefrontAccess): boolean {
  return (
    expected.capabilityDigest === actual.capabilityDigest &&
    expected.storefrontId === actual.storefrontId &&
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
): z.infer<typeof storefrontSelectionItemMetadataSchema> {
  const parsed = storefrontSelectionItemMetadataSchema.safeParse(
    (component.metadata as Record<string, unknown>).storefrontSelection,
  )
  if (!parsed.success) {
    throw new StorefrontTripSelectionAccessError()
  }
  return parsed.data
}

function withSelectionMetadata(
  metadata: Record<string, unknown>,
  itemRef: string,
  offer: StorefrontOfferSelection,
): Record<string, unknown> {
  return {
    ...metadata,
    storefrontSelection: {
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
  scope: StorefrontResolvedScope,
  components: TripComponent[],
): StorefrontTripSelection {
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

function coreScope(scope: StorefrontResolvedScope): StorefrontTripScope {
  return { marketId: scope.marketId, locale: scope.locale, currency: scope.currency }
}

function accessScope(access: TripStorefrontAccess): StorefrontTripScope {
  return { marketId: access.marketId, locale: access.locale, currency: access.currency }
}

function resolvedScope(access: TripStorefrontAccess, trip: Trip): StorefrontResolvedScope {
  const constraints = trip.envelope.constraints as Record<string, unknown>
  const scope = storefrontResolvedScopeSchema.safeParse(constraints.storefrontResolvedScope)
  if (!scope.success || !sameScope(access, scope.data)) {
    throw new StorefrontTripSelectionAccessError()
  }
  return scope.data
}

function sameScope(access: TripStorefrontAccess, scope: StorefrontTripScope): boolean {
  return (
    access.marketId === scope.marketId &&
    access.locale === scope.locale &&
    access.currency === scope.currency
  )
}
