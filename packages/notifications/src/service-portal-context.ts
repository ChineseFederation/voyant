export interface NotificationPortalContext {
  url: string
  bookingUrl: string
}

export interface NotificationPortalContextOptions {
  publicCustomerPortalBaseUrl?: string | null
}

export function buildNotificationPortalContext(
  publicCustomerPortalBaseUrl: string | null | undefined,
  bookingId: string | null | undefined,
): NotificationPortalContext {
  const url = normalizeCustomerPortalBaseUrl(publicCustomerPortalBaseUrl)
  if (!url) return { url: "", bookingUrl: "" }

  return {
    url,
    bookingUrl: bookingId ? `${url}/bookings/${encodeURIComponent(bookingId)}` : "",
  }
}

function normalizeCustomerPortalBaseUrl(value: string | null | undefined) {
  const trimmed = value?.trim()
  return trimmed ? trimmed.replace(/\/+$/, "") : ""
}
