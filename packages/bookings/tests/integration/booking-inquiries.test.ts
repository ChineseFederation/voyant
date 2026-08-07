import { createEventBus } from "@voyant-travel/core"
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"

import { bookingInquiries } from "../../src/schema.js"
import { bookingInquiriesService } from "../../src/service-inquiries.js"

const DB_AVAILABLE = !!process.env.TEST_DATABASE_URL

describe.skipIf(!DB_AVAILABLE)("booking inquiry submission", () => {
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

  it("returns one durable receipt and emits one stable lifecycle event on retry", async () => {
    const eventBus = createEventBus()
    const received = vi.fn()
    eventBus.subscribe("booking.inquiry.created", received)
    const command = {
      idempotencyKey: "ask-first-123",
      storefrontId: "storefront_1",
      channelId: "channel_1",
      productId: "prod_1",
      departureId: "departure_1",
      contact: {
        firstName: "Ana",
        lastName: "Popescu",
        email: "ana@example.com",
        phone: "+40700000000",
      },
      locale: "ro",
      message: "Este disponibilă plecarea din martie?",
    }

    const created = await bookingInquiriesService.submit(db, command, { eventBus })
    const replayed = await bookingInquiriesService.submit(db, command, { eventBus })

    expect(created.status).toBe("created")
    expect(replayed.status).toBe("replayed")
    expect(replayed.inquiry.id).toBe(created.inquiry.id)
    expect(await bookingInquiriesService.list(db)).toHaveLength(1)
    expect(received).toHaveBeenCalledTimes(2)
    expect(received.mock.calls[0]?.[0]).toMatchObject({
      data: { inquiryId: created.inquiry.id, productId: "prod_1", departureId: "departure_1" },
      metadata: { eventId: `evt_booking_inquiry_created_${created.inquiry.id}` },
    })
    expect(received.mock.calls[1]?.[0]).toMatchObject({
      metadata: { eventId: `evt_booking_inquiry_created_${created.inquiry.id}` },
    })
  })

  it("rejects reuse of an inquiry identity with a different request", async () => {
    const command = {
      idempotencyKey: "ask-first-conflict",
      storefrontId: "storefront_1",
      channelId: "channel_1",
      productId: "prod_1",
      departureId: null,
      contact: { firstName: "Ana", lastName: null, email: "ana@example.com", phone: null },
      locale: "en",
      message: "First question",
    }
    await bookingInquiriesService.submit(db, command)

    const conflict = await bookingInquiriesService.submit(db, {
      ...command,
      message: "Different question",
    })

    expect(conflict.status).toBe("conflict")
    expect(await bookingInquiriesService.list(db)).toHaveLength(1)
  })
})
