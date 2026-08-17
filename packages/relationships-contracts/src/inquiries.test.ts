import { describe, expect, it } from "vitest"

import {
  assignInquirySchema,
  closeInquirySchema,
  createInquirySchema,
  inquiryListQuerySchema,
  inquiryRecordSchema,
  inquiryTravelBriefV1Schema,
} from "./validation.js"

describe("Inquiry contracts", () => {
  const base = {
    subject: "Anniversary trip",
    kind: "custom_trip" as const,
    contactSnapshot: { email: "traveler@example.com" },
    source: "phone" as const,
  }

  it("applies safe defaults to admin capture", () => {
    expect(createInquirySchema.parse(base)).toMatchObject({
      priority: "normal",
      tags: [],
      customFields: {},
    })
  })

  it("requires at least one submitted contact detail", () => {
    expect(createInquirySchema.safeParse({ ...base, contactSnapshot: {} }).success).toBe(false)
  })

  it("validates the versioned partial travel brief", () => {
    expect(
      inquiryTravelBriefV1Schema.parse({
        version: 1,
        destinations: [{ label: "Kyoto" }],
        dateFlexibility: "few_weeks",
        budget: { currency: "EUR", flexibility: "approximate" },
      }),
    ).toMatchObject({ version: 1, destinations: [{ label: "Kyoto" }] })
  })

  it("requires an explanation when clearing assignment", () => {
    expect(assignInquirySchema.safeParse({ ownerId: null }).success).toBe(false)
    expect(
      assignInquirySchema.safeParse({ ownerId: null, unassignedReason: "Awaiting triage" }).success,
    ).toBe(true)
  })

  it("requires outcome-specific close evidence", () => {
    expect(closeInquirySchema.safeParse({ outcome: "duplicate" }).success).toBe(false)
    expect(closeInquirySchema.safeParse({ outcome: "other" }).success).toBe(false)
    expect(closeInquirySchema.safeParse({ outcome: "spam" }).success).toBe(true)
  })

  it("accepts canonical work-queue views and composes explicit filters", () => {
    expect(inquiryListQuerySchema.parse({})).toMatchObject({
      view: "actionable",
      limit: 50,
      offset: 0,
    })
    expect(inquiryListQuerySchema.parse({ view: "mine", status: "in_progress" })).toMatchObject({
      view: "mine",
      status: "in_progress",
      limit: 50,
      offset: 0,
    })
    expect(inquiryListQuerySchema.safeParse({ view: "inbox" }).success).toBe(false)
  })

  it("owns the serialized Inquiry record contract", () => {
    expect(
      inquiryRecordSchema.safeParse({
        id: "inq_1",
        subject: "Anniversary trip",
        kind: "custom_trip",
        status: "new",
        closeOutcome: null,
        closeNote: null,
        duplicateOfInquiryId: null,
        priority: "normal",
        personId: null,
        organizationId: null,
        contactSnapshot: { email: "traveler@example.com" },
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
        locale: null,
        consentSnapshot: null,
        tags: [],
        customFields: {},
        lastActivityAt: null,
        qualifiedAt: null,
        convertedAt: null,
        closedAt: null,
        createdAt: "2026-08-18T00:00:00.000Z",
        updatedAt: "2026-08-18T00:00:00.000Z",
      }).success,
    ).toBe(true)
  })
})
