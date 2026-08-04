import { describe, expect, it, vi } from "vitest"

import {
  commitManualBookingSessionV1,
  type ManualBookingSessionContinuation,
} from "../../src/manual-booking-session-client.js"

const REQUIREMENTS = {
  showsConfigure: true,
  showsBilling: true,
  showsTravelers: true,
  showsAccommodation: false,
  showsAddons: false,
  showsPayment: true,
  showsReview: true,
  paxBands: [{ code: "adult", label: "Adult", minCount: 1, maxCount: 8 }],
  paxBandsAllowedTotal: { min: 1, max: 8 },
  travelerFields: [],
  bookingFields: [],
  paymentIntents: ["card"],
}

function json(body: unknown) {
  return Response.json(body)
}

describe("manual Booking Session v1 client", () => {
  it("uses only authenticated Session, Quote, Hold, and Commit routes", async () => {
    const calls: Array<{ url: string; body: Record<string, unknown> }> = []
    const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>
      calls.push({ url, body })
      if (url.endsWith("/booking-sessions")) {
        return json({ kind: "session_created", session: session() })
      }
      if (url.endsWith("/quote")) return json(quote())
      if (url.endsWith("/hold")) return json(hold())
      return json({
        kind: "commit_result",
        outcome: {
          kind: "committed",
          nextAction: "none",
          booking: { id: "book_1", status: "confirmed" },
          allocationIds: ["bkac_1"],
          consumedSessionId: "bses_1",
          consumedQuoteId: "bsqu_1",
          convertedHoldId: "bshd_1",
        },
      })
    })

    await expect(
      commitManualBookingSessionV1(
        { baseUrl: "https://operator.test", fetcher },
        {
          productId: "prod_1",
          selection: { configure: { pax: { adult: 2 } }, staffBooking: { personId: "pers_1" } },
          quantity: 2,
          idempotencyKey: "manual-booking:stable",
        },
      ),
    ).resolves.toEqual({ kind: "committed", bookingId: "book_1" })
    expect(calls.map((call) => call.url)).toEqual([
      "https://operator.test/v1/admin/catalog/booking-sessions",
      "https://operator.test/v1/admin/catalog/booking-sessions/bses_1/quote",
      "https://operator.test/v1/admin/catalog/booking-sessions/bses_1/hold",
      "https://operator.test/v1/admin/catalog/booking-sessions/bses_1/commit",
    ])
    expect(calls.map((call) => call.body.idempotencyKey)).toEqual([
      "manual-booking:stable:create",
      "manual-booking:stable:quote",
      "manual-booking:stable:hold",
      "manual-booking:stable:commit",
    ])
    expect(calls[2]?.body.quantity).toBe(2)
  })

  it("returns the same Commit continuation when payment is required", async () => {
    const fetcher = vi.fn(async (url: string) => {
      if (url.endsWith("/booking-sessions")) {
        return json({ kind: "session_created", session: session() })
      }
      if (url.endsWith("/quote")) return json(quote())
      if (url.endsWith("/hold")) return json(hold())
      return json({
        kind: "commit_result",
        outcome: {
          kind: "payment_required",
          nextAction: "establish_payment_guarantee",
          paymentTarget: "booking_session",
          allowedGuarantees: ["deposit"],
          paymentSession: {
            id: "pays_1",
            status: "requires_redirect",
            amountCents: 5000,
            currency: "EUR",
            redirectUrl: "https://payments.test/pays_1",
            expiresAt: "2026-08-01T12:15:00.000Z",
          },
        },
      })
    })

    await expect(
      commitManualBookingSessionV1(
        { baseUrl: "", fetcher },
        {
          productId: "prod_1",
          selection: {},
          quantity: 1,
          idempotencyKey: "manual-booking:payment",
        },
      ),
    ).resolves.toEqual({
      kind: "payment_required",
      sessionId: "bses_1",
      revision: 1,
      quoteId: "bsqu_1",
      holdId: "bshd_1",
      commitIdempotencyKey: "manual-booking:payment:commit",
      redirectUrl: "https://payments.test/pays_1",
    })
  })

  it("retries only Commit when the first Commit response is lost", async () => {
    let continuation: ManualBookingSessionContinuation | undefined
    const firstFetcher = vi.fn(async (url: string) => {
      if (url.endsWith("/booking-sessions")) {
        return json({ kind: "session_created", session: session() })
      }
      if (url.endsWith("/quote")) return json(quote())
      if (url.endsWith("/hold")) return json(hold())
      throw new Error("connection reset after Commit")
    })

    await expect(
      commitManualBookingSessionV1(
        { baseUrl: "", fetcher: firstFetcher },
        {
          productId: "prod_1",
          selection: {},
          quantity: 1,
          idempotencyKey: "manual-booking:retry",
          onContinuation: (value) => {
            continuation = value
          },
        },
      ),
    ).rejects.toThrow("connection reset after Commit")
    expect(continuation).toEqual({
      sessionId: "bses_1",
      revision: 1,
      quoteId: "bsqu_1",
      holdId: "bshd_1",
      commitIdempotencyKey: "manual-booking:retry:commit",
    })

    const retryFetcher = vi.fn(async () =>
      json({
        kind: "commit_result",
        outcome: {
          kind: "idempotent_replay",
          nextAction: "return_idempotent_result",
          originalCommitId: "bscm_1",
          originalOutcome: {
            kind: "committed",
            nextAction: "none",
            booking: { id: "book_1", status: "confirmed" },
            allocationIds: ["bkac_1"],
            consumedSessionId: "bses_1",
            consumedQuoteId: "bsqu_1",
            convertedHoldId: "bshd_1",
          },
        },
      }),
    )
    await expect(
      commitManualBookingSessionV1(
        { baseUrl: "", fetcher: retryFetcher },
        {
          productId: "prod_1",
          selection: {},
          quantity: 1,
          idempotencyKey: "manual-booking:retry",
          ...(continuation ? { continuation } : {}),
        },
      ),
    ).resolves.toEqual({ kind: "committed", bookingId: "book_1" })
    expect(retryFetcher).toHaveBeenCalledTimes(1)
    expect(retryFetcher).toHaveBeenCalledWith(
      "/v1/admin/catalog/booking-sessions/bses_1/commit",
      expect.objectContaining({ credentials: "include", method: "POST" }),
    )
  })

  it("exposes typed recovery without embedding UI copy", async () => {
    const fetcher = vi.fn(async () =>
      json({
        kind: "rejected",
        error: {
          kind: "revision_conflict",
          expectedRevision: 1,
          actualRevision: 2,
          actualState: "active",
        },
      }),
    )

    await expect(
      commitManualBookingSessionV1(
        { baseUrl: "", fetcher },
        {
          productId: "prod_1",
          selection: {},
          quantity: 1,
          idempotencyKey: "manual-booking:conflict",
        },
      ),
    ).rejects.toMatchObject({
      name: "ManualBookingSessionError",
      message: "manual_booking_session_revisionConflict",
      recovery: "revisionConflict",
    })
  })
})

function session() {
  return {
    id: "bses_1",
    target: { kind: "product", productId: "prod_1" },
    actorKind: "staff",
    scope: { locale: "en", market: "default" },
    state: "active",
    revision: 1,
    expiresAt: "2026-08-01T13:00:00.000Z",
    createdAt: "2026-08-01T12:00:00.000Z",
    updatedAt: "2026-08-01T12:00:00.000Z",
  }
}

function quote() {
  return {
    kind: "quote_created",
    session: session(),
    quote: {
      id: "bsqu_1",
      sessionId: "bses_1",
      sessionRevision: 1,
      state: "active",
      requirements: REQUIREMENTS,
      pricing: {
        currency: "EUR",
        lines: [],
        taxes: [],
        subtotal: 10000,
        taxTotal: 0,
        total: 10000,
      },
      quotedAt: "2026-08-01T12:00:00.000Z",
      expiresAt: "2026-08-01T12:10:00.000Z",
    },
  }
}

function hold() {
  return {
    kind: "hold_created",
    session: session(),
    hold: {
      id: "bshd_1",
      sessionId: "bses_1",
      quoteId: "bsqu_1",
      target: { kind: "product", productId: "prod_1" },
      quantity: 1,
      state: "active",
      expiresAt: "2026-08-01T12:15:00.000Z",
      createdAt: "2026-08-01T12:00:00.000Z",
    },
  }
}
