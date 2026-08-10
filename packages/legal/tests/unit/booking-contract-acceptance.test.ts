import { describe, expect, it } from "vitest"

import { bookingContractAcceptanceMetadata } from "../../src/booking-contract-confirmed.js"
import { bookingContractAcceptanceContentDigest } from "../../src/contract-acceptance.js"

describe("booking contract acceptance evidence", () => {
  it("accepts only evidence bound to the exact template version and rendered body", async () => {
    const contentDigest = await bookingContractAcceptanceContentDigest({
      templateId: "ctpl_customer",
      templateVersionId: "ctpv_7",
      renderedBody: "<p>Accepted terms</p>",
    })
    expect(
      await bookingContractAcceptanceMetadata({
        internalNotes: `__contract_acceptance__:{"acceptedAt":"2026-08-10T12:00:00.000Z","acceptedMarketing":false,"templateId":"ctpl_customer","templateVersionId":"ctpv_7","contentDigest":"${contentDigest}"}`,
        templateId: "ctpl_customer",
        templateVersionId: "ctpv_7",
        templateSlug: "customer-agreement",
        renderedBody: "<p>Accepted terms</p>",
      }),
    ).toEqual({
      acceptedAt: "2026-08-10T12:00:00.000Z",
      acceptedMarketing: false,
      templateId: "ctpl_customer",
      templateVersionId: "ctpv_7",
      templateSlug: "customer-agreement",
      contentDigest,
      renderedHtmlLength: 21,
    })
  })

  it("refuses malformed or stale acceptance markers", async () => {
    expect(
      await bookingContractAcceptanceMetadata({
        internalNotes: '__contract_acceptance__:{"acceptedAt":"not-a-date"}',
        templateId: "ctpl_customer",
        templateVersionId: "ctpv_7",
        templateSlug: "customer-agreement",
        renderedBody: "<p>Accepted terms</p>",
      }),
    ).toBeNull()
    expect(
      await bookingContractAcceptanceMetadata({
        internalNotes: `__contract_acceptance__:{"acceptedAt":"2026-08-10T12:00:00.000Z","acceptedMarketing":false,"templateId":"ctpl_customer","templateVersionId":"ctpv_old","contentDigest":"booking-contract-acceptance:v1:sha256:${"a".repeat(64)}"}`,
        templateId: "ctpl_customer",
        templateVersionId: "ctpv_7",
        templateSlug: "customer-agreement",
        renderedBody: "<p>Accepted terms</p>",
      }),
    ).toBeNull()
  })
})
