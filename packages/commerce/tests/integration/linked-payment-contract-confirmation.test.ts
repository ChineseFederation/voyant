import { newId } from "@voyant-travel/db/lib/typeid"
import { paymentSessions } from "@voyant-travel/finance/schema"
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"

import type { AcceptanceSignatureLegalPort } from "../../src/checkout/acceptance-signature.js"
import { recordLinkedBookingPaymentConfirmation } from "../../src/checkout/subscriber-runtime.js"

const DB_AVAILABLE = Boolean(process.env.TEST_DATABASE_URL)

describe.skipIf(!DB_AVAILABLE)("linked checkout payment contract confirmation", () => {
  let db: ReturnType<typeof import("@voyant-travel/db/test-utils").createTestDb>

  beforeAll(async () => {
    const { createTestDb } = await import("@voyant-travel/db/test-utils")
    db = createTestDb()
  })

  beforeEach(async () => {
    const { cleanupTestDb } = await import("@voyant-travel/db/test-utils")
    await cleanupTestDb(db)
  })

  afterAll(async () => {
    const { closeTestDb } = await import("@voyant-travel/db/test-utils")
    await closeTestDb()
  })

  it("finds a transferred paid session with the real Postgres query", async () => {
    const bookingId = newId("bookings")
    const pendingId = newId("payment_sessions")
    const paidId = newId("payment_sessions")
    await db.insert(paymentSessions).values([
      {
        id: pendingId,
        targetType: "booking",
        targetId: bookingId,
        bookingId,
        status: "pending",
        currency: "EUR",
        amountCents: 6_400,
        paymentMethod: "credit_card",
      },
      {
        id: paidId,
        targetType: "booking",
        targetId: bookingId,
        bookingId,
        status: "paid",
        currency: "EUR",
        amountCents: 6_400,
        paymentMethod: "credit_card",
      },
    ])
    const legal: AcceptanceSignatureLegalPort = {
      getContract: vi.fn(async () => ({
        id: "contract_card_1",
        bookingId,
        metadata: null,
        status: "draft",
      })),
      getBookingContract: vi.fn(),
      recordBookingPaymentConfirmation: vi.fn(async () => undefined),
      listSignatures: vi.fn(),
      issueContract: vi.fn(),
      sendContract: vi.fn(),
      signContract: vi.fn(),
    }

    await recordLinkedBookingPaymentConfirmation(db, "contract_card_1", legal)

    expect(legal.recordBookingPaymentConfirmation).toHaveBeenCalledWith(db, bookingId, paidId)
  })
})
