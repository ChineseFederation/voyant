import type { BootstrapContext, SubscriberRuntimeDescriptor } from "@voyant-travel/core"
import { type AnalyticsPort, createSafeAnalytics } from "@voyant-travel/core/analytics"
import { defineGraphRuntimeFactory } from "@voyant-travel/core/project"
import { analyticsPort } from "@voyant-travel/core/runtime-port"
import { z } from "zod"

import { catalogBookingSessionCreatedAnalyticsSubscriberDeclaration } from "./booking-session-created-analytics-subscriber-manifest.js"
import { CATALOG_BOOKING_SESSION_CREATED_EVENT } from "./inquiry/ports.js"

export { catalogBookingSessionCreatedAnalyticsSubscriberDeclaration } from "./booking-session-created-analytics-subscriber-manifest.js"

const payloadSchema = z.object({
  bookingSessionId: z.string().min(1),
  scope: z.string().min(1),
  market: z.string().min(1),
  channel: z.literal("operator"),
})

export function createCatalogBookingSessionCreatedAnalyticsSubscriber(
  analytics?: AnalyticsPort,
): SubscriberRuntimeDescriptor {
  return {
    id: catalogBookingSessionCreatedAnalyticsSubscriberDeclaration.id,
    eventType: CATALOG_BOOKING_SESSION_CREATED_EVENT,
    register(context: BootstrapContext) {
      if (!analytics) return
      const safe = createSafeAnalytics(analytics)
      context.eventBus.subscribe(CATALOG_BOOKING_SESSION_CREATED_EVENT, ({ data }) => {
        const payload = payloadSchema.parse(data)
        safe.track("engine.session.created", {
          booking_session_id: payload.bookingSessionId,
          scope: payload.scope,
          market: payload.market,
          channel: payload.channel,
        })
      })
    },
  }
}

export const createCatalogBookingSessionCreatedAnalyticsSubscriberGraphRuntime =
  defineGraphRuntimeFactory(async ({ hasPort, getPort }) =>
    createCatalogBookingSessionCreatedAnalyticsSubscriber(
      hasPort(analyticsPort) ? await getPort(analyticsPort) : undefined,
    ),
  )
