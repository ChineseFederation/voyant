import type { EventEnvelope, SubscriberRuntimeDescriptor } from "@voyant-travel/core"
import { createContainer, createEventBus } from "@voyant-travel/core"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"
import { describe, expect, it, vi } from "vitest"

import type { AcceptanceSignatureLegalPort } from "../../src/checkout/acceptance-signature.js"
import { catalogCheckoutLegalRuntimePort } from "../../src/checkout/runtime-ports.js"
import {
  COMMERCE_ACCEPTANCE_SIGNATURE_SUBSCRIBER_ID,
  COMMERCE_CHECKOUT_FINALIZE_SUBSCRIBER_ID,
  COMMERCE_INVOICE_PAYMENT_SIGNATURE_SUBSCRIBER_ID,
  createAcceptanceSignatureSubscriberRuntime,
  createCheckoutFinalizeSubscriberGraphRuntime,
  createCheckoutFinalizeSubscriberRuntime,
  createInvoicePaymentSignatureSubscriberRuntime,
  recordLinkedBookingPaymentConfirmation,
} from "../../src/checkout/subscriber-runtime.js"

type Handler = (
  event: EventEnvelope,
  context?: { eventBus: ReturnType<typeof createEventBus> },
) => Promise<void> | void

function recordingEventBus() {
  const eventBus = createEventBus()
  const subscriptions: Array<{ eventType: string; handler: Handler; inline: boolean }> = []
  vi.spyOn(eventBus, "subscribe").mockImplementation((eventType, handler, options) => {
    subscriptions.push({
      eventType,
      handler: handler as Handler,
      inline: options?.inline ?? false,
    })
    return { unsubscribe: vi.fn() }
  })
  return { eventBus, subscriptions }
}

function event(name: string, data: unknown): EventEnvelope {
  return { name, data, emittedAt: new Date().toISOString(), metadata: undefined }
}

const legalPort: AcceptanceSignatureLegalPort = {
  getContract: vi.fn(),
  getBookingContract: vi.fn(),
  recordBookingPaymentConfirmation: vi.fn(),
  listSignatures: vi.fn(),
  issueContract: vi.fn(),
  sendContract: vi.fn(),
  signContract: vi.fn(),
}

describe("catalog-checkout subscriber runtimes", () => {
  it("injects the Legal port into acceptance-signature persistence", async () => {
    const db = {} as PostgresJsDatabase
    const bindings = { DATABASE_URL: "postgres://commerce" }
    const persistSignature = vi.fn(async () => {})
    const withDb = vi.fn(async (_bindings, operation) => operation(db))
    const { eventBus, subscriptions } = recordingEventBus()
    const descriptor = createAcceptanceSignatureSubscriberRuntime({
      legal: legalPort,
      withDb,
      persistSignature,
    })

    await descriptor.register({ bindings, container: createContainer(), eventBus })
    await subscriptions[0]?.handler(
      event("contract.document.generated", { contractId: "contract_1" }),
    )

    expect(descriptor).toMatchObject({
      id: COMMERCE_ACCEPTANCE_SIGNATURE_SUBSCRIBER_ID,
      eventType: "contract.document.generated",
    })
    expect(withDb).toHaveBeenCalledWith(bindings, expect.any(Function))
    expect(persistSignature).toHaveBeenCalledWith(db, "contract_1", eventBus, legalPort)
  })

  it("recovers a linked paid checkout before promoting the generated contract", async () => {
    const db = {} as PostgresJsDatabase
    const calls: string[] = []
    const promoteLinkedPayment = vi.fn(async () => {
      calls.push("payment")
    })
    const persistSignature = vi.fn(async () => {
      calls.push("signature")
    })
    const { eventBus, subscriptions } = recordingEventBus()
    const descriptor = createAcceptanceSignatureSubscriberRuntime({
      legal: legalPort,
      withDb: async (_bindings, operation) => operation(db),
      promoteLinkedPayment,
      persistSignature,
    })

    await descriptor.register({ bindings: {}, container: createContainer(), eventBus })
    await subscriptions[0]?.handler(
      event("contract.document.generated", { contractId: "contract_card_1" }),
    )

    expect(promoteLinkedPayment).toHaveBeenCalledWith(db, "contract_card_1", legalPort)
    expect(calls).toEqual(["payment", "signature"])
  })

  it("records a transferred paid Booking Session as contract payment confirmation", async () => {
    const limit = vi.fn(async () => [{ id: "session_card_1" }])
    const db = {
      select: () => ({
        from: () => ({
          where: () => ({
            orderBy: () => ({ limit }),
          }),
        }),
      }),
    } as PostgresJsDatabase
    const paidLegalPort: AcceptanceSignatureLegalPort = {
      ...legalPort,
      getContract: vi.fn(async () => ({
        id: "contract_card_1",
        bookingId: "booking_card_1",
        metadata: null,
        status: "draft",
      })),
      recordBookingPaymentConfirmation: vi.fn(async () => undefined),
    }

    await recordLinkedBookingPaymentConfirmation(db, "contract_card_1", paidLegalPort)

    expect(paidLegalPort.recordBookingPaymentConfirmation).toHaveBeenCalledWith(
      db,
      "booking_card_1",
      "session_card_1",
    )
  })

  it("logs and rethrows acceptance-signature failures for outbox retry", async () => {
    const error = new Error("legal unavailable")
    const logger = { error: vi.fn() }
    const { eventBus, subscriptions } = recordingEventBus()
    const descriptor = createAcceptanceSignatureSubscriberRuntime({
      legal: legalPort,
      withDb: async () => {
        throw error
      },
      logger,
    })
    await descriptor.register({ bindings: {}, container: createContainer(), eventBus })

    await expect(
      subscriptions[0]?.handler(event("contract.document.generated", { contractId: "contract_2" })),
    ).rejects.toBe(error)
    expect(logger.error).toHaveBeenCalledWith(
      "[catalog-checkout] persistAcceptanceSignature failed",
      error,
    )
  })

  it("finalizes booking payments inline with the delivery-scoped event bus", async () => {
    const db = {} as PostgresJsDatabase
    const scopedEventBus = createEventBus()
    const finalize = vi.fn(async () => undefined)
    const persistSignature = vi.fn(async () => undefined)
    const paidLegalPort: AcceptanceSignatureLegalPort = {
      ...legalPort,
      getBookingContract: vi.fn(async () => ({
        id: "contract_1",
        bookingId: "booking_1",
        metadata: null,
        status: "draft",
      })),
      recordBookingPaymentConfirmation: vi.fn(async () => undefined),
    }
    const withDb = vi.fn(async (_bindings, operation) => operation(db))
    const { eventBus, subscriptions } = recordingEventBus()
    const descriptor = createCheckoutFinalizeSubscriberRuntime({
      withDb,
      finalize,
      legal: paidLegalPort,
      persistSignature,
    })
    await descriptor.register({ bindings: {}, container: createContainer(), eventBus })

    await subscriptions[0]?.handler(
      event("payment.completed", {
        bookingId: "booking_1",
        paymentSessionId: "session_1",
        paymentIntent: "card",
      }),
      { eventBus: scopedEventBus },
    )

    expect(descriptor).toMatchObject({
      id: COMMERCE_CHECKOUT_FINALIZE_SUBSCRIBER_ID,
      eventType: "payment.completed",
    })
    expect(subscriptions[0]?.inline).toBe(true)
    expect(finalize).toHaveBeenCalledWith(
      expect.objectContaining({
        db,
        eventBus: scopedEventBus,
        input: {
          bookingId: "booking_1",
          paymentSessionId: "session_1",
          paymentIntent: "card",
        },
      }),
    )
    expect(paidLegalPort.recordBookingPaymentConfirmation).toHaveBeenCalledWith(
      db,
      "booking_1",
      "session_1",
    )
    expect(persistSignature).toHaveBeenCalledWith(db, "contract_1", scopedEventBus, paidLegalPort)
  })

  it("promotes an accepted booking contract after a completed invoice payment", async () => {
    const db = {} as PostgresJsDatabase
    const scopedEventBus = createEventBus()
    const persistSignature = vi.fn(async () => undefined)
    const paidLegalPort: AcceptanceSignatureLegalPort = {
      ...legalPort,
      getBookingContract: vi.fn(async () => ({
        id: "contract_bank_1",
        bookingId: "booking_bank_1",
        metadata: null,
        status: "draft",
      })),
      recordBookingPaymentConfirmation: vi.fn(async () => undefined),
    }
    const withDb = vi.fn(async (_bindings, operation) => operation(db))
    const { eventBus, subscriptions } = recordingEventBus()
    const descriptor = createInvoicePaymentSignatureSubscriberRuntime({
      withDb,
      legal: paidLegalPort,
      persistSignature,
    })
    await descriptor.register({ bindings: {}, container: createContainer(), eventBus })

    await subscriptions[0]?.handler(
      event("invoice.payment.recorded", {
        bookingId: "booking_bank_1",
        paymentId: "payment_bank_1",
        status: "completed",
      }),
      { eventBus: scopedEventBus },
    )

    expect(descriptor).toMatchObject({
      id: COMMERCE_INVOICE_PAYMENT_SIGNATURE_SUBSCRIBER_ID,
      eventType: "invoice.payment.recorded",
    })
    expect(subscriptions[0]?.inline).toBe(true)
    expect(paidLegalPort.recordBookingPaymentConfirmation).toHaveBeenCalledWith(
      db,
      "booking_bank_1",
      "payment_bank_1",
    )
    expect(persistSignature).toHaveBeenCalledWith(
      db,
      "contract_bank_1",
      scopedEventBus,
      paidLegalPort,
    )
  })

  it("ignores invoice payments that are incomplete or unrelated to a booking", async () => {
    const withDb = vi.fn(async (_bindings, operation) => operation({} as PostgresJsDatabase))
    const { eventBus, subscriptions } = recordingEventBus()
    const descriptor = createInvoicePaymentSignatureSubscriberRuntime({
      withDb,
      legal: legalPort,
    })
    await descriptor.register({ bindings: {}, container: createContainer(), eventBus })

    await subscriptions[0]?.handler(
      event("invoice.payment.recorded", {
        bookingId: "booking_bank_1",
        paymentId: "payment_bank_1",
        status: "pending",
      }),
    )
    await subscriptions[0]?.handler(
      event("invoice.payment.recorded", {
        bookingId: null,
        paymentId: "payment_unrelated_1",
        status: "completed",
      }),
    )

    expect(withDb).not.toHaveBeenCalled()
  })

  it("commits paid Booking Sessions before finalizing their booking", async () => {
    const db = {} as PostgresJsDatabase
    const calls: string[] = []
    const settleBookingSession = vi.fn(async () => {
      calls.push("settle")
      return { bookingId: "booking_settled" }
    })
    const finalize = vi.fn(async () => {
      calls.push("finalize")
    })
    const withDb = vi.fn(async (_bindings, operation) => operation(db))
    const { eventBus, subscriptions } = recordingEventBus()
    const descriptor = createCheckoutFinalizeSubscriberRuntime({
      withDb,
      finalize,
      settleBookingSession,
    })
    await descriptor.register({ bindings: {}, container: createContainer(), eventBus })

    await subscriptions[0]?.handler(
      event("payment.completed", {
        bookingId: null,
        paymentSessionId: "payment_session_1",
        targetType: "booking_session",
        targetId: "booking_session_1",
      }),
    )

    expect(settleBookingSession).toHaveBeenCalledWith({
      bookingSessionId: "booking_session_1",
      paymentSessionId: "payment_session_1",
    })
    expect(finalize).toHaveBeenCalledWith(
      expect.objectContaining({
        input: expect.objectContaining({ bookingId: "booking_settled" }),
      }),
    )
    expect(calls).toEqual(["settle", "finalize"])
  })

  it("announces a payment that settled with no booking", async () => {
    // voyant#4733. Money captured, nothing booked, and the only way anybody
    // learned of it was querying `payment_sessions` for
    // `status = 'paid' AND booking_id IS NULL`. Three live sessions on one
    // tenant were found that way; one was a real customer with a paid trip and
    // no booking.
    const db = {} as PostgresJsDatabase
    const settleBookingSession = vi.fn(async () => {
      throw new Error("booking_session_settlement_commit_rejected:invalid_request")
    })
    const withDb = vi.fn(async (_bindings, operation) => operation(db))
    const { eventBus, subscriptions } = recordingEventBus()
    const emitted: Array<{ type: string; payload: unknown }> = []
    vi.spyOn(eventBus, "emit").mockImplementation(async (type, payload) => {
      emitted.push({ type, payload: payload as unknown })
    })
    const descriptor = createCheckoutFinalizeSubscriberRuntime({
      withDb,
      settleBookingSession,
      logger: { error: vi.fn() },
    })
    await descriptor.register({ bindings: {}, container: createContainer(), eventBus })

    // Still rethrown: the handler genuinely failed and the outbox must retry
    // it. The signal is in addition to the failure, not instead of it.
    await expect(
      subscriptions[0]?.handler(
        event("payment.completed", {
          bookingId: null,
          paymentSessionId: "payment_session_1",
          targetType: "booking_session",
          targetId: "booking_session_1",
        }),
      ),
    ).rejects.toThrow(/booking_session_settlement_commit_rejected/)

    expect(emitted).toEqual([
      {
        type: "booking_session.settlement.failed",
        payload: {
          bookingSessionId: "booking_session_1",
          paymentSessionId: "payment_session_1",
          reason: "booking_session_settlement_commit_rejected:invalid_request",
        },
      },
    ])
  })

  it("resolves the monthly booking limit per event, not once at registration", async () => {
    let live: number | null | undefined = 10
    const finalize = vi.fn(async () => undefined)
    const withDb = vi.fn(async (_bindings, operation) => operation({} as PostgresJsDatabase))
    const { eventBus, subscriptions } = recordingEventBus()
    const descriptor = createCheckoutFinalizeSubscriberRuntime({
      withDb,
      finalize,
      resolveMonthlyBookingLimit: () => live,
    })
    await descriptor.register({
      bindings: { VOYANT_BOOKINGS_MONTHLY_LIMIT: "100" },
      container: createContainer(),
      eventBus,
    })

    const deliver = async () => {
      await subscriptions[0]?.handler(
        event("payment.completed", { bookingId: "booking_1", paymentSessionId: "session_1" }),
      )
    }

    await deliver()
    live = 250
    await deliver()
    live = undefined
    await deliver()

    expect(finalize.mock.calls.map(([params]) => params.monthlyBookingLimit)).toEqual([
      10, 250, 100,
    ])
  })

  it("takes the monthly booking limit resolver from deployment host options", async () => {
    // Until host options existed this factory accepted none, so the seam was
    // reachable only through the direct constructor — never from the graph.
    let live: number | null | undefined = 10
    const finalize = vi.fn(async () => undefined)
    const withDb = vi.fn(async (_bindings, operation) => operation({} as PostgresJsDatabase))
    const { eventBus, subscriptions } = recordingEventBus()

    const descriptor = await createCheckoutFinalizeSubscriberGraphRuntime({
      unitId: "@voyant-travel/commerce",
      hostOptions: { finalize, resolveMonthlyBookingLimit: () => live },
      getPort: async (port: { id: string }) =>
        port.id === catalogCheckoutLegalRuntimePort.id ? legalPort : { withDb },
    } as never)

    await (descriptor as SubscriberRuntimeDescriptor).register({
      bindings: { VOYANT_BOOKINGS_MONTHLY_LIMIT: "100" },
      container: createContainer(),
      eventBus,
    })

    const deliver = async () => {
      await subscriptions[0]?.handler(
        event("payment.completed", { bookingId: "booking_1", paymentSessionId: "session_1" }),
      )
    }

    await deliver()
    live = null
    await deliver()
    live = undefined
    await deliver()

    expect(finalize.mock.calls.map(([params]) => params.monthlyBookingLimit)).toEqual([
      10,
      null,
      100,
    ])
  })

  it("ignores unrelated payments and rethrows dispatch failures for outbox retry", async () => {
    const error = new Error("checkout finalization failure")
    const finalize = vi.fn(async () => {
      throw error
    })
    const logger = { error: vi.fn() }
    const withDb = vi.fn(async (_bindings, operation) => operation({} as PostgresJsDatabase))
    const { eventBus, subscriptions } = recordingEventBus()
    const descriptor = createCheckoutFinalizeSubscriberRuntime({ withDb, finalize, logger })
    await descriptor.register({ bindings: {}, container: createContainer(), eventBus })

    await subscriptions[0]?.handler(event("payment.completed", { bookingId: null }))
    expect(withDb).not.toHaveBeenCalled()

    await expect(
      subscriptions[0]?.handler(
        event("payment.completed", { bookingId: "booking_2", paymentSessionId: "session_2" }),
      ),
    ).rejects.toBe(error)
    expect(finalize).toHaveBeenCalledOnce()
    expect(logger.error).toHaveBeenCalledWith(
      "[catalog-checkout] checkout finalization failed for booking booking_2",
      error,
    )
  })
})
