/**
 * The v1 Booking Session lifecycle, as plain functions over the mounted
 * routes. The React hooks in this folder are thin wrappers around these, and
 * the journey helper drives them in sequence.
 *
 *   POST   /v1/{admin,public}/catalog/booking-sessions
 *   GET    /v1/{admin,public}/catalog/booking-sessions/{id}
 *   PATCH  /v1/{admin,public}/catalog/booking-sessions/{id}
 *   POST   /v1/{admin,public}/catalog/booking-sessions/{id}/{adopt,renew,quote,
 *                                                            hold,abandon,commit}
 *   POST   /v1/{admin,public}/catalog/offers/preview
 *
 * These replace the beta trio the client used to speak — `GET/PUT/DELETE
 * /catalog/drafts/:id`, `POST /catalog/holds/{place,release}` and
 * `POST /catalog/quote` — all three of which were deleted server-side.
 *
 * Every call returns the server's discriminated outcome rather than throwing
 * on a lifecycle rejection; see `session-outcomes.ts`.
 */

import {
  type OfferPreviewOutcomeV1,
  type OfferPreviewRequestV1,
  offerPreviewOutcomeV1,
} from "@voyant-travel/catalog-contracts/booking-engine/preview-contracts"
import {
  type AbandonBookingSessionV1,
  type AdoptBookingSessionV1,
  type BookingSessionOutcomeV1,
  bookingSessionOutcomeV1,
  type CommitBookingSessionV1,
  type CreateBookingSessionV1,
  type PlaceBookingHoldV1,
  type QuoteBookingSessionV1,
  type RenewBookingSessionV1,
  type UpdateBookingSessionV1,
} from "@voyant-travel/catalog-contracts/booking-engine/session-contracts"

import type { UseBookingJourneyApi } from "./use-booking-journey-api.js"

/** The transport the Session functions run over. */
export type BookingSessionApi = Pick<UseBookingJourneyApi, "request">

const SESSIONS = "/booking-sessions"

function sessionPath(sessionId: string, action?: string): string {
  const base = `${SESSIONS}/${encodeURIComponent(sessionId)}`
  return action ? `${base}/${action}` : base
}

export function openBookingSession(
  api: BookingSessionApi,
  input: CreateBookingSessionV1,
): Promise<BookingSessionOutcomeV1> {
  return api.request("POST", SESSIONS, bookingSessionOutcomeV1, input)
}

export function resumeBookingSession(
  api: BookingSessionApi,
  sessionId: string,
): Promise<BookingSessionOutcomeV1> {
  return api.request("GET", sessionPath(sessionId), bookingSessionOutcomeV1)
}

/**
 * Declarative selection update. The whole selection goes over the wire, the
 * server default-denies keys `bookingSelectionPublicV1` does not declare, and
 * `expectedRevision` fences a concurrent edit into a typed
 * `revision_conflict` instead of a lost write.
 */
export function patchBookingSessionSelection(
  api: BookingSessionApi,
  sessionId: string,
  input: UpdateBookingSessionV1,
): Promise<BookingSessionOutcomeV1> {
  return api.request("PATCH", sessionPath(sessionId), bookingSessionOutcomeV1, input)
}

export function quoteBookingSession(
  api: BookingSessionApi,
  sessionId: string,
  input: QuoteBookingSessionV1,
): Promise<BookingSessionOutcomeV1> {
  return api.request("POST", sessionPath(sessionId, "quote"), bookingSessionOutcomeV1, input)
}

export function holdBookingSession(
  api: BookingSessionApi,
  sessionId: string,
  input: PlaceBookingHoldV1,
): Promise<BookingSessionOutcomeV1> {
  return api.request("POST", sessionPath(sessionId, "hold"), bookingSessionOutcomeV1, input)
}

export function commitBookingSession(
  api: BookingSessionApi,
  sessionId: string,
  input: CommitBookingSessionV1,
): Promise<BookingSessionOutcomeV1> {
  return api.request("POST", sessionPath(sessionId, "commit"), bookingSessionOutcomeV1, input)
}

/**
 * Abandon the Session. This is also how a client gives a Hold back: the v1
 * surface mounts no hold-release route — abandoning releases every live Hold
 * the Session holds, and expiry covers the rest.
 */
export function abandonBookingSession(
  api: BookingSessionApi,
  sessionId: string,
  input: AbandonBookingSessionV1,
): Promise<BookingSessionOutcomeV1> {
  return api.request("POST", sessionPath(sessionId, "abandon"), bookingSessionOutcomeV1, input)
}

export function adoptBookingSession(
  api: BookingSessionApi,
  sessionId: string,
  input: AdoptBookingSessionV1,
): Promise<BookingSessionOutcomeV1> {
  return api.request("POST", sessionPath(sessionId, "adopt"), bookingSessionOutcomeV1, input)
}

export function renewBookingSession(
  api: BookingSessionApi,
  sessionId: string,
  input: RenewBookingSessionV1,
): Promise<BookingSessionOutcomeV1> {
  return api.request("POST", sessionPath(sessionId, "renew"), bookingSessionOutcomeV1, input)
}

/**
 * The stateless, non-binding read. Mints no identifier and persists nothing,
 * so a detail page can price a pax stepper without opening a Session per
 * keystroke.
 */
export function previewBookingOffer(
  api: BookingSessionApi,
  request: OfferPreviewRequestV1,
): Promise<OfferPreviewOutcomeV1> {
  return api.request("POST", "/offers/preview", offerPreviewOutcomeV1, request)
}

// ─────────────────────────────────────────────────────────────────
// Idempotency keys
// ─────────────────────────────────────────────────────────────────

/**
 * Derive a Session idempotency key.
 *
 * The rule the server relies on: **one user action, one key, for every retry
 * of that action**. A fresh random key per attempt is not idempotency — it is
 * a second Session, a second Quote, or a second booking.
 *
 * So a key is a pure function of (journey root, action, the facts that make
 * this attempt *this* attempt): the revision being fenced, the quote being
 * held, the payload being written. Retrying reuses it because the inputs have
 * not changed; a genuinely different action gets a different key because they
 * have.
 *
 * `idempotencyKey` on the wire is `min(8).max(128)`, so short roots are padded
 * deterministically and long ones are folded into a hash rather than truncated
 * — truncation would collide two different actions onto one key.
 */
export function bookingSessionIdempotencyKey(
  root: string,
  action: string,
  ...parts: Array<string | number | undefined>
): string {
  const tail = parts.filter((part) => part !== undefined && part !== "").join(":")
  const composed = [root, action, tail].filter(Boolean).join(":")
  const padded = composed.length >= 8 ? composed : `bsession:${composed}`
  if (padded.length <= 128) return padded
  return `${padded.slice(0, 111)}:${hash32(padded)}`
}

/**
 * Stable digest of a selection payload, so "the same edit, retried" reuses its
 * key while "a different edit at the same revision" does not — the case that
 * would otherwise replay the wrong write after a dropped response.
 */
export function bookingSelectionDigest(selection: unknown): string {
  return hash32(stableStringify(selection))
}

/** FNV-1a. Not a security primitive — a short, stable, dependency-free digest. */
function hash32(value: string): string {
  let hash = 0x811c9dc5
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash.toString(16).padStart(8, "0")
}

/** `JSON.stringify` with sorted object keys, so key order cannot change a digest. */
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null"
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, entry]) => entry !== undefined)
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
    .map(([key, entry]) => `${JSON.stringify(key)}:${stableStringify(entry)}`)
  return `{${entries.join(",")}}`
}
