import { eq } from "drizzle-orm"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { bookings, bookingTravelers } from "../../src/schema.js"
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
})
