import { cleanupTestDb, createTestDb } from "@voyant-travel/db/test-utils"
import { paymentSessions } from "@voyant-travel/finance/schema"
import type { PaymentAdapter } from "@voyant-travel/payments"
import { eq } from "drizzle-orm"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { reconcilePaymentAdapterStatuses } from "../../src/payment-reconciliation-job.js"
import type { PaymentReconciliationJobRuntime } from "../../src/runtime-port.js"

const DB_AVAILABLE = Boolean(process.env.TEST_DATABASE_URL)
const db = DB_AVAILABLE ? createTestDb() : (null as never)

describe.skipIf(!DB_AVAILABLE)("payment reconciliation job", () => {
  beforeEach(async () => {
    await cleanupTestDb(db)
  })

  it("reconciles an embedded checkout that is pending with a processor payment id", async () => {
    const [unbound, embedded] = await db
      .insert(paymentSessions)
      .values([
        {
          targetType: "other",
          targetId: "unbound-checkout",
          status: "pending",
          currency: "EUR",
          amountCents: 8900,
          updatedAt: new Date("2026-08-07T08:00:00.000Z"),
        },
        {
          targetType: "booking_session",
          targetId: "bses_embedded",
          status: "pending",
          provider: "voyant-pay",
          providerConnectionId: "pacc_embedded",
          providerPaymentId: "pi_embedded",
          currency: "EUR",
          amountCents: 8900,
          updatedAt: new Date("2026-08-07T08:01:00.000Z"),
        },
      ])
      .returning()
    if (!unbound || !embedded) throw new Error("Payment-session seed failed")

    const status = vi.fn(async () => ({
      nextState: "processing" as const,
      processorIdentity: {
        providerId: "voyant-pay",
        connectionId: "pacc_embedded",
      },
      processorPaymentId: "pi_embedded",
    }))
    const adapter = {
      capabilities: { status: true },
      status,
    } as PaymentAdapter
    const runtime: PaymentReconciliationJobRuntime = {
      resolveDb: async () => db,
      resolveAdapter: async () => adapter,
      resolveEnv: () => ({}),
    }

    await expect(reconcilePaymentAdapterStatuses(runtime, {})).resolves.toEqual({
      examined: 1,
      refreshed: 1,
      failed: 0,
    })
    expect(status).toHaveBeenCalledWith(expect.anything(), {
      paymentSessionId: embedded.id,
      processorSessionId: null,
      processorPaymentId: "pi_embedded",
      processorIdentity: {
        providerId: "voyant-pay",
        connectionId: "pacc_embedded",
      },
    })

    await expect(
      db
        .select({ status: paymentSessions.status })
        .from(paymentSessions)
        .where(eq(paymentSessions.id, embedded.id)),
    ).resolves.toEqual([{ status: "processing" }])
    await expect(
      db
        .select({ status: paymentSessions.status })
        .from(paymentSessions)
        .where(eq(paymentSessions.id, unbound.id)),
    ).resolves.toEqual([{ status: "pending" }])
  })
})
