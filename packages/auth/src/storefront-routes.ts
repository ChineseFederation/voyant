import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi"
import { openApiValidationHook, parseJsonBody, type VoyantDb } from "@voyant-travel/hono"
import { hasApiKeyPermission, permissionStringsToPermissions } from "@voyant-travel/types/api-keys"
import type { Context } from "hono"

import {
  createStorefrontInputSchema,
  issueStorefrontApiKeyInputSchema,
  putStorefrontProviderCredentialInputSchema,
  setStorefrontAllowedOriginsInputSchema,
  setStorefrontChannelBindingInputSchema,
  updateStorefrontAccountPolicyInputSchema,
  updateStorefrontInputSchema,
  updateStorefrontMethodsInputSchema,
} from "./storefront-admin-contracts.js"
import { StorefrontInputError } from "./storefront-origins.js"
import type {
  StorefrontChannelBindingProvider,
  StorefrontRequestContext,
  StorefrontRuntimeProvider,
  StorefrontWithChannelBindingDto,
} from "./storefront-runtime-port.js"

type StorefrontEnv = {
  Bindings: Record<string, unknown>
  Variables: {
    userId?: string
    scopes?: string[] | null
    db: VoyantDb
    link?: StorefrontRequestContext["link"]
  }
}
type StorefrontRouteContext = Context<StorefrontEnv>

const storefrontAdminApiId = "@voyant-travel/auth#storefront.api.admin"
const jsonBody = <T extends z.ZodTypeAny>(schema: T) => ({
  required: true,
  content: { "application/json": { schema } },
})
const responses = (...statuses: number[]) =>
  Object.fromEntries(statuses.map((status) => [status, { description: `HTTP ${status}` }]))
const storefrontRoute = <
  M extends "get" | "post" | "put" | "patch" | "delete",
  P extends string,
>(config: {
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
    "x-voyant-api-id": storefrontAdminApiId,
    ...(config.request ? { request: config.request } : {}),
    responses: responses(...config.statuses),
  })

const storefrontIdParams = z.object({ storefrontId: z.string() })
const keyIdParams = z.object({ storefrontId: z.string(), keyId: z.string() })
const providerParams = z.object({
  storefrontId: z.string(),
  provider: z.enum(["google", "facebook", "apple"]),
})

const capabilitiesRoute = storefrontRoute({
  method: "get",
  path: "/capabilities",
  operationId: "getStorefrontCapabilities",
  statuses: [200, 401, 403],
})
const listStorefrontsRoute = storefrontRoute({
  method: "get",
  path: "/storefronts",
  operationId: "listStorefronts",
  statuses: [200, 401, 403],
})
const createStorefrontRoute = storefrontRoute({
  method: "post",
  path: "/storefronts",
  operationId: "createStorefront",
  request: { body: jsonBody(createStorefrontInputSchema) },
  statuses: [201, 400, 401, 403],
})
const getStorefrontRoute = storefrontRoute({
  method: "get",
  path: "/storefronts/{storefrontId}",
  operationId: "getStorefront",
  request: { params: storefrontIdParams },
  statuses: [200, 401, 403, 404],
})
const updateStorefrontRoute = storefrontRoute({
  method: "patch",
  path: "/storefronts/{storefrontId}",
  operationId: "updateStorefront",
  request: { params: storefrontIdParams, body: jsonBody(updateStorefrontInputSchema) },
  statuses: [200, 400, 401, 403, 404],
})
const deleteStorefrontRoute = storefrontRoute({
  method: "delete",
  path: "/storefronts/{storefrontId}",
  operationId: "deleteStorefront",
  request: { params: storefrontIdParams },
  statuses: [204, 401, 403, 404],
})
const setAllowedOriginsRoute = storefrontRoute({
  method: "put",
  path: "/storefronts/{storefrontId}/allowed-origins",
  operationId: "setStorefrontAllowedOrigins",
  request: { params: storefrontIdParams, body: jsonBody(setStorefrontAllowedOriginsInputSchema) },
  statuses: [200, 400, 401, 403, 404],
})
const listApiKeysRoute = storefrontRoute({
  method: "get",
  path: "/storefronts/{storefrontId}/keys",
  operationId: "listStorefrontApiKeys",
  request: { params: storefrontIdParams },
  statuses: [200, 401, 403, 404],
})
const issueApiKeyRoute = storefrontRoute({
  method: "post",
  path: "/storefronts/{storefrontId}/keys",
  operationId: "issueStorefrontApiKey",
  request: { params: storefrontIdParams, body: jsonBody(issueStorefrontApiKeyInputSchema) },
  statuses: [201, 400, 401, 403, 404],
})
const rotateApiKeyRoute = storefrontRoute({
  method: "post",
  path: "/storefronts/{storefrontId}/keys/{keyId}/rotate",
  operationId: "rotateStorefrontApiKey",
  request: { params: keyIdParams },
  statuses: [201, 400, 401, 403, 404],
})
const revokeApiKeyRoute = storefrontRoute({
  method: "delete",
  path: "/storefronts/{storefrontId}/keys/{keyId}",
  operationId: "revokeStorefrontApiKey",
  request: { params: keyIdParams },
  statuses: [204, 401, 403, 404],
})
const updateAccountPolicyRoute = storefrontRoute({
  method: "put",
  path: "/storefronts/{storefrontId}/account-policy",
  operationId: "updateStorefrontAccountPolicy",
  request: { params: storefrontIdParams, body: jsonBody(updateStorefrontAccountPolicyInputSchema) },
  statuses: [200, 400, 401, 403, 404],
})
const updateMethodsRoute = storefrontRoute({
  method: "put",
  path: "/storefronts/{storefrontId}/methods",
  operationId: "updateStorefrontMethods",
  request: { params: storefrontIdParams, body: jsonBody(updateStorefrontMethodsInputSchema) },
  statuses: [200, 400, 401, 403, 404],
})
const listProviderCredentialsRoute = storefrontRoute({
  method: "get",
  path: "/storefronts/{storefrontId}/provider-credentials",
  operationId: "listStorefrontProviderCredentials",
  request: { params: storefrontIdParams },
  statuses: [200, 401, 403, 404],
})
const putProviderCredentialRoute = storefrontRoute({
  method: "put",
  path: "/storefronts/{storefrontId}/provider-credentials/{provider}",
  operationId: "putStorefrontProviderCredential",
  request: {
    params: providerParams,
    body: jsonBody(putStorefrontProviderCredentialInputSchema),
  },
  statuses: [204, 400, 401, 403, 404],
})
const deleteProviderCredentialRoute = storefrontRoute({
  method: "delete",
  path: "/storefronts/{storefrontId}/provider-credentials/{provider}",
  operationId: "deleteStorefrontProviderCredential",
  request: { params: providerParams },
  statuses: [204, 401, 403, 404],
})
const getChannelBindingRoute = storefrontRoute({
  method: "get",
  path: "/storefronts/{storefrontId}/channel-binding",
  operationId: "getStorefrontChannelBinding",
  request: { params: storefrontIdParams },
  statuses: [200, 401, 403, 404, 501],
})
const setChannelBindingRoute = storefrontRoute({
  method: "put",
  path: "/storefronts/{storefrontId}/channel-binding",
  operationId: "setStorefrontChannelBinding",
  request: { params: storefrontIdParams, body: jsonBody(setStorefrontChannelBindingInputSchema) },
  statuses: [200, 400, 401, 403, 404, 501],
})
const clearChannelBindingRoute = storefrontRoute({
  method: "delete",
  path: "/storefronts/{storefrontId}/channel-binding",
  operationId: "clearStorefrontChannelBinding",
  request: { params: storefrontIdParams },
  statuses: [204, 401, 403, 404, 501],
})

/**
 * Resolve the operator request context. The deployment is the tenant boundary
 * (docs/adr/0001-tenant-scoping.md), so there is no organization to derive: the
 * `/v1/admin/*` staff guard admits the caller and `storefronts:write` gates the
 * writes.
 */
function requestContext(c: StorefrontRouteContext): StorefrontRequestContext | Response {
  const userId = c.get("userId")
  if (!userId) return c.json({ error: "Unauthorized" }, 401)
  return { bindings: c.env, db: c.get("db"), link: c.get("link") }
}

function canManageStorefronts(c: StorefrontRouteContext): boolean {
  return hasApiKeyPermission(
    permissionStringsToPermissions(c.get("scopes") ?? []),
    "storefronts",
    "write",
  )
}

function requireManage(c: StorefrontRouteContext): Response | null {
  return canManageStorefronts(c) ? null : c.json({ error: "Forbidden" }, 403)
}

function handleError(c: StorefrontRouteContext, error: unknown): Response {
  if (error instanceof StorefrontInputError) {
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

export interface StorefrontAdminRouteOptions {
  /** Whether the deployment supports business (organization) buyer accounts. */
  businessAccounts: boolean
  /** Optional deployment/provider composition for Storefront -> Channel binding. */
  channelBinding?: StorefrontChannelBindingProvider | null
}

export function createStorefrontAdminRoutes(
  runtime: StorefrontRuntimeProvider,
  options: StorefrontAdminRouteOptions,
) {
  const routes = new OpenAPIHono<StorefrontEnv>({ defaultHook: openApiValidationHook })

  const enrichStorefront = async (
    context: StorefrontRequestContext,
    storefront: StorefrontWithChannelBindingDto,
  ): Promise<StorefrontWithChannelBindingDto> => {
    if (!options.channelBinding) return storefront
    const binding = await options.channelBinding.getStorefrontChannelBinding(context, storefront.id)
    return { ...storefront, channelBinding: binding }
  }

  const enrichStorefronts = async (
    context: StorefrontRequestContext,
    storefronts: StorefrontWithChannelBindingDto[],
  ): Promise<StorefrontWithChannelBindingDto[]> => {
    if (!options.channelBinding || storefronts.length === 0) return storefronts
    const bindings = await options.channelBinding.listStorefrontChannelBindings(
      context,
      storefronts.map((storefront) => storefront.id),
    )
    return storefronts.map((storefront) => ({
      ...storefront,
      channelBinding: bindings[storefront.id] ?? null,
    }))
  }

  const requireBindingProvider = (c: StorefrontRouteContext) =>
    options.channelBinding ?? c.json({ error: "Storefront channel binding is not configured" }, 501)

  const run = async <T>(
    c: StorefrontRouteContext,
    operation: (context: StorefrontRequestContext) => Promise<T>,
    guard: "read" | "write" = "read",
  ): Promise<T | Response> => {
    const context = requestContext(c)
    if (context instanceof Response) return context
    if (guard === "write") {
      const forbidden = requireManage(c)
      if (forbidden) return forbidden
    }
    try {
      return await operation(context)
    } catch (error) {
      return handleError(c, error)
    }
  }

  routes.openapi(capabilitiesRoute, (c) => {
    if (!c.get("userId")) return c.json({ error: "Unauthorized" }, 401)
    const manageProviders = canManageStorefronts(c)
    return c.json({
      data: {
        businessAccounts: options.businessAccounts,
        manageProviders,
        channelBinding: !!options.channelBinding,
      },
    })
  })

  routes.openapi(listStorefrontsRoute, async (c) => {
    const result = await run(c, async (context) =>
      enrichStorefronts(context, await runtime.listStorefronts(context)),
    )
    return result instanceof Response ? result : c.json({ data: result })
  })

  routes.openapi(createStorefrontRoute, async (c) => {
    const input = await parseJsonBody(c, createStorefrontInputSchema)
    const result = await run(
      c,
      async (context) => enrichStorefront(context, await runtime.createStorefront(context, input)),
      "write",
    )
    return result instanceof Response ? result : c.json({ data: result }, 201)
  })

  routes.openapi(getStorefrontRoute, async (c) => {
    const { storefrontId } = c.req.param()
    const result = await run(c, async (context) =>
      enrichStorefront(context, await runtime.getStorefront(context, storefrontId)),
    )
    return result instanceof Response ? result : c.json({ data: result })
  })

  routes.openapi(updateStorefrontRoute, async (c) => {
    const { storefrontId } = c.req.param()
    const input = await parseJsonBody(c, updateStorefrontInputSchema)
    const result = await run(
      c,
      async (context) =>
        enrichStorefront(context, await runtime.updateStorefront(context, storefrontId, input)),
      "write",
    )
    return result instanceof Response ? result : c.json({ data: result })
  })

  routes.openapi(deleteStorefrontRoute, async (c) => {
    const { storefrontId } = c.req.param()
    const result = await run(
      c,
      (context) => runtime.deleteStorefront(context, storefrontId),
      "write",
    )
    return result instanceof Response ? result : c.body(null, 204)
  })

  routes.openapi(setAllowedOriginsRoute, async (c) => {
    const { storefrontId } = c.req.param()
    const input = await parseJsonBody(c, setStorefrontAllowedOriginsInputSchema)
    const result = await run(
      c,
      (context) => runtime.setAllowedOrigins(context, storefrontId, input.origins),
      "write",
    )
    return result instanceof Response ? result : c.json({ data: result })
  })

  routes.openapi(listApiKeysRoute, async (c) => {
    const { storefrontId } = c.req.param()
    const result = await run(c, (context) => runtime.listApiKeys(context, storefrontId))
    return result instanceof Response ? result : c.json({ data: result })
  })

  routes.openapi(issueApiKeyRoute, async (c) => {
    const { storefrontId } = c.req.param()
    const input = await parseJsonBody(c, issueStorefrontApiKeyInputSchema)
    const result = await run(
      c,
      (context) =>
        runtime.issueApiKey(
          context,
          storefrontId,
          input.kind,
          input.name ?? null,
          input.scopes ?? null,
        ),
      "write",
    )
    return result instanceof Response ? result : c.json({ data: result }, 201)
  })

  routes.openapi(rotateApiKeyRoute, async (c) => {
    const { storefrontId, keyId } = c.req.param()
    const result = await run(
      c,
      (context) => runtime.rotateApiKey(context, storefrontId, keyId),
      "write",
    )
    return result instanceof Response ? result : c.json({ data: result }, 201)
  })

  routes.openapi(revokeApiKeyRoute, async (c) => {
    const { storefrontId, keyId } = c.req.param()
    const result = await run(
      c,
      (context) => runtime.revokeApiKey(context, storefrontId, keyId),
      "write",
    )
    return result instanceof Response ? result : c.body(null, 204)
  })

  routes.openapi(updateAccountPolicyRoute, async (c) => {
    const { storefrontId } = c.req.param()
    const input = await parseJsonBody(c, updateStorefrontAccountPolicyInputSchema)
    const result = await run(
      c,
      (context) => runtime.updateAccountPolicy(context, storefrontId, input),
      "write",
    )
    return result instanceof Response ? result : c.json({ data: result })
  })

  routes.openapi(updateMethodsRoute, async (c) => {
    const { storefrontId } = c.req.param()
    const input = await parseJsonBody(c, updateStorefrontMethodsInputSchema)
    const result = await run(
      c,
      (context) => runtime.updateMethods(context, storefrontId, input),
      "write",
    )
    return result instanceof Response ? result : c.json({ data: result })
  })

  routes.openapi(listProviderCredentialsRoute, async (c) => {
    const { storefrontId } = c.req.param()
    const result = await run(c, (context) => runtime.listProviderCredentials(context, storefrontId))
    return result instanceof Response ? result : c.json({ data: result })
  })

  routes.openapi(putProviderCredentialRoute, async (c) => {
    const { storefrontId, provider } = c.req.param() as z.infer<typeof providerParams>
    const input = await parseJsonBody(c, putStorefrontProviderCredentialInputSchema)
    const result = await run(
      c,
      (context) => runtime.putProviderCredential(context, storefrontId, provider, input),
      "write",
    )
    return result instanceof Response ? result : c.body(null, 204)
  })

  routes.openapi(deleteProviderCredentialRoute, async (c) => {
    const { storefrontId, provider } = c.req.param() as z.infer<typeof providerParams>
    const result = await run(
      c,
      (context) => runtime.deleteProviderCredential(context, storefrontId, provider),
      "write",
    )
    return result instanceof Response ? result : c.body(null, 204)
  })

  routes.openapi(getChannelBindingRoute, async (c) => {
    const provider = requireBindingProvider(c)
    if (provider instanceof Response) return provider
    const { storefrontId } = c.req.param()
    const result = await run(c, async (context) => {
      await runtime.getStorefront(context, storefrontId)
      return provider.getStorefrontChannelBinding(context, storefrontId)
    })
    return result instanceof Response ? result : c.json({ data: result })
  })

  routes.openapi(setChannelBindingRoute, async (c) => {
    const provider = requireBindingProvider(c)
    if (provider instanceof Response) return provider
    const { storefrontId } = c.req.param()
    const input = await parseJsonBody(c, setStorefrontChannelBindingInputSchema)
    const result = await run(
      c,
      async (context) => {
        await runtime.getStorefront(context, storefrontId)
        return provider.setStorefrontChannelBinding(context, storefrontId, input)
      },
      "write",
    )
    return result instanceof Response ? result : c.json({ data: result })
  })

  routes.openapi(clearChannelBindingRoute, async (c) => {
    const provider = requireBindingProvider(c)
    if (provider instanceof Response) return provider
    const { storefrontId } = c.req.param()
    const result = await run(
      c,
      async (context) => {
        await runtime.getStorefront(context, storefrontId)
        return provider.clearStorefrontChannelBinding(context, storefrontId)
      },
      "write",
    )
    return result instanceof Response ? result : c.body(null, 204)
  })

  return routes
}
