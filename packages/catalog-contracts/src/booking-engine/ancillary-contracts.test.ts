import { describe, expect, it } from "vitest"
import {
  type AncillaryOfferV1,
  ancillaryOfferGroupV1,
  ancillarySelectionV1,
  hasMultipleAncillaryProviders,
  isAncillaryOfferSelectable,
  orderAncillaryOffers,
} from "./ancillary-contracts.js"
import { requirementsFingerprintInput } from "./requirements-contracts.js"

function offer(overrides: Partial<AncillaryOfferV1> = {}): AncillaryOfferV1 {
  return {
    offerId: "offer-1",
    sourceId: "src-1",
    providerId: "prov-a",
    providerLabel: "Provider A",
    kind: "insurance",
    title: "Travel cover",
    price: { amountMinor: 4500, currency: "EUR" },
    pricedPerPerson: false,
    highlights: [],
    eligibility: { status: "eligible", reasons: [] },
    disclosures: [],
    requiredTravelerFields: [],
    validUntil: "2026-09-01T00:00:00Z",
    quoteRef: "ref-1",
    ...overrides,
  }
}

describe("ordering", () => {
  it("puts selectable offers before ineligible ones, then the cheapest", () => {
    const ordered = orderAncillaryOffers([
      offer({ offerId: "pricey", price: { amountMinor: 9000, currency: "EUR" } }),
      offer({
        offerId: "cheapest-but-refused",
        price: { amountMinor: 100, currency: "EUR" },
        eligibility: {
          status: "ineligible",
          reasons: [{ code: "destination_not_covered", message: "Not covered." }],
        },
      }),
      offer({ offerId: "cheap", price: { amountMinor: 3000, currency: "EUR" } }),
    ])
    expect(ordered.map((entry) => entry.offerId)).toEqual([
      "cheap",
      "pricey",
      "cheapest-but-refused",
    ])
  })

  it("does not consult the plan label", () => {
    const ordered = orderAncillaryOffers([
      offer({ offerId: "b", providerLabel: "Zenith", planLabel: "Platinum" }),
      offer({ offerId: "a", providerLabel: "Apex", planLabel: "Basic" }),
    ])
    expect(ordered.map((entry) => entry.providerLabel)).toEqual(["Apex", "Zenith"])
  })

  it("is stable for identically priced offers from one provider", () => {
    const ordered = orderAncillaryOffers([offer({ offerId: "b" }), offer({ offerId: "a" })])
    expect(ordered.map((entry) => entry.offerId)).toEqual(["a", "b"])
  })
})

describe("offer shape", () => {
  it("has no field a provider could use to pre-select itself", () => {
    const result = ancillaryOfferGroupV1.safeParse({
      kind: "insurance",
      label: "Travel insurance",
      offers: [{ ...offer(), selected: true }],
    })
    expect(result.success).toBe(false)
  })

  it("carries an empty offer list rather than omitting the group", () => {
    const group = ancillaryOfferGroupV1.parse({ kind: "insurance", label: "Travel insurance" })
    expect(group.offers).toEqual([])
    expect(group.diagnostics).toEqual([])
  })

  it("keeps a degraded source visible as a diagnostic", () => {
    const group = ancillaryOfferGroupV1.parse({
      kind: "insurance",
      label: "Travel insurance",
      offers: [offer()],
      diagnostics: [{ sourceId: "src-2", status: "timeout", message: "5000ms" }],
    })
    expect(group.offers).toHaveLength(1)
    expect(group.diagnostics[0]?.status).toBe("timeout")
  })
})

describe("selectability", () => {
  it("refuses an ineligible offer", () => {
    expect(
      isAncillaryOfferSelectable(
        offer({
          eligibility: {
            status: "ineligible",
            reasons: [{ code: "traveler_age_above_maximum", message: "Too old." }],
          },
        }),
      ),
    ).toBe(false)
  })
})

describe("comparison", () => {
  it("does not treat several offers from one provider as a comparison", () => {
    expect(hasMultipleAncillaryProviders([offer({ offerId: "a" }), offer({ offerId: "b" })])).toBe(
      false,
    )
  })

  it("is a comparison once a second provider is connected", () => {
    expect(
      hasMultipleAncillaryProviders([offer(), offer({ providerId: "prov-b", offerId: "b" })]),
    ).toBe(true)
  })
})

describe("selection", () => {
  it("accepts a decline that names no offer", () => {
    const parsed = ancillarySelectionV1.parse({ kind: "insurance", decision: "declined" })
    expect(parsed.decision).toBe("declined")
    expect(parsed.travelers).toEqual([])
  })

  it("refuses an acceptance that does not say what was accepted", () => {
    const result = ancillarySelectionV1.safeParse({ kind: "insurance", decision: "accepted" })
    expect(result.success).toBe(false)
  })

  it("records the disclosure versions that were accepted", () => {
    const parsed = ancillarySelectionV1.parse({
      kind: "insurance",
      decision: "accepted",
      offerId: "offer-1",
      sourceId: "src-1",
      providerId: "prov-a",
      quoteRef: "ref-1",
      acceptedDisclosures: [
        { kind: "insurer_terms", versionId: "2026-08", acceptedAt: "2026-08-16T09:00:00Z" },
      ],
    })
    expect(parsed.acceptedDisclosures[0]?.versionId).toBe("2026-08")
  })
})

describe("requirements fingerprint", () => {
  const descriptor = {
    showsAncillaries: true,
    showsAddons: false,
    paymentIntents: ["card"],
    ancillaries: {
      groups: [
        { kind: "insurance", label: "Travel insurance", offers: [offer()], diagnostics: [] },
      ],
    },
  }

  it("does not depend on what the live offers currently cost", () => {
    const repriced = {
      ...descriptor,
      ancillaries: {
        groups: [
          {
            kind: "insurance",
            label: "Travel insurance",
            offers: [
              offer({
                price: { amountMinor: 9999, currency: "EUR" },
                validUntil: "2026-12-31T00:00:00Z",
              }),
            ],
            diagnostics: [],
          },
        ],
      },
    }
    expect(requirementsFingerprintInput(repriced)).toEqual(requirementsFingerprintInput(descriptor))
  })

  it("still depends on whether the step exists at all", () => {
    expect(requirementsFingerprintInput({ ...descriptor, showsAncillaries: false })).not.toEqual(
      requirementsFingerprintInput(descriptor),
    )
  })

  it("leaves a descriptor with no ancillaries untouched", () => {
    const plain = { showsAncillaries: false, paymentIntents: ["card"] }
    expect(requirementsFingerprintInput(plain)).toBe(plain)
  })
})
