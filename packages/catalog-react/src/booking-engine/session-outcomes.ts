/**
 * Reading a `bookingSessionOutcomeV1` without throwing the shape away.
 *
 * Every v1 Session route answers 200 with one discriminated union: the happy
 * kinds (`session_created`, `quote_created`, `hold_created`, `commit_result`, …)
 * and `rejected` carrying a `bookingSessionLifecycleErrorV1`. A client that
 * collapses that union into `throw new Error(message)` destroys the only
 * machine-readable thing the server sent — most visibly
 * `selection_incomplete.unsatisfied[]`, which names every declared requirement
 * the buyer still has to answer. A host renders that list. It cannot render a
 * sentence.
 *
 * So the rule in this package: transport failures throw, and lifecycle
 * outcomes are returned. The helpers here are the typed readers a caller
 * branches on.
 */

import type {
  BookingLifecycleCommitOutcomeV1,
  BookingLifecycleNextActionV1,
} from "@voyant-travel/catalog-contracts/booking-engine/lifecycle-conformance"
import type { UnsatisfiedRequirementV1 } from "@voyant-travel/catalog-contracts/booking-engine/requirements-validation"
import type {
  BookingSessionLifecycleErrorV1,
  BookingSessionOutcomeV1,
  BookingSessionRecordV1,
  BookingSessionViewV1,
} from "@voyant-travel/catalog-contracts/booking-engine/session-contracts"

export type BookingSessionOutcomeKind = BookingSessionOutcomeV1["kind"]

export type BookingSessionOutcomeOf<K extends BookingSessionOutcomeKind> = Extract<
  BookingSessionOutcomeV1,
  { kind: K }
>

/** Narrow an outcome to one kind, or `null` when it is something else. */
export function bookingSessionOutcomeOf<K extends BookingSessionOutcomeKind>(
  outcome: BookingSessionOutcomeV1 | null | undefined,
  kind: K,
): BookingSessionOutcomeOf<K> | null {
  return outcome?.kind === kind ? (outcome as BookingSessionOutcomeOf<K>) : null
}

/** The lifecycle error a `rejected` outcome carries, or `null`. */
export function bookingSessionRejection(
  outcome: BookingSessionOutcomeV1 | null | undefined,
): BookingSessionLifecycleErrorV1 | null {
  return outcome?.kind === "rejected" ? outcome.error : null
}

/**
 * The list of declared requirements the selection still misses.
 *
 * This is the reason typed outcomes exist. `selection_incomplete` is
 * recoverable and complete — it names every unsatisfied requirement in one
 * response so a host can fix all of them in one pass — and a client that
 * flattened it to a string would force a round-trip per field.
 */
export function unsatisfiedBookingRequirements(
  outcome: BookingSessionOutcomeV1 | null | undefined,
): UnsatisfiedRequirementV1[] | null {
  const error = bookingSessionRejection(outcome)
  return error?.kind === "selection_incomplete" ? error.unsatisfied : null
}

/**
 * The commit outcome a `commit_result` carries, with `idempotent_replay`
 * already unwrapped to the outcome it replays.
 *
 * A replay is the *same* answer the first Commit gave, so every reader that
 * branches on the outcome wants the original — a caller that branched on
 * `idempotent_replay` itself would have to unwrap it again to learn anything.
 */
export function bookingSessionCommitOutcome(
  outcome: BookingSessionOutcomeV1 | null | undefined,
): BookingLifecycleCommitOutcomeV1 | null {
  if (outcome?.kind !== "commit_result") return null
  return outcome.outcome.kind === "idempotent_replay"
    ? outcome.outcome.originalOutcome
    : outcome.outcome
}

/**
 * Every instruction either envelope can carry. Derived from both contracts
 * rather than restated, because the two sets only overlap — `contact_operator`
 * exists only on a rejection and `continue_component_commit` only on a Commit.
 */
export type BookingSessionNextActionV1 =
  | BookingLifecycleNextActionV1
  | Extract<BookingSessionLifecycleErrorV1, { nextAction: string }>["nextAction"]

/**
 * The machine-readable instruction the server attached to this outcome, or
 * `null` when it attached none.
 *
 * Reporting a failure and discarding its `nextAction` is what made a failed
 * Commit unactionable (voyant#4662): the server said `request_fresh_quote`,
 * and the only thing that reached the operator was a sentence with no cause
 * and no remedy. Hosts that can follow the instruction should read it here;
 * `bookingSessionRecoveryV1` below is the coarse classification for hosts that
 * only render one message per remedy.
 */
export function bookingSessionNextActionV1(
  outcome: BookingSessionOutcomeV1 | null | undefined,
): BookingSessionNextActionV1 | null {
  const commit = bookingSessionCommitOutcome(outcome)
  if (commit) return commit.nextAction
  const error = bookingSessionRejection(outcome)
  return error && "nextAction" in error ? error.nextAction : null
}

/**
 * The next actions that condemn a stored `BookingSessionJourneyContinuation`:
 * the Quote, the Hold or the revision it pins is gone, so committing it again
 * can only fail the same way.
 *
 * Everything else is excluded on purpose. `return_idempotent_result`,
 * `await_payment_outcome` and the supplier actions all mean the Commit may
 * have landed, and the continuation is the only thing that can retrieve its
 * result under the original idempotency key — discarding it there would mint a
 * second booking.
 */
const CONTINUATION_KILLING_NEXT_ACTIONS = new Set<BookingSessionNextActionV1>([
  "request_fresh_quote",
  "request_new_hold",
  "request_hold_for_expected_quantity",
  "refresh_session_state",
])

/**
 * Whether a host holding a continuation for this outcome must throw it away
 * and re-run Create → Quote → Hold before committing again.
 *
 * This is the actionable half of a failed Commit. A host that reports
 * `quote_failure` but keeps its continuation resubmits the same superseded
 * Quote on every retry, so the operator sees the same failure however many
 * times they press the button (voyant#4662).
 */
export function bookingSessionContinuationIsStale(
  outcome: BookingSessionOutcomeV1 | null | undefined,
): boolean {
  const nextAction = bookingSessionNextActionV1(outcome)
  return nextAction !== null && CONTINUATION_KILLING_NEXT_ACTIONS.has(nextAction)
}

/** The Session record or redacted view an outcome carries, when it carries one. */
export function bookingSessionOf(
  outcome: BookingSessionOutcomeV1 | null | undefined,
): BookingSessionRecordV1 | BookingSessionViewV1 | null {
  if (!outcome) return null
  return "session" in outcome ? outcome.session : null
}

/**
 * Coarse recovery classes, for hosts that need one branch per remedy rather
 * than one per error kind. Deliberately a *second* reading of the outcome and
 * never a replacement for it: the error itself stays on
 * `BookingSessionJourneyError.error` so a host that wants
 * `unsatisfied[]` — or `revision_conflict.actualRevision` — can still reach it.
 */
export type BookingSessionRecoveryV1 =
  | "revisionConflict"
  | "quoteChanged"
  | "availabilityChanged"
  | "quoteUnavailable"
  | "selectionIncomplete"
  | "requirementsChanged"
  | "commitRejected"
  | "commitInFlight"
  | "alreadyCommitted"
  | "supplierUnavailable"
  | "proposalAcceptanceRequired"
  | "notAuthorized"
  | "unknown"

/**
 * `unknown` is for a shape this build does not know — a newer server, nothing
 * else. Every kind either contract declares is answered explicitly below, even
 * when the honest answer is that there is no remedy to name, so the switches
 * are exhaustive and a kind added to a contract fails the build here rather
 * than falling silently into the fallback. That silence is how voyant#4662
 * survived: a fully-structured `quote_failure` rendered as "the Booking
 * Session rejected this request".
 */
function unrecognisedOutcome(kind: unknown, discriminator: string): BookingSessionRecoveryV1 {
  // Read through `globalThis` because this package runs in a browser, where a
  // bare `process` is a ReferenceError unless the bundler defined it.
  const nodeEnv = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process
    ?.env?.NODE_ENV
  if (nodeEnv !== "production") {
    console.warn(
      `[booking-session] no recovery class for ${discriminator} "${String(kind)}"; falling back to "unknown". ` +
        "Map it in bookingSessionRecoveryV1 rather than letting the host render the generic message.",
    )
  }
  return "unknown"
}

export function bookingSessionRecoveryV1(
  outcome: BookingSessionOutcomeV1,
): BookingSessionRecoveryV1 {
  const commit = bookingSessionCommitOutcome(outcome)
  if (commit) return commitOutcomeRecovery(commit)
  // Any other kind is a *successful* outcome of a kind the caller did not
  // expect — `expectBookingSessionOutcome` asking for `quote_created` and
  // getting `session_updated`. Nothing failed, so there is no remedy to name.
  if (outcome.kind !== "rejected") return "unknown"
  switch (outcome.error.kind) {
    case "revision_conflict":
      return "revisionConflict"
    case "quote_expired":
    case "quote_superseded":
    case "quote_required":
      return "quoteChanged"
    case "hold_expired":
    case "hold_required":
    case "availability_changed":
      return "availabilityChanged"
    case "quote_unavailable":
      return "quoteUnavailable"
    case "selection_incomplete":
      return "selectionIncomplete"
    case "requirements_changed":
      return "requirementsChanged"
    case "commit_rejected":
      return "commitRejected"
    /**
     * Money or a supplier operation is already moving. These must not read as
     * "try again": a storefront that re-quoted a Session with a payment in
     * flight released the Hold seconds before the money landed (voyant#4636).
     */
    case "payment_in_flight":
    case "supplier_operation_active":
      return "commitInFlight"
    /**
     * Terminal, not in flight. The server reaches this only after looking for
     * a commit under *this* caller's idempotency key and finding none, so the
     * Session was consumed by some other attempt: there is no result to wait
     * for and no result this continuation can retrieve. The remedy is to go
     * find the booking that already exists.
     */
    case "commit_already_consumed":
      return "alreadyCommitted"
    case "not_authorized":
    case "capability_required":
    case "capability_scope_required":
      return "notAuthorized"
    /**
     * Declared, and deliberately unclassified: the remedy is to start over or
     * to change the request itself, which is not one of the recovery classes a
     * host branches on. Listed so the exhaustiveness check below stays honest.
     */
    case "session_expired":
    case "session_consumed":
    case "renewal_not_allowed":
    case "idempotency_conflict":
    case "invalid_selection":
    case "checkout_intent_not_offered":
    case "hold_quantity_mismatch":
      return "unknown"
    default: {
      const unhandled: never = outcome.error
      return unrecognisedOutcome((unhandled as { kind?: unknown }).kind, "lifecycle error")
    }
  }
}

/**
 * The Commit envelope, which is not a rejection and never reached the switch
 * above (voyant#4662). A failed Commit answers `commit_result` carrying a
 * `quote_failure` or `hold_failure` — the same conditions the `rejected`
 * envelope already classified, arriving by a different door.
 */
function commitOutcomeRecovery(outcome: BookingLifecycleCommitOutcomeV1): BookingSessionRecoveryV1 {
  switch (outcome.kind) {
    case "revision_mismatch":
      return "revisionConflict"
    case "quote_failure":
      return "quoteChanged"
    case "hold_failure":
      return "availabilityChanged"
    /**
     * The commit is underway at a supplier. Telling an operator it was
     * rejected invites the resubmit that books twice; the remedy is to wait
     * for or reconcile the operation.
     */
    case "supplier_pending":
    case "supplier_in_doubt":
    case "component_commit_pending":
      return "commitInFlight"
    case "supplier_failed":
      return "supplierUnavailable"
    case "proposal_acceptance_required":
      return "proposalAcceptanceRequired"
    /**
     * Successes. A caller only classifies these if it could not read the
     * result it was handed — the journey helper cannot express a multi-booking
     * commit — and there is nothing to recover from, so there is no class.
     */
    case "committed":
    case "component_bookings_committed":
    case "payment_required":
      return "unknown"
    /**
     * Unwrapped before the switch by `bookingSessionCommitOutcome`; the case
     * exists so the exhaustiveness check covers the whole union.
     */
    case "idempotent_replay":
      return commitOutcomeRecovery(outcome.originalOutcome)
    default: {
      const unhandled: never = outcome
      return unrecognisedOutcome((unhandled as { kind?: unknown }).kind, "commit outcome")
    }
  }
}

/**
 * Thrown only by the choreographed journey helper, which cannot return a
 * partial result mid-sequence. It carries the whole outcome, the lifecycle
 * error, the failed Commit's outcome, the instruction the server attached, the
 * coarse recovery class, and — when the rejection was `selection_incomplete` —
 * the `unsatisfied[]` list, so nothing the server said is lost on the way to
 * the catch block.
 */
export class BookingSessionJourneyError extends Error {
  readonly recovery: BookingSessionRecoveryV1
  readonly error: BookingSessionLifecycleErrorV1 | null
  /** The Commit outcome, when Commit is what failed. `idempotent_replay` unwrapped. */
  readonly commitOutcome: BookingLifecycleCommitOutcomeV1 | null
  /** What the server said to do next, whichever envelope carried the failure. */
  readonly nextAction: BookingSessionNextActionV1 | null
  readonly unsatisfied: UnsatisfiedRequirementV1[] | null

  constructor(readonly outcome: BookingSessionOutcomeV1) {
    const recovery = bookingSessionRecoveryV1(outcome)
    super(`booking_session_${recovery}`)
    this.name = "BookingSessionJourneyError"
    this.recovery = recovery
    this.error = bookingSessionRejection(outcome)
    this.commitOutcome = bookingSessionCommitOutcome(outcome)
    this.nextAction = bookingSessionNextActionV1(outcome)
    this.unsatisfied = unsatisfiedBookingRequirements(outcome)
  }
}

/** Narrow-or-throw, for the sequential journey where there is no way to continue. */
export function expectBookingSessionOutcome<K extends BookingSessionOutcomeKind>(
  outcome: BookingSessionOutcomeV1,
  kind: K,
): BookingSessionOutcomeOf<K> {
  const narrowed = bookingSessionOutcomeOf(outcome, kind)
  if (!narrowed) throw new BookingSessionJourneyError(outcome)
  return narrowed
}
