"use client"

import { useMutation } from "@tanstack/react-query"
import type { BookingRequirementsV1 } from "@voyant-travel/catalog-contracts/booking-engine/requirements-contracts"
import type {
  BookingSessionCapabilityActionV1,
  BookingSessionLifecycleErrorV1,
  BookingSessionOutcomeV1,
  BookingSessionRecordV1,
  BookingSessionScopeV1,
  BookingSessionViewV1,
  CreateBookingSessionTargetV1,
} from "@voyant-travel/catalog-contracts/booking-engine/session-contracts"
import { useCallback, useMemo, useRef, useState } from "react"

import {
  abandonBookingSession,
  adoptBookingSession,
  bookingSelectionDigest,
  bookingSessionIdempotencyKey,
  openBookingSession,
  patchBookingSessionSelection,
  renewBookingSession,
  resumeBookingSession,
} from "./session-client.js"
import { bookingSessionOf, bookingSessionRejection } from "./session-outcomes.js"
import { type BookingJourneyApiOptions, useBookingJourneyApi } from "./use-booking-journey-api.js"

export interface UseBookingSessionOptions extends BookingJourneyApiOptions {
  /**
   * Target for `create()`. Fixed for the life of a Session — retargeting is a
   * new Session, not a PATCH.
   */
  target?: CreateBookingSessionTargetV1
  /**
   * Commercial scope, fixed at create. A Session's Quote, Hold and Commit must
   * all mean the same money, so there is no way to re-scope one; a market or
   * currency change is a new Session.
   */
  scope?: BookingSessionScopeV1
  capabilityScopes?: BookingSessionCapabilityActionV1[]
  /** Resume this Session on `resume()` when no id is passed. */
  sessionId?: string
  /**
   * Stable root for every idempotency key this Session derives — a booking
   * reference, a wizard instance id, anything persisted with the Session id
   * and stable across retries. It must NOT be regenerated per attempt: a fresh
   * random key per attempt is not idempotency, it is a second Session.
   */
  idempotencyRoot: string
  /** Observe every outcome, including rejections. */
  onOutcome?: (outcome: BookingSessionOutcomeV1) => void
}

export interface UseBookingSession {
  sessionId: string | null
  session: BookingSessionRecordV1 | BookingSessionViewV1 | null
  /** Current revision, fed back into every mutation as `expectedRevision`. */
  revision: number | null
  /**
   * Server-owned Booking Requirements for the target. Present on an active
   * Session *before* any Quote — a host must draw the Configure step before it
   * can price it.
   */
  requirements: BookingRequirementsV1 | null
  /** The last outcome, kept whole so callers can branch on its `kind`. */
  outcome: BookingSessionOutcomeV1 | null
  /** The lifecycle error of the last outcome, when it was `rejected`. */
  rejection: BookingSessionLifecycleErrorV1 | null
  isPending: boolean
  /** Transport failure only. Lifecycle rejections arrive as outcomes. */
  error: Error | null
  create: () => Promise<BookingSessionOutcomeV1>
  resume: (sessionId?: string) => Promise<BookingSessionOutcomeV1>
  updateSelection: (selection: Record<string, unknown>) => Promise<BookingSessionOutcomeV1>
  adopt: () => Promise<BookingSessionOutcomeV1>
  renew: (extendBySeconds: number) => Promise<BookingSessionOutcomeV1>
  abandon: () => Promise<BookingSessionOutcomeV1>
  /** Forget the local Session pointer without touching the server. */
  reset: () => void
}

/**
 * Own one v1 Booking Session: create it, resume it, PATCH its selection.
 *
 * The hook tracks the current revision from every outcome that carries a
 * Session and feeds it back as `expectedRevision`, so a host never has to
 * thread it by hand and a stale write comes back as a typed
 * `revision_conflict` instead of silently clobbering a concurrent edit.
 *
 * Idempotency keys are derived, not random:
 *   - create  → `<root>:create`
 *   - update  → `<root>:update:<revision>:<selection digest>`
 *   - adopt / renew / abandon → `<root>:<action>:<revision>`
 *
 * Retrying the same edit reuses its key because the revision and the payload
 * have not changed; a different edit at the same revision gets a different key,
 * so a dropped response can never replay the wrong write.
 */
export function useBookingSession(options: UseBookingSessionOptions): UseBookingSession {
  const api = useBookingJourneyApi(options)
  const [sessionId, setSessionId] = useState<string | null>(options.sessionId ?? null)
  const [session, setSession] = useState<BookingSessionRecordV1 | BookingSessionViewV1 | null>(null)
  const [outcome, setOutcome] = useState<BookingSessionOutcomeV1 | null>(null)

  const sessionIdRef = useRef(sessionId)
  const revisionRef = useRef<number | null>(null)
  const onOutcome = options.onOutcome
  const onOutcomeRef = useRef(onOutcome)
  onOutcomeRef.current = onOutcome

  const absorb = useCallback((next: BookingSessionOutcomeV1) => {
    setOutcome(next)
    const record = bookingSessionOf(next)
    if (record) {
      setSession(record)
      setSessionId(record.id)
      sessionIdRef.current = record.id
      revisionRef.current = record.revision
    }
    onOutcomeRef.current?.(next)
    return next
  }, [])

  const requireSessionId = useCallback(() => {
    const id = sessionIdRef.current
    if (!id) throw new Error("no booking session to act on")
    return id
  }, [])

  const requireRevision = useCallback(() => {
    const revision = revisionRef.current
    if (revision === null) throw new Error("no booking session revision to fence against")
    return revision
  }, [])

  const root = options.idempotencyRoot
  const target = options.target
  const scope = options.scope
  const capabilityScopes = options.capabilityScopes
  const fallbackSessionId = options.sessionId

  const mutation = useMutation<
    BookingSessionOutcomeV1,
    Error,
    () => Promise<BookingSessionOutcomeV1>
  >({
    mutationFn: (call) => call(),
    onSuccess: absorb,
  })
  const run = mutation.mutateAsync

  const create = useCallback(() => {
    if (!target) throw new Error("useBookingSession: `target` is required to create a Session")
    return run(() =>
      openBookingSession(api, {
        idempotencyKey: bookingSessionIdempotencyKey(root, "create"),
        target,
        ...(scope ? { scope } : {}),
        ...(capabilityScopes ? { capabilityScopes } : {}),
      }),
    )
  }, [api, capabilityScopes, root, run, scope, target])

  const resume = useCallback(
    (id?: string) => {
      const resolved = id ?? sessionIdRef.current ?? fallbackSessionId
      if (!resolved) throw new Error("useBookingSession: no Session id to resume")
      return run(() => resumeBookingSession(api, resolved))
    },
    [api, fallbackSessionId, run],
  )

  const updateSelection = useCallback(
    (selection: Record<string, unknown>) => {
      const id = requireSessionId()
      const revision = requireRevision()
      return run(() =>
        patchBookingSessionSelection(api, id, {
          expectedRevision: revision,
          selection,
          idempotencyKey: bookingSessionIdempotencyKey(
            root,
            "update",
            revision,
            bookingSelectionDigest(selection),
          ),
        }),
      )
    },
    [api, requireRevision, requireSessionId, root, run],
  )

  const adopt = useCallback(() => {
    const id = requireSessionId()
    const revision = requireRevision()
    return run(() =>
      adoptBookingSession(api, id, {
        expectedRevision: revision,
        idempotencyKey: bookingSessionIdempotencyKey(root, "adopt", revision),
      }),
    )
  }, [api, requireRevision, requireSessionId, root, run])

  const renew = useCallback(
    (extendBySeconds: number) => {
      const id = requireSessionId()
      const revision = requireRevision()
      return run(() =>
        renewBookingSession(api, id, {
          expectedRevision: revision,
          extendBySeconds,
          idempotencyKey: bookingSessionIdempotencyKey(root, "renew", revision, extendBySeconds),
        }),
      )
    },
    [api, requireRevision, requireSessionId, root, run],
  )

  const abandon = useCallback(() => {
    const id = requireSessionId()
    const revision = requireRevision()
    return run(() =>
      abandonBookingSession(api, id, {
        expectedRevision: revision,
        idempotencyKey: bookingSessionIdempotencyKey(root, "abandon", revision),
      }),
    )
  }, [api, requireRevision, requireSessionId, root, run])

  const reset = useCallback(() => {
    setSessionId(null)
    setSession(null)
    setOutcome(null)
    sessionIdRef.current = null
    revisionRef.current = null
  }, [])

  return useMemo(
    () => ({
      sessionId,
      session,
      revision: session?.revision ?? null,
      requirements: session?.requirements ?? null,
      outcome,
      rejection: bookingSessionRejection(outcome),
      isPending: mutation.isPending,
      error: mutation.error ?? null,
      create,
      resume,
      updateSelection,
      adopt,
      renew,
      abandon,
      reset,
    }),
    [
      abandon,
      adopt,
      create,
      mutation.error,
      mutation.isPending,
      outcome,
      renew,
      reset,
      resume,
      session,
      sessionId,
      updateSelection,
    ],
  )
}
