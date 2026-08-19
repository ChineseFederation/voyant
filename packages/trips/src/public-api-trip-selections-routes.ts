/**
 * The public Trip-selection routes.
 *
 * Moved from `@voyant-travel/public-api`'s shopping module (voyant#4627), and
 * with them the URL: they now answer under this package's public mount, at
 * `/v1/public/trips/trip-selections`, instead of `/v1/public/shopping/…`.
 *
 * That is the point of the move rather than an accident of it. NDC is
 * Shopping → Offer → Order, and only `/search` is shopping; creating a
 * selection, revising it under a compare-and-swap and booking it are
 * order-phase. Serving them from the shopping prefix said otherwise.
 *
 * Every mutation here demands a same-origin proof on top of the public API key,
 * because the key is readable in any storefront bundle and is therefore not by
 * itself evidence that the request came from the storefront.
 */
import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi"
import {
  openApiValidationHook,
  type VoyantBindings,
  type VoyantVariables,
} from "@voyant-travel/hono"
import { boundedJsonBody } from "@voyant-travel/hono/middleware/body-size"
import { isSameOriginMutation } from "@voyant-travel/hono/middleware/security-headers"
import type { PublicApiShoppingContext } from "@voyant-travel/public-api/shopping"
import type { Context } from "hono"

import {
  createPublicApiTripSelectionsGateway,
  type PublicApiResolveShoppingScope,
  PublicApiTripSelectionRevisionConflictError,
  type PublicApiTripSelectionsGateway,
  type PublicApiTripSelectionsRuntime,
  PublicApiTripSelectionsUnavailableError,
} from "./public-api-trip-selections-gateway.js"
import {
  publicApiTripBookingCreateSchema,
  publicApiTripBookingSchema,
  publicApiTripSelectionCreateSchema,
  publicApiTripSelectionSchema,
  publicApiTripSelectionUpdateSchema,
} from "./public-api-trip-selections-schemas.js"

const MAX_TRIP_SELECTION_BODY_BYTES = 64 * 1024
const PRIVATE_NO_STORE = "private, no-store"

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
const tripSelectionEnvelopeSchema = z.object({ data: publicApiTripSelectionSchema }).strict()
const tripBookingEnvelopeSchema = z.object({ data: publicApiTripBookingSchema }).strict()

function jsonBody<T extends z.ZodType>(schema: T) {
  return { required: true, content: { "application/json": { schema } } }
}

const createTripSelectionRoute = createRoute({
  method: "post",
  path: "/trip-selections",
  request: { body: jsonBody(publicApiTripSelectionCreateSchema) },
  responses: {
    201: {
      description: "A newly created opaque Trip selection",
      content: { "application/json": { schema: tripSelectionEnvelopeSchema } },
    },
    400: {
      description: "The strict Trip-selection request was invalid",
      content: { "application/json": { schema: errorResponseSchema } },
    },
    403: {
      description: "The active Storefront Channel or same-origin mutation proof is missing",
      content: { "application/json": { schema: errorResponseSchema } },
    },
    413: {
      description: "The Trip-selection request body exceeded 64 KiB",
      content: { "application/json": { schema: tooLargeResponseSchema } },
    },
    503: {
      description: "A required shopping or Trip-selection runtime is not bound",
      content: { "application/json": { schema: errorResponseSchema } },
    },
  },
})

const updateTripSelectionRoute = createRoute({
  method: "patch",
  path: "/trip-selections",
  request: { body: jsonBody(publicApiTripSelectionUpdateSchema) },
  responses: {
    200: {
      description: "The compare-and-swap updated Trip selection",
      content: { "application/json": { schema: tripSelectionEnvelopeSchema } },
    },
    400: {
      description: "The strict Trip-selection mutation was invalid",
      content: { "application/json": { schema: errorResponseSchema } },
    },
    403: {
      description: "The active Storefront Channel or same-origin mutation proof is missing",
      content: { "application/json": { schema: errorResponseSchema } },
    },
    409: {
      description: "The Trip-selection revision changed after it was read",
      content: { "application/json": { schema: errorResponseSchema } },
    },
    413: {
      description: "The Trip-selection mutation body exceeded 64 KiB",
      content: { "application/json": { schema: tooLargeResponseSchema } },
    },
    503: {
      description: "No Trip-selection runtime is bound",
      content: { "application/json": { schema: errorResponseSchema } },
    },
  },
})

const bookTripSelectionRoute = createRoute({
  method: "post",
  path: "/trip-selections/book",
  request: { body: jsonBody(publicApiTripBookingCreateSchema) },
  responses: {
    200: {
      description: "A managed composite Booking Session for the exact Trip revision",
      content: { "application/json": { schema: tripBookingEnvelopeSchema } },
    },
    400: {
      description: "The Trip could not be frozen and priced",
      content: { "application/json": { schema: errorResponseSchema } },
    },
    403: {
      description: "The Trip capability, owner, channel, or same-origin proof is invalid",
      content: { "application/json": { schema: errorResponseSchema } },
    },
    409: {
      description: "The Trip revision or idempotent request conflicts",
      content: { "application/json": { schema: errorResponseSchema } },
    },
    413: {
      description: "The request body exceeded 64 KiB",
      content: { "application/json": { schema: tooLargeResponseSchema } },
    },
    503: {
      description: "The managed Trip booking runtime is unavailable",
      content: { "application/json": { schema: errorResponseSchema } },
    },
  },
})

export interface PublicApiTripSelectionsRoutesOptions {
  resolveScope?: PublicApiResolveShoppingScope
  selections?: PublicApiTripSelectionsRuntime
}

/**
 * Accepted as a provider as well as a value, matching `TripsRoutesOptionsInput`.
 *
 * The runtime behind these routes is assembled by the graph contributor, which
 * resolves ports asynchronously, while the app is composed synchronously. A
 * provider lets composition happen now and binding happen on first use.
 */
export type PublicApiTripSelectionsRoutesInput =
  | PublicApiTripSelectionsRoutesOptions
  | (() =>
      | PublicApiTripSelectionsRoutesOptions
      | Promise<PublicApiTripSelectionsRoutesOptions | undefined>
      | undefined)

function requestId(c: Context<Env>): string | undefined {
  return c.get("requestId")
}

/**
 * Server-derived authority. Never accepted from a browser body — the channel is
 * resolved by middleware and the owner comes from the session, so a caller
 * cannot nominate whose selection it is editing.
 */
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

function isRevisionConflict(value: unknown): boolean {
  return (
    value instanceof PublicApiTripSelectionRevisionConflictError ||
    (typeof value === "object" &&
      value !== null &&
      (value as { code?: unknown }).code === "trip_selection_revision_conflict")
  )
}

function errorCode(value: unknown): string | undefined {
  if (!value || typeof value !== "object") return undefined
  const code = (value as { code?: unknown }).code
  return typeof code === "string" ? code : undefined
}

/**
 * Guard shared by all three mutations: active channel, then same-origin proof.
 *
 * Returns the trusted context on success so a caller cannot forget to derive it
 * a second time — and cannot derive a *different* one than the guard checked.
 *
 * It reports the *reason* rather than building the 403 itself: `.openapi()`
 * infers a typed response union per route, which a bare `Response` returned from
 * a shared helper does not structurally satisfy. Letting each handler call
 * `c.json` keeps the responses typed while the decision stays in one place.
 */
function trustedMutationContext(
  c: Context<Env>,
): { context: PublicApiShoppingContext } | { refuse: MutationRefusal } {
  const context = activeShoppingContext(c)
  if (!context) return { refuse: "active_channel_required" }
  if (!isSameOriginMutation(c)) return { refuse: "same_origin_required" }
  return { context }
}

type MutationRefusal = "active_channel_required" | "same_origin_required"

export function createPublicApiTripSelectionsRoutes(
  input: PublicApiTripSelectionsRoutesInput = {},
): OpenAPIHono<Env> {
  // Resolved once, on first request, and reused. Building it eagerly would
  // require the graph ports to be bound before the app is composed, which they
  // are not.
  let pending: Promise<PublicApiTripSelectionsGateway> | undefined
  const gatewayFor = (): Promise<PublicApiTripSelectionsGateway> => {
    pending ??= Promise.resolve(typeof input === "function" ? input() : input).then((resolved) =>
      createPublicApiTripSelectionsGateway(resolved ?? {}),
    )
    return pending
  }
  const app = new OpenAPIHono<Env>({ defaultHook: openApiValidationHook })

  app.use("*", async (c, next) => {
    await next()
    if (!c.res.headers.has("Cache-Control")) setPrivateNoStore(c)
  })
  app.use("*", boundedJsonBody(MAX_TRIP_SELECTION_BODY_BYTES))

  return app
    .openapi(createTripSelectionRoute, async (c) => {
      const trusted = trustedMutationContext(c)
      if ("refuse" in trusted) {
        return c.json({ error: trusted.refuse, requestId: requestId(c) }, 403)
      }
      const { context } = trusted
      try {
        const result = await (await gatewayFor()).create(context, c.req.valid("json"))
        setPrivateNoStore(c)
        return c.json({ data: result }, 201)
      } catch (cause) {
        if (cause instanceof PublicApiTripSelectionsUnavailableError) {
          return c.json({ error: cause.code, requestId: requestId(c) }, 503)
        }
        throw cause
      }
    })
    .openapi(updateTripSelectionRoute, async (c) => {
      const trusted = trustedMutationContext(c)
      if ("refuse" in trusted) {
        return c.json({ error: trusted.refuse, requestId: requestId(c) }, 403)
      }
      const { context } = trusted
      try {
        const result = await (await gatewayFor()).update(context, c.req.valid("json"))
        setPrivateNoStore(c)
        return c.json({ data: result }, 200)
      } catch (cause) {
        if (cause instanceof PublicApiTripSelectionsUnavailableError) {
          return c.json({ error: cause.code, requestId: requestId(c) }, 503)
        }
        if (isRevisionConflict(cause)) {
          return c.json({ error: "trip_selection_revision_conflict", requestId: requestId(c) }, 409)
        }
        throw cause
      }
    })
    .openapi(bookTripSelectionRoute, async (c) => {
      const trusted = trustedMutationContext(c)
      if ("refuse" in trusted) {
        return c.json({ error: trusted.refuse, requestId: requestId(c) }, 403)
      }
      const { context } = trusted
      try {
        const result = await (await gatewayFor()).book(context, c.req.valid("json"))
        setPrivateNoStore(c)
        return c.json({ data: result }, 200)
      } catch (cause) {
        if (cause instanceof PublicApiTripSelectionsUnavailableError) {
          return c.json({ error: cause.code, requestId: requestId(c) }, 503)
        }
        if (isRevisionConflict(cause)) {
          return c.json({ error: "trip_selection_revision_conflict", requestId: requestId(c) }, 409)
        }
        const code = errorCode(cause)
        if (code === "storefront_trip_selection_not_found") {
          return c.json({ error: code, requestId: requestId(c) }, 403)
        }
        if (code === "storefront_trip_booking_idempotency_conflict") {
          return c.json({ error: code, requestId: requestId(c) }, 409)
        }
        if (code?.startsWith("storefront_trip_booking_")) {
          return c.json({ error: code, requestId: requestId(c) }, 400)
        }
        throw cause
      }
    })
}
