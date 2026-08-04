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
  | "notAuthorized"
  | "unknown"

export function bookingSessionRecoveryV1(
  outcome: BookingSessionOutcomeV1,
): BookingSessionRecoveryV1 {
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
    case "not_authorized":
    case "capability_required":
    case "capability_scope_required":
      return "notAuthorized"
    default:
      return "unknown"
  }
}

/**
 * Thrown only by the choreographed journey helper, which cannot return a
 * partial result mid-sequence. It carries the whole outcome, the lifecycle
 * error, the coarse recovery class, and — when the rejection was
 * `selection_incomplete` — the `unsatisfied[]` list, so nothing the server
 * said is lost on the way to the catch block.
 */
export class BookingSessionJourneyError extends Error {
  readonly recovery: BookingSessionRecoveryV1
  readonly error: BookingSessionLifecycleErrorV1 | null
  readonly unsatisfied: UnsatisfiedRequirementV1[] | null

  constructor(readonly outcome: BookingSessionOutcomeV1) {
    const recovery = bookingSessionRecoveryV1(outcome)
    super(`booking_session_${recovery}`)
    this.name = "BookingSessionJourneyError"
    this.recovery = recovery
    this.error = bookingSessionRejection(outcome)
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
