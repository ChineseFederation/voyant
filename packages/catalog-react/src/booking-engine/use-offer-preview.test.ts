import { offerPreviewRequestV1 } from "@voyant-travel/catalog-contracts/booking-engine/preview-contracts"
import { describe, expect, it } from "vitest"

import { offerPreviewRequestBody, signPreview } from "./use-offer-preview.js"

const ACCOMMODATION = {
  kind: "owned_entity",
  entityModule: "accommodations",
  entityId: "acc_1",
} as const

describe("offerPreviewRequestBody", () => {
  it("builds a body the preview contract accepts, defaulting an unset scope", () => {
    const body = offerPreviewRequestBody(ACCOMMODATION, {}, undefined)

    expect(body.scope).toEqual({ locale: "en-GB", market: "default" })
    expect(offerPreviewRequestV1.safeParse(body).success).toBe(true)
  })

  it("carries an owned_entity target — the reason the preview target union is wider", () => {
    const body = offerPreviewRequestBody(
      ACCOMMODATION,
      { market: "ro", currency: "RON" },
      undefined,
    )

    expect(body.target).toEqual(ACCOMMODATION)
    expect(body.scope.currency).toBe("RON")
    expect(offerPreviewRequestV1.safeParse(body).success).toBe(true)
  })

  it("omits currency rather than sending an undefined one", () => {
    const scope = offerPreviewRequestBody(ACCOMMODATION, { currency: undefined }, undefined).scope

    expect(Object.keys(scope)).not.toContain("currency")
  })
})

describe("signPreview", () => {
  it("changes when a pricing-significant field changes", () => {
    const before = signPreview(ACCOMMODATION, { configure: { pax: { adult: 2 } } })
    const after = signPreview(ACCOMMODATION, { configure: { pax: { adult: 3 } } })

    expect(before).not.toBe(after)
  })

  /**
   * The reason the signature exists at all: a cosmetic edit must not cost a
   * round trip. Notes and traveler names do not move the price.
   */
  it("does not change on a cosmetic edit", () => {
    const before = signPreview(ACCOMMODATION, {
      configure: { pax: { adult: 2 } },
      customerNotes: "",
      travelers: [{ firstName: "Ana", lastName: "Pop", band: "adult" }],
    })
    const after = signPreview(ACCOMMODATION, {
      configure: { pax: { adult: 2 } },
      customerNotes: "late arrival",
      travelers: [{ firstName: "Ana-Maria", lastName: "Popescu", band: "adult" }],
    })

    expect(before).toBe(after)
  })

  it("changes when the target changes, so one page cannot show another's price", () => {
    expect(signPreview(ACCOMMODATION, undefined)).not.toBe(
      signPreview({ ...ACCOMMODATION, entityId: "acc_2" }, undefined),
    )
  })

  it("changes on a room or rate-plan pick — per-room pricing depends on it", () => {
    const rooms = (ratePlanId: string) => ({
      configure: { pax: { adult: 2 } },
      accommodation: {
        rooms: [{ optionUnitId: "room_1", quantity: 1, ratePlanId }],
        travelerAssignments: {},
      },
    })

    expect(signPreview(ACCOMMODATION, rooms("rp_1"))).not.toBe(
      signPreview(ACCOMMODATION, rooms("rp_2")),
    )
  })
})
