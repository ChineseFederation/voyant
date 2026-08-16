import { OpenAPIHono, z } from "@hono/zod-openapi"
import { publicBookingActionListResponseSchema } from "@voyant-travel/bookings-contracts/booking-actions"
import { openApiValidationHook } from "@voyant-travel/hono"

import { requireGuestBookingAccess } from "./checkout-capability.js"
import { createBookingsPublicRoute } from "./routes-openapi.js"
import { requireBookingPublicApiOrigin } from "./routes-public.js"
import { type Env, getRuntimeEnv } from "./routes-shared.js"
import type { BookingActionProjectionRuntime } from "./runtime-port.js"

const route = createBookingsPublicRoute({
  method: "get",
  path: "/{bookingId}/actions",
  tags: ["Bookings"],
  summary: "List customer-safe next actions for a booking",
  request: { params: z.object({ bookingId: z.string().min(1) }) },
  responses: {
    200: {
      description: "Redacted server-projected booking actions",
      content: { "application/json": { schema: publicBookingActionListResponseSchema } },
    },
    401: { description: "Missing booking access capability" },
    403: { description: "Booking does not belong to the active storefront channel" },
    501: { description: "Booking action projection is not selected" },
  },
})

export function createPublicBookingActionRoutes(projection?: BookingActionProjectionRuntime) {
  const app = new OpenAPIHono<Env>({ defaultHook: openApiValidationHook })
  app.openapi(route, async (c) => {
    if (!projection) return c.json({ error: "booking_actions_not_available" }, 501)
    const { bookingId } = c.req.valid("param")
    await requireGuestBookingAccess(c, bookingId, "overview:read", getRuntimeEnv(c))
    const denied = await requireBookingPublicApiOrigin(c, bookingId)
    if (denied) return denied
    return c.json(await projection.create(c.get("db")).listCustomer(bookingId), 200)
  })
  return app
}
