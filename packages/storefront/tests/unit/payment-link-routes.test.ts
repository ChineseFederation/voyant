// agent-quality: file-size exception -- owner: storefront; payment-link route
// contract coverage stays co-located so callback/start-card/summary behavior
// shares the same route harness and session query stubs.
import { createEventBus, type EventBus } from "@voyant-travel/core"
import { financeService } from "@voyant-travel/finance"
import { normalizeValidationError } from "@voyant-travel/hono"
import { PAYMENT_ADAPTER_CONTRACT_VERSION, type PaymentAdapter } from "@voyant-travel/payments"
import { Hono } from "hono"
import { afterEach, describe, expect, it, vi } from "vitest"

import {
  createPaymentLinkApiModule,
  createPaymentLinkRoutes,
  createPaymentStatusRefreshHandler,
  createVerifiedPaymentCallbackHandler,
  PAYMENT_LINK_ROUTE_PATHS,
  type PaymentLinkRoutesOptions,
} from "../../src/payment-link/routes.js"

/**
 * A tiny chainable stub that mimics the drizzle query-builder surface the
 * handlers use: `db.select(...).from(...).where(...).limit(...)` (awaitable),
 * optionally `.orderBy(...)`. Each call shifts the next queued result off
 * `rows`, so a test seeds the rows in the order the handler queries them.
 */
function makeDb(rows: unknown[][]) {
  let cursor = 0
  const builder: Record<string, unknown> = {}
  const chain = () => builder
  builder.select = chain
  builder.from = chain
  builder.where = chain
  builder.orderBy = chain
  builder.limit = chain
  // Make the builder awaitable — resolves to the next queued result set.
  // biome-ignore lint/suspicious/noThenProperty: test stub mimics a thenable drizzle query builder -- owner: storefront.
  ;(builder as { then: unknown }).then = (
    resolve: (value: unknown) => unknown,
    reject?: (reason: unknown) => unknown,
  ) => {
    try {
      const value = rows[cursor++] ?? []
      return Promise.resolve(value).then(resolve, reject)
    } catch (err) {
      return Promise.reject(err)
    }
  }
  return builder
}

function mountApp(options: PaymentLinkRoutesOptions, db: unknown, eventBus?: EventBus) {
  const app = new Hono()
  app.onError((err, c) => {
    const apiError = normalizeValidationError(err)
    if (!apiError) throw err
    return c.json({ error: apiError.message, code: apiError.code }, apiError.status)
  })
  app.use("*", async (c, next) => {
    c.set("db" as never, db as never)
    if (eventBus) c.set("eventBus" as never, eventBus as never)
    await next()
  })
  app.route("/", createPaymentLinkRoutes(options))
  return app
}

function stubOptions(overrides: Partial<PaymentLinkRoutesOptions> = {}): PaymentLinkRoutesOptions {
  return {
    resolveBankTransferDetails: vi.fn(async () => ({
      beneficiary: "Acme Travel SRL",
      iban: "RO49AAAA1B31007593840000",
      bankName: "Acme Bank",
    })),
    resolvePublicCheckoutBaseUrl: vi.fn(() => "https://checkout.example.com"),
    startCardPayment: vi.fn(async () => ({ configured: false }) as const),
    resolveTripData: vi.fn(async () => null),
    ...overrides,
  }
}

function makePaymentAdapter(verifyCallback: PaymentAdapter["verifyCallback"]): PaymentAdapter {
  return {
    id: "test-payment-adapter",
    label: "Test payment adapter",
    contractVersion: PAYMENT_ADAPTER_CONTRACT_VERSION,
    mode: "test",
    capabilities: {
      hostedCheckout: true,
      redirectCheckout: true,
      authorize: false,
      capture: false,
      void: false,
      refund: false,
      status: false,
      callbackSignatureVerification: true,
      idempotencyKeys: true,
      retrySafeInitiation: true,
    },
    initiate: vi.fn(async (_context, input) => ({
      nextState: "processing",
      idempotencyKey: input.idempotencyKey,
    })),
    verifyCallback,
    health: vi.fn(async () => ({ status: "ok", checkedAt: "2026-07-22T00:00:00.000Z" })),
  }
}

describe("createPaymentLinkRoutes", () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("describes the package-owned anonymous lazy route module", () => {
    const module = createPaymentLinkApiModule(stubOptions())

    expect(module).toMatchObject({
      module: { name: "payment-link" },
      publicPath: "/",
      anonymous: ["payment-link-config", "payment-link"],
    })
    expect(module.lazyRoutes?.paths).toBe(PAYMENT_LINK_ROUTE_PATHS)
    expect(module.lazyRoutes?.load).toBeTypeOf("function")
  })

  it("applies a verified managed callback with the request event bus", async () => {
    const eventBus = createEventBus()
    const event = {
      eventId: "evt_paid",
      paymentSessionId: "ps_paid",
      nextState: "paid" as const,
      occurredAt: "2026-07-21T10:00:00.000Z",
    }
    const adapter = makePaymentAdapter(vi.fn(async () => ({ verified: true as const, event })))
    const applyEvent = vi.fn(async () => undefined)
    const app = mountApp(
      stubOptions({
        verifyAndApplyPaymentCallback: createVerifiedPaymentCallbackHandler(adapter, {
          applyEvent,
        }),
      }),
      makeDb([]),
      eventBus,
    )

    const response = await app.request("/v1/public/payment-link/callback?connectionId=conn_123", {
      method: "POST",
      headers: { "x-payment-signature": "valid" },
      body: "signed-body",
    })

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ ok: true })
    expect(adapter.verifyCallback).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ connectionId: "conn_123" }),
    )
    expect(applyEvent).toHaveBeenCalledWith(expect.anything(), event, { eventBus })
  })

  it("temporarily accepts the legacy callback connection-id query spelling", async () => {
    const eventBus = createEventBus()
    const adapter = makePaymentAdapter(
      vi.fn(async () => ({
        verified: true as const,
        event: {
          eventId: "evt_paid",
          paymentSessionId: "ps_paid",
          nextState: "paid" as const,
          occurredAt: "2026-07-21T10:00:00.000Z",
        },
      })),
    )
    const app = mountApp(
      stubOptions({
        verifyAndApplyPaymentCallback: createVerifiedPaymentCallbackHandler(adapter, {
          applyEvent: vi.fn(async () => undefined),
        }),
      }),
      makeDb([]),
      eventBus,
    )

    await app.request("/v1/public/payment-link/callback?connection-id=legacy_conn", {
      method: "POST",
      headers: { "x-payment-signature": "valid" },
      body: "signed-body",
    })

    expect(adapter.verifyCallback).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ connectionId: "legacy_conn" }),
    )
  })

  it("rejects an unverified managed callback without applying an event", async () => {
    const adapter = makePaymentAdapter(
      vi.fn(async () => ({
        verified: false as const,
        reason: "invalid_signature" as const,
      })),
    )
    const applyEvent = vi.fn(async () => undefined)
    const app = mountApp(
      stubOptions({
        verifyAndApplyPaymentCallback: createVerifiedPaymentCallbackHandler(adapter, {
          applyEvent,
        }),
      }),
      makeDb([]),
    )

    const response = await app.request("/v1/public/payment-link/callback", {
      method: "POST",
      body: "unsigned-body",
    })

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ ok: false, reason: "invalid_signature" })
    expect(applyEvent).not.toHaveBeenCalled()
  })

  it("reconciles status through the selected adapter with the request event bus", async () => {
    const eventBus = createEventBus()
    const adapter = makePaymentAdapter(
      vi.fn(async () => ({ verified: false as const, reason: "malformed" })),
    )
    const refreshStatus = vi.fn(async () => ({ status: "paid" }))
    const app = mountApp(
      stubOptions({
        refreshPaymentSessionStatus: createPaymentStatusRefreshHandler(adapter, { refreshStatus }),
      }),
      makeDb([
        [
          {
            id: "bk_scoped",
            bookingNumber: "B-SCOPED",
            status: "awaiting_payment",
            updatedAt: new Date("2026-07-25T10:00:00Z"),
          },
        ],
        [
          {
            id: "ps_scoped",
            status: "requires_redirect",
            amountCents: 12000,
            currency: "RON",
            invoiceId: null,
            paymentMethod: "credit_card",
            completedAt: null,
            failedAt: null,
            updatedAt: new Date("2026-07-25T10:01:00Z"),
          },
        ],
        [
          {
            id: "ps_scoped",
            status: "paid",
            amountCents: 12000,
            currency: "RON",
            invoiceId: null,
            paymentMethod: "credit_card",
            completedAt: new Date("2026-07-25T10:02:00Z"),
            failedAt: null,
            updatedAt: new Date("2026-07-25T10:02:00Z"),
          },
        ],
      ]),
      eventBus,
    )

    const response = await app.request(
      "/v1/public/bookings/bk_scoped/checkout-status?ref=ps_scoped",
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({
      data: {
        bookingId: "bk_scoped",
        paymentStatus: "paid",
        session: { id: "ps_scoped", status: "paid" },
      },
    })
    expect(refreshStatus).toHaveBeenCalledWith(
      adapter,
      expect.anything(),
      "ps_scoped",
      expect.objectContaining({ runtime: { eventBus } }),
    )
  })

  it("payment-link-config returns instructions + checkout base url with cache header", async () => {
    const options = stubOptions()
    const app = mountApp(options, makeDb([]))

    const res = await app.request("/v1/public/payment-link-config")

    expect(res.status).toBe(200)
    expect(res.headers.get("Cache-Control")).toBe(
      "public, s-maxage=300, stale-while-revalidate=600",
    )
    expect(await res.json()).toEqual({
      data: {
        publicCheckoutBaseUrl: "https://checkout.example.com",
        bankTransfer: {
          beneficiary: "Acme Travel SRL",
          iban: "RO49AAAA1B31007593840000",
          bankName: "Acme Bank",
        },
      },
    })
  })

  it("resolve returns the matched session id", async () => {
    const db = makeDb([[{ id: "ps_resolved" }]])
    const app = mountApp(stubOptions(), db)

    const res = await app.request("/v1/public/payment-link/resolve?ref=client-123")

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ data: { sessionId: "ps_resolved" } })
  })

  it("resolve 400s without a ref query param", async () => {
    const app = mountApp(stubOptions(), makeDb([]))

    const res = await app.request("/v1/public/payment-link/resolve")

    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: "ref query param is required" })
  })

  it("resolve 404s when no session matches", async () => {
    const app = mountApp(stubOptions(), makeDb([[]]))

    const res = await app.request("/v1/public/payment-link/resolve?ref=missing")

    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: "Payment session not found" })
  })

  it("start-card 503s when the card processor is not configured", async () => {
    // First queued row: the session lookup (no redirectUrl → falls through to start).
    const db = makeDb([
      [
        {
          id: "ps_1",
          status: "pending",
          redirectUrl: null,
          returnUrl: null,
          amountCents: 12000,
          currency: "RON",
          payerName: null,
          payerEmail: null,
          notes: null,
        },
      ],
    ])
    const startCardPayment = vi.fn(async () => ({ configured: false }) as const)
    const app = mountApp(stubOptions({ startCardPayment }), db)

    const res = await app.request("/v1/public/payment-link/ps_1/start-card", { method: "POST" })

    expect(res.status).toBe(503)
    expect(await res.json()).toEqual({ error: "Card processor not configured" })
    expect(startCardPayment).toHaveBeenCalledOnce()
  })

  it("start-card does not expose downstream processor errors", async () => {
    const db = makeDb([
      [
        {
          id: "ps_1",
          status: "pending",
          redirectUrl: null,
          returnUrl: null,
          amountCents: 12000,
          currency: "RON",
          payerName: null,
          payerEmail: null,
          notes: null,
        },
      ],
    ])
    const app = mountApp(
      stubOptions({
        startCardPayment: vi.fn(async () => {
          throw new Error("control-plane credential secret")
        }),
      }),
      db,
    )

    const res = await app.request("/v1/public/payment-link/ps_1/start-card", { method: "POST" })

    expect(res.status).toBe(502)
    expect(await res.json()).toEqual({ error: "Card processor failed to start the payment" })
  })

  it("retry keeps an active processor attempt on the same Voyant session", async () => {
    const db = makeDb([
      [
        {
          id: "ps_active",
          status: "processing",
        },
      ],
    ])
    const app = mountApp(stubOptions(), db)

    const res = await app.request("/v1/public/payment-link/ps_active/retry", { method: "POST" })

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      data: { sessionId: "ps_active", alreadyPaid: false },
    })
  })

  it("retry does not describe an authorized but uncaptured session as paid", async () => {
    const db = makeDb([
      [
        {
          id: "ps_authorized",
          status: "authorized",
        },
      ],
    ])
    const app = mountApp(stubOptions(), db)

    const res = await app.request("/v1/public/payment-link/ps_authorized/retry", {
      method: "POST",
    })

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      data: { sessionId: "ps_authorized", alreadyPaid: false },
    })
  })

  it("retry creates an identity-free Voyant session after a terminal attempt", async () => {
    const db = makeDb([
      [
        {
          id: "ps_failed",
          status: "failed",
          targetType: "invoice",
          targetId: "inv_1",
          bookingId: "book_1",
          invoiceId: "inv_1",
          bookingPaymentScheduleId: null,
          bookingGuaranteeId: null,
          currency: "RON",
          amountCents: 12000,
          provider: "netopia",
          providerConnectionId: "payment_connection_old",
          providerSessionId: "processor_session_old",
          providerPaymentId: "processor_payment_old",
          idempotencyKey: "old-idempotency-key",
          paymentMethod: "credit_card",
          payerEmail: "payer@example.com",
          payerName: "Payer",
          returnUrl: "https://checkout.example.com/stored-return",
          cancelUrl: "https://checkout.example.com/stored-cancel",
          notes: "Deposit",
        },
      ],
    ])
    const createPaymentSession = vi
      .spyOn(financeService, "createPaymentSession")
      .mockResolvedValue({ id: "ps_fresh" } as never)
    const app = mountApp(stubOptions(), db)

    const res = await app.request("/v1/public/payment-link/ps_failed/retry", { method: "POST" })

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ data: { sessionId: "ps_fresh" } })
    const input = createPaymentSession.mock.calls[0]?.[1]
    expect(input).not.toHaveProperty("provider")
    expect(input).not.toHaveProperty("providerConnectionId")
    expect(input).not.toHaveProperty("providerSessionId")
    expect(input).not.toHaveProperty("providerPaymentId")
    expect(input).not.toHaveProperty("idempotencyKey")
    expect(input).toMatchObject({
      returnUrl: "https://checkout.example.com/stored-return",
      cancelUrl: "https://checkout.example.com/stored-cancel",
    })
  })

  it("start-card reuses an active session redirect without invoking the provider", async () => {
    const db = makeDb([
      [
        {
          id: "ps_1",
          status: "requires_redirect",
          redirectUrl: "https://pay.example.com/stale",
          returnUrl: "https://checkout.example.com/return",
          amountCents: 12000,
          currency: "RON",
          payerName: "Ada Lovelace",
          payerEmail: "ada@example.com",
          notes: "Deposit",
        },
      ],
    ])
    const startCardPayment = vi.fn(
      async () =>
        ({
          configured: true,
          redirectUrl: "https://pay.example.com/fresh",
        }) as const,
    )
    const app = mountApp(stubOptions({ startCardPayment }), db)

    const res = await app.request("/v1/public/payment-link/ps_1/start-card", { method: "POST" })

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      data: {
        redirectUrl: "https://pay.example.com/stale",
        session: {
          id: "ps_1",
          status: "requires_redirect",
          amountCents: 12000,
          currency: "RON",
          redirectUrl: "https://pay.example.com/stale",
        },
      },
    })
    expect(startCardPayment).not.toHaveBeenCalled()
  })

  it("start-card returns a processing continuation without invoking the provider", async () => {
    const db = makeDb([
      [
        {
          id: "ps_processing",
          status: "processing",
          redirectUrl: null,
          returnUrl: "https://checkout.example.com/continue",
          amountCents: 12000,
          currency: "RON",
        },
      ],
    ])
    const startCardPayment = vi.fn(
      async () => ({ configured: true, redirectUrl: "https://pay.example.com/new" }) as const,
    )
    const app = mountApp(stubOptions({ startCardPayment }), db)

    const res = await app.request("/v1/public/payment-link/ps_processing/start-card", {
      method: "POST",
    })

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      data: {
        redirectUrl: "https://checkout.example.com/continue",
        session: {
          id: "ps_processing",
          status: "processing",
          amountCents: 12000,
          currency: "RON",
          redirectUrl: null,
        },
      },
    })
    expect(startCardPayment).not.toHaveBeenCalled()
  })

  it("start-card forwards safe body fields with server-derived processor URLs", async () => {
    const db = makeDb([
      [
        {
          id: "ps_1",
          status: "pending",
          redirectUrl: null,
          returnUrl: null,
          amountCents: 12000,
          currency: "RON",
          payerName: "Stored Payer",
          payerEmail: "stored@example.com",
          notes: "Stored notes",
        },
      ],
      [
        {
          id: "ps_1",
          status: "requires_redirect",
          redirectUrl: "https://pay.example.com/fresh",
          returnUrl: null,
          amountCents: 12000,
          currency: "RON",
        },
      ],
    ])
    const startCardPayment = vi.fn(
      async () =>
        ({
          configured: true,
          redirectUrl: "https://pay.example.com/fresh",
        }) as const,
    )
    const app = mountApp(
      stubOptions({
        resolvePublicCheckoutBaseUrl: () => "https://checkout.example.com/pay",
        startCardPayment,
      }),
      db,
    )

    const res = await app.request("/v1/public/payment-link/ps_1/start-card", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        billing: {
          email: "body@example.com",
          phone: "+40700000000",
          firstName: "Body",
          lastName: "Payer",
          city: "Cluj",
          country: "RO",
          state: "CJ",
          postalCode: "400000",
          details: "Line 1",
        },
        description: "Body description",
        shipping: { method: "courier" },
      }),
    })

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      data: {
        redirectUrl: "https://pay.example.com/fresh",
        session: {
          id: "ps_1",
          status: "requires_redirect",
          amountCents: 12000,
          currency: "RON",
          redirectUrl: "https://pay.example.com/fresh",
        },
      },
    })
    expect(startCardPayment).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        id: "ps_1",
        billing: {
          email: "body@example.com",
          phone: "+40700000000",
          firstName: "Body",
          lastName: "Payer",
          city: "Cluj",
          country: "RO",
          state: "CJ",
          postalCode: "400000",
          details: "Line 1",
        },
        description: "Body description",
        returnUrl: "https://checkout.example.com/pay/ps_1",
        cancelUrl: "https://checkout.example.com/pay/ps_1",
        shipping: { method: "courier" },
      }),
    )
    expect(startCardPayment.mock.calls[0]?.[1]).not.toHaveProperty("metadata")
  })

  it("start-card rejects anonymous processor URLs and metadata", async () => {
    const db = makeDb([
      [
        {
          id: "ps_1",
          status: "pending",
          redirectUrl: null,
          returnUrl: null,
          cancelUrl: null,
          amountCents: 12000,
          currency: "RON",
          payerName: null,
          payerEmail: null,
          notes: null,
        },
      ],
    ])
    const startCardPayment = vi.fn(async () => ({ configured: false }) as const)
    const app = mountApp(stubOptions({ startCardPayment }), db)

    const res = await app.request("/v1/public/payment-link/ps_1/start-card", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        returnUrl: "https://attacker.example.com/return",
        cancelUrl: "https://attacker.example.com/cancel",
        metadata: { notifyUrl: "https://attacker.example.com/notify" },
      }),
    })

    expect(res.status).toBe(400)
    expect(startCardPayment).not.toHaveBeenCalled()
  })

  it("start-card falls back to the request origin for its canonical landing URL", async () => {
    const db = makeDb([
      [
        {
          id: "ps_origin",
          status: "pending",
          redirectUrl: null,
          returnUrl: null,
          cancelUrl: null,
          amountCents: 12000,
          currency: "RON",
          payerName: null,
          payerEmail: null,
          notes: null,
        },
      ],
      [
        {
          id: "ps_origin",
          status: "processing",
          redirectUrl: null,
          returnUrl: null,
          amountCents: 12000,
          currency: "RON",
        },
      ],
    ])
    const startCardPayment = vi.fn(async () => ({ configured: true, redirectUrl: null }) as const)
    const app = mountApp(
      stubOptions({ resolvePublicCheckoutBaseUrl: () => null, startCardPayment }),
      db,
    )

    const res = await app.request(
      "https://operator.example.com/v1/public/payment-link/ps_origin/start-card",
      { method: "POST" },
    )

    expect(res.status).toBe(200)
    expect(startCardPayment).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        returnUrl: "https://operator.example.com/pay/ps_origin",
        cancelUrl: "https://operator.example.com/pay/ps_origin",
      }),
    )
    expect(await res.json()).toMatchObject({
      data: { redirectUrl: "https://operator.example.com/pay/ps_origin" },
    })
  })

  it("start-card accepts configured non-redirect processor outcomes", async () => {
    const db = makeDb([
      [
        {
          id: "ps_1",
          status: "pending",
          redirectUrl: null,
          returnUrl: "https://checkout.example.com/stored-return",
          amountCents: 12000,
          currency: "RON",
          payerName: "Ada Lovelace",
          payerEmail: "ada@example.com",
          notes: "Deposit",
        },
      ],
      [
        {
          id: "ps_1",
          status: "processing",
          redirectUrl: null,
          returnUrl: "https://checkout.example.com/stored-return",
          amountCents: 12000,
          currency: "RON",
        },
      ],
    ])
    const startCardPayment = vi.fn(
      async () =>
        ({
          configured: true,
          redirectUrl: null,
        }) as const,
    )
    const app = mountApp(stubOptions({ startCardPayment }), db)

    const res = await app.request("/v1/public/payment-link/ps_1/start-card", { method: "POST" })

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      data: {
        redirectUrl: "https://checkout.example.com/stored-return",
        session: {
          id: "ps_1",
          status: "processing",
          amountCents: 12000,
          currency: "RON",
          redirectUrl: null,
        },
      },
    })
    expect(startCardPayment).toHaveBeenCalledOnce()
  })

  it("start-card preserves persisted processor URLs for immediate authorized outcomes", async () => {
    const db = makeDb([
      [
        {
          id: "ps_1",
          status: "pending",
          redirectUrl: null,
          returnUrl: "https://checkout.example.com/stored-return",
          cancelUrl: "https://checkout.example.com/stored-cancel",
          amountCents: 12000,
          currency: "RON",
          payerName: "Ada Lovelace",
          payerEmail: "ada@example.com",
          notes: "Deposit",
        },
      ],
      [
        {
          id: "ps_1",
          status: "authorized",
          redirectUrl: null,
          returnUrl: "https://checkout.example.com/stored-return",
          amountCents: 12000,
          currency: "RON",
        },
      ],
    ])
    const startCardPayment = vi.fn(
      async () =>
        ({
          configured: true,
          redirectUrl: null,
        }) as const,
    )
    const app = mountApp(stubOptions({ startCardPayment }), db)

    const res = await app.request("/v1/public/payment-link/ps_1/start-card", { method: "POST" })

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      data: {
        redirectUrl: "https://checkout.example.com/stored-return",
        session: {
          id: "ps_1",
          status: "authorized",
          amountCents: 12000,
          currency: "RON",
          redirectUrl: null,
        },
      },
    })
    expect(startCardPayment).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        returnUrl: "https://checkout.example.com/stored-return",
        cancelUrl: "https://checkout.example.com/stored-cancel",
      }),
    )
  })

  it("start-card rejects provider-specific body fields", async () => {
    const db = makeDb([
      [
        {
          id: "ps_1",
          status: "pending",
          redirectUrl: null,
          returnUrl: null,
          amountCents: 12000,
          currency: "RON",
          payerName: null,
          payerEmail: null,
          notes: null,
        },
      ],
    ])
    const startCardPayment = vi.fn(async () => ({ configured: false }) as const)
    const app = mountApp(stubOptions({ startCardPayment }), db)

    const res = await app.request("/v1/public/payment-link/ps_1/start-card", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ provider: "processor-name" }),
    })

    expect(res.status).toBe(400)
    expect(startCardPayment).not.toHaveBeenCalled()
  })

  it("start-card preserves successful sessions without invoking the provider", async () => {
    const db = makeDb([
      [
        {
          id: "ps_1",
          status: "paid",
          redirectUrl: "https://pay.example.com/success",
          amountCents: 12000,
          currency: "RON",
        },
      ],
    ])
    const startCardPayment = vi.fn(async () => ({ configured: false }) as const)
    const app = mountApp(stubOptions({ startCardPayment }), db)

    const res = await app.request("/v1/public/payment-link/ps_1/start-card", { method: "POST" })

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      data: {
        redirectUrl: "https://pay.example.com/success",
        session: {
          id: "ps_1",
          status: "paid",
          amountCents: 12000,
          currency: "RON",
          redirectUrl: "https://pay.example.com/success",
        },
      },
    })
    expect(startCardPayment).not.toHaveBeenCalled()
  })

  it("start-card does not restart terminal failed sessions", async () => {
    const db = makeDb([
      [
        {
          id: "ps_1",
          status: "failed",
          redirectUrl: "https://pay.example.com/failed",
          amountCents: 12000,
          currency: "RON",
        },
      ],
    ])
    const startCardPayment = vi.fn(
      async () =>
        ({
          configured: true,
          redirectUrl: "https://pay.example.com/fresh",
        }) as const,
    )
    const app = mountApp(stubOptions({ startCardPayment }), db)

    const res = await app.request("/v1/public/payment-link/ps_1/start-card", { method: "POST" })

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      data: {
        redirectUrl: null,
        session: {
          id: "ps_1",
          status: "failed",
          amountCents: 12000,
          currency: "RON",
          redirectUrl: "https://pay.example.com/failed",
        },
      },
    })
    expect(startCardPayment).not.toHaveBeenCalled()
  })

  it("start-card 404s when the session is missing", async () => {
    const app = mountApp(stubOptions(), makeDb([[]]))

    const res = await app.request("/v1/public/payment-link/ps_missing/start-card", {
      method: "POST",
    })

    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: "Session not found" })
  })

  it("checkout-status reports pending and surfaces the latest session", async () => {
    const db = makeDb([
      // booking lookup
      [
        {
          id: "bk_1",
          bookingNumber: "B-1001",
          status: "awaiting_payment",
          updatedAt: new Date("2026-06-15T10:00:00Z"),
        },
      ],
      // payment sessions lookup
      [
        {
          id: "ps_latest",
          status: "pending",
          amountCents: 12000,
          currency: "RON",
          invoiceId: null,
          paymentMethod: "credit_card",
          completedAt: null,
          failedAt: null,
          updatedAt: new Date("2026-06-15T11:00:00Z"),
        },
      ],
    ])
    const app = mountApp(stubOptions(), db)

    const res = await app.request("/v1/public/bookings/bk_1/checkout-status")

    expect(res.status).toBe(200)
    const body = (await res.json()) as { data: Record<string, unknown> }
    expect(body.data).toMatchObject({
      bookingId: "bk_1",
      bookingNumber: "B-1001",
      bookingStatus: "awaiting_payment",
      paymentStatus: "pending",
      bankTransferInstructions: null,
    })
    expect((body.data.session as { id: string }).id).toBe("ps_latest")
  })

  it("checkout-status reports paid for a paid session and attaches bank-transfer instructions", async () => {
    const db = makeDb([
      // booking lookup
      [
        {
          id: "bk_2",
          bookingNumber: "B-2002",
          status: "awaiting_payment",
          updatedAt: new Date("2026-06-15T10:00:00Z"),
        },
      ],
      // payment sessions lookup (bank_transfer + invoice present)
      [
        {
          id: "ps_bt",
          status: "paid",
          amountCents: 50000,
          currency: "RON",
          invoiceId: "inv_1",
          paymentMethod: "bank_transfer",
          completedAt: new Date("2026-06-15T12:00:00Z"),
          failedAt: null,
          updatedAt: new Date("2026-06-15T12:00:00Z"),
        },
      ],
      // invoice lookup inside buildPublicBankTransferInstructions
      [
        {
          invoiceNumber: "PRO-1",
          dueDate: "2026-07-01",
          balanceDueCents: 50000,
          currency: "RON",
        },
      ],
    ])
    const app = mountApp(stubOptions(), db)

    const res = await app.request("/v1/public/bookings/bk_2/checkout-status")

    expect(res.status).toBe(200)
    const body = (await res.json()) as { data: Record<string, unknown> }
    expect(body.data.paymentStatus).toBe("paid")
    expect(body.data.bankTransferInstructions).toMatchObject({
      beneficiary: "Acme Travel SRL",
      iban: "RO49AAAA1B31007593840000",
      reference: "BOOK-B-2002",
      proformaNumber: "PRO-1",
    })
  })

  it("checkout-status does not repeat completion after reconciliation persisted paid", async () => {
    const refreshPaymentSessionStatus = vi.fn(async () => undefined)
    const paid = {
      id: "ps_once",
      status: "paid",
      amountCents: 24000,
      currency: "RON",
      invoiceId: null,
      paymentMethod: "credit_card",
      completedAt: new Date("2026-07-25T11:01:00Z"),
      failedAt: null,
      updatedAt: new Date("2026-07-25T11:01:00Z"),
    }
    const db = makeDb([
      [
        {
          id: "bk_once",
          bookingNumber: "B-ONCE",
          status: "awaiting_payment",
          updatedAt: new Date("2026-07-25T11:00:00Z"),
        },
      ],
      [{ ...paid, status: "processing", completedAt: null }],
      [paid],
      [
        {
          id: "bk_once",
          bookingNumber: "B-ONCE",
          status: "confirmed",
          updatedAt: new Date("2026-07-25T11:01:00Z"),
        },
      ],
      [paid],
    ])
    const app = mountApp(stubOptions({ refreshPaymentSessionStatus }), db)

    const first = await app.request("/v1/public/bookings/bk_once/checkout-status")
    const second = await app.request("/v1/public/bookings/bk_once/checkout-status")

    expect((await first.json()).data.paymentStatus).toBe("paid")
    expect((await second.json()).data.paymentStatus).toBe("paid")
    expect(refreshPaymentSessionStatus).toHaveBeenCalledOnce()
    expect(refreshPaymentSessionStatus).toHaveBeenCalledWith(expect.anything(), "ps_once")
  })

  it("checkout-status safely returns persisted state when reconciliation fails", async () => {
    const refreshPaymentSessionStatus = vi.fn(async () => {
      throw new Error("platform credential and Stripe details")
    })
    const db = makeDb([
      [
        {
          id: "bk_retry",
          bookingNumber: "B-RETRY",
          status: "awaiting_payment",
          updatedAt: new Date("2026-07-25T12:00:00Z"),
        },
      ],
      [
        {
          id: "ps_retry",
          status: "processing",
          amountCents: 32000,
          currency: "RON",
          invoiceId: null,
          paymentMethod: "credit_card",
          completedAt: null,
          failedAt: null,
          updatedAt: new Date("2026-07-25T12:01:00Z"),
        },
      ],
    ])
    const app = mountApp(stubOptions({ refreshPaymentSessionStatus }), db)

    const response = await app.request("/v1/public/bookings/bk_retry/checkout-status")

    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({
      data: {
        bookingId: "bk_retry",
        paymentStatus: "pending",
        session: { id: "ps_retry", status: "processing" },
      },
    })
  })

  it("does not expose an authorized but uncaptured session as paid", async () => {
    const db = makeDb([
      [
        {
          id: "bk_authorized",
          bookingNumber: "B-AUTH",
          status: "awaiting_payment",
          updatedAt: new Date("2026-07-25T12:00:00Z"),
        },
      ],
      [
        {
          id: "ps_authorized",
          status: "authorized",
          amountCents: 32000,
          currency: "RON",
          invoiceId: null,
          paymentMethod: "credit_card",
          completedAt: null,
          failedAt: null,
          updatedAt: new Date("2026-07-25T12:01:00Z"),
        },
      ],
    ])
    const app = mountApp(stubOptions(), db)

    const response = await app.request("/v1/public/bookings/bk_authorized/checkout-status")

    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({
      data: {
        bookingId: "bk_authorized",
        paymentStatus: "pending",
        session: { id: "ps_authorized", status: "authorized" },
      },
    })
  })

  it("checkout-status 404s when the booking is missing", async () => {
    const app = mountApp(stubOptions(), makeDb([[]]))

    const res = await app.request("/v1/public/bookings/bk_missing/checkout-status")

    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: "Booking not found" })
  })
})
