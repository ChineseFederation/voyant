import { CATALOG_BOOKING_SESSION_CREATED_EVENT } from "./inquiry/ports.js"

export const catalogBookingSessionCreatedAnalyticsSubscriberDeclaration = {
  id: "@voyant-travel/catalog#subscriber.booking-session-created-analytics",
  eventType: CATALOG_BOOKING_SESSION_CREATED_EVENT,
  source: "@voyant-travel/catalog/booking-session-created-analytics-subscriber",
} as const
