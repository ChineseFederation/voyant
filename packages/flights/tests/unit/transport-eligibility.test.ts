import { describe, expect, it } from "vitest"

import { evaluateTransportEligibility } from "../../src/service-transport-eligibility.js"
import { transportEligibilityInputSchema } from "../../src/validation-transport-eligibility.js"

describe("storefront transport eligibility", () => {
  it("returns blocking passport validity and visa issues without storing document numbers", () => {
    const input = transportEligibilityInputSchema.parse({
      travelStartsOn: "2026-08-01",
      travelEndsOn: "2026-08-08",
      travelers: [
        {
          travelerRef: "traveler_1",
          nationalityCountry: "ro",
          dateOfBirth: "1990-01-01",
          documents: [{ type: "passport", issuingCountry: "ro", expiresOn: "2026-09-01" }],
        },
      ],
    })

    const result = evaluateTransportEligibility({
      departureId: "slot_123",
      productId: "prod_123",
      travelStartsOn: input.travelStartsOn,
      travelEndsOn: input.travelEndsOn,
      travelers: input.travelers,
      rules: [
        {
          id: "rule_passport",
          label: "Passport and visa",
          productId: "prod_123",
          destinationCountries: ["EG"],
          nationalityCountries: ["RO"],
          requiredDocumentType: "passport",
          minValidityDaysAfterReturn: 180,
          visaRequired: true,
          severity: "blocking",
        },
      ],
    })

    expect(result.eligible).toBe(false)
    expect(result.blockingIssues.map((issue) => issue.code)).toEqual([
      "document_validity",
      "visa_required",
    ])
    expect(JSON.stringify(result)).not.toContain("passportNumber")
  })

  it("returns warnings for advisory rules while keeping the traveler eligible", () => {
    const input = transportEligibilityInputSchema.parse({
      travelStartsOn: "2026-08-01",
      travelEndsOn: "2026-08-08",
      travelers: [
        {
          travelerRef: "traveler_2",
          nationalityCountry: "US",
          dateOfBirth: "2015-01-01",
          documents: [{ type: "passport", issuingCountry: "US", expiresOn: "2030-01-01" }],
          travelingWithGuardian: false,
        },
      ],
    })

    const result = evaluateTransportEligibility({
      departureId: "slot_123",
      productId: "prod_123",
      travelStartsOn: input.travelStartsOn,
      travelEndsOn: input.travelEndsOn,
      travelers: input.travelers,
      rules: [
        {
          id: "rule_minor",
          label: "Minor consent recommended",
          productId: "prod_123",
          destinationCountries: ["CA"],
          nationalityCountries: ["US"],
          requiredDocumentType: "passport",
          maxAge: 17,
          minorConsentRequired: true,
          severity: "warning",
        },
      ],
    })

    expect(result.eligible).toBe(true)
    expect(result.blockingIssues).toEqual([])
    expect(result.warnings.map((issue) => issue.code)).toEqual(["minor_consent_required"])
  })

  it("accepts a valid ID card when an alternative passport is expired", () => {
    const input = transportEligibilityInputSchema.parse({
      travelStartsOn: "2026-08-01",
      travelEndsOn: "2026-08-08",
      travelers: [
        {
          travelerRef: "traveler_3",
          nationalityCountry: "RO",
          documents: [
            { type: "passport", issuingCountry: "RO", expiresOn: "2026-09-01" },
            { type: "id_card", issuingCountry: "RO", expiresOn: "2027-03-01" },
          ],
        },
      ],
    })

    const result = evaluateTransportEligibility({
      departureId: "slot_123",
      productId: "prod_123",
      travelStartsOn: input.travelStartsOn,
      travelEndsOn: input.travelEndsOn,
      travelers: input.travelers,
      rules: [
        {
          id: "rule_passport_or_id",
          label: "Passport or ID card",
          productId: "prod_123",
          destinationCountries: ["BG"],
          requiredDocumentType: "passport_or_id_card",
          minValidityDaysAfterReturn: 180,
        },
      ],
    })

    expect(result.eligible).toBe(true)
    expect(result.blockingIssues).toEqual([])
  })
})
