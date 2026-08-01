import { describe, expect, it } from "vitest"

import {
  contractNumberSeriesListQuerySchema,
  contractTemplateListQuerySchema,
  insertContractNumberSeriesSchema,
  insertContractSchema,
  updateContractNumberSeriesSchema,
  updateContractSchema,
} from "../../src/contracts/validation.js"
import { insertPolicyAcceptanceSchema } from "../../src/policies/validation.js"
import { insertLegalTermSchema } from "../../src/terms/validation.js"

describe("legal contract validation", () => {
  it("parses boolean query parameters without treating false as truthy", () => {
    expect(contractNumberSeriesListQuerySchema.parse({ active: "true" })).toEqual({
      active: true,
    })
    expect(contractNumberSeriesListQuerySchema.parse({ active: "false" })).toEqual({
      active: false,
    })
    expect(contractTemplateListQuerySchema.parse({ active: "false" })).toMatchObject({
      active: false,
    })
  })

  it("accepts a manual contract number on contract create input", () => {
    expect(
      insertContractSchema.parse({
        scope: "customer",
        title: "Imported contract",
        contractNumber: " A-169 ",
      }),
    ).toMatchObject({
      contractNumber: "A-169",
    })
  })

  it("accepts default and external allocation metadata on contract number series", () => {
    expect(
      insertContractNumberSeriesSchema.parse({
        name: "Customer contracts",
        prefix: "A",
        isDefault: true,
        externalProvider: "provider",
        externalConfigKey: "customer-contracts",
      }),
    ).toMatchObject({
      scope: "customer",
      isDefault: true,
      externalProvider: "provider",
      externalConfigKey: "customer-contracts",
      active: true,
    })
  })

  it("does not default contract number series fields on update input", () => {
    expect(updateContractNumberSeriesSchema.parse({ separator: "-" })).toEqual({ separator: "-" })
  })

  it("treats empty optional contract fields as omitted on create input", () => {
    expect(
      insertContractSchema.parse({
        scope: "customer",
        title: "Imported contract",
        contractNumber: "M 162",
        bookingId: "book_123",
        personId: "",
        organizationId: "",
        supplierId: "",
        seriesId: "",
        legacyTransactionOrderId: "",
        expiresAt: "",
        language: "ro",
      }),
    ).toMatchObject({
      bookingId: "book_123",
      personId: undefined,
      organizationId: undefined,
      supplierId: undefined,
      seriesId: undefined,
      legacyTransactionOrderId: undefined,
      expiresAt: undefined,
    })
  })

  it("treats empty optional contract fields as omitted on update input", () => {
    expect(
      updateContractSchema.parse({
        templateVersionId: "",
        personId: "",
        organizationId: "",
        supplierId: "",
        channelId: "",
        bookingId: "",
        legacyTransactionOrderId: "",
        expiresAt: "",
      }),
    ).toEqual({
      templateVersionId: undefined,
      personId: undefined,
      organizationId: undefined,
      supplierId: undefined,
      channelId: undefined,
      bookingId: undefined,
      legacyTransactionOrderId: undefined,
      expiresAt: undefined,
    })
  })

  it("accepts explicit contract target refs and legacy transaction compatibility refs", () => {
    expect(
      insertContractSchema.parse({
        scope: "customer",
        title: "Proposal version contract",
        targetKind: "proposal_version",
        targetId: "prvr_123",
        legacyTransactionOrderId: "ord_legacy",
      }),
    ).toMatchObject({
      targetKind: "proposal_version",
      targetId: "prvr_123",
      legacyTransactionOrderId: "ord_legacy",
    })
  })

  it("accepts policy acceptances against provider/source targets", () => {
    expect(
      insertPolicyAcceptanceSchema.parse({
        policyVersionId: "plvr_123",
        targetKind: "provider_source_ref",
        targetProvider: "connect",
        targetSourceRef: "supplier-order-42",
        method: "explicit_checkbox",
      }),
    ).toMatchObject({
      policyVersionId: "plvr_123",
      targetKind: "provider_source_ref",
      targetProvider: "connect",
      targetSourceRef: "supplier-order-42",
      method: "explicit_checkbox",
    })
  })

  it("requires Legal terms to target an explicit domain record or legacy compatibility ref", () => {
    expect(
      insertLegalTermSchema.parse({
        targetKind: "proposal_version",
        targetId: "prvr_123",
        termType: "terms_and_conditions",
        title: "Proposal terms",
        body: "Accepted proposal version terms.",
      }),
    ).toMatchObject({
      targetKind: "proposal_version",
      targetId: "prvr_123",
      acceptanceStatus: "pending",
      required: true,
    })

    expect(
      insertLegalTermSchema.parse({
        legacyTransactionOrderId: "ord_legacy",
        title: "Migrated order terms",
        body: "Legacy migrated term body.",
      }),
    ).toMatchObject({
      legacyTransactionOrderId: "ord_legacy",
    })

    expect(() =>
      insertLegalTermSchema.parse({
        title: "Missing target",
        body: "No target.",
      }),
    ).toThrow()
  })
})
