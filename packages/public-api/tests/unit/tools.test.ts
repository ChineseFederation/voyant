import { createToolRegistry, type ToolContext } from "@voyant-travel/tools"
import { describe, expect, it } from "vitest"

import {
  type PublicApiToolContext,
  publicApiCustomerPortalTools,
  publicApiPaymentLinkTools,
  publicApiVerificationTools,
} from "../../src/tools.js"

const allTools = [
  ...publicApiCustomerPortalTools,
  ...publicApiPaymentLinkTools,
  ...publicApiVerificationTools,
]

function context(
  actor: ToolContext["actor"],
  audience: ToolContext["audience"],
): PublicApiToolContext {
  return {
    db: {},
    actor,
    audience,
    tenantId: "default",
    resolverScope: { locale: "en", audience, market: "default", actor },
  }
}

describe("storefront Tools", () => {
  it("registers all three Storefront extension surfaces with stable capabilities", () => {
    const registry = createToolRegistry()
    registry.registerAll(allTools)
    const manifest = registry.list()

    expect(publicApiCustomerPortalTools).toHaveLength(13)
    expect(publicApiPaymentLinkTools).toHaveLength(2)
    expect(publicApiVerificationTools).toHaveLength(4)
    expect(manifest).toHaveLength(19)
    expect(new Set(manifest.map(({ capabilityId }) => capabilityId))).toHaveProperty("size", 19)
    for (const tool of publicApiCustomerPortalTools) {
      expect(tool.owner).toBe("@voyant-travel/public-api#customer-portal")
    }
    for (const tool of publicApiPaymentLinkTools) {
      expect(tool.owner).toBe("@voyant-travel/public-api#payment-link")
    }
    for (const tool of publicApiVerificationTools) {
      expect(tool.owner).toBe("@voyant-travel/public-api#verification")
    }
    for (const tool of manifest) {
      expect(tool.capabilityVersion).toBe("v1")
      expect(tool.outputSchema).not.toHaveProperty("x-voyant-schema-quality")
    }
  })

  it("keeps customer self-service Tools customer-only and staff payment Tools staff-only", async () => {
    const registry = createToolRegistry()
    registry.registerAll(allTools)

    await expect(
      registry.dispatch("get_my_customer_portal_profile", {}, context("staff", "staff")),
    ).rejects.toMatchObject({ code: "AUTHORIZATION_DENIED" })
    await expect(
      registry.dispatch("start_my_email_verification", {}, context("staff", "staff")),
    ).rejects.toMatchObject({ code: "AUTHORIZATION_DENIED" })
    await expect(
      registry.dispatch(
        "get_payment_link",
        { sessionId: "pays_1" },
        context("customer", "customer"),
      ),
    ).rejects.toMatchObject({ code: "AUTHORIZATION_DENIED" })
  })

  it("does not expose principal, destination, purpose, amount, or currency overrides", () => {
    const registry = createToolRegistry()
    registry.registerAll(allTools)
    const byName = new Map(registry.list().map((tool) => [tool.name, tool]))
    const properties = (name: string) =>
      (byName.get(name)?.inputSchema.properties ?? {}) as Record<string, unknown>

    expect(properties("get_my_customer_portal_profile")).not.toHaveProperty("userId")
    expect(properties("start_my_email_verification")).toEqual({ locale: expect.any(Object) })
    expect(properties("start_my_email_verification")).not.toHaveProperty("destination")
    expect(properties("start_my_email_verification")).not.toHaveProperty("purpose")
    expect(properties("confirm_my_sms_verification")).toEqual({ code: expect.any(Object) })
    expect(properties("create_invoice_payment_link")).not.toHaveProperty("amountCents")
    expect(properties("create_invoice_payment_link")).not.toHaveProperty("currency")
    expect(byName.get("create_invoice_payment_link")?.inputSchema.required).toEqual([
      "invoiceId",
      "idempotencyKey",
    ])
  })

  it("marks sends and payment-link creation as confirmation-gated high-risk writes", () => {
    const registry = createToolRegistry()
    registry.registerAll(allTools)
    const byName = new Map(registry.list().map((tool) => [tool.name, tool]))

    expect(byName.get("start_my_email_verification")).toMatchObject({
      tier: "write",
      riskPolicy: {
        reversible: false,
        confirmationRequired: true,
        sideEffects: ["data-write", "email"],
      },
    })
    expect(byName.get("start_my_sms_verification")?.riskPolicy.sideEffects).toEqual([
      "data-write",
      "sms",
    ])
    expect(byName.get("create_invoice_payment_link")).toMatchObject({
      tier: "write",
      riskPolicy: { reversible: true, confirmationRequired: true },
    })
  })
})
