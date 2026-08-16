import { describe, expect, it } from "vitest"
import {
  assertInsuranceProviderAdapter,
  headlineSumInsured,
  type InsuranceProviderAdapter,
  type InsuranceQuote,
  insuranceApplicationInputSchema,
  insuranceMoneySchema,
  insurancePolicySchema,
  insuranceQuoteRequestSchema,
  insuranceQuoteSchema,
  isInsuranceApplicationIssuableAt,
  isInsuranceQuoteValidAt,
  orderInsuranceQuotes,
  outstandingDisclosures,
} from "./index.js"

const CONTRACTING_PARTY = {
  givenName: "Ada",
  familyName: "Lovelace",
  email: "ada@example.com",
}

const INSURED_PERSON = {
  ref: "ip-1",
  givenName: "Ada",
  familyName: "Lovelace",
  dateOfBirth: "1990-01-01",
  identityDocuments: [],
}

function quote(overrides: Partial<InsuranceQuote> = {}): InsuranceQuote {
  return insuranceQuoteSchema.parse({
    quoteId: "q-1",
    providerId: "prov-a",
    providerLabel: "Provider A",
    planId: "plan-1",
    planName: "Travel Cover",
    premium: { amountMinor: 4500, currency: "EUR" },
    eligibility: { status: "eligible", reasons: [] },
    validUntil: "2026-09-01T00:00:00Z",
    ...overrides,
  })
}

describe("money", () => {
  it("requires an ISO 4217 currency alongside every amount", () => {
    expect(insuranceMoneySchema.safeParse({ amountMinor: 100, currency: "eur" }).success).toBe(
      false,
    )
    expect(insuranceMoneySchema.safeParse({ amountMinor: 100, currency: "EUR" }).success).toBe(true)
  })

  it("rejects a fractional minor unit", () => {
    expect(insuranceMoneySchema.safeParse({ amountMinor: 10.5, currency: "EUR" }).success).toBe(
      false,
    )
  })
})

describe("quote request", () => {
  const request = {
    tripStartDate: "2026-09-10",
    tripEndDate: "2026-09-20",
    destinationScope: { kind: "worldwide" },
    travelPurpose: "leisure",
    travelers: [{ ref: "t1", age: 34 }],
    currency: "EUR",
  }

  it("accepts ages without any personal data", () => {
    expect(insuranceQuoteRequestSchema.safeParse(request).success).toBe(true)
  })

  it("refuses personal data smuggled onto a traveller", () => {
    const result = insuranceQuoteRequestSchema.safeParse({
      ...request,
      travelers: [{ ref: "t1", age: 34, familyName: "Lovelace" }],
    })
    expect(result.success).toBe(false)
  })

  it("refuses a trip that ends before it starts", () => {
    const result = insuranceQuoteRequestSchema.safeParse({
      ...request,
      tripEndDate: "2026-09-01",
    })
    expect(result.success).toBe(false)
  })

  it("refuses duplicate traveller refs", () => {
    const result = insuranceQuoteRequestSchema.safeParse({
      ...request,
      travelers: [
        { ref: "t1", age: 34 },
        { ref: "t1", age: 8 },
      ],
    })
    expect(result.success).toBe(false)
  })
})

describe("eligibility", () => {
  it("requires a reason whenever the insurer is not selling", () => {
    const result = insuranceQuoteSchema.safeParse({
      quoteId: "q-1",
      providerId: "prov-a",
      providerLabel: "Provider A",
      planId: "plan-1",
      planName: "Travel Cover",
      premium: { amountMinor: 4500, currency: "EUR" },
      eligibility: { status: "ineligible", reasons: [] },
      validUntil: "2026-09-01T00:00:00Z",
    })
    expect(result.success).toBe(false)
  })

  it("carries a refusal as data rather than an error", () => {
    const refused = quote({
      eligibility: {
        status: "ineligible",
        reasons: [
          {
            code: "traveler_age_above_maximum",
            message: "This plan covers travellers up to 74.",
            subject: { kind: "traveler", ref: "t2" },
          },
        ],
      },
    })
    expect(refused.eligibility.reasons[0]?.code).toBe("traveler_age_above_maximum")
  })
})

describe("ordering", () => {
  it("puts purchasable quotes first, then the cheapest premium", () => {
    const ordered = orderInsuranceQuotes([
      quote({ quoteId: "expensive", premium: { amountMinor: 9000, currency: "EUR" } }),
      quote({
        quoteId: "refused",
        premium: { amountMinor: 100, currency: "EUR" },
        eligibility: {
          status: "ineligible",
          reasons: [
            {
              code: "destination_not_covered",
              message: "Not covered.",
              subject: { kind: "trip" },
            },
          ],
        },
      }),
      quote({ quoteId: "cheap", premium: { amountMinor: 3000, currency: "EUR" } }),
    ])
    expect(ordered.map((entry) => entry.quoteId)).toEqual(["cheap", "expensive", "refused"])
  })

  it("breaks ties without consulting the plan tier", () => {
    const ordered = orderInsuranceQuotes([
      quote({ quoteId: "b", providerLabel: "Zurich Cover", planTier: "Platinum" }),
      quote({ quoteId: "a", providerLabel: "Alpine Cover", planTier: "Basic" }),
    ])
    expect(ordered.map((entry) => entry.providerLabel)).toEqual(["Alpine Cover", "Zurich Cover"])
  })
})

describe("quote validity", () => {
  it("expires at the instant the insurer stated", () => {
    const offered = quote({ validUntil: "2026-09-01T00:00:00Z" })
    expect(isInsuranceQuoteValidAt(offered, new Date("2026-08-31T23:59:59Z"))).toBe(true)
    expect(isInsuranceQuoteValidAt(offered, new Date("2026-09-01T00:00:01Z"))).toBe(false)
  })
})

describe("covers", () => {
  it("reads the medical limit as the comparable headline", () => {
    const headline = headlineSumInsured([
      {
        category: "baggage",
        label: "Baggage",
        included: true,
        sumInsured: { amountMinor: 200_000, currency: "EUR" },
      },
      {
        category: "medical_expenses",
        label: "Medical",
        included: true,
        sumInsured: { amountMinor: 100_000, currency: "EUR" },
      },
    ])
    expect(headline).toEqual({ amountMinor: 100_000, currency: "EUR" })
  })

  it("ignores covers the plan names but does not provide", () => {
    expect(
      headlineSumInsured([
        {
          category: "medical_expenses",
          label: "Medical",
          included: false,
          sumInsured: { amountMinor: 100_000, currency: "EUR" },
        },
      ]),
    ).toBeNull()
  })
})

describe("application", () => {
  const input = {
    quoteId: "q-1",
    providerId: "prov-a",
    insuredPersons: [INSURED_PERSON],
    contractingParty: CONTRACTING_PARTY,
  }

  it("models a national identity number as a typed document with an issuing country", () => {
    const parsed = insuranceApplicationInputSchema.parse({
      ...input,
      insuredPersons: [
        {
          ...INSURED_PERSON,
          identityDocuments: [
            { type: "national_identity", number: "1234567890123", issuingCountry: "RO" },
          ],
        },
      ],
    })
    expect(parsed.insuredPersons[0]?.identityDocuments[0]?.issuingCountry).toBe("RO")
  })

  it("has no market-specific identity field to put a number in", () => {
    const result = insuranceApplicationInputSchema.safeParse({
      ...input,
      insuredPersons: [{ ...INSURED_PERSON, nationalIdentityNumber: "1234567890123" }],
    })
    expect(result.success).toBe(false)
  })

  it("stops being issuable once the insurer's window closes", () => {
    const application = {
      applicationId: "app-1",
      providerId: "prov-a",
      quoteId: "q-1",
      status: "accepted" as const,
      expiresAt: "2026-09-01T00:00:00Z",
      premium: { amountMinor: 4500, currency: "EUR" },
      insuredPersons: [INSURED_PERSON],
      contractingParty: CONTRACTING_PARTY,
      outstandingQuestions: [],
      answers: [],
      eligibility: { status: "eligible" as const, reasons: [] },
      createdAt: "2026-08-01T00:00:00Z",
    }
    expect(isInsuranceApplicationIssuableAt(application, new Date("2026-08-15T00:00:00Z"))).toBe(
      true,
    )
    expect(isInsuranceApplicationIssuableAt(application, new Date("2026-09-02T00:00:00Z"))).toBe(
      false,
    )
  })
})

describe("policy", () => {
  const base = {
    policyId: "pol-1",
    providerId: "prov-a",
    applicationId: "app-1",
    effectiveFrom: "2026-09-10",
    effectiveTo: "2026-09-20",
    premium: { amountMinor: 4500, currency: "EUR" },
    insuredPersons: [INSURED_PERSON],
    contractingParty: CONTRACTING_PARTY,
  }

  it("refuses an issued policy with no policy number", () => {
    expect(insurancePolicySchema.safeParse({ ...base, issueState: "issued" }).success).toBe(false)
    expect(
      insurancePolicySchema.safeParse({ ...base, issueState: "issued", policyNumber: "P-1" })
        .success,
    ).toBe(true)
  })

  it("refuses a failed issue that does not say why", () => {
    expect(insurancePolicySchema.safeParse({ ...base, issueState: "issue_failed" }).success).toBe(
      false,
    )
  })
})

describe("disclosures", () => {
  const disclosure = {
    kind: "insurer_terms" as const,
    label: "Insurance terms",
    versionId: "2026-08",
    required: true,
    document: {
      documentId: "doc-1",
      kind: "insurer_terms" as const,
      filename: "terms.pdf",
      mimeType: "application/pdf",
      source: { kind: "inline" as const, contentBase64: "eA==" },
    },
  }

  it("treats last month's acceptance as not an acceptance of this month's wording", () => {
    expect(
      outstandingDisclosures([disclosure], [{ kind: "insurer_terms", versionId: "2026-07" }]),
    ).toHaveLength(1)
    expect(
      outstandingDisclosures([disclosure], [{ kind: "insurer_terms", versionId: "2026-08" }]),
    ).toHaveLength(0)
  })
})

describe("provider adapter check", () => {
  const adapter = {
    providerId: "prov-a",
    displayName: "Provider A",
    quote: async () => [],
    apply: async () => ({}) as never,
    issue: async () => ({}) as never,
    document: async () => ({}) as never,
    cancel: async () => ({}) as never,
  } satisfies InsuranceProviderAdapter

  it("accepts an adapter implementing the five methods", () => {
    expect(() => assertInsuranceProviderAdapter(adapter)).not.toThrow()
  })

  it("names the method that is missing", () => {
    const { cancel: _cancel, ...partial } = adapter
    expect(() => assertInsuranceProviderAdapter(partial)).toThrow(/cancel/)
  })
})
