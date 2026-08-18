import type { BookingAmendment } from "@voyant-travel/bookings-contracts"
import { describe, expect, it } from "vitest"

import { createVoyantPublicApiClient } from "../../../src/legacy-client/index.js"

function amendment(): BookingAmendment {
  return {
    id: "bkam_demo",
    bookingId: "book_demo",
    travelerId: "bkpt_demo",
    kind: "traveler_correction",
    status: "proposed",
    baseBookingRevision: 1,
    resultBookingRevision: 2,
    acceptanceRequired: true,
    policyDecisions: [
      {
        code: "traveler-correction",
        version: "v1",
        decision: "acceptance_required",
        reason: "Customer acceptance required.",
      },
    ],
    priceDelta: {
      currency: "EUR",
      subtotalDeltaCents: 0,
      feeDeltaCents: 0,
      taxDeltaCents: 0,
      amountCents: 0,
      collectionAmountCents: 0,
      refundAmountCents: 0,
      taxLines: [],
    },
    financialConsequences: {
      collection: "not_required",
      refund: "not_required",
      invoice: "not_required",
      creditNote: "not_required",
      paymentSchedule: "not_required",
    },
    effects: {
      finance: "not_required",
      legal: "not_required",
      documents: "not_required",
      fulfillment: "not_required",
      supplier: "not_required",
      allocation: "not_required",
    },
    nextActions: ["accept"],
    quotedAt: "2026-01-01T00:00:00.000Z",
    quoteExpiresAt: null,
    supplierOperationIds: [],
    failureCode: null,
    requestedBy: "pers_demo",
    requestedActor: "customer",
    reason: "Correct name",
    acceptedAt: null,
    acceptedBy: null,
    acceptedActor: null,
    appliedAt: null,
    appliedBy: null,
    appliedActor: null,
    createdAt: "2026-08-02T12:00:00.000Z",
    updatedAt: "2026-08-02T12:00:00.000Z",
    revisions: [],
  }
}

describe("Booking Amendment SDK", () => {
  it("uses the canonical public route and forwards the stable idempotency key", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = []
    const client = createVoyantPublicApiClient({
      baseUrl: "https://operator.example.test",
      fetcher: async (url, init) => {
        calls.push({ url, init })
        return Response.json({ data: { status: "ok", amendment: amendment() } })
      },
    })

    const result = await client.bookingAmendments.previewTravelerCorrection(
      "book_demo",
      {
        travelerId: "bkpt_demo",
        expectedBookingRevision: 1,
        reason: "Correct name",
        patch: { firstName: "Correct" },
      },
      { idempotencyKey: "traveler-correction-1" },
    )

    expect(result).toMatchObject({ status: "ok", amendment: { id: "bkam_demo" } })
    expect(calls[0]?.url).toBe(
      "https://operator.example.test/v1/public/bookings/book_demo/amendments/traveler-corrections/preview",
    )
    expect(new Headers(calls[0]?.init?.headers).get("Idempotency-Key")).toBe(
      "traveler-correction-1",
    )
  })
})
