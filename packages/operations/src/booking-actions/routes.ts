import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi"
import type {
  BookingActionProjectionRuntime,
  BookingActionProjectionService,
  BookingActionSourceRuntime,
} from "@voyant-travel/bookings/runtime-port"
import {
  bookingActionListQuerySchema,
  bookingActionListResponseSchema,
  bookingActionSyncSummarySchema,
} from "@voyant-travel/bookings-contracts/booking-actions"
import { openApiValidationHook } from "@voyant-travel/hono"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"

type Env = { Variables: { db: PostgresJsDatabase } }

export interface BookingActionRoutesOptions {
  projection: BookingActionProjectionRuntime
  sources: ReadonlyArray<BookingActionSourceRuntime>
}

const listRoute = createRoute({
  method: "get",
  path: "/booking-actions",
  tags: ["Booking actions"],
  summary: "List the operations booking-action work queue",
  request: { query: bookingActionListQuerySchema },
  responses: {
    200: {
      description: "Server-projected booking actions and deadlines",
      content: { "application/json": { schema: bookingActionListResponseSchema } },
    },
  },
})

const rebuildRoute = createRoute({
  method: "post",
  path: "/booking-actions/rebuild",
  tags: ["Booking actions"],
  summary: "Deterministically rebuild booking actions from authoritative modules",
  request: { body: { required: false, content: { "application/json": { schema: z.object({}) } } } },
  responses: {
    200: {
      description: "Projection rebuild summary",
      content: { "application/json": { schema: bookingActionSyncSummarySchema } },
    },
  },
})

export function createBookingActionAdminRoutes(options: BookingActionRoutesOptions) {
  const app = new OpenAPIHono<Env>({ defaultHook: openApiValidationHook })
  app.openapi(listRoute, async (c) => {
    const service: BookingActionProjectionService = options.projection.create(c.get("db"))
    return c.json(await service.listStaff(c.req.valid("query")), 200)
  })
  app.openapi(rebuildRoute, async (c) => {
    return c.json(await options.projection.synchronize(options.sources, "rebuild"), 200)
  })
  return app
}
