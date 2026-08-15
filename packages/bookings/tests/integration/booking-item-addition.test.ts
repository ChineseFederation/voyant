/**
 * `item_add` Amendments: adding a catalog service to a booking that already
 * exists, priced by the catalog and holding real capacity.
 *
 * The invariant worth protecting is that the quote and the write agree.
 * These drive preview → accept → apply against a live database and assert
 * on the Booking Item, the allocation, and the departure's remaining pax —
 * not on the return value, because a plan that quotes correctly and writes
 * nothing would still look fine from the caller's side.
 */

import { eq } from "drizzle-orm"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"

import { availabilitySlotsRef } from "../../src/availability-ref.js"
import { optionPriceRulesRef, priceCatalogsRef } from "../../src/pricing-ref.js"
import { productOptionsRef, productsRef } from "../../src/products-ref.js"
import type { BookingsFinanceRuntime } from "../../src/runtime-port.js"
import { bookingAllocations, bookingItems, bookings } from "../../src/schema.js"
import { bookingAmendmentService } from "../../src/service-amendments.js"

const DB_AVAILABLE = Boolean(process.env.TEST_DATABASE_URL)

describe.skipIf(!DB_AVAILABLE)("Booking item addition Amendments", () => {
  let db: ReturnType<typeof import("@voyant-travel/db/test-utils").createTestDb>
  let sequence = 0

  beforeAll(async () => {
    const { cleanupTestDb, createTestDb } = await import("@voyant-travel/db/test-utils")
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

  /**
   * Passes the subtotal straight through. The real finance runtime adds
   * tax; these tests are about the plan and the write, so the arithmetic
   * stays legible.
   */
  function financeRuntime(): BookingsFinanceRuntime {
    return {
      async quoteBookingAmendment(_db, input) {
        const amountCents = input.lines.reduce((sum, line) => sum + line.subtotalDeltaCents, 0)
        return {
          price: {
            currency: input.currency,
            subtotalDeltaCents: amountCents,
            feeDeltaCents: 0,
            taxDeltaCents: 0,
            amountCents,
            collectionAmountCents: Math.max(amountCents, 0),
            refundAmountCents: Math.max(-amountCents, 0),
            taxLines: [],
          },
          consequences: {
            collection: amountCents > 0 ? "required" : "not_required",
            refund: "not_required",
            invoice: amountCents > 0 ? "reissue_required" : "not_required",
            creditNote: "not_required",
            paymentSchedule: amountCents === 0 ? "not_required" : "recalculate_required",
          },
          policyVersion: "test-finance-v1",
        }
      },
      async recordBookingAmendment() {
        return { adjustmentId: "faad_test", status: "recorded" }
      },
    }
  }

  async function seed(options: { remainingPax?: number; withSlot?: boolean } = {}) {
    sequence += 1
    const remainingPax = options.remainingPax ?? 10
    const withSlot = options.withSlot ?? true

    const [booking] = await db
      .insert(bookings)
      .values({
        bookingNumber: `BK-ITEMADD-${String(sequence).padStart(6, "0")}`,
        sellCurrency: "EUR",
        status: "confirmed",
        sellAmountCents: 50_000,
      })
      .returning()

    const [catalog] = await db
      .insert(priceCatalogsRef)
      .values({
        code: `PUB-${sequence}`,
        name: "Public",
        currencyCode: "EUR",
        catalogType: "public",
        isDefault: true,
        active: true,
      })
      .returning()

    const [product] = await db
      .insert(productsRef)
      .values({
        name: "Bosphorus cruise",
        status: "active",
        visibility: "public",
        activated: true,
        sellCurrency: "EUR",
        sellAmountCents: 6_400,
        costAmountCents: 3_500,
      })
      .returning()

    const [option] = await db
      .insert(productOptionsRef)
      .values({
        productId: product!.id,
        name: "Standard",
        status: "active",
        isDefault: true,
      })
      .returning()

    await db.insert(optionPriceRulesRef).values({
      productId: product!.id,
      optionId: option!.id,
      priceCatalogId: catalog!.id,
      name: "Default",
      pricingMode: "per_person",
      baseSellAmountCents: 6_400,
      isDefault: true,
      active: true,
    })

    const [slot] = withSlot
      ? await db
          .insert(availabilitySlotsRef)
          .values({
            productId: product!.id,
            dateLocal: "2026-09-10",
            startsAt: new Date("2026-09-10T08:00:00.000Z"),
            timezone: "Europe/Bucharest",
            status: "open",
            unlimited: false,
            initialPax: remainingPax,
            remainingPax,
          })
          .returning()
      : [null]

    return { booking: booking!, product: product!, option: option!, slot }
  }

  function context(key: string) {
    return { actor: "staff" as const, actorId: "usr_staff", idempotencyKey: key }
  }

  async function previewAddition(
    seeded: Awaited<ReturnType<typeof seed>>,
    overrides: { quantity?: number; key?: string } = {},
  ) {
    return bookingAmendmentService.previewItemAddition(
      db,
      seeded.booking.id,
      {
        expectedBookingRevision: 1,
        reason: "Customer asked for an extra excursion",
        addition: {
          type: "item_add",
          productId: seeded.product.id,
          optionId: seeded.option.id,
          availabilitySlotId: seeded.slot?.id ?? null,
          quantity: overrides.quantity ?? 1,
        },
      },
      context(overrides.key ?? "preview-item-1"),
      { finance: financeRuntime() },
    )
  }

  it("prices the addition from the catalog, not from the caller", async () => {
    const seeded = await seed()
    const preview = await previewAddition(seeded, { quantity: 2 })

    expect(preview.status).toBe("ok")
    if (preview.status !== "ok") throw new Error("Expected a quote")
    expect(preview.amendment).toMatchObject({
      kind: "item_add",
      travelerId: null,
      priceDelta: { amountCents: 12_800, collectionAmountCents: 12_800, currency: "EUR" },
      effects: { allocation: "increase_required", supplier: "not_required" },
    })
    // Collecting is not offered on a quote — only once the change is
    // actually applied is there anything to collect for.
    expect(preview.amendment.nextActions).toEqual(["accept"])
  })

  it("writes nothing to the booking until the Amendment is applied", async () => {
    const seeded = await seed()
    await previewAddition(seeded)

    const items = await db
      .select()
      .from(bookingItems)
      .where(eq(bookingItems.bookingId, seeded.booking.id))
    expect(items).toHaveLength(0)
    const [slot] = await db
      .select()
      .from(availabilitySlotsRef)
      .where(eq(availabilitySlotsRef.id, seeded.slot!.id))
    expect(slot?.remainingPax).toBe(10)
  })

  it("creates the item, its allocation, and takes the seats on apply", async () => {
    const seeded = await seed()
    const preview = await previewAddition(seeded, { quantity: 2 })
    if (preview.status !== "ok") throw new Error("Expected a quote")
    const proposed = preview.amendment.revisions?.find((r) => r.role === "proposed_after")
    if (!proposed) throw new Error("Expected a proposed revision")

    await bookingAmendmentService.accept(
      db,
      preview.amendment.id,
      proposed.id,
      context("accept-item-1"),
      { finance: financeRuntime() },
    )
    const applied = await bookingAmendmentService.apply(
      db,
      preview.amendment.id,
      { expectedBookingRevision: 1, proposedRevisionId: proposed.id },
      context("apply-item-1"),
      { finance: financeRuntime() },
    )

    expect(applied.status).toBe("ok")

    const [item] = await db
      .select()
      .from(bookingItems)
      .where(eq(bookingItems.bookingId, seeded.booking.id))
    expect(item).toMatchObject({
      productId: seeded.product.id,
      optionId: seeded.option.id,
      availabilitySlotId: seeded.slot!.id,
      quantity: 2,
      unitSellAmountCents: 6_400,
      totalSellAmountCents: 12_800,
      status: "confirmed",
      productNameSnapshot: "Bosphorus cruise",
    })

    const [allocation] = await db
      .select()
      .from(bookingAllocations)
      .where(eq(bookingAllocations.bookingId, seeded.booking.id))
    expect(allocation).toMatchObject({
      bookingItemId: item!.id,
      availabilitySlotId: seeded.slot!.id,
      quantity: 2,
      status: "confirmed",
    })

    const [slot] = await db
      .select()
      .from(availabilitySlotsRef)
      .where(eq(availabilitySlotsRef.id, seeded.slot!.id))
    expect(slot?.remainingPax).toBe(8)

    const [booking] = await db.select().from(bookings).where(eq(bookings.id, seeded.booking.id))
    expect(booking).toMatchObject({ revision: 2, sellAmountCents: 62_800 })

    // Now that it is applied, the money to collect is the operator's
    // next move.
    if (applied.status !== "ok") throw new Error("Expected an applied amendment")
    expect(applied.amendment.nextActions).toContain("collect_payment")
  })

  it("refuses a departure that cannot seat the addition", async () => {
    const seeded = await seed({ remainingPax: 1 })
    const preview = await previewAddition(seeded, { quantity: 4 })
    expect(preview.status).toBe("availability_changed")
  })

  it("refuses to apply a quote whose departure filled up in the meantime", async () => {
    const seeded = await seed({ remainingPax: 2 })
    const preview = await previewAddition(seeded, { quantity: 2 })
    if (preview.status !== "ok") throw new Error("Expected a quote")
    const proposed = preview.amendment.revisions?.find((r) => r.role === "proposed_after")
    if (!proposed) throw new Error("Expected a proposed revision")

    // Somebody else took the seats between quote and commit.
    await db
      .update(availabilitySlotsRef)
      .set({ remainingPax: 0, status: "sold_out" })
      .where(eq(availabilitySlotsRef.id, seeded.slot!.id))

    await bookingAmendmentService.accept(
      db,
      preview.amendment.id,
      proposed.id,
      context("accept-item-2"),
      { finance: financeRuntime() },
    )
    const applied = await bookingAmendmentService.apply(
      db,
      preview.amendment.id,
      { expectedBookingRevision: 1, proposedRevisionId: proposed.id },
      context("apply-item-2"),
      { finance: financeRuntime() },
    )

    expect(applied.status).toBe("availability_changed")
    const items = await db
      .select()
      .from(bookingItems)
      .where(eq(bookingItems.bookingId, seeded.booking.id))
    expect(items).toHaveLength(0)
  })

  it("replays an identical preview instead of quoting twice", async () => {
    const seeded = await seed()
    const first = await previewAddition(seeded, { key: "same-key" })
    const second = await previewAddition(seeded, { key: "same-key" })
    if (first.status !== "ok" || second.status !== "ok") throw new Error("Expected quotes")
    expect(second.amendment.id).toBe(first.amendment.id)
  })

  it("rejects a reused idempotency key that describes a different addition", async () => {
    const seeded = await seed()
    await previewAddition(seeded, { key: "shared-key", quantity: 1 })
    const conflicting = await previewAddition(seeded, { key: "shared-key", quantity: 3 })
    expect(conflicting.status).toBe("idempotency_conflict")
  })

  it("refuses a departure that belongs to a different product", async () => {
    // Pairing product A with product B's departure would decrement B's
    // capacity while writing an item that claims A.
    const seeded = await seed()
    const other = await seed()

    const preview = await bookingAmendmentService.previewItemAddition(
      db,
      seeded.booking.id,
      {
        expectedBookingRevision: 1,
        reason: "Cross-product departure",
        addition: {
          type: "item_add",
          productId: seeded.product.id,
          optionId: seeded.option.id,
          availabilitySlotId: other.slot!.id,
          quantity: 1,
        },
      },
      context("cross-product"),
      { finance: financeRuntime() },
    )

    expect(preview.status).toBe("not_found")
    const [slot] = await db
      .select()
      .from(availabilitySlotsRef)
      .where(eq(availabilitySlotsRef.id, other.slot!.id))
    expect(slot?.remainingPax).toBe(10)
  })

  it("refuses to add a departure-sold product without picking a departure", async () => {
    const seeded = await seed()
    const preview = await bookingAmendmentService.previewItemAddition(
      db,
      seeded.booking.id,
      {
        expectedBookingRevision: 1,
        reason: "No departure picked",
        addition: {
          type: "item_add",
          productId: seeded.product.id,
          optionId: seeded.option.id,
          availabilitySlotId: null,
          quantity: 1,
        },
      },
      context("no-departure"),
      { finance: financeRuntime() },
    )

    expect(preview.status).toBe("unsupported_configuration")
  })

  it("adds a product that has no departures at all without one", async () => {
    const seeded = await seed({ withSlot: false })
    const preview = await bookingAmendmentService.previewItemAddition(
      db,
      seeded.booking.id,
      {
        expectedBookingRevision: 1,
        reason: "Unscheduled service",
        addition: {
          type: "item_add",
          productId: seeded.product.id,
          optionId: seeded.option.id,
          availabilitySlotId: null,
          quantity: 1,
        },
      },
      context("unscheduled"),
      { finance: financeRuntime() },
    )

    expect(preview.status).toBe("ok")
  })

  it("refuses a stale booking revision", async () => {
    const seeded = await seed()
    await db.update(bookings).set({ revision: 7 }).where(eq(bookings.id, seeded.booking.id))
    const preview = await previewAddition(seeded)
    expect(preview.status).toBe("stale_revision")
  })
})
