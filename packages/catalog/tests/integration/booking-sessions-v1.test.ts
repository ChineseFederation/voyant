import { createDbClient } from "@voyant-travel/db"
import { newId } from "@voyant-travel/db/lib/typeid"
import {
  applyPaymentAdapterCallbackEvent,
  createOrReuseBookingSessionPayment,
  expirePendingBookingSessionPayments,
  transferBookingSessionPaymentToBooking,
} from "@voyant-travel/finance"
import { paymentSessions } from "@voyant-travel/finance/schema"
import { eq, sql } from "drizzle-orm"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import {
  bookingAllocationsRef,
  bookingItemsRef,
  bookingsRef,
} from "../../src/booking-engine/bookings-ref.js"
import { createSourceAdapterRegistry } from "../../src/booking-engine/registry.js"
import { createDrizzleBookingSessionRepository } from "../../src/booking-engine/sessions-drizzle.js"
import { inMemoryBookingRequirements } from "../../src/booking-engine/sessions-memory.js"
import {
  bookingSessionAuditEventsTable,
  bookingSessionCommitsTable,
  bookingSessionHoldsTable,
  bookingSessionOperationsTable,
  bookingSessionQuotesTable,
  bookingSessionsTable,
} from "../../src/booking-engine/sessions-schema.js"
import {
  type BookingSessionPaymentPorts,
  type CommitOwnedBookingInput,
  createBookingSessionModule,
} from "../../src/booking-engine/sessions-service.js"
import { createSupplierOperationWorkflow } from "../../src/booking-engine/supplier-operation-workflow.js"
import { createDrizzleSupplierOperationRepository } from "../../src/booking-engine/supplier-operations.js"
import { supplierOperationsTable } from "../../src/booking-engine/supplier-operations-schema.js"

const DB_AVAILABLE = Boolean(process.env.TEST_DATABASE_URL)
const ACCESS = {
  actorKind: "anonymous" as const,
  capability: "bcap_postgres_booking_session_capability_1234567890",
  publicApiOrigin: { channelId: "chan_pg" },
}
/**
 * A customer acts as a Buyer Account, not as a bare principal. A personal
 * account's id is `personal:<principal>` by construction, and the Session rules
 * check that pairing rather than trusting either half on its own.
 */
function customerAccess(principalId: string, extra: { capability?: string } = {}) {
  return {
    actorKind: "customer" as const,
    principalId,
    buyerAccountId: `personal:${principalId}`,
    buyerAccountKind: "personal" as const,
    publicApiOrigin: ACCESS.publicApiOrigin,
    ...extra,
  }
}

const REQUIREMENTS = inMemoryBookingRequirements()
const PRICING = {
  currency: "EUR",
  lines: [],
  taxes: [],
  subtotal: 10_000,
  taxTotal: 0,
  total: 10_000,
}

type ConcurrentTestDb = PostgresJsDatabase & {
  $client?: { end?: (options?: { timeout?: number | null }) => Promise<unknown> }
}

describe.skipIf(!DB_AVAILABLE)("Booking Session v1 PostgreSQL invariants", () => {
  let db: ConcurrentTestDb

  beforeAll(() => {
    db = createDbClient(process.env.TEST_DATABASE_URL ?? "", {
      adapter: "node",
      nodeMaxConnections: 4,
      timeouts: { statementMs: false, queryMs: false, connectMs: false },
    }) as ConcurrentTestDb
  })

  beforeEach(async () => {
    await resetTables(db)
  })

  afterAll(async () => {
    await db.$client?.end?.({ timeout: 0 })
  })

  it("replays concurrent create and mutation keys without unique errors", async () => {
    const repository = createDrizzleBookingSessionRepository(db)
    const module = createModule(repository, async () => {
      throw new Error("Commit is not used by this test")
    })
    const createInput = {
      idempotencyKey: "postgres_create_race",
      target: { kind: "product" as const, productId: "prod_pg_session" },
      selection: { configure: { pax: { adult: 1 } } },
    }

    const [first, replay] = await Promise.all([
      module.createSession(createInput, ACCESS),
      module.createSession(createInput, ACCESS),
    ])
    expect(first).toMatchObject({ kind: "session_created" })
    expect(replay).toMatchObject({ kind: "session_created" })
    if (first.kind !== "session_created" || replay.kind !== "session_created") return
    expect(replay.session.id).toBe(first.session.id)

    const updateInput = {
      idempotencyKey: "postgres_update_race",
      expectedRevision: first.session.revision,
      selection: { configure: { pax: { adult: 2 } } },
    }
    const updates = await Promise.all([
      module.updateSession(first.session.id, updateInput, ACCESS),
      module.updateSession(first.session.id, updateInput, ACCESS),
    ])
    expect(updates).toEqual([
      expect.objectContaining({
        kind: "session_updated",
        session: expect.objectContaining({ revision: 2 }),
      }),
      expect.objectContaining({
        kind: "session_updated",
        session: expect.objectContaining({ revision: 2 }),
      }),
    ])

    await expect(db.select().from(bookingSessionsTable)).resolves.toHaveLength(1)
    await expect(db.select().from(bookingSessionOperationsTable)).resolves.toHaveLength(1)
  })

  it.each([
    { label: "same key", keys: ["postgres_commit_same", "postgres_commit_same"] },
    { label: "different keys", keys: ["postgres_commit_a", "postgres_commit_b"] },
  ])("creates one Booking and Allocation under concurrent $label Commit", async ({ keys }) => {
    let entrants = 0
    let releaseEntrants: (() => void) | undefined
    const bothEntered = new Promise<void>((resolve) => {
      releaseEntrants = resolve
    })
    const repository = createDrizzleBookingSessionRepository(db)
    const module = createModule(repository, async (input) =>
      db.transaction(async (tx) => {
        const graph = await insertBookingGraph(tx as PostgresJsDatabase)
        entrants += 1
        if (entrants === 2) releaseEntrants?.()
        await bothEntered
        await input.consumeSources(tx, graph.bookingId, [graph.allocationId])
        return { bookingId: graph.bookingId, allocationIds: [graph.allocationId] }
      }),
    )
    const prepared = await createQuoteAndHold(module)
    const commitInput = (idempotencyKey: string) => ({
      expectedRevision: prepared.session.revision,
      quoteId: prepared.quote.id,
      requirementsFingerprint: prepared.quote.requirementsFingerprint,
      holdId: prepared.hold.id,
      idempotencyKey,
    })

    const outcomes = await Promise.all([
      module.commitSession(prepared.session.id, commitInput(keys[0] ?? ""), ACCESS),
      module.commitSession(prepared.session.id, commitInput(keys[1] ?? ""), ACCESS),
    ])

    expect(outcomes.filter(isCommitted)).toHaveLength(1)
    if (keys[0] === keys[1]) {
      expect(outcomes.filter(isReplay)).toHaveLength(1)
    } else {
      expect(outcomes.filter(isAlreadyConsumed)).toHaveLength(1)
    }
    await expect(db.select().from(bookingsRef)).resolves.toHaveLength(1)
    await expect(db.select().from(bookingItemsRef)).resolves.toHaveLength(1)
    await expect(db.select().from(bookingAllocationsRef)).resolves.toHaveLength(1)
    await expect(db.select().from(bookingSessionCommitsTable)).resolves.toHaveLength(1)
  })

  it("rolls back Booking graph and Session consumption after an injected post-allocation fault", async () => {
    const repository = createDrizzleBookingSessionRepository(db)
    const module = createModule(repository, async (input) =>
      db.transaction(async (tx) => {
        const graph = await insertBookingGraph(tx as PostgresJsDatabase)
        await input.consumeSources(tx, graph.bookingId, [graph.allocationId])
        throw new Error("fault_after_booking_item_allocation")
      }),
    )
    const prepared = await createQuoteAndHold(module)

    await expect(
      module.commitSession(
        prepared.session.id,
        {
          expectedRevision: prepared.session.revision,
          quoteId: prepared.quote.id,
          requirementsFingerprint: prepared.quote.requirementsFingerprint,
          holdId: prepared.hold.id,
          idempotencyKey: "postgres_commit_fault",
        },
        ACCESS,
      ),
    ).rejects.toThrow("fault_after_booking_item_allocation")

    await expect(db.select().from(bookingsRef)).resolves.toHaveLength(0)
    await expect(db.select().from(bookingItemsRef)).resolves.toHaveLength(0)
    await expect(db.select().from(bookingAllocationsRef)).resolves.toHaveLength(0)
    await expect(db.select().from(bookingSessionCommitsTable)).resolves.toHaveLength(0)
    await expect(db.select().from(bookingSessionsTable)).resolves.toEqual([
      expect.objectContaining({ id: prepared.session.id, state: "active" }),
    ])
    await expect(db.select().from(bookingSessionQuotesTable)).resolves.toEqual([
      expect.objectContaining({ id: prepared.quote.id, state: "active" }),
    ])
    await expect(db.select().from(bookingSessionHoldsTable)).resolves.toEqual([
      expect.objectContaining({ id: prepared.hold.id, state: "active" }),
    ])
  })

  it("serializes active supplier intents and permits a replacement after refusal", async () => {
    const sessions = createDrizzleBookingSessionRepository(db)
    const module = createBookingSessionModule({
      ports: {
        repository: sessions,
        normalizeSelection: async ({ selection }) => selection,
        composeRequirements: async () => ({ status: "available", requirements: REQUIREMENTS }),
        composeQuote: async () => ({
          status: "quoted",
          requirements: REQUIREMENTS,
          pricing: PRICING,
        }),
        placeCapacityHold: async () => "unavailable",
        releaseCapacityHold: async () => {},
        commitOwnedBooking: async () => {
          throw new Error("owned commit is not used")
        },
      },
    })
    const created = await module.createSession(
      {
        idempotencyKey: "postgres_supplier_session",
        target: { kind: "catalog_item", catalogItemId: "crus_pg_supplier" },
      },
      ACCESS,
    )
    if (created.kind !== "session_created") throw new Error("session not created")
    const quoted = await module.quoteSession(
      created.session.id,
      { expectedRevision: created.session.revision, idempotencyKey: "postgres_supplier_quote" },
      ACCESS,
    )
    if (quoted.kind !== "quote_created") throw new Error("quote not created")

    let reservationCalls = 0
    const registry = createSourceAdapterRegistry()
    registry.register("conn_pg_supplier", {
      kind: "cruise:postgres",
      capabilities: {
        verticals: ["cruises"],
        supportsLiveResolution: true,
        supportsDriftDetection: false,
        supportsBookingForwarding: true,
        postBookOperations: ["status"],
      },
      async reserve() {
        reservationCalls += 1
        return reservationCalls === 1
          ? { upstream_ref: "PG-UPSTREAM-1", status: "pending" }
          : { upstream_ref: "PG-UPSTREAM-2", status: "confirmed" }
      },
    })
    const supplierOperations = createDrizzleSupplierOperationRepository(db)
    const workflow = createSupplierOperationWorkflow({
      repository: supplierOperations,
      registry,
    })
    const base = {
      sessionId: created.session.id,
      quoteId: quoted.quote.id,
      requestFingerprint: "postgres_supplier_fingerprint",
      entityModule: "cruises",
      entityId: "crus_pg_supplier",
      sourceKind: "cruise:postgres",
      sourceConnectionId: "conn_pg_supplier",
      sourceRef: "upstream-cruise",
      request: {
        entity_module: "cruises",
        entity_id: "crus_pg_supplier",
        parameters: {},
      },
      adapterContext: { connection_id: "conn_pg_supplier" },
      now: new Date("2026-08-02T10:00:00.000Z"),
    }
    const outcomes = await Promise.all([
      workflow.dispatch({ ...base, commitIdempotencyKey: "postgres_supplier_commit_a" }),
      workflow.dispatch({ ...base, commitIdempotencyKey: "postgres_supplier_commit_b" }),
    ])

    expect(outcomes.filter((outcome) => outcome.kind === "pending")).toHaveLength(1)
    expect(outcomes.filter((outcome) => outcome.kind === "idempotency_conflict")).toHaveLength(1)
    expect(reservationCalls).toBe(1)
    await expect(db.select().from(supplierOperationsTable)).resolves.toHaveLength(1)

    const firstOperation = await supplierOperations.getBySession(created.session.id)
    if (!firstOperation) throw new Error("supplier operation not created")
    firstOperation.state = "refused"
    firstOperation.upstreamStatus = "failed"
    firstOperation.resolvedAt = new Date("2026-08-02T10:01:00.000Z")
    firstOperation.updatedAt = firstOperation.resolvedAt
    firstOperation.nextReconcileAt = undefined
    await supplierOperations.save(firstOperation)

    await expect(
      workflow.dispatch({
        ...base,
        commitIdempotencyKey: "postgres_supplier_commit_alternative",
        requestFingerprint: "postgres_supplier_fingerprint_alternative",
        now: new Date("2026-08-02T10:02:00.000Z"),
      }),
    ).resolves.toMatchObject({
      kind: "secured",
      operation: { upstreamRef: "PG-UPSTREAM-2", state: "succeeded" },
    })
    expect(reservationCalls).toBe(2)
    await expect(db.select().from(supplierOperationsTable)).resolves.toHaveLength(2)
  })

  it("continues a paid Session into exactly one Booking under a concurrent Commit retry", async () => {
    const repository = createDrizzleBookingSessionRepository(db)
    const payments: BookingSessionPaymentPorts = {
      async prepare({ session }) {
        const [payment] = await db
          .select()
          .from(paymentSessions)
          .where(eq(paymentSessions.targetId, session.id))
          .limit(1)
        if (!payment || (payment.status !== "authorized" && payment.status !== "paid")) {
          throw new Error("Expected an established Session payment")
        }
        return { kind: "established", paymentSessionId: payment.id }
      },
      async transferToBooking({ tx, ...input }) {
        await transferBookingSessionPaymentToBooking(tx as PostgresJsDatabase, input)
      },
      async expirePending({ tx, bookingSessionId, at }) {
        await expirePendingBookingSessionPayments(tx as PostgresJsDatabase, bookingSessionId, at)
      },
    }
    const module = createModule(
      repository,
      async (input) =>
        db.transaction(async (tx) => {
          const graph = await insertBookingGraph(tx as PostgresJsDatabase)
          await input.consumeSources(tx, graph.bookingId, [graph.allocationId])
          return { bookingId: graph.bookingId, allocationIds: [graph.allocationId] }
        }),
      payments,
    )
    const prepared = await createQuoteAndHold(module)
    const payment = await createOrReuseBookingSessionPayment(db, {
      bookingSessionId: prepared.session.id,
      commitIdempotencyKey: "postgres_paid_continuation",
      amountCents: PRICING.total,
      currency: PRICING.currency,
    })
    if (!payment) throw new Error("Payment Session was not created")
    await applyPaymentAdapterCallbackEvent(db, {
      eventId: "evt_postgres_paid_continuation",
      paymentSessionId: payment.id,
      nextState: "paid",
      occurredAt: "2026-08-01T12:00:00.000Z",
      processorSessionId: "processor_postgres_paid_continuation",
      processorPaymentId: "payment_postgres_paid_continuation",
      idempotencyKey: "callback_postgres_paid_continuation",
    })
    const input = {
      expectedRevision: prepared.session.revision,
      quoteId: prepared.quote.id,
      requirementsFingerprint: prepared.quote.requirementsFingerprint,
      holdId: prepared.hold.id,
      idempotencyKey: "postgres_paid_commit",
    }

    const outcomes = await Promise.all([
      module.commitSession(prepared.session.id, input, ACCESS),
      module.commitSession(prepared.session.id, input, ACCESS),
    ])

    expect(outcomes.filter(isCommitted)).toHaveLength(1)
    expect(outcomes.filter(isReplay)).toHaveLength(1)
    const [booking] = await db.select().from(bookingsRef)
    await expect(db.select().from(paymentSessions)).resolves.toEqual([
      expect.objectContaining({
        id: payment.id,
        targetType: "booking",
        targetId: booking?.id,
        bookingId: booking?.id,
      }),
    ])
  })

  it("serializes customer adoption, revokes the capability, and persists read audit", async () => {
    const repository = createDrizzleBookingSessionRepository(db)
    const module = createModule(repository, async () => {
      throw new Error("Commit is not used by this test")
    })
    const created = await module.createSession(
      {
        idempotencyKey: "postgres_adoption_create",
        target: { kind: "product", productId: "prod_pg_session" },
        selection: { travelers: [{ firstName: "Ada" }] },
      },
      ACCESS,
    )
    if (created.kind !== "session_created") throw new Error("Session was not created")

    const [first, second] = await Promise.all([
      module.adoptSession(
        created.session.id,
        { expectedRevision: 1, idempotencyKey: "postgres_adopt_one" },
        customerAccess("customer_pg_1", { capability: ACCESS.capability }),
      ),
      module.adoptSession(
        created.session.id,
        { expectedRevision: 1, idempotencyKey: "postgres_adopt_two" },
        customerAccess("customer_pg_2", { capability: ACCESS.capability }),
      ),
    ])
    expect([first.kind, second.kind].sort()).toEqual(["rejected", "session_adopted"])
    const winningPrincipal = first.kind === "session_adopted" ? "customer_pg_1" : "customer_pg_2"

    await expect(db.select().from(bookingSessionsTable)).resolves.toEqual([
      expect.objectContaining({
        actorKind: "customer",
        ownerPrincipalId: winningPrincipal,
        ownerBuyerAccountId: `personal:${winningPrincipal}`,
        ownerBuyerAccountKind: "personal",
        capabilityHash: null,
        capabilityScopes: [],
        channelId: "chan_pg",
        revision: 2,
      }),
    ])
    await expect(module.resumeSession(created.session.id, ACCESS)).resolves.toMatchObject({
      kind: "rejected",
      error: { kind: "not_authorized" },
    })
    await expect(
      module.resumeSession(created.session.id, customerAccess(winningPrincipal)),
    ).resolves.toMatchObject({ kind: "session_resumed", session: { redaction: "none" } })
    await expect(db.select().from(bookingSessionAuditEventsTable)).resolves.toEqual([
      expect.objectContaining({ action: "adopt", principalId: winningPrincipal }),
      expect.objectContaining({ action: "read", principalId: winningPrincipal }),
    ])
  })
})

function createModule(
  repository: ReturnType<typeof createDrizzleBookingSessionRepository>,
  commitOwnedBooking: (input: CommitOwnedBookingInput) => Promise<{
    bookingId: string
    allocationIds: string[]
  }>,
  payments?: BookingSessionPaymentPorts,
) {
  return createBookingSessionModule({
    ports: {
      repository,
      normalizeSelection: async ({ selection }) => structuredClone(selection),
      composeRequirements: async () => ({ status: "available", requirements: REQUIREMENTS }),
      composeQuote: async () => ({
        status: "quoted",
        requirements: REQUIREMENTS,
        pricing: PRICING,
      }),
      placeCapacityHold: async () => "held",
      releaseCapacityHold: async () => {},
      commitOwnedBooking,
      payments,
    },
  })
}

async function createQuoteAndHold(module: ReturnType<typeof createModule>) {
  const created = await module.createSession(
    {
      idempotencyKey: `postgres_prepare_${crypto.randomUUID()}`,
      target: { kind: "product", productId: "prod_pg_session" },
    },
    ACCESS,
  )
  if (created.kind !== "session_created") throw new Error("Session was not created")
  const quoted = await module.quoteSession(
    created.session.id,
    { expectedRevision: created.session.revision, idempotencyKey: "postgres_quote" },
    ACCESS,
  )
  if (quoted.kind !== "quote_created") throw new Error("Quote was not created")
  const held = await module.placeHold(
    created.session.id,
    {
      expectedRevision: created.session.revision,
      quoteId: quoted.quote.id,
      idempotencyKey: "postgres_hold",
    },
    ACCESS,
  )
  if (held.kind !== "hold_created") throw new Error("Hold was not created")
  return { session: created.session, quote: quoted.quote, hold: held.hold }
}

async function insertBookingGraph(db: PostgresJsDatabase) {
  const bookingId = newId("bookings")
  const bookingItemId = newId("booking_items")
  const allocationId = newId("booking_allocations")
  await db.insert(bookingsRef).values({
    id: bookingId,
    bookingNumber: `PG-${bookingId}`,
    status: "confirmed",
    sellCurrency: "EUR",
  })
  await db.insert(bookingItemsRef).values({
    id: bookingItemId,
    bookingId,
    title: "PostgreSQL Booking Session proof",
    status: "confirmed",
    sellCurrency: "EUR",
  })
  await db.insert(bookingAllocationsRef).values({
    id: allocationId,
    bookingId,
    bookingItemId,
    quantity: 1,
    status: "confirmed",
  })
  return { bookingId, bookingItemId, allocationId }
}

async function resetTables(db: PostgresJsDatabase) {
  await db.execute(sql`
    TRUNCATE
      supplier_operations,
      booking_session_commits,
      booking_session_operations,
      booking_session_holds,
      booking_session_quotes,
      booking_sessions,
      payment_sessions,
      payment_captures,
      payment_authorizations,
      booking_allocations,
      booking_items,
      bookings
    CASCADE
  `)
}

function isCommitted(
  outcome: Awaited<ReturnType<ReturnType<typeof createModule>["commitSession"]>>,
) {
  return outcome.kind === "commit_result" && outcome.outcome.kind === "committed"
}

function isReplay(outcome: Awaited<ReturnType<ReturnType<typeof createModule>["commitSession"]>>) {
  return outcome.kind === "commit_result" && outcome.outcome.kind === "idempotent_replay"
}

function isAlreadyConsumed(
  outcome: Awaited<ReturnType<ReturnType<typeof createModule>["commitSession"]>>,
) {
  return outcome.kind === "rejected" && outcome.error.kind === "commit_already_consumed"
}
