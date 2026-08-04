"use client"

import { useMutation } from "@tanstack/react-query"
import type { BookingLifecycleCommitOutcomeV1 } from "@voyant-travel/catalog-contracts/booking-engine/lifecycle-conformance"
import type {
  BookingSessionLifecycleErrorV1,
  BookingSessionOutcomeV1,
  CommitBookingSessionV1,
} from "@voyant-travel/catalog-contracts/booking-engine/session-contracts"
import { useCallback, useMemo, useState } from "react"

import { bookingSessionIdempotencyKey, commitBookingSession } from "./session-client.js"
import { bookingSessionOutcomeOf, bookingSessionRejection } from "./session-outcomes.js"
import { type BookingJourneyApiOptions, useBookingJourneyApi } from "./use-booking-journey-api.js"

export interface UseCommitBookingSessionOptions extends BookingJourneyApiOptions {
  sessionId: string | null
  revision: number | null
  /** Stable root shared with `useBookingSession` — see its idempotency note. */
  idempotencyRoot: string
}

export interface BookingCommitInput {
  quoteId: string
  /**
   * The `requirementsFingerprint` of the Quote the host actually rendered
   * against. Required, not optional: a Commit that cannot say which descriptor
   * it collected is a Commit nobody can validate.
   */
  requirementsFingerprint: string
  /** Required for owned inventory; sourced targets may commit without a Hold. */
  holdId?: string
  payment?: CommitBookingSessionV1["payment"]
}

export interface UseCommitBookingSession {
  /**
   * The admitted Commit outcome — `committed`, `payment_required`,
   * `supplier_pending`, `idempotent_replay`, … Kept whole; a host branches on
   * it rather than being handed a boolean.
   */
  result: BookingLifecycleCommitOutcomeV1 | null
  outcome: BookingSessionOutcomeV1 | null
  rejection: BookingSessionLifecycleErrorV1 | null
  isPending: boolean
  /** Transport failure only. Lifecycle rejections arrive as outcomes. */
  error: Error | null
  /**
   * The key the next `commit()` will use. Persist it before submitting: it is
   * what lets a lost Commit response be retried without booking twice.
   */
  idempotencyKeyFor: (quoteId: string) => string
  commit: (input: BookingCommitInput) => Promise<BookingSessionOutcomeV1>
}

/**
 * Commit the Session.
 *
 * The key is derived from the Quote being spent — `<root>:commit:<quoteId>` —
 * not minted per click. Commit is the step that takes money, so a retry after
 * a dropped response must present the *same* key and get the original result
 * back as `idempotent_replay`; a fresh random key would create a second
 * booking. The same derivation is what lets a host persist the key up front,
 * via `idempotencyKeyFor`, and finish the Commit after a reload.
 */
export function useCommitBookingSession(
  options: UseCommitBookingSessionOptions,
): UseCommitBookingSession {
  const api = useBookingJourneyApi(options)
  const { sessionId, revision, idempotencyRoot } = options
  const [outcome, setOutcome] = useState<BookingSessionOutcomeV1 | null>(null)

  const idempotencyKeyFor = useCallback(
    (quoteId: string) => bookingSessionIdempotencyKey(idempotencyRoot, "commit", quoteId),
    [idempotencyRoot],
  )

  const mutation = useMutation<BookingSessionOutcomeV1, Error, BookingCommitInput>({
    mutationFn: (input) => {
      if (!sessionId || revision === null) throw new Error("no booking session to commit")
      return commitBookingSession(api, sessionId, {
        expectedRevision: revision,
        quoteId: input.quoteId,
        requirementsFingerprint: input.requirementsFingerprint,
        idempotencyKey: idempotencyKeyFor(input.quoteId),
        ...(input.holdId ? { holdId: input.holdId } : {}),
        ...(input.payment ? { payment: input.payment } : {}),
      })
    },
    onSuccess: setOutcome,
  })
  const commit = mutation.mutateAsync

  return useMemo(
    () => ({
      result: bookingSessionOutcomeOf(outcome, "commit_result")?.outcome ?? null,
      outcome,
      rejection: bookingSessionRejection(outcome),
      isPending: mutation.isPending,
      error: mutation.error ?? null,
      idempotencyKeyFor,
      commit,
    }),
    [commit, idempotencyKeyFor, mutation.error, mutation.isPending, outcome],
  )
}
