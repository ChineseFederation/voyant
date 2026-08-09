import type { AnyDrizzleDb } from "@voyant-travel/db"
import { sha256Hex } from "@voyant-travel/hono"
import type { StorefrontShoppingContext } from "@voyant-travel/storefront/shopping"
import { describe, expect, it, vi } from "vitest"

import {
  type TripComponent,
  type TripEnvelope,
  type TripSnapshot,
  type TripStorefrontAccess,
  type TripStorefrontBookingOperation,
  tripComponents,
  tripEnvelopes,
  tripSnapshots,
  tripStorefrontAccess,
  tripStorefrontBookingOperations,
} from "../src/schema.js"
import type { StorefrontTripOfferResolutionInput } from "../src/storefront-trip-offer-resolver-port.js"
import {
  createStorefrontTripSelectionsRuntime,
  StorefrontTripBookingError,
  StorefrontTripSelectionAccessError,
  StorefrontTripSelectionConflictError,
  StorefrontTripSelectionUnavailableError,
} from "../src/storefront-trip-selections-runtime.js"

const NOW = new Date("2026-08-08T10:00:00.000Z")
const CAPABILITY = `tcap_${"a".repeat(64)}`
const ITEM_ONE = `tsi_${"b".repeat(64)}`
const ITEM_TWO = `tsi_${"c".repeat(64)}`
const CONTEXT = {
  storefrontId: "storefront_bucharest",
  channelId: "channel_direct",
  userId: "customer_1",
  buyerAccountId: "buyer_1",
}
const SCOPE = {
  marketId: "market_ro",
  locale: "ro-RO",
  currency: "EUR",
  available: {
    marketIds: ["market_ro"],
    locales: ["ro-RO"],
    currencies: ["EUR"],
  },
}

describe("Storefront Trip selections runtime", () => {
  it("fails unavailable without an offerRef resolver and never treats a Trip id as a selection", async () => {
    const state = await seededState()
    const runtime = createStorefrontTripSelectionsRuntime({
      withTransaction: (operation) => operation(createDb(state)),
      now: () => NOW,
    })

    await expect(
      runtime.create(CONTEXT, {
        scope: SCOPE,
        offers: [{ kind: "product", offerRef: "offer-public-ref-0001" }],
      }),
    ).rejects.toBeInstanceOf(StorefrontTripSelectionUnavailableError)
    await expect(
      runtime.update(CONTEXT, {
        selectionRef: "trip_storefront_internal_0001",
        expectedRevision: 1,
        mutation: { kind: "remove", itemRef: ITEM_ONE },
      }),
    ).rejects.toBeInstanceOf(StorefrontTripSelectionAccessError)
  })

  it("redeems one-time offers inside the same transaction that creates the selection", async () => {
    const state = emptyState()
    const db = createDb(state)
    const resolve = vi.fn(async () => {
      throw new Error("standalone redemption must not run")
    })
    const resolveInTransaction = vi.fn(async () => ({
      component: {
        kind: "catalog_booking" as const,
        catalogRef: {
          entityModule: "products",
          entityId: "product_1",
          sourceKind: "voyant-connect",
          sourceConnectionId: "connection_server",
          sourceRef: "product_1",
        },
        metadata: {},
      },
    }))
    const runtime = createStorefrontTripSelectionsRuntime({
      withTransaction: (operation) => operation(db),
      offerResolver: { resolve, resolveInTransaction },
      now: () => NOW,
      createSelectionRef: () => CAPABILITY,
      createItemRef: () => ITEM_ONE,
    })

    await expect(
      runtime.create(CONTEXT, {
        scope: SCOPE,
        offers: [{ kind: "package", offerRef: "package-offer-ref-001" }],
      }),
    ).resolves.toMatchObject({ revision: 1, items: [{ kind: "package" }] })
    expect(resolve).not.toHaveBeenCalled()
    expect(resolveInTransaction).toHaveBeenCalledWith(
      db,
      CONTEXT,
      expect.objectContaining({ kind: "package", offerRef: "package-offer-ref-001" }),
    )
  })

  it("creates and mutates only through opaque references with deterministic ordering", async () => {
    const state = emptyState()
    const resolver = {
      resolve: vi.fn(
        async (_context: StorefrontShoppingContext, input: StorefrontTripOfferResolutionInput) => ({
          component: {
            kind: "catalog_booking" as const,
            catalogRef: {
              entityModule: input.kind === "stay" ? "accommodations" : "products",
              entityId: `internal_${input.offerRef}`,
              sourceKind: "owned",
            },
            metadata:
              input.kind === "stay"
                ? {
                    bookingDraftV1: {
                      configure: {
                        dateRange: { checkIn: "2026-09-01", checkOut: "2026-09-03" },
                      },
                    },
                  }
                : {},
          },
        }),
      ),
    }
    const itemRefs = [ITEM_ONE, ITEM_TWO]
    const runtime = createStorefrontTripSelectionsRuntime({
      withTransaction: (operation) => operation(createDb(state)),
      offerResolver: resolver,
      now: () => NOW,
      createSelectionRef: () => CAPABILITY,
      createItemRef: () => itemRefs.shift() as string,
    })

    const created = await runtime.create(CONTEXT, {
      scope: SCOPE,
      offers: [{ kind: "product", offerRef: "offer-public-ref-0001", quantity: 2 }],
    })
    const added = await runtime.update(CONTEXT, {
      selectionRef: created.selectionRef,
      expectedRevision: created.revision,
      mutation: { kind: "add", offer: { kind: "stay", offerRef: "offer-public-ref-0002" } },
    })
    const reordered = await runtime.update(CONTEXT, {
      selectionRef: added.selectionRef,
      expectedRevision: added.revision,
      mutation: { kind: "reorder", itemRefs: [ITEM_TWO, ITEM_ONE] },
    })
    const removed = await runtime.update(CONTEXT, {
      selectionRef: reordered.selectionRef,
      expectedRevision: reordered.revision,
      mutation: { kind: "remove", itemRef: ITEM_ONE },
    })

    expect(created).toMatchObject({
      selectionRef: CAPABILITY,
      revision: 1,
      items: [{ itemRef: ITEM_ONE, kind: "product", quantity: 2 }],
    })
    expect(added.items.map((item) => item.itemRef)).toEqual([ITEM_ONE, ITEM_TWO])
    expect(reordered.items.map((item) => item.itemRef)).toEqual([ITEM_TWO, ITEM_ONE])
    expect(removed.items.map((item) => item.itemRef)).toEqual([ITEM_TWO])
    expect(removed.revision).toBe(4)
    expect(resolver.resolve).toHaveBeenNthCalledWith(1, CONTEXT, {
      kind: "product",
      offerRef: "offer-public-ref-0001",
      quantity: 2,
      scope: { marketId: "market_ro", locale: "ro-RO", currency: "EUR" },
    })
    expect(JSON.stringify(created)).not.toContain("internal_offer")
    expect(JSON.stringify(state.access)).not.toContain(CAPABILITY)
  })

  it("rejects replayed and concurrently stale mutations without applying them", async () => {
    const state = await seededState()
    const resolve = vi.fn(async () => ({
      component: { kind: "catalog_booking" as const, metadata: {} },
    }))
    const runtime = createStorefrontTripSelectionsRuntime({
      withTransaction: (operation) => operation(createDb(state)),
      offerResolver: { resolve },
      now: () => NOW,
      createItemRef: () => ITEM_TWO,
    })
    const request = {
      selectionRef: CAPABILITY,
      expectedRevision: 1,
      mutation: {
        kind: "add" as const,
        offer: { kind: "flight" as const, offerRef: "flight-offer-ref-001" },
      },
    }

    await expect(runtime.update(CONTEXT, request)).resolves.toMatchObject({ revision: 2 })
    await expect(runtime.update(CONTEXT, request)).rejects.toMatchObject({
      code: "storefront_trip_selection_revision_conflict",
      expectedRevision: 1,
      actualRevision: 2,
    })
    expect(resolve).toHaveBeenCalledOnce()
    expect(state.components).toHaveLength(2)

    const concurrent = await seededState()
    concurrent.forceCasConflictRevision = 2
    const concurrentRuntime = createStorefrontTripSelectionsRuntime({
      withTransaction: (operation) => operation(createDb(concurrent)),
      now: () => NOW,
    })
    await expect(
      concurrentRuntime.update(CONTEXT, {
        selectionRef: CAPABILITY,
        expectedRevision: 1,
        mutation: { kind: "remove", itemRef: ITEM_ONE },
      }),
    ).rejects.toEqual(new StorefrontTripSelectionConflictError(1, 2))
    expect(concurrent.components[0]?.status).toBe("draft")
  })

  it("keeps the revision unchanged when add, remove, or reorder validation fails", async () => {
    const state = await seededState()
    const runtime = createStorefrontTripSelectionsRuntime({
      withTransaction: (operation) => operation(createDb(state)),
      now: () => NOW,
    })

    await expect(
      runtime.update(CONTEXT, {
        selectionRef: CAPABILITY,
        expectedRevision: 1,
        mutation: {
          kind: "add",
          offer: { kind: "flight", offerRef: "flight-offer-ref-001" },
        },
      }),
    ).rejects.toBeInstanceOf(StorefrontTripSelectionUnavailableError)
    expect(state.access?.revision).toBe(1)

    await expect(
      runtime.update(CONTEXT, {
        selectionRef: CAPABILITY,
        expectedRevision: 1,
        mutation: { kind: "remove", itemRef: ITEM_TWO },
      }),
    ).rejects.toMatchObject({ code: "storefront_trip_selection_invalid_mutation" })
    expect(state.access?.revision).toBe(1)

    await expect(
      runtime.update(CONTEXT, {
        selectionRef: CAPABILITY,
        expectedRevision: 1,
        mutation: { kind: "reorder", itemRefs: [ITEM_ONE, ITEM_ONE] },
      }),
    ).rejects.toMatchObject({ code: "storefront_trip_selection_invalid_mutation" })
    expect(state.access?.revision).toBe(1)
    expect(state.components[0]?.status).toBe("draft")
  })

  it("rejects an expired selection before mutation", async () => {
    const state = await seededState()
    state.access = {
      ...(state.access as TripStorefrontAccess),
      expiresAt: new Date("2026-08-08T09:59:59.000Z"),
    }
    const runtime = createStorefrontTripSelectionsRuntime({
      withTransaction: (operation) => operation(createDb(state)),
      now: () => NOW,
    })

    await expect(
      runtime.update(CONTEXT, {
        selectionRef: CAPABILITY,
        expectedRevision: 1,
        mutation: { kind: "remove", itemRef: ITEM_ONE },
      }),
    ).rejects.toBeInstanceOf(StorefrontTripSelectionAccessError)
    expect(state.access?.revision).toBe(1)
  })

  it.each([
    { context: { ...CONTEXT, storefrontId: "storefront_other" }, boundary: "storefront" },
    { context: { ...CONTEXT, channelId: "channel_other" }, boundary: "channel" },
    { context: { ...CONTEXT, userId: "customer_other" }, boundary: "customer" },
    { context: { ...CONTEXT, buyerAccountId: "buyer_other" }, boundary: "buyer account" },
  ])("isolates selections from a different $boundary", async ({ context }) => {
    const state = await seededState()
    const runtime = createStorefrontTripSelectionsRuntime({
      withTransaction: (operation) => operation(createDb(state)),
      now: () => NOW,
    })

    await expect(
      runtime.update(context, {
        selectionRef: CAPABILITY,
        expectedRevision: 1,
        mutation: { kind: "remove", itemRef: ITEM_ONE },
      }),
    ).rejects.toBeInstanceOf(StorefrontTripSelectionAccessError)
    expect(state.access?.revision).toBe(1)
    expect(state.components[0]?.status).toBe("draft")
  })

  it("fails closed when persisted access and Trip scope drift", async () => {
    const state = await seededState()
    state.envelope = {
      ...state.envelope,
      constraints: {
        storefrontScope: { marketId: "market_ro", locale: "ro-RO", currency: "USD" },
      },
    }
    const runtime = createStorefrontTripSelectionsRuntime({
      withTransaction: (operation) => operation(createDb(state)),
      compositeBookingSessions: { createValidatedTripSnapshotSession: vi.fn() },
      now: () => NOW,
    })

    await expect(
      runtime.update(CONTEXT, {
        selectionRef: CAPABILITY,
        expectedRevision: 1,
        mutation: { kind: "remove", itemRef: ITEM_ONE },
      }),
    ).rejects.toBeInstanceOf(StorefrontTripSelectionAccessError)
    await expect(
      runtime.book(CONTEXT, {
        selectionRef: CAPABILITY,
        expectedRevision: 1,
        idempotencyKey: "book_scope_drift",
      }),
    ).rejects.toBeInstanceOf(StorefrontTripSelectionAccessError)
  })

  it("fails before Catalog conversion when the exact revision is stale or unpriced", async () => {
    const state = await seededState()
    const createValidatedTripSnapshotSession = vi.fn()
    const runtime = createStorefrontTripSelectionsRuntime({
      withTransaction: (operation) => operation(createDb(state)),
      compositeBookingSessions: { createValidatedTripSnapshotSession },
      now: () => NOW,
    })

    await expect(
      runtime.book(CONTEXT, {
        selectionRef: CAPABILITY,
        expectedRevision: 0,
        idempotencyKey: "book_stale_revision",
      }),
    ).rejects.toBeInstanceOf(StorefrontTripSelectionConflictError)
    await expect(
      runtime.book(CONTEXT, {
        selectionRef: CAPABILITY,
        expectedRevision: 1,
        idempotencyKey: "book_missing_price",
      }),
    ).rejects.toEqual(new StorefrontTripBookingError("storefront_trip_booking_pricing_unavailable"))
    expect(createValidatedTripSnapshotSession).not.toHaveBeenCalled()
    expect(state.snapshots).toHaveLength(0)
    expect(state.bookingOperations).toHaveLength(0)
  })

  it.each([
    { context: { ...CONTEXT, storefrontId: "storefront_other" }, boundary: "storefront" },
    { context: { ...CONTEXT, channelId: "channel_other" }, boundary: "channel" },
    { context: { ...CONTEXT, userId: "customer_other" }, boundary: "owner" },
  ])("rejects Trip booking replay across a different $boundary", async ({ context }) => {
    const state = await pricedState()
    state.access = {
      ...(state.access as TripStorefrontAccess),
      ownerUserId: CONTEXT.userId,
      ownerBuyerAccountId: CONTEXT.buyerAccountId,
    }
    const createValidatedTripSnapshotSession = vi.fn()
    const runtime = createStorefrontTripSelectionsRuntime({
      withTransaction: transactional(state),
      compositeBookingSessions: { createValidatedTripSnapshotSession },
      now: () => NOW,
    })

    await expect(
      runtime.book(context, {
        selectionRef: CAPABILITY,
        expectedRevision: 1,
        idempotencyKey: "book_wrong_boundary",
      }),
    ).rejects.toBeInstanceOf(StorefrontTripSelectionAccessError)
    expect(createValidatedTripSnapshotSession).not.toHaveBeenCalled()
    expect(state.snapshots).toHaveLength(0)
  })

  it("atomically freezes once and returns the same opaque Session on an idempotent retry", async () => {
    const state = await pricedState()
    const createValidatedTripSnapshotSession = vi.fn(async () => ({
      kind: "session_created" as const,
      session: bookingSessionRecord(),
    }))
    const runtime = createStorefrontTripSelectionsRuntime({
      withTransaction: transactional(state),
      compositeBookingSessions: { createValidatedTripSnapshotSession },
      now: () => NOW,
    })
    const request = {
      selectionRef: CAPABILITY,
      expectedRevision: 1,
      idempotencyKey: "book_trip_retry",
    }

    const first = await runtime.book({ ...CONTEXT, userId: null, buyerAccountId: null }, request)
    const replay = await runtime.book({ ...CONTEXT, userId: null, buyerAccountId: null }, request)

    expect(replay).toEqual(first)
    expect(first).toMatchObject({
      bookingSessionCapability: expect.stringMatching(/^bcap_[A-Za-z0-9_-]{43}$/),
      outcome: {
        kind: "session_created",
        session: { target: { kind: "managed_itinerary" } },
      },
    })
    expect(JSON.stringify(first)).not.toMatch(/trip_storefront_1|trip_component_internal/)
    expect(createValidatedTripSnapshotSession).toHaveBeenCalledOnce()
    expect(state.snapshots).toHaveLength(1)
    expect(state.bookingOperations).toHaveLength(1)
  })

  it("conflicts on a reused key with a different exact Trip revision", async () => {
    const state = await pricedState()
    const createValidatedTripSnapshotSession = vi.fn(async () => ({
      kind: "session_created" as const,
      session: bookingSessionRecord(),
    }))
    const runtime = createStorefrontTripSelectionsRuntime({
      withTransaction: transactional(state),
      compositeBookingSessions: { createValidatedTripSnapshotSession },
      now: () => NOW,
    })
    await runtime.book(CONTEXT, {
      selectionRef: CAPABILITY,
      expectedRevision: 1,
      idempotencyKey: "book_trip_conflict",
    })
    state.access = { ...(state.access as TripStorefrontAccess), revision: 2 }

    await expect(
      runtime.book(CONTEXT, {
        selectionRef: CAPABILITY,
        expectedRevision: 2,
        idempotencyKey: "book_trip_conflict",
      }),
    ).rejects.toEqual(
      new StorefrontTripBookingError("storefront_trip_booking_idempotency_conflict"),
    )
    expect(createValidatedTripSnapshotSession).toHaveBeenCalledOnce()
    expect(state.snapshots).toHaveLength(1)
  })

  it("rolls back the snapshot and idempotency claim when Catalog rejects creation", async () => {
    const state = await pricedState()
    const runtime = createStorefrontTripSelectionsRuntime({
      withTransaction: transactional(state),
      compositeBookingSessions: {
        createValidatedTripSnapshotSession: vi.fn(async () => ({
          kind: "rejected" as const,
          error: {
            kind: "quote_unavailable" as const,
            reason: "price_unavailable" as const,
            nextAction: "select_alternative_inventory" as const,
          },
        })),
      },
      now: () => NOW,
    })

    await expect(
      runtime.book(CONTEXT, {
        selectionRef: CAPABILITY,
        expectedRevision: 1,
        idempotencyKey: "book_trip_rejected",
      }),
    ).rejects.toEqual(new StorefrontTripBookingError("storefront_trip_booking_pricing_unavailable"))
    expect(state.snapshots).toHaveLength(0)
    expect(state.bookingOperations).toHaveLength(0)
  })
})

interface State {
  envelope?: TripEnvelope
  access?: TripStorefrontAccess
  components: TripComponent[]
  nextComponent: number
  forceCasConflictRevision?: number
  snapshots: TripSnapshot[]
  bookingOperations: TripStorefrontBookingOperation[]
}

function emptyState(): State {
  return { components: [], nextComponent: 1, snapshots: [], bookingOperations: [] }
}

async function seededState(): Promise<State> {
  return {
    envelope: envelopeRow(),
    access: {
      envelopeId: "trip_storefront_1",
      capabilityDigest: await sha256Hex(CAPABILITY),
      storefrontId: CONTEXT.storefrontId,
      channelId: CONTEXT.channelId,
      marketId: SCOPE.marketId,
      locale: SCOPE.locale,
      currency: SCOPE.currency,
      ownerUserId: CONTEXT.userId,
      ownerBuyerAccountId: CONTEXT.buyerAccountId,
      revision: 1,
      expiresAt: new Date("2026-09-01T00:00:00.000Z"),
      createdAt: NOW,
      updatedAt: NOW,
    },
    components: [
      componentRow({
        id: "trip_component_internal_1",
        metadata: {
          storefrontSelection: {
            version: 1,
            itemRef: ITEM_ONE,
            kind: "product",
            quantity: 1,
          },
        },
      }),
    ],
    nextComponent: 2,
    snapshots: [],
    bookingOperations: [],
  }
}

async function pricedState(): Promise<State> {
  const state = await seededState()
  state.access = {
    ...(state.access as TripStorefrontAccess),
    ownerUserId: null,
    ownerBuyerAccountId: null,
  }
  state.components[0] = componentRow({
    ...state.components[0],
    status: "priced",
    pricingSnapshot: {
      currency: "EUR",
      subtotalAmountCents: 10_000,
      taxAmountCents: 1_900,
      totalAmountCents: 11_900,
    },
  })
  return state
}

function createDb(state: State): AnyDrizzleDb {
  const db = {
    transaction: async (operation: (transaction: unknown) => unknown) => operation(db),
    insert: (table: unknown) => ({
      values: (values: Record<string, unknown>) => {
        const returning = async () => {
          if (table === tripEnvelopes) {
            state.envelope = { ...envelopeRow(), ...(values as Partial<TripEnvelope>) }
            return [state.envelope]
          }
          if (table === tripStorefrontAccess) {
            state.access = {
              envelopeId: state.envelope?.id ?? "trip_storefront_1",
              capabilityDigest: "",
              storefrontId: "",
              channelId: "",
              marketId: "",
              locale: "",
              currency: "",
              ownerUserId: null,
              ownerBuyerAccountId: null,
              revision: 1,
              expiresAt: NOW,
              createdAt: NOW,
              updatedAt: NOW,
              ...(values as Partial<TripStorefrontAccess>),
            } as TripStorefrontAccess
            return [state.access]
          }
          if (table === tripComponents) {
            const component = componentRow({
              ...(values as Partial<TripComponent>),
              id: `trip_component_internal_${state.nextComponent++}`,
            })
            state.components.push(component)
            return [component]
          }
          if (table === tripSnapshots) {
            const snapshot = {
              id: `trip_snapshots_${state.snapshots.length + 1}`,
              createdAt: NOW,
              ...values,
            } as TripSnapshot
            state.snapshots.push(snapshot)
            return [snapshot]
          }
          if (table === tripStorefrontBookingOperations) {
            const existing = state.bookingOperations.find(
              (operation) => operation.operationDigest === values.operationDigest,
            )
            if (existing) return []
            const operation = {
              snapshotId: null,
              bookingSessionId: null,
              outcome: null,
              createdAt: NOW,
              updatedAt: NOW,
              ...values,
            } as TripStorefrontBookingOperation
            state.bookingOperations.push(operation)
            return [operation]
          }
          return []
        }
        return {
          returning,
          onConflictDoNothing: () => ({ returning }),
        }
      },
    }),
    select: () => ({
      from: (table: unknown) => ({
        where: () => {
          const rows =
            table === tripStorefrontAccess
              ? state.access
                ? [state.access]
                : []
              : table === tripEnvelopes
                ? state.envelope
                  ? [state.envelope]
                  : []
                : table === tripComponents
                  ? state.components
                  : table === tripStorefrontBookingOperations
                    ? state.bookingOperations
                    : []
          return Object.assign(Promise.resolve(rows), {
            limit: async () => {
              if (table === tripStorefrontAccess) return state.access ? [state.access] : []
              if (table === tripEnvelopes) return state.envelope ? [state.envelope] : []
              if (table === tripComponents) {
                return state.components.length > 0 ? [state.components[0]] : []
              }
              if (table === tripStorefrontBookingOperations) {
                return state.bookingOperations.length > 0 ? [state.bookingOperations[0]] : []
              }
              return []
            },
            orderBy: async () =>
              table === tripComponents
                ? [...state.components].sort((left, right) => left.sequence - right.sequence)
                : [],
          })
        },
      }),
    }),
    update: (table: unknown) => ({
      set: (values: Record<string, unknown>) => ({
        where: () => ({
          returning: async () => {
            if (table === tripStorefrontAccess) {
              if (state.forceCasConflictRevision !== undefined) {
                state.access = {
                  ...(state.access as TripStorefrontAccess),
                  revision: state.forceCasConflictRevision,
                }
                state.forceCasConflictRevision = undefined
                return []
              }
              if (!state.access || state.access.revision !== Number(values.revision) - 1) return []
              state.access = { ...state.access, ...values }
              return [state.access]
            }
            if (table === tripComponents) {
              const component =
                values.sequence === undefined
                  ? state.components[0]
                  : [...state.components].reverse()[Number(values.sequence)]
              if (!component) return []
              Object.assign(component, values)
              return [component]
            }
            if (table === tripEnvelopes && state.envelope) {
              state.envelope = { ...state.envelope, ...(values as Partial<TripEnvelope>) }
              return [state.envelope]
            }
            if (table === tripStorefrontBookingOperations) {
              const operation = state.bookingOperations[0]
              if (!operation) return []
              Object.assign(operation, values)
              return [operation]
            }
            return []
          },
        }),
      }),
    }),
  }
  return db as AnyDrizzleDb
}

function transactional(state: State) {
  return async <T>(operation: (db: AnyDrizzleDb) => Promise<T>): Promise<T> => {
    const before = structuredClone(state)
    try {
      return await operation(createDb(state))
    } catch (error) {
      Object.assign(state, before)
      throw error
    }
  }
}

function bookingSessionRecord() {
  return {
    id: "booking_sessions_public_1",
    target: { kind: "managed_itinerary" as const },
    actorKind: "anonymous" as const,
    state: "active" as const,
    revision: 1,
    scope: { locale: "ro-RO", market: "market_ro", currency: "EUR" },
    expiresAt: "2026-08-08T10:30:00.000Z",
    createdAt: NOW.toISOString(),
    updatedAt: NOW.toISOString(),
  }
}

function envelopeRow(): TripEnvelope {
  return {
    id: "trip_storefront_1",
    status: "draft",
    title: null,
    description: null,
    travelerParty: {},
    constraints: {
      storefrontScope: { marketId: "market_ro", locale: "ro-RO", currency: "EUR" },
      storefrontResolvedScope: SCOPE,
    },
    aggregateCurrency: null,
    aggregateSubtotalAmountCents: null,
    aggregateTaxAmountCents: null,
    aggregateTotalAmountCents: null,
    aggregatePricingSnapshot: null,
    currentPriceExpiresAt: null,
    bookingGroupId: null,
    orderId: null,
    paymentSessionId: null,
    reserveIdempotencyKey: null,
    reserveStartedAt: null,
    reservedAt: null,
    checkoutIdempotencyKey: null,
    checkoutStartedAt: null,
    createdBy: `storefront:${CONTEXT.storefrontId}:customer:${CONTEXT.userId}`,
    updatedBy: `storefront:${CONTEXT.storefrontId}:customer:${CONTEXT.userId}`,
    createdAt: NOW,
    updatedAt: NOW,
  }
}

function componentRow(overrides: Partial<TripComponent>): TripComponent {
  return {
    id: "trip_component_internal_1",
    envelopeId: "trip_storefront_1",
    sequence: 0,
    kind: "catalog_booking",
    status: "draft",
    title: null,
    description: null,
    entityModule: null,
    entityId: null,
    sourceKind: null,
    sourceConnectionId: null,
    sourceRef: null,
    bookingDraftId: null,
    catalogQuoteId: null,
    bookingId: null,
    bookingGroupId: null,
    orderId: null,
    paymentSessionId: null,
    providerRef: null,
    supplierRef: null,
    componentCurrency: null,
    componentSubtotalAmountCents: null,
    componentTaxAmountCents: null,
    componentTotalAmountCents: null,
    pricingSnapshot: null,
    taxLines: [],
    cancellationSnapshot: null,
    holdToken: null,
    holdExpiresAt: null,
    priceExpiresAt: null,
    warningCodes: [],
    metadata: {},
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  }
}
