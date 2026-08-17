import { isPermanentSubscriberError } from "@voyant-travel/core"
import { describe, expect, it } from "vitest"

import {
  createInMemoryBookingSessionRepository,
  createInMemoryOwnedInventoryPorts,
  inMemoryBookingRequirements,
} from "./sessions-memory.js"
import {
  BookingSessionCommitRejectedError,
  type BookingSessionPaymentPorts,
  createBookingSessionModule,
} from "./sessions-service.js"

const ACCESS = {
  actorKind: "anonymous" as const,
  capability: `bcap_${"a".repeat(43)}`,
  storefront: { channelId: "chan_public" },
}

describe("paid Booking Session settlement failures", () => {
  it("retains a typed commit reason, releases the Hold, and exposes no billing PII", async () => {
    const repository = createInMemoryBookingSessionRepository()
    const inventory = createInMemoryOwnedInventoryPorts()
    inventory.setCapacity("product:prod_owned_1", 1)
    let established: { quoteId: string; holdId: string } | null = null
    const payments: BookingSessionPaymentPorts = {
      async prepare() {
        return { kind: "established", paymentSessionId: "payment_session_1" }
      },
      async describeEstablished() {
        return established
      },
      async transferToBooking() {},
      async expirePending() {},
    }
    const requirements = inMemoryBookingRequirements()
    const module = createBookingSessionModule({
      now: () => new Date("2026-08-17T08:00:00.000Z"),
      ports: {
        repository,
        normalizeSelection: async ({ selection }) => selection,
        composeRequirements: async () => ({ status: "available", requirements }),
        composeQuote: async () => ({
          status: "quoted",
          requirements,
          pricing: {
            currency: "EUR",
            lines: [
              {
                kind: "base",
                label: "Owned product",
                quantity: 1,
                unitAmount: 10_000,
                totalAmount: 10_000,
              },
            ],
            taxes: [],
            subtotal: 10_000,
            taxTotal: 0,
            total: 10_000,
          },
        }),
        placeCapacityHold: inventory.placeCapacityHold,
        releaseCapacityHold: inventory.releaseCapacityHold,
        async commitOwnedBooking() {
          throw new BookingSessionCommitRejectedError("incomplete_draft")
        },
        payments,
      },
    })
    const created = await module.createSession(
      {
        idempotencyKey: "create_paid_session",
        target: { kind: "product", productId: "prod_owned_1" },
        selection: {
          billing: {
            contact: {
              firstName: "Private",
              lastName: "Buyer",
              email: "buyer@example.test",
            },
          },
        },
      },
      ACCESS,
    )
    if (created.kind !== "session_created") throw new Error("session not created")
    const quoted = await module.quoteSession(
      created.session.id,
      { expectedRevision: created.session.revision, idempotencyKey: "quote_paid_session" },
      ACCESS,
    )
    if (quoted.kind !== "quote_created") throw new Error("quote not created")
    const held = await module.placeHold(
      created.session.id,
      {
        expectedRevision: created.session.revision,
        quoteId: quoted.quote.id,
        idempotencyKey: "hold_paid_session",
      },
      ACCESS,
    )
    if (held.kind !== "hold_created") throw new Error("hold not created")
    established = { quoteId: quoted.quote.id, holdId: held.hold.id }

    const refusal = await module
      .commitPaidSession({
        bookingSessionId: created.session.id,
        paymentSessionId: "payment_session_1",
      })
      .catch((error: unknown) => error)

    expect(refusal).toBeInstanceOf(Error)
    expect((refusal as Error).message).toBe(
      "booking_session_settlement_commit_rejected:commit_rejected:incomplete_draft",
    )
    expect((refusal as Error).message).not.toMatch(/Private|Buyer|buyer@example\.test/)
    expect(isPermanentSubscriberError(refusal)).toBe(true)
    expect(repository.holds.get(held.hold.id)?.state).toBe("released")
    expect(inventory.hasActiveHold(held.hold.id)).toBe(false)
  })
})
