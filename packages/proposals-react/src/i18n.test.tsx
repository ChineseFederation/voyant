import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import {
  CrmUiMessagesProvider,
  getCrmUiI18n,
  resolveCrmUiMessages,
  useCrmUiMessagesOrDefault,
} from "./i18n/index.js"

describe("proposals i18n", () => {
  it("resolves localized package messages with fallback and overrides", () => {
    const result = resolveCrmUiMessages({
      locale: "ro-RO",
      overrides: {
        locales: {
          ro: {
            proposalVersionsPage: {
              title: "Versiuni custom",
            },
          },
        },
      },
    })

    expect(result.proposalVersionsPage.title).toBe("Versiuni custom")
    expect(result.common.proposalVersionStatusLabels.accepted).toBe("Acceptata")
  })

  it("returns locale-aware formatters from the package helper", () => {
    const result = getCrmUiI18n({ locale: "ro-RO" })

    expect(result.locale).toBe("ro-RO")
    expect(result.formatNumber(1200)).toBe(new Intl.NumberFormat("ro-RO").format(1200))
  })

  it("renders English copy without a provider", () => {
    const html = renderToStaticMarkup(<CrmMessageProbe />)

    expect(html).toContain("New proposal version")
    expect(html).toContain("Proposal versions")
    expect(html).toContain("Accepted")
    expect(html).toContain("Open")
  })

  it("renders Romanian copy with the package provider", () => {
    const html = renderToStaticMarkup(
      <CrmUiMessagesProvider locale="ro-RO">
        <CrmMessageProbe />
      </CrmUiMessagesProvider>,
    )

    expect(html).toContain("Versiune de oferta noua")
    expect(html).toContain("Versiuni oferta")
    expect(html).toContain("Acceptata")
    expect(html).toContain("Deschisa")
  })
})

function CrmMessageProbe() {
  const messages = useCrmUiMessagesOrDefault()

  return (
    <div>
      <span>{messages.createProposalVersionDialog.title}</span>
      <span>{messages.proposalVersionsPage.title}</span>
      <span>{messages.common.proposalVersionStatusLabels.accepted}</span>
      <span>{messages.common.proposalStatusLabels.open}</span>
    </div>
  )
}
