import { eq } from "drizzle-orm"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"

import { customerSignals, people } from "../../src/schema.js"
import { customerSignalsService } from "../../src/service/customer-signals.js"

const DB_AVAILABLE = !!process.env.TEST_DATABASE_URL

describe.skipIf(!DB_AVAILABLE)("customerSignalsService", () => {
  // biome-ignore lint/suspicious/noExplicitAny: test db typing -- owner: crm; existing suppression is intentional pending typed cleanup.
  let db: any

  beforeAll(async () => {
    const { createTestDb, cleanupTestDb } = await import("@voyant-travel/db/test-utils")
    db = createTestDb()
    await cleanupTestDb(db)
  })

  beforeEach(async () => {
    const { cleanupTestDb } = await import("@voyant-travel/db/test-utils")
    await cleanupTestDb(db)
  })

  afterAll(async () => {
    const { closeTestDb } = await import("@voyant-travel/db/test-utils")
    await closeTestDb()
  })

  async function seedPerson(firstName = "Test") {
    const [row] = await db
      .insert(people)
      .values({ firstName, lastName: "Person", tags: [], status: "active" })
      .returning()
    return row
  }

  it("creates a signal with sensible defaults and returns the row", async () => {
    const person = await seedPerson("Ana")
    const created = await customerSignalsService.createCustomerSignal(db, {
      personId: person.id,
      kind: "notify",
      source: "website",
      tags: [],
    })
    expect(created?.id).toBeTruthy()
    expect(created?.status).toBe("new")
    expect(created?.priority).toBe("normal")
    expect(created?.kind).toBe("notify")
  })

  it("returns null when the person doesn't exist", async () => {
    const result = await customerSignalsService.createCustomerSignal(db, {
      personId: "pers_missing",
      kind: "wishlist",
      source: "website",
      tags: [],
    })
    expect(result).toBeNull()
  })

  it("accepts cross-module ids as plain text without enforcing FKs", async () => {
    const person = await seedPerson("Bob")
    const created = await customerSignalsService.createCustomerSignal(db, {
      personId: person.id,
      kind: "notify",
      source: "phone",
      productId: "prod_does_not_exist",
      optionUnitId: "ount_also_missing",
      tags: ["high-value"],
    })
    expect(created?.productId).toBe("prod_does_not_exist")
    expect(created?.optionUnitId).toBe("ount_also_missing")
    expect(created?.tags).toEqual(["high-value"])
  })

  it("listCustomerSignals filters by person, status, kind, and assignee", async () => {
    const a = await seedPerson("A")
    const b = await seedPerson("B")
    await customerSignalsService.createCustomerSignal(db, {
      personId: a.id,
      kind: "wishlist",
      source: "website",
      assignedToUserId: "user_1",
      tags: [],
    })
    await db.insert(customerSignals).values({
      personId: a.id,
      kind: "inquiry",
      source: "phone",
      status: "qualified",
      assignedToUserId: "user_2",
      tags: [],
    })
    await customerSignalsService.createCustomerSignal(db, {
      personId: b.id,
      kind: "wishlist",
      source: "website",
      tags: [],
    })

    const byPerson = await customerSignalsService.listCustomerSignals(db, {
      personId: a.id,
      limit: 50,
      offset: 0,
    })
    expect(byPerson.total).toBe(2)

    const byStatus = await customerSignalsService.listCustomerSignals(db, {
      status: "qualified",
      limit: 50,
      offset: 0,
    })
    expect(byStatus.data).toHaveLength(1)
    expect(byStatus.data[0]?.kind).toBe("inquiry")

    const byAssignee = await customerSignalsService.listCustomerSignals(db, {
      assignedToUserId: "user_1",
      limit: 50,
      offset: 0,
    })
    expect(byAssignee.data).toHaveLength(1)
    expect(byAssignee.data[0]?.kind).toBe("wishlist")

    const byKind = await customerSignalsService.listCustomerSignals(db, {
      kind: "wishlist",
      limit: 50,
      offset: 0,
    })
    expect(byKind.total).toBe(2)
  })

  it("listSignalsForPerson returns signals chronologically", async () => {
    const person = await seedPerson("Chrono")
    const first = await customerSignalsService.createCustomerSignal(db, {
      personId: person.id,
      kind: "notify",
      source: "website",
      notes: "first",
      tags: [],
    })
    const second = await customerSignalsService.createCustomerSignal(db, {
      personId: person.id,
      kind: "referral",
      source: "phone",
      notes: "second",
      tags: [],
    })
    if (!first || !second) throw new Error("seed failure")

    const list = await customerSignalsService.listSignalsForPerson(db, person.id)
    expect(list.map((row) => row.notes)).toEqual(["first", "second"])
  })

  it("resolveCustomerSignalToBooking sets the booking + status atomically", async () => {
    const person = await seedPerson("Resolver")
    const signal = await customerSignalsService.createCustomerSignal(db, {
      personId: person.id,
      kind: "referral",
      source: "form",
      tags: [],
    })
    if (!signal) throw new Error("seed failure")

    const resolved = await customerSignalsService.resolveCustomerSignalToBooking(
      db,
      signal.id,
      "book_pretend_id",
    )
    expect(resolved?.status).toBe("converted")
    expect(resolved?.resolvedBookingId).toBe("book_pretend_id")

    const refreshed = await customerSignalsService.getCustomerSignal(db, signal.id)
    expect(refreshed?.status).toBe("converted")
    expect(refreshed?.resolvedBookingId).toBe("book_pretend_id")
  })

  it("update + delete operate on a single signal", async () => {
    const person = await seedPerson("CRUD")
    const signal = await customerSignalsService.createCustomerSignal(db, {
      personId: person.id,
      kind: "wishlist",
      source: "website",
      tags: [],
    })
    if (!signal) throw new Error("seed failure")

    const updated = await customerSignalsService.updateCustomerSignal(db, signal.id, {
      status: "contacted",
      notes: "Called back",
      priority: "high",
    })
    expect(updated?.status).toBe("contacted")
    expect(updated?.priority).toBe("high")

    const deleted = await customerSignalsService.deleteCustomerSignal(db, signal.id)
    expect(deleted?.id).toBe(signal.id)
    expect(await customerSignalsService.getCustomerSignal(db, signal.id)).toBeNull()
  })

  it("cascades delete when the linked person is removed", async () => {
    const person = await seedPerson("Cascade")
    const signal = await customerSignalsService.createCustomerSignal(db, {
      personId: person.id,
      kind: "notify",
      source: "website",
      tags: [],
    })
    if (!signal) throw new Error("seed failure")

    await db.delete(people).where(eq(people.id, person.id))

    const remaining = await db
      .select()
      .from(customerSignals)
      .where(eq(customerSignals.id, signal.id))
    expect(remaining).toHaveLength(0)
  })
})
