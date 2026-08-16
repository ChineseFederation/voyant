import { OpenAPIHono } from "@hono/zod-openapi"
import { openApiValidationHook } from "@voyant-travel/hono"
import { z } from "zod"
import { createBookingsAdminRoute, createBookingsPublicRoute } from "./routes-openapi.js"
import { activePublicApiChannelGuard, activePublicApiOrigin } from "./routes-public.js"
import type { Env } from "./routes-shared.js"
import type { BookingInquiry } from "./schema-inquiries.js"
import { bookingInquiriesService } from "./service-inquiries.js"
import { bookingInquiryReceiptSchema, submitBookingInquirySchema } from "./validation-inquiries.js"

type BookingInquiryService = Pick<typeof bookingInquiriesService, "submit" | "getById" | "list">

function receipt(inquiry: BookingInquiry) {
  return {
    id: inquiry.id,
    channelId: inquiry.channelId,
    productId: inquiry.productId,
    departureId: inquiry.departureId,
    contact: {
      firstName: inquiry.contactFirstName,
      lastName: inquiry.contactLastName,
      email: inquiry.contactEmail,
      phone: inquiry.contactPhone,
    },
    locale: inquiry.locale,
    message: inquiry.message,
    status: inquiry.status,
    createdAt: inquiry.createdAt.toISOString(),
    updatedAt: inquiry.updatedAt.toISOString(),
  }
}

const errorSchema = z.object({ error: z.string() })

const submitRoute = createBookingsPublicRoute({
  method: "post",
  path: "/inquiries",
  request: {
    body: {
      required: true,
      content: { "application/json": { schema: submitBookingInquirySchema } },
    },
  },
  responses: {
    200: {
      description: "The previously created durable inquiry receipt",
      content: { "application/json": { schema: z.object({ data: bookingInquiryReceiptSchema }) } },
    },
    201: {
      description: "A durable inquiry receipt",
      content: { "application/json": { schema: z.object({ data: bookingInquiryReceiptSchema }) } },
    },
    400: {
      description: "Invalid inquiry or missing Idempotency-Key",
      content: { "application/json": { schema: errorSchema } },
    },
    403: {
      description: "Missing or inactive storefront channel context",
      content: { "application/json": { schema: errorSchema } },
    },
    409: {
      description: "The idempotency key was already used for another inquiry request",
      content: { "application/json": { schema: errorSchema } },
    },
  },
})

export function createBookingInquiryPublicRoutes(
  service: BookingInquiryService = bookingInquiriesService,
) {
  const app = new OpenAPIHono<Env>({ defaultHook: openApiValidationHook })
  app.use("/inquiries", activePublicApiChannelGuard())
  return app.openapi(submitRoute, async (c) => {
    const idempotencyKey = c.req.header("Idempotency-Key")?.trim()
    if (!idempotencyKey) return c.json({ error: "Idempotency-Key header is required" }, 400)
    if (idempotencyKey.length > 255) {
      return c.json({ error: "Idempotency-Key must be 255 characters or fewer" }, 400)
    }

    const origin = activePublicApiOrigin(c)
    if (!origin) return c.json({ error: "active_storefront_channel_required" }, 403)
    const input = c.req.valid("json")
    const result = await service.submit(
      c.get("db"),
      {
        ...input,
        departureId: input.departureId ?? null,
        idempotencyKey,
        channelId: origin.channelId,
      },
      { eventBus: c.get("eventBus") },
    )
    if (result.status === "conflict") {
      return c.json({ error: "Idempotency-Key was already used for another inquiry" }, 409)
    }
    return c.json({ data: receipt(result.inquiry) }, result.status === "created" ? 201 : 200)
  })
}

const inquiryParams = z.object({ id: z.string().min(1) })
const listRoute = createBookingsAdminRoute({
  method: "get",
  path: "/inquiries",
  responses: {
    200: {
      description: "Durable booking inquiries, newest first",
      content: {
        "application/json": { schema: z.object({ data: z.array(bookingInquiryReceiptSchema) }) },
      },
    },
  },
})
const getRoute = createBookingsAdminRoute({
  method: "get",
  path: "/inquiries/{id}",
  request: { params: inquiryParams },
  responses: {
    200: {
      description: "A durable booking inquiry",
      content: { "application/json": { schema: z.object({ data: bookingInquiryReceiptSchema }) } },
    },
    404: {
      description: "Inquiry not found",
      content: { "application/json": { schema: errorSchema } },
    },
  },
})

export function createBookingInquiryAdminRoutes(
  service: BookingInquiryService = bookingInquiriesService,
) {
  return new OpenAPIHono<Env>({ defaultHook: openApiValidationHook })
    .openapi(listRoute, async (c) =>
      c.json({ data: (await service.list(c.get("db"))).map(receipt) }, 200),
    )
    .openapi(getRoute, async (c) => {
      const inquiry = await service.getById(c.get("db"), c.req.valid("param").id)
      return inquiry
        ? c.json({ data: receipt(inquiry) }, 200)
        : c.json({ error: "Booking inquiry not found" }, 404)
    })
}

export const bookingInquiryPublicRoutes = createBookingInquiryPublicRoutes()
export const bookingInquiryAdminRoutes = createBookingInquiryAdminRoutes()
