// agent-quality: file-size exception -- owner: customer-portal; the OpenAPI route definitions and their handlers stay co-located (one app instance) until a dedicated split preserves behavior and tests.
import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi"
import type { ModuleContainer } from "@voyant-travel/core"
import {
  ForbiddenApiError,
  openApiValidationHook,
  requireCustomerBuyerContext,
  requireCustomerIdentityContext,
  requirePersonalCustomerBuyerContext,
} from "@voyant-travel/hono"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"
import type { Context } from "hono"

import {
  buildPublicCustomerPortalRouteRuntime,
  CUSTOMER_PORTAL_ROUTE_RUNTIME_CONTAINER_KEY,
  type PublicCustomerPortalRouteRuntime,
} from "./route-runtime.js"
import { customerPortalRoutes } from "./routes.js"
import { publicCustomerPortalService } from "./service-public.js"
import {
  bootstrapCustomerPortalResultSchema,
  bootstrapCustomerPortalSchema,
  createCustomerPortalCompanionSchema,
  createCustomerPortalProfileDocumentSchema,
  customerPortalBookingBillingContactSchema,
  customerPortalBookingDetailSchema,
  customerPortalBookingDocumentSchema,
  customerPortalBookingSummarySchema,
  customerPortalCompanionSchema,
  customerPortalProfileDocumentSchema,
  customerPortalProfileSchema,
  importCustomerPortalBookingTravelersResultSchema,
  importCustomerPortalBookingTravelersSchema,
  updateCustomerPortalCompanionSchema,
  updateCustomerPortalProfileDocumentSchema,
  updateCustomerPortalProfileSchema,
} from "./validation-public.js"

type Env = {
  Bindings: Record<string, unknown>
  Variables: {
    container?: ModuleContainer
    db: PostgresJsDatabase
    userId?: string
  }
}

function hasErrorResult(
  value: { profile: unknown } | { error: "not_found" | "customer_record_required" },
): value is { error: "not_found" | "customer_record_required" } {
  return "error" in value
}

function hasBootstrapErrorResult(
  value:
    | { status: string; profile: unknown; candidates: unknown[] }
    | { error: "not_found" | "customer_record_not_found" | "customer_record_claimed" },
): value is { error: "not_found" | "customer_record_not_found" | "customer_record_claimed" } {
  return "error" in value
}

const errorResponseSchema = z.object({ error: z.string() })

const profileEnvelopeSchema = z.object({ data: customerPortalProfileSchema })
const documentEnvelopeSchema = z.object({ data: customerPortalProfileDocumentSchema })
const documentListEnvelopeSchema = z.object({
  data: z.array(customerPortalProfileDocumentSchema),
})
const companionEnvelopeSchema = z.object({ data: customerPortalCompanionSchema })
const companionListEnvelopeSchema = z.object({ data: z.array(customerPortalCompanionSchema) })
const bootstrapEnvelopeSchema = z.object({ data: bootstrapCustomerPortalResultSchema })
const importEnvelopeSchema = z.object({
  data: importCustomerPortalBookingTravelersResultSchema,
})
const successEnvelopeSchema = z.object({ success: z.literal(true) })

const bookingSummaryListEnvelopeSchema = z.object({
  data: z.array(customerPortalBookingSummarySchema),
})
const bookingDetailEnvelopeSchema = z.object({ data: customerPortalBookingDetailSchema })
const bookingDocumentListEnvelopeSchema = z.object({
  data: z.array(customerPortalBookingDocumentSchema),
})
const bookingBillingContactEnvelopeSchema = z.object({
  data: customerPortalBookingBillingContactSchema,
})

const documentIdParamSchema = z.object({ id: z.string() })
const companionIdParamSchema = z.object({ companionId: z.string() })
const bookingIdParamSchema = z.object({ bookingId: z.string() })

const getMeRoute = createRoute({
  method: "get",
  path: "/me",
  responses: {
    200: {
      description: "The authenticated customer's portal profile",
      content: { "application/json": { schema: profileEnvelopeSchema } },
    },
    404: {
      description: "Customer profile not found",
      content: { "application/json": { schema: errorResponseSchema } },
    },
  },
})

const patchMeRoute = createRoute({
  method: "patch",
  path: "/me",
  request: {
    body: {
      required: true,
      content: { "application/json": { schema: updateCustomerPortalProfileSchema } },
    },
  },
  responses: {
    200: {
      description: "The updated customer portal profile",
      content: { "application/json": { schema: profileEnvelopeSchema } },
    },
    404: {
      description: "Customer profile not found",
      content: { "application/json": { schema: errorResponseSchema } },
    },
    409: {
      description: "Customer record is not linked to this account",
      content: { "application/json": { schema: errorResponseSchema } },
    },
  },
})

const listDocumentsRoute = createRoute({
  method: "get",
  path: "/me/documents",
  responses: {
    200: {
      description: "The authenticated customer's identity documents",
      content: { "application/json": { schema: documentListEnvelopeSchema } },
    },
  },
})

const createDocumentRoute = createRoute({
  method: "post",
  path: "/me/documents",
  request: {
    body: {
      required: true,
      content: { "application/json": { schema: createCustomerPortalProfileDocumentSchema } },
    },
  },
  responses: {
    201: {
      description: "The created identity document",
      content: { "application/json": { schema: documentEnvelopeSchema } },
    },
    404: {
      description: "Customer profile not found",
      content: { "application/json": { schema: errorResponseSchema } },
    },
  },
})

const updateDocumentRoute = createRoute({
  method: "patch",
  path: "/me/documents/{id}",
  request: {
    params: documentIdParamSchema,
    body: {
      required: true,
      content: { "application/json": { schema: updateCustomerPortalProfileDocumentSchema } },
    },
  },
  responses: {
    200: {
      description: "The updated identity document",
      content: { "application/json": { schema: documentEnvelopeSchema } },
    },
    404: {
      description: "Document not found",
      content: { "application/json": { schema: errorResponseSchema } },
    },
  },
})

const deleteDocumentRoute = createRoute({
  method: "delete",
  path: "/me/documents/{id}",
  request: {
    params: documentIdParamSchema,
  },
  responses: {
    200: {
      description: "The identity document was deleted",
      content: { "application/json": { schema: successEnvelopeSchema } },
    },
    404: {
      description: "Document not found",
      content: { "application/json": { schema: errorResponseSchema } },
    },
  },
})

const setPrimaryDocumentRoute = createRoute({
  method: "post",
  path: "/me/documents/{id}/set-primary",
  request: {
    params: documentIdParamSchema,
  },
  responses: {
    200: {
      description: "The document marked as primary",
      content: { "application/json": { schema: documentEnvelopeSchema } },
    },
    404: {
      description: "Document not found",
      content: { "application/json": { schema: errorResponseSchema } },
    },
  },
})

const bootstrapRoute = createRoute({
  method: "post",
  path: "/bootstrap",
  request: {
    body: {
      required: true,
      content: { "application/json": { schema: bootstrapCustomerPortalSchema } },
    },
  },
  responses: {
    200: {
      description: "The bootstrapped (linked or created) customer portal profile",
      content: { "application/json": { schema: bootstrapEnvelopeSchema } },
    },
    404: {
      description: "Customer profile or customer record not found",
      content: { "application/json": { schema: errorResponseSchema } },
    },
    409: {
      // Two shapes share the 409 status: a customer-selection-required result
      // envelope (the caller must pick a candidate), and a hard conflict error
      // (the record is already linked to another account).
      description: "Customer selection required, or record already linked to another account",
      content: {
        "application/json": { schema: z.union([bootstrapEnvelopeSchema, errorResponseSchema]) },
      },
    },
  },
})

const listCompanionsRoute = createRoute({
  method: "get",
  path: "/companions",
  responses: {
    200: {
      description: "The authenticated customer's saved companions",
      content: { "application/json": { schema: companionListEnvelopeSchema } },
    },
  },
})

const createCompanionRoute = createRoute({
  method: "post",
  path: "/companions",
  request: {
    body: {
      required: true,
      content: { "application/json": { schema: createCustomerPortalCompanionSchema } },
    },
  },
  responses: {
    201: {
      description: "The created companion",
      content: { "application/json": { schema: companionEnvelopeSchema } },
    },
    409: {
      description: "Customer record is not linked to this account",
      content: { "application/json": { schema: errorResponseSchema } },
    },
  },
})

const importCompanionsRoute = createRoute({
  method: "post",
  path: "/companions/import-booking-travelers",
  request: {
    body: {
      required: true,
      content: { "application/json": { schema: importCustomerPortalBookingTravelersSchema } },
    },
  },
  responses: {
    200: {
      description: "Companions imported from the customer's booking travelers",
      content: { "application/json": { schema: importEnvelopeSchema } },
    },
    409: {
      description: "Customer record is not linked to this account",
      content: { "application/json": { schema: errorResponseSchema } },
    },
  },
})

const updateCompanionRoute = createRoute({
  method: "patch",
  path: "/companions/{companionId}",
  request: {
    params: companionIdParamSchema,
    body: {
      required: true,
      content: { "application/json": { schema: updateCustomerPortalCompanionSchema } },
    },
  },
  responses: {
    200: {
      description: "The updated companion",
      content: { "application/json": { schema: companionEnvelopeSchema } },
    },
    403: {
      description: "Companion does not belong to this customer",
      content: { "application/json": { schema: errorResponseSchema } },
    },
    404: {
      // `updateCompanion` returns "forbidden" (-> 403) for a missing/unowned
      // companion; this 404 is only reachable when the authenticated user has
      // no linked customer record (the service's `null` branch), matching the
      // other portal routes. A missing companion is a 403, not a 404.
      description: "Customer profile not found",
      content: { "application/json": { schema: errorResponseSchema } },
    },
  },
})

const deleteCompanionRoute = createRoute({
  method: "delete",
  path: "/companions/{companionId}",
  request: {
    params: companionIdParamSchema,
  },
  responses: {
    200: {
      description: "The companion was deleted",
      content: { "application/json": { schema: successEnvelopeSchema } },
    },
    403: {
      description: "Companion does not belong to this customer",
      content: { "application/json": { schema: errorResponseSchema } },
    },
    404: {
      description: "Companion not found",
      content: { "application/json": { schema: errorResponseSchema } },
    },
  },
})

const listBookingsRoute = createRoute({
  method: "get",
  path: "/bookings",
  responses: {
    200: {
      description: "The authenticated customer's bookings",
      content: { "application/json": { schema: bookingSummaryListEnvelopeSchema } },
    },
    404: {
      description: "Customer profile not found",
      content: { "application/json": { schema: errorResponseSchema } },
    },
  },
})

const getBookingRoute = createRoute({
  method: "get",
  path: "/bookings/{bookingId}",
  request: {
    params: bookingIdParamSchema,
  },
  responses: {
    200: {
      description: "The booking detail",
      content: { "application/json": { schema: bookingDetailEnvelopeSchema } },
    },
    404: {
      description: "Booking not found",
      content: { "application/json": { schema: errorResponseSchema } },
    },
  },
})

const listBookingDocumentsRoute = createRoute({
  method: "get",
  path: "/bookings/{bookingId}/documents",
  request: {
    params: bookingIdParamSchema,
  },
  responses: {
    200: {
      description: "The booking's documents",
      content: { "application/json": { schema: bookingDocumentListEnvelopeSchema } },
    },
    404: {
      description: "Booking not found",
      content: { "application/json": { schema: errorResponseSchema } },
    },
  },
})

const getBookingBillingContactRoute = createRoute({
  method: "get",
  path: "/bookings/{bookingId}/billing-contact",
  request: {
    params: bookingIdParamSchema,
  },
  responses: {
    200: {
      description: "The booking's billing contact",
      content: { "application/json": { schema: bookingBillingContactEnvelopeSchema } },
    },
    404: {
      description: "Booking not found",
      content: { "application/json": { schema: errorResponseSchema } },
    },
  },
})

export interface PublicCustomerPortalRouteOptions {
  resolveDocumentDownloadUrl?: (
    bindings: unknown,
    storageKey: string,
  ) => Promise<string | null> | string | null
}

export function createPublicCustomerPortalRoutes(options: PublicCustomerPortalRouteOptions = {}) {
  const getRuntime = (c: Context<Env>) =>
    c.var.container?.resolve<PublicCustomerPortalRouteRuntime>(
      CUSTOMER_PORTAL_ROUTE_RUNTIME_CONTAINER_KEY,
    ) ?? buildPublicCustomerPortalRouteRuntime(c.env, options)

  const resolveOptionalKms = (c: Context<Env>) => getRuntime(c).getOptionalKmsProvider()

  const resolveDocumentDownloadUrl = (c: Context<Env>, storageKey: string) =>
    getRuntime(c).resolveDocumentDownloadUrl?.(storageKey) ?? null

  // `.openapi()` legs are declared first: `OpenAPIHono#get`/`#post`/etc return
  // the base `Hono` type (honojs/middleware#637), so any plain `.get()`/`.post()`
  // leg (and the `.route()` mount) must follow the annotated legs. Static paths
  // precede their parameterized siblings (`/companions/import-booking-travelers`
  // before `/companions/{companionId}`; `/me/documents/{id}/set-primary` is
  // distinct from the `/me/documents/{id}` legs).
  return new OpenAPIHono<Env>({ defaultHook: openApiValidationHook })
    .openapi(getMeRoute, async (c) => {
      const userId = requireCustomerIdentityContext(c).userId

      const profile = await publicCustomerPortalService.getProfileWithOptions(c.get("db"), userId, {
        kms: resolveOptionalKms(c),
      })
      return profile
        ? c.json({ data: profile }, 200)
        : c.json({ error: "Customer profile not found" }, 404)
    })
    .openapi(patchMeRoute, async (c) => {
      const userId = requireCustomerIdentityContext(c).userId

      const result = await publicCustomerPortalService.updateProfileWithOptions(
        c.get("db"),
        userId,
        c.req.valid("json"),
        {
          kms: resolveOptionalKms(c),
        },
      )

      if (hasErrorResult(result)) {
        if (result.error === "not_found") {
          return c.json({ error: "Customer profile not found" }, 404)
        }

        return c.json({ error: "Customer record is not linked to this account" }, 409)
      }

      return c.json({ data: result.profile }, 200)
    })
    .openapi(listDocumentsRoute, async (c) => {
      const userId = requireCustomerIdentityContext(c).userId
      const data = await publicCustomerPortalService.listMyDocuments(c.get("db"), userId, {
        kms: resolveOptionalKms(c),
      })
      return c.json({ data }, 200)
    })
    .openapi(createDocumentRoute, async (c) => {
      const userId = requireCustomerIdentityContext(c).userId
      const row = await publicCustomerPortalService.createMyDocument(
        c.get("db"),
        userId,
        c.req.valid("json"),
        {
          kms: resolveOptionalKms(c),
        },
      )
      if (!row) return c.json({ error: "Customer profile not found" }, 404)
      return c.json({ data: row }, 201)
    })
    .openapi(setPrimaryDocumentRoute, async (c) => {
      const userId = requireCustomerIdentityContext(c).userId
      const row = await publicCustomerPortalService.setPrimaryMyDocument(
        c.get("db"),
        userId,
        c.req.valid("param").id,
        { kms: resolveOptionalKms(c) },
      )
      if (!row) return c.json({ error: "Document not found" }, 404)
      return c.json({ data: row }, 200)
    })
    .openapi(updateDocumentRoute, async (c) => {
      const userId = requireCustomerIdentityContext(c).userId
      const row = await publicCustomerPortalService.updateMyDocument(
        c.get("db"),
        userId,
        c.req.valid("param").id,
        c.req.valid("json"),
        { kms: resolveOptionalKms(c) },
      )
      if (!row) return c.json({ error: "Document not found" }, 404)
      return c.json({ data: row }, 200)
    })
    .openapi(deleteDocumentRoute, async (c) => {
      const userId = requireCustomerIdentityContext(c).userId
      const result = await publicCustomerPortalService.deleteMyDocument(
        c.get("db"),
        userId,
        c.req.valid("param").id,
      )
      if (!result) return c.json({ error: "Document not found" }, 404)
      return c.json({ success: true } as const, 200)
    })
    .openapi(bootstrapRoute, async (c) => {
      const userId = requireCustomerIdentityContext(c).userId

      const result = await publicCustomerPortalService.bootstrap(
        c.get("db"),
        userId,
        c.req.valid("json"),
      )

      if (hasBootstrapErrorResult(result)) {
        if (result.error === "not_found") {
          return c.json({ error: "Customer profile not found" }, 404)
        }

        if (result.error === "customer_record_not_found") {
          return c.json({ error: "Customer record not found" }, 404)
        }

        return c.json({ error: "Customer record is already linked to another account" }, 409)
      }

      if (result.status === "customer_selection_required") {
        return c.json({ data: result }, 409)
      }

      return c.json({ data: result }, 200)
    })
    .openapi(listCompanionsRoute, async (c) => {
      const userId = requireCustomerIdentityContext(c).userId

      return c.json(
        { data: await publicCustomerPortalService.listCompanions(c.get("db"), userId) },
        200,
      )
    })
    .openapi(importCompanionsRoute, async (c) => {
      const buyer = requirePersonalCustomerBuyerContext(c)

      const result = await publicCustomerPortalService.importBookingTravelersAsCompanions(
        c.get("db"),
        buyer,
        c.req.valid("json"),
      )

      if (!result) {
        return c.json({ error: "Customer record is not linked to this account" }, 409)
      }

      return c.json({ data: result }, 200)
    })
    .openapi(createCompanionRoute, async (c) => {
      const userId = requireCustomerIdentityContext(c).userId

      const companion = await publicCustomerPortalService.createCompanion(
        c.get("db"),
        userId,
        c.req.valid("json"),
      )

      if (!companion) {
        return c.json({ error: "Customer record is not linked to this account" }, 409)
      }

      return c.json({ data: companion }, 201)
    })
    .openapi(updateCompanionRoute, async (c) => {
      const userId = requireCustomerIdentityContext(c).userId

      const companion = await publicCustomerPortalService.updateCompanion(
        c.get("db"),
        userId,
        c.req.valid("param").companionId,
        c.req.valid("json"),
      )

      if (companion === "forbidden") {
        // Thrown (not returned) so the app's error boundary serializes the
        // 403 with its full `{ error, code, requestId }` body; throwing keeps
        // the handler's return type unified with the route's typed response
        // union while still declaring the 403 in the OpenAPI responses.
        throw new ForbiddenApiError("Companion does not belong to this customer")
      }

      if (!companion) {
        return c.json({ error: "Customer profile not found" }, 404)
      }

      return c.json({ data: companion }, 200)
    })
    .openapi(deleteCompanionRoute, async (c) => {
      const userId = requireCustomerIdentityContext(c).userId

      const result = await publicCustomerPortalService.deleteCompanion(
        c.get("db"),
        userId,
        c.req.valid("param").companionId,
      )

      if (result === "forbidden") {
        throw new ForbiddenApiError("Companion does not belong to this customer")
      }

      if (result === "not_found") {
        return c.json({ error: "Companion not found" }, 404)
      }

      return c.json({ success: true } as const, 200)
    })
    .openapi(listBookingsRoute, async (c) => {
      const buyer = requireCustomerBuyerContext(c)

      const bookings = await publicCustomerPortalService.listBookings(c.get("db"), buyer)
      return bookings
        ? c.json({ data: bookings }, 200)
        : c.json({ error: "Customer profile not found" }, 404)
    })
    .openapi(getBookingRoute, async (c) => {
      const buyer = requireCustomerBuyerContext(c)

      const booking = await publicCustomerPortalService.getBooking(
        c.get("db"),
        buyer,
        c.req.valid("param").bookingId,
        {
          resolveDocumentDownloadUrl: (storageKey) => resolveDocumentDownloadUrl(c, storageKey),
        },
      )

      return booking ? c.json({ data: booking }, 200) : c.json({ error: "Booking not found" }, 404)
    })
    .openapi(listBookingDocumentsRoute, async (c) => {
      const buyer = requireCustomerBuyerContext(c)

      const documents = await publicCustomerPortalService.listBookingDocuments(
        c.get("db"),
        buyer,
        c.req.valid("param").bookingId,
        {
          resolveDocumentDownloadUrl: (storageKey) => resolveDocumentDownloadUrl(c, storageKey),
        },
      )

      return documents
        ? c.json({ data: documents }, 200)
        : c.json({ error: "Booking not found" }, 404)
    })
    .openapi(getBookingBillingContactRoute, async (c) => {
      const buyer = requireCustomerBuyerContext(c)

      const billingContact = await publicCustomerPortalService.getBookingBillingContact(
        c.get("db"),
        buyer,
        c.req.valid("param").bookingId,
      )

      return billingContact
        ? c.json({ data: billingContact }, 200)
        : c.json({ error: "Booking not found" }, 404)
    })
    .route("/", customerPortalRoutes)
}

export const publicCustomerPortalRoutes = createPublicCustomerPortalRoutes()

export type PublicCustomerPortalRoutes = typeof publicCustomerPortalRoutes
