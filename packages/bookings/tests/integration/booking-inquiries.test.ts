import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"

import { bookingInquiries } from "../../src/schema.js"
import { bookingInquiriesService } from "../../src/service-inquiries.js"

const DB_AVAILABLE = !!process.env.TEST_DATABASE_URL

describe.skipIf(!DB_AVAILABLE)("legacy booking inquiry read compatibility", () => {
  // biome-ignore lint/suspicious/noExplicitAny: test db typing -- owner: bookings; matches the package integration harness.
  let db: any

  beforeAll(async () => {
    const { createTestDb } = await import("@voyant-travel/db/test-utils")
    db = createTestDb()
  })

  beforeEach(async () => {
    await db.delete(bookingInquiries)
  })

  afterAll(async () => {
    const { closeTestDb } = await import("@voyant-travel/db/test-utils")
    await closeTestDb()
  })

  it("keeps historical rows available by id and newest-first list", async () => {
    const [older] = await db
      .insert(bookingInquiries)
      .values({
        idempotencyKey: "ask-first-123",
        requestFingerprint: "legacy-fingerprint-1",
        channelId: "channel_1",
        productId: "prod_1",
        departureId: "departure_1",
        contactFirstName: "Ana",
        contactLastName: "Popescu",
        contactEmail: "ana@example.com",
        contactPhone: "+40700000000",
        locale: "ro",
        message: "Este disponibilă plecarea din martie?",
        createdAt: new Date("2026-08-01T10:00:00.000Z"),
        updatedAt: new Date("2026-08-01T10:00:00.000Z"),
      })
      .returning()
    const [newer] = await db
      .insert(bookingInquiries)
      .values({
        idempotencyKey: "fixture",
        requestFingerprint: "legacy-fingerprint-2",
        channelId: "channel_1",
        productId: "prod_2",
        departureId: null,
        locale: "en",
        message: "Second historical inquiry",
        createdAt: new Date("2026-08-02T10:00:00.000Z"),
        updatedAt: new Date("2026-08-02T10:00:00.000Z"),
      })
      .returning()

    await expect(bookingInquiriesService.getById(db, older.id)).resolves.toMatchObject({
      id: older.id,
      productId: "prod_1",
    })
    expect((await bookingInquiriesService.list(db)).map((row) => row.id)).toEqual([
      newer.id,
      older.id,
    ])
  })

  it("does not expose a legacy write method", () => {
    expect(bookingInquiriesService).not.toHaveProperty("submit")
  })
})
