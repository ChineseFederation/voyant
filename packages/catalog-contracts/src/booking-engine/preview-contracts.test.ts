import { describe, expect, it } from "vitest"

import {
  offerPreviewOutcomeV1,
  offerPreviewRequestV1,
  offerPreviewResultV1,
} from "./preview-contracts.js"
import {
  DEFAULT_PAX_BANDS,
  DEFAULT_PAYMENT_INTENTS,
  defaultBookingFields,
  defaultRequirementsFlags,
  defaultTravelerFields,
  paxBandsAllowedTotalFrom,
} from "./requirements-defaults.js"
import {
  commitBookingSessionV1,
  createBookingSessionTargetV1,
  placeBookingHoldV1,
} from "./session-contracts.js"

const REQUIREMENTS = {
  ...defaultRequirementsFlags(),
  paxBands: [...DEFAULT_PAX_BANDS],
  paxBandsAllowedTotal: paxBandsAllowedTotalFrom(DEFAULT_PAX_BANDS),
  travelerFields: [...defaultTravelerFields()],
  bookingFields: [...defaultBookingFields()],
  paymentIntents: [...DEFAULT_PAYMENT_INTENTS],
}

function previewResult(overrides: Record<string, unknown> = {}) {
  return offerPreviewResultV1.parse({
    binding: false,
    available: false,
    requirements: REQUIREMENTS,
    ...overrides,
  })
}

describe("offerPreviewResultV1", () => {
  /**
   * Invariant 1 + 4 (voyant#4188). A preview mints no identifier, so its
   * result is structurally not assignable anywhere a `quoteId` is required.
   * Asserted on the schema rather than on one sample response so that a field
   * added later cannot quietly reopen the path back to beta's `/quote`.
   */
  it("declares no identifier of any kind", () => {
    const keys = Object.keys(offerPreviewResultV1.shape)

    for (const forbidden of ["id", "quoteId", "token", "sessionId", "holdId"]) {
      expect(keys).not.toContain(forbidden)
    }
    expect(keys.some((key) => /^(id|.*(Id|Token|token))$/.test(key))).toBe(false)
  })

  it("strips an identifier a caller or a future field tries to smuggle through", () => {
    const parsed = previewResult({ id: "bsqu_1", quoteId: "bsqu_1", token: "t" }) as Record<
      string,
      unknown
    >

    expect(parsed.id).toBeUndefined()
    expect(parsed.quoteId).toBeUndefined()
    expect(parsed.token).toBeUndefined()
  })

  it("cannot satisfy the commands that consume a Quote", () => {
    expect(
      commitBookingSessionV1.safeParse({ ...previewResult(), expectedRevision: 1 }).success,
    ).toBe(false)
    expect(placeBookingHoldV1.safeParse({ ...previewResult(), expectedRevision: 1 }).success).toBe(
      false,
    )
  })

  it("is always non-binding", () => {
    expect(offerPreviewResultV1.safeParse({ ...previewResult(), binding: true }).success).toBe(
      false,
    )
    expect(previewResult().binding).toBe(false)
  })

  it("keeps requirements required and pricing optional", () => {
    expect(previewResult().pricing).toBeUndefined()
    expect(
      offerPreviewResultV1.safeParse({ binding: false, available: true, pricing: undefined })
        .success,
    ).toBe(false)
  })
})

describe("offerPreviewRequestV1", () => {
  /**
   * A preview is a read, so it admits any bookable target — including the
   * `owned_entity` targets `createBookingSessionTargetV1` refuses. Accommodation
   * and cruise detail pages are `owned_entity`, and they have to show a price.
   */
  it("takes every bookable target, not just the ones a Session can be created against", () => {
    for (const target of [
      { kind: "product", productId: "prod_1" },
      { kind: "catalog_item", catalogItemId: "ci_1" },
      { kind: "owned_entity", entityModule: "accommodations", entityId: "acc_1" },
      { kind: "owned_entity", entityModule: "cruises", entityId: "cru_1" },
    ]) {
      expect(
        offerPreviewRequestV1.safeParse({ target, scope: { locale: "en", market: "default" } })
          .success,
      ).toBe(true)
    }
  })

  it("still refuses a trip snapshot — never what a detail page is pointed at", () => {
    expect(
      offerPreviewRequestV1.safeParse({
        target: { kind: "trip_snapshot", tripSnapshotId: "t_1", tripEnvelopeId: "e_1" },
        scope: { locale: "en", market: "default" },
      }).success,
    ).toBe(false)
  })

  it("keeps Session creation narrower than the preview it widened past", () => {
    expect(
      createBookingSessionTargetV1.safeParse({
        kind: "owned_entity",
        entityModule: "accommodations",
        entityId: "acc_1",
      }).success,
    ).toBe(false)
  })

  it("has no audience on the wire — it is derived from the caller's actor kind", () => {
    const parsed = offerPreviewRequestV1.parse({
      target: { kind: "product", productId: "prod_1" },
      scope: { locale: "en", market: "default", audience: "staff" },
    })

    expect(Object.keys(parsed.scope)).not.toContain("audience")
  })
})

describe("offerPreviewOutcomeV1", () => {
  it("carries rejections in the body, like the Session outcome union", () => {
    expect(
      offerPreviewOutcomeV1.safeParse({
        kind: "rejected",
        error: {
          kind: "quote_unavailable",
          reason: "target_not_found",
          nextAction: "select_alternative_inventory",
        },
      }).success,
    ).toBe(true)
  })
})
