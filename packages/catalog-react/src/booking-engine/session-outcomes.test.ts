import {
  type BookingLifecycleCommitOutcomeV1,
  bookingLifecycleCommitOutcomeKindV1,
} from "@voyant-travel/catalog-contracts/booking-engine/lifecycle-conformance"
import type { BookingSessionOutcomeV1 } from "@voyant-travel/catalog-contracts/booking-engine/session-contracts"
import { afterEach, describe, expect, it, vi } from "vitest"

import {
  type BookingSessionRecoveryV1,
  bookingSessionCommitOutcome,
  bookingSessionContinuationIsStale,
  bookingSessionNextActionV1,
  bookingSessionRecoveryV1,
} from "./session-outcomes.js"

function commitResult(outcome: BookingLifecycleCommitOutcomeV1): BookingSessionOutcomeV1 {
  return { kind: "commit_result", outcome }
}

/** One representative value per Commit outcome kind, straight from the contract. */
const COMMIT_OUTCOMES = {
  committed: {
    kind: "committed",
    nextAction: "none",
    booking: { id: "book_1", status: "confirmed" },
    allocationIds: ["bkac_1"],
    consumedSessionId: "bses_1",
    consumedQuoteId: "bsqu_1",
  },
  component_bookings_committed: {
    kind: "component_bookings_committed",
    nextAction: "none",
    bookings: [
      { componentId: "cmp_1", bookingId: "book_1", status: "confirmed", allocationIds: ["bkac_1"] },
    ],
    consumedSessionId: "bses_1",
    consumedQuoteId: "bsqu_1",
  },
  component_commit_pending: {
    kind: "component_commit_pending",
    nextAction: "continue_component_commit",
    components: [{ componentId: "cmp_1", state: "supplier_pending" }],
  },
  payment_required: {
    kind: "payment_required",
    nextAction: "establish_payment_guarantee",
    paymentTarget: "booking_session",
    allowedGuarantees: ["deposit"],
    paymentSession: {
      id: "pays_1",
      status: "requires_redirect",
      amountCents: 1000,
      currency: "EUR",
      redirectUrl: "https://pay.test/1",
      checkout: null,
      expiresAt: null,
    },
  },
  supplier_pending: {
    kind: "supplier_pending",
    nextAction: "await_supplier_operation",
    supplierOperationId: "supop_1",
    operatorBackedRiskAccepted: false,
  },
  supplier_in_doubt: {
    kind: "supplier_in_doubt",
    nextAction: "reconcile_supplier_operation",
    supplierOperationId: "supop_1",
    operatorBackedRiskAccepted: false,
  },
  supplier_failed: {
    kind: "supplier_failed",
    nextAction: "select_alternative_inventory",
    supplierOperationId: "supop_1",
    operatorBackedRiskAccepted: false,
  },
  revision_mismatch: {
    kind: "revision_mismatch",
    nextAction: "refresh_session_state",
    expectedRevision: 1,
    actualRevision: 2,
  },
  quote_failure: {
    kind: "quote_failure",
    nextAction: "request_fresh_quote",
    reason: "superseded",
  },
  hold_failure: { kind: "hold_failure", nextAction: "request_new_hold", reason: "expired" },
  proposal_acceptance_required: {
    kind: "proposal_acceptance_required",
    nextAction: "renew_proposal_version_acceptance",
    proposalVersionId: "prpv_1",
  },
  idempotent_replay: {
    kind: "idempotent_replay",
    nextAction: "return_idempotent_result",
    originalCommitId: "bscm_1",
    originalOutcome: {
      kind: "quote_failure",
      nextAction: "request_fresh_quote",
      reason: "expired",
    },
  },
} satisfies Record<string, BookingLifecycleCommitOutcomeV1>

afterEach(() => {
  vi.restoreAllMocks()
})

describe("bookingSessionRecoveryV1 over the commit_result envelope", () => {
  // The defect: `commit_result` is not `rejected`, so every failed Commit fell
  // straight through to the generic fallback (voyant#4662).
  it.each([
    ["quote_failure", "quoteChanged"],
    ["hold_failure", "availabilityChanged"],
    ["revision_mismatch", "revisionConflict"],
    ["supplier_pending", "commitInFlight"],
    ["supplier_in_doubt", "commitInFlight"],
    ["component_commit_pending", "commitInFlight"],
    ["supplier_failed", "supplierUnavailable"],
    ["proposal_acceptance_required", "proposalAcceptanceRequired"],
  ] as Array<
    [keyof typeof COMMIT_OUTCOMES, BookingSessionRecoveryV1]
  >)("classifies a %s Commit as %s", (kind, recovery) => {
    expect(bookingSessionRecoveryV1(commitResult(COMMIT_OUTCOMES[kind]))).toBe(recovery)
  })

  it("classifies a replayed failure by the outcome it replays, not by the wrapper", () => {
    const outcome = commitResult(COMMIT_OUTCOMES.idempotent_replay)
    expect(bookingSessionRecoveryV1(outcome)).toBe("quoteChanged")
    // The reader hands back the original so a host can read `reason` too.
    expect(bookingSessionCommitOutcome(outcome)).toMatchObject({
      kind: "quote_failure",
      reason: "expired",
    })
  })

  it("keeps the server's instruction reachable instead of only reporting it", () => {
    expect(bookingSessionNextActionV1(commitResult(COMMIT_OUTCOMES.quote_failure))).toBe(
      "request_fresh_quote",
    )
    expect(bookingSessionNextActionV1(commitResult(COMMIT_OUTCOMES.hold_failure))).toBe(
      "request_new_hold",
    )
    expect(
      bookingSessionNextActionV1({
        kind: "rejected",
        error: { kind: "selection_incomplete", unsatisfied: [], nextAction: "update_selection" },
      } as BookingSessionOutcomeV1),
    ).toBe("update_selection")
  })

  it("classifies every Commit outcome the contract declares without warning", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    for (const kind of bookingLifecycleCommitOutcomeKindV1.options) {
      const outcome = COMMIT_OUTCOMES[kind as keyof typeof COMMIT_OUTCOMES]
      // A kind added to the contract with no fixture here is the point of the
      // assertion: it would otherwise reach the mapper as `undefined`.
      expect(outcome, `no fixture for commit outcome "${kind}"`).toBeDefined()
      bookingSessionRecoveryV1(commitResult(outcome))
    }
    expect(warn).not.toHaveBeenCalled()
  })
})

describe("bookingSessionRecoveryV1 over the rejected envelope", () => {
  it("separates an already-consumed Session from work still in flight", () => {
    // The server only answers `commit_already_consumed` after looking for a
    // commit under *this* caller's key and finding none, so nothing is coming
    // and waiting is not the remedy — the booking exists under another attempt.
    expect(
      bookingSessionRecoveryV1({
        kind: "rejected",
        error: { kind: "commit_already_consumed", nextAction: "return_idempotent_result" },
      } as BookingSessionOutcomeV1),
    ).toBe("alreadyCommitted")
    expect(
      bookingSessionRecoveryV1({
        kind: "rejected",
        error: { kind: "payment_in_flight", nextAction: "await_payment_outcome" },
      } as BookingSessionOutcomeV1),
    ).toBe("commitInFlight")
  })
})

describe("the unknown fallback", () => {
  it("is loud outside production for a shape this build does not know", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    const recovery = bookingSessionRecoveryV1(
      commitResult({
        kind: "invented_by_a_newer_server",
      } as unknown as BookingLifecycleCommitOutcomeV1),
    )
    expect(recovery).toBe("unknown")
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("invented_by_a_newer_server"))
  })

  it("stays quiet for a declared kind that deliberately has no remedy to name", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    expect(
      bookingSessionRecoveryV1({
        kind: "rejected",
        error: { kind: "session_expired" },
      } as BookingSessionOutcomeV1),
    ).toBe("unknown")
    expect(warn).not.toHaveBeenCalled()
  })
})

describe("bookingSessionContinuationIsStale", () => {
  it("condemns the continuation when the Quote, Hold or revision it pins is gone", () => {
    expect(bookingSessionContinuationIsStale(commitResult(COMMIT_OUTCOMES.quote_failure))).toBe(
      true,
    )
    expect(bookingSessionContinuationIsStale(commitResult(COMMIT_OUTCOMES.hold_failure))).toBe(true)
    expect(bookingSessionContinuationIsStale(commitResult(COMMIT_OUTCOMES.revision_mismatch))).toBe(
      true,
    )
    // A replay of a dead Quote is still a dead Quote.
    expect(bookingSessionContinuationIsStale(commitResult(COMMIT_OUTCOMES.idempotent_replay))).toBe(
      true,
    )
  })

  it("keeps it whenever the Commit may have landed", () => {
    // Discarding here would lose the only key that can retrieve the original
    // result, and the next submit would mint a second booking.
    expect(bookingSessionContinuationIsStale(commitResult(COMMIT_OUTCOMES.supplier_pending))).toBe(
      false,
    )
    expect(bookingSessionContinuationIsStale(commitResult(COMMIT_OUTCOMES.supplier_in_doubt))).toBe(
      false,
    )
    expect(
      bookingSessionContinuationIsStale({
        kind: "rejected",
        error: { kind: "payment_in_flight", nextAction: "await_payment_outcome" },
      } as BookingSessionOutcomeV1),
    ).toBe(false)
  })
})
