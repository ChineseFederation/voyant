import { newId } from "@voyant-travel/db/lib/typeid"
import { cleanupTestDb, createTestDb } from "@voyant-travel/db/test-utils"
import { availabilitySlots } from "@voyant-travel/operations/schema"
import { eq } from "drizzle-orm"
import { beforeAll, beforeEach, describe, expect, it } from "vitest"
import { products } from "../../../../inventory/src/schema.js"
import { updateSlot } from "../../../src/availability/service-core.js"

const DB_AVAILABLE = !!process.env.TEST_DATABASE_URL

/**
 * Verifies the `remaining_pax` recompute that the slot service now owns
 * (issue #1087, Codex review on PR #1088). The frontend no longer sends
 * `remainingPax` on edits; the service has to keep the running consumed
 * count when capacity changes, and ignore any caller-supplied value to
 * avoid stale-snapshot writes that overwrite concurrent hold / booking
 * flows.
 */
describe.skipIf(!DB_AVAILABLE)("updateSlot remaining_pax recompute", () => {
  // biome-ignore lint/suspicious/noExplicitAny: drizzle test client -- owner: availability; existing suppression is intentional pending typed cleanup.
  let db: any
  let productId: string

  beforeAll(() => {
    db = createTestDb()
  })

  beforeEach(async () => {
    await cleanupTestDb(db)
    productId = newId("products")
    await db.insert(products).values({
      id: productId,
      name: "Slot Remaining Pax Test Product",
      sellCurrency: "USD",
      bookingMode: "date",
    })
  })

  async function seed(initial: number, remaining: number, unlimited = false) {
    const id = newId("availability_slots")
    await db.insert(availabilitySlots).values({
      id,
      productId,
      dateLocal: "2026-06-01",
      startsAt: new Date("2026-06-01T08:00:00Z"),
      timezone: "UTC",
      status: "open",
      unlimited,
      initialPax: unlimited ? null : initial,
      remainingPax: unlimited ? null : remaining,
    })
    return id
  }

  async function read(id: string) {
    const [row] = await db
      .select()
      .from(availabilitySlots)
      .where(eq(availabilitySlots.id, id))
      .limit(1)
    return row
  }

  it("ignores client-supplied remainingPax to defeat stale-snapshot writes", async () => {
    // Operator opens the form when consumed=4 (initial=10, remaining=6).
    // While they edit, a hold expires server-side, releasing one seat —
    // the row now has remaining=7. Their save POSTs remainingPax=6, which
    // would roll back the release. The service must drop that field.
    const id = await seed(10, 7)
    await updateSlot(db, id, { remainingPax: 6 })
    const row = await read(id)
    expect(row.remainingPax).toBe(7)
  })

  it("recomputes remaining_pax when initialPax grows, preserving consumed", async () => {
    // 10/6 → 4 consumed. Operator bumps capacity to 15. New remaining = 11.
    const id = await seed(10, 6)
    await updateSlot(db, id, { initialPax: 15 })
    const row = await read(id)
    expect(row.initialPax).toBe(15)
    expect(row.remainingPax).toBe(11)
  })

  it("recomputes remaining_pax when initialPax shrinks, preserving consumed", async () => {
    // 10/6 → 4 consumed. Operator shrinks to 8. New remaining = 4.
    const id = await seed(10, 6)
    await updateSlot(db, id, { initialPax: 8 })
    const row = await read(id)
    expect(row.initialPax).toBe(8)
    expect(row.remainingPax).toBe(4)
  })

  it("clamps remaining_pax to 0 when new capacity falls below consumed", async () => {
    // 10/6 → 4 consumed. Operator shrinks below the consumed count: 3.
    // We don't go negative; the row lands at 0 and the operator has to
    // release allocations to recover headroom.
    const id = await seed(10, 6)
    await updateSlot(db, id, { initialPax: 3 })
    const row = await read(id)
    expect(row.initialPax).toBe(3)
    expect(row.remainingPax).toBe(0)
  })

  it("nulls remaining_pax when switching to unlimited", async () => {
    const id = await seed(10, 6)
    await updateSlot(db, id, { unlimited: true })
    const row = await read(id)
    expect(row.unlimited).toBe(true)
    expect(row.remainingPax).toBeNull()
  })

  it("leaves remaining_pax untouched when initialPax isn't in the patch", async () => {
    // Editing just the timezone shouldn't move remaining_pax at all —
    // that was the original #1087 corruption mode.
    const id = await seed(10, 6)
    await updateSlot(db, id, { timezone: "Europe/Bucharest" })
    const row = await read(id)
    expect(row.initialPax).toBe(10)
    expect(row.remainingPax).toBe(6)
    expect(row.timezone).toBe("Europe/Bucharest")
  })

  it("handles slots with no previous initial cap by treating them as zero-consumed", async () => {
    // Some legacy slots may have NULL initial/remaining. The recompute
    // should still terminate sensibly — consumed defaults to 0, so the
    // new remaining equals the new initial.
    const id = newId("availability_slots")
    await db.insert(availabilitySlots).values({
      id,
      productId,
      dateLocal: "2026-06-02",
      startsAt: new Date("2026-06-02T08:00:00Z"),
      timezone: "UTC",
      status: "open",
      unlimited: false,
      initialPax: null,
      remainingPax: null,
    })
    await updateSlot(db, id, { initialPax: 12 })
    const row = await read(id)
    expect(row.initialPax).toBe(12)
    expect(row.remainingPax).toBe(12)
  })
})
