import { OpenAPIHono } from "@hono/zod-openapi"
import {
  appendActionLedgerMutation,
  appendActionLedgerSensitiveRead,
} from "@voyant-travel/action-ledger"
import type { AnyDrizzleDb } from "@voyant-travel/db"
import { ForbiddenApiError, openApiValidationHook, requireUserId } from "@voyant-travel/hono"
import { permissionStringsToPermissions } from "@voyant-travel/types/api-keys"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"
import type { Context } from "hono"
import { z } from "zod"

import { BOOKING_CUSTOMER_ACCESS_CAPABILITIES } from "./action-ledger-capabilities.js"
import {
  grantBookingCustomerAccess,
  listBookingCustomerAccess,
  revokeBookingCustomerAccess,
} from "./customer-access.js"
import { createBookingsAdminRoute as createRoute } from "./routes-openapi.js"
import { type Env, getActionLedgerRequestContext } from "./routes-shared.js"
import type { BookingCustomerAccessGrant } from "./schema-customer-access.js"
import { bookingsService } from "./service.js"
import {
  bookingCustomerAccessGrantResponseSchema,
  staffGrantBookingCustomerAccessSchema,
  staffRevokeBookingCustomerAccessSchema,
} from "./validation-customer-access.js"

const CUSTOMER_ACCESS_RESOURCE = "booking-customer-access"
const CUSTOMER_ACCESS_AUTHORIZATION_SOURCE = "booking-customer-access.explicit-scope"
const idempotencyHeaderSchema = z.object({
  "idempotency-key": z.string().trim().min(1).max(200),
})
const bookingIdParamSchema = z.object({ bookingId: z.string().min(1) })
const grantIdParamSchema = bookingIdParamSchema.extend({ grantId: z.string().min(1) })
const errorResponseSchema = z.object({ error: z.string() })

function jsonBody<S extends z.ZodTypeAny>(schema: S, description: string) {
  return { required: true, description, content: { "application/json": { schema } } }
}

function dataResponse<S extends z.ZodTypeAny>(schema: S, description: string) {
  return {
    description,
    content: { "application/json": { schema: z.object({ data: schema }) } },
  }
}

const errorResponse = (description: string) => ({
  description,
  content: { "application/json": { schema: errorResponseSchema } },
})

const listCustomerAccessRoute = createRoute({
  method: "get",
  path: "/{bookingId}/customer-access",
  request: { params: bookingIdParamSchema },
  responses: {
    200: dataResponse(z.array(bookingCustomerAccessGrantResponseSchema), "Booking customer access"),
    403: errorResponse("Missing booking-customer-access:read"),
    404: errorResponse("Booking not found"),
  },
})

const grantCustomerAccessRoute = createRoute({
  method: "post",
  path: "/{bookingId}/customer-access",
  request: {
    params: bookingIdParamSchema,
    headers: idempotencyHeaderSchema,
    body: jsonBody(staffGrantBookingCustomerAccessSchema, "Customer access grant"),
  },
  responses: {
    201: dataResponse(bookingCustomerAccessGrantResponseSchema, "The customer access grant"),
    200: dataResponse(
      bookingCustomerAccessGrantResponseSchema,
      "The existing customer access grant",
    ),
    400: errorResponse("Invalid request"),
    403: errorResponse("Missing booking-customer-access:write"),
    404: errorResponse("Booking not found"),
    409: errorResponse("Idempotency conflict"),
  },
})

const revokeCustomerAccessRoute = createRoute({
  method: "delete",
  path: "/{bookingId}/customer-access/{grantId}",
  request: {
    params: grantIdParamSchema,
    headers: idempotencyHeaderSchema,
    body: jsonBody(staffRevokeBookingCustomerAccessSchema, "Customer access revocation"),
  },
  responses: {
    200: dataResponse(
      bookingCustomerAccessGrantResponseSchema,
      "The revoked customer access grant",
    ),
    400: errorResponse("Invalid request"),
    403: errorResponse("Missing booking-customer-access:write"),
    404: errorResponse("Customer access grant not found"),
    409: errorResponse("Idempotency conflict"),
  },
})

function requireCustomerAccessPermission(c: Context<Env>, action: "read" | "write") {
  const permissions = permissionStringsToPermissions(c.get("scopes") ?? [])
  const actions = permissions[CUSTOMER_ACCESS_RESOURCE] ?? []
  if (!actions.includes("*") && !actions.includes(action)) {
    throw new ForbiddenApiError()
  }
}

function toWireGrant(grant: BookingCustomerAccessGrant) {
  return bookingCustomerAccessGrantResponseSchema.parse({
    ...grant,
    createdAt: grant.createdAt.toISOString(),
    updatedAt: grant.updatedAt.toISOString(),
    revokedAt: grant.revokedAt?.toISOString() ?? null,
  })
}

export const bookingCustomerAccessAdminRoutes = new OpenAPIHono<Env>({
  defaultHook: openApiValidationHook,
})
  .openapi(listCustomerAccessRoute, async (c) => {
    requireCustomerAccessPermission(c, "read")
    const bookingId = c.req.valid("param").bookingId
    const result = await c.get("db").transaction(async (tx) => {
      if (!(await bookingsService.getBookingById(tx, bookingId))) return null
      const grants = await listBookingCustomerAccess(tx, bookingId)
      await appendActionLedgerSensitiveRead(tx as AnyDrizzleDb, {
        context: getActionLedgerRequestContext(c),
        actionName: "booking.customer_access.list",
        actionVersion: BOOKING_CUSTOMER_ACCESS_CAPABILITIES.list.version,
        status: "succeeded",
        evaluatedRisk: "high",
        targetType: "booking_customer_access",
        targetId: bookingId,
        routeOrToolName: "bookings.customer-access.list",
        capabilityId: BOOKING_CUSTOMER_ACCESS_CAPABILITIES.list.id,
        capabilityVersion: BOOKING_CUSTOMER_ACCESS_CAPABILITIES.list.version,
        authorizationSource: CUSTOMER_ACCESS_AUTHORIZATION_SOURCE,
        disclosedFieldSet: [
          "buyerAccountId",
          "buyerAccountKind",
          "source",
          "proofRef",
          "grantedByPrincipalId",
          "grantedByMembershipId",
          "grantedByMembershipRole",
          "grantState",
        ],
        disclosureSummary: `Listed ${grants.length} Booking customer access grant(s)`,
        decisionPolicy: "booking-customer-access-explicit-scope-v1",
      })
      return grants
    })
    if (!result) return c.json({ error: "Booking not found" }, 404)
    return c.json({ data: result.map(toWireGrant) }, 200)
  })
  .openapi(grantCustomerAccessRoute, async (c) => {
    requireCustomerAccessPermission(c, "write")
    const staffId = requireUserId(c)
    const bookingId = c.req.valid("param").bookingId
    const idempotencyKey = c.req.valid("header")["idempotency-key"]
    const input = c.req.valid("json")
    const result = await c.get("db").transaction(async (tx) => {
      if (!(await bookingsService.getBookingById(tx, bookingId))) {
        return { status: "booking_not_found" as const }
      }
      const command = await grantBookingCustomerAccess(tx as PostgresJsDatabase, {
        bookingId,
        buyerAccount: { id: input.buyerAccountId, kind: input.buyerAccountKind },
        role: "owner",
        source: "staff_grant",
        proofRef: `staff-command:${idempotencyKey}`,
        grantedByPrincipalId: staffId,
        idempotencyKey,
      })
      if (!command.grant) return command
      if (command.status !== "replayed") {
        await appendActionLedgerMutation(tx as AnyDrizzleDb, {
          context: getActionLedgerRequestContext(c),
          actionName: "booking.customer_access.grant",
          actionVersion: BOOKING_CUSTOMER_ACCESS_CAPABILITIES.grant.version,
          actionKind: "create",
          evaluatedRisk: "high",
          targetType: "booking_customer_access",
          targetId: command.grant.id,
          routeOrToolName: "bookings.customer-access.grant",
          capabilityId: BOOKING_CUSTOMER_ACCESS_CAPABILITIES.grant.id,
          capabilityVersion: BOOKING_CUSTOMER_ACCESS_CAPABILITIES.grant.version,
          authorizationSource: CUSTOMER_ACCESS_AUTHORIZATION_SOURCE,
          idempotencyScope: `booking-customer-access:grant:${bookingId}`,
          idempotencyKey,
          mutationDetail: {
            summary: `Granted Booking customer access: ${input.reason}`,
            reversalKind: "compensate",
          },
        })
      }
      return command
    })
    if (result.status === "booking_not_found" || result.status === "not_found") {
      return c.json({ error: "Booking not found" }, 404)
    }
    if (result.status === "idempotency_conflict") {
      return c.json({ error: "Idempotency conflict" }, 409)
    }
    if (!("grant" in result) || !result.grant) {
      return c.json({ error: "Booking not found" }, 404)
    }
    const response = { data: toWireGrant(result.grant) }
    if (result.status === "created" || result.status === "reactivated") {
      return c.json(response, 201)
    }
    return c.json(response, 200)
  })
  .openapi(revokeCustomerAccessRoute, async (c) => {
    requireCustomerAccessPermission(c, "write")
    const staffId = requireUserId(c)
    const { bookingId, grantId } = c.req.valid("param")
    const idempotencyKey = c.req.valid("header")["idempotency-key"]
    const input = c.req.valid("json")
    const result = await c.get("db").transaction(async (tx) => {
      const command = await revokeBookingCustomerAccess(tx as PostgresJsDatabase, {
        bookingId,
        grantId,
        reason: input.reason,
        revokedByPrincipalId: staffId,
        idempotencyKey,
      })
      if (!command.grant) return command
      if (command.status !== "replayed") {
        await appendActionLedgerMutation(tx as AnyDrizzleDb, {
          context: getActionLedgerRequestContext(c),
          actionName: "booking.customer_access.revoke",
          actionVersion: BOOKING_CUSTOMER_ACCESS_CAPABILITIES.revoke.version,
          actionKind: "delete",
          evaluatedRisk: "high",
          targetType: "booking_customer_access",
          targetId: command.grant.id,
          routeOrToolName: "bookings.customer-access.revoke",
          capabilityId: BOOKING_CUSTOMER_ACCESS_CAPABILITIES.revoke.id,
          capabilityVersion: BOOKING_CUSTOMER_ACCESS_CAPABILITIES.revoke.version,
          authorizationSource: CUSTOMER_ACCESS_AUTHORIZATION_SOURCE,
          idempotencyScope: `booking-customer-access:revoke:${bookingId}:${grantId}`,
          idempotencyKey,
          mutationDetail: {
            summary: `Revoked Booking customer access: ${input.reason}`,
            reversalKind: "compensate",
          },
        })
      }
      return command
    })
    if (result.status === "not_found") {
      return c.json({ error: "Customer access grant not found" }, 404)
    }
    if (result.status === "idempotency_conflict") {
      return c.json({ error: "Idempotency conflict" }, 409)
    }
    if (!("grant" in result) || !result.grant) {
      return c.json({ error: "Customer access grant not found" }, 404)
    }
    return c.json({ data: toWireGrant(result.grant) }, 200)
  })

export const __test__ = { requireCustomerAccessPermission }
