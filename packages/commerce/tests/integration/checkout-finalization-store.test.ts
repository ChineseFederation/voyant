import { eq, sql } from "drizzle-orm"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"

import {
  ensureCheckoutFinalization,
  getCheckoutFinalization,
  getCheckoutFinalizationDelivery,
  withCheckoutFinalizationLock,
} from "../../src/checkout/finalization-store.js"
import {
  checkoutFinalizationDeliveries,
  checkoutFinalizations,
} from "../../src/checkout/schema-finalizations.js"
import { createCommerceRuntime } from "../../src/runtime.js"

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL
const DB_AVAILABLE = !!TEST_DATABASE_URL

describe.skipIf(!DB_AVAILABLE)("checkout finalization store", () => {
  let db: ReturnType<typeof import("@voyant-travel/db/test-utils").createTestDb>

  beforeAll(async () => {
    const { createTestDb } = await import("@voyant-travel/db/test-utils")
    db = createTestDb()
  })

  beforeEach(async () => {
    await db.execute(sql`TRUNCATE checkout_finalization_deliveries, checkout_finalizations CASCADE`)
  })

  afterAll(async () => {
    const { closeTestDb } = await import("@voyant-travel/db/test-utils")
    await closeTestDb()
  })

  it("commits an early finalization checkpoint when a later saga step fails", async () => {
    const identity = {
      bookingId: "booking_checkpoint_survives",
      paymentSessionId: "session_checkpoint_survives",
    }
    const hostTransaction = vi.fn(
      async <T>(_bindings: unknown, operation: (database: unknown) => Promise<T>): Promise<T> =>
        db.transaction((tx) => operation(tx)),
    )
    const runtime = createCommerceRuntime({
      primitives: {
        env: () => ({}),
        database: {
          resolve: () => db,
          fromContext: () => db,
          transaction: hostTransaction,
        },
      },
      inventoryPolicy: { createPaymentPolicyRuntime: () => ({}) },
      settings: {},
      inventory: {},
      legal: {},
      catalog: {},
      publication: {},
      distribution: {},
      accommodations: {},
      cruises: {},
    } as never)

    await expect(
      runtime.checkoutDatabase.withDb({}, async (resolvedDb) => {
        await ensureCheckoutFinalization(resolvedDb, identity)
        throw new Error("injected failure after checkpoint")
      }),
    ).rejects.toThrow("injected failure after checkpoint")

    await expect(getCheckoutFinalization(db, identity.bookingId)).resolves.toMatchObject({
      bookingId: identity.bookingId,
      triggerPaymentSessionId: identity.paymentSessionId,
    })
    await expect(
      getCheckoutFinalizationDelivery(db, identity.paymentSessionId),
    ).resolves.toMatchObject(identity)
    expect(hostTransaction).not.toHaveBeenCalled()
  })

  it("does not deadlock finance rows against the legal booking advisory lock", async () => {
    const identity = {
      bookingId: "booking_lock_order",
      paymentSessionId: "session_lock_order",
    }
    await ensureCheckoutFinalization(db, identity)

    await withConcurrentDbClients(async (checkoutDb, bookingConfirmedDb) => {
      const hostTransaction = vi.fn(
        async <T>(
          _bindings: unknown,
          operation: (database: PostgresJsDatabase) => Promise<T>,
        ): Promise<T> => checkoutDb.transaction((tx) => operation(tx)),
      )
      const runtime = createTestCommerceRuntime(checkoutDb, hostTransaction)
      const legalLockKey = `legal:booking-confirmed:${identity.bookingId}`
      let rowLocked = () => {}
      const checkoutHasRowLock = new Promise<void>((resolve) => {
        rowLocked = resolve
      })
      let advisoryLocked = () => {}
      const bookingConfirmedHasAdvisoryLock = new Promise<void>((resolve) => {
        advisoryLocked = resolve
      })

      const paymentCompleted = runtime.checkoutDatabase.withDb({}, async (resolvedDb) => {
        await resolvedDb.transaction(async (tx) => {
          await tx.execute(sql`
            UPDATE checkout_finalizations
            SET revision = revision + 1
            WHERE booking_id = ${identity.bookingId}
          `)
          rowLocked()
          await bookingConfirmedHasAdvisoryLock
        })
        await resolvedDb.transaction(async (tx) => {
          await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${legalLockKey}))`)
        })
      })
      const bookingConfirmed = bookingConfirmedDb.transaction(async (tx) => {
        await checkoutHasRowLock
        await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${legalLockKey}))`)
        advisoryLocked()
        await tx.execute(sql`
          UPDATE checkout_finalizations
          SET revision = revision + 1
          WHERE booking_id = ${identity.bookingId}
        `)
      })

      await expect(Promise.all([paymentCompleted, bookingConfirmed])).resolves.toEqual([
        undefined,
        undefined,
      ])
      expect(hostTransaction).not.toHaveBeenCalled()
    })
  })

  it("serializes distinct payment-session deliveries on one booking authority row", async () => {
    const firstIdentity = { bookingId: "booking_overlap", paymentSessionId: "session_overlap_1" }
    const secondIdentity = { bookingId: "booking_overlap", paymentSessionId: "session_overlap_2" }
    await Promise.all([
      ensureCheckoutFinalization(db, firstIdentity),
      ensureCheckoutFinalization(db, secondIdentity),
    ])

    let releaseFirst = () => {}
    const firstCanFinish = new Promise<void>((resolve) => {
      releaseFirst = resolve
    })
    let firstEntered = () => {}
    const firstDidEnter = new Promise<void>((resolve) => {
      firstEntered = resolve
    })
    const order: string[] = []
    const first = withCheckoutFinalizationLock(db, firstIdentity, async () => {
      order.push("first-enter")
      firstEntered()
      await firstCanFinish
      order.push("first-exit")
    })
    await firstDidEnter

    const second = withCheckoutFinalizationLock(db, secondIdentity, async () => {
      order.push("second-enter")
    })
    await new Promise<void>((resolve) => setImmediate(resolve))
    expect(order).toEqual(["first-enter"])

    releaseFirst()
    await Promise.all([first, second])
    expect(order).toEqual(["first-enter", "first-exit", "second-enter"])

    const authorityRows = await db
      .select()
      .from(checkoutFinalizations)
      .where(eq(checkoutFinalizations.bookingId, "booking_overlap"))
    const deliveryRows = await db
      .select()
      .from(checkoutFinalizationDeliveries)
      .where(eq(checkoutFinalizationDeliveries.bookingId, "booking_overlap"))
    expect(authorityRows).toHaveLength(1)
    expect(deliveryRows).toHaveLength(2)
  })
})

function createTestCommerceRuntime(
  db: PostgresJsDatabase,
  transaction: <T>(
    bindings: unknown,
    operation: (database: PostgresJsDatabase) => Promise<T>,
  ) => Promise<T>,
) {
  return createCommerceRuntime({
    primitives: {
      env: () => ({}),
      database: {
        resolve: () => db,
        fromContext: () => db,
        transaction,
      },
    },
    inventoryPolicy: { createPaymentPolicyRuntime: () => ({}) },
    settings: {},
    inventory: {},
    legal: {},
    catalog: {},
    publication: {},
    distribution: {},
    accommodations: {},
    cruises: {},
  } as never)
}

async function withConcurrentDbClients<T>(
  run: (checkoutDb: PostgresJsDatabase, bookingConfirmedDb: PostgresJsDatabase) => Promise<T>,
) {
  const { createDbClient } = await import("@voyant-travel/db")
  const databaseUrl = process.env.TEST_DATABASE_URL
  if (!databaseUrl) throw new Error("TEST_DATABASE_URL is required for concurrent DB clients.")
  const checkoutDb = createDbClient(databaseUrl, {
    adapter: "node",
    nodeMaxConnections: 1,
    timeouts: { statementMs: false, queryMs: false, connectMs: false },
  }) as PostgresJsDatabaseWithClient
  const bookingConfirmedDb = createDbClient(databaseUrl, {
    adapter: "node",
    nodeMaxConnections: 1,
    timeouts: { statementMs: false, queryMs: false, connectMs: false },
  }) as PostgresJsDatabaseWithClient
  try {
    return await run(checkoutDb, bookingConfirmedDb)
  } finally {
    await Promise.all([
      checkoutDb.$client?.end?.({ timeout: 0 }),
      bookingConfirmedDb.$client?.end?.({ timeout: 0 }),
    ])
  }
}

type PostgresJsDatabaseWithClient = PostgresJsDatabase & {
  $client?: {
    end?: (options?: { timeout?: number | null }) => Promise<unknown>
  }
}
