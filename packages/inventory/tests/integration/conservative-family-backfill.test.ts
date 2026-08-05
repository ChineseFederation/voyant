// Migration coverage for the conservative legacy family backfill (voyant#4038)
// against a real Postgres instance. Proves — over a representative beta dataset
// that deliberately includes AMBIGUOUS rows — that the migration:
//   * never drops a Product (count is invariant);
//   * never loses a genuine capacity claim (availability slots survive);
//   * only assigns `tour` on the strong positive signal (itinerary days);
//   * leaves genuinely ambiguous rows unclassified so they surface in the
//     operator classification-review queue rather than being guessed.
//
// The migration is data-only, so it re-runs safely against the freshly seeded
// fixture here (cleanupTestDb truncates data, not schema). The raw SQL is read
// straight from the committed migration file so this test exercises the exact
// statement a deployment applies, not a paraphrase of it.
import { readFile } from "node:fs/promises"
import { cleanupTestDb, createTestDb } from "@voyant-travel/db/test-utils"
import { availabilitySlots } from "@voyant-travel/operations"
import { sql } from "drizzle-orm"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"
import { beforeAll, beforeEach, describe, expect, it } from "vitest"

import { STANDARD_PRODUCT_FAMILIES } from "../../src/classification.js"
import { productDays, productItineraries, products, productTypes } from "../../src/schema.js"
import { coreProductsService } from "../../src/service-core.js"

const DB_AVAILABLE = !!process.env.TEST_DATABASE_URL

const BACKFILL_SQL_URL = new URL(
  "../../migrations/20260804120000_conservative_family_backfill.sql",
  import.meta.url,
)

const TOUR = STANDARD_PRODUCT_FAMILIES.find((f) => f.code === "tour")!
const ACTIVITY = STANDARD_PRODUCT_FAMILIES.find((f) => f.code === "activity")!

describe.skipIf(!DB_AVAILABLE)("Conservative legacy family backfill (integration)", () => {
  let db: PostgresJsDatabase

  beforeAll(() => {
    db = createTestDb()
  })

  beforeEach(async () => {
    await cleanupTestDb(db)
    // Seed the two standard families the migration and fixture reference. The
    // seed migration inserts these, but cleanupTestDb truncates them, so the
    // fixture re-seeds with the same deterministic ids.
    await db.insert(productTypes).values([
      { id: TOUR.id, name: TOUR.name, code: TOUR.code, active: true },
      { id: ACTIVITY.id, name: ACTIVITY.name, code: ACTIVITY.code, active: true },
    ])
  })

  async function seedProduct(overrides: Partial<typeof products.$inferInsert>) {
    const [product] = await db
      .insert(products)
      .values({ name: "Beta product", sellCurrency: "EUR", status: "active", ...overrides })
      .returning()
    if (!product) throw new Error("failed to seed product")
    return product
  }

  async function seedItineraryDay(productId: string, dayNumber: number) {
    const [itinerary] = await db
      .insert(productItineraries)
      .values({ productId, name: "Main", isDefault: true })
      .returning()
    if (!itinerary) throw new Error("failed to seed itinerary")
    await db.insert(productDays).values({ itineraryId: itinerary.id, dayNumber })
  }

  async function runBackfillMigration() {
    const migration = await readFile(BACKFILL_SQL_URL, "utf8")
    await db.execute(sql.raw(migration))
  }

  it("backfills only the unambiguous rows and keeps every ambiguous row for review", async () => {
    // A — already a Tour, with an itinerary. Must stay Tour, untouched.
    const alreadyTour = await seedProduct({ name: "Istanbul Multi-day", productTypeId: TOUR.id })
    await seedItineraryDay(alreadyTour.id, 3)

    // B — NO family but HAS an itinerary of dated days: unambiguously a Tour.
    const legacyTour = await seedProduct({ name: "Bulgaria Day Tour", productTypeId: null })
    await seedItineraryDay(legacyTour.id, 1)

    // C — NO family, NO itinerary, NO explicit duration: genuinely ambiguous.
    const ambiguous = await seedProduct({ name: "Legacy mystery", productTypeId: null })

    // D — NO family but an explicit sub-day duration (a timed thing). Duration
    // resolves, but the family is still missing, so it must remain in the queue
    // and must NOT be guessed as a Tour (it has no itinerary).
    const timedNoFamily = await seedProduct({
      name: "Legacy timed",
      productTypeId: null,
      durationMinutes: 90,
    })

    // E — fully classified Activity. Must be untouched and absent from the queue.
    const activity = await seedProduct({
      name: "Cooking class",
      productTypeId: ACTIVITY.id,
      durationMinutes: 120,
    })

    // F — a Tour with a live capacity claim (an open availability slot). The
    // migration must not disturb the slot.
    await db.insert(availabilitySlots).values({
      productId: alreadyTour.id,
      dateLocal: "2035-06-01",
      startsAt: new Date("2035-06-01T09:00:00Z"),
      timezone: "UTC",
      status: "open",
    })

    const [{ count: beforeCount }] = (await db.execute(
      sql`select count(*)::int as count from products`,
    )) as unknown as [{ count: number }]
    const [{ count: slotsBefore }] = (await db.execute(
      sql`select count(*)::int as count from availability_slots`,
    )) as unknown as [{ count: number }]

    await runBackfillMigration()

    // No Product silently disappears; no capacity claim is lost.
    const [{ count: afterCount }] = (await db.execute(
      sql`select count(*)::int as count from products`,
    )) as unknown as [{ count: number }]
    const [{ count: slotsAfter }] = (await db.execute(
      sql`select count(*)::int as count from availability_slots`,
    )) as unknown as [{ count: number }]
    expect(afterCount).toBe(beforeCount)
    expect(slotsAfter).toBe(slotsBefore)

    const familyOf = async (id: string) => {
      const [row] = (await db.execute(
        sql`select product_type_id from products where id = ${id}`,
      )) as unknown as [{ product_type_id: string | null }]
      return row.product_type_id
    }

    // B was backfilled to Tour; A and E untouched; C and D left NULL.
    expect(await familyOf(legacyTour.id)).toBe(TOUR.id)
    expect(await familyOf(alreadyTour.id)).toBe(TOUR.id)
    expect(await familyOf(activity.id)).toBe(ACTIVITY.id)
    expect(await familyOf(ambiguous.id)).toBeNull()
    expect(await familyOf(timedNoFamily.id)).toBeNull()

    // The review queue surfaces exactly the two still-ambiguous rows.
    const pending = await coreProductsService.listProducts(db, {
      classificationReview: "pending",
      sortBy: "createdAt",
      sortDir: "desc",
      limit: 50,
      offset: 0,
    })
    const pendingIds = new Set(pending.data.map((p) => p.id))
    expect(pendingIds).toEqual(new Set([ambiguous.id, timedNoFamily.id]))
    expect(pending.total).toBe(2)

    // `missing_family` narrows to the two family-less rows; `unresolved_duration`
    // narrows to just the row with neither a duration nor an itinerary.
    const missingFamily = await coreProductsService.listProducts(db, {
      classificationReview: "missing_family",
      sortBy: "createdAt",
      sortDir: "desc",
      limit: 50,
      offset: 0,
    })
    expect(new Set(missingFamily.data.map((p) => p.id))).toEqual(
      new Set([ambiguous.id, timedNoFamily.id]),
    )

    const unresolvedDuration = await coreProductsService.listProducts(db, {
      classificationReview: "unresolved_duration",
      sortBy: "createdAt",
      sortDir: "desc",
      limit: 50,
      offset: 0,
    })
    expect(new Set(unresolvedDuration.data.map((p) => p.id))).toEqual(new Set([ambiguous.id]))

    // Every ambiguous row still carries its resolved review reasons in the read
    // model, so the queue row can explain itself.
    const ambiguousRow = pending.data.find((p) => p.id === ambiguous.id)
    expect(ambiguousRow?.classification.reviewReasons).toEqual([
      "missing_family",
      "unresolved_duration",
    ])
  })

  it("is idempotent — a second run changes nothing", async () => {
    const legacyTour = await seedProduct({ name: "Legacy tour", productTypeId: null })
    await seedItineraryDay(legacyTour.id, 2)

    await runBackfillMigration()
    const [firstRow] = (await db.execute(
      sql`select product_type_id from products where id = ${legacyTour.id}`,
    )) as unknown as [{ product_type_id: string | null }]
    expect(firstRow.product_type_id).toBe(TOUR.id)

    await runBackfillMigration()
    const [secondRow] = (await db.execute(
      sql`select product_type_id from products where id = ${legacyTour.id}`,
    )) as unknown as [{ product_type_id: string | null }]
    expect(secondRow.product_type_id).toBe(TOUR.id)
  })
})
