import type { EventEnvelope } from "@voyant-travel/core"
import { createContainer, createEventBus } from "@voyant-travel/core"
import { createDbClient } from "@voyant-travel/db"
import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  generateBookingContractOnConfirmation,
  recordUnfulfilledBookingContract,
} from "../../src/booking-contract-confirmed.js"
import {
  createLegalBookingContractConfirmedSubscriber,
  LEGAL_BOOKING_CONTRACT_CONFIRMED_SUBSCRIBER_ID,
} from "../../src/booking-contract-confirmed-subscriber.js"

vi.mock("../../src/booking-contract-confirmed.js", () => ({
  generateBookingContractOnConfirmation: vi.fn(async () => ({ status: "generated" as const })),
  recordUnfulfilledBookingContract: vi.fn(async () => ({ recorded: true })),
}))

const UNIT_DATABASE_URL = ["postgres", "://", "unit", "@", "127.0.0.1:1/unit"].join("")

const confirmed = {
  name: "booking.confirmed",
  data: {
    bookingId: "book_1",
    bookingNumber: "BK-1",
    actorId: null,
    suppressNotifications: true,
  },
  emittedAt: "2026-08-08T00:00:00.000Z",
  metadata: {
    eventId: "evt_finance_booking_confirmed_book_1",
    category: "domain" as const,
    source: "service" as const,
  },
} satisfies EventEnvelope

function captureHandler() {
  const eventBus = createEventBus()
  let handler: ((event: EventEnvelope) => Promise<void> | void) | undefined
  vi.spyOn(eventBus, "subscribe").mockImplementation((_eventType, registeredHandler) => {
    handler = registeredHandler as typeof handler
    return { unsubscribe: vi.fn() }
  })
  return { eventBus, handler: () => handler }
}

describe("Legal booking contract confirmation subscriber", () => {
  beforeEach(() => vi.clearAllMocks())

  it("runs generation for every delivery and relies on the command's durable replay", async () => {
    const db = createDbClient(UNIT_DATABASE_URL, { adapter: "node" })
    const resolveDb = vi.fn(async () => db)
    const generate = vi.fn(async () => ({ status: "generated" as const }))
    const { eventBus, handler } = captureHandler()
    const descriptor = createLegalBookingContractConfirmedSubscriber({ resolveDb, generate })

    await descriptor.register({ bindings: {}, container: createContainer(), eventBus })
    await handler()?.(confirmed)
    await handler()?.(confirmed)

    expect({ id: descriptor.id, eventType: descriptor.eventType }).toEqual({
      id: LEGAL_BOOKING_CONTRACT_CONFIRMED_SUBSCRIBER_ID,
      eventType: "booking.confirmed",
    })
    expect(resolveDb).toHaveBeenCalledTimes(2)
    expect(generate).toHaveBeenCalledTimes(2)
    expect(generate).toHaveBeenNthCalledWith(1, {
      db,
      event: confirmed,
    })
  })

  // voyant#4634: this used to be a bare `return`, so a deployment that had
  // never once generated a contract looked exactly like one that always does.
  it("records the unfulfilled contract when the graph selected no renderer", async () => {
    const db = createDbClient(UNIT_DATABASE_URL, { adapter: "node" })
    const { eventBus, handler } = captureHandler()
    const descriptor = createLegalBookingContractConfirmedSubscriber({
      resolveDb: async () => db,
    })
    await descriptor.register({ bindings: {}, container: createContainer(), eventBus })

    await handler()?.(confirmed)

    expect(recordUnfulfilledBookingContract).toHaveBeenCalledWith(db, {
      event: confirmed,
      reason: "document_renderer_unavailable",
    })
    expect(generateBookingContractOnConfirmation).not.toHaveBeenCalled()
  })

  it("lets durable delivery observe generation failures", async () => {
    const failure = new Error("database unavailable")
    const db = createDbClient(UNIT_DATABASE_URL, { adapter: "node" })
    const { eventBus, handler } = captureHandler()
    const descriptor = createLegalBookingContractConfirmedSubscriber({
      resolveDb: async () => db,
      generate: async () => {
        throw failure
      },
    })
    await descriptor.register({ bindings: {}, container: createContainer(), eventBus })

    await expect(handler()?.(confirmed)).rejects.toBe(failure)
  })
})
