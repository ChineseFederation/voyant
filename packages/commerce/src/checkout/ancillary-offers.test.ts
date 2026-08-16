import type {
  AncillaryOfferGroupV1,
  AncillaryOfferV1,
} from "@voyant-travel/catalog-contracts/booking-engine/ancillary-contracts"
import { describe, expect, it, vi } from "vitest"
import { quoteAncillaryOffers } from "./ancillary-offers.js"
import type { AncillaryOfferSource, AncillaryQuoteInput } from "./ancillary-ports.js"

function quoteInput(overrides: Partial<AncillaryQuoteInput> = {}): AncillaryQuoteInput {
  return {
    bookingSessionId: "bses_1",
    tripStartDate: "2026-09-01",
    tripEndDate: "2026-09-10",
    destinationCountries: ["ES"],
    originCountry: "RO",
    travelers: [
      { ref: "trv_1", age: 41 },
      { ref: "trv_2", age: 9, band: "child" },
    ],
    tripCostMinor: 240000,
    currency: "EUR",
    locale: "en",
    ...overrides,
  }
}

function offer(overrides: Partial<AncillaryOfferV1> = {}): AncillaryOfferV1 {
  return {
    offerId: "off_1",
    sourceId: "src_a",
    providerId: "prov_a",
    providerLabel: "Provider A",
    kind: "insurance",
    title: "Cover",
    price: { amountMinor: 5000, currency: "EUR" },
    pricedPerPerson: false,
    highlights: [],
    eligibility: { status: "eligible", reasons: [] },
    disclosures: [],
    requiredTravelerFields: [],
    validUntil: "2026-08-20T00:00:00.000Z",
    quoteRef: "qr_1",
    ...overrides,
  }
}

function group(overrides: Partial<AncillaryOfferGroupV1> = {}): AncillaryOfferGroupV1 {
  return { kind: "insurance", label: "Travel insurance", offers: [], diagnostics: [], ...overrides }
}

function source(
  overrides: Partial<AncillaryOfferSource> & Pick<AncillaryOfferSource, "quote">,
): AncillaryOfferSource {
  return {
    sourceId: "src_a",
    kind: "insurance",
    label: "Travel insurance",
    prepare: vi.fn(),
    fulfill: vi.fn(),
    cancel: vi.fn(),
    ...overrides,
  }
}

describe("quoteAncillaryOffers", () => {
  it("returns an empty list when no source is bound", async () => {
    await expect(quoteAncillaryOffers([], quoteInput())).resolves.toEqual([])
  })

  it("returns a list from a single source, with no comparison implied", async () => {
    const groups = await quoteAncillaryOffers(
      [source({ quote: async () => group({ offers: [offer()] }) })],
      quoteInput(),
    )

    expect(groups).toHaveLength(1)
    expect(groups[0]?.kind).toBe("insurance")
    expect(groups[0]?.offers).toHaveLength(1)
    expect(groups[0]?.diagnostics).toEqual([])
  })

  it("degrades a timing-out source to a diagnostic instead of failing the step", async () => {
    const healthy = source({
      sourceId: "src_a",
      quote: async () => group({ offers: [offer({ offerId: "off_a", sourceId: "src_a" })] }),
    })
    const slow = source({
      sourceId: "src_slow",
      quote: () => new Promise<AncillaryOfferGroupV1>(() => {}),
    })

    const groups = await quoteAncillaryOffers([healthy, slow], quoteInput(), {
      perSourceTimeoutMs: 10,
    })

    expect(groups).toHaveLength(1)
    expect(groups[0]?.offers.map((o) => o.offerId)).toEqual(["off_a"])
    expect(groups[0]?.diagnostics).toEqual([
      expect.objectContaining({ sourceId: "src_slow", status: "timeout" }),
    ])
  })

  it("degrades a throwing source to an error diagnostic", async () => {
    const groups = await quoteAncillaryOffers(
      [
        source({ sourceId: "src_a", quote: async () => group({ offers: [offer()] }) }),
        source({
          sourceId: "src_bad",
          quote: async () => {
            throw new Error("upstream 503")
          },
        }),
      ],
      quoteInput(),
    )

    expect(groups[0]?.offers).toHaveLength(1)
    expect(groups[0]?.diagnostics).toEqual([
      expect.objectContaining({ sourceId: "src_bad", status: "error", message: "upstream 503" }),
    ])
  })

  it("orders eligible offers first, then cheapest", async () => {
    const groups = await quoteAncillaryOffers(
      [
        source({
          sourceId: "src_a",
          quote: async () =>
            group({
              offers: [
                offer({
                  offerId: "cheap_ineligible",
                  price: { amountMinor: 100, currency: "EUR" },
                  eligibility: { status: "ineligible", reasons: [{ code: "age", message: "Age" }] },
                }),
                offer({ offerId: "dear", price: { amountMinor: 9000, currency: "EUR" } }),
                offer({ offerId: "cheap", price: { amountMinor: 3000, currency: "EUR" } }),
              ],
            }),
        }),
      ],
      quoteInput(),
    )

    expect(groups[0]?.offers.map((o) => o.offerId)).toEqual(["cheap", "dear", "cheap_ineligible"])
  })

  it("merges every bound source of the same kind into one group", async () => {
    const groups = await quoteAncillaryOffers(
      [
        source({
          sourceId: "src_a",
          quote: async () =>
            group({
              offers: [
                offer({
                  offerId: "a",
                  sourceId: "src_a",
                  providerId: "prov_a",
                  price: { amountMinor: 7000, currency: "EUR" },
                }),
              ],
            }),
        }),
        source({
          sourceId: "src_b",
          quote: async () =>
            group({
              offers: [
                offer({
                  offerId: "b",
                  sourceId: "src_b",
                  providerId: "prov_b",
                  price: { amountMinor: 2000, currency: "EUR" },
                }),
              ],
            }),
        }),
      ],
      quoteInput(),
    )

    expect(groups).toHaveLength(1)
    expect(groups[0]?.offers.map((o) => o.offerId)).toEqual(["b", "a"])
  })

  it("keeps kinds in separate groups", async () => {
    const groups = await quoteAncillaryOffers(
      [
        source({ sourceId: "src_a", quote: async () => group({ offers: [offer()] }) }),
        source({
          sourceId: "src_c",
          kind: "carbon_offset",
          label: "Carbon offset",
          quote: async () =>
            group({
              kind: "carbon_offset",
              label: "Carbon offset",
              offers: [offer({ offerId: "co_1", kind: "carbon_offset" })],
            }),
        }),
      ],
      quoteInput(),
    )

    expect(groups.map((g) => g.kind).sort()).toEqual(["carbon_offset", "insurance"])
  })
})

/**
 * Quoting happens before the traveller has decided anything, so there is no
 * basis for sending identified data — and a shape that cannot carry it is a
 * stronger guarantee than a rule someone has to remember. These assertions are
 * on the type and on the object that actually crosses the seam, not on one
 * happy path through it.
 */
describe("AncillaryQuoteInput carries no identified traveller data", () => {
  const FORBIDDEN = [
    "name",
    "email",
    "phone",
    "passport",
    "document",
    "birth",
    "nationality",
    "address",
  ]

  function collectKeys(value: unknown, into: string[] = []): string[] {
    if (Array.isArray(value)) {
      for (const entry of value) collectKeys(entry, into)
      return into
    }
    if (value && typeof value === "object") {
      for (const [key, child] of Object.entries(value)) {
        into.push(key)
        collectKeys(child, into)
      }
    }
    return into
  }

  it("rejects identified fields at the type level", () => {
    // @ts-expect-error — a traveller's name has no place in a quote request.
    const withName: AncillaryQuoteInput = { ...quoteInput(), travelerNames: ["Ana Popescu"] }
    // @ts-expect-error — nor does an identity document.
    const withDocument: AncillaryQuoteInput = { ...quoteInput(), passportNumber: "X1234567" }
    // @ts-expect-error — nor contact details.
    const withContact: AncillaryQuoteInput = { ...quoteInput(), email: "ana@example.com" }
    const withTravelerName: AncillaryQuoteInput = {
      ...quoteInput(),
      // @ts-expect-error — not even per traveller.
      travelers: [{ ref: "trv_1", age: 41, firstName: "Ana" }],
    }
    expect([withName, withDocument, withContact, withTravelerName]).toHaveLength(4)
  })

  it("passes nothing identifying to a bound source", async () => {
    let seen: AncillaryQuoteInput | undefined
    await quoteAncillaryOffers(
      [
        source({
          quote: async (input) => {
            seen = input
            return group()
          },
        }),
      ],
      quoteInput(),
    )

    expect(seen).toBeDefined()
    const keys = collectKeys(seen)
    expect(keys.length).toBeGreaterThan(0)
    for (const key of keys) {
      for (const forbidden of FORBIDDEN) {
        expect(key.toLowerCase()).not.toContain(forbidden)
      }
    }
  })
})
