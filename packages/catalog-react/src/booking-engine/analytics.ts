"use client"

import type { UnsatisfiedRequirementV1 } from "@voyant-travel/catalog-contracts/booking-engine/requirements-validation"
import type {
  BookingSessionOutcomeV1,
  CreateBookingSessionTargetV1,
} from "@voyant-travel/catalog-contracts/booking-engine/session-contracts"
import { useVoyantAnalytics } from "@voyant-travel/react"
import { useCallback, useMemo, useRef } from "react"

import { unsatisfiedBookingRequirements } from "./session-outcomes.js"

/**
 * The browser half of the booking-engine funnel.
 *
 * The server knows every lifecycle outcome; what it cannot see is where inside
 * a step the buyer stalled. Two signals only this side can produce:
 *
 *  - **`engine.step.viewed` / `engine.step.completed`** — which wizard step a
 *    buyer reached and how long it took. The step model is the host's (the
 *    Booking Requirements descriptor decides what steps exist), so the hook
 *    takes the step name rather than inventing one.
 *  - **`engine.field.errored`** — the stuck-point signal, and the one worth
 *    the most. It names the specific required field blocking travellers, per
 *    step, which is what turns "conversion dropped at Configure" into "nobody
 *    can supply `traveler.0.passportNumber`".
 *
 * `field` is a requirement *key*, never the value entered against it. The hook
 * has no access to entered values by construction: it reads
 * `selection_incomplete.unsatisfied[]`, which carries keys and reasons only.
 *
 * Every event carries `booking_session_id` so the browser and server halves
 * join into one journey — except `engine.journey.started`, which by definition
 * fires before there is a Session to name.
 */

export interface BookingJourneyAnalytics {
  /**
   * A buyer began a booking journey, before any Session exists.
   *
   * `entryReferrer` is reduced to an origin before it is emitted: a full
   * referrer URL can carry a query string, and a query string can carry
   * anything the previous page put in it.
   */
  journeyStarted(input: {
    target: CreateBookingSessionTargetV1 | { kind: string }
    channel?: string
    entryReferrer?: string
  }): void
  /** A wizard step became visible. Starts the clock `stepCompleted` reads. */
  stepViewed(input: {
    bookingSessionId: string
    step: string
    stepIndex: number
    requirementCount: number
  }): void
  /**
   * A wizard step was left satisfied. `duration_ms` and `retries` are derived
   * from the `stepViewed` calls that preceded it rather than supplied — a host
   * that had to count its own retries would count them differently per host.
   */
  stepCompleted(input: { bookingSessionId: string; step: string }): void
  /** A required field blocked the buyer. */
  fieldErrored(input: {
    bookingSessionId: string
    step: string
    field: string
    errorCode: string
  }): void
  /**
   * Fan a `selection_incomplete` rejection out into one `engine.field.errored`
   * per unsatisfied requirement.
   *
   * This is what makes the stuck-point signal arrive without host cooperation:
   * the server already answers with a complete machine-readable list of what
   * the selection misses, so the client does not have to be instrumented field
   * by field to report it.
   */
  reportRejection(input: {
    bookingSessionId: string
    step: string
    outcome: BookingSessionOutcomeV1 | null | undefined
  }): void
}

interface StepProgress {
  startedAtMs: number
  views: number
}

export function useBookingJourneyAnalytics(): BookingJourneyAnalytics {
  const analytics = useVoyantAnalytics()
  // A ref, not state: recording that a step was viewed must not re-render the
  // step that was viewed.
  const steps = useRef(new Map<string, StepProgress>())

  const journeyStarted = useCallback<BookingJourneyAnalytics["journeyStarted"]>(
    ({ target, channel, entryReferrer }) => {
      analytics.track("engine.journey.started", {
        entry_referrer: referrerOrigin(entryReferrer),
        channel: channel ?? "storefront",
        target_type: target.kind,
      })
    },
    [analytics],
  )

  const stepViewed = useCallback<BookingJourneyAnalytics["stepViewed"]>(
    ({ bookingSessionId, step, stepIndex, requirementCount }) => {
      const key = `${bookingSessionId}:${step}`
      const previous = steps.current.get(key)
      steps.current.set(key, {
        // A re-view of a step the buyer already reached keeps the original
        // start time, so `duration_ms` measures time-to-complete rather than
        // time-since-last-glance.
        startedAtMs: previous?.startedAtMs ?? Date.now(),
        views: (previous?.views ?? 0) + 1,
      })
      analytics.track("engine.step.viewed", {
        booking_session_id: bookingSessionId,
        step,
        step_index: stepIndex,
        requirement_count: requirementCount,
      })
    },
    [analytics],
  )

  const stepCompleted = useCallback<BookingJourneyAnalytics["stepCompleted"]>(
    ({ bookingSessionId, step }) => {
      const key = `${bookingSessionId}:${step}`
      const progress = steps.current.get(key)
      steps.current.delete(key)
      analytics.track("engine.step.completed", {
        booking_session_id: bookingSessionId,
        step,
        duration_ms: progress ? Date.now() - progress.startedAtMs : 0,
        // The first view is not a retry; the ones after it are.
        retries: Math.max(0, (progress?.views ?? 1) - 1),
      })
    },
    [analytics],
  )

  const fieldErrored = useCallback<BookingJourneyAnalytics["fieldErrored"]>(
    ({ bookingSessionId, step, field, errorCode }) => {
      analytics.track("engine.field.errored", {
        booking_session_id: bookingSessionId,
        step,
        field,
        error_code: errorCode,
      })
    },
    [analytics],
  )

  const reportRejection = useCallback<BookingJourneyAnalytics["reportRejection"]>(
    ({ bookingSessionId, step, outcome }) => {
      const unsatisfied: UnsatisfiedRequirementV1[] | null = unsatisfiedBookingRequirements(outcome)
      if (!unsatisfied) return
      for (const requirement of unsatisfied) {
        fieldErrored({
          bookingSessionId,
          step,
          field: requirement.requirementKey,
          errorCode: requirement.reason,
        })
      }
    },
    [fieldErrored],
  )

  return useMemo(
    () => ({ journeyStarted, stepViewed, stepCompleted, fieldErrored, reportRejection }),
    [fieldErrored, journeyStarted, reportRejection, stepCompleted, stepViewed],
  )
}

/**
 * The origin of a referrer, or `undefined`.
 *
 * The property is called `entry_referrer` because knowing whether a journey
 * started from a search engine, a campaign landing page or a direct visit is
 * the useful part. The path and query are not: they are the part that can
 * carry an email address someone put in a URL.
 */
export function referrerOrigin(referrer: string | undefined): string | undefined {
  if (!referrer) return undefined
  try {
    return new URL(referrer).origin
  } catch {
    return undefined
  }
}
