import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi"
import {
  openApiValidationHook,
  type VoyantBindings,
  type VoyantVariables,
} from "@voyant-travel/hono"
import { boundedJsonBody } from "@voyant-travel/hono/middleware/body-size"
import type { Context } from "hono"

import {
  createPublicApiShoppingGateway,
  type PublicApiShoppingGateway,
  PublicApiShoppingUnavailableError,
} from "./runtime.js"
import type { PublicApiShoppingContext, PublicApiShoppingRuntime } from "./runtime-port.js"
import { publicApiShoppingRequestSchema, publicApiShoppingResultSchema } from "./schemas.js"

const MAX_SHOPPING_BODY_BYTES = 64 * 1024
const PRIVATE_NO_STORE = "private, no-store"
const PUBLIC_INDEXED_CACHE_SECONDS = 60

type Env = {
  Bindings: VoyantBindings & { NODE_ENV?: string }
  Variables: VoyantVariables
}

const errorResponseSchema = z
  .object({ error: z.string(), requestId: z.string().optional() })
  .strict()
const tooLargeResponseSchema = errorResponseSchema
  .extend({ code: z.literal("request_body_too_large"), maxBytes: z.number().int() })
  .strict()
const shoppingEnvelopeSchema = z.object({ data: publicApiShoppingResultSchema }).strict()

function jsonBody<T extends z.ZodType>(schema: T) {
  return { required: true, content: { "application/json": { schema } } }
}

const searchRoute = createRoute({
  method: "post",
  path: "/search",
  request: { body: jsonBody(publicApiShoppingRequestSchema) },
  responses: {
    200: {
      description: "A provider-neutral Storefront shopping result",
      content: { "application/json": { schema: shoppingEnvelopeSchema } },
    },
    400: {
      description: "The strict shopping request was invalid",
      content: { "application/json": { schema: errorResponseSchema } },
    },
    403: {
      description: "An active server-resolved Storefront Channel is required",
      content: { "application/json": { schema: errorResponseSchema } },
    },
    413: {
      description: "The shopping request body exceeded 64 KiB",
      content: { "application/json": { schema: tooLargeResponseSchema } },
    },
    503: {
      description: "No shopping runtime is bound",
      content: { "application/json": { schema: errorResponseSchema } },
    },
  },
})

export interface PublicApiShoppingPublicRoutesOptions {
  shopping?: PublicApiShoppingRuntime
  /** Test seam only; production defaults to the deployment's NODE_ENV. */
  production?: boolean
  now?: () => Date
}

function requestId(c: Context<Env>): string | undefined {
  return c.get("requestId")
}

function activeShoppingContext(c: Context<Env>): PublicApiShoppingContext | null {
  const channel = c.get("publicChannel")
  if (!channel?.channelId || channel.channelStatus !== "active") return null
  return {
    channelId: channel.channelId,
    userId: c.get("userId") ?? null,
    buyerAccountId: c.get("buyerAccountId") ?? null,
  }
}

function setPrivateNoStore(c: Context<Env>): void {
  c.header("Cache-Control", PRIVATE_NO_STORE)
  c.header("Vary", "Cookie", { append: true })
  c.header("Vary", "Authorization", { append: true })
}

function processNodeEnv(): string | undefined {
  return (
    globalThis as typeof globalThis & { process?: { env?: Record<string, string | undefined> } }
  ).process?.env?.NODE_ENV
}

function convertedFxFreshness(result: z.infer<typeof publicApiShoppingResultSchema>): {
  keys: string[]
  validUntil: number | null
} {
  if (result.kind !== "indexed-inspiration") return { keys: [], validUntil: null }
  const keys: string[] = []
  let validUntil: number | null = null
  for (const group of result.groups) {
    for (const item of group.items) {
      const money = item.priceFrom
      if (!money || money.native.currency === money.presentation.currency) continue
      if (!money.fx?.validUntil) return { keys: [], validUntil: null }
      const expires = Date.parse(money.fx.validUntil)
      if (!Number.isFinite(expires)) return { keys: [], validUntil: null }
      validUntil = validUntil === null ? expires : Math.min(validUntil, expires)
      keys.push(
        [money.fx.provider, money.fx.quotedAt, money.fx.validUntil, money.fx.rate].join(":"),
      )
    }
  }
  return { keys: keys.sort(), validUntil }
}

async function setSafeIndexedCacheHeaders(
  c: Context<Env>,
  result: z.infer<typeof publicApiShoppingResultSchema>,
  options: PublicApiShoppingPublicRoutesOptions,
): Promise<void> {
  const runtimeNodeEnv = (c.env as { NODE_ENV?: string } | undefined)?.NODE_ENV
  const production = options.production ?? runtimeNodeEnv === "production"
  const isProduction =
    production || (runtimeNodeEnv === undefined && processNodeEnv() === "production")
  if (
    !isProduction ||
    result.kind !== "indexed-inspiration" ||
    c.get("isAnonymousRequest") !== true ||
    !c.req.header("x-api-key") ||
    c.req.header("cookie") ||
    c.req.header("authorization")
  ) {
    setPrivateNoStore(c)
    return
  }

  const freshness = convertedFxFreshness(result)
  const now = (options.now?.() ?? new Date()).getTime()
  const seconds = freshness.validUntil
    ? Math.min(PUBLIC_INDEXED_CACHE_SECONDS, Math.floor((freshness.validUntil - now) / 1000))
    : PUBLIC_INDEXED_CACHE_SECONDS
  if (seconds < 1) {
    setPrivateNoStore(c)
    return
  }

  const scopeKey = [result.scope.marketId, result.scope.locale, result.scope.currency].join(":")
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(JSON.stringify([scopeKey, freshness.keys])),
  )
  const cacheTag = Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")
  c.header("Cache-Control", `public, s-maxage=${seconds}`)
  c.header("Cache-Tag", `storefront-shopping-${cacheTag}`)
}

function isShoppingScopeError(value: unknown): boolean {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { code?: unknown }).code === "storefront_shopping_scope_unsupported"
  )
}

export function createPublicApiShoppingPublicRoutes(
  options: PublicApiShoppingPublicRoutesOptions = {},
): OpenAPIHono<Env> {
  const gateway: PublicApiShoppingGateway = createPublicApiShoppingGateway(options)
  const app = new OpenAPIHono<Env>({ defaultHook: openApiValidationHook })

  app.use("*", async (c, next) => {
    await next()
    if (!c.res.headers.has("Cache-Control")) setPrivateNoStore(c)
  })
  app.use("*", boundedJsonBody(MAX_SHOPPING_BODY_BYTES))

  return app.openapi(searchRoute, async (c) => {
    const context = activeShoppingContext(c)
    if (!context) {
      return c.json({ error: "active_channel_required", requestId: requestId(c) }, 403)
    }
    try {
      const result = await gateway.search(context, c.req.valid("json"))
      await setSafeIndexedCacheHeaders(c, result, options)
      return c.json({ data: result }, 200)
    } catch (cause) {
      if (isShoppingScopeError(cause)) {
        return c.json(
          {
            error: "storefront_shopping_scope_unsupported",
            requestId: requestId(c),
          },
          400,
        )
      }
      if (cause instanceof PublicApiShoppingUnavailableError) {
        return c.json({ error: "storefront_shopping_unavailable", requestId: requestId(c) }, 503)
      }
      throw cause
    }
  })
}
