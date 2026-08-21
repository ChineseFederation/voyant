import { type InquiryRecord, inquiryRecordSchema } from "@voyant-travel/relationships-contracts"
import { describe, expect, it } from "vitest"
import { buildCloseInput, buildTransitionInput, inquiryPageState } from "./inquiry-ui-model.js"
import { buildInquiriesQueryString } from "./query-options.js"

function record(overrides: Partial<InquiryRecord> = {}): InquiryRecord {
  return inquiryRecordSchema.parse({
    id: "inq_01",
    subject: "Test",
    kind: "general",
    status: "new",
    closeOutcome: null,
    closeNote: null,
    duplicateOfInquiryId: null,
    priority: "normal",
    personId: null,
    organizationId: null,
    contactSnapshot: { email: "a@example.test" },
    ownerId: null,
    teamId: null,
    unassignedReason: null,
    nextActionAt: null,
    firstResponseDueAt: null,
    firstRespondedAt: null,
    travelBrief: null,
    customerMessage: null,
    internalSummary: null,
    source: "admin",
    sourceRef: null,
    sourceUrl: null,
    locale: "en",
    consentSnapshot: null,
    tags: [],
    targets: [],
    customFields: {},
    createdAt: "2026-08-18T10:00:00.000Z",
    updatedAt: "2026-08-18T10:00:00.000Z",
    lastActivityAt: null,
    qualifiedAt: null,
    convertedAt: null,
    closedAt: null,
    ...overrides,
  })
}

describe("inquiry UI command model", () => {
  it("enforces the lifecycle and command preconditions before emitting payloads", () => {
    const fresh = record()
    expect(buildTransitionInput(fresh, "in_progress", { noFollowUpExpected: true })).toBeNull()
    expect(buildTransitionInput(fresh, "triaged")).toBeNull()
    expect(
      buildTransitionInput(fresh, "triaged", { unassignedReason: "Queue owner unavailable" }),
    ).toEqual({ status: "triaged", unassignedReason: "Queue owner unavailable" })
    expect(
      buildTransitionInput(record({ unassignedReason: "Awaiting assignment" }), "triaged"),
    ).toEqual({ status: "triaged" })
    const triageReady = record({ ownerId: "usr_1" })
    expect(buildTransitionInput(triageReady, "triaged")).toEqual({ status: "triaged" })

    const triaged = record({ status: "triaged", ownerId: "usr_1" })
    expect(buildTransitionInput(triaged, "in_progress")).toBeNull()
    expect(buildTransitionInput(triaged, "in_progress", { noFollowUpExpected: true })).toEqual({
      status: "in_progress",
      noFollowUpExpected: true,
    })
    expect(buildTransitionInput(triaged, "qualified")).toBeNull()
    expect(
      buildTransitionInput(
        record({ status: "triaged", ownerId: "usr_1", personId: "per_1" }),
        "qualified",
      ),
    ).toEqual({ status: "qualified" })
  })

  it("requires close provenance for duplicate and other outcomes", () => {
    expect(buildCloseInput("duplicate")).toBeNull()
    expect(buildCloseInput("duplicate", { duplicateOfInquiryId: "inq_original" })).toEqual({
      outcome: "duplicate",
      duplicateOfInquiryId: "inq_original",
    })
    expect(buildCloseInput("other")).toBeNull()
    expect(buildCloseInput("other", { note: "Outside policy" })).toEqual({
      outcome: "other",
      note: "Outside policy",
    })
  })

  it("serializes the actionable view and core-supported filters", () => {
    const query = new URLSearchParams(
      buildInquiriesQueryString({
        view: "actionable",
        priority: "urgent",
        overdue: true,
        limit: 50,
      }),
    )
    expect(Object.fromEntries(query)).toEqual({
      view: "actionable",
      priority: "urgent",
      overdue: "true",
      limit: "50",
    })
  })

  it("makes every server page reachable", () => {
    expect(inquiryPageState(125, 50, 0)).toEqual({
      hasPrevious: false,
      hasNext: true,
      previousOffset: 0,
      nextOffset: 50,
    })
    expect(inquiryPageState(125, 50, 100)).toEqual({
      hasPrevious: true,
      hasNext: false,
      previousOffset: 50,
      nextOffset: 150,
    })
  })
})
