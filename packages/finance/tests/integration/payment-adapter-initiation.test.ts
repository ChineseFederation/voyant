// agent-quality: file-size exception -- owner: finance; adapter initiation,
// callback identity, and callback race coverage share the same Postgres
// payment-session settlement harness.
import { createEventBus } from "@voyant-travel/core"
import {
  PAYMENT_ADAPTER_CONTRACT_VERSION,
  type PaymentAdapter,
  type PaymentSessionState,
} from "@voyant-travel/payments"
import { eq } from "drizzle-orm"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"
import type { Context } from "hono"
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"

import {
  createPaymentAdapterCardPaymentStarter,
  startPaymentAdapterCardPayment,
} from "../../src/card-payment.js"
import { applyPaymentAdapterCallbackEvent } from "../../src/payment-adapter-events.js"
import { refreshPaymentAdapterStatus } from "../../src/payment-adapter-status.js"
import {
  invoices,
  paymentAuthorizations,
  paymentCaptures,
  paymentSessions,
  payments,
} from "../../src/schema.js"
import { financeService } from "../../src/service.js"

const DB_AVAILABLE = !!process.env.TEST_DATABASE_URL

let seq = 0
function next(prefix: string) {
  seq += 1
  return `${prefix}-${String(seq).padStart(5, "0")}`
}

describe.skipIf(!DB_AVAILABLE)("payment adapter initiation", () => {
  let db: ReturnType<typeof import("@voyant-travel/db/test-utils").createTestDb>

  beforeAll(async () => {
    const { createTestDb, cleanupTestDb } = await import("@voyant-travel/db/test-utils")
    db = createTestDb()
    await cleanupTestDb(db)
  })

  afterAll(async () => {
    const { closeTestDb } = await import("@voyant-travel/db/test-utils")
    await closeTestDb()
  })

  beforeEach(async () => {
    const { cleanupTestDb } = await import("@voyant-travel/db/test-utils")
    await cleanupTestDb(db)
  })

  it("routes a synchronously paid initiation through completion once", async () => {
    const { invoice, session } = await seedInvoiceSession(db, 12000)
    const eventBus = createEventBus()
    const events: Record<string, unknown[]> = {
      "invoice.payment.recorded": [],
      "invoice.settled": [],
      "payment.completed": [],
    }
    for (const eventName of Object.keys(events)) {
      eventBus.subscribe(eventName, (event) => events[eventName]?.push(event))
    }

    const adapter = stubAdapter("paid")
    const starter = createPaymentAdapterCardPaymentStarter(adapter, {
      resolveRuntime: () => ({ eventBus }),
    })

    await starter({ env: {} } as Context, {
      db,
      sessionId: session.id,
      billing: { email: "paid@example.com", firstName: "Paid" },
    })

    await expect(rowCount(paymentAuthorizations)).resolves.toBe(1)
    await expect(rowCount(paymentCaptures)).resolves.toBe(1)
    await expect(rowCount(payments)).resolves.toBe(1)
    await expect(refreshedInvoice(invoice.id)).resolves.toMatchObject({
      status: "paid",
      paidCents: 12000,
      balanceDueCents: 0,
    })
    expect(events["invoice.payment.recorded"]).toHaveLength(1)
    expect(events["invoice.settled"]).toHaveLength(1)
    expect(events["payment.completed"]).toHaveLength(1)

    await applyPaymentAdapterCallbackEvent(
      db,
      {
        eventId: "evt_duplicate_paid",
        paymentSessionId: session.id,
        nextState: "paid",
        occurredAt: "2026-07-17T00:00:00.000Z",
        processorSessionId: "processor_session_paid",
        processorPaymentId: "processor_payment_paid",
        idempotencyKey: "callback-paid",
      },
      { eventBus },
    )

    await expect(rowCount(paymentAuthorizations)).resolves.toBe(1)
    await expect(rowCount(paymentCaptures)).resolves.toBe(1)
    await expect(rowCount(payments)).resolves.toBe(1)
    expect(events["invoice.payment.recorded"]).toHaveLength(1)
    expect(events["invoice.settled"]).toHaveLength(1)
    expect(events["payment.completed"]).toHaveLength(1)
  })

  it("persists the processor identity returned by a managed initiation", async () => {
    const { session } = await seedInvoiceSession(db, 7000)
    const adapter = stubAdapter("processing", {
      processorIdentity: {
        providerId: "netopia",
        connectionId: "payment_connection_123",
      },
    })
    const starter = createPaymentAdapterCardPaymentStarter(adapter)

    await starter({ env: {} } as Context, {
      db,
      sessionId: session.id,
      billing: { email: "managed@example.com", firstName: "Managed" },
    })

    await expect(refreshedSession(session.id)).resolves.toMatchObject({
      provider: "netopia",
      providerConnectionId: "payment_connection_123",
      providerSessionId: "processor_session_processing",
      providerPaymentId: "processor_payment_processing",
    })
  })

  it("does not replace an existing provider with an identity-less adapter result", async () => {
    const { session } = await seedInvoiceSession(db, 7025, { provider: "netopia" })
    const baseAdapter = stubAdapter("processing")
    const adapter: PaymentAdapter = { ...baseAdapter, id: "managed" }

    await startPaymentAdapterCardPayment(
      adapter,
      {
        db,
        sessionId: session.id,
        billing: { email: "provider@example.com", firstName: "Provider" },
      },
      { context: { env: {} } },
    )

    await expect(refreshedSession(session.id)).resolves.toMatchObject({
      status: "processing",
      provider: "netopia",
      providerConnectionId: null,
    })
  })

  it("atomically admits one initiation even when the adapter cannot safely retry", async () => {
    const { session } = await seedInvoiceSession(db, 7050)
    let markInitiationStarted: (() => void) | undefined
    const initiationStarted = new Promise<void>((resolve) => {
      markInitiationStarted = resolve
    })
    let releaseInitiation: (() => void) | undefined
    const initiationReleased = new Promise<void>((resolve) => {
      releaseInitiation = resolve
    })
    const baseAdapter = stubAdapter("processing")
    const status = vi.fn(async () => ({ nextState: "failed" as const }))
    const initiate = vi.fn(async (_context, input) => {
      markInitiationStarted?.()
      await initiationReleased
      return {
        nextState: "requires_redirect" as const,
        idempotencyKey: input.idempotencyKey,
        checkout: { kind: "redirect" as const, url: "https://pay.example.com/continue" },
        processorIdentity: {
          providerId: "netopia",
          connectionId: "payment_connection_single_start",
        },
      }
    })
    const adapter: PaymentAdapter = {
      ...baseAdapter,
      capabilities: {
        ...baseAdapter.capabilities,
        idempotencyKeys: false,
        retrySafeInitiation: false,
        status: true,
      },
      initiate,
      status,
    }

    await withConcurrentDbClients(async (firstDb, secondDb) => {
      const firstStart = startPaymentAdapterCardPayment(
        adapter,
        {
          db: firstDb,
          sessionId: session.id,
          billing: { email: "single@example.com", firstName: "Single" },
        },
        { context: { env: {} } },
      )
      await initiationStarted
      await refreshPaymentAdapterStatus(adapter, secondDb, session.id, {
        context: { env: {} },
      })
      await expect(
        startPaymentAdapterCardPayment(
          adapter,
          {
            db: secondDb,
            sessionId: session.id,
            billing: { email: "single@example.com", firstName: "Single" },
          },
          { context: { env: {} } },
        ),
      ).resolves.toEqual({ redirectUrl: null, checkout: null })
      releaseInitiation?.()
      await expect(firstStart).resolves.toEqual({
        redirectUrl: "https://pay.example.com/continue",
        checkout: { kind: "redirect", url: "https://pay.example.com/continue" },
      })
    })

    expect(initiate).toHaveBeenCalledOnce()
    expect(status).not.toHaveBeenCalled()
    await expect(refreshedSession(session.id)).resolves.toMatchObject({
      status: "requires_redirect",
      provider: "netopia",
      providerConnectionId: "payment_connection_single_start",
      redirectUrl: "https://pay.example.com/continue",
    })
  })

  it("rejects an initiation result that races with a different callback identity", async () => {
    const { session } = await seedInvoiceSession(db, 7075)
    let markInitiationStarted: (() => void) | undefined
    const initiationStarted = new Promise<void>((resolve) => {
      markInitiationStarted = resolve
    })
    let releaseInitiation: (() => void) | undefined
    const initiationReleased = new Promise<void>((resolve) => {
      releaseInitiation = resolve
    })
    const baseAdapter = stubAdapter("processing")
    const adapter: PaymentAdapter = {
      ...baseAdapter,
      initiate: vi.fn(async (_context, input) => {
        markInitiationStarted?.()
        await initiationReleased
        return {
          nextState: "processing" as const,
          idempotencyKey: input.idempotencyKey,
          processorIdentity: {
            providerId: "netopia",
            connectionId: "payment_connection_initiation",
          },
        }
      }),
    }

    const initiation = startPaymentAdapterCardPayment(
      adapter,
      {
        db,
        sessionId: session.id,
        billing: { email: "race@example.com", firstName: "Race" },
      },
      { context: { env: {} } },
    )
    await initiationStarted
    await applyPaymentAdapterCallbackEvent(db, {
      eventId: "evt_identity_won_race",
      paymentSessionId: session.id,
      nextState: "processing",
      occurredAt: "2026-07-17T00:00:00.000Z",
      processorIdentity: {
        providerId: "netopia",
        connectionId: "payment_connection_callback",
      },
      idempotencyKey: "callback-identity-won-race",
    })
    releaseInitiation?.()

    await expect(initiation).rejects.toThrow(/processor identity/i)
    await expect(refreshedSession(session.id)).resolves.toMatchObject({
      status: "processing",
      provider: "netopia",
      providerConnectionId: "payment_connection_callback",
    })
  })

  it("releases a failed initiation claim only when the adapter guarantees safe retry", async () => {
    const { session } = await seedInvoiceSession(db, 7080)
    const baseAdapter = stubAdapter("processing")
    const initiate = vi
      .fn<PaymentAdapter["initiate"]>()
      .mockRejectedValueOnce(new Error("temporary transport failure"))
      .mockImplementationOnce(async (_context, input) => ({
        nextState: "requires_redirect",
        idempotencyKey: input.idempotencyKey,
        checkout: { kind: "redirect", url: "https://pay.example.com/retry" },
      }))
    const adapter: PaymentAdapter = { ...baseAdapter, initiate }
    const args = {
      db,
      sessionId: session.id,
      billing: { email: "retry@example.com", firstName: "Retry" },
    }

    await expect(
      startPaymentAdapterCardPayment(adapter, args, { context: { env: {} } }),
    ).rejects.toThrow("temporary transport failure")
    await expect(refreshedSession(session.id)).resolves.toMatchObject({
      status: "pending",
      idempotencyKey: `payment:${session.id}`,
      metadata: {
        paymentAdapterInitiationClaim: null,
        paymentAdapterInitiationState: "retryable",
      },
    })

    await expect(
      startPaymentAdapterCardPayment(adapter, args, { context: { env: {} } }),
    ).resolves.toEqual({
      redirectUrl: "https://pay.example.com/retry",
      checkout: { kind: "redirect", url: "https://pay.example.com/retry" },
    })
    expect(initiate).toHaveBeenCalledTimes(2)
    expect(initiate.mock.calls[0]?.[1].idempotencyKey).toBe(`payment:${session.id}`)
    expect(initiate.mock.calls[1]?.[1].idempotencyKey).toBe(`payment:${session.id}`)
  })

  it("rejects a mismatched initiation idempotency echo without persisting processor data", async () => {
    const { session } = await seedInvoiceSession(db, 7085)
    const adapter = stubAdapter("processing", {
      idempotencyKey: "provider-returned-a-different-key",
      processorIdentity: {
        providerId: "netopia",
        connectionId: "payment_connection_wrong_idempotency",
      },
    })

    await expect(
      startPaymentAdapterCardPayment(
        adapter,
        {
          db,
          sessionId: session.id,
          billing: { email: "mismatch@example.com", firstName: "Mismatch" },
        },
        { context: { env: {} } },
      ),
    ).rejects.toThrow(/idempotency key/i)

    await expect(refreshedSession(session.id)).resolves.toMatchObject({
      status: "pending",
      providerConnectionId: null,
      providerSessionId: null,
      providerPaymentId: null,
      providerPayload: null,
      metadata: {
        paymentAdapterInitiationClaim: null,
        paymentAdapterInitiationState: "retryable",
      },
    })
  })

  it("keeps an unsafe failed initiation claimed for status reconciliation", async () => {
    const { session } = await seedInvoiceSession(db, 7090)
    const baseAdapter = stubAdapter("processing")
    const initiate = vi.fn(async () => {
      throw new Error("ambiguous transport failure")
    })
    const status = vi.fn(async () => ({
      nextState: "processing" as const,
      processorIdentity: {
        providerId: "netopia",
        connectionId: "payment_connection_reconciled",
      },
      processorSessionId: "processor_session_reconciled",
    }))
    const adapter: PaymentAdapter = {
      ...baseAdapter,
      capabilities: {
        ...baseAdapter.capabilities,
        idempotencyKeys: false,
        retrySafeInitiation: false,
        status: true,
      },
      initiate,
      status,
    }
    const args = {
      db,
      sessionId: session.id,
      billing: { email: "unsafe@example.com", firstName: "Unsafe" },
    }

    await expect(
      startPaymentAdapterCardPayment(adapter, args, { context: { env: {} } }),
    ).rejects.toThrow("ambiguous transport failure")
    await expect(refreshedSession(session.id)).resolves.toMatchObject({
      status: "processing",
      idempotencyKey: `payment:${session.id}`,
      metadata: {
        paymentAdapterInitiationClaim: `payment:${session.id}`,
        paymentAdapterInitiationState: "uncertain",
      },
    })

    await refreshPaymentAdapterStatus(adapter, db, session.id, {
      context: { env: {} },
      checkedAt: new Date("2026-07-17T03:00:00.000Z"),
    })
    expect(status).toHaveBeenCalledOnce()
    await expect(refreshedSession(session.id)).resolves.toMatchObject({
      status: "processing",
      provider: "netopia",
      providerConnectionId: "payment_connection_reconciled",
      providerSessionId: "processor_session_reconciled",
    })

    await expect(
      startPaymentAdapterCardPayment(adapter, args, { context: { env: {} } }),
    ).resolves.toEqual({ redirectUrl: null, checkout: null })
    expect(initiate).toHaveBeenCalledOnce()
  })

  it("polls with persisted processor identity and applies a paid result", async () => {
    const { invoice, session } = await seedInvoiceSession(db, 7100, {
      status: "processing",
      provider: "netopia",
      providerConnectionId: "payment_connection_status",
      providerSessionId: "processor_session_status",
      providerPaymentId: "processor_payment_status",
    })
    const eventBus = createEventBus()
    const completedEvents: unknown[] = []
    eventBus.subscribe("payment.completed", (event) => completedEvents.push(event))
    const status = vi.fn(async () => ({
      nextState: "paid" as const,
      processorIdentity: {
        providerId: "netopia",
        connectionId: "payment_connection_status",
      },
      processorSessionId: "processor_session_status",
      processorPaymentId: "processor_payment_status",
      raw: { providerStatus: "confirmed" },
    }))
    const baseAdapter = stubAdapter("processing")
    const adapter: PaymentAdapter = {
      ...baseAdapter,
      capabilities: { ...baseAdapter.capabilities, status: true },
      status,
    }

    await refreshPaymentAdapterStatus(adapter, db, session.id, {
      context: { env: {} },
      runtime: { eventBus },
      checkedAt: new Date("2026-07-17T01:00:00.000Z"),
    })

    expect(status).toHaveBeenCalledWith(expect.anything(), {
      paymentSessionId: session.id,
      processorSessionId: "processor_session_status",
      processorPaymentId: "processor_payment_status",
      processorIdentity: {
        providerId: "netopia",
        connectionId: "payment_connection_status",
      },
    })
    await expect(refreshedSession(session.id)).resolves.toMatchObject({
      status: "paid",
      provider: "netopia",
      providerConnectionId: "payment_connection_status",
      providerPayload: { status: { providerStatus: "confirmed" } },
      metadata: { paymentAdapterStatusCheckedAt: "2026-07-17T01:00:00.000Z" },
    })
    await expect(refreshedInvoice(invoice.id)).resolves.toMatchObject({
      status: "paid",
      paidCents: 7100,
      balanceDueCents: 0,
    })
    expect(completedEvents).toHaveLength(1)
  })

  it("does not let status polling downgrade an authorized session", async () => {
    const { session } = await seedInvoiceSession(db, 7200, {
      status: "authorized",
      provider: "netopia",
      providerConnectionId: "payment_connection_authorized",
    })
    const status = vi.fn(async () => ({
      nextState: "processing" as const,
      processorIdentity: {
        providerId: "netopia",
        connectionId: "payment_connection_authorized",
      },
    }))
    const baseAdapter = stubAdapter("processing")
    const adapter: PaymentAdapter = {
      ...baseAdapter,
      capabilities: { ...baseAdapter.capabilities, status: true },
      status,
    }

    await refreshPaymentAdapterStatus(adapter, db, session.id, {
      context: { env: {} },
    })

    await expect(refreshedSession(session.id)).resolves.toMatchObject({
      status: "authorized",
      provider: "netopia",
      providerConnectionId: "payment_connection_authorized",
    })
  })

  it("atomically leases provider polling so concurrent public reads call status once", async () => {
    const { session } = await seedInvoiceSession(db, 7250, {
      status: "processing",
      provider: "netopia",
      providerConnectionId: "payment_connection_status_lease",
    })
    let releaseStatus: (() => void) | undefined
    const statusReleased = new Promise<void>((resolve) => {
      releaseStatus = resolve
    })
    let markStatusStarted: (() => void) | undefined
    const statusStarted = new Promise<void>((resolve) => {
      markStatusStarted = resolve
    })
    const status = vi.fn(async () => {
      markStatusStarted?.()
      await statusReleased
      return {
        nextState: "processing" as const,
        processorIdentity: {
          providerId: "netopia",
          connectionId: "payment_connection_status_lease",
        },
      }
    })
    const baseAdapter = stubAdapter("processing")
    const adapter: PaymentAdapter = {
      ...baseAdapter,
      capabilities: { ...baseAdapter.capabilities, status: true },
      status,
    }
    const checkedAt = new Date("2026-07-17T02:00:00.000Z")

    await withConcurrentDbClients(async (firstDb, secondDb) => {
      const firstRefresh = refreshPaymentAdapterStatus(adapter, firstDb, session.id, {
        context: { env: {} },
        checkedAt,
      })
      await statusStarted
      await refreshPaymentAdapterStatus(adapter, secondDb, session.id, {
        context: { env: {} },
        checkedAt,
      })
      releaseStatus?.()
      await firstRefresh
    })

    expect(status).toHaveBeenCalledOnce()
    await expect(refreshedSession(session.id)).resolves.toMatchObject({
      status: "processing",
      metadata: {
        paymentAdapterStatusRefreshAfter: checkedAt.getTime() + 30_000,
        paymentAdapterStatusCheckedAt: "2026-07-17T02:00:00.000Z",
      },
    })
  })

  it("fences a late expired status result after a newer poll completes payment", async () => {
    const { invoice, session } = await seedInvoiceSession(db, 7260, {
      status: "processing",
      provider: "netopia",
      providerConnectionId: "payment_connection_status_fence",
    })
    const eventBus = createEventBus()
    const completedEvents: unknown[] = []
    eventBus.subscribe("payment.completed", (event) => completedEvents.push(event))
    let markFirstStarted: (() => void) | undefined
    const firstStarted = new Promise<void>((resolve) => {
      markFirstStarted = resolve
    })
    let releaseFirst: (() => void) | undefined
    const firstReleased = new Promise<void>((resolve) => {
      releaseFirst = resolve
    })
    const status = vi
      .fn<PaymentAdapter["status"]>()
      .mockImplementationOnce(async () => {
        markFirstStarted?.()
        await firstReleased
        return {
          nextState: "processing",
          processorIdentity: {
            providerId: "netopia",
            connectionId: "payment_connection_status_fence",
          },
          processorSessionId: "processor_session_stale",
          processorPaymentId: "processor_payment_stale",
          raw: { providerStatus: "stale-processing" },
        }
      })
      .mockResolvedValueOnce({
        nextState: "paid",
        processorIdentity: {
          providerId: "netopia",
          connectionId: "payment_connection_status_fence",
        },
        processorSessionId: "processor_session_paid",
        processorPaymentId: "processor_payment_paid",
        raw: { providerStatus: "confirmed" },
      })
    const baseAdapter = stubAdapter("processing")
    const adapter: PaymentAdapter = {
      ...baseAdapter,
      capabilities: { ...baseAdapter.capabilities, status: true },
      status,
    }
    const firstCheckedAt = new Date("2026-07-17T02:30:00.000Z")
    const secondCheckedAt = new Date(firstCheckedAt.getTime() + 120_001)

    await withConcurrentDbClients(async (firstDb, secondDb) => {
      const firstRefresh = refreshPaymentAdapterStatus(adapter, firstDb, session.id, {
        context: { env: {} },
        runtime: { eventBus },
        checkedAt: firstCheckedAt,
      })
      await firstStarted

      await expect(
        refreshPaymentAdapterStatus(adapter, secondDb, session.id, {
          context: { env: {} },
          runtime: { eventBus },
          checkedAt: secondCheckedAt,
        }),
      ).resolves.toMatchObject({ status: "paid" })
      const afterPaid = await refreshedSession(session.id)

      releaseFirst?.()
      await expect(firstRefresh).resolves.toBeNull()
      const afterLateResult = await refreshedSession(session.id)

      expect(afterLateResult).toMatchObject({
        status: "paid",
        providerSessionId: "processor_session_paid",
        providerPaymentId: "processor_payment_paid",
        providerPayload: { status: { providerStatus: "confirmed" } },
        metadata: {
          paymentAdapterStatusCheckedAt: secondCheckedAt.toISOString(),
          paymentAdapterStatusRefreshAfter: secondCheckedAt.getTime() + 30_000,
          paymentAdapterStatusLeaseToken: null,
        },
      })
      expect(afterLateResult?.updatedAt.getTime()).toBe(afterPaid?.updatedAt.getTime())
    })

    expect(status).toHaveBeenCalledTimes(2)
    await expect(rowCount(paymentAuthorizations)).resolves.toBe(1)
    await expect(rowCount(paymentCaptures)).resolves.toBe(1)
    await expect(rowCount(payments)).resolves.toBe(1)
    await expect(refreshedInvoice(invoice.id)).resolves.toMatchObject({
      status: "paid",
      paidCents: 7260,
      balanceDueCents: 0,
    })
    expect(completedEvents).toHaveLength(1)
  })

  it("does not poll terminal payment sessions", async () => {
    const { session } = await seedInvoiceSession(db, 7275, {
      status: "failed",
      provider: "netopia",
      providerConnectionId: "payment_connection_terminal_status",
    })
    const baseAdapter = stubAdapter("processing")
    const status = vi.fn(async () => ({ nextState: "paid" as const }))
    const adapter: PaymentAdapter = {
      ...baseAdapter,
      capabilities: { ...baseAdapter.capabilities, status: true },
      status,
    }

    await refreshPaymentAdapterStatus(adapter, db, session.id, {
      context: { env: {} },
    })

    expect(status).not.toHaveBeenCalled()
    await expect(refreshedSession(session.id)).resolves.toMatchObject({ status: "failed" })
  })

  it("rejects a status result that omits identity for a pinned session", async () => {
    const { session } = await seedInvoiceSession(db, 7300, {
      status: "processing",
      provider: "netopia",
      providerConnectionId: "payment_connection_pinned_status",
    })
    const baseAdapter = stubAdapter("processing")
    const adapter: PaymentAdapter = {
      ...baseAdapter,
      capabilities: { ...baseAdapter.capabilities, status: true },
      status: vi.fn(async () => ({ nextState: "paid" as const })),
    }

    await expect(
      refreshPaymentAdapterStatus(adapter, db, session.id, {
        context: { env: {} },
      }),
    ).rejects.toThrow(/processor identity is required/i)

    await expect(refreshedSession(session.id)).resolves.toMatchObject({
      status: "processing",
      provider: "netopia",
      providerConnectionId: "payment_connection_pinned_status",
    })
    await expect(rowCount(payments)).resolves.toBe(0)
  })

  it("rejects status results that replace pinned processor references", async () => {
    const { session } = await seedInvoiceSession(db, 7310, {
      status: "processing",
      provider: "netopia",
      providerConnectionId: "payment_connection_pinned_references",
      providerSessionId: "processor_session_canonical",
      providerPaymentId: "processor_payment_canonical",
    })
    const baseAdapter = stubAdapter("processing")
    const adapter: PaymentAdapter = {
      ...baseAdapter,
      capabilities: { ...baseAdapter.capabilities, status: true },
      status: vi.fn(async () => ({
        nextState: "paid" as const,
        processorIdentity: {
          providerId: "netopia",
          connectionId: "payment_connection_pinned_references",
        },
        processorSessionId: "processor_session_conflict",
        processorPaymentId: "processor_payment_canonical",
      })),
    }

    await expect(
      refreshPaymentAdapterStatus(adapter, db, session.id, {
        context: { env: {} },
      }),
    ).rejects.toMatchObject({ code: "payment_processor_reference_mismatch" })

    await expect(refreshedSession(session.id)).resolves.toMatchObject({
      status: "processing",
      providerSessionId: "processor_session_canonical",
      providerPaymentId: "processor_payment_canonical",
    })
    await expect(rowCount(paymentAuthorizations)).resolves.toBe(0)
    await expect(rowCount(paymentCaptures)).resolves.toBe(0)
    await expect(rowCount(payments)).resolves.toBe(0)
  })

  it("passes provider-neutral redirect and shipping fields to adapter initiation", async () => {
    const { session } = await seedInvoiceSession(db, 7000)
    const adapter = stubAdapter("processing")
    const starter = createPaymentAdapterCardPaymentStarter(adapter)

    await starter({ env: {} } as Context, {
      db,
      sessionId: session.id,
      billing: { email: "neutral@example.com", firstName: "Neutral" },
      returnUrl: "https://checkout.example.com/return",
      cancelUrl: "https://checkout.example.com/cancel",
      shipping: { method: "courier" },
      metadata: { source: "test" },
    })

    expect(adapter.initiate).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        returnUrl: "https://checkout.example.com/return",
        cancelUrl: "https://checkout.example.com/cancel",
        shipping: { method: "courier" },
        metadata: expect.objectContaining({ source: "test" }),
      }),
    )
  })

  it("rejects a verified callback whose processor identity mismatches the stored session", async () => {
    const { session } = await seedInvoiceSession(db, 7000, {
      provider: "netopia",
      providerConnectionId: "payment_connection_123",
    })

    await expect(
      applyPaymentAdapterCallbackEvent(db, {
        eventId: "evt_identity_mismatch",
        paymentSessionId: session.id,
        nextState: "paid",
        occurredAt: "2026-07-17T00:00:00.000Z",
        processorIdentity: {
          providerId: "stripe",
          connectionId: "payment_connection_123",
        },
        idempotencyKey: "callback-identity-mismatch",
      }),
    ).rejects.toThrow(/processor identity/i)

    await expect(rowCount(paymentAuthorizations)).resolves.toBe(0)
    await expect(rowCount(paymentCaptures)).resolves.toBe(0)
    await expect(rowCount(payments)).resolves.toBe(0)
  })

  it("requires a callback processor identity once the session connection is pinned", async () => {
    const { session } = await seedInvoiceSession(db, 7000, {
      provider: "netopia",
      providerConnectionId: "payment_connection_123",
    })

    await expect(
      applyPaymentAdapterCallbackEvent(db, {
        eventId: "evt_missing_identity",
        paymentSessionId: session.id,
        nextState: "failed",
        occurredAt: "2026-07-17T00:00:00.000Z",
        idempotencyKey: "callback-missing-identity",
      }),
    ).rejects.toThrow(/processor identity is required/i)

    await expect(refreshedSession(session.id)).resolves.toMatchObject({
      status: "pending",
      provider: "netopia",
      providerConnectionId: "payment_connection_123",
    })
  })

  it("adopts a legacy managed provider to the verified processor identity once", async () => {
    const { session } = await seedInvoiceSession(db, 7000, {
      provider: "managed",
    })

    await applyPaymentAdapterCallbackEvent(db, {
      eventId: "evt_managed_adoption",
      paymentSessionId: session.id,
      nextState: "processing",
      occurredAt: "2026-07-17T00:00:00.000Z",
      processorIdentity: {
        providerId: "netopia",
        connectionId: "payment_connection_123",
      },
      idempotencyKey: "callback-managed-adoption",
    })

    await expect(refreshedSession(session.id)).resolves.toMatchObject({
      status: "processing",
      provider: "netopia",
      providerConnectionId: "payment_connection_123",
    })
  })

  it("rejects reverse managed provider identity mismatches", async () => {
    const { session } = await seedInvoiceSession(db, 7000, {
      provider: "netopia",
      providerConnectionId: "payment_connection_123",
    })

    await expect(
      applyPaymentAdapterCallbackEvent(db, {
        eventId: "evt_reverse_managed",
        paymentSessionId: session.id,
        nextState: "processing",
        occurredAt: "2026-07-17T00:00:00.000Z",
        processorIdentity: {
          providerId: "managed",
          connectionId: "payment_connection_123",
        },
        idempotencyKey: "callback-reverse-managed",
      }),
    ).rejects.toThrow(/processor identity/i)

    await expect(refreshedSession(session.id)).resolves.toMatchObject({
      status: "pending",
      provider: "netopia",
      providerConnectionId: "payment_connection_123",
    })
  })

  it("merges initiation and callback provider payload and metadata details", async () => {
    const { session } = await seedInvoiceSession(db, 9000, {
      providerPayload: { created: true },
      metadata: { createdBy: "test" },
    })
    const adapter = stubAdapter("processing", {
      raw: { hostedCheckoutId: "checkout_123" },
    })
    const starter = createPaymentAdapterCardPaymentStarter(adapter)

    await starter({ env: {} } as Context, {
      db,
      sessionId: session.id,
      billing: { email: "merge@example.com", firstName: "Merge" },
    })

    await applyPaymentAdapterCallbackEvent(db, {
      eventId: "evt_merge_paid",
      paymentSessionId: session.id,
      nextState: "paid",
      occurredAt: "2026-07-17T00:00:00.000Z",
      processorSessionId: "processor_session_processing",
      processorPaymentId: "processor_payment_processing",
      idempotencyKey: "callback-merge-paid",
      raw: { ipnId: "ipn_123" },
    })

    await expect(refreshedSession(session.id)).resolves.toMatchObject({
      providerPayload: {
        created: true,
        initiation: { hostedCheckoutId: "checkout_123" },
        callback: { ipnId: "ipn_123" },
      },
      metadata: {
        createdBy: "test",
        paymentAdapterInitiationIdempotencyKey: `payment:${session.id}`,
        paymentAdapterEventId: "evt_merge_paid",
        paymentAdapterOccurredAt: "2026-07-17T00:00:00.000Z",
      },
    })
  })

  it("applies concurrent duplicate paid callbacks exactly once", async () => {
    const { invoice, session } = await seedInvoiceSession(db, 11000, {
      provider: "netopia",
      providerConnectionId: "payment_connection_123",
    })
    const eventBus = createEventBus()
    const events: Record<string, unknown[]> = {
      "invoice.payment.recorded": [],
      "invoice.settled": [],
      "payment.completed": [],
    }
    for (const eventName of Object.keys(events)) {
      eventBus.subscribe(eventName, (event) => events[eventName]?.push(event))
    }
    const callback = {
      eventId: "evt_duplicate_parallel",
      paymentSessionId: session.id,
      nextState: "paid" as const,
      occurredAt: "2026-07-17T00:00:00.000Z",
      processorIdentity: {
        providerId: "netopia",
        connectionId: "payment_connection_123",
      },
      processorSessionId: "processor_session_parallel",
      processorPaymentId: "processor_payment_parallel",
      idempotencyKey: "callback-duplicate-parallel",
      raw: { ipnId: "ipn_parallel" },
    }

    await Promise.all([
      applyPaymentAdapterCallbackEvent(db, callback, { eventBus }),
      applyPaymentAdapterCallbackEvent(db, callback, { eventBus }),
    ])

    await expect(rowCount(paymentAuthorizations)).resolves.toBe(1)
    await expect(rowCount(paymentCaptures)).resolves.toBe(1)
    await expect(rowCount(payments)).resolves.toBe(1)
    await expect(refreshedInvoice(invoice.id)).resolves.toMatchObject({
      status: "paid",
      paidCents: 11000,
      balanceDueCents: 0,
    })
    expect(events["invoice.payment.recorded"]).toHaveLength(1)
    expect(events["invoice.settled"]).toHaveLength(1)
    expect(events["payment.completed"]).toHaveLength(1)
  })

  it("does not let a late failed callback downgrade a paid session", async () => {
    const { invoice, session } = await seedInvoiceSession(db, 13000, {
      provider: "netopia",
      providerConnectionId: "payment_connection_123",
    })

    await applyPaymentAdapterCallbackEvent(db, {
      eventId: "evt_paid_before_failure",
      paymentSessionId: session.id,
      nextState: "paid",
      occurredAt: "2026-07-17T00:00:00.000Z",
      processorIdentity: {
        providerId: "netopia",
        connectionId: "payment_connection_123",
      },
      processorSessionId: "processor_session_late_failure",
      processorPaymentId: "processor_payment_late_failure",
      idempotencyKey: "callback-paid-before-failure",
    })

    await applyPaymentAdapterCallbackEvent(db, {
      eventId: "evt_late_failure",
      paymentSessionId: session.id,
      nextState: "failed",
      occurredAt: "2026-07-17T00:00:01.000Z",
      processorIdentity: {
        providerId: "netopia",
        connectionId: "payment_connection_123",
      },
      idempotencyKey: "callback-late-failure",
    })

    await expect(rowCount(paymentAuthorizations)).resolves.toBe(1)
    await expect(rowCount(paymentCaptures)).resolves.toBe(1)
    await expect(rowCount(payments)).resolves.toBe(1)
    await expect(refreshedInvoice(invoice.id)).resolves.toMatchObject({
      status: "paid",
      paidCents: 13000,
      balanceDueCents: 0,
    })
    await expect(refreshedSession(session.id)).resolves.toMatchObject({
      status: "paid",
      failureCode: null,
      failureMessage: null,
    })
  })

  it("rejects an already-paid callback that replaces pinned processor references", async () => {
    const { session } = await seedInvoiceSession(db, 13100, {
      provider: "netopia",
      providerConnectionId: "payment_connection_paid_reference",
    })
    const eventBus = createEventBus()
    const completedEvents: unknown[] = []
    eventBus.subscribe("payment.completed", (event) => completedEvents.push(event))
    const canonicalCallback = {
      eventId: "evt_paid_reference_canonical",
      paymentSessionId: session.id,
      nextState: "paid" as const,
      occurredAt: "2026-07-17T00:00:00.000Z",
      processorIdentity: {
        providerId: "netopia",
        connectionId: "payment_connection_paid_reference",
      },
      processorSessionId: "processor_session_canonical",
      processorPaymentId: "processor_payment_canonical",
      idempotencyKey: "callback-paid-reference-canonical",
    }

    await applyPaymentAdapterCallbackEvent(db, canonicalCallback, { eventBus })
    await expect(
      applyPaymentAdapterCallbackEvent(
        db,
        {
          ...canonicalCallback,
          eventId: "evt_paid_reference_conflict",
          occurredAt: "2026-07-17T00:00:01.000Z",
          processorPaymentId: "processor_payment_conflict",
          idempotencyKey: "callback-paid-reference-conflict",
        },
        { eventBus },
      ),
    ).rejects.toMatchObject({ code: "payment_processor_reference_mismatch" })

    await expect(refreshedSession(session.id)).resolves.toMatchObject({
      status: "paid",
      providerSessionId: "processor_session_canonical",
      providerPaymentId: "processor_payment_canonical",
    })
    await expect(rowCount(paymentAuthorizations)).resolves.toBe(1)
    await expect(rowCount(paymentCaptures)).resolves.toBe(1)
    await expect(rowCount(payments)).resolves.toBe(1)
    expect(completedEvents).toHaveLength(1)
  })

  it("clears terminal failure timestamps when a later callback recovers the session to paid", async () => {
    const { session } = await seedInvoiceSession(db, 13500, {
      provider: "netopia",
      providerConnectionId: "payment_connection_recovery",
    })

    await applyPaymentAdapterCallbackEvent(db, {
      eventId: "evt_failure_before_recovery",
      paymentSessionId: session.id,
      nextState: "failed",
      occurredAt: "2026-07-17T00:00:00.000Z",
      processorIdentity: {
        providerId: "netopia",
        connectionId: "payment_connection_recovery",
      },
      idempotencyKey: "callback-failure-before-recovery",
    })

    expect((await refreshedSession(session.id))?.failedAt).toBeInstanceOf(Date)

    await applyPaymentAdapterCallbackEvent(db, {
      eventId: "evt_paid_recovery",
      paymentSessionId: session.id,
      nextState: "paid",
      occurredAt: "2026-07-17T00:00:01.000Z",
      processorIdentity: {
        providerId: "netopia",
        connectionId: "payment_connection_recovery",
      },
      processorSessionId: "processor_session_recovery",
      processorPaymentId: "processor_payment_recovery",
      idempotencyKey: "callback-paid-recovery",
    })

    await expect(refreshedSession(session.id)).resolves.toMatchObject({
      status: "paid",
      failedAt: null,
      cancelledAt: null,
      expiredAt: null,
      failureCode: null,
      failureMessage: null,
    })
  })

  it("serializes genuinely concurrent failed and paid callbacks so paid wins", async () => {
    const { invoice, session } = await seedInvoiceSession(db, 14000, {
      provider: "netopia",
      providerConnectionId: "payment_connection_123",
    })

    await withConcurrentDbClients(async (firstDb, secondDb) => {
      await Promise.all([
        applyPaymentAdapterCallbackEvent(firstDb, {
          eventId: "evt_concurrent_paid",
          paymentSessionId: session.id,
          nextState: "paid",
          occurredAt: "2026-07-17T00:00:00.000Z",
          processorIdentity: {
            providerId: "netopia",
            connectionId: "payment_connection_123",
          },
          processorSessionId: "processor_session_concurrent_paid",
          processorPaymentId: "processor_payment_concurrent_paid",
          idempotencyKey: "callback-concurrent-paid",
        }),
        applyPaymentAdapterCallbackEvent(secondDb, {
          eventId: "evt_concurrent_failed",
          paymentSessionId: session.id,
          nextState: "failed",
          occurredAt: "2026-07-17T00:00:00.000Z",
          processorIdentity: {
            providerId: "netopia",
            connectionId: "payment_connection_123",
          },
          idempotencyKey: "callback-concurrent-failed",
        }),
      ])
    })

    await expect(rowCount(paymentAuthorizations)).resolves.toBe(1)
    await expect(rowCount(paymentCaptures)).resolves.toBe(1)
    await expect(rowCount(payments)).resolves.toBe(1)
    await expect(refreshedInvoice(invoice.id)).resolves.toMatchObject({
      status: "paid",
      paidCents: 14000,
      balanceDueCents: 0,
    })
    await expect(refreshedSession(session.id)).resolves.toMatchObject({
      status: "paid",
      failureCode: null,
      failureMessage: null,
    })
  })

  it("serializes concurrent managed provider adoption attempts", async () => {
    const { session } = await seedInvoiceSession(db, 7000, {
      provider: "managed",
    })

    const attempts = await withConcurrentDbClients((firstDb, secondDb) =>
      Promise.allSettled([
        applyPaymentAdapterCallbackEvent(firstDb, {
          eventId: "evt_adopt_netopia",
          paymentSessionId: session.id,
          nextState: "processing",
          occurredAt: "2026-07-17T00:00:00.000Z",
          processorIdentity: {
            providerId: "netopia",
            connectionId: "payment_connection_netopia",
          },
          idempotencyKey: "callback-adopt-netopia",
        }),
        applyPaymentAdapterCallbackEvent(secondDb, {
          eventId: "evt_adopt_stripe",
          paymentSessionId: session.id,
          nextState: "processing",
          occurredAt: "2026-07-17T00:00:00.000Z",
          processorIdentity: {
            providerId: "stripe",
            connectionId: "payment_connection_stripe",
          },
          idempotencyKey: "callback-adopt-stripe",
        }),
      ]),
    )

    expect(attempts.filter((attempt) => attempt.status === "fulfilled")).toHaveLength(1)
    expect(attempts.filter((attempt) => attempt.status === "rejected")).toHaveLength(1)
    await expect(refreshedSession(session.id)).resolves.toMatchObject({
      status: "processing",
      providerConnectionId: expect.stringMatching(/^payment_connection_(netopia|stripe)$/),
    })
  })

  it("routes a synchronously authorized initiation through completion once", async () => {
    const { session } = await seedInvoiceSession(db, 8000)
    const adapter = stubAdapter("authorized")
    const starter = createPaymentAdapterCardPaymentStarter(adapter)

    await starter({ env: {} } as Context, {
      db,
      sessionId: session.id,
      billing: { email: "auth@example.com", firstName: "Authorized" },
    })

    await expect(rowCount(paymentAuthorizations)).resolves.toBe(1)
    await expect(rowCount(paymentCaptures)).resolves.toBe(0)
    await expect(rowCount(payments)).resolves.toBe(0)
    await expect(refreshedSession(session.id)).resolves.toMatchObject({ status: "authorized" })

    await applyPaymentAdapterCallbackEvent(db, {
      eventId: "evt_duplicate_authorized",
      paymentSessionId: session.id,
      nextState: "authorized",
      occurredAt: "2026-07-17T00:00:00.000Z",
      processorSessionId: "processor_session_authorized",
      processorPaymentId: "processor_payment_authorized",
      idempotencyKey: "callback-authorized",
    })

    await expect(rowCount(paymentAuthorizations)).resolves.toBe(1)
    await expect(rowCount(paymentCaptures)).resolves.toBe(0)
    await expect(rowCount(payments)).resolves.toBe(0)
  })

  async function seedInvoiceSession(
    db: PostgresJsDatabase,
    amountCents: number,
    sessionOverrides: Partial<typeof paymentSessions.$inferInsert> = {},
  ) {
    const [invoice] = await db
      .insert(invoices)
      .values({
        invoiceNumber: next("INV"),
        bookingId: next("book"),
        invoiceType: "invoice",
        status: "issued",
        currency: "EUR",
        issueDate: "2026-07-17",
        dueDate: "2026-07-24",
        subtotalCents: amountCents,
        taxCents: 0,
        totalCents: amountCents,
        paidCents: 0,
        balanceDueCents: amountCents,
      })
      .returning()
    if (!invoice) throw new Error("Invoice seed failed.")

    const session = await financeService.createPaymentSession(db, {
      invoiceId: invoice.id,
      amountCents,
      currency: invoice.currency,
      status: "pending",
      paymentMethod: "credit_card",
      notes: "Adapter initiation test",
      targetType: "invoice",
      targetId: invoice.id,
      ...sessionOverrides,
    })
    if (!session) throw new Error("Payment session seed failed.")
    return { invoice, session }
  }

  async function rowCount(
    table: typeof paymentAuthorizations | typeof paymentCaptures | typeof payments,
  ) {
    return (await db.select().from(table)).length
  }

  async function refreshedInvoice(id: string) {
    const [row] = await db.select().from(invoices).where(eq(invoices.id, id)).limit(1)
    return row
  }

  async function refreshedSession(id: string) {
    const [row] = await db.select().from(paymentSessions).where(eq(paymentSessions.id, id)).limit(1)
    return row
  }
})

async function withConcurrentDbClients<T>(
  run: (firstDb: PostgresJsDatabase, secondDb: PostgresJsDatabase) => Promise<T>,
) {
  const { createDbClient } = await import("@voyant-travel/db")
  const databaseUrl = process.env.TEST_DATABASE_URL
  if (!databaseUrl) throw new Error("TEST_DATABASE_URL is required for concurrent DB clients.")
  const firstDb = createDbClient(databaseUrl, {
    adapter: "node",
    nodeMaxConnections: 1,
    timeouts: { statementMs: false, queryMs: false, connectMs: false },
  }) as PostgresJsDatabaseWithClient
  const secondDb = createDbClient(databaseUrl, {
    adapter: "node",
    nodeMaxConnections: 1,
    timeouts: { statementMs: false, queryMs: false, connectMs: false },
  }) as PostgresJsDatabaseWithClient
  try {
    return await run(firstDb, secondDb)
  } finally {
    await Promise.all([
      firstDb.$client?.end?.({ timeout: 0 }),
      secondDb.$client?.end?.({ timeout: 0 }),
    ])
  }
}

type PostgresJsDatabaseWithClient = PostgresJsDatabase & {
  $client?: {
    end?: (options?: { timeout?: number | null }) => Promise<unknown>
  }
}

function stubAdapter(
  nextState: Extract<PaymentSessionState, "authorized" | "paid" | "processing">,
  options: Partial<Awaited<ReturnType<PaymentAdapter["initiate"]>>> = {},
): PaymentAdapter {
  return {
    id: "test-adapter",
    label: "Test Adapter",
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
      nextState,
      idempotencyKey: input.idempotencyKey,
      processorSessionId: `processor_session_${nextState}`,
      processorPaymentId: `processor_payment_${nextState}`,
      ...options,
    })),
    verifyCallback: vi.fn(async () => ({ verified: false, reason: "malformed" })),
    health: vi.fn(async () => ({
      status: "ok",
      checkedAt: "2026-07-17T00:00:00.000Z",
    })),
  }
}
