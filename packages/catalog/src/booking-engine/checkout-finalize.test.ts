import { describe, expect, it } from "vitest"

import { type CheckoutFinalizeDeps, runCheckoutFinalize } from "./checkout-finalize.js"

describe("runCheckoutFinalize", () => {
  it("links payment after issuing the final invoice", async () => {
    const calls: string[] = []
    const deps: CheckoutFinalizeDeps = {
      db: {} as CheckoutFinalizeDeps["db"],
      assertBookingCommitted: async () => {
        calls.push("assert")
      },
      issueInvoice: async () => {
        calls.push("invoice")
        return { invoiceId: "inv_1" }
      },
      linkPaymentToInvoice: async () => {
        calls.push("link")
        return { paymentId: "pay_1", sessionsLinked: 1 }
      },
    }

    await runCheckoutFinalize({ bookingId: "bk_1", paymentSessionId: "ps_1" }, deps)

    expect(calls).toEqual(["assert", "invoice", "link"])
  })

  it("can be redelivered after an invoice failure without duplicating financial effects", async () => {
    const effects = {
      invoiceId: null as string | null,
      paymentId: null as string | null,
    }
    let failFirstInvoiceAttempt = true
    const calls = { assert: 0, invoice: 0, link: 0 }
    const deps: CheckoutFinalizeDeps = {
      db: {} as CheckoutFinalizeDeps["db"],
      assertBookingCommitted: async () => {
        calls.assert++
      },
      issueInvoice: async () => {
        if (failFirstInvoiceAttempt) {
          failFirstInvoiceAttempt = false
          throw new Error("invoice service unavailable")
        }
        if (!effects.invoiceId) {
          calls.invoice++
          effects.invoiceId = "inv_1"
        }
        return { invoiceId: effects.invoiceId }
      },
      linkPaymentToInvoice: async () => {
        if (!effects.paymentId) {
          calls.link++
          effects.paymentId = "pay_1"
        }
        return { paymentId: effects.paymentId, sessionsLinked: effects.paymentId ? 1 : 0 }
      },
    }

    await expect(runCheckoutFinalize({ bookingId: "bk_1" }, deps)).rejects.toThrow(
      "invoice service unavailable",
    )
    await runCheckoutFinalize({ bookingId: "bk_1" }, deps)
    await runCheckoutFinalize({ bookingId: "bk_1" }, deps)

    expect(calls).toEqual({ assert: 3, invoice: 1, link: 1 })
  })
})
