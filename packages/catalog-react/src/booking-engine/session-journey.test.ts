import { describe, expect, it, vi } from "vitest"

import {
  type BookingSessionJourneyContinuation,
  commitBookingSessionJourneyV1,
} from "./session-journey.js"
import {
  BookingSessionJourneyError,
  bookingSessionContinuationIsStale,
  unsatisfiedBookingRequirements,
} from "./session-outcomes.js"
import { createBookingJourneyApi } from "./use-booking-journey-api.js"

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

describe("Booking Session v1 journey", () => {
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
      commitBookingSessionJourneyV1(
        createBookingJourneyApi({ baseUrl: "https://operator.test", fetcher }),
        {
          target: { kind: "product", productId: "prod_1" },
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

  it("sends no Hold quantity when the host states none", async () => {
    // The server derives the party size from the selection it was just sent.
    // Inventing a `1` here is what made a two-traveler checkout unholdable —
    // the server rejected its own invented quantity and asked for a retry that
    // sent the same `1` again (voyant#4655).
    const calls: Array<{ url: string; body: Record<string, unknown> }> = []
    const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, body: JSON.parse(String(init?.body)) as Record<string, unknown> })
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
      commitBookingSessionJourneyV1(createBookingJourneyApi({ baseUrl: "", fetcher }), {
        target: { kind: "product", productId: "prod_1" },
        selection: { configure: { pax: { adult: 3 } } },
        idempotencyKey: "storefront:stable",
      }),
    ).resolves.toEqual({ kind: "committed", bookingId: "book_1" })

    const holdBody = calls.find((call) => call.url.endsWith("/hold"))?.body
    expect(holdBody).toBeDefined()
    expect("quantity" in (holdBody ?? {})).toBe(false)
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
            checkout: { kind: "redirect", url: "https://payments.test/pays_1" },
            expiresAt: "2026-08-01T12:15:00.000Z",
          },
        },
      })
    })

    await expect(
      commitBookingSessionJourneyV1(createBookingJourneyApi({ baseUrl: "", fetcher }), {
        target: { kind: "product", productId: "prod_1" },
        selection: {},
        quantity: 1,
        idempotencyKey: "manual-booking:payment",
      }),
    ).resolves.toEqual({
      kind: "payment_required",
      sessionId: "bses_1",
      revision: 1,
      quoteId: "bsqu_1",
      requirementsFingerprint: "requirements-fingerprint-1",
      holdId: "bshd_1",
      commitIdempotencyKey: "manual-booking:payment:commit",
      paymentSessionId: "pays_1",
      checkout: { kind: "redirect", url: "https://payments.test/pays_1" },
      redirectUrl: "https://payments.test/pays_1",
    })
  })

  it("carries the stated handoff preference to Commit and hands back the payment session id", async () => {
    const calls: Array<{ url: string; body: Record<string, unknown> }> = []
    const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, body: JSON.parse(String(init?.body ?? "{}")) })
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
            // An embedded handoff carries no URL, so `redirectUrl` alone would
            // tell the storefront to pay and give it nowhere to do it.
            redirectUrl: null,
            checkout: {
              kind: "embedded",
              clientSecret: "cs_test_secret",
              publishableKey: "pk_test_key",
            },
            expiresAt: "2026-08-01T12:15:00.000Z",
          },
        },
      })
    })

    const result = await commitBookingSessionJourneyV1(
      createBookingJourneyApi({ baseUrl: "", fetcher }),
      {
        target: { kind: "product", productId: "prod_1" },
        selection: {},
        quantity: 1,
        idempotencyKey: "manual-booking:embedded",
        payment: { acceptedCheckoutHandoffs: ["embedded", "redirect"] },
      },
    )

    expect(calls.at(-1)?.body.payment).toEqual({
      acceptedCheckoutHandoffs: ["embedded", "redirect"],
    })
    // The whole point of stating the preference: the client secret survives the
    // round trip. A projection that stopped at `redirectUrl` would hand back a
    // null URL and nothing to mount.
    expect(result).toMatchObject({
      kind: "payment_required",
      paymentSessionId: "pays_1",
      redirectUrl: null,
      checkout: {
        kind: "embedded",
        clientSecret: "cs_test_secret",
        publishableKey: "pk_test_key",
      },
    })
  })

  it("retries only Commit when the first Commit response is lost", async () => {
    let continuation: BookingSessionJourneyContinuation | undefined
    const firstFetcher = vi.fn(async (url: string) => {
      if (url.endsWith("/booking-sessions")) {
        return json({ kind: "session_created", session: session() })
      }
      if (url.endsWith("/quote")) return json(quote())
      if (url.endsWith("/hold")) return json(hold())
      throw new Error("connection reset after Commit")
    })

    await expect(
      commitBookingSessionJourneyV1(
        createBookingJourneyApi({ baseUrl: "", fetcher: firstFetcher }),
        {
          target: { kind: "product", productId: "prod_1" },
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
      requirementsFingerprint: "requirements-fingerprint-1",
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
      commitBookingSessionJourneyV1(
        createBookingJourneyApi({ baseUrl: "", fetcher: retryFetcher }),
        {
          target: { kind: "product", productId: "prod_1" },
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

  it("classifies a failed Commit by its outcome rather than as unknown", async () => {
    // The Commit envelope is `commit_result`, not `rejected`, so a mapper that
    // only reads rejections hands the operator the generic fallback for a
    // fully-structured failure (voyant#4662).
    const fetcher = vi.fn(async (url: string) => {
      if (url.endsWith("/booking-sessions")) {
        return json({ kind: "session_created", session: session() })
      }
      if (url.endsWith("/quote")) return json(quote())
      if (url.endsWith("/hold")) return json(hold())
      return json({
        kind: "commit_result",
        outcome: {
          kind: "quote_failure",
          nextAction: "request_fresh_quote",
          reason: "superseded",
        },
      })
    })

    const failure = await commitBookingSessionJourneyV1(
      createBookingJourneyApi({ baseUrl: "", fetcher }),
      {
        target: { kind: "product", productId: "prod_1" },
        selection: {},
        quantity: 1,
        idempotencyKey: "manual-booking:commit-quote-failure",
      },
    ).catch((error: unknown) => error)

    expect(failure).toBeInstanceOf(BookingSessionJourneyError)
    const error = failure as BookingSessionJourneyError
    expect(error.recovery).toBe("quoteChanged")
    expect(error.message).toBe("booking_session_quoteChanged")
    // `rejected` is the only envelope carrying a lifecycle error, so this stays
    // null — the Commit outcome is where the cause lives.
    expect(error.error).toBeNull()
    expect(error.commitOutcome).toMatchObject({ kind: "quote_failure", reason: "superseded" })
    expect(error.nextAction).toBe("request_fresh_quote")
    expect(bookingSessionContinuationIsStale(error.outcome)).toBe(true)
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
      commitBookingSessionJourneyV1(createBookingJourneyApi({ baseUrl: "", fetcher }), {
        target: { kind: "product", productId: "prod_1" },
        selection: {},
        quantity: 1,
        idempotencyKey: "manual-booking:conflict",
      }),
    ).rejects.toMatchObject({
      name: "BookingSessionJourneyError",
      message: "booking_session_revisionConflict",
      recovery: "revisionConflict",
    })
  })

  it("carries the unsatisfied requirement list through instead of flattening it", async () => {
    const unsatisfied = [
      { requirementKey: "paxBands.adult", reason: "pax_band_below_min" },
      { requirementKey: "travelerFields.passportNumber", reason: "traveler_field_required" },
    ]
    const fetcher = vi.fn(async () =>
      json({
        kind: "rejected",
        error: { kind: "selection_incomplete", unsatisfied, nextAction: "update_selection" },
      }),
    )

    const failure = await commitBookingSessionJourneyV1(
      createBookingJourneyApi({ baseUrl: "", fetcher }),
      {
        target: { kind: "product", productId: "prod_1" },
        selection: {},
        quantity: 1,
        idempotencyKey: "manual-booking:incomplete",
      },
    ).catch((error: unknown) => error)

    expect(failure).toBeInstanceOf(BookingSessionJourneyError)
    const error = failure as BookingSessionJourneyError
    // The point of typed outcomes: a host renders this list, field by field.
    expect(error.unsatisfied).toEqual(unsatisfied)
    expect(error.error).toMatchObject({ kind: "selection_incomplete" })
    expect(error.recovery).toBe("selectionIncomplete")
    expect(unsatisfiedBookingRequirements(error.outcome)).toEqual(unsatisfied)
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
      requirementsFingerprint: "requirements-fingerprint-1",
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
