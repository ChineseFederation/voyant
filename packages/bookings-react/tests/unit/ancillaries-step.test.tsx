// @vitest-environment jsdom

import type {
  AncillaryOfferGroupV1,
  AncillaryOfferV1,
} from "@voyant-travel/catalog-contracts/booking-engine/ancillary-contracts"
import { ancillaryOfferKey } from "@voyant-travel/catalog-contracts/booking-engine/ancillary-contracts"
import type { BookingRequirementsV1 } from "@voyant-travel/catalog-contracts/booking-engine/requirements-contracts"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { renderToStaticMarkup } from "react-dom/server"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { defaultMinimalShape } from "../../src/journey/components/booking-journey-rules.js"
import { AncillariesStep } from "../../src/journey/components/journey-steps/ancillaries-step.js"
import {
  type Draft,
  emptyDraft,
  setAncillarySelection,
  setTravelers,
} from "../../src/journey/lib/draft-state.js"

;(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true

const ENTITY = { module: "products", id: "prod_1", sourceKind: "owned" } as const

function offer(overrides: Partial<AncillaryOfferV1> = {}): AncillaryOfferV1 {
  return {
    offerId: "offer_1",
    sourceId: "source_1",
    providerId: "provider_1",
    providerLabel: "Northwind Assurance",
    kind: "insurance",
    title: "Trip protection",
    price: { amountMinor: 4500, currency: "EUR" },
    pricedPerPerson: true,
    highlights: [],
    eligibility: { status: "eligible", reasons: [] },
    disclosures: [],
    requiredTravelerFields: [],
    validUntil: "2026-09-01T10:00:00.000Z",
    quoteRef: "quote_1",
    ...overrides,
  }
}

function group(offers: AncillaryOfferV1[]): AncillaryOfferGroupV1 {
  return { kind: "insurance", label: "Cover for this trip", offers, diagnostics: [] }
}

function shapeWith(groups: AncillaryOfferGroupV1[]): BookingRequirementsV1 {
  return {
    ...defaultMinimalShape(),
    showsAncillaries: groups.length > 0,
    ancillaries: { groups },
  }
}

function draftWithTravelers(): Draft {
  return setTravelers(emptyDraft(ENTITY), [
    { rowId: "row_1", firstName: "Ana", lastName: "Pop", band: "adult" },
  ])
}

/** Visible copy only — attribute values and class names are not copy. */
function textOf(html: string): string {
  return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ")
}

function renderStep(draft: Draft, groups: AncillaryOfferGroupV1[]): string {
  return renderToStaticMarkup(
    <AncillariesStep draft={draft} setDraft={vi.fn()} shape={shapeWith(groups)} />,
  )
}

describe("AncillariesStep", () => {
  let host: HTMLDivElement
  let root: Root

  beforeEach(() => {
    host = document.createElement("div")
    document.body.appendChild(host)
    root = createRoot(host)
  })

  afterEach(() => {
    act(() => root.unmount())
    host.remove()
  })

  it("renders nothing at all when no ancillary source is connected", async () => {
    await act(async () => {
      root.render(
        <AncillariesStep draft={emptyDraft(ENTITY)} setDraft={vi.fn()} shape={shapeWith([])} />,
      )
    })

    // No heading, no empty state, no unavailability notice — nothing.
    expect(host.textContent).toBe("")
    expect(host.querySelector("*")).toBeNull()
    expect(host.innerHTML).toBe("")
  })

  it("preselects nothing on first render", () => {
    const html = renderStep(emptyDraft(ENTITY), [group([offer()])])

    expect(html).toContain("Trip protection")
    expect(html).not.toContain('aria-checked="true"')
    expect(html).not.toContain('data-checked=""')
    // Both the offer and the decline start unchecked — no default either way.
    expect(html.match(/data-unchecked=""/g)).toHaveLength(2)
  })

  it("offers the decline as a peer radio inside the same group", () => {
    const html = renderStep(emptyDraft(ENTITY), [group([offer()])])

    const radioGroups = html.match(/role="radiogroup"/g) ?? []
    expect(radioGroups).toHaveLength(1)
    const radios = html.match(/<input type="radio"/g) ?? []
    expect(radios).toHaveLength(2)
    expect(html).toContain('value="decline"')
    expect(textOf(html)).toContain("No thanks, continue without this")
  })

  it("shows no comparison affordance for a single connected provider", () => {
    const html = renderStep(emptyDraft(ENTITY), [
      group([
        offer(),
        offer({ offerId: "offer_2", title: "Trip protection plus", planLabel: "Plus" }),
      ]),
    ])

    const text = textOf(html)
    expect(text).not.toContain("Offers from")
    expect(text).not.toMatch(/\b(compare|comparison|best|cheapest|recommended|top pick)\b/i)
  })

  it("shows a comparison affordance when offers come from more than one provider", () => {
    const html = renderStep(emptyDraft(ENTITY), [
      group([
        offer(),
        offer({
          offerId: "offer_2",
          providerId: "provider_2",
          providerLabel: "Southgate Cover",
        }),
      ]),
    ])

    expect(textOf(html)).toContain("Offers from 2 providers")
  })

  it("keeps an ineligible offer in place, unselectable, with its own reason", () => {
    const html = renderStep(emptyDraft(ENTITY), [
      group([
        offer({
          offerId: "offer_blocked",
          providerId: "provider_2",
          providerLabel: "Southgate Cover",
          title: "Southgate standard",
          eligibility: {
            status: "ineligible",
            reasons: [{ code: "max_age", message: "One traveler is over the age limit." }],
          },
        }),
        offer(),
      ]),
    ])

    const text = textOf(html)
    // The refusal belongs to the entry it came from, not to the step.
    expect(text).toContain("Southgate standard")
    expect(text).toContain("One traveler is over the age limit.")
    expect(text).toContain("Not available for this booking")

    // Addressed by the source/provider/offer triple, not the provider-local
    // `offerId` — two insurers can both call their quote the same thing.
    const blocked = radioInput(
      html,
      `bj-anc-offer-${ancillaryOfferKey({ sourceId: "source_1", providerId: "provider_2", offerId: "offer_blocked" })}`,
    )
    const eligible = radioInput(
      html,
      `bj-anc-offer-${ancillaryOfferKey({ sourceId: "source_1", providerId: "provider_1", offerId: "offer_1" })}`,
    )
    expect(blocked).toMatch(/disabled/)
    expect(eligible).not.toMatch(/disabled/)
  })

  it("makes the product information document reachable before anything is bought", () => {
    const html = renderStep(emptyDraft(ENTITY), [
      group([
        offer({
          disclosures: [
            {
              kind: "product_information",
              label: "Product information document",
              versionId: "v3",
              url: "https://provider.test/ipid-v3.pdf",
              required: true,
            },
          ],
        }),
      ]),
    ])

    expect(html).toContain('href="https://provider.test/ipid-v3.pdf"')
    expect(textOf(html)).toContain("Product information document")
  })

  it("collects per-traveler details only after an offer is accepted", () => {
    const withFields = offer({
      requiredTravelerFields: [
        {
          key: "identityNumber",
          label: "Identity document number",
          type: "text",
          required: true,
          sensitive: true,
        },
      ],
    })
    const groups = [group([withFields])]

    const before = renderStep(draftWithTravelers(), groups)
    expect(textOf(before)).not.toContain("Identity document number")

    const accepted = setAncillarySelection(draftWithTravelers(), "insurance", {
      kind: "insurance",
      decision: "accepted",
      offerId: withFields.offerId,
      sourceId: withFields.sourceId,
      providerId: withFields.providerId,
      quoteRef: withFields.quoteRef,
      travelers: [],
      selectedOptionIds: [],
      acceptedDisclosures: [],
    })
    const after = renderStep(accepted, groups)

    expect(textOf(after)).toContain("Identity document number")
    // A third party's one-off question is not something the browser should
    // remember, and a sensitive one least of all.
    expect(after).toMatch(/id="bj-anc-insurance-row_1-identityNumber"[^>]*autocomplete="off"/i)
  })
})

/** The hidden native radio base-ui renders for the item with `id`. */
function radioInput(html: string, id: string): string {
  const match = html.match(new RegExp(`<input type="radio" id="${id}"[^>]*>`))
  expect(match, id).not.toBeNull()
  return match?.[0] ?? ""
}
