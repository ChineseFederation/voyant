import { z } from "zod"
import type { BookingRequirementsV1, PaxBandDependencyV1 } from "./requirements-contracts.js"
import { bookingRequirementsV1 } from "./requirements-contracts.js"
import {
  requiredRequirementKeysV1,
  unsatisfiableRequiredRequirementsV1,
  validateSelectionAgainstRequirements,
} from "./requirements-validation.js"

export {
  BOOKING_LIFECYCLE_CONFORMANCE_V1_REQUIRED_SCENARIO_IDS,
  bookingLifecycleConformanceScenariosV1,
} from "./lifecycle-conformance-scenarios.js"

import { bookingLifecycleConformanceScenariosV1 } from "./lifecycle-conformance-scenarios.js"

/**
 * The processor checkout handoff as it appears on a Booking lifecycle outcome,
 * mirroring `PaymentHostedCheckout` from `@voyant-travel/payments`.
 *
 * Mirrored rather than imported, for two reasons. A contracts package describes
 * the wire and depends only on zod — it does not pull in a runtime package. And
 * `@voyant-travel/finance-contracts`, which carries the same mirror for
 * finance's own routes, is **not on the public npm surface**: importing it here
 * would drag it and its closure back onto npm through this published package,
 * which `verify:public-surface` rejects (voyant#4059).
 *
 * The copy is not free-floating. `projectPaymentSession` in
 * `@voyant-travel/catalog` assigns the `payment_sessions.checkout` column —
 * typed `PaymentHostedCheckout` by the port itself — into this type, so a
 * drifted arm fails that build rather than silently serving a shape the port no
 * longer produces.
 */
export const bookingPaymentRedirectCheckoutV1 = z.object({
  kind: z.enum(["hosted_checkout", "redirect"]),
  url: z.string(),
  expiresAt: z.string().nullable().optional(),
})

/**
 * The in-page arm. `clientSecret` and `publishableKey` are opaque here on
 * purpose: the runtime forwards them and never parses them, so no provider's
 * token format is baked into the contract.
 */
export const bookingPaymentEmbeddedCheckoutV1 = z.object({
  kind: z.literal("embedded"),
  clientSecret: z.string(),
  publishableKey: z.string(),
  providerAccountId: z.string().nullable().optional(),
  expiresAt: z.string().nullable().optional(),
})

export const bookingPaymentCheckoutV1 = z.discriminatedUnion("kind", [
  bookingPaymentRedirectCheckoutV1,
  bookingPaymentEmbeddedCheckoutV1,
])
export type BookingPaymentCheckoutV1 = z.infer<typeof bookingPaymentCheckoutV1>

export const bookingCommitmentPolicyKindV1 = z.enum([
  "owned_atomic_commit",
  "sourced_supplier_first",
  "operator_backed_commit",
])
export type BookingCommitmentPolicyKindV1 = z.infer<typeof bookingCommitmentPolicyKindV1>

export const bookingInventoryAuthorityV1 = z.enum(["owned", "sourced"])
export type BookingInventoryAuthorityV1 = z.infer<typeof bookingInventoryAuthorityV1>

export const paymentGuaranteePolicyV1 = z.enum([
  "not_required",
  "required_before_commit",
  "pay_later_authorized",
])
export type PaymentGuaranteePolicyV1 = z.infer<typeof paymentGuaranteePolicyV1>

export const paymentGuaranteeStateV1 = z.enum([
  "not_required",
  "missing",
  "established",
  "post_commit_authorized",
])
export type PaymentGuaranteeStateV1 = z.infer<typeof paymentGuaranteeStateV1>

export const supplierSecurityStateV1 = z.enum([
  "not_applicable",
  "not_started",
  "intent_persisted",
  "pending",
  "secured",
  "in_doubt",
  "failed",
])
export type SupplierSecurityStateV1 = z.infer<typeof supplierSecurityStateV1>

export const bookingCommitmentPolicyV1 = z
  .object({
    id: z.string().min(1),
    kind: bookingCommitmentPolicyKindV1,
    inventoryAuthority: bookingInventoryAuthorityV1,
    paymentGuarantee: paymentGuaranteePolicyV1,
    allowBookingBeforeSupplierSecured: z.boolean(),
    operatorBackedRiskAccepted: z.boolean().default(false),
  })
  .superRefine((policy, ctx) => {
    if (policy.kind === "owned_atomic_commit") {
      if (policy.inventoryAuthority !== "owned") {
        ctx.addIssue({
          code: "custom",
          path: ["inventoryAuthority"],
          message: "owned_atomic_commit policies apply only to owned inventory",
        })
      }
      if (policy.allowBookingBeforeSupplierSecured) {
        ctx.addIssue({
          code: "custom",
          path: ["allowBookingBeforeSupplierSecured"],
          message: "owned inventory has no supplier-first early-booking exception",
        })
      }
    }
    if (policy.kind === "sourced_supplier_first") {
      if (policy.inventoryAuthority !== "sourced") {
        ctx.addIssue({
          code: "custom",
          path: ["inventoryAuthority"],
          message: "sourced_supplier_first policies apply only to sourced inventory",
        })
      }
      if (policy.allowBookingBeforeSupplierSecured) {
        ctx.addIssue({
          code: "custom",
          path: ["allowBookingBeforeSupplierSecured"],
          message: "supplier-first policy must not create a Booking before supplier security",
        })
      }
    }
    if (policy.kind === "operator_backed_commit") {
      if (policy.inventoryAuthority !== "sourced") {
        ctx.addIssue({
          code: "custom",
          path: ["inventoryAuthority"],
          message: "operator-backed policy applies only to sourced inventory",
        })
      }
      if (!policy.allowBookingBeforeSupplierSecured || !policy.operatorBackedRiskAccepted) {
        ctx.addIssue({
          code: "custom",
          path: ["operatorBackedRiskAccepted"],
          message:
            "operator-backed early Booking requires explicit operator fulfillment-risk acceptance",
        })
      }
    }
  })
export type BookingCommitmentPolicyV1 = z.infer<typeof bookingCommitmentPolicyV1>

export const bookingLifecycleCommitInputV1 = z
  .object({
    idempotencyKey: z.string().min(8),
    policy: bookingCommitmentPolicyV1,
    session: z.object({
      id: z.string().min(1),
      revision: z.number().int().positive(),
      expectedRevision: z.number().int().positive(),
      state: z.enum(["active", "consumed", "abandoned"]),
    }),
    quote: z.object({
      id: z.string().min(1),
      sessionId: z.string().min(1),
      sessionRevision: z.number().int().positive(),
      state: z.enum(["fresh", "expired", "superseded", "mismatched"]),
    }),
    hold: z.object({
      required: z.boolean(),
      id: z.string().min(1).optional(),
      sessionId: z.string().min(1).optional(),
      state: z.enum(["not_required", "live", "missing", "expired", "released", "converted"]),
    }),
    paymentGuarantee: paymentGuaranteeStateV1,
    supplier: z.object({
      state: supplierSecurityStateV1,
      operationId: z.string().min(1).optional(),
      intentPersistedBeforeDispatch: z.boolean().default(false),
    }),
    /**
     * The Booking Requirements this Commit was collected against and the
     * selection collected against them. Optional so the lifecycle scenarios
     * that say nothing about requirements keep parsing, but a vertical that
     * publishes requirements is held to them: see `assertScenarioObservation`,
     * which refuses a Booking built on an unsatisfied selection and refuses a
     * descriptor whose required entries nothing can check.
     */
    requirements: z
      .object({
        published: bookingRequirementsV1,
        selection: z.record(z.string(), z.unknown()),
      })
      .optional(),
    proposalAcceptance: z
      .object({
        proposalVersionId: z.string().min(1),
        acceptedVersionRevision: z.number().int().positive(),
        currentVersionRevision: z.number().int().positive(),
        materialTermsChanged: z.boolean(),
        freshQuoteRequired: z.literal(true),
      })
      .optional(),
    replayOfCommitId: z.string().min(1).optional(),
  })
  .superRefine((input, ctx) => {
    if (
      input.policy.paymentGuarantee === "not_required" &&
      input.paymentGuarantee !== "not_required"
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["paymentGuarantee"],
        message: "not_required payment policy must use not_required payment state",
      })
    }
    if (
      input.policy.paymentGuarantee === "required_before_commit" &&
      input.paymentGuarantee !== "established" &&
      input.paymentGuarantee !== "missing"
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["paymentGuarantee"],
        message:
          "required_before_commit payment policy must use established or missing payment state",
      })
    }
    if (
      input.policy.paymentGuarantee === "pay_later_authorized" &&
      input.paymentGuarantee !== "post_commit_authorized" &&
      input.paymentGuarantee !== "established"
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["paymentGuarantee"],
        message:
          "pay_later_authorized payment policy must use post_commit_authorized or established payment state",
      })
    }
    if (input.supplier.intentPersistedBeforeDispatch && !input.supplier.operationId) {
      ctx.addIssue({
        code: "custom",
        path: ["supplier", "operationId"],
        message: "persisted supplier intent requires an operationId",
      })
    }
    if (
      (input.supplier.state === "pending" ||
        input.supplier.state === "in_doubt" ||
        input.supplier.state === "secured" ||
        input.supplier.state === "failed") &&
      !input.supplier.intentPersistedBeforeDispatch
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["supplier", "intentPersistedBeforeDispatch"],
        message: "pending, in_doubt, secured, and failed supplier states require persisted intent",
      })
    }
    if (
      (input.supplier.state === "pending" ||
        input.supplier.state === "in_doubt" ||
        input.supplier.state === "secured" ||
        input.supplier.state === "failed") &&
      !input.supplier.operationId
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["supplier", "operationId"],
        message: "pending, in_doubt, secured, and failed supplier states require an operationId",
      })
    }
  })
export type BookingLifecycleCommitInputV1 = z.infer<typeof bookingLifecycleCommitInputV1>

export const bookingLifecycleNextActionV1 = z.enum([
  "none",
  "establish_payment_guarantee",
  "refresh_session_state",
  "request_fresh_quote",
  "request_new_hold",
  "persist_and_dispatch_supplier_operation",
  "await_supplier_operation",
  "reconcile_supplier_operation",
  "select_alternative_inventory",
  "manual_review",
  "renew_proposal_version_acceptance",
  "continue_component_commit",
  "return_idempotent_result",
])
export type BookingLifecycleNextActionV1 = z.infer<typeof bookingLifecycleNextActionV1>

const bookingStatusAfterCommitV1 = z.enum(["confirmed"])

const bookingLifecycleOriginalCommitOutcomeV1 = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("committed"),
    nextAction: z.literal("none"),
    booking: z.object({ id: z.string().min(1), status: bookingStatusAfterCommitV1 }),
    allocationIds: z.array(z.string().min(1)),
    consumedSessionId: z.string().min(1),
    consumedQuoteId: z.string().min(1),
    convertedHoldId: z.string().min(1).optional(),
    supplierOperationId: z.string().min(1).optional(),
    operatorBackedRiskAccepted: z.boolean().optional(),
  }),
  z.object({
    kind: z.literal("component_bookings_committed"),
    nextAction: z.literal("none"),
    bookings: z
      .array(
        z.object({
          componentId: z.string().min(1),
          bookingId: z.string().min(1),
          status: bookingStatusAfterCommitV1,
          allocationIds: z.array(z.string().min(1)),
          supplierOperationId: z.string().min(1).optional(),
        }),
      )
      .min(1),
    consumedSessionId: z.string().min(1),
    consumedQuoteId: z.string().min(1),
    convertedHoldId: z.string().min(1).optional(),
  }),
  z.object({
    kind: z.literal("component_commit_pending"),
    nextAction: z.literal("continue_component_commit"),
    components: z.array(
      z.object({
        componentId: z.string().min(1),
        state: z.enum([
          "booking_confirmed",
          "supplier_pending",
          "supplier_in_doubt",
          "manual_confirmation_required",
        ]),
        bookingId: z.string().min(1).optional(),
        supplierOperationId: z.string().min(1).optional(),
      }),
    ),
  }),
  z.object({
    kind: z.literal("payment_required"),
    nextAction: z.literal("establish_payment_guarantee"),
    paymentTarget: z.enum(["booking_session", "quote", "supplier_operation"]),
    allowedGuarantees: z.array(z.enum(["deposit", "pre_auth", "card_on_file", "agency_letter"])),
    paymentSession: z.object({
      id: z.string().min(1),
      status: z.enum([
        "pending",
        "requires_redirect",
        "processing",
        "authorized",
        "paid",
        "failed",
        "cancelled",
        "expired",
      ]),
      amountCents: z.number().int().positive(),
      currency: z.string().length(3),
      /**
       * The redirect arm's flattened projection, kept so every client that
       * reads a URL keeps reading one. `null` for an embedded handoff — there
       * is nowhere to send the shopper — which is why it cannot be the only
       * handoff field here.
       */
      redirectUrl: z.string().url().nullable(),
      /**
       * The handoff the adapter actually produced, whole.
       *
       * Without it a storefront could ask for `embedded` at Commit, have the
       * preference honoured all the way to the adapter, and then be handed a
       * `payment_required` with a null URL and no client secret — the token
       * dying between the adapter and the only outcome the storefront reads.
       * The request half and this half are one change (voyant#4346).
       *
       * `null` when no handoff was produced (an already-established payment, or
       * an adapter that has not been asked yet).
       */
      checkout: bookingPaymentCheckoutV1.nullable(),
      expiresAt: z.string().datetime().nullable(),
    }),
  }),
  z.object({
    kind: z.literal("supplier_pending"),
    nextAction: z.enum(["persist_and_dispatch_supplier_operation", "await_supplier_operation"]),
    supplierOperationId: z.string().min(1),
    bookingId: z.string().min(1).optional(),
    operatorBackedRiskAccepted: z.boolean().default(false),
  }),
  z.object({
    kind: z.literal("supplier_in_doubt"),
    nextAction: z.literal("reconcile_supplier_operation"),
    supplierOperationId: z.string().min(1),
    bookingId: z.string().min(1).optional(),
    operatorBackedRiskAccepted: z.boolean(),
  }),
  z.object({
    kind: z.literal("supplier_failed"),
    nextAction: z.enum(["select_alternative_inventory", "manual_review"]),
    supplierOperationId: z.string().min(1),
    bookingId: z.string().min(1).optional(),
    operatorBackedRiskAccepted: z.boolean().default(false),
  }),
  z.object({
    kind: z.literal("revision_mismatch"),
    nextAction: z.literal("refresh_session_state"),
    expectedRevision: z.number().int().positive(),
    actualRevision: z.number().int().positive(),
  }),
  z.object({
    kind: z.literal("quote_failure"),
    nextAction: z.literal("request_fresh_quote"),
    reason: z.enum(["expired", "superseded", "mismatched_session", "mismatched_revision"]),
  }),
  z.object({
    kind: z.literal("hold_failure"),
    nextAction: z.literal("request_new_hold"),
    reason: z.enum(["missing", "expired", "released", "mismatched_session"]),
  }),
  z.object({
    kind: z.literal("proposal_acceptance_required"),
    nextAction: z.literal("renew_proposal_version_acceptance"),
    proposalVersionId: z.string().min(1),
  }),
])

export const bookingLifecycleCommitOutcomeV1 = z.union([
  bookingLifecycleOriginalCommitOutcomeV1,
  z.object({
    kind: z.literal("idempotent_replay"),
    nextAction: z.literal("return_idempotent_result"),
    originalCommitId: z.string().min(1),
    originalOutcome: bookingLifecycleOriginalCommitOutcomeV1,
  }),
])
export type BookingLifecycleCommitOutcomeV1 = z.infer<typeof bookingLifecycleCommitOutcomeV1>

export const bookingLifecycleCommitOutcomeKindV1 = z.enum([
  "committed",
  "component_bookings_committed",
  "component_commit_pending",
  "payment_required",
  "supplier_pending",
  "supplier_in_doubt",
  "supplier_failed",
  "revision_mismatch",
  "quote_failure",
  "hold_failure",
  "proposal_acceptance_required",
  "idempotent_replay",
])
export type BookingLifecycleCommitOutcomeKindV1 = z.infer<
  typeof bookingLifecycleCommitOutcomeKindV1
>

export const bookingLifecycleEffectObservationV1 = z.object({
  bookingCreated: z.boolean().default(false),
  allocationCreated: z.boolean().default(false),
  holdConverted: z.boolean().default(false),
  sessionConsumed: z.boolean().default(false),
  quoteConsumed: z.boolean().default(false),
  supplierOperationPersisted: z.boolean().default(false),
  supplierDispatched: z.boolean().default(false),
  paymentGuaranteeEstablished: z.boolean().default(false),
  bookingCreatedBeforeSupplierSecured: z.boolean().default(false),
  financeStatePromotedToBookingStatus: z.boolean().default(false),
  transactionBoundary: z.enum(["none", "single", "multiple"]).default("none"),
})
export type BookingLifecycleEffectObservationV1 = z.infer<
  typeof bookingLifecycleEffectObservationV1
>

export const bookingLifecycleObservationV1 = z.object({
  outcome: bookingLifecycleCommitOutcomeV1,
  effects: bookingLifecycleEffectObservationV1,
})
export type BookingLifecycleObservationV1 = z.infer<typeof bookingLifecycleObservationV1>

export const bookingLifecycleExpectedObservationV1 = z.object({
  outcomeKind: bookingLifecycleCommitOutcomeKindV1,
  nextAction: bookingLifecycleNextActionV1,
  effects: z.object({
    bookingCreated: z.boolean().optional(),
    allocationCreated: z.boolean().optional(),
    holdConverted: z.boolean().optional(),
    sessionConsumed: z.boolean().optional(),
    quoteConsumed: z.boolean().optional(),
    supplierOperationPersisted: z.boolean().optional(),
    supplierDispatched: z.boolean().optional(),
    paymentGuaranteeEstablished: z.boolean().optional(),
    bookingCreatedBeforeSupplierSecured: z.boolean().optional(),
    financeStatePromotedToBookingStatus: z.boolean().optional(),
    transactionBoundary: z.enum(["none", "single", "multiple"]).optional(),
  }),
})
export type BookingLifecycleExpectedObservationV1 = z.infer<
  typeof bookingLifecycleExpectedObservationV1
>

export const bookingLifecycleConformanceScenarioV1 = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  decision: z.string().min(1),
  input: bookingLifecycleCommitInputV1,
  expected: bookingLifecycleExpectedObservationV1,
})
export type BookingLifecycleConformanceScenarioV1 = z.infer<
  typeof bookingLifecycleConformanceScenarioV1
>

export interface BookingLifecycleConformanceHarnessV1 {
  commit(
    input: BookingLifecycleCommitInputV1,
    scenario: BookingLifecycleConformanceScenarioV1,
  ): BookingLifecycleObservationV1 | Promise<BookingLifecycleObservationV1>
}

export interface BookingLifecycleConformanceResultV1 {
  scenarioId: string
  passed: boolean
  error?: unknown
}

export async function runBookingLifecycleConformanceV1(
  harness: BookingLifecycleConformanceHarnessV1,
  scenarios: readonly BookingLifecycleConformanceScenarioV1[] = bookingLifecycleConformanceScenariosV1,
): Promise<BookingLifecycleConformanceResultV1[]> {
  const results: BookingLifecycleConformanceResultV1[] = []

  for (const scenario of scenarios) {
    try {
      const parsedScenario = bookingLifecycleConformanceScenarioV1.parse(scenario)
      const observation = bookingLifecycleObservationV1.parse(
        await harness.commit(parsedScenario.input, parsedScenario),
      )
      assertScenarioObservation(parsedScenario, observation)
      results.push({ scenarioId: parsedScenario.id, passed: true })
    } catch (error) {
      results.push({ scenarioId: scenario.id, passed: false, error })
    }
  }

  return results
}

export async function assertBookingLifecycleConformanceV1(
  harness: BookingLifecycleConformanceHarnessV1,
  scenarios: readonly BookingLifecycleConformanceScenarioV1[] = bookingLifecycleConformanceScenariosV1,
): Promise<BookingLifecycleConformanceResultV1[]> {
  const results = await runBookingLifecycleConformanceV1(harness, scenarios)
  const failures = results.filter((result) => !result.passed)

  if (failures.length > 0) {
    throw new AggregateError(
      failures.map((failure) => failure.error),
      [
        `Booking lifecycle conformance failed for ${failures.length} scenario(s): ${failures
          .map((failure) => failure.scenarioId)
          .join(", ")}`,
        ...failures.map(
          (failure) =>
            `- ${failure.scenarioId}: ${formatConformanceError(failure.scenarioId, failure.error)}`,
        ),
      ].join("\n"),
    )
  }

  return results
}

function formatConformanceError(scenarioId: string, error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  const scenarioPrefix = `${scenarioId}: `
  return message.startsWith(scenarioPrefix) ? message.slice(scenarioPrefix.length) : message
}

function assertScenarioObservation(
  scenario: BookingLifecycleConformanceScenarioV1,
  observation: BookingLifecycleObservationV1,
): void {
  if (observation.outcome.kind !== scenario.expected.outcomeKind) {
    throw new Error(
      `${scenario.id}: expected outcome ${scenario.expected.outcomeKind}, got ${observation.outcome.kind}`,
    )
  }
  if (observation.outcome.nextAction !== scenario.expected.nextAction) {
    throw new Error(
      `${scenario.id}: expected next action ${scenario.expected.nextAction}, got ${observation.outcome.nextAction}`,
    )
  }

  if (observation.effects.supplierDispatched) {
    if (!observation.effects.supplierOperationPersisted) {
      throw new Error(
        `${scenario.id}: supplier dispatch requires persisted supplier operation intent`,
      )
    }
    if (!scenario.input.supplier.operationId) {
      throw new Error(`${scenario.id}: supplier dispatch requires input supplier operationId`)
    }
    if (!scenario.input.supplier.intentPersistedBeforeDispatch) {
      throw new Error(
        `${scenario.id}: supplier dispatch requires input supplier intent persisted before dispatch`,
      )
    }
  }

  for (const [name, expected] of Object.entries(scenario.expected.effects)) {
    const actual = observation.effects[name as keyof BookingLifecycleEffectObservationV1]
    if (actual !== expected) {
      throw new Error(`${scenario.id}: expected effect ${name}=${expected}, got ${actual}`)
    }
  }

  if (observation.effects.financeStatePromotedToBookingStatus) {
    throw new Error(`${scenario.id}: Finance state must not become Booking status`)
  }

  if (
    (observation.outcome.kind === "payment_required" ||
      observation.outcome.kind === "revision_mismatch" ||
      observation.outcome.kind === "quote_failure" ||
      observation.outcome.kind === "hold_failure" ||
      observation.outcome.kind === "proposal_acceptance_required") &&
    observation.effects.bookingCreated
  ) {
    throw new Error(`${scenario.id}: ${observation.outcome.kind} must not create a Booking`)
  }

  if (
    scenario.input.policy.kind === "sourced_supplier_first" &&
    scenario.input.supplier.state !== "secured" &&
    observation.effects.bookingCreated
  ) {
    throw new Error(
      `${scenario.id}: supplier-first policy created a Booking before supplier security`,
    )
  }

  if (
    observation.effects.bookingCreatedBeforeSupplierSecured &&
    scenario.input.policy.kind !== "operator_backed_commit"
  ) {
    throw new Error(
      `${scenario.id}: only operator-backed policy may create a Booking before supplier security`,
    )
  }

  if (observation.effects.bookingCreatedBeforeSupplierSecured) {
    if (!observation.effects.bookingCreated) {
      throw new Error(`${scenario.id}: bookingCreatedBeforeSupplierSecured requires bookingCreated`)
    }
    if (
      !scenario.input.policy.allowBookingBeforeSupplierSecured ||
      !scenario.input.policy.operatorBackedRiskAccepted
    ) {
      throw new Error(
        `${scenario.id}: early Booking requires explicit operator-backed policy risk acceptance`,
      )
    }
    if (!outcomeOperatorBackedRiskAccepted(observation.outcome)) {
      throw new Error(
        `${scenario.id}: early Booking requires outcome operator-backed risk acceptance`,
      )
    }
    if (!outcomeBookingId(observation.outcome)) {
      throw new Error(`${scenario.id}: early Booking outcome requires bookingId`)
    }
  }

  if (observation.effects.bookingCreated) {
    if (!observation.effects.sessionConsumed || !observation.effects.quoteConsumed) {
      throw new Error(`${scenario.id}: created Booking must consume Session and Quote`)
    }
  }

  assertRequirementsEnforced(scenario, observation)

  if (observation.outcome.kind === "committed") {
    if (
      scenario.input.policy.paymentGuarantee === "required_before_commit" &&
      scenario.input.paymentGuarantee !== "established"
    ) {
      throw new Error(
        `${scenario.id}: required-before-commit policy cannot commit without an established payment guarantee`,
      )
    }
    if (
      scenario.input.policy.paymentGuarantee === "pay_later_authorized" &&
      scenario.input.paymentGuarantee === "post_commit_authorized" &&
      observation.effects.paymentGuaranteeEstablished
    ) {
      throw new Error(
        `${scenario.id}: pay-later commit must not report a pre-commit payment guarantee`,
      )
    }
    if (
      scenario.input.policy.paymentGuarantee === "not_required" &&
      observation.effects.paymentGuaranteeEstablished
    ) {
      throw new Error(
        `${scenario.id}: payment guarantee cannot be established when policy says not_required`,
      )
    }
  }

  if (
    scenario.input.policy.kind === "owned_atomic_commit" &&
    observation.outcome.kind === "committed"
  ) {
    const requiredEffects: Array<keyof BookingLifecycleEffectObservationV1> = [
      "bookingCreated",
      "allocationCreated",
      "sessionConsumed",
      "quoteConsumed",
    ]
    if (scenario.input.hold.required) requiredEffects.push("holdConverted")
    if (scenario.input.policy.paymentGuarantee === "required_before_commit") {
      requiredEffects.push("paymentGuaranteeEstablished")
    }
    for (const effect of requiredEffects) {
      if (!observation.effects[effect]) {
        throw new Error(`${scenario.id}: owned atomic Commit did not observe ${effect}`)
      }
    }
    if (observation.effects.transactionBoundary !== "single") {
      throw new Error(`${scenario.id}: owned atomic Commit must run in one transaction`)
    }
  }
}

/**
 * Hold a vertical to the Booking Requirements it published.
 *
 * Two rules, both aimed at the voyant#4113 failure — a descriptor and a
 * commit derivation that disagree, quietly:
 *
 *  1. A selection that satisfies the published requirements must commit when
 *     nothing else stands in the way. A vertical that withholds a Booking on
 *     grounds the descriptor never expressed has a rule its host cannot see.
 *  2. A selection that does not satisfy them must not produce a Booking, an
 *     Allocation, or a supplier operation. Enforcement that runs after the
 *     side effects is not enforcement.
 *
 * Plus the precondition both depend on: every entry the descriptor marks
 * required must be something the validator actually checks. A requirement
 * nothing checks is the advisory state this phase removes.
 */
function assertRequirementsEnforced(
  scenario: BookingLifecycleConformanceScenarioV1,
  observation: BookingLifecycleObservationV1,
): void {
  const declared = scenario.input.requirements
  if (!declared) return
  assertRequirementsCheckable(scenario.id, declared.published)

  const unsatisfied = validateSelectionAgainstRequirements(declared.published, declared.selection)
  if (unsatisfied.length > 0) {
    const effects = observation.effects
    if (
      effects.bookingCreated ||
      effects.allocationCreated ||
      effects.supplierOperationPersisted ||
      effects.supplierDispatched
    ) {
      throw new Error(
        `${scenario.id}: a selection that does not satisfy the published requirements (${unsatisfied
          .map((entry) => `${entry.requirementKey}:${entry.reason}`)
          .join(", ")}) must not create a Booking, Allocation, or supplier operation`,
      )
    }
    return
  }

  if (!commitPathIsOtherwiseClear(scenario.input)) return
  if (
    observation.outcome.kind !== "committed" &&
    observation.outcome.kind !== "component_bookings_committed"
  ) {
    throw new Error(
      `${scenario.id}: a selection satisfying the published requirements must commit on an otherwise clear path, got ${observation.outcome.kind}`,
    )
  }
}

/** Nothing outside the selection is blocking this Commit. */
function commitPathIsOtherwiseClear(input: BookingLifecycleCommitInputV1): boolean {
  return (
    input.session.state === "active" &&
    input.session.expectedRevision === input.session.revision &&
    input.quote.state === "fresh" &&
    (input.hold.required ? input.hold.state === "live" : input.hold.state !== "expired") &&
    (input.paymentGuarantee === "established" ||
      input.paymentGuarantee === "not_required" ||
      input.paymentGuarantee === "post_commit_authorized") &&
    (input.supplier.state === "secured" || input.supplier.state === "not_applicable") &&
    !input.proposalAcceptance &&
    !input.replayOfCommitId
  )
}

/**
 * Every required entry in the descriptor must be nameable by the validator.
 *
 * Probes rather than trusting the walk: an empty selection with one blank
 * traveler per declared band must be reported as missing everything the
 * descriptor marks required, and each cross-band dependency must fire against
 * counts that break it. A descriptor entry no probe can surface is a
 * requirement the server publishes and never enforces.
 */
function assertRequirementsCheckable(
  scenarioId: string,
  requirements: BookingRequirementsV1,
): void {
  const probe = {
    travelers: requirements.paxBands.map((band) => ({ band: band.code })),
  }
  const unsatisfiable = unsatisfiableRequiredRequirementsV1(requirements)
  if (unsatisfiable.length > 0) {
    // Checkable is not the same as satisfiable. The Booking Session projects a
    // traveler down to a fixed set of fields, so a descriptor marking anything
    // outside it required publishes a demand the buyer can never meet — the
    // shape of voyant#4113, arriving through the enforcement added to stop it.
    throw new Error(
      `${scenarioId}: ${unsatisfiable
        .map((entry) => entry.requirementKey)
        .join(", ")} marked required but the Booking Session cannot carry it`,
    )
  }

  const named = new Set(
    validateSelectionAgainstRequirements(requirements, probe).map((entry) => entry.requirementKey),
  )
  for (const key of requiredRequirementKeysV1(requirements)) {
    const covered = [...named].some((name) => name === key || name.startsWith(`${key}.`))
    if (!covered) {
      throw new Error(
        `${scenarioId}: requirement ${key} is marked required but nothing validates it`,
      )
    }
  }
  for (const dependency of requirements.paxBandDependencies ?? []) {
    const pax: Record<string, number> = {
      [dependency.dependentCode]: breakingDependentCount(dependency),
    }
    if (dependency.type === "excludes") pax[dependency.masterCode] = 1
    const violated = validateSelectionAgainstRequirements(requirements, { configure: { pax } })
    const key = `paxBandDependencies.${dependency.type}.${dependency.dependentCode}.${dependency.masterCode}`
    if (!violated.some((entry) => entry.requirementKey === key)) {
      throw new Error(
        `${scenarioId}: pax band dependency ${key} is declared but nothing validates it`,
      )
    }
  }
}

/** The smallest dependent count that breaks a dependency with no master present. */
function breakingDependentCount(dependency: PaxBandDependencyV1): number {
  if (dependency.type === "limits_sum") return (dependency.maxDependentSum ?? 0) + 1
  return 1
}

function outcomeBookingId(outcome: BookingLifecycleCommitOutcomeV1): string | undefined {
  if (outcome.kind === "committed") return outcome.booking.id
  if (outcome.kind === "component_bookings_committed") return outcome.bookings[0]?.bookingId
  if (
    outcome.kind === "supplier_pending" ||
    outcome.kind === "supplier_in_doubt" ||
    outcome.kind === "supplier_failed"
  ) {
    return outcome.bookingId
  }
  if (outcome.kind === "idempotent_replay") return outcomeBookingId(outcome.originalOutcome)
  return undefined
}

function outcomeOperatorBackedRiskAccepted(outcome: BookingLifecycleCommitOutcomeV1): boolean {
  if (
    outcome.kind === "committed" ||
    outcome.kind === "supplier_pending" ||
    outcome.kind === "supplier_in_doubt" ||
    outcome.kind === "supplier_failed"
  ) {
    return outcome.operatorBackedRiskAccepted === true
  }
  if (outcome.kind === "idempotent_replay") {
    return outcomeOperatorBackedRiskAccepted(outcome.originalOutcome)
  }
  return false
}
