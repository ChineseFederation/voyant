import { describe, expect, it } from "vitest"

import {
  bookingSessionOutcomeV1,
  commitBookingSessionV1,
  createBookingSessionV1,
  placeBookingHoldV1,
  quoteBookingSessionV1,
  updateBookingSessionV1,
} from "./session-contracts.js"

describe("Booking Session v1 contracts", () => {
  it("accepts semantic Product and Catalog Item targets", () => {
    expect(
      createBookingSessionV1.safeParse({
        idempotencyKey: "create_product_key",
        target: { kind: "product", productId: "prod_1" },
      }).success,
    ).toBe(true)
    expect(
      createBookingSessionV1.safeParse({
        idempotencyKey: "create_catalog_key",
        target: { kind: "catalog_item", catalogItemId: "cse_1" },
      }).success,
    ).toBe(true)
  })

  it("rejects ambiguous target identities instead of silently stripping them", () => {
    expect(
      createBookingSessionV1.safeParse({
        idempotencyKey: "ambiguous_target_key",
        target: {
          kind: "product",
          productId: "prod_1",
          catalogItemId: "cse_1",
        },
      }).success,
    ).toBe(false)
  })

  it("requires revision preconditions for mutating choreography", () => {
    expect(updateBookingSessionV1.safeParse({ state: {} }).success).toBe(false)
    expect(
      quoteBookingSessionV1.safeParse({
        expectedRevision: 1,
        idempotencyKey: "stable_quote_key",
      }).success,
    ).toBe(true)
    expect(
      placeBookingHoldV1.safeParse({
        quoteId: "bsqu_1",
        expectedRevision: 1,
        idempotencyKey: "stable_hold_key",
      }).success,
    ).toBe(true)
    expect(
      commitBookingSessionV1.safeParse({
        expectedRevision: 1,
        quoteId: "bsqu_1",
        holdId: "bshd_1",
        idempotencyKey: "stable_commit_key",
      }).success,
    ).toBe(true)
  })

  it("does not accept client-authoritative Booking status, source, or price fields on Commit", () => {
    const parsed = commitBookingSessionV1.parse({
      expectedRevision: 1,
      quoteId: "bsqu_1",
      holdId: "bshd_1",
      idempotencyKey: "stable_commit_key",
      status: "draft",
      sourceKind: "owned",
      price: { total: 1 },
    })

    expect("status" in parsed).toBe(false)
    expect("sourceKind" in parsed).toBe(false)
    expect("price" in parsed).toBe(false)
  })

  it("returns typed lifecycle outcomes instead of prose-only errors", () => {
    const result = bookingSessionOutcomeV1.safeParse({
      kind: "rejected",
      error: {
        kind: "quote_superseded",
        nextAction: "request_fresh_quote",
      },
    })

    expect(result.success).toBe(true)
  })

  it.each([
    {
      kind: "quote_unavailable",
      reason: "target_not_found",
      nextAction: "select_alternative_inventory",
    },
    {
      kind: "commit_rejected",
      reason: "incomplete_draft",
      nextAction: "update_selection",
    },
    {
      kind: "hold_quantity_mismatch",
      requestedQuantity: 1,
      expectedQuantity: 2,
      nextAction: "request_new_hold",
    },
  ])("accepts the actionable $kind lifecycle rejection", (error) => {
    expect(bookingSessionOutcomeV1.safeParse({ kind: "rejected", error }).success).toBe(true)
  })
})
