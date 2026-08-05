"use client"

import { useMutation, useQuery } from "@tanstack/react-query"
import type { BookingRequirementsV1 } from "@voyant-travel/catalog-contracts/booking-engine/requirements-contracts"
import type {
  BookingQuoteRecordV1,
  BookingSessionLifecycleErrorV1,
  BookingSessionOutcomeV1,
} from "@voyant-travel/catalog-contracts/booking-engine/session-contracts"
import { useCallback, useEffect, useMemo, useState } from "react"

import { useBookingJourneyAnalytics } from "./analytics.js"
import { bookingSessionIdempotencyKey, quoteBookingSession } from "./session-client.js"
import { bookingSessionOutcomeOf, bookingSessionRejection } from "./session-outcomes.js"
import { type BookingJourneyApiOptions, useBookingJourneyApi } from "./use-booking-journey-api.js"

export interface UseBookingQuoteOptions extends BookingJourneyApiOptions {
  sessionId: string | null
  /** The revision to price. The Quote is bound to it, exactly. */
  revision: number | null
  /** Stable root shared with `useBookingSession` — see its idempotency note. */
  idempotencyRoot: string
  /** Debounce window in ms — default 250 (per booking-journey-architecture §5). */
  debounceMs?: number
  /** Disable the automatic quote; the caller drives via `requote()`. */
  enabled?: boolean
}

export interface UseBookingQuote {
  /** The priced Quote, or `null` when this revision could not be priced. */
  data: BookingQuoteRecordV1 | null
  /**
   * The Booking Requirements this price was computed against. Also read off a
   * `quote_unavailable` rejection: a sold-out target must still render a
   * correct wizard so the buyer can change the selection that made it
   * unavailable.
   */
  requirements: BookingRequirementsV1 | null
  /** Echoed back on Commit so a stale descriptor is rejected, not booked. */
  requirementsFingerprint: string | null
  /** The whole outcome, so callers can branch on its `kind`. */
  outcome: BookingSessionOutcomeV1 | null
  rejection: BookingSessionLifecycleErrorV1 | null
  isQuoting: boolean
  /** Covers the debounce window too, so no surface can commit a price it is about to replace. */
  isSettling: boolean
  /** Transport failure only. Lifecycle rejections arrive as outcomes. */
  error: Error | null
  /** Re-price the current revision. `fresh` mints a new key, for an expired Quote. */
  requote: (options?: { fresh?: boolean }) => Promise<BookingSessionOutcomeV1>
}

/**
 * Quote the current Session revision.
 *
 * Four behaviours are carried over from the beta hook this replaces. They
 * encode fixed bugs (voyant#2643), not preferences:
 *
 *  1. **~250ms debounce.** The revision advances once per accepted selection
 *     edit; quoting on every one of them re-prices the wizard mid-keystroke.
 *  2. **`isSettling`.** `isQuoting` only covers an active request. Commit
 *     surfaces must also be blocked during the debounce window, or they can
 *     submit the previous Quote after the selection changed and before the
 *     next request starts.
 *  3. **`placeholderData`.** Each revision is a new query key. Keeping the
 *     previous Quote visible while the next one fetches makes the price swap
 *     in place instead of blanking and flashing the whole step.
 *  4. **Never carry a price across a scope change.** In the beta hook that was
 *     an explicit scope guard on the query key. Here it is structural: a
 *     Session's scope is fixed at create, so a market/currency change *is* a
 *     new Session — and the placeholder is dropped whenever the Session id
 *     changes, so a stale-market price can never be the one confirmed.
 */
export function useBookingQuote(options: UseBookingQuoteOptions): UseBookingQuote {
  const api = useBookingJourneyApi(options)
  const analytics = useBookingJourneyAnalytics()
  const debounceMs = options.debounceMs ?? 250
  const { sessionId, revision, idempotencyRoot } = options
  const surface = options.surface ?? "admin"
  const enabled = options.enabled !== false && Boolean(sessionId) && revision !== null

  const [debouncedRevision, setDebouncedRevision] = useState<number | null>(revision)
  useEffect(() => {
    if (revision === null) {
      setDebouncedRevision(null)
      return
    }
    const timer = setTimeout(() => setDebouncedRevision(revision), debounceMs)
    return () => clearTimeout(timer)
  }, [revision, debounceMs])

  // `attempt` is deliberately NOT advanced by a normal requote: re-asking for
  // the same revision must reuse its key so a retried request cannot mint a
  // second Quote. Only an explicit `requote({ fresh: true })` — the "this Quote
  // expired, get me another" path — advances it.
  const [attempt, setAttempt] = useState(0)

  const runQuote = useCallback(
    async (targetRevision: number, targetAttempt: number) => {
      if (!sessionId) return null
      return quoteBookingSession(api, sessionId, {
        expectedRevision: targetRevision,
        idempotencyKey: bookingSessionIdempotencyKey(
          idempotencyRoot,
          "quote",
          targetRevision,
          targetAttempt || undefined,
        ),
      })
    },
    [api, idempotencyRoot, sessionId],
  )

  const query = useQuery<BookingSessionOutcomeV1 | null>({
    queryKey: ["booking-session-quote", surface, sessionId, debouncedRevision, attempt],
    queryFn: () => (debouncedRevision === null ? null : runQuote(debouncedRevision, attempt)),
    enabled,
    placeholderData: (previous, previousQuery) =>
      previousQuery?.queryKey?.[2] === sessionId ? previous : undefined,
  })

  const requoteMutation = useMutation<BookingSessionOutcomeV1 | null, Error, number>({
    mutationFn: (targetAttempt) =>
      revision === null ? Promise.resolve(null) : runQuote(revision, targetAttempt),
  })
  const requoteMutateAsync = requoteMutation.mutateAsync

  const outcome = query.data ?? null
  const created = bookingSessionOutcomeOf(outcome, "quote_created")
  const rejection = bookingSessionRejection(outcome)

  // Quote validates the selection against the same published requirements the
  // Commit does, so a selection that is short of them is knowable here — one
  // step earlier than the Commit, which is where the buyer actually stalls.
  useEffect(() => {
    if (!sessionId) return
    analytics.reportRejection({ bookingSessionId: sessionId, step: "configure", outcome })
  }, [analytics, outcome, sessionId])

  const requote = useCallback(
    async (requoteOptions?: { fresh?: boolean }) => {
      const nextAttempt = requoteOptions?.fresh ? attempt + 1 : attempt
      if (requoteOptions?.fresh) setAttempt(nextAttempt)
      const next = await requoteMutateAsync(nextAttempt)
      if (!next) throw new Error("no booking session revision to quote")
      return next
    },
    [attempt, requoteMutateAsync],
  )

  return useMemo(
    () => ({
      data: created?.quote ?? null,
      requirements:
        created?.quote.requirements ??
        (rejection?.kind === "quote_unavailable" ? (rejection.requirements ?? null) : null),
      requirementsFingerprint: created?.quote.requirementsFingerprint ?? null,
      outcome,
      rejection,
      isQuoting: query.isFetching || requoteMutation.isPending,
      isSettling: revision !== debouncedRevision || query.isFetching || requoteMutation.isPending,
      error: query.error ?? requoteMutation.error ?? null,
      requote,
    }),
    [
      created,
      debouncedRevision,
      outcome,
      query.error,
      query.isFetching,
      rejection,
      requote,
      requoteMutation.error,
      requoteMutation.isPending,
      revision,
    ],
  )
}
