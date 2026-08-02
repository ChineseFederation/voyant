import {
  createPublicCapabilityToken,
  extractPublicCapabilityToken,
  serializePublicCapabilityCookie,
  UnauthorizedApiError,
  verifyPublicCapabilityToken,
} from "@voyant-travel/hono"
import type { Context } from "hono"

export const CHECKOUT_CAPABILITY_COOKIE = "voyant_checkout_session"
export const CHECKOUT_CAPABILITY_HEADER = "X-Voyant-Checkout-Capability"
export const CHECKOUT_CAPABILITY_SCOPE = "booking-checkout-session"
export const GUEST_BOOKING_ACCESS_COOKIE = "voyant_guest_booking"
export const GUEST_BOOKING_ACCESS_HEADER = "X-Voyant-Guest-Booking-Access"
export const GUEST_BOOKING_ACCESS_SCOPE = "guest-booking"

export const checkoutCapabilityActions = [
  "session:read",
  "session:update",
  "session:reprice",
  "session:finalize",
  "payment:read",
  "payment:start",
] as const

export type CheckoutCapabilityAction = (typeof checkoutCapabilityActions)[number]

export const guestBookingAccessActions = [
  "overview:read",
  "payment:read",
  "payment:start",
  "amendment:read",
  "amendment:preview",
  "amendment:accept",
  "amendment:apply",
] as const

export type GuestBookingAccessAction = (typeof guestBookingAccessActions)[number]

const DEFAULT_TTL_SECONDS = 30 * 60
const MAX_TTL_SECONDS = 2 * 60 * 60
const DEFAULT_GUEST_ACCESS_TTL_SECONDS = 30 * 60
const MAX_GUEST_ACCESS_TTL_SECONDS = 2 * 60 * 60

export function resolveCheckoutCapabilitySecret(env: Record<string, string | undefined>) {
  return env.VOYANT_CHECKOUT_CAPABILITY_SECRET ?? ""
}

export function resolveCheckoutCapabilityTtlSeconds(env: Record<string, string | undefined>) {
  const raw = env.VOYANT_CHECKOUT_CAPABILITY_TTL_SECONDS
  const parsed = raw ? Number(raw) : DEFAULT_TTL_SECONDS
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_TTL_SECONDS
  }

  return Math.min(Math.floor(parsed), MAX_TTL_SECONDS)
}

export function resolveGuestBookingAccessSecret(env: Record<string, string | undefined>) {
  return env.VOYANT_GUEST_BOOKING_ACCESS_SECRET ?? resolveCheckoutCapabilitySecret(env)
}

export function resolveGuestBookingAccessTtlSeconds(env: Record<string, string | undefined>) {
  const raw = env.VOYANT_GUEST_BOOKING_ACCESS_TTL_SECONDS
  const parsed = raw ? Number(raw) : DEFAULT_GUEST_ACCESS_TTL_SECONDS
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_GUEST_ACCESS_TTL_SECONDS
  }

  return Math.min(Math.floor(parsed), MAX_GUEST_ACCESS_TTL_SECONDS)
}

export async function issueCheckoutCapability(
  bookingId: string,
  env: Record<string, string | undefined>,
) {
  return createPublicCapabilityToken({
    secret: resolveCheckoutCapabilitySecret(env),
    scope: CHECKOUT_CAPABILITY_SCOPE,
    subjectId: bookingId,
    actions: [...checkoutCapabilityActions],
    ttlSeconds: resolveCheckoutCapabilityTtlSeconds(env),
  })
}

export async function issueGuestBookingAccess(
  bookingId: string,
  env: Record<string, string | undefined>,
) {
  return createPublicCapabilityToken({
    secret: resolveGuestBookingAccessSecret(env),
    scope: GUEST_BOOKING_ACCESS_SCOPE,
    subjectId: bookingId,
    actions: [...guestBookingAccessActions],
    ttlSeconds: resolveGuestBookingAccessTtlSeconds(env),
  })
}

export async function requireCheckoutCapability(
  c: Context,
  bookingId: string,
  action: CheckoutCapabilityAction,
  env: Record<string, string | undefined>,
) {
  const token = extractPublicCapabilityToken(c, {
    headerName: CHECKOUT_CAPABILITY_HEADER,
    cookieName: CHECKOUT_CAPABILITY_COOKIE,
  })

  if (!token) {
    throw new UnauthorizedApiError("Missing checkout session capability")
  }

  return verifyPublicCapabilityToken(token, {
    secret: resolveCheckoutCapabilitySecret(env),
    scope: CHECKOUT_CAPABILITY_SCOPE,
    subjectId: bookingId,
    action,
  })
}

export async function requireGuestBookingAccess(
  c: Context,
  bookingId: string,
  action: GuestBookingAccessAction,
  env: Record<string, string | undefined>,
) {
  const token = extractPublicCapabilityToken(c, {
    headerName: GUEST_BOOKING_ACCESS_HEADER,
    cookieName: GUEST_BOOKING_ACCESS_COOKIE,
  })

  if (!token) {
    throw new UnauthorizedApiError("Missing guest booking access capability")
  }

  return verifyPublicCapabilityToken(token, {
    secret: resolveGuestBookingAccessSecret(env),
    scope: GUEST_BOOKING_ACCESS_SCOPE,
    subjectId: bookingId,
    action,
  })
}

export function checkoutCapabilityCookie(token: string, expiresAt: Date) {
  return serializePublicCapabilityCookie({
    name: CHECKOUT_CAPABILITY_COOKIE,
    token,
    expiresAt,
    path: "/v1/public",
  })
}

export function guestBookingAccessCookie(token: string, expiresAt: Date) {
  return serializePublicCapabilityCookie({
    name: GUEST_BOOKING_ACCESS_COOKIE,
    token,
    expiresAt,
    path: "/v1/public",
  })
}
