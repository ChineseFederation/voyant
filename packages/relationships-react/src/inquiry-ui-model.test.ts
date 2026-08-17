import { describe, expect, it, vi } from "vitest"
import { type InquiryRecord, inquiryRecordSchema } from "./inquiry-schemas.js"
import {
  buildCloseInput,
  buildTransitionInput,
  createConversionRetryKeyStore,
  filterInquiryQueue,
  findBookingSessionTarget,
} from "./inquiry-ui-model.js"
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
    unassignedReason: "Awaiting assignment",
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
    customFields: {},
    targets: [],
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

  it("reuses a conversion key after failure and rotates it after definitive success", async () => {
    const generate = vi.fn().mockReturnValueOnce("key-1").mockReturnValueOnce("key-2")
    const store = createConversionRetryKeyStore(generate)
    const failed = vi.fn().mockRejectedValueOnce(new Error("temporary"))
    await expect(store.run("proposal", failed)).rejects.toThrow("temporary")
    const success = vi.fn().mockResolvedValue("done")
    await expect(store.run("proposal", success)).resolves.toBe("done")
    expect(failed).toHaveBeenCalledWith("key-1")
    expect(success).toHaveBeenCalledWith("key-1")
    await store.run("proposal", success)
    expect(success).toHaveBeenLastCalledWith("key-2")
  })

  it("keeps terminal records out of the actionable view and selects eligible booking targets", () => {
    const active = record({ id: "inq_active", status: "triaged", ownerId: "usr_1" })
    const converted = record({
      id: "inq_done",
      status: "converted",
      convertedAt: "2026-08-18T12:00:00.000Z",
    })
    expect(filterInquiryQueue([active, converted], "actionable")).toEqual([active])
    expect(filterInquiryQueue([active, converted], "converted")).toEqual([converted])
    expect(filterInquiryQueue([active, converted], undefined, "converted")).toEqual([converted])
    const target = findBookingSessionTarget([
      {
        id: "link_trip",
        kind: "trip",
        targetId: "trip_1",
        label: null,
        snapshot: null,
        createdAt: active.createdAt,
      },
      {
        id: "link_product",
        kind: "product",
        targetId: "prd_1",
        label: null,
        snapshot: null,
        createdAt: active.createdAt,
      },
    ])
    expect(target?.id).toBe("link_product")
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
})
