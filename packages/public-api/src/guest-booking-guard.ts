import {
  GUEST_BOOKING_ACCESS_COOKIE,
  GUEST_BOOKING_ACCESS_HEADER,
} from "@voyant-travel/bookings/checkout-capability"

export interface GuestBookingGuardRequest {
  headers: Headers | Record<string, string | undefined>
}

export interface GuestBookingLookupInput {
  bookingCode: string
  email: string
}

export interface GuestBookingGuardOptions {
  cookieName?: string
  headerName?: string
  lookupPath?: string
  overviewPath?: string
}

function headerValue(headers: GuestBookingGuardRequest["headers"], name: string) {
  if (typeof Headers !== "undefined" && headers instanceof Headers) {
    return headers.get(name)
  }

  const lowerName = name.toLowerCase()
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === lowerName) return value ?? null
  }

  return null
}

function cookieValue(cookieHeader: string | null | undefined, cookieName: string) {
  if (!cookieHeader) return null

  for (const part of cookieHeader.split(";")) {
    const [rawName, ...rawValueParts] = part.trim().split("=")
    if (rawName === cookieName) {
      return decodeURIComponent(rawValueParts.join("="))
    }
  }

  return null
}

export function createGuestBookingGuard(options: GuestBookingGuardOptions = {}) {
  const cookieName = options.cookieName ?? GUEST_BOOKING_ACCESS_COOKIE
  const headerName = options.headerName ?? GUEST_BOOKING_ACCESS_HEADER
  const lookupPath = options.lookupPath ?? "/v1/public/bookings/guest-lookup"
  const overviewPath = options.overviewPath ?? "/v1/public/bookings/overview"

  function getAccessToken(request: GuestBookingGuardRequest) {
    return (
      headerValue(request.headers, headerName) ??
      cookieValue(headerValue(request.headers, "Cookie"), cookieName)
    )
  }

  return {
    cookieName,
    headerName,
    lookupPath,
    overviewPath,
    getAccessToken,
    hasAccess(request: GuestBookingGuardRequest) {
      return Boolean(getAccessToken(request))
    },
    createLookupRequest(input: GuestBookingLookupInput): RequestInit {
      return {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      }
    },
    overviewUrl(bookingCode: string, baseUrl?: string | URL) {
      const url = new URL(overviewPath, baseUrl ?? "https://voyant.local")
      url.searchParams.set("bookingCode", bookingCode)
      return baseUrl ? url.toString() : `${url.pathname}${url.search}`
    },
  }
}
