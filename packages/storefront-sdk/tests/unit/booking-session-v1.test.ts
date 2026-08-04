import { describe, expect, it } from "vitest"

import { createVoyantStorefrontClient } from "../../src/index.js"

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

describe("Booking Session v1 SDK", () => {
  it("returns a payment continuation and resumes Commit on the same typed route", async () => {
    let commitAttempts = 0
    const calls: Array<{ url: string; body: Record<string, unknown> | undefined }> = []
    const fetcher = async (url: string, init?: RequestInit) => {
      const body = init?.body
        ? (JSON.parse(String(init.body)) as Record<string, unknown>)
        : undefined
      calls.push({ url, body })
      if (url.endsWith("/v1/public/catalog/booking-sessions")) {
        return json({ kind: "session_created", session: session(1) })
      }
      if (url.endsWith("/quote")) {
        return json({
          kind: "quote_created",
          session: session(1),
          quote: {
            id: "bsqu_demo",
            sessionId: "bses_demo",
            sessionRevision: 1,
            state: "active",
            requirements: REQUIREMENTS,
            requirementsFingerprint: "requirements-fingerprint-demo",
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
        })
      }
      if (url.endsWith("/hold")) {
        return json({
          kind: "hold_created",
          session: session(1),
          hold: {
            id: "bshd_demo",
            sessionId: "bses_demo",
            quoteId: "bsqu_demo",
            target: { kind: "product", productId: "prod_owned_1" },
            quantity: 1,
            state: "active",
            expiresAt: "2026-08-01T12:15:00.000Z",
            createdAt: "2026-08-01T12:00:00.000Z",
          },
        })
      }
      if (url.endsWith("/commit")) {
        commitAttempts += 1
        return commitAttempts === 1
          ? json({
              kind: "commit_result",
              outcome: {
                kind: "payment_required",
                nextAction: "establish_payment_guarantee",
                paymentTarget: "booking_session",
                allowedGuarantees: ["deposit"],
                paymentSession: {
                  id: "pays_demo",
                  status: "requires_redirect",
                  amountCents: 10000,
                  currency: "EUR",
                  redirectUrl: "https://payments.example.test/checkout/pays_demo",
                  expiresAt: "2026-08-01T12:15:00.000Z",
                },
              },
            })
          : json({
              kind: "commit_result",
              outcome: {
                kind: "committed",
                nextAction: "none",
                booking: { id: "book_demo", status: "confirmed" },
                allocationIds: ["bkac_demo"],
                consumedSessionId: "bses_demo",
                consumedQuoteId: "bsqu_demo",
                convertedHoldId: "bshd_demo",
              },
            })
      }
      return new Response("not found", { status: 404 })
    }
    const client = createVoyantStorefrontClient({ baseUrl: "https://example.test", fetcher })
    const requestOptions = { capability: "bcap_payment_continuation_1234567890" }

    const pending = await client.bookingSessionsV1.runOwnedProductTracer({
      target: { kind: "product", productId: "prod_owned_1" },
      journeyKey: "payment-journey",
      payment: {
        returnUrl: "https://storefront.example.test/payment/return",
        cancelUrl: "https://storefront.example.test/payment/cancel",
      },
      requestOptions,
    })
    expect(pending).toMatchObject({
      kind: "payment_required",
      commitOutcome: {
        outcome: {
          paymentSession: {
            redirectUrl: "https://payments.example.test/checkout/pays_demo",
          },
        },
      },
    })

    const resumed = await client.bookingSessionsV1.commit(
      "bses_demo",
      {
        expectedRevision: 1,
        quoteId: "bsqu_demo",
        requirementsFingerprint: "requirements-fingerprint-demo",
        holdId: "bshd_demo",
        idempotencyKey: "payment-journey:commit",
      },
      requestOptions,
    )
    expect(resumed).toMatchObject({
      kind: "commit_result",
      outcome: { kind: "committed", booking: { id: "book_demo" } },
    })
    expect(calls.filter((call) => call.url.endsWith("/commit"))).toHaveLength(2)
    expect(calls.find((call) => call.url.endsWith("/commit"))?.body).toMatchObject({
      payment: {
        returnUrl: "https://storefront.example.test/payment/return",
        cancelUrl: "https://storefront.example.test/payment/cancel",
      },
    })
  })

  it("runs the owned Product journey through only v1 Session, Quote, Hold, and Commit routes", async () => {
    const calls: Array<{ url: string; body: unknown; capability: string | null }> = []
    const fetcher = async (url: string, init?: RequestInit) => {
      const body = init?.body ? JSON.parse(String(init.body)) : undefined
      calls.push({
        url,
        body,
        capability: new Headers(init?.headers).get("Voyant-Booking-Session-Capability"),
      })

      if (url.endsWith("/v1/public/catalog/booking-sessions")) {
        return json({
          kind: "session_created",
          session: session(1),
          capability: {
            token: "capability_token_123456",
            transport: "header",
            headerName: "Voyant-Booking-Session-Capability",
          },
        })
      }
      if (url.endsWith("/v1/public/catalog/booking-sessions/bses_demo")) {
        return json({
          kind: "session_updated",
          session: session(2),
        })
      }
      if (url.endsWith("/v1/public/catalog/booking-sessions/bses_demo/quote")) {
        return json({
          kind: "quote_created",
          session: session(2),
          quote: {
            id: "bsqu_demo",
            sessionId: "bses_demo",
            sessionRevision: 2,
            state: "active",
            requirements: REQUIREMENTS,
            requirementsFingerprint: "requirements-fingerprint-demo",
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
        })
      }
      if (url.endsWith("/v1/public/catalog/booking-sessions/bses_demo/hold")) {
        return json({
          kind: "hold_created",
          session: session(2),
          hold: {
            id: "bshd_demo",
            sessionId: "bses_demo",
            quoteId: "bsqu_demo",
            target: { kind: "product", productId: "prod_owned_1" },
            quantity: 1,
            state: "active",
            expiresAt: "2026-08-01T12:15:00.000Z",
            createdAt: "2026-08-01T12:00:00.000Z",
          },
        })
      }
      if (url.endsWith("/v1/public/catalog/booking-sessions/bses_demo/commit")) {
        return json({
          kind: "commit_result",
          outcome: {
            kind: "committed",
            nextAction: "none",
            booking: { id: "book_demo", status: "confirmed" },
            allocationIds: ["bkac_demo"],
            consumedSessionId: "bses_demo",
            consumedQuoteId: "bsqu_demo",
            convertedHoldId: "bshd_demo",
          },
        })
      }
      return new Response("not found", { status: 404 })
    }

    const client = createVoyantStorefrontClient({ baseUrl: "https://example.test", fetcher })
    const capability = "bcap_client_generated_capability_1234567890"
    const result = await client.bookingSessionsV1.runOwnedProductTracer({
      target: { kind: "product", productId: "prod_owned_1" },
      journeyKey: "test-journey",
      state: { departureSlotId: "avsl_demo", pax: { adult: 1 } },
      requestOptions: { capability },
    })

    expect(result.kind).toBe("completed")
    if (result.kind !== "completed") {
      throw new Error(`expected completed tracer result, received ${result.stage}`)
    }
    expect(result.commitOutcome).toMatchObject({
      kind: "commit_result",
      outcome: { kind: "committed", booking: { status: "confirmed" } },
    })
    expect(calls.map((call) => new URL(call.url).pathname)).toEqual([
      "/v1/public/catalog/booking-sessions",
      "/v1/public/catalog/booking-sessions/bses_demo",
      "/v1/public/catalog/booking-sessions/bses_demo/quote",
      "/v1/public/catalog/booking-sessions/bses_demo/hold",
      "/v1/public/catalog/booking-sessions/bses_demo/commit",
    ])
    expect(calls[0]?.body).toMatchObject({
      idempotencyKey: "test-journey:create",
      target: { kind: "product", productId: "prod_owned_1" },
    })
    expect(calls[0]?.capability).toBe(capability)
    expect(calls[0]?.body).not.toHaveProperty("capability")
    expect(calls[1]?.body).toMatchObject({
      expectedRevision: 1,
      idempotencyKey: "test-journey:update",
    })
    expect(calls[1]?.body).not.toHaveProperty("capability")
    expect(calls[2]?.body).toMatchObject({
      expectedRevision: 2,
      idempotencyKey: "test-journey:quote",
    })
    expect(calls[2]?.body).not.toHaveProperty("capability")
    expect(calls[3]?.body).toMatchObject({
      expectedRevision: 2,
      quoteId: "bsqu_demo",
      idempotencyKey: "test-journey:hold",
    })
    expect(calls[3]?.body).not.toHaveProperty("capability")
    expect(calls[4]?.body).toMatchObject({
      expectedRevision: 2,
      quoteId: "bsqu_demo",
      holdId: "bshd_demo",
      idempotencyKey: "test-journey:commit",
    })
    expect(calls.slice(1).map((call) => call.capability)).toEqual([
      capability,
      capability,
      capability,
      capability,
    ])
  })
})

function session(revision: number) {
  return {
    id: "bses_demo",
    target: { kind: "product", productId: "prod_owned_1" },
    actorKind: "anonymous",
    scope: { locale: "en", market: "default" },
    state: "active",
    revision,
    expiresAt: "2026-08-02T12:00:00.000Z",
    createdAt: "2026-08-01T12:00:00.000Z",
    updatedAt: "2026-08-01T12:00:00.000Z",
  }
}

function json(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  })
}
