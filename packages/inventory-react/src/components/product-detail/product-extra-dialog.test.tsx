import {
  type OperatorAdminMessages,
  operatorAdminMessageDefinitions,
  resolveLocaleMessages,
} from "@voyant-travel/i18n"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import { ProductExtraOwnershipGuidance } from "./product-extra-dialog.js"

/**
 * Product Plan / Options is the only place an Extra is authored, so the rule
 * about what may *not* be an Extra has to be stated there — not in a doc nobody
 * opens while creating one.
 */
describe("ProductExtraOwnershipGuidance", () => {
  it.each(["en", "ro"] as const)("states the ownership rule in %s", (locale) => {
    const messages = resolveLocaleMessages<OperatorAdminMessages>({
      locale,
      fallbackLocale: "en",
      definitions: operatorAdminMessageDefinitions,
    })
    const extras = messages.products.operations.extras
    const html = renderToStaticMarkup(<ProductExtraOwnershipGuidance messages={extras} />)

    expect(extras.ownershipGuidanceTitle.length).toBeGreaterThan(0)
    expect(html).toContain(escapeHtml(extras.ownershipGuidanceTitle))
    expect(html).toContain(escapeHtml(extras.ownershipGuidance))
    // The escalation rule is the load-bearing half: an addition that must be
    // independently confirmed, cancelled, taxed, fulfilled or supported is a
    // Product / Component Booking under a Trip, not an Extra.
    expect(html).toContain(escapeHtml(extras.ownershipGuidanceEscalation))
  })

  it("keeps the Romanian copy translated rather than falling back to English", () => {
    const en = resolveLocaleMessages<OperatorAdminMessages>({
      locale: "en",
      fallbackLocale: "en",
      definitions: operatorAdminMessageDefinitions,
    }).products.operations.extras
    const ro = resolveLocaleMessages<OperatorAdminMessages>({
      locale: "ro",
      fallbackLocale: "en",
      definitions: operatorAdminMessageDefinitions,
    }).products.operations.extras

    expect(ro.ownershipGuidance).not.toBe(en.ownershipGuidance)
    expect(ro.ownershipGuidanceEscalation).not.toBe(en.ownershipGuidanceEscalation)
  })
})

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;")
}
