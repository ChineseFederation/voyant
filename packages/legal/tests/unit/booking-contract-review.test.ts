import { describe, expect, it } from "vitest"
import {
  bookingContractCustomerVariables,
  bookingContractPrerequisites,
  bookingContractTemplateMatchesChannel,
  getBookingContractReview,
  resolveBookingContractLanguage,
} from "../../src/booking-contract-review.js"

const contractBase = {
  id: "contract_1",
  contractNumber: "LC-1",
  scope: "customer",
  status: "sent",
  stageHistory: [],
  title: "Customer agreement",
  templateVersionId: null,
  seriesId: null,
  personId: null,
  organizationId: null,
  supplierId: null,
  channelId: null,
  bookingId: "booking_1",
  targetKind: null,
  targetId: null,
  targetProvider: null,
  targetSourceRef: null,
  legacyTransactionOfferId: null,
  legacyTransactionOrderId: null,
  issuedAt: null,
  sentAt: new Date("2026-01-02T03:04:05.000Z"),
  executedAt: null,
  expiresAt: null,
  voidedAt: null,
  language: "en",
  renderedBodyFormat: "html",
  renderedBody: "<p>Agreement</p>",
  variables: { customer: { name: "Ana Pop" } },
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
}

function dbReturning(row: unknown) {
  return {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: () => Promise.resolve(row ? [row] : []),
        }),
      }),
    }),
  }
}

const validReviewSnapshot = {
  booking: {
    id: "booking_1",
    reference: "BK-1",
    customerName: "Ana Pop",
    customerEmail: "ana@example.test",
    language: "en",
    currency: "EUR",
    totalAmountCents: 100_00,
    startDate: "2026-02-01",
    endDate: "2026-02-08",
  },
  products: [{ title: "Original tour", quantity: 2, amountCents: 100_00, currency: "EUR" }],
  commercialTerms: { depositDueCents: 25_00, balanceDueDays: 30 },
  template: {
    id: "template_1",
    name: "Customer template",
    versionId: "template_version_1",
    version: 3,
    language: "en",
  },
}

describe("booking contract prerequisites", () => {
  it("keeps listing and draft-write prerequisites complete and deduplicated", () => {
    expect(
      bookingContractPrerequisites({
        templateApplicable: false,
        totalAmountCents: null,
        itemCount: 0,
        missingRequiredVariables: ["customer.email", "booking.startDate"],
      }),
    ).toEqual([
      "template.applicableCurrentVersion",
      "commercial.totalAmountCents",
      "booking.items",
      "customer.email",
      "booking.startDate",
    ])
  })

  it("allows phone-only bookings unless the selected template requires email", () => {
    expect(
      bookingContractPrerequisites({
        templateApplicable: true,
        totalAmountCents: 100_00,
        itemCount: 1,
      }),
    ).toEqual([])
    expect(
      bookingContractPrerequisites({
        templateApplicable: true,
        totalAmountCents: 100_00,
        itemCount: 1,
        missingRequiredVariables: ["customer.email"],
      }),
    ).toEqual(["customer.email"])
  })

  it("uses booking language fallbacks and exact-or-global channel matching", () => {
    expect(
      resolveBookingContractLanguage({
        communicationLanguage: "ro",
        contactPreferredLanguage: "fr",
      }),
    ).toBe("ro")
    expect(
      resolveBookingContractLanguage({
        communicationLanguage: null,
        contactPreferredLanguage: "fr",
      }),
    ).toBe("fr")
    expect(bookingContractTemplateMatchesChannel(null, undefined)).toBe(true)
    expect(bookingContractTemplateMatchesChannel("channel_a", undefined)).toBe(false)
    expect(bookingContractTemplateMatchesChannel(null, "channel_a")).toBe(true)
    expect(bookingContractTemplateMatchesChannel("channel_a", "channel_a")).toBe(true)
    expect(bookingContractTemplateMatchesChannel("channel_b", "channel_a")).toBe(false)
  })

  it("exposes phone contacts to template prerequisite evaluation", () => {
    expect(
      bookingContractCustomerVariables({
        contactFirstName: "Ana",
        contactLastName: "Pop",
        contactEmail: null,
        contactPhone: "+40700000000",
      }),
    ).toEqual({ name: "Ana Pop", email: null, phone: "+40700000000" })
  })
})

describe("booking contract review lookup", () => {
  it("returns null for malformed managed workflow review snapshots", async () => {
    const review = await getBookingContractReview(
      dbReturning({
        ...contractBase,
        metadata: {
          bookingContractWorkflow: {
            revision: 1,
            reviewSnapshot: {
              ...validReviewSnapshot,
              template: { ...validReviewSnapshot.template, versionId: null },
            },
          },
        },
      }) as never,
      "contract_1",
    )

    expect(review).toBeNull()
  })

  it("uses the validated managed workflow snapshot and preserves delivery status", async () => {
    const review = await getBookingContractReview(
      dbReturning({
        ...contractBase,
        metadata: {
          bookingContractWorkflow: {
            revision: 2,
            previousRevisionId: "contract_previous",
            reviewSnapshot: validReviewSnapshot,
            delivery: {
              recipient: "ana@example.test",
              channel: "email",
              revision: 2,
              viewedAt: "2026-01-03T04:05:06.000Z",
              notificationsSuppressed: true,
            },
          },
        },
      }) as never,
      "contract_1",
    )

    expect(review).toMatchObject({
      effectiveStatus: "viewed",
      revision: 2,
      previousRevisionId: "contract_previous",
      booking: validReviewSnapshot.booking,
      products: validReviewSnapshot.products,
      template: validReviewSnapshot.template,
      commercialTerms: validReviewSnapshot.commercialTerms,
      delivery: {
        recipient: "ana@example.test",
        channel: "email",
        sentRevision: 2,
        sentAt: "2026-01-02T03:04:05.000Z",
        viewedAt: "2026-01-03T04:05:06.000Z",
        declinedAt: null,
        notificationsSuppressed: true,
      },
      contract: { templateVersionId: "template_version_1" },
    })
    expect(review?.contentFingerprint).toMatch(/^booking-contract-content:v1:sha256:/)
  })
})
