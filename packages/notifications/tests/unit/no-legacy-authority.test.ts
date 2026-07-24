import { existsSync, readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"

import {
  checkoutInvoiceNotificationSchema,
  checkoutPaymentSessionNotificationSchema,
  checkoutProviderStartInputSchema,
} from "@voyant-travel/finance/checkout-validation"
import { describe, expect, it } from "vitest"

describe("notification mutation authority", () => {
  it("does not publish direct service, route, or transport-provider compatibility shims", () => {
    const packageRoot = fileURLToPath(new URL("../../", import.meta.url))
    const packageJson = JSON.parse(readFileSync(`${packageRoot}/package.json`, "utf8")) as {
      exports: Record<string, unknown>
      publishConfig: { exports: Record<string, unknown> }
    }
    const indexSource = readFileSync(`${packageRoot}/src/index.ts`, "utf8")
    const routeSource = readFileSync(`${packageRoot}/src/routes.ts`, "utf8")

    for (const retiredExport of [
      "./service",
      "./providers/local",
      "./providers/voyant-cloud-email",
      "./providers/voyant-cloud-sms",
    ]) {
      expect(Object.keys(packageJson.exports)).not.toContain(retiredExport)
      expect(Object.keys(packageJson.publishConfig.exports)).not.toContain(retiredExport)
    }
    expect(indexSource).not.toMatch(
      /export (?:type )?\{[^}]*\b(?:createNotificationService|NotificationService|notificationsService|createLocalProvider|createVoyantCloudEmailProvider|createVoyantCloudSmsProvider)\b/s,
    )
    expect(routeSource).not.toMatch(/path:\s*["']\/send["']/)
    expect(existsSync(`${packageRoot}/src/providers/local.ts`)).toBe(false)
    expect(existsSync(`${packageRoot}/src/providers/voyant-cloud-email.ts`)).toBe(false)
    expect(existsSync(`${packageRoot}/src/providers/voyant-cloud-sms.ts`)).toBe(false)
  })

  it.each([
    checkoutPaymentSessionNotificationSchema,
    checkoutInvoiceNotificationSchema,
  ])("rejects Finance raw-content, provider, and recipient overrides", (schema) => {
    const result = schema.safeParse({
      idempotencyKey: "checkout-send-1",
      templateSlug: "payment-due",
      subject: "caller content",
      html: "<p>caller content</p>",
      text: "caller content",
      to: "override@example.test",
      provider: "caller-provider",
    })
    expect(result.success).toBe(false)
  })

  it("rejects the retired caller-selected payment provider hint", () => {
    expect(
      checkoutProviderStartInputSchema.safeParse({
        provider: "netopia",
        payload: {},
      }).success,
    ).toBe(false)
  })

  it("keeps exported domain-send interfaces template-only", () => {
    const source = readFileSync(
      fileURLToPath(new URL("../../src/service-shared.ts", import.meta.url)),
      "utf8",
    )
    const paymentInterface = source.match(
      /export interface SendPaymentSessionNotificationInput \{([\s\S]*?)\n\}/,
    )?.[1]
    const documentsInterface = source.match(
      /export interface SendBookingDocumentsNotificationInput \{([\s\S]*?)\n\}/,
    )?.[1]
    for (const contract of [paymentInterface, documentsInterface]) {
      expect(contract).toBeDefined()
      expect(contract).not.toMatch(
        /\b(channel|provider|to|from|subject|html|text|attachments|data|metadata)\??:/,
      )
    }
  })
})
