"use client"

import { useMutation } from "@tanstack/react-query"
import type {
  BookingHoldRecordV1,
  BookingSessionLifecycleErrorV1,
  BookingSessionOutcomeV1,
} from "@voyant-travel/catalog-contracts/booking-engine/session-contracts"
import { useCallback, useMemo, useState } from "react"

import {
  abandonBookingSession,
  bookingSessionIdempotencyKey,
  holdBookingSession,
} from "./session-client.js"
import { bookingSessionOutcomeOf, bookingSessionRejection } from "./session-outcomes.js"
import { type BookingJourneyApiOptions, useBookingJourneyApi } from "./use-booking-journey-api.js"

export interface UseBookingHoldOptions extends BookingJourneyApiOptions {
  sessionId: string | null
  revision: number | null
  /** Stable root shared with `useBookingSession` — see its idempotency note. */
  idempotencyRoot: string
}

export interface PlaceBookingHoldInput {
  /** The Quote the Hold is taken against. A Hold without one holds no price. */
  quoteId: string
  quantity?: number
}

export interface UseBookingHold {
  hold: BookingHoldRecordV1 | null
  outcome: BookingSessionOutcomeV1 | null
  rejection: BookingSessionLifecycleErrorV1 | null
  isPending: boolean
  /** Transport failure only. Lifecycle rejections arrive as outcomes. */
  error: Error | null
  place: (input: PlaceBookingHoldInput) => Promise<BookingSessionOutcomeV1>
  /** Give the capacity back by abandoning the Session — see the note below. */
  release: () => Promise<BookingSessionOutcomeV1>
}

/**
 * Place a real-capacity Hold against a Quote, so a concurrent shopper cannot
 * oversell the inventory between pricing and Commit.
 *
 * `place` keys on `<root>:hold:<revision>:<quoteId>:<quantity>` — retrying the
 * same hold reuses the key, while holding a different quantity or a different
 * Quote does not, so a dropped response cannot double-hold.
 *
 * **`release` abandons the Session.** The v1 surface mounts no hold-release
 * route: the canonical set is create / read / patch / adopt / renew / quote /
 * hold / abandon / commit, and `abandon` is what releases every live Hold the
 * Session holds (expiry covers the rest). Exposing a `release()` that quietly
 * kept the Session alive would be a lie about what the server does, so this
 * one is honest and terminal.
 */
export function useBookingHold(options: UseBookingHoldOptions): UseBookingHold {
  const api = useBookingJourneyApi(options)
  const { sessionId, revision, idempotencyRoot } = options
  const [outcome, setOutcome] = useState<BookingSessionOutcomeV1 | null>(null)

  const mutation = useMutation<
    BookingSessionOutcomeV1,
    Error,
    () => Promise<BookingSessionOutcomeV1>
  >({
    mutationFn: (call) => call(),
    onSuccess: setOutcome,
  })
  const run = mutation.mutateAsync

  const requireSession = useCallback(() => {
    if (!sessionId || revision === null) throw new Error("no booking session to hold against")
    return { sessionId, revision }
  }, [revision, sessionId])

  const place = useCallback(
    (input: PlaceBookingHoldInput) => {
      const current = requireSession()
      const quantity = input.quantity ?? 1
      return run(() =>
        holdBookingSession(api, current.sessionId, {
          expectedRevision: current.revision,
          quoteId: input.quoteId,
          quantity,
          idempotencyKey: bookingSessionIdempotencyKey(
            idempotencyRoot,
            "hold",
            current.revision,
            input.quoteId,
            quantity,
          ),
        }),
      )
    },
    [api, idempotencyRoot, requireSession, run],
  )

  const release = useCallback(() => {
    const current = requireSession()
    return run(() =>
      abandonBookingSession(api, current.sessionId, {
        expectedRevision: current.revision,
        idempotencyKey: bookingSessionIdempotencyKey(idempotencyRoot, "abandon", current.revision),
      }),
    )
  }, [api, idempotencyRoot, requireSession, run])

  return useMemo(
    () => ({
      hold: bookingSessionOutcomeOf(outcome, "hold_created")?.hold ?? null,
      outcome,
      rejection: bookingSessionRejection(outcome),
      isPending: mutation.isPending,
      error: mutation.error ?? null,
      place,
      release,
    }),
    [mutation.error, mutation.isPending, outcome, place, release],
  )
}
