import { createDbClient } from "@voyant-travel/db"
import { newId } from "@voyant-travel/db/lib/typeid"
import { sql } from "drizzle-orm"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import {
  bookingAllocationsRef,
  bookingItemsRef,
  bookingsRef,
} from "../../src/booking-engine/bookings-ref.js"
import { createDrizzleBookingSessionRepository } from "../../src/booking-engine/sessions-drizzle.js"
import {
  bookingSessionCommitsTable,
  bookingSessionHoldsTable,
  bookingSessionOperationsTable,
  bookingSessionQuotesTable,
  bookingSessionsTable,
} from "../../src/booking-engine/sessions-schema.js"
import {
  type CommitOwnedBookingInput,
  createBookingSessionModule,
} from "../../src/booking-engine/sessions-service.js"

const DB_AVAILABLE = Boolean(process.env.TEST_DATABASE_URL)
const ACCESS = {
  actorKind: "anonymous" as const,
  capability: "bcap_postgres_booking_session_capability_1234567890",
}
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
})

function createModule(
  repository: ReturnType<typeof createDrizzleBookingSessionRepository>,
  commitOwnedBooking: (input: CommitOwnedBookingInput) => Promise<{
    bookingId: string
    allocationIds: string[]
  }>,
) {
  return createBookingSessionModule({
    ports: {
      repository,
      normalizeSelection: async ({ selection }) => structuredClone(selection),
      composeQuote: async () => ({ status: "quoted", pricing: PRICING }),
      placeCapacityHold: async () => "held",
      releaseCapacityHold: async () => {},
      commitOwnedBooking,
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
      booking_session_commits,
      booking_session_operations,
      booking_session_holds,
      booking_session_quotes,
      booking_sessions,
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
