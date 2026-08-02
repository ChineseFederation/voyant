import { describe, expect, it, vi } from "vitest"

import { createProductionBookingSessionPaymentPorts } from "./sessions-payment-production.js"

describe("production Booking Session staff payment policy", () => {
  it("does not create a customer checkout when staff supplied a collection schedule", async () => {
    const loadProductPaymentPolicyContext = vi.fn()
    const payments = createProductionBookingSessionPaymentPorts({
      db: {} as never,
      inventory: { loadProductPaymentPolicyContext },
      distribution: { loadSupplierPaymentPolicy: vi.fn() },
      settings: { resolveOperatorDefaultPaymentPolicy: vi.fn() },
    })

    await expect(
      payments.prepare({
        session: {
          target: { kind: "product", productId: "prod_1" },
          statePayload: {
            staffBooking: {
              paymentSchedules: [
                {
                  scheduleType: "balance",
                  status: "pending",
                  dueDate: "2026-09-01",
                  currency: "EUR",
                  amountCents: 10_000,
                },
              ],
            },
          },
        },
        access: {
          actorKind: "staff",
          principalId: "usr_staff",
          staffAuthority: { admitted: true, reason: "manual_booking" },
          staffBookingAuthority: {
            admitted: true,
            reason: "bookings_and_finance_write",
          },
        },
      } as never),
    ).resolves.toEqual({ kind: "not_required" })
    expect(loadProductPaymentPolicyContext).not.toHaveBeenCalled()
  })
})
