import {
  type BookingSessionOutcomeV1,
  bookingSessionOutcomeV1,
} from "@voyant-travel/catalog-contracts/booking-engine/session-contracts"

import { fetchWithValidation, type VoyantFetcher } from "./client.js"

export interface ManualBookingSessionClientOptions {
  baseUrl: string
  fetcher: VoyantFetcher
}

export interface ManualBookingSessionContinuation {
  sessionId: string
  revision: number
  quoteId: string
  /** The descriptor the Quote was published with; the Commit echoes it back. */
  requirementsFingerprint: string
  holdId: string
  commitIdempotencyKey: string
}

export interface ManualBookingSessionCommitInput {
  productId: string
  selection: Record<string, unknown>
  quantity: number
  idempotencyKey: string
  payment?: { returnUrl?: string; cancelUrl?: string }
  continuation?: ManualBookingSessionContinuation
  /** Persisted before Commit so a lost response can be retried idempotently. */
  onContinuation?: (continuation: ManualBookingSessionContinuation) => void
}

export type ManualBookingSessionCommitResult =
  | { kind: "committed"; bookingId: string }
  | {
      kind: "payment_required"
      sessionId: string
      revision: number
      quoteId: string
      requirementsFingerprint: string
      holdId: string
      commitIdempotencyKey: string
      redirectUrl: string | null
    }

export async function commitManualBookingSessionV1(
  client: ManualBookingSessionClientOptions,
  input: ManualBookingSessionCommitInput,
): Promise<ManualBookingSessionCommitResult> {
  if (input.continuation) {
    return commitContinuation(client, input.continuation, input.payment)
  }

  const created = await request(client, "/v1/admin/catalog/booking-sessions", {
    method: "POST",
    body: JSON.stringify({
      idempotencyKey: key(input.idempotencyKey, "create"),
      target: { kind: "product", productId: input.productId },
      selection: input.selection,
    }),
  })
  const session = expectOutcome(created, "session_created").session
  const quoted = expectOutcome(
    await request(client, path(session.id, "quote"), {
      method: "POST",
      body: JSON.stringify({
        expectedRevision: session.revision,
        idempotencyKey: key(input.idempotencyKey, "quote"),
      }),
    }),
    "quote_created",
  )
  const held = expectOutcome(
    await request(client, path(session.id, "hold"), {
      method: "POST",
      body: JSON.stringify({
        expectedRevision: session.revision,
        quoteId: quoted.quote.id,
        quantity: input.quantity,
        idempotencyKey: key(input.idempotencyKey, "hold"),
      }),
    }),
    "hold_created",
  )
  const commitIdempotencyKey = key(input.idempotencyKey, "commit")
  const continuation: ManualBookingSessionContinuation = {
    sessionId: session.id,
    revision: session.revision,
    quoteId: quoted.quote.id,
    requirementsFingerprint: quoted.quote.requirementsFingerprint,
    holdId: held.hold.id,
    commitIdempotencyKey,
  }
  input.onContinuation?.(continuation)
  return commitContinuation(client, continuation, input.payment)
}

async function commitContinuation(
  client: ManualBookingSessionClientOptions,
  continuation: ManualBookingSessionContinuation,
  payment?: ManualBookingSessionCommitInput["payment"],
): Promise<ManualBookingSessionCommitResult> {
  const committed = expectOutcome(
    await request(client, path(continuation.sessionId, "commit"), {
      method: "POST",
      body: JSON.stringify({
        expectedRevision: continuation.revision,
        quoteId: continuation.quoteId,
        requirementsFingerprint: continuation.requirementsFingerprint,
        holdId: continuation.holdId,
        idempotencyKey: continuation.commitIdempotencyKey,
        ...(payment ? { payment } : {}),
      }),
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
      redirectUrl: outcome.paymentSession.redirectUrl,
    }
  }
  throw new ManualBookingSessionError(committed)
}

function request(
  client: ManualBookingSessionClientOptions,
  route: string,
  init: RequestInit,
): Promise<BookingSessionOutcomeV1> {
  return fetchWithValidation(route, bookingSessionOutcomeV1, client, {
    ...init,
    credentials: "include",
  })
}

function path(sessionId: string, action: string) {
  return `/v1/admin/catalog/booking-sessions/${encodeURIComponent(sessionId)}/${action}`
}

function key(root: string, action: string) {
  return `${root}:${action}`
}

function expectOutcome<K extends BookingSessionOutcomeV1["kind"]>(
  outcome: BookingSessionOutcomeV1,
  kind: K,
): Extract<BookingSessionOutcomeV1, { kind: K }> {
  if (outcome.kind === kind) return outcome as Extract<BookingSessionOutcomeV1, { kind: K }>
  throw new ManualBookingSessionError(outcome)
}

export class ManualBookingSessionError extends Error {
  readonly recovery: ManualBookingSessionRecovery

  constructor(readonly outcome: BookingSessionOutcomeV1) {
    const recovery = recoveryForOutcome(outcome)
    super(`manual_booking_session_${recovery}`)
    this.name = "ManualBookingSessionError"
    this.recovery = recovery
  }
}

export type ManualBookingSessionRecovery =
  | "revisionConflict"
  | "quoteChanged"
  | "availabilityChanged"
  | "quoteUnavailable"
  | "commitRejected"
  | "notAuthorized"
  | "unknown"

function recoveryForOutcome(outcome: BookingSessionOutcomeV1): ManualBookingSessionRecovery {
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
