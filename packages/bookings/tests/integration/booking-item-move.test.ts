// agent-quality: file-size exception -- owner: bookings; one focused live-database suite proves move capacity conservation, rollback, supplier, and replay invariants together.
/**
 * `item_move` Amendments: carrying a Booking Item to a different departure.
 *
 * The invariant is that capacity is conserved across the move — the old
 * departure gets its seats back, the new one gives up exactly as many, and
 * a target that cannot seat the booking is refused rather than oversold.
 * These assert on both slot rows, because a move that updates the item and
 * forgets one side of the capacity looks perfectly healthy from the API.
 */

import { eq } from "drizzle-orm"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"

import { availabilitySlotsRef } from "../../src/availability-ref.js"
import { optionPriceRulesRef, priceCatalogsRef } from "../../src/pricing-ref.js"
import { productOptionsRef, productsRef } from "../../src/products-ref.js"
import type { BookingsFinanceRuntime } from "../../src/runtime-port.js"
import { bookingAllocations, bookingAmendments, bookingItems, bookings } from "../../src/schema.js"
import { bookingAmendmentService } from "../../src/service-amendments.js"

const DB_AVAILABLE = Boolean(process.env.TEST_DATABASE_URL)

describe.skipIf(!DB_AVAILABLE)("Booking item move Amendments", () => {
  let db: ReturnType<typeof import("@voyant-travel/db/test-utils").createTestDb>
  let sequence = 0
  const recorded: Array<{ refundHandling?: string; feeDeltaCents: number }> = []

  beforeAll(async () => {
    const { cleanupTestDb, createTestDb } = await import("@voyant-travel/db/test-utils")
    db = createTestDb()
    await cleanupTestDb(db)
  })

  beforeEach(async () => {
    const { cleanupTestDb } = await import("@voyant-travel/db/test-utils")
    await cleanupTestDb(db)
    recorded.length = 0
  })

  afterAll(async () => {
    const { closeTestDb } = await import("@voyant-travel/db/test-utils")
    await closeTestDb()
  })

  /**
   * Passes fares through untaxed and records what it was asked to settle,
   * so the tests can assert the operator's choice actually reaches finance.
   */
  function financeRuntime(): BookingsFinanceRuntime {
    return {
      async quoteBookingAmendment(_db, input) {
        const feeDeltaCents = input.feeDeltaCents ?? 0
        const amountCents =
          input.lines.reduce((sum, line) => sum + line.subtotalDeltaCents, 0) + feeDeltaCents
        return {
          price: {
            currency: input.currency,
            subtotalDeltaCents: input.lines.reduce((s, l) => s + l.subtotalDeltaCents, 0),
            feeDeltaCents,
            taxDeltaCents: 0,
            amountCents,
            collectionAmountCents: Math.max(amountCents, 0),
            refundAmountCents: Math.max(-amountCents, 0),
            taxLines: [],
          },
          consequences: {
            collection: amountCents > 0 ? "required" : "not_required",
            refund: amountCents < 0 ? "required" : "not_required",
            invoice: amountCents > 0 ? "reissue_required" : "not_required",
            creditNote: amountCents < 0 ? "issue_required" : "not_required",
            paymentSchedule: amountCents === 0 ? "not_required" : "recalculate_required",
          },
          policyVersion: "test-finance-v1",
        }
      },
      async recordBookingAmendment(_tx, input) {
        recorded.push({
          refundHandling: input.refundHandling,
          feeDeltaCents: input.price.feeDeltaCents,
        })
        return { adjustmentId: "faad_test", status: "recorded" }
      },
    }
  }

  async function seedSlot(
    productId: string,
    options: { remainingPax: number; dateLocal: string; startsAt: string },
  ) {
    const [slot] = await db
      .insert(availabilitySlotsRef)
      .values({
        productId,
        dateLocal: options.dateLocal,
        startsAt: new Date(options.startsAt),
        timezone: "Europe/Bucharest",
        status: "open",
        unlimited: false,
        initialPax: options.remainingPax,
        remainingPax: options.remainingPax,
      })
      .returning()
    return slot!
  }

  /** A confirmed booking of `quantity` seats on `from`, with `to` available. */
  async function seed(
    options: {
      quantity?: number
      unitPrice?: number
      targetPrice?: number
      targetPax?: number
    } = {},
  ) {
    sequence += 1
    const quantity = options.quantity ?? 2
    const unitPrice = options.unitPrice ?? 10_000

    const [booking] = await db
      .insert(bookings)
      .values({
        bookingNumber: `BK-MOVE-${String(sequence).padStart(6, "0")}`,
        sellCurrency: "EUR",
        status: "confirmed",
        sellAmountCents: unitPrice * quantity,
      })
      .returning()

    const [catalog] = await db
      .insert(priceCatalogsRef)
      .values({
        code: `PUB-MOVE-${sequence}`,
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
        name: "Istanbul 7 days",
        status: "active",
        visibility: "public",
        activated: true,
        sellCurrency: "EUR",
        sellAmountCents: unitPrice,
      })
      .returning()

    const [option] = await db
      .insert(productOptionsRef)
      .values({ productId: product!.id, name: "Standard", status: "active", isDefault: true })
      .returning()

    await db.insert(optionPriceRulesRef).values({
      productId: product!.id,
      optionId: option!.id,
      priceCatalogId: catalog!.id,
      name: "Default",
      pricingMode: "per_person",
      baseSellAmountCents: options.targetPrice ?? unitPrice,
      isDefault: true,
      active: true,
    })

    const from = await seedSlot(product!.id, {
      remainingPax: 0,
      dateLocal: "2026-09-10",
      startsAt: "2026-09-10T08:00:00.000Z",
    })
    const to = await seedSlot(product!.id, {
      remainingPax: options.targetPax ?? 8,
      dateLocal: "2026-10-15",
      startsAt: "2026-10-15T08:00:00.000Z",
    })

    const [item] = await db
      .insert(bookingItems)
      .values({
        bookingId: booking!.id,
        title: "Istanbul 7 days",
        status: "confirmed",
        quantity,
        sellCurrency: "EUR",
        unitSellAmountCents: unitPrice,
        totalSellAmountCents: unitPrice * quantity,
        productId: product!.id,
        optionId: option!.id,
        availabilitySlotId: from.id,
      })
      .returning()

    const [allocation] = await db
      .insert(bookingAllocations)
      .values({
        bookingId: booking!.id,
        bookingItemId: item!.id,
        productId: product!.id,
        availabilitySlotId: from.id,
        quantity,
        status: "confirmed",
      })
      .returning()

    return {
      booking: booking!,
      product: product!,
      option: option!,
      from,
      to,
      item: item!,
      allocation: allocation!,
    }
  }

  function context(key: string) {
    return { actor: "staff" as const, actorId: "usr_staff", idempotencyKey: key }
  }

  async function previewMove(
    seeded: Awaited<ReturnType<typeof seed>>,
    overrides: {
      slotId?: string
      changeFeeCents?: number
      fareDiscountCents?: number
      refundHandling?: "refund" | "travel_credit" | "waive"
      key?: string
    } = {},
  ) {
    return bookingAmendmentService.previewItemMove(
      db,
      seeded.booking.id,
      {
        expectedBookingRevision: 1,
        reason: "Customer asked to travel a month later",
        move: {
          type: "item_move",
          bookingItemId: seeded.item.id,
          availabilitySlotId: overrides.slotId ?? seeded.to.id,
          changeFeeCents: overrides.changeFeeCents ?? 0,
          fareDiscountCents: overrides.fareDiscountCents ?? 0,
          refundHandling: overrides.refundHandling ?? "refund",
        },
      },
      context(overrides.key ?? "preview-move-1"),
      { finance: financeRuntime() },
    )
  }

  async function applyMove(
    amendment: { id: string; revisions?: Array<{ id: string; role: string }> },
    key: string,
  ) {
    const proposed = amendment.revisions?.find((r) => r.role === "proposed_after")
    if (!proposed) throw new Error("Expected a proposed revision")
    await bookingAmendmentService.accept(db, amendment.id, proposed.id, context(`${key}-accept`), {
      finance: financeRuntime(),
    })
    return bookingAmendmentService.apply(
      db,
      amendment.id,
      { expectedBookingRevision: 1, proposedRevisionId: proposed.id },
      context(key),
      { finance: financeRuntime() },
    )
  }

  async function readSlot(slotId: string) {
    const [row] = await db
      .select()
      .from(availabilitySlotsRef)
      .where(eq(availabilitySlotsRef.id, slotId))
    return row
  }

  it("quotes the target date's fare plus the operator's change fee", async () => {
    const seeded = await seed({ quantity: 2, unitPrice: 10_000, targetPrice: 12_000 })
    const preview = await previewMove(seeded, { changeFeeCents: 3_000 })

    expect(preview.status).toBe("ok")
    if (preview.status !== "ok") throw new Error("Expected a quote")
    expect(preview.amendment).toMatchObject({
      kind: "item_move",
      travelerId: null,
      priceDelta: {
        // (12_000 - 10_000) x 2 seats = 4_000 fare, + 3_000 fee
        subtotalDeltaCents: 4_000,
        feeDeltaCents: 3_000,
        amountCents: 7_000,
        collectionAmountCents: 7_000,
      },
      effects: { allocation: "move_required", documents: "reissue_required" },
    })
  })

  it("conserves capacity across both departures on apply", async () => {
    const seeded = await seed({ quantity: 2, targetPax: 8 })
    const preview = await previewMove(seeded)
    if (preview.status !== "ok") throw new Error("Expected a quote")

    const applied = await applyMove(preview.amendment, "apply-move-1")
    expect(applied.status).toBe("ok")

    // Old departure gets its two seats back and reopens; new one gives up two.
    expect(await readSlot(seeded.from.id)).toMatchObject({ remainingPax: 2, status: "open" })
    expect((await readSlot(seeded.to.id))?.remainingPax).toBe(6)

    const [item] = await db.select().from(bookingItems).where(eq(bookingItems.id, seeded.item.id))
    expect(item).toMatchObject({
      availabilitySlotId: seeded.to.id,
      serviceDate: "2026-10-15",
    })

    const [allocation] = await db
      .select()
      .from(bookingAllocations)
      .where(eq(bookingAllocations.id, seeded.allocation.id))
    expect(allocation?.availabilitySlotId).toBe(seeded.to.id)
  })

  it("moves a shared-departure line without releasing the booking's source claim", async () => {
    const seeded = await seed({ quantity: 2 })
    await db.update(bookings).set({ pax: 2 }).where(eq(bookings.id, seeded.booking.id))
    const [sharedItem] = await db
      .insert(bookingItems)
      .values({
        bookingId: seeded.booking.id,
        title: "Second priced line",
        status: "confirmed",
        quantity: 2,
        sellCurrency: "EUR",
        unitSellAmountCents: 10_000,
        totalSellAmountCents: 20_000,
        productId: seeded.product.id,
        optionId: seeded.option.id,
        availabilitySlotId: seeded.from.id,
      })
      .returning()
    const [sharedAllocation] = await db
      .insert(bookingAllocations)
      .values({
        bookingId: seeded.booking.id,
        bookingItemId: sharedItem!.id,
        productId: seeded.product.id,
        availabilitySlotId: seeded.from.id,
        quantity: 0,
        status: "confirmed",
      })
      .returning()

    const preview = await previewMove({
      ...seeded,
      booking: { ...seeded.booking, pax: 2 },
      item: sharedItem!,
      allocation: sharedAllocation!,
    })
    if (preview.status !== "ok") throw new Error(`Expected preview, received ${preview.status}`)
    await expect(applyMove(preview.amendment, "move-shared-line")).resolves.toMatchObject({
      status: "ok",
    })

    const [from, to] = await Promise.all(
      [seeded.from.id, seeded.to.id].map(async (id) => {
        const [slot] = await db
          .select()
          .from(availabilitySlotsRef)
          .where(eq(availabilitySlotsRef.id, id))
        return slot!
      }),
    )
    expect(from.remainingPax).toBe(0)
    expect(to.remainingPax).toBe(6)

    const allocations = await db
      .select()
      .from(bookingAllocations)
      .where(eq(bookingAllocations.bookingId, seeded.booking.id))
    expect(
      allocations
        .map((allocation) => [allocation.availabilitySlotId, allocation.quantity])
        .sort(([left], [right]) => String(left).localeCompare(String(right))),
    ).toEqual(
      [
        [seeded.from.id, 2],
        [seeded.to.id, 2],
      ].sort(([left], [right]) => String(left).localeCompare(String(right))),
    )
  })

  it("releases a legacy duplicate source claim while moving one shared line", async () => {
    const seeded = await seed({ quantity: 2 })
    await db.update(bookings).set({ pax: 2 }).where(eq(bookings.id, seeded.booking.id))
    const [peerItem] = await db
      .insert(bookingItems)
      .values({
        bookingId: seeded.booking.id,
        title: "Legacy duplicate line",
        status: "confirmed",
        quantity: 2,
        sellCurrency: "EUR",
        unitSellAmountCents: 10_000,
        totalSellAmountCents: 20_000,
        productId: seeded.product.id,
        optionId: seeded.option.id,
        availabilitySlotId: seeded.from.id,
      })
      .returning()
    await db.insert(bookingAllocations).values({
      bookingId: seeded.booking.id,
      bookingItemId: peerItem!.id,
      productId: seeded.product.id,
      availabilitySlotId: seeded.from.id,
      quantity: 2,
      status: "confirmed",
    })

    const preview = await previewMove({
      ...seeded,
      booking: { ...seeded.booking, pax: 2 },
    })
    if (preview.status !== "ok") throw new Error(`Expected preview, received ${preview.status}`)
    await expect(applyMove(preview.amendment, "move-legacy-duplicate")).resolves.toMatchObject({
      status: "ok",
    })

    expect((await readSlot(seeded.from.id))?.remainingPax).toBe(2)
    expect((await readSlot(seeded.to.id))?.remainingPax).toBe(6)
    const allocations = await db
      .select()
      .from(bookingAllocations)
      .where(eq(bookingAllocations.bookingId, seeded.booking.id))
    expect(allocations.reduce((sum, allocation) => sum + allocation.quantity, 0)).toBe(4)
  })

  it("revalidates a closed target even when the booking already claims its capacity", async () => {
    const seeded = await seed({ quantity: 2 })
    await db.update(bookings).set({ pax: 2 }).where(eq(bookings.id, seeded.booking.id))
    const [targetItem] = await db
      .insert(bookingItems)
      .values({
        bookingId: seeded.booking.id,
        title: "Existing target service",
        status: "confirmed",
        quantity: 2,
        sellCurrency: "EUR",
        unitSellAmountCents: 10_000,
        totalSellAmountCents: 20_000,
        productId: seeded.product.id,
        optionId: seeded.option.id,
        availabilitySlotId: seeded.to.id,
      })
      .returning()
    await db.insert(bookingAllocations).values({
      bookingId: seeded.booking.id,
      bookingItemId: targetItem!.id,
      productId: seeded.product.id,
      availabilitySlotId: seeded.to.id,
      quantity: 2,
      status: "confirmed",
    })
    await db
      .update(availabilitySlotsRef)
      .set({ remainingPax: 6 })
      .where(eq(availabilitySlotsRef.id, seeded.to.id))

    const preview = await previewMove({
      ...seeded,
      booking: { ...seeded.booking, pax: 2 },
    })
    if (preview.status !== "ok") throw new Error(`Expected preview, received ${preview.status}`)
    await db
      .update(availabilitySlotsRef)
      .set({ status: "closed" })
      .where(eq(availabilitySlotsRef.id, seeded.to.id))

    await expect(
      applyMove(preview.amendment, "move-closed-preclaimed-target"),
    ).resolves.toMatchObject({ status: "availability_changed" })
    const [item] = await db.select().from(bookingItems).where(eq(bookingItems.id, seeded.item.id))
    expect(item?.availabilitySlotId).toBe(seeded.from.id)
    expect((await readSlot(seeded.from.id))?.remainingPax).toBe(0)
  })

  it("refuses a departure that cannot seat the booking", async () => {
    const seeded = await seed({ quantity: 4, targetPax: 1 })
    expect((await previewMove(seeded)).status).toBe("availability_changed")
  })

  it("refuses a departure belonging to a different product", async () => {
    const seeded = await seed()
    const other = await seed()

    const preview = await previewMove(seeded, { slotId: other.to.id, key: "cross-product-move" })

    expect(preview.status).toBe("not_found")
    expect((await readSlot(other.to.id))?.remainingPax).toBe(8)
  })

  it("refuses moving onto the departure it is already on", async () => {
    const seeded = await seed()
    const preview = await previewMove(seeded, { slotId: seeded.from.id })
    expect(preview.status).toBe("unsupported_configuration")
  })

  it("rolls the whole move back when the target fills up between quote and apply", async () => {
    const seeded = await seed({ quantity: 2, targetPax: 2 })
    const preview = await previewMove(seeded)
    if (preview.status !== "ok") throw new Error("Expected a quote")

    await db
      .update(availabilitySlotsRef)
      .set({ remainingPax: 0, status: "sold_out" })
      .where(eq(availabilitySlotsRef.id, seeded.to.id))

    const applied = await applyMove(preview.amendment, "apply-move-race")
    expect(applied.status).toBe("availability_changed")

    // Neither side moved: the booking still holds its original departure.
    const [item] = await db.select().from(bookingItems).where(eq(bookingItems.id, seeded.item.id))
    expect(item?.availabilitySlotId).toBe(seeded.from.id)
    expect((await readSlot(seeded.from.id))?.remainingPax).toBe(0)
  })

  it("floors a cheaper move at zero when the operator waives the difference", async () => {
    const seeded = await seed({ quantity: 2, unitPrice: 10_000, targetPrice: 6_000 })
    const preview = await previewMove(seeded, { refundHandling: "waive" })

    if (preview.status !== "ok") throw new Error("Expected a quote")
    expect(preview.amendment.priceDelta).toMatchObject({
      amountCents: 0,
      refundAmountCents: 0,
      collectionAmountCents: 0,
    })
  })

  it("keeps the change fee payable when a waived move is otherwise cheaper", async () => {
    const seeded = await seed({ quantity: 2, unitPrice: 10_000, targetPrice: 6_000 })
    const preview = await previewMove(seeded, { refundHandling: "waive", changeFeeCents: 2_500 })

    if (preview.status !== "ok") throw new Error("Expected a quote")
    expect(preview.amendment.priceDelta).toMatchObject({
      amountCents: 2_500,
      collectionAmountCents: 2_500,
      refundAmountCents: 0,
    })
  })

  it("waives the fare reduction even when the change fee exceeds it", async () => {
    // The reduction (1_000) is smaller than the fee (1_500), so the net is
    // positive. Testing the net rather than the fare read that as "not a
    // reduction", dropped the waive, and charged 500 — the fare discount
    // the operator explicitly declined to give, handed over anyway.
    const seeded = await seed({ quantity: 2, unitPrice: 10_000, targetPrice: 9_500 })
    const preview = await previewMove(seeded, { refundHandling: "waive", changeFeeCents: 1_500 })

    if (preview.status !== "ok") throw new Error("Expected a quote")
    expect(preview.amendment.priceDelta).toMatchObject({
      subtotalDeltaCents: 0,
      feeDeltaCents: 1_500,
      amountCents: 1_500,
      collectionAmountCents: 1_500,
      refundAmountCents: 0,
    })
  })

  it("refuses to move a service that holds no capacity allocation", async () => {
    // `updateItem` still lets an operator schedule a product-linked line
    // without claiming a seat. Moving one would credit the old departure
    // capacity it never consumed and leave the target's claim untracked.
    const seeded = await seed()
    await db
      .update(bookingAllocations)
      .set({ status: "released" })
      .where(eq(bookingAllocations.id, seeded.allocation.id))

    const preview = await previewMove(seeded)
    expect(preview.status).toBe("unsupported_configuration")

    // And nothing was taken from the target on the way to refusing.
    expect((await readSlot(seeded.to.id))?.remainingPax).toBe(8)
  })

  it("returns the failed amendment, not the pre-failure one, on manual review", async () => {
    const seeded = await seed({ quantity: 2, targetPax: 2 })
    const preview = await previewMove(seeded)
    if (preview.status !== "ok") throw new Error("Expected a quote")

    // Stand the amendment up as one the supplier already secured, then take
    // the target away so local projection fails after the supplier moved.
    await db
      .update(bookingAmendments)
      .set({ effects: { ...preview.amendment.effects, supplier: "secured" } })
      .where(eq(bookingAmendments.id, preview.amendment.id))
    await db
      .update(availabilitySlotsRef)
      .set({ remainingPax: 0, status: "sold_out" })
      .where(eq(availabilitySlotsRef.id, seeded.to.id))

    const applied = await applyMove(preview.amendment, "apply-move-manual")
    if (applied.status !== "manual_review") throw new Error("Expected manual review")

    // The embedded amendment must agree with the outer verdict rather than
    // still reading `applying` with no failure code.
    expect(applied.amendment.status).toBe("manual_review")
    expect(applied.amendment.failureCode).toBe("local_projection_failed_after_supplier_secured")
  })

  it("records money owed back when the operator refunds it", async () => {
    const seeded = await seed({ quantity: 2, unitPrice: 10_000, targetPrice: 6_000 })
    const preview = await previewMove(seeded, { refundHandling: "refund" })

    if (preview.status !== "ok") throw new Error("Expected a quote")
    expect(preview.amendment.priceDelta.refundAmountCents).toBe(8_000)
  })

  it("carries the operator's settlement choice through to finance", async () => {
    const seeded = await seed({ quantity: 2, unitPrice: 10_000, targetPrice: 6_000 })
    const preview = await previewMove(seeded, { refundHandling: "travel_credit" })
    if (preview.status !== "ok") throw new Error("Expected a quote")

    await applyMove(preview.amendment, "apply-move-credit")

    expect(recorded.at(-1)).toMatchObject({ refundHandling: "travel_credit" })
  })

  it("lets the operator absorb part of a price increase", async () => {
    // New date is 2_000 dearer per seat (4_000 total); the operator only
    // passes on 1_500 of it.
    const seeded = await seed({ quantity: 2, unitPrice: 10_000, targetPrice: 12_000 })
    const preview = await previewMove(seeded, { fareDiscountCents: 2_500 })

    if (preview.status !== "ok") throw new Error("Expected a quote")
    expect(preview.amendment.priceDelta).toMatchObject({
      subtotalDeltaCents: 1_500,
      amountCents: 1_500,
      collectionAmountCents: 1_500,
    })
  })

  it("lets the operator absorb the increase entirely", async () => {
    const seeded = await seed({ quantity: 2, unitPrice: 10_000, targetPrice: 12_000 })
    const preview = await previewMove(seeded, { fareDiscountCents: 4_000 })

    if (preview.status !== "ok") throw new Error("Expected a quote")
    expect(preview.amendment.priceDelta).toMatchObject({
      amountCents: 0,
      collectionAmountCents: 0,
      refundAmountCents: 0,
    })
  })

  it("caps the discount at the increase rather than paying the customer", async () => {
    const seeded = await seed({ quantity: 2, unitPrice: 10_000, targetPrice: 12_000 })
    const preview = await previewMove(seeded, { fareDiscountCents: 50_000 })

    if (preview.status !== "ok") throw new Error("Expected a quote")
    expect(preview.amendment.priceDelta).toMatchObject({
      amountCents: 0,
      refundAmountCents: 0,
    })
  })

  it("still charges the change fee when the increase is fully absorbed", async () => {
    const seeded = await seed({ quantity: 2, unitPrice: 10_000, targetPrice: 12_000 })
    const preview = await previewMove(seeded, {
      fareDiscountCents: 4_000,
      changeFeeCents: 2_000,
    })

    if (preview.status !== "ok") throw new Error("Expected a quote")
    expect(preview.amendment.priceDelta).toMatchObject({
      feeDeltaCents: 2_000,
      amountCents: 2_000,
      collectionAmountCents: 2_000,
    })
  })

  it("ignores a discount on a move that is already cheaper", async () => {
    // Nothing to absorb — the cap floors it at zero and `refundHandling`
    // stays in charge of the money owed back.
    const seeded = await seed({ quantity: 2, unitPrice: 10_000, targetPrice: 6_000 })
    const preview = await previewMove(seeded, {
      fareDiscountCents: 3_000,
      refundHandling: "refund",
    })

    if (preview.status !== "ok") throw new Error("Expected a quote")
    expect(preview.amendment.priceDelta.refundAmountCents).toBe(8_000)
  })

  it("replays an identical preview instead of quoting twice", async () => {
    const seeded = await seed()
    const first = await previewMove(seeded, { key: "same-move-key" })
    const second = await previewMove(seeded, { key: "same-move-key" })
    if (first.status !== "ok" || second.status !== "ok") throw new Error("Expected quotes")
    expect(second.amendment.id).toBe(first.amendment.id)
  })

  it("rejects a reused key that describes a different move", async () => {
    const seeded = await seed()
    await previewMove(seeded, { key: "shared-move-key", changeFeeCents: 0 })
    const conflicting = await previewMove(seeded, {
      key: "shared-move-key",
      fareDiscountCents: 5_000,
    })
    expect(conflicting.status).toBe("idempotency_conflict")
  })
})
