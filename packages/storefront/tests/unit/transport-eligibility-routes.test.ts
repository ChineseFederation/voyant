import { Hono } from "hono"
import { describe, expect, it } from "vitest"

import { createStorefrontPublicRoutes } from "../../src/routes-public.js"

describe("storefront transport eligibility routes", () => {
  it("returns blocking issues and warnings through configured rules", async () => {
    const app = new Hono()
      .use("*", async (c, next) => {
        c.set(
          "storefrontChannel" as never,
          {
            storefrontId: "sf_bound",
            channelId: "chan_bound",
            channelStatus: "active",
          } as never,
        )
        await next()
      })
      .route(
        "/",
        createStorefrontPublicRoutes({
          publication: { isProductPublished: async () => true },
          resolveTransportEligibilityRules({ departureId, productId, travelEndsOn }) {
            expect(departureId).toBe("dep_456")
            expect(productId).toBe("prod_123")
            expect(travelEndsOn).toBe("2026-08-08")

            return [
              {
                id: "rule_passport_eg",
                label: "Egypt passport and visa",
                productId: "prod_123",
                destinationCountries: ["EG"],
                nationalityCountries: ["RO"],
                minValidityDaysAfterReturn: 180,
                visaRequired: true,
              },
              {
                id: "rule_minor_ca",
                label: "Canada minor consent advisory",
                productId: "prod_123",
                destinationCountries: ["CA"],
                nationalityCountries: ["US"],
                maxAge: 17,
                minorConsentRequired: true,
                severity: "warning",
              },
            ]
          },
        }),
      )

    const res = await app.request("/products/prod_123/departures/dep_456/eligibility", {
      method: "POST",
      body: JSON.stringify({
        travelStartsOn: "2026-08-01",
        travelEndsOn: "2026-08-08",
        travelers: [
          {
            travelerRef: "traveler_1",
            nationalityCountry: "ro",
            dateOfBirth: "1990-01-01",
            documents: [
              {
                type: "passport",
                issuingCountry: "ro",
                expiresOn: "2026-09-01",
                passportNumber: "AB123456",
              },
            ],
          },
          {
            travelerRef: "traveler_2",
            nationalityCountry: "US",
            dateOfBirth: "2015-01-01",
            documents: [{ type: "passport", issuingCountry: "US", expiresOn: "2030-01-01" }],
          },
        ],
      }),
      headers: { "content-type": "application/json" },
    })

    expect(res.status).toBe(200)
    const payload = await res.json()
    expect(payload.data).toMatchObject({
      departureId: "dep_456",
      productId: "prod_123",
      eligible: false,
    })
    expect(payload.data.blockingIssues.map((issue: { code: string }) => issue.code)).toEqual([
      "document_validity",
      "visa_required",
    ])
    expect(payload.data.warnings.map((issue: { code: string }) => issue.code)).toEqual([
      "minor_consent_required",
    ])
    expect(JSON.stringify(payload)).not.toContain("AB123456")
  })
})
