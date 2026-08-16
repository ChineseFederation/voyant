/**
 * Recording a Booking Document over the live admin route.
 *
 * voyant#4696: every request carrying the `issued*` group 500ed, so `contract`
 * and `invoice` — the types the validation *requires* to carry it — could not
 * be created at all. The defect was in the identity lookup that precedes the
 * insert, which no unit test reaches: it only exists against a real database.
 *
 * The one case in `routes.integration-suite.ts` that would have caught this is
 * in a file the CI integration lane does not list, so it has never run. This
 * file is listed, and seeds its bookings by insert rather than through the
 * retired `POST /` route, so it does not rot the same way.
 */

import { handleApiError } from "@voyant-travel/hono"
import { eq } from "drizzle-orm"
import { Hono } from "hono"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { bookingRoutes } from "../../src/routes.js"
import { bookingDocuments, bookings } from "../../src/schema.js"

const DB_AVAILABLE = Boolean(process.env.TEST_DATABASE_URL)

const json = (body: Record<string, unknown>) => ({
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
})

/** The types whose validation *requires* the issuer's number and date. */
const ISSUED_TYPES = ["contract", "invoice", "proforma", "credit_note"] as const

describe.skipIf(!DB_AVAILABLE)("Booking document recording", () => {
  let app: Hono
  let db: ReturnType<typeof import("@voyant-travel/db/test-utils").createTestDb>
  let sequence = 0

  beforeAll(async () => {
    const { createTestDb, cleanupTestDb } = await import("@voyant-travel/db/test-utils")
    const { createEventBus } = await import("@voyant-travel/core")
    db = createTestDb()
    await cleanupTestDb(db)

    const eventBus = createEventBus()
    app = new Hono()
    // The same error handler the deployment installs. Without it Hono's
    // default one answers, a refused body reads as a bare 500, and the
    // difference between "refused" and "crashed" — the whole subject of
    // voyant#4696 — is invisible to this file.
    app.onError((err, c) => handleApiError(err, c))
    app.use("*", async (c, next) => {
      c.set("db" as never, db)
      c.set("eventBus" as never, eventBus)
      c.set("userId" as never, "test-user-id")
      c.set("actor" as never, "staff")
      await next()
    })
    app.route("/", bookingRoutes)
  })

  beforeEach(async () => {
    const { cleanupTestDb } = await import("@voyant-travel/db/test-utils")
    await cleanupTestDb(db)
  })

  afterAll(async () => {
    const { closeTestDb } = await import("@voyant-travel/db/test-utils")
    await closeTestDb()
  })

  async function seedBooking() {
    sequence += 1
    const [booking] = await db
      .insert(bookings)
      .values({
        bookingNumber: `BK-DOC-${String(sequence).padStart(6, "0")}`,
        sellCurrency: "EUR",
        status: "confirmed",
      })
      .returning()
    return booking!
  }

  function issuedBody(type: string, overrides: Record<string, unknown> = {}) {
    return {
      type,
      fileName: `${type}.pdf`,
      fileUrl: `https://example.com/${type}.pdf`,
      issuedBy: "Contabilitate SRL",
      issuedSeries: "VYT",
      issuedNumber: "1042",
      issuedAt: "2026-03-04T00:00:00.000Z",
      ...overrides,
    }
  }

  for (const type of ISSUED_TYPES) {
    it(`records a ${type} document carrying the issuer's identity`, async () => {
      const booking = await seedBooking()
      const res = await app.request(`/${booking.id}/documents`, {
        method: "POST",
        ...json(issuedBody(type)),
      })

      expect(res.status).toBe(201)
      const { data } = await res.json()
      expect(data).toMatchObject({
        type,
        issuedBy: "Contabilitate SRL",
        issuedSeries: "VYT",
        issuedNumber: "1042",
        issuedAt: "2026-03-04T00:00:00.000Z",
      })

      const [row] = await db.select().from(bookingDocuments).where(eq(bookingDocuments.id, data.id))
      expect(row?.issuedAt?.toISOString()).toBe("2026-03-04T00:00:00.000Z")
    })
  }

  // The 500 tracked the presence of the group, not any particular member, so a
  // type that does not require the identity still has to survive carrying it.
  it("records issued identity on a type that does not require it", async () => {
    const booking = await seedBooking()
    const res = await app.request(`/${booking.id}/documents`, {
      method: "POST",
      ...json(issuedBody("other")),
    })

    expect(res.status).toBe(201)
    expect((await res.json()).data.issuedNumber).toBe("1042")
  })

  it("records a document whose issuer left off the series and the issuer name", async () => {
    const booking = await seedBooking()
    const res = await app.request(`/${booking.id}/documents`, {
      method: "POST",
      ...json({
        type: "invoice",
        fileName: "scan.pdf",
        fileUrl: "https://example.com/scan.pdf",
        issuedNumber: "77",
        issuedAt: "2026-03-04T00:00:00.000Z",
      }),
    })

    expect(res.status).toBe(201)
    const { data } = await res.json()
    expect(data.issuedBy).toBeNull()
    expect(data.issuedSeries).toBeNull()
  })

  // The reporter sent both shapes; a date-only value takes a different branch
  // through the contract's `issuedAt` union.
  it("accepts a date-only issue date", async () => {
    const booking = await seedBooking()
    const res = await app.request(`/${booking.id}/documents`, {
      method: "POST",
      ...json(issuedBody("invoice", { issuedAt: "2026-07-23" })),
    })

    expect(res.status).toBe(201)
    expect((await res.json()).data.issuedAt).toBe("2026-07-23T00:00:00.000Z")
  })

  it("replays the same issued document instead of doubling it", async () => {
    const booking = await seedBooking()
    const first = await app.request(`/${booking.id}/documents`, {
      method: "POST",
      ...json(issuedBody("invoice")),
    })
    const second = await app.request(`/${booking.id}/documents`, {
      method: "POST",
      ...json(issuedBody("invoice")),
    })

    expect(first.status).toBe(201)
    expect(second.status).toBe(201)
    expect((await second.json()).data.id).toBe((await first.json()).data.id)

    const rows = await db
      .select()
      .from(bookingDocuments)
      .where(eq(bookingDocuments.bookingId, booking.id))
    expect(rows).toHaveLength(1)
  })

  // The identity lookup has to agree with the unique index on every member of
  // the key, including the one that used to crash it.
  it("keeps documents apart when only the issue date differs", async () => {
    const booking = await seedBooking()
    await app.request(`/${booking.id}/documents`, {
      method: "POST",
      ...json(issuedBody("invoice")),
    })
    const other = await app.request(`/${booking.id}/documents`, {
      method: "POST",
      ...json(issuedBody("invoice", { issuedAt: "2026-03-05T00:00:00.000Z" })),
    })

    expect(other.status).toBe(201)
    const rows = await db
      .select()
      .from(bookingDocuments)
      .where(eq(bookingDocuments.bookingId, booking.id))
    expect(rows).toHaveLength(2)
  })

  it("keeps documents apart when only the issuer differs", async () => {
    const booking = await seedBooking()
    await app.request(`/${booking.id}/documents`, {
      method: "POST",
      ...json(issuedBody("invoice")),
    })
    const other = await app.request(`/${booking.id}/documents`, {
      method: "POST",
      ...json(issuedBody("invoice", { issuedBy: "Alt Accounting SRL" })),
    })

    expect(other.status).toBe(201)
    const rows = await db
      .select()
      .from(bookingDocuments)
      .where(eq(bookingDocuments.bookingId, booking.id))
    expect(rows).toHaveLength(2)
  })

  it("audits the recording once across a replay", async () => {
    const { actionLedgerEntries } = await import("@voyant-travel/action-ledger")
    const booking = await seedBooking()
    await app.request(`/${booking.id}/documents`, {
      method: "POST",
      ...json(issuedBody("contract")),
    })
    await app.request(`/${booking.id}/documents`, {
      method: "POST",
      ...json(issuedBody("contract")),
    })

    const entries = await db
      .select()
      .from(actionLedgerEntries)
      .where(eq(actionLedgerEntries.targetId, booking.id))
    expect(entries.filter((entry) => entry.actionName === "booking.document.record")).toHaveLength(
      1,
    )
  })

  it("still rejects an issued type that carries no identity", async () => {
    const booking = await seedBooking()
    const res = await app.request(`/${booking.id}/documents`, {
      method: "POST",
      ...json({
        type: "invoice",
        fileName: "scan.pdf",
        fileUrl: "https://example.com/scan.pdf",
      }),
    })

    expect(res.status).toBe(400)
  })
})
