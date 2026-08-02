import type { BookingAmendment } from "@voyant-travel/bookings-contracts"
import { describe, expect, it } from "vitest"

import { createVoyantStorefrontClient } from "../../src/index.js"

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
    priceDelta: { amountCents: 0, currency: "EUR" },
    effects: {
      finance: "not_required",
      legal: "not_required",
      documents: "not_required",
      fulfillment: "not_required",
      supplier: "not_required",
    },
    nextActions: ["accept"],
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
    const client = createVoyantStorefrontClient({
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
