import type { EventEnvelope, SubscriberRuntimeDescriptor } from "@voyant-travel/core"
import { createContainer, createEventBus } from "@voyant-travel/core"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"
import { describe, expect, it, vi } from "vitest"

import type { AcceptanceSignatureLegalPort } from "../../src/checkout/acceptance-signature.js"
import {
  COMMERCE_ACCEPTANCE_SIGNATURE_SUBSCRIBER_ID,
  COMMERCE_CHECKOUT_FINALIZE_SUBSCRIBER_ID,
  createAcceptanceSignatureSubscriberRuntime,
  createCheckoutFinalizeSubscriberGraphRuntime,
  createCheckoutFinalizeSubscriberRuntime,
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

const legalPort = {
  getContract: vi.fn(),
  listSignatures: vi.fn(),
  sendContract: vi.fn(),
  signContract: vi.fn(),
} as unknown as AcceptanceSignatureLegalPort

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
    const withDb = vi.fn(async (_bindings, operation) => operation(db))
    const { eventBus, subscriptions } = recordingEventBus()
    const descriptor = createCheckoutFinalizeSubscriberRuntime({ withDb, finalize })
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
      getPort: async () => ({ withDb }),
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
