import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi"
import {
  openApiValidationHook,
  parseJsonBody,
  parseQuery,
  type VoyantDb,
} from "@voyant-travel/hono"
import { hasApiKeyPermission, permissionStringsToPermissions } from "@voyant-travel/types/api-keys"
import type { Context } from "hono"

import {
  customerBusinessAccountDecisionInputSchema,
  customerBusinessAccountProvisionInputSchema,
  customerBusinessAccountRequestListQuerySchema,
} from "./customer-business-accounts-contracts.js"
import type {
  CustomerBusinessAccountOnboardingRuntimeProvider,
  CustomerBusinessOnboardingContext,
} from "./customer-business-onboarding-runtime-port.js"
import {
  CustomerBusinessOnboardingConflictError,
  CustomerBusinessOnboardingNotFoundError,
} from "./customer-business-onboarding-service.js"

type CustomerBusinessAdminEnv = {
  Bindings: Record<string, unknown>
  Variables: { userId?: string; scopes?: string[]; db: VoyantDb }
}
type CustomerBusinessAdminContext = Context<CustomerBusinessAdminEnv>

const apiId = "@voyant-travel/auth#customer-business-accounts.api.admin"
const requestIdParams = z.object({ requestId: z.string().min(1) })
const provisionOpenApiSchema = z
  .object({
    idempotencyKey: z.string().min(8).max(200),
    publicApiOrigin: z.url(),
    owner: z.object({ userId: z.string().min(1).optional(), email: z.email().optional() }).strict(),
    relationshipOrganizationId: z.string().min(1).optional(),
    profile: z
      .object({
        name: z.string().min(1).max(200),
        legalName: z.string().nullable().optional(),
        taxId: z.string().nullable().optional(),
        website: z.url().nullable().optional(),
      })
      .strict()
      .optional(),
  })
  .strict()
const jsonBody = <T extends z.ZodTypeAny>(schema: T) => ({
  required: true,
  content: { "application/json": { schema } },
})
const responses = (...statuses: number[]) =>
  Object.fromEntries(statuses.map((status) => [status, { description: `HTTP ${status}` }]))
const adminRoute = <M extends "get" | "post", P extends string>(config: {
  method: M
  path: P
  operationId: string
  request?: Record<string, unknown>
  statuses: number[]
}) =>
  createRoute({
    method: config.method,
    path: config.path,
    operationId: config.operationId,
    "x-voyant-api-id": apiId,
    ...(config.request ? { request: config.request } : {}),
    responses: responses(...config.statuses),
  })

const capabilitiesRoute = adminRoute({
  method: "get",
  path: "/capabilities",
  operationId: "getCustomerBusinessAccountCapabilities",
  statuses: [200, 401, 403],
})
const listRequestsRoute = adminRoute({
  method: "get",
  path: "/requests",
  operationId: "listCustomerBusinessAccountRequests",
  request: { query: customerBusinessAccountRequestListQuerySchema },
  statuses: [200, 401, 403],
})
const approveRequestRoute = adminRoute({
  method: "post",
  path: "/requests/{requestId}/approve",
  operationId: "approveCustomerBusinessAccountRequest",
  request: {
    params: requestIdParams,
    body: jsonBody(customerBusinessAccountDecisionInputSchema),
  },
  statuses: [200, 400, 401, 403, 404, 409],
})
const rejectRequestRoute = adminRoute({
  method: "post",
  path: "/requests/{requestId}/reject",
  operationId: "rejectCustomerBusinessAccountRequest",
  request: {
    params: requestIdParams,
    body: jsonBody(customerBusinessAccountDecisionInputSchema),
  },
  statuses: [200, 400, 401, 403, 404, 409],
})
const provisionAccountRoute = adminRoute({
  method: "post",
  path: "/accounts",
  operationId: "provisionCustomerBusinessAccount",
  // The runtime parser below enforces the exact XOR/refinement contract. Keep
  // the route schema OpenAPI-native because refined/transformed Zod pipes do
  // not have an unambiguous JSON Schema representation.
  request: { body: jsonBody(provisionOpenApiSchema) },
  statuses: [201, 400, 401, 403, 404, 409],
})

function runtimeContext(
  c: CustomerBusinessAdminContext,
): { context: CustomerBusinessOnboardingContext; userId: string } | Response {
  const userId = c.get("userId")
  if (!userId) return c.json({ error: "Unauthorized" }, 401)
  return { context: { bindings: c.env, db: c.get("db") }, userId }
}

function onboardingError(c: CustomerBusinessAdminContext, error: unknown): Response {
  if (error instanceof CustomerBusinessOnboardingNotFoundError) {
    return c.json({ error: error.message }, 404)
  }
  if (error instanceof CustomerBusinessOnboardingConflictError) {
    return c.json({ error: error.message }, 409)
  }
  throw error
}

function canManageCustomerBusinessAccounts(c: CustomerBusinessAdminContext) {
  return hasApiKeyPermission(
    permissionStringsToPermissions(c.get("scopes") ?? []),
    "customer-business-accounts",
    "write",
  )
}

export function createCustomerBusinessAccountAdminRoutes(
  runtime: CustomerBusinessAccountOnboardingRuntimeProvider,
) {
  const routes = new OpenAPIHono<CustomerBusinessAdminEnv>({
    defaultHook: openApiValidationHook,
  })

  const run = async <T>(
    c: CustomerBusinessAdminContext,
    operation: (context: CustomerBusinessOnboardingContext, userId: string) => Promise<T>,
  ): Promise<T | Response> => {
    const resolved = runtimeContext(c)
    if (resolved instanceof Response) return resolved
    try {
      return await operation(resolved.context, resolved.userId)
    } catch (error) {
      return onboardingError(c, error)
    }
  }

  routes.openapi(capabilitiesRoute, async (c) => {
    const result = await run(c, (context) => runtime.getCapabilities(context))
    if (result instanceof Response) return result
    const canManage = canManageCustomerBusinessAccounts(c)
    return c.json({
      data: {
        ...result,
        decideRequests: result.decideRequests && canManage,
        provisionAccounts: result.provisionAccounts && canManage,
      },
    })
  })
  routes.openapi(listRequestsRoute, async (c) => {
    const query = parseQuery(c, customerBusinessAccountRequestListQuerySchema)
    const result = await run(c, (context) => runtime.listRequests(context, query))
    return result instanceof Response ? result : c.json({ data: result })
  })
  routes.openapi(approveRequestRoute, async (c) => {
    const { requestId } = c.req.param()
    const input = await parseJsonBody(c, customerBusinessAccountDecisionInputSchema)
    const result = await run(c, (context, decidedBy) =>
      runtime.approveRequest(context, { requestId, decidedBy, reason: input.reason }),
    )
    return result instanceof Response ? result : c.json({ data: result })
  })
  routes.openapi(rejectRequestRoute, async (c) => {
    const { requestId } = c.req.param()
    const input = await parseJsonBody(c, customerBusinessAccountDecisionInputSchema)
    const result = await run(c, (context, decidedBy) =>
      runtime.rejectRequest(context, { requestId, decidedBy, reason: input.reason }),
    )
    return result instanceof Response ? result : c.json({ data: result })
  })
  routes.openapi(provisionAccountRoute, async (c) => {
    const input = await parseJsonBody(c, customerBusinessAccountProvisionInputSchema)
    const result = await run(c, (context, decidedBy) =>
      runtime.provisionBusinessAccount(context, { ...input, decidedBy }),
    )
    return result instanceof Response ? result : c.json({ data: result }, 201)
  })

  return routes
}
