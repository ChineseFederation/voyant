import { describe, expect, it } from "vitest"
import {
  legalContractDetail,
  redactManagedBookingContractForGenericDetail,
} from "../../src/contract-dto.js"

describe("legal contract DTO redaction", () => {
  it("removes managed booking variables and PII-bearing workflow snapshots from generic rows", () => {
    const row = {
      id: "contract_1",
      variables: {
        customer: { name: "Ana Pop", email: "ana@example.test" },
        commercial: { depositDueCents: 2500 },
      },
      metadata: {
        source: "service",
        bookingContractReviewSnapshot: { customerEmail: "legacy@example.test" },
        bookingContractWorkflow: {
          revision: 2,
          previousRevisionId: "contract_0",
          reviewOnly: true,
          reviewSnapshot: {
            booking: { customerName: "Ana Pop", customerEmail: "ana@example.test" },
          },
          delivery: { recipient: "ana@example.test" },
        },
      },
      renderedBody: "<p>Ana Pop ana@example.test</p>",
      renderedBodyFormat: "html",
      personFirstName: null,
    }

    expect(redactManagedBookingContractForGenericDetail(row)).toEqual({
      id: "contract_1",
      variables: null,
      metadata: {
        source: "service",
        bookingContractWorkflow: {
          revision: 2,
          previousRevisionId: "contract_0",
          reviewOnly: true,
          piiRedacted: true,
        },
      },
      renderedBody: null,
      renderedBodyFormat: "html",
      personFirstName: null,
    })
  })

  it("redacts managed booking detail bodies without changing non-managed contracts", () => {
    const base = {
      id: "contract_1",
      contractNumber: "CTR-1",
      scope: "customer",
      status: "issued",
      title: "Customer agreement",
      bookingId: "booking_1",
      personId: null,
      organizationId: null,
      supplierId: null,
      language: "en",
      issuedAt: null,
      sentAt: null,
      executedAt: null,
      expiresAt: null,
      voidedAt: null,
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-01-01T00:00:00.000Z"),
      templateVersionId: null,
      seriesId: null,
      channelId: null,
      targetKind: "booking",
      targetId: "booking_1",
      targetProvider: null,
      targetSourceRef: null,
      renderedBodyFormat: "html",
      renderedBody: "<p>Ana Pop ana@example.test</p>",
      variables: { customer: { name: "Ana Pop", email: "ana@example.test" } },
      stageHistory: [],
    } as const
    const managed = {
      ...base,
      metadata: {
        bookingContractWorkflow: {
          revision: 1,
          reviewOnly: true,
          reviewSnapshot: { customer: { email: "ana@example.test" } },
          delivery: { recipient: "ana@example.test" },
        },
      },
    }

    expect(legalContractDetail(managed).renderedBody).toBeNull()
    expect(legalContractDetail(managed).variables).toBeNull()
    expect(legalContractDetail(managed).metadata).toEqual({
      bookingContractWorkflow: {
        revision: 1,
        previousRevisionId: null,
        reviewOnly: true,
        piiRedacted: true,
      },
    })
    expect(legalContractDetail({ ...base, metadata: { source: "ui" } }).renderedBody).toBe(
      "<p>Ana Pop ana@example.test</p>",
    )
  })
})
