import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi"
import { openApiValidationHook, parseJsonBody, type VoyantDb } from "@voyant-travel/hono"
import { hasApiKeyPermission, permissionStringsToPermissions } from "@voyant-travel/types/api-keys"
import type { Context } from "hono"

import {
  issuePublicApiKeyInputSchema,
  putCustomerProviderCredentialInputSchema,
  updateCustomerAccountPolicyInputSchema,
  updateCustomerAuthMethodsInputSchema,
  updatePublicApiKeyInputSchema,
} from "./public-api-admin-contracts.js"
import { PublicApiInputError } from "./public-api-origins.js"
import type {
  PublicApiChannelProvider,
  PublicApiKeyDto,
  PublicApiRequestContext,
  PublicApiRuntimeProvider,
} from "./public-api-runtime-port.js"

type PublicApiEnv = {
  Bindings: Record<string, unknown>
  Variables: {
    userId?: string
    scopes?: string[] | null
    db: VoyantDb
    link?: PublicApiRequestContext["link"]
  }
}
type PublicApiRouteContext = Context<PublicApiEnv>

const publicApiAdminApiId = "@voyant-travel/auth#public-api-keys.api.admin"
const customerAccountsAdminApiId = "@voyant-travel/auth#customer-accounts.api.admin"

const jsonBody = <T extends z.ZodTypeAny>(schema: T) => ({
  required: true,
  content: { "application/json": { schema } },
})
const responses = (...statuses: number[]) =>
  Object.fromEntries(statuses.map((status) => [status, { description: `HTTP ${status}` }]))

const routeFor =
  (apiId: string) =>
  <M extends "get" | "post" | "put" | "patch" | "delete", P extends string>(config: {
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

const publicApiRoute = routeFor(publicApiAdminApiId)
const customerAccountsRoute = routeFor(customerAccountsAdminApiId)

const keyIdParams = z.object({ keyId: z.string() })
const providerParams = z.object({ provider: z.enum(["google", "facebook", "apple"]) })

/**
 * Resolve the operator request context. The deployment is the tenant boundary
 * (docs/adr/0001-tenant-scoping.md), so there is no organization to derive: the
 * `/v1/admin/*` staff guard admits the caller and the resource's `:write` scope
 * gates the writes.
 */
function requestContext(c: PublicApiRouteContext): PublicApiRequestContext | Response {
  const userId = c.get("userId")
  if (!userId) return c.json({ error: "Unauthorized" }, 401)
  return { bindings: c.env, db: c.get("db"), link: c.get("link") }
}

function requireManage(c: PublicApiRouteContext, resource: string): Response | null {
  const granted = hasApiKeyPermission(
    permissionStringsToPermissions(c.get("scopes") ?? []),
    resource,
    "write",
  )
  return granted ? null : c.json({ error: "Forbidden" }, 403)
}

function handleError(c: PublicApiRouteContext, error: unknown): Response {
  if (error instanceof PublicApiInputError) {
    return c.json({ error: error.message }, 400)
  }
  if (
    error instanceof Error &&
    "status" in error &&
    typeof error.status === "number" &&
    error.status >= 400 &&
    error.status <= 599
  ) {
    return c.json({ error: error.message }, error.status as 400)
  }
  throw error
}

// --- Public API: keys --------------------------------------------------------

const listKeysRoute = publicApiRoute({
  method: "get",
  path: "/keys",
  operationId: "listPublicApiKeys",
  statuses: [200, 401, 403],
})
const issueKeyRoute = publicApiRoute({
  method: "post",
  path: "/keys",
  operationId: "issuePublicApiKey",
  request: { body: jsonBody(issuePublicApiKeyInputSchema) },
  statuses: [201, 400, 401, 403],
})
const getKeyRoute = publicApiRoute({
  method: "get",
  path: "/keys/{keyId}",
  operationId: "getPublicApiKey",
  request: { params: keyIdParams },
  statuses: [200, 401, 403, 404],
})
const updateKeyRoute = publicApiRoute({
  method: "patch",
  path: "/keys/{keyId}",
  operationId: "updatePublicApiKey",
  request: { params: keyIdParams, body: jsonBody(updatePublicApiKeyInputSchema) },
  statuses: [200, 400, 401, 403, 404],
})
const rotateKeyRoute = publicApiRoute({
  method: "post",
  path: "/keys/{keyId}/rotate",
  operationId: "rotatePublicApiKey",
  request: { params: keyIdParams },
  statuses: [201, 400, 401, 403, 404],
})
const revokeKeyRoute = publicApiRoute({
  method: "delete",
  path: "/keys/{keyId}",
  operationId: "revokePublicApiKey",
  request: { params: keyIdParams },
  statuses: [204, 401, 403, 404],
})

export interface PublicApiAdminRouteOptions {
  /** Reads `channels` on behalf of the public API; absent leaves keys unprojected. */
  channels?: PublicApiChannelProvider | null
}

export function createPublicApiAdminRoutes(
  runtime: PublicApiRuntimeProvider,
  options: PublicApiAdminRouteOptions = {},
) {
  const routes = new OpenAPIHono<PublicApiEnv>({ defaultHook: openApiValidationHook })

  /**
   * Project the resolved channel onto keys. Batched, because a deployment with
   * twenty keys should not issue twenty channel lookups to render one list.
   */
  const withChannels = async (context: PublicApiRequestContext, keys: PublicApiKeyDto[]) => {
    if (!options.channels) return keys
    const resolved = await options.channels.resolveChannelsForKeys(
      context,
      keys.map((key) => key.channelId),
    )
    return keys.map((key) => ({ ...key, channel: resolved.get(key.channelId) ?? null }))
  }

  routes.openapi(listKeysRoute, async (c) => {
    const context = requestContext(c)
    if (context instanceof Response) return context
    const keys = await runtime.listApiKeys(context)
    return c.json({ data: await withChannels(context, keys) }, 200)
  })

  routes.openapi(getKeyRoute, async (c) => {
    const context = requestContext(c)
    if (context instanceof Response) return context
    try {
      const key = await runtime.getApiKey(context, c.req.param("keyId"))
      const [projected] = await withChannels(context, [key])
      return c.json({ data: projected }, 200)
    } catch (error) {
      return handleError(c, error)
    }
  })

  routes.openapi(issueKeyRoute, async (c) => {
    const context = requestContext(c)
    if (context instanceof Response) return context
    const forbidden = requireManage(c, "public-api-keys")
    if (forbidden) return forbidden
    const body = await parseJsonBody(c, issuePublicApiKeyInputSchema)
    if (body instanceof Response) return body
    try {
      return c.json({ data: await runtime.issueApiKey(context, body) }, 201)
    } catch (error) {
      return handleError(c, error)
    }
  })

  routes.openapi(updateKeyRoute, async (c) => {
    const context = requestContext(c)
    if (context instanceof Response) return context
    const forbidden = requireManage(c, "public-api-keys")
    if (forbidden) return forbidden
    const body = await parseJsonBody(c, updatePublicApiKeyInputSchema)
    if (body instanceof Response) return body
    try {
      const key = await runtime.updateApiKey(context, c.req.param("keyId"), body)
      const [projected] = await withChannels(context, [key])
      return c.json({ data: projected }, 200)
    } catch (error) {
      return handleError(c, error)
    }
  })

  routes.openapi(rotateKeyRoute, async (c) => {
    const context = requestContext(c)
    if (context instanceof Response) return context
    const forbidden = requireManage(c, "public-api-keys")
    if (forbidden) return forbidden
    try {
      return c.json({ data: await runtime.rotateApiKey(context, c.req.param("keyId")) }, 201)
    } catch (error) {
      return handleError(c, error)
    }
  })

  routes.openapi(revokeKeyRoute, async (c) => {
    const context = requestContext(c)
    if (context instanceof Response) return context
    // Revoking is `delete`, not `write`: it is the action that takes a live
    // frontend off the air, and an operator trusted to rename a key is not
    // automatically trusted to do that.
    const granted = hasApiKeyPermission(
      permissionStringsToPermissions(c.get("scopes") ?? []),
      "public-api-keys",
      "delete",
    )
    if (!granted) return c.json({ error: "Forbidden" }, 403)
    try {
      await runtime.revokeApiKey(context, c.req.param("keyId"))
      return c.body(null, 204)
    } catch (error) {
      return handleError(c, error)
    }
  })

  return routes
}

// --- Customer accounts -------------------------------------------------------

const capabilitiesRoute = customerAccountsRoute({
  method: "get",
  path: "/capabilities",
  operationId: "getCustomerAccountCapabilities",
  statuses: [200, 401, 403],
})
const getSettingsRoute = customerAccountsRoute({
  method: "get",
  path: "/settings",
  operationId: "getCustomerAccountSettings",
  statuses: [200, 401, 403],
})
const updateMethodsRoute = customerAccountsRoute({
  method: "put",
  path: "/settings/methods",
  operationId: "updateCustomerAuthMethods",
  request: { body: jsonBody(updateCustomerAuthMethodsInputSchema) },
  statuses: [200, 400, 401, 403],
})
const updateAccountPolicyRoute = customerAccountsRoute({
  method: "put",
  path: "/settings/account-policy",
  operationId: "updateCustomerAccountPolicy",
  request: { body: jsonBody(updateCustomerAccountPolicyInputSchema) },
  statuses: [200, 400, 401, 403],
})
const listProviderCredentialsRoute = customerAccountsRoute({
  method: "get",
  path: "/provider-credentials",
  operationId: "listCustomerProviderCredentials",
  statuses: [200, 401, 403],
})
const putProviderCredentialRoute = customerAccountsRoute({
  method: "put",
  path: "/provider-credentials/{provider}",
  operationId: "putCustomerProviderCredential",
  request: { params: providerParams, body: jsonBody(putCustomerProviderCredentialInputSchema) },
  statuses: [204, 400, 401, 403],
})
const deleteProviderCredentialRoute = customerAccountsRoute({
  method: "delete",
  path: "/provider-credentials/{provider}",
  operationId: "deleteCustomerProviderCredential",
  request: { params: providerParams },
  statuses: [204, 400, 401, 403],
})

export interface CustomerAccountsAdminRouteOptions {
  /** Whether the deployment supports business (organization) buyer accounts. */
  businessAccounts: boolean
}

export function createCustomerAccountsAdminRoutes(
  runtime: PublicApiRuntimeProvider,
  options: CustomerAccountsAdminRouteOptions,
) {
  const routes = new OpenAPIHono<PublicApiEnv>({ defaultHook: openApiValidationHook })

  routes.openapi(capabilitiesRoute, async (c) => {
    const context = requestContext(c)
    if (context instanceof Response) return context
    return c.json({ data: { businessAccounts: options.businessAccounts } }, 200)
  })

  routes.openapi(getSettingsRoute, async (c) => {
    const context = requestContext(c)
    if (context instanceof Response) return context
    try {
      return c.json({ data: await runtime.getCustomerAccountSettings(context) }, 200)
    } catch (error) {
      return handleError(c, error)
    }
  })

  routes.openapi(updateMethodsRoute, async (c) => {
    const context = requestContext(c)
    if (context instanceof Response) return context
    const forbidden = requireManage(c, "customer-accounts")
    if (forbidden) return forbidden
    const body = await parseJsonBody(c, updateCustomerAuthMethodsInputSchema)
    if (body instanceof Response) return body
    try {
      return c.json(
        { data: await runtime.updateCustomerAccountSettings(context, { methods: body.methods }) },
        200,
      )
    } catch (error) {
      return handleError(c, error)
    }
  })

  routes.openapi(updateAccountPolicyRoute, async (c) => {
    const context = requestContext(c)
    if (context instanceof Response) return context
    const forbidden = requireManage(c, "customer-accounts")
    if (forbidden) return forbidden
    const body = await parseJsonBody(c, updateCustomerAccountPolicyInputSchema)
    if (body instanceof Response) return body
    try {
      return c.json(
        {
          data: await runtime.updateCustomerAccountSettings(context, {
            accountPolicy: body.accountPolicy,
          }),
        },
        200,
      )
    } catch (error) {
      return handleError(c, error)
    }
  })

  routes.openapi(listProviderCredentialsRoute, async (c) => {
    const context = requestContext(c)
    if (context instanceof Response) return context
    try {
      return c.json({ data: await runtime.listProviderCredentials(context) }, 200)
    } catch (error) {
      return handleError(c, error)
    }
  })

  routes.openapi(putProviderCredentialRoute, async (c) => {
    const context = requestContext(c)
    if (context instanceof Response) return context
    const forbidden = requireManage(c, "customer-accounts")
    if (forbidden) return forbidden
    const body = await parseJsonBody(c, putCustomerProviderCredentialInputSchema)
    if (body instanceof Response) return body
    try {
      await runtime.putProviderCredential(
        context,
        c.req.param("provider") as "google" | "facebook" | "apple",
        body.credentials,
      )
      return c.body(null, 204)
    } catch (error) {
      return handleError(c, error)
    }
  })

  routes.openapi(deleteProviderCredentialRoute, async (c) => {
    const context = requestContext(c)
    if (context instanceof Response) return context
    const forbidden = requireManage(c, "customer-accounts")
    if (forbidden) return forbidden
    try {
      await runtime.deleteProviderCredential(
        context,
        c.req.param("provider") as "google" | "facebook" | "apple",
      )
      return c.body(null, 204)
    } catch (error) {
      return handleError(c, error)
    }
  })

  return routes
}
