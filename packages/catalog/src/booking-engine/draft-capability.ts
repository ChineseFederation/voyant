/**
 * Draft-scoped capability for the public booking journey.
 *
 * A booking draft holds traveller names, contact details and the party a
 * customer is about to buy for, and its id is supplied by the caller on
 * `PUT /drafts/{id}`. Treating that id as sufficient authorization means anyone
 * who learns or guesses one can read the draft, overwrite it, delete it, or
 * book it. Ids are TypeIDs in practice, but "unguessable" is not an access
 * control.
 *
 * So creating a draft issues a capability bound to that draft, returned in the
 * response and set as an HttpOnly cookie, and every later operation on the
 * draft requires it. This mirrors the checkout capability the booking-create
 * response already issues, and uses the same primitive.
 */
import {
  createPublicCapabilityToken,
  extractPublicCapabilityToken,
  serializePublicCapabilityCookie,
  UnauthorizedApiError,
  verifyPublicCapabilityToken,
} from "@voyant-travel/hono"
import type { Context } from "hono"

export const BOOKING_DRAFT_CAPABILITY_COOKIE = "voyant_booking_draft"
export const BOOKING_DRAFT_CAPABILITY_HEADER = "X-Voyant-Booking-Draft"
export const BOOKING_DRAFT_CAPABILITY_SCOPE = "booking-draft"

export const bookingDraftCapabilityActions = ["draft:read", "draft:write", "draft:book"] as const

export type BookingDraftCapabilityAction = (typeof bookingDraftCapabilityActions)[number]

/** Matches the default draft TTL, so the capability outlives the draft's use. */
const DEFAULT_TTL_SECONDS = 24 * 60 * 60

export function resolveBookingDraftCapabilitySecret(env: Record<string, string | undefined>) {
  return env.VOYANT_BOOKING_DRAFT_CAPABILITY_SECRET ?? env.VOYANT_CHECKOUT_CAPABILITY_SECRET ?? ""
}

export function resolveBookingDraftCapabilityTtlSeconds(env: Record<string, string | undefined>) {
  const raw = env.VOYANT_BOOKING_DRAFT_CAPABILITY_TTL_SECONDS
  const parsed = raw ? Number(raw) : DEFAULT_TTL_SECONDS
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_TTL_SECONDS
  return Math.floor(parsed)
}

export async function issueBookingDraftCapability(
  draftId: string,
  env: Record<string, string | undefined>,
) {
  return createPublicCapabilityToken({
    secret: resolveBookingDraftCapabilitySecret(env),
    scope: BOOKING_DRAFT_CAPABILITY_SCOPE,
    subjectId: draftId,
    actions: [...bookingDraftCapabilityActions],
    ttlSeconds: resolveBookingDraftCapabilityTtlSeconds(env),
  })
}

/** Verify a token presented on the request. Throws when absent or wrong. */
export async function requireBookingDraftCapability(
  c: Context,
  draftId: string,
  action: BookingDraftCapabilityAction,
  env: Record<string, string | undefined>,
) {
  const token = extractPublicCapabilityToken(c, {
    headerName: BOOKING_DRAFT_CAPABILITY_HEADER,
    cookieName: BOOKING_DRAFT_CAPABILITY_COOKIE,
  })
  if (!token) throw new UnauthorizedApiError("Missing booking draft capability")

  return verifyPublicCapabilityToken(token, {
    secret: resolveBookingDraftCapabilitySecret(env),
    scope: BOOKING_DRAFT_CAPABILITY_SCOPE,
    subjectId: draftId,
    action,
  })
}

/**
 * Verify a token supplied out-of-band — used by the booking-create path, where
 * the token arrives through the port rather than off this request.
 */
export async function verifyBookingDraftCapabilityToken(
  token: string | undefined,
  draftId: string,
  action: BookingDraftCapabilityAction,
  env: Record<string, string | undefined>,
): Promise<boolean> {
  if (!token) return false
  try {
    await verifyPublicCapabilityToken(token, {
      secret: resolveBookingDraftCapabilitySecret(env),
      scope: BOOKING_DRAFT_CAPABILITY_SCOPE,
      subjectId: draftId,
      action,
    })
    return true
  } catch {
    return false
  }
}

export function bookingDraftCapabilityCookie(token: string, expiresAt: Date) {
  return serializePublicCapabilityCookie({
    name: BOOKING_DRAFT_CAPABILITY_COOKIE,
    token,
    expiresAt,
    path: "/v1/public",
  })
}
