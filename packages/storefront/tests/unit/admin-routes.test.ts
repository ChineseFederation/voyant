import { handleApiError } from "@voyant-travel/hono"
import { Hono } from "hono"
import { describe, expect, it } from "vitest"

import { createStorefrontAdminRoutes } from "../../src/routes-admin.js"
import type { StorefrontSettingsInput } from "../../src/validation.js"

function createTestApp(options: Parameters<typeof createStorefrontAdminRoutes>[0]) {
  const app = new Hono()
  app.onError(handleApiError)
  return app.route("/", createStorefrontAdminRoutes(options))
}

describe("createStorefrontAdminRoutes", () => {
  it("reads normalized storefront settings through the admin surface", async () => {
    const app = createTestApp({
      settings: {
        support: {
          email: "support@example.com",
          phone: "+1 555 100 2000",
          links: [{ label: "WhatsApp", url: "https://wa.me/15551002000" }],
        },
        legal: {
          termsUrl: "https://example.com/terms",
          privacyUrl: "https://example.com/privacy",
          cancellationUrl: "https://example.com/cancellation",
          defaultContractTemplateId: "tmpl_terms",
          storedInstrumentMandate: null,
        },
        localization: {
          defaultLocale: "en-US",
          currencyDisplay: "symbol",
        },
        payment: {
          defaultMethod: "bank_transfer",
          structure: "split",
          schedule: [
            { percent: 30, dueInDays: 0, dueCondition: "after_booking" },
            { percent: 70, dueInDays: 45, dueCondition: "before_departure" },
          ],
          defaultSchedule: {
            depositPercent: 30,
            balanceDueDaysBeforeDeparture: 45,
          },
          bankTransfer: {
            dueDays: 7,
            account: {
              provider: "bank",
              currency: "RON",
              iban: "RO49AAAA1B31007593840000",
              beneficiary: "Voyant Travel LLC",
              bank: "Example Bank",
            },
            accountHolder: "Voyant Travel LLC",
            bankName: "Example Bank",
            iban: "RO49AAAA1B31007593840000",
            bic: "EXAMPLER",
            paymentReference: "Use booking reference",
            instructions: "Send proof of payment after transfer.",
          },
          methods: [{ code: "bank_transfer" }],
        },
      },
    })

    const res = await app.request("/settings")

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      data: {
        support: {
          email: "support@example.com",
          phone: "+1 555 100 2000",
          links: [{ label: "WhatsApp", url: "https://wa.me/15551002000" }],
        },
        legal: {
          termsUrl: "https://example.com/terms",
          privacyUrl: "https://example.com/privacy",
          cancellationUrl: "https://example.com/cancellation",
          defaultContractTemplateId: "tmpl_terms",
          storedInstrumentMandate: null,
        },
        localization: {
          defaultLocale: "en-US",
          currencyDisplay: "symbol",
        },
        forms: {
          billing: { fields: [] },
          travelers: { fields: [] },
        },
        payment: {
          defaultMethod: "bank_transfer",
          structure: "split",
          schedule: [
            { percent: 30, dueInDays: 0, dueCondition: "after_booking" },
            { percent: 70, dueInDays: 45, dueCondition: "before_departure" },
          ],
          defaultSchedule: {
            depositPercent: 30,
            balanceDueDaysBeforeDeparture: 45,
          },
          bankTransfer: {
            dueDays: 7,
            account: {
              provider: "bank",
              currency: "RON",
              iban: "RO49AAAA1B31007593840000",
              beneficiary: "Voyant Travel LLC",
              bank: "Example Bank",
            },
            accountHolder: "Voyant Travel LLC",
            bankName: "Example Bank",
            iban: "RO49AAAA1B31007593840000",
            bic: "EXAMPLER",
            paymentReference: "Use booking reference",
            instructions: "Send proof of payment after transfer.",
          },
          methods: [
            {
              code: "bank_transfer",
              label: "Bank transfer",
              description: null,
              enabled: true,
            },
          ],
        },
      },
    })
  })

  it("patches each settings section and preserves omitted values", async () => {
    let settings: StorefrontSettingsInput = {
      support: { email: "old@example.com", phone: "+1 555 0000" },
      payment: {
        defaultMethod: "card",
        defaultSchedule: { depositPercent: 20, balanceDueDaysBeforeDeparture: 30 },
      },
    }
    const app = createTestApp({
      resolveSettings: () => settings,
      updateSettings: (next) => {
        settings = next
        return next
      },
    })

    const res = await app.request("/settings", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        support: {
          email: "help@example.com",
          links: [{ label: "Contact form", url: "https://example.com/contact" }],
        },
        legal: {
          termsUrl: "https://example.com/terms",
          privacyUrl: "https://example.com/privacy",
          cancellationUrl: "https://example.com/cancellation",
          defaultContractTemplateId: "contract_123",
        },
        localization: {
          defaultLocale: "fr-FR",
          currencyDisplay: "name",
        },
        payment: {
          defaultMethod: "bank_transfer",
          structure: "split",
          schedule: [
            { percent: 35, dueInDays: 0, dueCondition: "after_booking" },
            { percent: 65, dueInDays: 60, dueCondition: "before_departure" },
          ],
          defaultSchedule: {
            depositPercent: 35,
            balanceDueDaysBeforeDeparture: 60,
          },
          bankTransfer: {
            dueDays: 7,
            account: {
              provider: "bank",
              currency: "RON",
              iban: "RO49AAAA1B31007593840000",
              beneficiary: "Example Operator",
              bank: "Example Bank",
            },
            accountHolder: "Example Operator",
            bankName: "Example Bank",
            iban: "RO49AAAA1B31007593840000",
            bic: "EXAMPLER",
            paymentReference: "Booking ID",
            instructions: "Transfer before balance due date.",
          },
          methods: [
            { code: "card", enabled: false },
            { code: "bank_transfer", label: "Bank transfer" },
          ],
        },
      }),
    })

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data.support).toEqual({
      email: "help@example.com",
      phone: "+1 555 0000",
      links: [{ label: "Contact form", url: "https://example.com/contact" }],
    })
    expect(body.data.payment.defaultSchedule).toEqual({
      depositPercent: 35,
      balanceDueDaysBeforeDeparture: 60,
    })
    expect(body.data.payment.structure).toBe("split")
    expect(body.data.payment.schedule).toEqual([
      { percent: 35, dueInDays: 0, dueCondition: "after_booking" },
      { percent: 65, dueInDays: 60, dueCondition: "before_departure" },
    ])
    expect(body.data.payment.methods).toEqual([
      { code: "card", label: "Card", description: null, enabled: false },
      { code: "bank_transfer", label: "Bank transfer", description: null, enabled: true },
    ])
  })

  it("preserves omitted nested payment schedule and bank-transfer values", async () => {
    let settings: StorefrontSettingsInput = {
      payment: {
        defaultSchedule: { depositPercent: 20, balanceDueDaysBeforeDeparture: 30 },
        bankTransfer: {
          dueDays: 7,
          accountHolder: "Example Operator",
          bankName: "Old Bank",
          iban: "RO49AAAA1B31007593840000",
          bic: "EXAMPLER",
          paymentReference: "Booking ID",
          instructions: "Transfer before balance due date.",
        },
      },
    }
    const app = createTestApp({
      resolveSettings: () => settings,
      updateSettings: (next) => {
        settings = next
        return next
      },
    })

    const res = await app.request("/settings", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        payment: {
          defaultSchedule: { depositPercent: 35 },
          bankTransfer: { bankName: "New Bank" },
        },
      }),
    })

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data.payment.defaultSchedule).toEqual({
      depositPercent: 35,
      balanceDueDaysBeforeDeparture: 30,
    })
    expect(body.data.payment.bankTransfer).toEqual({
      dueDays: 7,
      account: {
        provider: null,
        currency: null,
        iban: "RO49AAAA1B31007593840000",
        beneficiary: "Example Operator",
        bank: "New Bank",
      },
      accountHolder: "Example Operator",
      bankName: "New Bank",
      iban: "RO49AAAA1B31007593840000",
      bic: "EXAMPLER",
      paymentReference: "Booking ID",
      instructions: "Transfer before balance due date.",
    })
  })

  it("rejects invalid URLs, locales, and payment metadata", async () => {
    const app = createTestApp({
      updateSettings: (next) => next,
    })

    const res = await app.request("/settings", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        support: { email: "not-email", links: [{ label: "", url: "ftp://example.com" }] },
        legal: { termsUrl: "not-a-url" },
        localization: { defaultLocale: "not a locale", currencyDisplay: "verbose" },
        payment: { defaultSchedule: { depositPercent: 120 } },
      }),
    })

    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.code).toBe("invalid_request")
  })

  it("returns a structured error when no admin updater is configured", async () => {
    const app = createTestApp({})

    const res = await app.request("/settings", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ support: { email: "support@example.com" } }),
    })

    expect(res.status).toBe(409)
    expect(await res.json()).toMatchObject({
      code: "storefront_settings_update_not_configured",
      error: "Storefront settings updates are not configured",
    })
  })
})
