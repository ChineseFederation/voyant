import { describe, expect, it } from "vitest"

import { createVoyantStorefrontClient, type PublicBookingSessionRecord } from "../../src/index.js"

function session(overrides: Partial<PublicBookingSessionRecord> = {}): PublicBookingSessionRecord {
  return {
    sessionId: "book_123",
    bookingNumber: "BK-2605-000001",
    status: "on_hold",
    externalBookingRef: null,
    communicationLanguage: null,
    sellCurrency: "EUR",
    sellAmountCents: 10000,
    startDate: null,
    endDate: null,
    pax: 1,
    holdExpiresAt: "2026-06-01T10:00:00.000Z",
    confirmedAt: null,
    expiredAt: null,
    cancelledAt: null,
    completedAt: null,
    travelers: [],
    items: [],
    allocations: [],
    checklist: {
      hasTravelers: false,
      hasPrimaryTraveler: false,
      hasItems: true,
      hasAllocations: true,
      readyForConfirmation: false,
    },
    state: null,
    ...overrides,
  }
}

describe("bookingEngine facade", () => {
  it("fetches a session and returns a canonical engine snapshot", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = []
    const voyant = createVoyantStorefrontClient({
      baseUrl: "https://operator.example.com/",
      fetcher: async (url, init) => {
        calls.push({ url, init })
        return Response.json({ data: session() })
      },
    })

    const snapshot = await voyant.bookingEngine.getSnapshot("book_123")

    expect(calls[0]?.url).toBe("https://operator.example.com/v1/public/bookings/sessions/book_123")
    expect(snapshot.session.sessionId).toBe("book_123")
    expect(snapshot.engine.state).toBe("reserved")
    expect(snapshot.engine.allowedActions).toContain("update_travelers")
  })

  it("normalizes public booking-engine error envelopes", async () => {
    const voyant = createVoyantStorefrontClient({
      baseUrl: "https://operator.example.com",
      fetcher: async () =>
        Response.json(
          {
            error: {
              code: "payment_webhook_pending",
              message: "Payment webhook has not finalized the booking yet.",
              recoverable: true,
              nextAction: "poll_payment_status",
            },
          },
          { status: 409 },
        ),
    })

    await expect(voyant.bookingEngine.confirm("book_123")).rejects.toMatchObject({
      status: 409,
      message: "Payment webhook has not finalized the booking yet.",
      normalizedError: {
        code: "payment_webhook_pending",
        recoverable: true,
        nextAction: "poll_payment_status",
      },
    })
  })
})
