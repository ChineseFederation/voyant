import { createToolRegistry, type ToolContext } from "@voyant-travel/tools"
import { describe, expect, it } from "vitest"

import { type FinanceToolContext, financePaymentLinkTools } from "../../src/tools.js"

/**
 * These invariants moved here with the payment-link Tools (voyant#4627). They
 * are the reason the Tools are shaped the way they are: a payment link is
 * created for an invoice's authoritative outstanding balance, so a caller must
 * not be able to name the amount, and inspecting one is a staff act.
 */
function context(
  actor: ToolContext["actor"],
  audience: ToolContext["audience"],
): FinanceToolContext {
  return {
    db: {},
    actor,
    audience,
    tenantId: "default",
    resolverScope: { locale: "en", audience, market: "default", actor },
  } as FinanceToolContext
}

describe("payment-link Tools", () => {
  it("owns two Tools on the finance payment-link unit", () => {
    expect(financePaymentLinkTools).toHaveLength(2)
    for (const tool of financePaymentLinkTools) {
      expect(tool.owner).toBe("@voyant-travel/finance#payment-link-routes")
    }
  })

  it("refuses a customer grant — inspecting a payment link is a staff act", async () => {
    const registry = createToolRegistry()
    registry.registerAll(financePaymentLinkTools)
    await expect(
      registry.dispatch(
        "get_payment_link",
        { sessionId: "pays_1" },
        context("customer", "customer"),
      ),
    ).rejects.toMatchObject({ code: "AUTHORIZATION_DENIED" })
  })

  it("does not expose amount or currency overrides on invoice payment links", () => {
    const registry = createToolRegistry()
    registry.registerAll(financePaymentLinkTools)
    const byName = new Map(registry.list().map((tool) => [tool.name, tool]))
    const properties = (name: string) =>
      (byName.get(name)?.inputSchema as { properties?: Record<string, unknown> })?.properties ?? {}

    expect(properties("create_invoice_payment_link")).not.toHaveProperty("amountCents")
    expect(properties("create_invoice_payment_link")).not.toHaveProperty("currency")
    expect(byName.get("create_invoice_payment_link")?.inputSchema.required).toEqual([
      "invoiceId",
      "idempotencyKey",
    ])
  })

  it("marks payment-link creation as a confirmation-gated high-risk write", () => {
    const registry = createToolRegistry()
    registry.registerAll(financePaymentLinkTools)
    const byName = new Map(registry.list().map((tool) => [tool.name, tool]))
    expect(byName.get("create_invoice_payment_link")).toMatchObject({
      tier: "write",
      riskPolicy: { reversible: true, confirmationRequired: true },
    })
  })
})
