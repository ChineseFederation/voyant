import { describe, expect, it } from "vitest"

import { INQUIRY_DETAIL_DESTINATION, inquiryDetailPathTemplate } from "./inquiry-navigation.js"
import {
  assignInquirySchema,
  closeInquirySchema,
  convertInquiryToProposalSchema,
  createInquirySchema,
  createPublicInquirySchema,
  inquiryListQuerySchema,
  inquiryRecordSchema,
  inquiryTargetRecordSchema,
  inquiryTravelBriefV1Schema,
  publicInquiryReceiptSchema,
  recordInquiryActivitySchema,
} from "./validation.js"

describe("Inquiry contracts", () => {
  const base = {
    subject: "Anniversary trip",
    kind: "custom_trip" as const,
    contactSnapshot: { email: "traveler@example.com" },
    source: "phone" as const,
  }

  it("owns the import-cheap semantic detail destination", () => {
    expect(INQUIRY_DETAIL_DESTINATION).toBe("inquiry.detail")
    expect(inquiryDetailPathTemplate("/solicitari/")).toBe("/solicitari/{inquiryId}")
  })

  it("applies safe defaults to admin capture", () => {
    const parsed = createInquirySchema.parse({
      ...base,
      firstResponseDueAt: "2099-01-01T00:00:00.000Z",
    })
    expect(parsed).toMatchObject({
      priority: "normal",
      tags: [],
      customFields: {},
    })
    expect(parsed).not.toHaveProperty("firstResponseDueAt")
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

  it("requires a persisted idempotency key for Proposal conversion", () => {
    expect(
      convertInquiryToProposalSchema.parse({ kind: "proposal", idempotencyKey: "proposal-alt-1" }),
    ).toEqual({
      kind: "proposal",
      idempotencyKey: "proposal-alt-1",
      keepInquiryOpen: false,
    })
    expect(
      convertInquiryToProposalSchema.safeParse({ kind: "proposal", idempotencyKey: " " }).success,
    ).toBe(false)
  })

  it("distinguishes internal activity from meaningful customer communication", () => {
    expect(
      recordInquiryActivitySchema.parse({
        subject: "Sent itinerary",
        type: "email",
        communicationDirection: "outbound",
      }),
    ).toMatchObject({ type: "email", communicationDirection: "outbound" })
    expect(
      recordInquiryActivitySchema.safeParse({
        subject: "Internal follow-up",
        type: "task",
        communicationDirection: "outbound",
      }).success,
    ).toBe(false)
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
        targets: [],
      }).success,
    ).toBe(true)
  })

  it("owns immutable cross-module target snapshots", () => {
    expect(
      inquiryTargetRecordSchema.parse({
        linkId: "link_1",
        inquiryId: "inq_1",
        kind: "option_unit",
        targetId: "avsl_1",
        snapshot: {
          title: "Danube cruise",
          optionLabel: "12 September",
          startDate: "2026-09-12",
          endDate: "2026-09-19",
          publicUrl: "https://travel.example/cruises/1",
          sourceChannel: "storefront-web",
        },
        createdAt: "2026-08-18T00:00:00.000Z",
      }),
    ).toMatchObject({ kind: "option_unit", targetId: "avsl_1" })
  })

  it("keeps public intake source-controlled and returns an idempotent receipt", () => {
    const intake = createPublicInquirySchema.parse({
      sourceRef: "submission-1",
      subject: "Question about Kyoto",
      kind: "product",
      contactSnapshot: { email: "traveler@example.com" },
      personId: "per_body_override",
      targets: [
        {
          kind: "product",
          targetId: "prod_1",
          snapshot: { title: "Kyoto discovery", sourceChannel: "spoofed-channel" },
        },
      ],
    })
    expect(intake.targets).toHaveLength(1)
    expect(intake.targets[0]?.snapshot).not.toHaveProperty("sourceChannel")
    expect("source" in intake).toBe(false)
    expect("personId" in intake).toBe(false)
    expect(
      publicInquiryReceiptSchema.safeParse({
        data: {
          inquiryId: "inq_1",
          status: "new",
          duplicate: true,
          receivedAt: "2026-08-18T00:00:00.000Z",
        },
      }).success,
    ).toBe(true)
  })

  it("accepts targetless custom intake but requires a Product target for product intake", () => {
    expect(
      createPublicInquirySchema.safeParse({
        sourceRef: "custom-1",
        subject: "Design a custom trip",
        kind: "custom_trip",
        contactSnapshot: { phone: "+40 700 000 000" },
      }).success,
    ).toBe(true)
    expect(
      createPublicInquirySchema.safeParse({
        sourceRef: "product-1",
        subject: "Product question without a product",
        kind: "product",
        contactSnapshot: { email: "traveler@example.com" },
      }).success,
    ).toBe(false)
    expect(
      createPublicInquirySchema.safeParse({
        sourceRef: "unsupported-1",
        subject: "Unsupported public target",
        kind: "general",
        contactSnapshot: { email: "traveler@example.com" },
        targets: [{ kind: "trip", targetId: "trpe_1", snapshot: { title: "Draft" } }],
      }).success,
    ).toBe(false)
  })

  it("rejects duplicate public target references", () => {
    const target = {
      kind: "product" as const,
      targetId: "prod_1",
      snapshot: { title: "Kyoto discovery" },
    }
    expect(
      createPublicInquirySchema.safeParse({
        sourceRef: "duplicate-targets-1",
        subject: "Duplicate targets",
        kind: "product",
        contactSnapshot: { email: "traveler@example.com" },
        targets: [target, target],
      }).success,
    ).toBe(false)
  })
})
