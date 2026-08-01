import { describe, expect, it } from "vitest"

import {
  assertBookingLifecycleConformanceV1,
  BOOKING_LIFECYCLE_CONFORMANCE_V1_REQUIRED_SCENARIO_IDS,
  type BookingLifecycleCommitOutcomeV1,
  type BookingLifecycleConformanceScenarioV1,
  type BookingLifecycleObservationV1,
  bookingCommitmentPolicyV1,
  bookingLifecycleCommitInputV1,
  bookingLifecycleConformanceScenariosV1,
  runBookingLifecycleConformanceV1,
} from "./lifecycle-conformance.js"

describe("booking lifecycle conformance contract", () => {
  it("publishes every required Booking Platform v1 scenario", () => {
    expect(bookingLifecycleConformanceScenariosV1.map((scenario) => scenario.id)).toEqual(
      BOOKING_LIFECYCLE_CONFORMANCE_V1_REQUIRED_SCENARIO_IDS,
    )
  })

  it("rejects policy combinations that would create implicit early Bookings", () => {
    expect(
      bookingCommitmentPolicyV1.safeParse({
        id: "invalid-sourced",
        kind: "sourced_supplier_first",
        inventoryAuthority: "sourced",
        paymentGuarantee: "required_before_commit",
        allowBookingBeforeSupplierSecured: true,
      }).success,
    ).toBe(false)

    expect(
      bookingCommitmentPolicyV1.safeParse({
        id: "invalid-operator-backed",
        kind: "operator_backed_commit",
        inventoryAuthority: "sourced",
        paymentGuarantee: "pay_later_authorized",
        allowBookingBeforeSupplierSecured: true,
        operatorBackedRiskAccepted: false,
      }).success,
    ).toBe(false)
  })

  it("rejects incoherent payment policy and state combinations", () => {
    const requiredPaymentScenario = bookingLifecycleConformanceScenariosV1.find(
      (scenario) => scenario.id === "owned-atomic-commit",
    )!
    const notRequiredScenario = bookingLifecycleConformanceScenariosV1.find(
      (scenario) => scenario.id === "owned-atomic-commit-payment-not-required",
    )!
    const payLaterScenario = bookingLifecycleConformanceScenariosV1.find(
      (scenario) => scenario.id === "owned-atomic-commit-pay-later-authorized",
    )!

    expect(
      bookingLifecycleCommitInputV1.safeParse({
        ...notRequiredScenario.input,
        paymentGuarantee: "established",
      }).success,
    ).toBe(false)
    expect(
      bookingLifecycleCommitInputV1.safeParse({
        ...requiredPaymentScenario.input,
        paymentGuarantee: "post_commit_authorized",
      }).success,
    ).toBe(false)
    expect(
      bookingLifecycleCommitInputV1.safeParse({
        ...payLaterScenario.input,
        paymentGuarantee: "missing",
      }).success,
    ).toBe(false)
  })

  it("rejects incoherent supplier state and operation identity combinations", () => {
    const pendingScenario = bookingLifecycleConformanceScenariosV1.find(
      (scenario) => scenario.id === "sourced-supplier-first-pending",
    )!

    expect(
      bookingLifecycleCommitInputV1.safeParse({
        ...pendingScenario.input,
        supplier: {
          state: "intent_persisted",
          intentPersistedBeforeDispatch: true,
        },
      }).success,
    ).toBe(false)
    expect(
      bookingLifecycleCommitInputV1.safeParse({
        ...pendingScenario.input,
        supplier: {
          state: "pending",
          operationId: "sop_missing_intent",
          intentPersistedBeforeDispatch: false,
        },
      }).success,
    ).toBe(false)
    expect(
      bookingLifecycleCommitInputV1.safeParse({
        ...pendingScenario.input,
        supplier: {
          state: "in_doubt",
          intentPersistedBeforeDispatch: true,
        },
      }).success,
    ).toBe(false)
    expect(
      bookingLifecycleCommitInputV1.safeParse({
        ...pendingScenario.input,
        supplier: {
          state: "secured",
          intentPersistedBeforeDispatch: true,
        },
      }).success,
    ).toBe(false)
  })

  it("runs scenario observations through the reusable conformance runner", async () => {
    const results = await runBookingLifecycleConformanceV1({
      commit: (_input, scenario) => observationForScenario(scenario),
    })

    expect(results).toHaveLength(BOOKING_LIFECYCLE_CONFORMANCE_V1_REQUIRED_SCENARIO_IDS.length)
    expect(results.every((result) => result.passed)).toBe(true)
  })

  it("returns successful scenario results from the assertion helper", async () => {
    const results = await assertBookingLifecycleConformanceV1({
      commit: (_input, scenario) => observationForScenario(scenario),
    })

    expect(results).toHaveLength(BOOKING_LIFECYCLE_CONFORMANCE_V1_REQUIRED_SCENARIO_IDS.length)
    expect(results.every((result) => result.passed)).toBe(true)
  })

  it("fails supplier-first conformance when a pending supplier creates a Booking", async () => {
    const [result] = await runBookingLifecycleConformanceV1(
      {
        commit: (_input, scenario) => ({
          ...observationForScenario(scenario),
          effects: {
            ...observationForScenario(scenario).effects,
            bookingCreated: true,
          },
        }),
      },
      [
        bookingLifecycleConformanceScenariosV1.find(
          (scenario) => scenario.id === "sourced-supplier-first-pending",
        )!,
      ],
    )

    expect(result?.passed).toBe(false)
    expect(String(result?.error)).toContain("expected effect bookingCreated=false")
  })

  it("rejects assertion when any scenario fails", async () => {
    await expect(
      assertBookingLifecycleConformanceV1(
        {
          commit: (_input, scenario) => ({
            ...observationForScenario(scenario),
            effects: {
              ...observationForScenario(scenario).effects,
              bookingCreated: true,
            },
          }),
        },
        [
          bookingLifecycleConformanceScenariosV1.find(
            (scenario) => scenario.id === "sourced-supplier-first-pending",
          )!,
        ],
      ),
    ).rejects.toThrow(
      [
        "Booking lifecycle conformance failed for 1 scenario(s): sourced-supplier-first-pending",
        "- sourced-supplier-first-pending: expected effect bookingCreated=false",
      ].join("\n"),
    )
  })

  it("fails conformance when supplier dispatch is not backed by persisted operation state", async () => {
    const [result] = await runBookingLifecycleConformanceV1(
      {
        commit: (_input, scenario) => ({
          ...observationForScenario(scenario),
          effects: {
            ...observationForScenario(scenario).effects,
            supplierOperationPersisted: false,
            supplierDispatched: true,
          },
        }),
      },
      [
        bookingLifecycleConformanceScenariosV1.find(
          (scenario) => scenario.id === "sourced-supplier-first-pending",
        )!,
      ],
    )

    expect(result?.passed).toBe(false)
    expect(String(result?.error)).toContain(
      "supplier dispatch requires persisted supplier operation intent",
    )
  })

  it("fails conformance when supplier dispatch input did not persist intent first", async () => {
    const scenario = bookingLifecycleConformanceScenariosV1.find(
      (entry) => entry.id === "sourced-supplier-first-pending",
    )!
    const [result] = await runBookingLifecycleConformanceV1(
      {
        commit: (_input, parsedScenario) => observationForScenario(parsedScenario),
      },
      [
        {
          ...scenario,
          input: {
            ...scenario.input,
            supplier: {
              ...scenario.input.supplier,
              intentPersistedBeforeDispatch: false,
            },
          },
        },
      ],
    )

    expect(result?.passed).toBe(false)
    expect(String(result?.error)).toContain(
      "pending, in_doubt, secured, and failed supplier states require persisted intent",
    )
  })

  it("keeps effects omitted from an expectation unconstrained", async () => {
    const scenario = bookingLifecycleConformanceScenariosV1.find(
      (entry) => entry.id === "sourced-supplier-first-pending",
    )!
    const [result] = await runBookingLifecycleConformanceV1(
      {
        commit: (_input, parsedScenario) => ({
          ...observationForScenario(parsedScenario),
          effects: {
            ...observationForScenario(parsedScenario).effects,
            transactionBoundary: "single",
          },
        }),
      },
      [scenario],
    )

    expect(result?.passed).toBe(true)
  })

  it("returns the complete original typed outcome on idempotent replay", () => {
    const scenario = bookingLifecycleConformanceScenariosV1.find(
      (entry) => entry.id === "idempotent-replay",
    )!
    const observation = observationForScenario(scenario)

    if (!("id" in scenario.input.hold)) {
      throw new Error("idempotent replay scenario must include a Hold")
    }

    expect(observation.outcome).toEqual({
      kind: "idempotent_replay",
      nextAction: "return_idempotent_result",
      originalCommitId: "commit_conformance",
      originalOutcome: {
        kind: "committed",
        nextAction: "none",
        booking: { id: "book_conformance", status: "confirmed" },
        allocationIds: ["alloc_1"],
        consumedSessionId: scenario.input.session.id,
        consumedQuoteId: scenario.input.quote.id,
        convertedHoldId: scenario.input.hold.id,
      },
    })
  })

  it("fails conformance when supplier dispatch input has no operation id", async () => {
    const scenario = bookingLifecycleConformanceScenariosV1.find(
      (entry) => entry.id === "sourced-supplier-first-pending",
    )!
    const [result] = await runBookingLifecycleConformanceV1(
      {
        commit: (_input, parsedScenario) => observationForScenario(parsedScenario),
      },
      [
        {
          ...scenario,
          input: {
            ...scenario.input,
            supplier: {
              state: "intent_persisted",
              intentPersistedBeforeDispatch: true,
            },
          },
        },
      ],
    )

    expect(result?.passed).toBe(false)
    expect(String(result?.error)).toContain("persisted supplier intent requires an operationId")
  })

  it("fails conformance when early Booking does not consume Session and Quote", async () => {
    const scenario = bookingLifecycleConformanceScenariosV1.find(
      (entry) => entry.id === "operator-backed-risk-accepted",
    )!
    const [result] = await runBookingLifecycleConformanceV1(
      {
        commit: (_input, parsedScenario) => ({
          ...observationForScenario(parsedScenario),
          effects: {
            ...observationForScenario(parsedScenario).effects,
            sessionConsumed: false,
            quoteConsumed: false,
          },
        }),
      },
      [scenario],
    )

    expect(result?.passed).toBe(false)
    expect(String(result?.error)).toContain("expected effect sessionConsumed=true")
  })

  it("fails conformance when early Booking outcome omits booking id", async () => {
    const scenario = bookingLifecycleConformanceScenariosV1.find(
      (entry) => entry.id === "operator-backed-supplier-in-doubt-after-booking",
    )!
    const [result] = await runBookingLifecycleConformanceV1(
      {
        commit: (_input, parsedScenario) => ({
          ...observationForScenario(parsedScenario),
          outcome: {
            kind: "supplier_in_doubt",
            nextAction: "reconcile_supplier_operation",
            supplierOperationId: parsedScenario.input.supplier.operationId ?? "sop_conformance",
            operatorBackedRiskAccepted: true,
          },
        }),
      },
      [scenario],
    )

    expect(result?.passed).toBe(false)
    expect(String(result?.error)).toContain("early Booking outcome requires bookingId")
  })

  it("fails conformance when early Booking outcome omits risk acceptance", async () => {
    const scenario = bookingLifecycleConformanceScenariosV1.find(
      (entry) => entry.id === "operator-backed-supplier-in-doubt-after-booking",
    )!
    const [result] = await runBookingLifecycleConformanceV1(
      {
        commit: (_input, parsedScenario) => ({
          ...observationForScenario(parsedScenario),
          outcome: {
            kind: "supplier_in_doubt",
            nextAction: "reconcile_supplier_operation",
            supplierOperationId: parsedScenario.input.supplier.operationId ?? "sop_conformance",
            bookingId: "book_operator_backed_doubt",
            operatorBackedRiskAccepted: false,
          },
        }),
      },
      [scenario],
    )

    expect(result?.passed).toBe(false)
    expect(String(result?.error)).toContain(
      "early Booking requires outcome operator-backed risk acceptance",
    )
  })
})

function observationForScenario(
  scenario: BookingLifecycleConformanceScenarioV1,
): BookingLifecycleObservationV1 {
  const outcome = outcomeForScenario(scenario)
  return {
    outcome,
    effects: {
      bookingCreated: false,
      allocationCreated: false,
      holdConverted: false,
      sessionConsumed: false,
      quoteConsumed: false,
      supplierOperationPersisted: false,
      supplierDispatched: false,
      paymentGuaranteeEstablished: false,
      bookingCreatedBeforeSupplierSecured: false,
      financeStatePromotedToBookingStatus: false,
      transactionBoundary: "none",
      ...scenario.expected.effects,
    },
  }
}

function outcomeForScenario(
  scenario: BookingLifecycleConformanceScenarioV1,
): BookingLifecycleCommitOutcomeV1 {
  switch (scenario.expected.outcomeKind) {
    case "committed":
      return {
        kind: "committed",
        nextAction: "none",
        booking: { id: "book_conformance", status: "confirmed" },
        allocationIds: scenario.input.policy.kind === "owned_atomic_commit" ? ["alloc_1"] : [],
        consumedSessionId: scenario.input.session.id,
        consumedQuoteId: scenario.input.quote.id,
        convertedHoldId: scenario.input.hold.id,
        supplierOperationId: scenario.input.supplier.operationId,
      }
    case "payment_required":
      return {
        kind: "payment_required",
        nextAction: "establish_payment_guarantee",
        paymentTarget: "booking_session",
        allowedGuarantees: ["deposit", "pre_auth", "card_on_file"],
      }
    case "supplier_pending":
      return {
        kind: "supplier_pending",
        nextAction: scenario.expected.nextAction as
          | "persist_and_dispatch_supplier_operation"
          | "await_supplier_operation",
        supplierOperationId: scenario.input.supplier.operationId ?? "sop_conformance",
        bookingId: scenario.expected.effects.bookingCreated ? "book_operator_backed" : undefined,
        operatorBackedRiskAccepted: scenario.input.policy.operatorBackedRiskAccepted,
      }
    case "supplier_in_doubt":
      return {
        kind: "supplier_in_doubt",
        nextAction: "reconcile_supplier_operation",
        supplierOperationId: scenario.input.supplier.operationId ?? "sop_conformance",
        bookingId: scenario.expected.effects.bookingCreated
          ? "book_operator_backed_doubt"
          : undefined,
        operatorBackedRiskAccepted: scenario.input.policy.operatorBackedRiskAccepted,
      }
    case "supplier_failed":
      return {
        kind: "supplier_failed",
        nextAction: scenario.expected.nextAction as
          | "select_alternative_inventory"
          | "manual_review",
        supplierOperationId: scenario.input.supplier.operationId ?? "sop_conformance",
        bookingId: scenario.expected.effects.bookingCreated
          ? "book_operator_backed_failed"
          : undefined,
        operatorBackedRiskAccepted: scenario.input.policy.operatorBackedRiskAccepted,
      }
    case "revision_mismatch":
      return {
        kind: "revision_mismatch",
        nextAction: "refresh_session_state",
        expectedRevision: scenario.input.session.expectedRevision,
        actualRevision: scenario.input.session.revision,
      }
    case "quote_failure":
      return {
        kind: "quote_failure",
        nextAction: "request_fresh_quote",
        reason: scenario.input.quote.state === "expired" ? "expired" : "mismatched_revision",
      }
    case "hold_failure":
      return { kind: "hold_failure", nextAction: "request_new_hold", reason: "expired" }
    case "proposal_acceptance_required":
      return {
        kind: "proposal_acceptance_required",
        nextAction: "renew_proposal_version_acceptance",
        proposalVersionId: scenario.input.proposalAcceptance?.proposalVersionId ?? "prvr_1",
      }
    case "idempotent_replay":
      return {
        kind: "idempotent_replay",
        nextAction: "return_idempotent_result",
        originalCommitId: scenario.input.replayOfCommitId ?? "commit_1",
        originalOutcome: {
          kind: "committed",
          nextAction: "none",
          booking: { id: "book_conformance", status: "confirmed" },
          allocationIds: ["alloc_1"],
          consumedSessionId: scenario.input.session.id,
          consumedQuoteId: scenario.input.quote.id,
          convertedHoldId: scenario.input.hold.id,
        },
      }
  }
}
