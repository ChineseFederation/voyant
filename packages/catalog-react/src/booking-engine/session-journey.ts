/**
 * Create → Quote → Hold → Commit, once, as shared code.
 *
 * This choreography used to live as a private hand-rolled duplicate inside
 * `@voyant-travel/bookings-react` (`manual-booking-session-client.ts`) — the
 * only code in the repository that spoke v1 Sessions while the shared client
 * still spoke the deleted beta lifecycle. It belongs here: the ordering, the
 * revision fencing, the derived idempotency keys and the continuation that
 * survives a lost Commit response are properties of the Session contract, not
 * of any one host's submit button.
 *
 * The continuation is the load-bearing part. Commit is the step that spends
 * money, so if its response is lost the client must be able to retry *only*
 * Commit, with the same key, against the same Quote and Hold — never re-run
 * the sequence and mint a second booking. `onContinuation` fires before the
 * first Commit attempt precisely so a host can persist it first.
 */

import type { BookingPaymentCheckoutV1 } from "@voyant-travel/catalog-contracts/booking-engine/lifecycle-conformance"
import type {
  BookingSessionScopeV1,
  CommitBookingSessionV1,
  CreateBookingSessionTargetV1,
} from "@voyant-travel/catalog-contracts/booking-engine/session-contracts"

import {
  type BookingSessionApi,
  bookingSessionIdempotencyKey,
  commitBookingSession,
  holdBookingSession,
  openBookingSession,
  quoteBookingSession,
} from "./session-client.js"
import { BookingSessionJourneyError, expectBookingSessionOutcome } from "./session-outcomes.js"

export interface BookingSessionJourneyContinuation {
  sessionId: string
  revision: number
  quoteId: string
  /** The descriptor the Quote was published with; the Commit echoes it back. */
  requirementsFingerprint: string
  holdId: string
  commitIdempotencyKey: string
}

export interface BookingSessionJourneyInput {
  target: CreateBookingSessionTargetV1
  selection?: Record<string, unknown>
  scope?: BookingSessionScopeV1
  /**
   * How much capacity to hold. Omit it and the server holds for the party the
   * `selection` already states — the only number that can be right, and the
   * one the capacity port checks against (voyant#4655). Pass one only when the
   * host genuinely knows better than the selection it just sent.
   */
  quantity?: number
  /**
   * Stable root for every key this journey derives. Must be the same string
   * across retries of the same user action — that is what makes the sequence
   * idempotent. Deriving a fresh one per attempt books twice.
   */
  idempotencyKey: string
  payment?: CommitBookingSessionV1["payment"]
  continuation?: BookingSessionJourneyContinuation
  /** Persisted before Commit so a lost response can be retried idempotently. */
  onContinuation?: (continuation: BookingSessionJourneyContinuation) => void
}

export type BookingSessionJourneyResult =
  | { kind: "committed"; bookingId: string }
  | ({
      kind: "payment_required"
      /** The payment session the guarantee is owed on. */
      paymentSessionId: string
      /**
       * The handoff to render, whole. A storefront that stated
       * `payment.acceptedCheckoutHandoffs: ["embedded", …]` mounts its form
       * from this; `redirectUrl` below is the redirect arm's projection and is
       * `null` for that arm, so it is not enough on its own (voyant#4346).
       */
      checkout: BookingPaymentCheckoutV1 | null
      redirectUrl: string | null
    } & BookingSessionJourneyContinuation)

export async function commitBookingSessionJourneyV1(
  api: BookingSessionApi,
  input: BookingSessionJourneyInput,
): Promise<BookingSessionJourneyResult> {
  if (input.continuation) {
    return commitContinuation(api, input.continuation, input.payment)
  }

  const created = expectBookingSessionOutcome(
    await openBookingSession(api, {
      idempotencyKey: bookingSessionIdempotencyKey(input.idempotencyKey, "create"),
      target: input.target,
      ...(input.selection ? { selection: input.selection } : {}),
      ...(input.scope ? { scope: input.scope } : {}),
    }),
    "session_created",
  )
  const session = created.session

  const quoted = expectBookingSessionOutcome(
    await quoteBookingSession(api, session.id, {
      expectedRevision: session.revision,
      idempotencyKey: bookingSessionIdempotencyKey(input.idempotencyKey, "quote"),
    }),
    "quote_created",
  )

  const held = expectBookingSessionOutcome(
    await holdBookingSession(api, session.id, {
      expectedRevision: session.revision,
      quoteId: quoted.quote.id,
      ...(input.quantity === undefined ? {} : { quantity: input.quantity }),
      idempotencyKey: bookingSessionIdempotencyKey(input.idempotencyKey, "hold"),
    }),
    "hold_created",
  )

  const continuation: BookingSessionJourneyContinuation = {
    sessionId: session.id,
    revision: session.revision,
    quoteId: quoted.quote.id,
    requirementsFingerprint: quoted.quote.requirementsFingerprint,
    holdId: held.hold.id,
    commitIdempotencyKey: bookingSessionIdempotencyKey(input.idempotencyKey, "commit"),
  }
  input.onContinuation?.(continuation)
  return commitContinuation(api, continuation, input.payment)
}

async function commitContinuation(
  api: BookingSessionApi,
  continuation: BookingSessionJourneyContinuation,
  payment?: CommitBookingSessionV1["payment"],
): Promise<BookingSessionJourneyResult> {
  const committed = expectBookingSessionOutcome(
    await commitBookingSession(api, continuation.sessionId, {
      expectedRevision: continuation.revision,
      quoteId: continuation.quoteId,
      requirementsFingerprint: continuation.requirementsFingerprint,
      holdId: continuation.holdId,
      idempotencyKey: continuation.commitIdempotencyKey,
      ...(payment ? { payment } : {}),
    }),
    "commit_result",
  )

  const outcome =
    committed.outcome.kind === "idempotent_replay"
      ? committed.outcome.originalOutcome
      : committed.outcome
  if (outcome.kind === "committed") {
    return { kind: "committed", bookingId: outcome.booking.id }
  }
  if (outcome.kind === "payment_required") {
    return {
      kind: "payment_required",
      ...continuation,
      paymentSessionId: outcome.paymentSession.id,
      checkout: outcome.paymentSession.checkout ?? null,
      redirectUrl: outcome.paymentSession.redirectUrl,
    }
  }
  throw new BookingSessionJourneyError(committed)
}
