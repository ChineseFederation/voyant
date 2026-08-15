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
        requirementsFingerprint: "requirements_fingerprint_1",
        holdId: "bshd_1",
        idempotencyKey: "stable_commit_key",
      }).success,
    ).toBe(true)
  })

  it("leaves an unstated Hold quantity absent for the server to derive", () => {
    // A `.default(1)` here filled the field in during parsing, so the server's
    // own fallback to the Session's party size was unreachable and every
    // multi-traveler Hold was rejected against an invented `1` (voyant#4655).
    const parsed = placeBookingHoldV1.parse({
      quoteId: "bsqu_1",
      expectedRevision: 1,
      idempotencyKey: "stable_hold_key",
    })
    expect(parsed.quantity).toBeUndefined()
    expect("quantity" in parsed).toBe(false)
    expect(
      placeBookingHoldV1.parse({
        quoteId: "bsqu_1",
        expectedRevision: 1,
        quantity: 3,
        idempotencyKey: "stable_hold_key",
      }).quantity,
    ).toBe(3)
  })

  it("does not accept client-authoritative Booking status, source, or price fields on Commit", () => {
    const parsed = commitBookingSessionV1.parse({
      expectedRevision: 1,
      quoteId: "bsqu_1",
      requirementsFingerprint: "requirements_fingerprint_1",
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

  it("lets a Commit state the checkout handoffs the storefront can render", () => {
    const parsed = commitBookingSessionV1.parse({
      expectedRevision: 1,
      quoteId: "bsqu_1",
      requirementsFingerprint: "requirements_fingerprint_1",
      idempotencyKey: "stable_commit_key",
      payment: { acceptedCheckoutHandoffs: ["embedded", "redirect"] },
    })

    expect(parsed.payment?.acceptedCheckoutHandoffs).toEqual(["embedded", "redirect"])
  })

  it("carries the shopper's selected checkout intent through Commit", () => {
    const parsed = commitBookingSessionV1.parse({
      expectedRevision: 1,
      quoteId: "bsqu_1",
      requirementsFingerprint: "requirements_fingerprint_1",
      idempotencyKey: "stable_commit_key",
      checkoutIntent: "bank_transfer",
    })

    expect(parsed.checkoutIntent).toBe("bank_transfer")
  })

  it("leaves the preference absent when the storefront states nothing", () => {
    const parsed = commitBookingSessionV1.parse({
      expectedRevision: 1,
      quoteId: "bsqu_1",
      requirementsFingerprint: "requirements_fingerprint_1",
      idempotencyKey: "stable_commit_key",
      payment: { returnUrl: "https://shop.example.test/return" },
    })

    // Not defaulted here: `["redirect"]` is what an absent field *means*, and
    // the one place that decides it is `acceptedPaymentCheckoutHandoffs`. A
    // default stamped at the edge would be a second answer to the same
    // question.
    expect(parsed.payment?.acceptedCheckoutHandoffs).toBeUndefined()
  })

  it("accepts a Commit that omits returnUrl, which an embedded handoff never uses", () => {
    expect(
      commitBookingSessionV1.safeParse({
        expectedRevision: 1,
        quoteId: "bsqu_1",
        requirementsFingerprint: "requirements_fingerprint_1",
        idempotencyKey: "stable_commit_key",
        payment: { acceptedCheckoutHandoffs: ["embedded"] },
      }).success,
    ).toBe(true)
    // ...and still takes one when supplied, because an issuer authentication
    // step wants somewhere to return to.
    expect(
      commitBookingSessionV1.safeParse({
        expectedRevision: 1,
        quoteId: "bsqu_1",
        requirementsFingerprint: "requirements_fingerprint_1",
        idempotencyKey: "stable_commit_key",
        payment: {
          acceptedCheckoutHandoffs: ["embedded"],
          returnUrl: "https://shop.example.test/return",
        },
      }).success,
    ).toBe(true)
  })

  it("rejects a handoff the payment port cannot produce, and an empty preference", () => {
    expect(
      commitBookingSessionV1.safeParse({
        expectedRevision: 1,
        quoteId: "bsqu_1",
        requirementsFingerprint: "requirements_fingerprint_1",
        idempotencyKey: "stable_commit_key",
        payment: { acceptedCheckoutHandoffs: ["iframe"] },
      }).success,
    ).toBe(false)
    expect(
      commitBookingSessionV1.safeParse({
        expectedRevision: 1,
        quoteId: "bsqu_1",
        requirementsFingerprint: "requirements_fingerprint_1",
        idempotencyKey: "stable_commit_key",
        payment: { acceptedCheckoutHandoffs: [] },
      }).success,
    ).toBe(false)
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

  it("represents durable bank-transfer instructions on a committed outcome", () => {
    const result = bookingSessionOutcomeV1.safeParse({
      kind: "commit_result",
      outcome: {
        kind: "committed",
        nextAction: "none",
        checkoutIntent: "bank_transfer",
        bankTransfer: {
          paymentSessionId: "pays_bank",
          document: { id: "invc_proforma", number: "PRO-42", type: "proforma" },
          instructions: {
            beneficiary: "Voyant Travel",
            iban: "RO49AAAA1B31007593840000",
            bankName: "Voyant Bank",
            reference: "BOOK-42",
            amountCents: 10_000,
            currency: "EUR",
            dueAt: "2026-08-08T12:00:00.000Z",
          },
        },
        booking: { id: "book_42", status: "confirmed" },
        allocationIds: ["bkac_42"],
        consumedSessionId: "bses_42",
        consumedQuoteId: "bsqu_42",
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
      nextAction: "request_hold_for_expected_quantity",
    },
  ])("accepts the actionable $kind lifecycle rejection", (error) => {
    expect(bookingSessionOutcomeV1.safeParse({ kind: "rejected", error }).success).toBe(true)
  })
})
