import type { BookingLifecycleConformanceScenarioV1 } from "./lifecycle-conformance.js"

const baseSession = {
  id: "bsess_conformance",
  revision: 3,
  expectedRevision: 3,
  state: "active" as const,
}

const baseQuote = {
  id: "bquo_conformance",
  sessionId: "bsess_conformance",
  sessionRevision: 3,
  state: "fresh" as const,
}

const ownedPolicy = {
  id: "owned-default",
  kind: "owned_atomic_commit" as const,
  inventoryAuthority: "owned" as const,
  paymentGuarantee: "required_before_commit" as const,
  allowBookingBeforeSupplierSecured: false,
  operatorBackedRiskAccepted: false,
}

const ownedPaymentNotRequiredPolicy = {
  ...ownedPolicy,
  id: "owned-payment-not-required",
  paymentGuarantee: "not_required" as const,
}

const ownedPayLaterPolicy = {
  ...ownedPolicy,
  id: "owned-pay-later",
  paymentGuarantee: "pay_later_authorized" as const,
}

const sourcedSupplierFirstPolicy = {
  id: "sourced-default",
  kind: "sourced_supplier_first" as const,
  inventoryAuthority: "sourced" as const,
  paymentGuarantee: "required_before_commit" as const,
  allowBookingBeforeSupplierSecured: false,
  operatorBackedRiskAccepted: false,
}

const operatorBackedPolicy = {
  id: "operator-backed",
  kind: "operator_backed_commit" as const,
  inventoryAuthority: "sourced" as const,
  paymentGuarantee: "pay_later_authorized" as const,
  allowBookingBeforeSupplierSecured: true,
  operatorBackedRiskAccepted: true,
}

const liveHold = {
  required: true,
  id: "hold_conformance",
  sessionId: "bsess_conformance",
  state: "live" as const,
}

const noSupplier = {
  state: "not_applicable" as const,
  intentPersistedBeforeDispatch: false,
}

export const BOOKING_LIFECYCLE_CONFORMANCE_V1_REQUIRED_SCENARIO_IDS = [
  "owned-atomic-commit",
  "owned-atomic-commit-hold-not-required",
  "owned-atomic-commit-payment-not-required",
  "owned-atomic-commit-pay-later-authorized",
  "payment-guarantee-required",
  "session-revision-mismatch",
  "quote-revision-mismatch",
  "quote-expired",
  "hold-expired",
  "sourced-supplier-first-pending",
  "sourced-supplier-in-doubt",
  "sourced-supplier-failed",
  "sourced-supplier-secured",
  "operator-backed-risk-accepted",
  "operator-backed-supplier-in-doubt-after-booking",
  "accepted-proposal-version-fresh-quote",
  "proposal-material-change-renewed-acceptance",
  "idempotent-replay",
] as const

export const bookingLifecycleConformanceScenariosV1 = [
  {
    id: "owned-atomic-commit",
    title: "Owned inventory commits atomically",
    decision:
      "Commit validates the exact Session revision, fresh Quote, live Hold, and required guarantee, then creates Booking, converts Hold to Allocation, and consumes Session/Quote in one transaction.",
    input: {
      idempotencyKey: "idem_owned_commit",
      policy: ownedPolicy,
      session: baseSession,
      quote: baseQuote,
      hold: liveHold,
      paymentGuarantee: "established" as const,
      supplier: noSupplier,
    },
    expected: {
      outcomeKind: "committed" as const,
      nextAction: "none" as const,
      effects: {
        bookingCreated: true,
        allocationCreated: true,
        holdConverted: true,
        sessionConsumed: true,
        quoteConsumed: true,
        paymentGuaranteeEstablished: true,
        transactionBoundary: "single" as const,
      },
    },
  },
  {
    id: "owned-atomic-commit-hold-not-required",
    title: "Owned inventory can commit without a policy-required Hold",
    decision:
      "When policy does not require a Hold, owned Commit creates the Booking and Allocation atomically without claiming that a Hold was converted.",
    input: {
      idempotencyKey: "idem_owned_no_hold",
      policy: ownedPaymentNotRequiredPolicy,
      session: baseSession,
      quote: baseQuote,
      hold: { required: false, state: "not_required" as const },
      paymentGuarantee: "not_required" as const,
      supplier: noSupplier,
    },
    expected: {
      outcomeKind: "committed" as const,
      nextAction: "none" as const,
      effects: {
        bookingCreated: true,
        allocationCreated: true,
        holdConverted: false,
        sessionConsumed: true,
        quoteConsumed: true,
        paymentGuaranteeEstablished: false,
        transactionBoundary: "single" as const,
      },
    },
  },
  {
    id: "owned-atomic-commit-payment-not-required",
    title: "Owned inventory can commit when no payment guarantee is required",
    decision:
      "A not_required payment policy does not establish a payment guarantee before Commit, while owned inventory still commits atomically.",
    input: {
      idempotencyKey: "idem_owned_no_payment",
      policy: ownedPaymentNotRequiredPolicy,
      session: baseSession,
      quote: baseQuote,
      hold: liveHold,
      paymentGuarantee: "not_required" as const,
      supplier: noSupplier,
    },
    expected: {
      outcomeKind: "committed" as const,
      nextAction: "none" as const,
      effects: {
        bookingCreated: true,
        allocationCreated: true,
        holdConverted: true,
        sessionConsumed: true,
        quoteConsumed: true,
        paymentGuaranteeEstablished: false,
        transactionBoundary: "single" as const,
      },
    },
  },
  {
    id: "owned-atomic-commit-pay-later-authorized",
    title: "Owned inventory can commit when pay-later is authorized",
    decision:
      "A pay_later_authorized policy may commit with post-commit collection authorization and without a pre-commit guarantee.",
    input: {
      idempotencyKey: "idem_owned_pay_later",
      policy: ownedPayLaterPolicy,
      session: baseSession,
      quote: baseQuote,
      hold: liveHold,
      paymentGuarantee: "post_commit_authorized" as const,
      supplier: noSupplier,
    },
    expected: {
      outcomeKind: "committed" as const,
      nextAction: "none" as const,
      effects: {
        bookingCreated: true,
        allocationCreated: true,
        holdConverted: true,
        sessionConsumed: true,
        quoteConsumed: true,
        paymentGuaranteeEstablished: false,
        transactionBoundary: "single" as const,
      },
    },
  },
  {
    id: "payment-guarantee-required",
    title: "Payment guarantee is a precondition when policy requires it",
    decision:
      "Commit returns payment_required and creates no Booking when a required guarantee is missing.",
    input: {
      idempotencyKey: "idem_payment_required",
      policy: ownedPolicy,
      session: baseSession,
      quote: baseQuote,
      hold: liveHold,
      paymentGuarantee: "missing" as const,
      supplier: noSupplier,
    },
    expected: {
      outcomeKind: "payment_required" as const,
      nextAction: "establish_payment_guarantee" as const,
      effects: { bookingCreated: false, transactionBoundary: "none" as const },
    },
  },
  {
    id: "session-revision-mismatch",
    title: "Commit rejects stale Session revisions",
    decision: "Commit must validate the caller's exact Booking Session revision.",
    input: {
      idempotencyKey: "idem_session_revision",
      policy: ownedPolicy,
      session: { ...baseSession, expectedRevision: 2 },
      quote: baseQuote,
      hold: liveHold,
      paymentGuarantee: "established" as const,
      supplier: noSupplier,
    },
    expected: {
      outcomeKind: "revision_mismatch" as const,
      nextAction: "refresh_session_state" as const,
      effects: { bookingCreated: false, transactionBoundary: "none" as const },
    },
  },
  {
    id: "quote-revision-mismatch",
    title: "Commit rejects Quotes bound to another revision",
    decision: "Quote is immutable and bound to one exact Booking Session revision.",
    input: {
      idempotencyKey: "idem_quote_revision",
      policy: ownedPolicy,
      session: baseSession,
      quote: { ...baseQuote, sessionRevision: 2 },
      hold: liveHold,
      paymentGuarantee: "established" as const,
      supplier: noSupplier,
    },
    expected: {
      outcomeKind: "quote_failure" as const,
      nextAction: "request_fresh_quote" as const,
      effects: { bookingCreated: false, transactionBoundary: "none" as const },
    },
  },
  {
    id: "quote-expired",
    title: "Commit rejects expired Quotes",
    decision: "Expired pricing cannot authorize a durable Booking.",
    input: {
      idempotencyKey: "idem_quote_expired",
      policy: ownedPolicy,
      session: baseSession,
      quote: { ...baseQuote, state: "expired" as const },
      hold: liveHold,
      paymentGuarantee: "established" as const,
      supplier: noSupplier,
    },
    expected: {
      outcomeKind: "quote_failure" as const,
      nextAction: "request_fresh_quote" as const,
      effects: { bookingCreated: false, transactionBoundary: "none" as const },
    },
  },
  {
    id: "hold-expired",
    title: "Commit rejects non-live Holds",
    decision: "A required Hold must be live and must belong to the exact Booking Session.",
    input: {
      idempotencyKey: "idem_hold_expired",
      policy: ownedPolicy,
      session: baseSession,
      quote: baseQuote,
      hold: { ...liveHold, state: "expired" as const },
      paymentGuarantee: "established" as const,
      supplier: noSupplier,
    },
    expected: {
      outcomeKind: "hold_failure" as const,
      nextAction: "request_new_hold" as const,
      effects: { bookingCreated: false, transactionBoundary: "none" as const },
    },
  },
  {
    id: "sourced-supplier-first-pending",
    title: "Sourced inventory persists supplier intent before dispatch",
    decision:
      "Supplier-first Commit persists Commit/Supplier Operation intent before dispatch and creates no Booking while supplier security is pending.",
    input: {
      idempotencyKey: "idem_supplier_pending",
      policy: sourcedSupplierFirstPolicy,
      session: baseSession,
      quote: baseQuote,
      hold: { required: false, state: "not_required" as const },
      paymentGuarantee: "established" as const,
      supplier: {
        state: "pending" as const,
        operationId: "sop_pending",
        intentPersistedBeforeDispatch: true,
      },
    },
    expected: {
      outcomeKind: "supplier_pending" as const,
      nextAction: "await_supplier_operation" as const,
      effects: {
        bookingCreated: false,
        supplierOperationPersisted: true,
        supplierDispatched: true,
      },
    },
  },
  {
    id: "sourced-supplier-in-doubt",
    title: "Ambiguous supplier outcomes require reconciliation",
    decision:
      "Supplier ambiguity is represented as supplier_in_doubt with a reconciliation action, not a draft or payment-like Booking status.",
    input: {
      idempotencyKey: "idem_supplier_doubt",
      policy: sourcedSupplierFirstPolicy,
      session: baseSession,
      quote: baseQuote,
      hold: { required: false, state: "not_required" as const },
      paymentGuarantee: "established" as const,
      supplier: {
        state: "in_doubt" as const,
        operationId: "sop_doubt",
        intentPersistedBeforeDispatch: true,
      },
    },
    expected: {
      outcomeKind: "supplier_in_doubt" as const,
      nextAction: "reconcile_supplier_operation" as const,
      effects: {
        bookingCreated: false,
        supplierOperationPersisted: true,
        supplierDispatched: true,
      },
    },
  },
  {
    id: "sourced-supplier-failed",
    title: "Definitive supplier failure returns a typed recovery outcome",
    decision:
      "A definitive supplier failure remains Supplier Operation state and asks the caller to select alternative inventory without fabricating a Booking.",
    input: {
      idempotencyKey: "idem_supplier_failed",
      policy: sourcedSupplierFirstPolicy,
      session: baseSession,
      quote: baseQuote,
      hold: { required: false, state: "not_required" as const },
      paymentGuarantee: "established" as const,
      supplier: {
        state: "failed" as const,
        operationId: "sop_failed",
        intentPersistedBeforeDispatch: true,
      },
    },
    expected: {
      outcomeKind: "supplier_failed" as const,
      nextAction: "select_alternative_inventory" as const,
      effects: {
        bookingCreated: false,
        supplierOperationPersisted: true,
        supplierDispatched: true,
      },
    },
  },
  {
    id: "sourced-supplier-secured",
    title: "Supplier security authorizes sourced Booking creation",
    decision: "Default sourced inventory creates Booking only after the supplier is secured.",
    input: {
      idempotencyKey: "idem_supplier_secured",
      policy: sourcedSupplierFirstPolicy,
      session: baseSession,
      quote: baseQuote,
      hold: { required: false, state: "not_required" as const },
      paymentGuarantee: "established" as const,
      supplier: {
        state: "secured" as const,
        operationId: "sop_secured",
        intentPersistedBeforeDispatch: true,
      },
    },
    expected: {
      outcomeKind: "committed" as const,
      nextAction: "none" as const,
      effects: {
        bookingCreated: true,
        supplierOperationPersisted: true,
        supplierDispatched: true,
        sessionConsumed: true,
        quoteConsumed: true,
      },
    },
  },
  {
    id: "operator-backed-risk-accepted",
    title: "Explicit operator-backed policy may create Booking before supplier security",
    decision:
      "Early sourced Booking creation is allowed only under an explicit operator-backed policy where the operator assumes fulfillment risk.",
    input: {
      idempotencyKey: "idem_operator_backed",
      policy: operatorBackedPolicy,
      session: baseSession,
      quote: baseQuote,
      hold: { required: false, state: "not_required" as const },
      paymentGuarantee: "post_commit_authorized" as const,
      supplier: {
        state: "pending" as const,
        operationId: "sop_operator_backed",
        intentPersistedBeforeDispatch: true,
      },
    },
    expected: {
      outcomeKind: "supplier_pending" as const,
      nextAction: "await_supplier_operation" as const,
      effects: {
        bookingCreated: true,
        bookingCreatedBeforeSupplierSecured: true,
        sessionConsumed: true,
        quoteConsumed: true,
        supplierOperationPersisted: true,
        supplierDispatched: true,
      },
    },
  },
  {
    id: "operator-backed-supplier-in-doubt-after-booking",
    title: "Operator-backed supplier ambiguity after early Booking keeps explicit risk",
    decision:
      "When an operator-backed Commit creates a Booking before supplier security and the supplier result becomes ambiguous, the outcome keeps the Booking id and explicit fulfillment-risk acceptance for reconciliation.",
    input: {
      idempotencyKey: "idem_operator_backed_doubt",
      policy: operatorBackedPolicy,
      session: baseSession,
      quote: baseQuote,
      hold: { required: false, state: "not_required" as const },
      paymentGuarantee: "post_commit_authorized" as const,
      supplier: {
        state: "in_doubt" as const,
        operationId: "sop_operator_backed_doubt",
        intentPersistedBeforeDispatch: true,
      },
    },
    expected: {
      outcomeKind: "supplier_in_doubt" as const,
      nextAction: "reconcile_supplier_operation" as const,
      effects: {
        bookingCreated: true,
        bookingCreatedBeforeSupplierSecured: true,
        sessionConsumed: true,
        quoteConsumed: true,
        supplierOperationPersisted: true,
        supplierDispatched: true,
      },
    },
  },
  {
    id: "accepted-proposal-version-fresh-quote",
    title: "Accepted Proposal Version seeds a Session, then needs fresh Quote and availability",
    decision:
      "Proposal Version acceptance records customer intent; Booking creation still requires fresh Booking Session pricing and availability.",
    input: {
      idempotencyKey: "idem_proposal_fresh_quote",
      policy: ownedPolicy,
      session: baseSession,
      quote: { ...baseQuote, state: "expired" as const },
      hold: liveHold,
      paymentGuarantee: "established" as const,
      supplier: noSupplier,
      proposalAcceptance: {
        proposalVersionId: "prvr_conformance",
        acceptedVersionRevision: 1,
        currentVersionRevision: 1,
        materialTermsChanged: false,
        freshQuoteRequired: true,
      },
    },
    expected: {
      outcomeKind: "quote_failure" as const,
      nextAction: "request_fresh_quote" as const,
      effects: { bookingCreated: false },
    },
  },
  {
    id: "proposal-material-change-renewed-acceptance",
    title: "Material Proposal Version changes require renewed acceptance",
    decision:
      "Accepted Proposal Version handoff cannot commit materially changed terms without a renewed acceptance.",
    input: {
      idempotencyKey: "idem_proposal_renew_acceptance",
      policy: ownedPolicy,
      session: baseSession,
      quote: baseQuote,
      hold: liveHold,
      paymentGuarantee: "established" as const,
      supplier: noSupplier,
      proposalAcceptance: {
        proposalVersionId: "prvr_conformance",
        acceptedVersionRevision: 1,
        currentVersionRevision: 2,
        materialTermsChanged: true,
        freshQuoteRequired: true,
      },
    },
    expected: {
      outcomeKind: "proposal_acceptance_required" as const,
      nextAction: "renew_proposal_version_acceptance" as const,
      effects: { bookingCreated: false },
    },
  },
  {
    id: "idempotent-replay",
    title: "Idempotent replay returns the original result",
    decision:
      "Repeating Commit with the same idempotency key returns the canonical prior outcome and creates no second Booking or supplier operation.",
    input: {
      idempotencyKey: "idem_replay_commit",
      policy: ownedPolicy,
      session: { ...baseSession, state: "consumed" as const },
      quote: baseQuote,
      hold: { ...liveHold, state: "converted" as const },
      paymentGuarantee: "established" as const,
      supplier: noSupplier,
      replayOfCommitId: "commit_conformance",
    },
    expected: {
      outcomeKind: "idempotent_replay" as const,
      nextAction: "return_idempotent_result" as const,
      effects: {
        bookingCreated: false,
        allocationCreated: false,
        holdConverted: false,
        sessionConsumed: false,
        quoteConsumed: false,
        supplierOperationPersisted: false,
        supplierDispatched: false,
        transactionBoundary: "none" as const,
      },
    },
  },
] satisfies BookingLifecycleConformanceScenarioV1[]
