import type { AncillaryQuoteInput } from "@voyant-travel/commerce/checkout/ancillary-ports"
import type {
  InsuranceProviderAdapter,
  InsuranceQuote,
  InsuranceQuoteRequest,
} from "@voyant-travel/insurance-contracts"
import { describe, expect, it, vi } from "vitest"

import {
  buildInsuranceQuoteRequest,
  createInsuranceAncillaryOfferSource,
  decodeInsuranceQuoteRef,
} from "../../src/ancillary-source.js"

const QUOTE_INPUT: AncillaryQuoteInput = {
  bookingSessionId: "bses_1",
  tripStartDate: "2026-09-01",
  tripEndDate: "2026-09-14",
  destinationCountries: ["IT", "FR"],
  originCountry: "RO",
  travelers: [
    { ref: "t1", age: 41 },
    { ref: "t2", age: 8 },
  ],
  tripCostMinor: 250_000,
  currency: "EUR",
  locale: "en",
}

function quote(
  overrides: Partial<InsuranceQuote> & Pick<InsuranceQuote, "providerId">,
): InsuranceQuote {
  return {
    quoteId: `${overrides.providerId}-q1`,
    providerLabel: overrides.providerId.toUpperCase(),
    planId: "plan-1",
    planName: "Standard",
    premium: { amountMinor: 4200, currency: "EUR" },
    includedCovers: [
      {
        category: "medical_expenses",
        label: "Medical expenses",
        included: true,
        sumInsured: { amountMinor: 5_000_000, currency: "EUR" },
      },
    ],
    optionalCovers: [],
    eligibility: { status: "eligible", reasons: [] },
    disclosures: [],
    validUntil: "2026-08-20T10:00:00.000Z",
    ...overrides,
  }
}

function provider(
  providerId: string,
  impl: (request: InsuranceQuoteRequest) => Promise<InsuranceQuote[]>,
): InsuranceProviderAdapter {
  return {
    providerId,
    displayName: providerId,
    quote: (request) => impl(request),
    apply: async () => ({}) as never,
    issue: async () => ({}) as never,
    document: async () => ({}) as never,
    cancel: async () => ({}) as never,
  }
}

function sourceWith(providers: readonly InsuranceProviderAdapter[], perProviderTimeoutMs = 25) {
  return createInsuranceAncillaryOfferSource({
    resolveProviders: async () => providers,
    resolveDb: () => {
      throw new Error("quoting must not touch the database")
    },
    resolvePii: () => {
      throw new Error("quoting must not touch the PII service")
    },
    perProviderTimeoutMs,
  })
}

describe("insurance ancillary fan-out", () => {
  it("degrades to a diagnostic when one insurer does not answer in time", async () => {
    const slow = provider(
      "slow",
      () =>
        new Promise((resolve) => setTimeout(() => resolve([quote({ providerId: "slow" })]), 500)),
    )
    const fast = provider("fast", async () => [quote({ providerId: "fast" })])

    const group = await sourceWith([slow, fast]).quote(QUOTE_INPUT)

    // The step still has something to show: one slow insurer is not an error page.
    expect(group.offers.map((offer) => offer.providerId)).toEqual(["fast"])
    expect(group.diagnostics.find((entry) => entry.providerId === "slow")).toMatchObject({
      status: "timeout",
      sourceId: "insurance",
    })
    expect(group.diagnostics.find((entry) => entry.providerId === "fast")).toMatchObject({
      status: "ok",
    })
  })

  it("degrades to a diagnostic when one insurer throws", async () => {
    const broken = provider("broken", async () => {
      throw new Error("upstream 503")
    })
    const working = provider("working", async () => [quote({ providerId: "working" })])

    const group = await sourceWith([broken, working]).quote(QUOTE_INPUT)

    expect(group.offers).toHaveLength(1)
    expect(group.diagnostics.find((entry) => entry.providerId === "broken")).toMatchObject({
      status: "error",
      message: "upstream 503",
    })
  })

  it("aborts the signal it handed a provider when the deadline passes", async () => {
    let observed: AbortSignal | undefined
    const slow = provider("slow", () => new Promise(() => {}))
    const wrapped: InsuranceProviderAdapter = {
      ...slow,
      quote: (request, context) => {
        observed = context.signal
        return slow.quote(request, context)
      },
    }

    await sourceWith([wrapped]).quote(QUOTE_INPUT)

    expect(observed?.aborted).toBe(true)
  })

  it("returns a list for a single connected insurer", async () => {
    const only = provider("only", async () => [quote({ providerId: "only" })])

    const group = await sourceWith([only]).quote(QUOTE_INPUT)

    // One insurer is a list of length one — never a special-cased scalar. The
    // count is presentation's business and nothing else's.
    expect(Array.isArray(group.offers)).toBe(true)
    expect(group.offers).toHaveLength(1)
    expect(group.diagnostics).toHaveLength(1)
  })

  it("returns an empty group when no insurer is connected", async () => {
    const group = await sourceWith([]).quote(QUOTE_INPUT)

    expect(group).toEqual({
      kind: "insurance",
      label: "Travel insurance",
      offers: [],
      diagnostics: [],
    })
  })

  it("orders eligible offers first, then by price", async () => {
    const providers = [
      provider("c", async () => [
        quote({
          providerId: "c",
          quoteId: "c1",
          premium: { amountMinor: 1000, currency: "EUR" },
          eligibility: {
            status: "ineligible",
            reasons: [
              {
                code: "traveler_age_above_maximum",
                message: "Too old",
                subject: { kind: "traveler", ref: "t1" },
              },
            ],
          },
        }),
      ]),
      provider("b", async () => [
        quote({ providerId: "b", quoteId: "b1", premium: { amountMinor: 9000, currency: "EUR" } }),
      ]),
      provider("a", async () => [
        quote({ providerId: "a", quoteId: "a1", premium: { amountMinor: 5000, currency: "EUR" } }),
      ]),
    ]

    const group = await sourceWith(providers).quote(QUOTE_INPUT)

    expect(group.offers.map((offer) => offer.offerId)).toEqual(["a1", "b1", "c1"])
  })

  it("maps a quote onto a neutral offer with an opaque, resolvable ref", async () => {
    const only = provider("acme", async () => [
      quote({ providerId: "acme", quoteId: "q-77", planTier: "Silver" }),
    ])

    const [offer] = (await sourceWith([only]).quote(QUOTE_INPUT)).offers

    expect(offer).toMatchObject({
      sourceId: "insurance",
      kind: "insurance",
      providerId: "acme",
      // The insurer's tier wording travels as a display label only.
      planLabel: "Silver",
    })
    // Nothing arrives pre-ticked: the shape has nowhere to say so.
    expect(offer).not.toHaveProperty("selected")
    expect(offer).not.toHaveProperty("recommended")
    expect(decodeInsuranceQuoteRef(offer?.quoteRef ?? "")).toEqual({
      providerId: "acme",
      quoteId: "q-77",
    })
  })

  it("asks every traveller field only after an offer is accepted, and marks it sensitive", async () => {
    const only = provider("acme", async () => [quote({ providerId: "acme" })])
    const [offer] = (await sourceWith([only]).quote(QUOTE_INPUT)).offers

    expect(offer?.requiredTravelerFields.length).toBeGreaterThan(0)
    for (const field of offer?.requiredTravelerFields ?? []) {
      expect(field.sensitive).toBe(true)
    }
  })
})

describe("the insurance quote request carries no personal data", () => {
  const ALLOWED_TOP_LEVEL = new Set([
    "tripStartDate",
    "tripEndDate",
    "destinationScope",
    "travelPurpose",
    "travelers",
    "tripCost",
    "requestedCovers",
    "currency",
    "locale",
  ])
  const ALLOWED_TRAVELER = new Set(["ref", "age", "residencyCountry"])

  it("builds a request whose only fields are ages, dates, countries and money", () => {
    const request = buildInsuranceQuoteRequest(QUOTE_INPUT)

    for (const key of Object.keys(request)) {
      expect(ALLOWED_TOP_LEVEL.has(key), `unexpected quote field "${key}"`).toBe(true)
    }
    for (const traveler of request.travelers) {
      for (const key of Object.keys(traveler)) {
        expect(ALLOWED_TRAVELER.has(key), `unexpected traveller field "${key}"`).toBe(true)
      }
    }
    expect(request.travelers.map((traveler) => traveler.age)).toEqual([41, 8])
  })

  it("sends the provider nothing a person could be identified from", async () => {
    const seen = vi.fn<(request: InsuranceQuoteRequest) => Promise<InsuranceQuote[]>>(
      async () => [],
    )
    await sourceWith([provider("acme", seen)]).quote(QUOTE_INPUT)

    const serialized = JSON.stringify(seen.mock.calls[0]?.[0])
    // A name, an email, a phone number and a document number have no field to
    // travel in — but assert on the serialized payload too, because the point
    // is what reaches the insurer, not what the type says.
    for (const forbidden of ["name", "email", "phone", "document", "passport", "dateOfBirth"]) {
      expect(serialized.toLowerCase()).not.toContain(forbidden.toLowerCase())
    }
  })
})
