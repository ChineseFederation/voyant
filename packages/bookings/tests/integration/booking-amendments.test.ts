// agent-quality: file-size exception -- owner: bookings; one live-database suite proves the complete Amendment protocol, fault outcomes, rollback, and replay invariants.
import { eq } from "drizzle-orm"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { availabilitySlotsRef } from "../../src/availability-ref.js"
import type {
  BookingsFinanceRuntime,
  BookingsSupplierAmendmentRuntime,
} from "../../src/runtime-port.js"
import {
  bookingAllocations,
  bookingItems,
  bookingItemTravelers,
  bookings,
  bookingTravelers,
} from "../../src/schema.js"
import { bookingAmendmentService } from "../../src/service-amendments.js"

const DB_AVAILABLE = Boolean(process.env.TEST_DATABASE_URL)

describe.skipIf(!DB_AVAILABLE)("Booking traveler Amendments", () => {
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

  async function seed() {
    sequence += 1
    const [booking] = await db
      .insert(bookings)
      .values({
        bookingNumber: `BK-AMEND-${String(sequence).padStart(6, "0")}`,
        sellCurrency: "EUR",
        status: "confirmed",
      })
      .returning()
    const [traveler] = await db
      .insert(bookingTravelers)
      .values({
        bookingId: booking!.id,
        firstName: "Mihai",
        lastName: "Popescu",
        email: "mihai@example.test",
        personId: "pers_amendment_customer",
      })
      .returning()
    return { booking: booking!, traveler: traveler! }
  }

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
            refund: amountCents < 0 ? "required" : "not_required",
            invoice: amountCents > 0 ? "reissue_required" : "not_required",
            creditNote: amountCents < 0 ? "issue_required" : "not_required",
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

  async function seedOwnedRosterBooking() {
    const seeded = await seed()
    const now = new Date("2026-08-02T10:00:00.000Z")
    const [slot] = await db
      .insert(availabilitySlotsRef)
      .values({
        productId: "prod_roster",
        dateLocal: "2026-09-10",
        startsAt: new Date("2026-09-10T08:00:00.000Z"),
        timezone: "Europe/Bucharest",
        status: "open",
        unlimited: false,
        initialPax: 3,
        remainingPax: 2,
        createdAt: now,
        updatedAt: now,
      })
      .returning()
    const [item] = await db
      .insert(bookingItems)
      .values({
        bookingId: seeded.booking.id,
        title: "Priced departure",
        status: "confirmed",
        quantity: 1,
        sellCurrency: "EUR",
        unitSellAmountCents: 10_000,
        totalSellAmountCents: 10_000,
        productId: "prod_roster",
        availabilitySlotId: slot!.id,
      })
      .returning()
    const [allocation] = await db
      .insert(bookingAllocations)
      .values({
        bookingId: seeded.booking.id,
        bookingItemId: item!.id,
        productId: "prod_roster",
        availabilitySlotId: slot!.id,
        quantity: 1,
        status: "confirmed",
      })
      .returning()
    await db.insert(bookingItemTravelers).values({
      bookingItemId: item!.id,
      travelerId: seeded.traveler.id,
      role: "traveler",
    })
    const [booking] = await db
      .update(bookings)
      .set({ sellAmountCents: 10_000, pax: 1 })
      .where(eq(bookings.id, seeded.booking.id))
      .returning()
    return { ...seeded, booking: booking!, slot: slot!, item: item!, allocation: allocation! }
  }

  it("previews and applies an immutable correction without replacing the Booking", async () => {
    const { booking, traveler } = await seed()
    const preview = await bookingAmendmentService.previewTravelerCorrection(
      db,
      booking.id,
      {
        travelerId: traveler.id,
        expectedBookingRevision: 1,
        reason: "Correct a spelling error",
        patch: { firstName: "Michael" },
      },
      { actor: "staff", actorId: "usr_staff", idempotencyKey: "preview-1" },
    )
    expect(preview.status).toBe("ok")
    if (preview.status !== "ok") throw new Error("Expected preview")
    expect(preview.amendment).toMatchObject({
      bookingId: booking.id,
      travelerId: traveler.id,
      acceptanceRequired: false,
      priceDelta: { amountCents: 0, currency: "EUR" },
      effects: {
        finance: "not_required",
        legal: "not_required",
        documents: "not_required",
        fulfillment: "not_required",
        supplier: "not_required",
      },
      nextActions: ["apply"],
    })
    const before = preview.amendment.revisions?.find((revision) => revision.role === "before")
    const proposed = preview.amendment.revisions?.find(
      (revision) => revision.role === "proposed_after",
    )
    expect(before?.snapshot).toMatchObject({
      bookingId: booking.id,
      bookingNumber: booking.bookingNumber,
      revision: 1,
      travelers: [{ id: traveler.id, firstName: "Mihai" }],
    })
    expect(proposed?.snapshot).toMatchObject({
      bookingId: booking.id,
      bookingNumber: booking.bookingNumber,
      revision: 2,
      travelers: [{ id: traveler.id, firstName: "Michael" }],
    })

    const applied = await bookingAmendmentService.apply(
      db,
      preview.amendment.id,
      { expectedBookingRevision: 1, proposedRevisionId: proposed!.id },
      { actor: "staff", actorId: "usr_staff", idempotencyKey: "apply-1" },
    )
    expect(applied.status).toBe("ok")
    const appliedReplay = await bookingAmendmentService.apply(
      db,
      preview.amendment.id,
      { expectedBookingRevision: 1, proposedRevisionId: proposed!.id },
      { actor: "staff", actorId: "usr_staff", idempotencyKey: "apply-1" },
    )
    expect(appliedReplay).toEqual(applied)
    expect(appliedReplay).toMatchObject({
      amendment: { appliedActor: "staff", appliedBy: "usr_staff" },
    })

    const [current] = await db.select().from(bookings).where(eq(bookings.id, booking.id))
    const participants = await db
      .select()
      .from(bookingTravelers)
      .where(eq(bookingTravelers.bookingId, booking.id))
    expect({ ...current, participants }).toMatchObject({
      id: booking.id,
      bookingNumber: booking.bookingNumber,
      revision: 2,
      participants: [{ id: traveler.id, firstName: "Michael" }],
    })
    const history = await bookingAmendmentService.get(db, booking.id, preview.amendment.id)
    expect(history?.revisions?.find((revision) => revision.role === "before")?.snapshot).toEqual(
      before?.snapshot,
    )
  })

  it("requires and idempotently records customer acceptance for an identity correction", async () => {
    const { booking, traveler } = await seed()
    const preview = await bookingAmendmentService.previewTravelerCorrection(
      db,
      booking.id,
      {
        travelerId: traveler.id,
        expectedBookingRevision: 1,
        reason: "Correct legal first name spelling",
        patch: { firstName: "Michael" },
      },
      { actor: "customer", actorId: traveler.personId, idempotencyKey: "customer-preview" },
    )
    if (preview.status !== "ok") throw new Error("Expected preview")
    const proposed = preview.amendment.revisions!.find(
      (revision) => revision.role === "proposed_after",
    )!
    expect(preview.amendment.nextActions).toEqual(["accept"])

    await expect(
      bookingAmendmentService.apply(
        db,
        preview.amendment.id,
        { expectedBookingRevision: 1, proposedRevisionId: proposed.id },
        { actor: "customer", actorId: traveler.personId, idempotencyKey: "apply-before-accept" },
      ),
    ).resolves.toMatchObject({ status: "acceptance_required" })

    const accepted = await bookingAmendmentService.accept(db, preview.amendment.id, proposed.id, {
      actor: "customer",
      actorId: traveler.personId,
      idempotencyKey: "accept-1",
    })
    const replay = await bookingAmendmentService.accept(db, preview.amendment.id, proposed.id, {
      actor: "customer",
      actorId: traveler.personId,
      idempotencyKey: "accept-1",
    })
    expect(accepted).toMatchObject({ status: "ok", amendment: { status: "accepted" } })
    expect(replay).toMatchObject({
      status: "ok",
      amendment: {
        status: "accepted",
        acceptedActor: "customer",
        acceptedBy: traveler.personId,
      },
    })
  })

  it("returns no-op without creating an Amendment", async () => {
    const { booking, traveler } = await seed()
    const result = await bookingAmendmentService.previewTravelerCorrection(
      db,
      booking.id,
      {
        travelerId: traveler.id,
        expectedBookingRevision: 1,
        reason: "Check existing name",
        patch: { firstName: traveler.firstName },
      },
      { actor: "staff", actorId: "usr_staff", idempotencyKey: "no-op" },
    )
    expect(result).toEqual({
      status: "no_op",
      bookingId: booking.id,
      travelerId: traveler.id,
      bookingRevision: 1,
    })
    expect(await bookingAmendmentService.list(db, booking.id)).toEqual([])
  })

  it("replays a preview and rejects reuse of its key for a different request", async () => {
    const { booking, traveler } = await seed()
    const input = {
      travelerId: traveler.id,
      expectedBookingRevision: 1,
      reason: "Correct email",
      patch: { email: "corrected@example.test" },
    } as const
    const first = await bookingAmendmentService.previewTravelerCorrection(db, booking.id, input, {
      actor: "customer",
      actorId: traveler.personId,
      idempotencyKey: "same-preview",
    })
    const replay = await bookingAmendmentService.previewTravelerCorrection(db, booking.id, input, {
      actor: "customer",
      actorId: traveler.personId,
      idempotencyKey: "same-preview",
    })
    expect(replay).toEqual(first)
    await expect(
      bookingAmendmentService.previewTravelerCorrection(
        db,
        booking.id,
        { ...input, patch: { email: "other@example.test" } },
        { actor: "customer", actorId: traveler.personId, idempotencyKey: "same-preview" },
      ),
    ).resolves.toEqual({ status: "idempotency_conflict" })
  })

  it("allows only one conflicting Amendment to advance the Booking revision", async () => {
    const { booking, traveler } = await seed()
    const previews = await Promise.all(
      ["One", "Two"].map((firstName, index) =>
        bookingAmendmentService.previewTravelerCorrection(
          db,
          booking.id,
          {
            travelerId: traveler.id,
            expectedBookingRevision: 1,
            reason: `Concurrent correction ${index}`,
            patch: { firstName },
          },
          {
            actor: "customer",
            actorId: traveler.personId,
            idempotencyKey: `preview-${index}`,
          },
        ),
      ),
    )
    const amendments = previews.map((result) => {
      if (result.status !== "ok") throw new Error("Expected preview")
      return result.amendment
    })
    const first = amendments[0]!
    const second = amendments[1]!
    const firstRevision = first.revisions!.find((revision) => revision.role === "proposed_after")!
    const secondRevision = second.revisions!.find((revision) => revision.role === "proposed_after")!

    await expect(
      bookingAmendmentService.accept(db, first.id, firstRevision.id, {
        actor: "customer",
        actorId: traveler.personId,
        idempotencyKey: "accept-first",
      }),
    ).resolves.toMatchObject({ status: "ok" })
    await expect(
      bookingAmendmentService.apply(
        db,
        first.id,
        { expectedBookingRevision: 1, proposedRevisionId: firstRevision.id },
        { actor: "customer", actorId: traveler.personId, idempotencyKey: "apply-first" },
      ),
    ).resolves.toMatchObject({ status: "ok" })
    await expect(
      bookingAmendmentService.accept(db, second.id, secondRevision.id, {
        actor: "customer",
        actorId: traveler.personId,
        idempotencyKey: "accept-second",
      }),
    ).resolves.toEqual({ status: "stale_revision", currentBookingRevision: 2 })
    await expect(
      bookingAmendmentService.apply(
        db,
        second.id,
        { expectedBookingRevision: 1, proposedRevisionId: secondRevision.id },
        { actor: "customer", actorId: traveler.personId, idempotencyKey: "apply-second" },
      ),
    ).resolves.toEqual({ status: "stale_revision", currentBookingRevision: 2 })
  })

  it("quotes, accepts, and atomically applies an owned traveler addition", async () => {
    const { booking, slot, item, allocation } = await seedOwnedRosterBooking()
    const finance = financeRuntime()
    const now = new Date("2026-08-02T10:00:00.000Z")
    const dependencies = { finance, now: () => now }
    const preview = await bookingAmendmentService.previewTravelerRosterChange(
      db,
      booking.id,
      {
        expectedBookingRevision: 1,
        reason: "Add Ada to the departure",
        change: {
          type: "traveler_add",
          bookingItemIds: [item.id],
          traveler: { firstName: "Ada", lastName: "Lovelace" },
        },
      },
      { actor: "staff", actorId: "usr_staff", idempotencyKey: "roster-add-preview" },
      dependencies,
    )
    if (preview.status !== "ok") throw new Error(`Expected preview, received ${preview.status}`)
    expect(preview.amendment).toMatchObject({
      bookingId: booking.id,
      kind: "traveler_add",
      status: "proposed",
      priceDelta: {
        amountCents: 10_000,
        collectionAmountCents: 10_000,
        refundAmountCents: 0,
      },
      effects: {
        finance: "collection_required",
        supplier: "not_required",
        allocation: "increase_required",
      },
      nextActions: ["accept"],
    })
    const proposed = preview.amendment.revisions!.find(
      (revision) => revision.role === "proposed_after",
    )!
    expect(proposed.snapshot).toMatchObject({
      bookingId: booking.id,
      revision: 2,
      sellAmountCents: 20_000,
      pax: 2,
      items: [{ id: item.id, quantity: 2, totalSellAmountCents: 20_000 }],
    })

    await expect(
      bookingAmendmentService.accept(
        db,
        preview.amendment.id,
        proposed.id,
        { actor: "staff", actorId: "usr_staff", idempotencyKey: "roster-add-accept" },
        dependencies,
      ),
    ).resolves.toMatchObject({ status: "ok", amendment: { status: "accepted" } })
    const applied = await bookingAmendmentService.apply(
      db,
      preview.amendment.id,
      { expectedBookingRevision: 1, proposedRevisionId: proposed.id },
      { actor: "staff", actorId: "usr_staff", idempotencyKey: "roster-add-apply" },
      dependencies,
    )
    expect(applied).toMatchObject({
      status: "ok",
      amendment: {
        status: "applied",
        nextActions: ["collect_payment", "reissue_documents"],
        effects: { finance: "recorded", allocation: "applied" },
      },
    })
    await expect(
      bookingAmendmentService.apply(
        db,
        preview.amendment.id,
        { expectedBookingRevision: 1, proposedRevisionId: proposed.id },
        { actor: "staff", actorId: "usr_staff", idempotencyKey: "roster-add-apply" },
        dependencies,
      ),
    ).resolves.toEqual(applied)

    const [[currentBooking], [currentItem], [currentAllocation], [currentSlot], travelers] =
      await Promise.all([
        db.select().from(bookings).where(eq(bookings.id, booking.id)),
        db.select().from(bookingItems).where(eq(bookingItems.id, item.id)),
        db.select().from(bookingAllocations).where(eq(bookingAllocations.id, allocation.id)),
        db.select().from(availabilitySlotsRef).where(eq(availabilitySlotsRef.id, slot.id)),
        db.select().from(bookingTravelers).where(eq(bookingTravelers.bookingId, booking.id)),
      ])
    expect(currentBooking).toMatchObject({ revision: 2, sellAmountCents: 20_000, pax: 2 })
    expect(currentItem).toMatchObject({ quantity: 2, totalSellAmountCents: 20_000 })
    expect(currentAllocation).toMatchObject({ quantity: 2 })
    expect(currentSlot).toMatchObject({ remainingPax: 1 })
    expect(travelers).toHaveLength(2)
  })

  it("quotes a refund and releases capacity when dropping a traveler", async () => {
    const { booking, traveler, slot, item, allocation } = await seedOwnedRosterBooking()
    const dependencies = { finance: financeRuntime() }
    const preview = await bookingAmendmentService.previewTravelerRosterChange(
      db,
      booking.id,
      {
        expectedBookingRevision: 1,
        reason: "Traveler can no longer attend",
        change: {
          type: "traveler_drop",
          bookingItemIds: [item.id],
          travelerId: traveler.id,
        },
      },
      { actor: "staff", actorId: "usr_staff", idempotencyKey: "roster-drop-preview" },
      dependencies,
    )
    if (preview.status !== "ok") throw new Error("Expected preview")
    expect(preview.amendment).toMatchObject({
      kind: "traveler_drop",
      priceDelta: { amountCents: -10_000, refundAmountCents: 10_000 },
      effects: { finance: "refund_required", allocation: "release_required" },
    })
    const proposed = preview.amendment.revisions!.find(
      (revision) => revision.role === "proposed_after",
    )!
    await bookingAmendmentService.accept(
      db,
      preview.amendment.id,
      proposed.id,
      { actor: "staff", actorId: "usr_staff", idempotencyKey: "roster-drop-accept" },
      dependencies,
    )
    await expect(
      bookingAmendmentService.apply(
        db,
        preview.amendment.id,
        { expectedBookingRevision: 1, proposedRevisionId: proposed.id },
        { actor: "staff", actorId: "usr_staff", idempotencyKey: "roster-drop-apply" },
        dependencies,
      ),
    ).resolves.toMatchObject({
      status: "ok",
      amendment: { nextActions: ["issue_refund", "reissue_documents"] },
    })
    const [[currentBooking], [currentItem], [currentAllocation], [currentSlot], travelers] =
      await Promise.all([
        db.select().from(bookings).where(eq(bookings.id, booking.id)),
        db.select().from(bookingItems).where(eq(bookingItems.id, item.id)),
        db.select().from(bookingAllocations).where(eq(bookingAllocations.id, allocation.id)),
        db.select().from(availabilitySlotsRef).where(eq(availabilitySlotsRef.id, slot.id)),
        db.select().from(bookingTravelers).where(eq(bookingTravelers.bookingId, booking.id)),
      ])
    expect(currentBooking).toMatchObject({ revision: 2, sellAmountCents: 0, pax: 0 })
    expect(currentItem).toMatchObject({ quantity: 0, totalSellAmountCents: 0 })
    expect(currentAllocation).toMatchObject({ quantity: 0 })
    expect(currentSlot).toMatchObject({ remainingPax: 3 })
    expect(travelers).toEqual([])
  })

  it("expires immutable roster quotes and rejects changed capacity without partial local writes", async () => {
    const { booking, slot, item, allocation } = await seedOwnedRosterBooking()
    const finance = financeRuntime()
    let now = new Date("2026-08-02T10:00:00.000Z")
    const dependencies = { finance, now: () => now, quoteTtlMs: 60_000 }
    const preview = await bookingAmendmentService.previewTravelerRosterChange(
      db,
      booking.id,
      {
        expectedBookingRevision: 1,
        reason: "Add a traveler",
        change: {
          type: "traveler_add",
          bookingItemIds: [item.id],
          traveler: { firstName: "Grace", lastName: "Hopper" },
        },
      },
      { actor: "staff", actorId: "usr_staff", idempotencyKey: "expiring-preview" },
      dependencies,
    )
    if (preview.status !== "ok") throw new Error("Expected preview")
    const proposed = preview.amendment.revisions!.find(
      (revision) => revision.role === "proposed_after",
    )!
    now = new Date("2026-08-02T10:01:01.000Z")
    await expect(
      bookingAmendmentService.accept(
        db,
        preview.amendment.id,
        proposed.id,
        { actor: "staff", actorId: "usr_staff", idempotencyKey: "expired-accept" },
        dependencies,
      ),
    ).resolves.toEqual({ status: "quote_expired" })

    now = new Date("2026-08-02T10:00:30.000Z")
    await bookingAmendmentService.accept(
      db,
      preview.amendment.id,
      proposed.id,
      { actor: "staff", actorId: "usr_staff", idempotencyKey: "valid-accept" },
      dependencies,
    )
    await db
      .update(availabilitySlotsRef)
      .set({ remainingPax: 0 })
      .where(eq(availabilitySlotsRef.id, slot.id))
    await expect(
      bookingAmendmentService.apply(
        db,
        preview.amendment.id,
        { expectedBookingRevision: 1, proposedRevisionId: proposed.id },
        { actor: "staff", actorId: "usr_staff", idempotencyKey: "capacity-race-apply" },
        dependencies,
      ),
    ).resolves.toEqual({ status: "availability_changed", bookingItemId: item.id })

    const [[currentBooking], [currentItem], [currentAllocation], travelers] = await Promise.all([
      db.select().from(bookings).where(eq(bookings.id, booking.id)),
      db.select().from(bookingItems).where(eq(bookingItems.id, item.id)),
      db.select().from(bookingAllocations).where(eq(bookingAllocations.id, allocation.id)),
      db.select().from(bookingTravelers).where(eq(bookingTravelers.bookingId, booking.id)),
    ])
    expect(currentBooking).toMatchObject({ revision: 1, sellAmountCents: 10_000, pax: 1 })
    expect(currentItem).toMatchObject({ quantity: 1, totalSellAmountCents: 10_000 })
    expect(currentAllocation).toMatchObject({ quantity: 1 })
    expect(travelers).toHaveLength(1)
  })

  it("surfaces an in-doubt dispatch and reconciles the same durable supplier operation", async () => {
    const { booking, item, allocation } = await seedOwnedRosterBooking()
    await db
      .update(bookingAllocations)
      .set({
        availabilitySlotId: null,
        metadata: {
          sourceKind: "test-source",
          sourceConnectionId: "conn_1",
          upstreamRef: "upstream_1",
        },
      })
      .where(eq(bookingAllocations.id, allocation.id))
    const finance = financeRuntime()
    let supplierOutcome: "refused" | "in_doubt" | "secured" = "in_doubt"
    const supplier: BookingsSupplierAmendmentRuntime = {
      async dispatch(input) {
        return input.operations.map((operation) => ({
          bookingItemId: operation.bookingItemId,
          supplierOperationId: "suop_1",
          outcome: supplierOutcome,
        }))
      },
      async reconcile(input) {
        return input.supplierOperationIds.map(() => ({
          bookingItemId: item.id,
          supplierOperationId: "suop_1",
          outcome: supplierOutcome,
        }))
      },
    }
    const dependencies = { finance, supplier }
    const preview = await bookingAmendmentService.previewTravelerRosterChange(
      db,
      booking.id,
      {
        expectedBookingRevision: 1,
        reason: "Add a sourced traveler",
        change: {
          type: "traveler_add",
          bookingItemIds: [item.id],
          traveler: { firstName: "Katherine", lastName: "Johnson" },
        },
      },
      { actor: "staff", actorId: "usr_staff", idempotencyKey: "supplier-preview" },
      dependencies,
    )
    if (preview.status !== "ok") throw new Error("Expected preview")
    const proposed = preview.amendment.revisions!.find(
      (revision) => revision.role === "proposed_after",
    )!
    await bookingAmendmentService.accept(
      db,
      preview.amendment.id,
      proposed.id,
      { actor: "staff", actorId: "usr_staff", idempotencyKey: "supplier-accept" },
      dependencies,
    )
    await expect(
      bookingAmendmentService.apply(
        db,
        preview.amendment.id,
        { expectedBookingRevision: 1, proposedRevisionId: proposed.id },
        { actor: "staff", actorId: "usr_staff", idempotencyKey: "supplier-apply" },
        dependencies,
      ),
    ).resolves.toMatchObject({
      status: "supplier_in_doubt",
      amendment: {
        status: "in_doubt",
        failureCode: "supplier_in_doubt",
        effects: { supplier: "in_doubt" },
        nextActions: ["reconcile_supplier"],
      },
    })
    const [unchanged] = await db.select().from(bookings).where(eq(bookings.id, booking.id))
    expect(unchanged).toMatchObject({ revision: 1, sellAmountCents: 10_000, pax: 1 })

    supplierOutcome = "secured"
    await expect(
      bookingAmendmentService.reconcile(
        db,
        booking.id,
        preview.amendment.id,
        { actor: "staff", actorId: "usr_staff", idempotencyKey: "supplier-reconcile" },
        dependencies,
      ),
    ).resolves.toMatchObject({ status: "ok", amendment: { status: "applied" } })
  })

  it("records supplier refusal without mutating the Booking projection", async () => {
    const { booking, item, allocation } = await seedOwnedRosterBooking()
    await db
      .update(bookingAllocations)
      .set({
        availabilitySlotId: null,
        metadata: {
          sourceKind: "test-source",
          sourceConnectionId: "conn_1",
          upstreamRef: "upstream_refusal",
        },
      })
      .where(eq(bookingAllocations.id, allocation.id))
    const supplier: BookingsSupplierAmendmentRuntime = {
      async dispatch(input) {
        return input.operations.map((operation) => ({
          bookingItemId: operation.bookingItemId,
          supplierOperationId: "suop_refused",
          outcome: "refused" as const,
        }))
      },
      async reconcile() {
        throw new Error("not used")
      },
    }
    const dependencies = { finance: financeRuntime(), supplier }
    const preview = await bookingAmendmentService.previewTravelerRosterChange(
      db,
      booking.id,
      {
        expectedBookingRevision: 1,
        reason: "Add a sourced traveler",
        change: {
          type: "traveler_add",
          bookingItemIds: [item.id],
          traveler: { firstName: "Mary", lastName: "Jackson" },
        },
      },
      { actor: "staff", actorId: "usr_staff", idempotencyKey: "refused-preview" },
      dependencies,
    )
    if (preview.status !== "ok") throw new Error("Expected preview")
    const proposed = preview.amendment.revisions!.find(
      (revision) => revision.role === "proposed_after",
    )!
    await bookingAmendmentService.accept(
      db,
      preview.amendment.id,
      proposed.id,
      { actor: "staff", actorId: "usr_staff", idempotencyKey: "refused-accept" },
      dependencies,
    )
    await expect(
      bookingAmendmentService.apply(
        db,
        preview.amendment.id,
        { expectedBookingRevision: 1, proposedRevisionId: proposed.id },
        { actor: "staff", actorId: "usr_staff", idempotencyKey: "refused-apply" },
        dependencies,
      ),
    ).resolves.toMatchObject({
      status: "supplier_refused",
      amendment: {
        status: "failed",
        failureCode: "supplier_refused",
        effects: { supplier: "refused" },
      },
    })
    const [unchanged] = await db.select().from(bookings).where(eq(bookings.id, booking.id))
    expect(unchanged).toMatchObject({ revision: 1, sellAmountCents: 10_000, pax: 1 })
  })

  it("stops in manual review when supplier operations only partially secure", async () => {
    const { booking, traveler, item, allocation } = await seedOwnedRosterBooking()
    await db
      .update(bookingAllocations)
      .set({
        availabilitySlotId: null,
        metadata: {
          sourceKind: "test-source",
          sourceConnectionId: "conn_1",
          upstreamRef: "upstream_1",
        },
      })
      .where(eq(bookingAllocations.id, allocation.id))
    const [secondItem] = await db
      .insert(bookingItems)
      .values({
        bookingId: booking.id,
        title: "Second sourced service",
        status: "confirmed",
        quantity: 1,
        sellCurrency: "EUR",
        unitSellAmountCents: 5_000,
        totalSellAmountCents: 5_000,
        productId: "prod_second",
      })
      .returning()
    await db.insert(bookingAllocations).values({
      bookingId: booking.id,
      bookingItemId: secondItem!.id,
      productId: "prod_second",
      quantity: 1,
      status: "confirmed",
      metadata: {
        sourceKind: "test-source",
        sourceConnectionId: "conn_1",
        upstreamRef: "upstream_2",
      },
    })
    await db.insert(bookingItemTravelers).values({
      bookingItemId: secondItem!.id,
      travelerId: traveler.id,
      role: "traveler",
    })
    await db.update(bookings).set({ sellAmountCents: 15_000 }).where(eq(bookings.id, booking.id))
    const supplier: BookingsSupplierAmendmentRuntime = {
      async dispatch(input) {
        return input.operations.map((operation, index) => ({
          bookingItemId: operation.bookingItemId,
          supplierOperationId: `suop_${index + 1}`,
          outcome: index === 0 ? ("secured" as const) : ("refused" as const),
        }))
      },
      async reconcile() {
        throw new Error("not used")
      },
    }
    const dependencies = { finance: financeRuntime(), supplier }
    const preview = await bookingAmendmentService.previewTravelerRosterChange(
      db,
      booking.id,
      {
        expectedBookingRevision: 1,
        reason: "Add a traveler across sourced services",
        change: {
          type: "traveler_add",
          bookingItemIds: [item.id, secondItem!.id],
          traveler: { firstName: "Dorothy", lastName: "Vaughan" },
        },
      },
      { actor: "staff", actorId: "usr_staff", idempotencyKey: "partial-preview" },
      dependencies,
    )
    if (preview.status !== "ok") throw new Error("Expected preview")
    const proposed = preview.amendment.revisions!.find(
      (revision) => revision.role === "proposed_after",
    )!
    await bookingAmendmentService.accept(
      db,
      preview.amendment.id,
      proposed.id,
      { actor: "staff", actorId: "usr_staff", idempotencyKey: "partial-accept" },
      dependencies,
    )
    await expect(
      bookingAmendmentService.apply(
        db,
        preview.amendment.id,
        { expectedBookingRevision: 1, proposedRevisionId: proposed.id },
        { actor: "staff", actorId: "usr_staff", idempotencyKey: "partial-apply" },
        dependencies,
      ),
    ).resolves.toMatchObject({
      status: "manual_review",
      amendment: {
        status: "manual_review",
        supplierOperationIds: ["suop_1", "suop_2"],
        effects: { supplier: "manual_review" },
        nextActions: ["manual_review"],
      },
    })
    const [unchanged] = await db.select().from(bookings).where(eq(bookings.id, booking.id))
    expect(unchanged).toMatchObject({ revision: 1, sellAmountCents: 15_000, pax: 1 })
  })
})
