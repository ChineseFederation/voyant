import {
  type CheckoutCapabilityAction,
  type GuestBookingAccessAction,
  requireCheckoutCapability,
  requireGuestBookingAccess,
} from "@voyant-travel/bookings/checkout-capability"
import type { ModuleContainer } from "@voyant-travel/core"
import {
  idempotencyKey,
  parseJsonBody,
  parseOptionalJsonBody,
  parseQuery,
  UnauthorizedApiError,
} from "@voyant-travel/hono"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"
import { Hono, type MiddlewareHandler } from "hono"

import {
  bootstrapCheckoutCollection,
  type CheckoutBankTransferDetails,
  type CheckoutNotificationDispatcher,
  type CheckoutPaymentStarter,
  type CheckoutPolicyOptions,
  initiateCheckoutCollection,
  previewCheckoutCollection,
} from "./checkout-service.js"
import {
  bootstrapCheckoutCollectionSchema,
  type CheckoutReminderRunListQuery,
  type CheckoutReminderRunRecord,
  checkoutReminderRunListQuerySchema,
  initiateCheckoutCollectionSchema,
  previewCheckoutCollectionSchema,
} from "./checkout-validation.js"

type Env = {
  Bindings: Record<string, unknown>
  Variables: {
    container: ModuleContainer
    db: PostgresJsDatabase
    userId?: string
  }
}

export type CheckoutRoutesOptions = {
  policy?: CheckoutPolicyOptions
  notificationDispatcher?: CheckoutNotificationDispatcher | null
  resolveNotificationDispatcher?: (
    bindings: Record<string, unknown>,
  ) => CheckoutNotificationDispatcher | null
  paymentStarters?: Record<string, CheckoutPaymentStarter>
  resolveSelectedPaymentStarter?: (
    bindings: Record<string, unknown>,
  ) => CheckoutPaymentStarter | null
  resolvePaymentStarters?: (
    bindings: Record<string, unknown>,
  ) => Record<string, CheckoutPaymentStarter>
  bankTransferDetails?: CheckoutBankTransferDetails | null
  resolveBankTransferDetails?: (
    bindings: Record<string, unknown>,
  ) => CheckoutBankTransferDetails | null
  publicCheckoutBaseUrl?: string | null
  resolvePublicCheckoutBaseUrl?: (bindings: Record<string, unknown>) => string | null | undefined
  resolvePaymentLinkUrlTemplate?: (
    db: PostgresJsDatabase,
    bindings: Record<string, unknown>,
  ) => Promise<string | null>
  listBookingReminderRuns?: (
    db: PostgresJsDatabase,
    bookingId: string,
    query: CheckoutReminderRunListQuery,
  ) => Promise<CheckoutReminderRunList>
}

export interface CheckoutReminderRunList {
  data: CheckoutReminderRunRecord[]
  total: number
  limit: number
  offset: number
}

export type CheckoutRouteRuntime = {
  bindings: Record<string, unknown>
  notificationDispatcher: CheckoutNotificationDispatcher | null
  selectedPaymentStarter: CheckoutPaymentStarter | null
  paymentStarters: Record<string, CheckoutPaymentStarter>
  bankTransferDetails: CheckoutBankTransferDetails | null
  publicCheckoutBaseUrl?: string | null
  listBookingReminderRuns?: CheckoutRoutesOptions["listBookingReminderRuns"]
}

export const CHECKOUT_ROUTE_RUNTIME_CONTAINER_KEY = "providers.finance.checkout.runtime"
export const CHECKOUT_ROUTE_RUNTIME_NOT_CONFIGURED_MESSAGE =
  "Checkout payment links require a configured checkout provider. Configure a Finance checkout runtime with a card payment starter before generating payment links."

class CheckoutRouteRuntimeNotConfiguredError extends Error {
  constructor() {
    super(CHECKOUT_ROUTE_RUNTIME_NOT_CONFIGURED_MESSAGE)
  }
}

function runtimeEnv(c: { env: Record<string, unknown> }): Record<string, string | undefined> {
  return c.env as Record<string, string | undefined>
}

type CollectionCapabilityAction = Extract<CheckoutCapabilityAction, GuestBookingAccessAction>

function collectionCapability(action: CollectionCapabilityAction): MiddlewareHandler<Env> {
  return async (c, next) => {
    const bookingId = c.req.param("bookingId")!
    try {
      await requireCheckoutCapability(c, bookingId, action, runtimeEnv(c))
    } catch (error) {
      if (!(error instanceof UnauthorizedApiError)) {
        throw error
      }
      await requireGuestBookingAccess(c, bookingId, action, runtimeEnv(c))
    }
    await next()
  }
}

function attachCollectionRoutes<TEnv extends Env>(app: Hono<TEnv>, options: CheckoutRoutesOptions) {
  // Pin the middleware to this module's Env so Hono doesn't intersect the
  // middleware's default VoyantBindings into the handlers' `c.env` type.
  const collectionIdempotency = () => idempotencyKey<Env["Bindings"], Env["Variables"]>()
  function getRuntime(bindings: Record<string, unknown>, container?: ModuleContainer) {
    return resolveCheckoutRouteRuntime(bindings, options, container)
  }

  return (
    app
      // Mostly a read, but `ensureDefaultPaymentPlan` can materialize a
      // default payment plan — so it gets the same opt-in idempotency as
      // the other collection mutations.
      .post("/bookings/:bookingId/collection-plan", collectionIdempotency(), async (c) => {
        try {
          const plan = await previewCheckoutCollection(
            c.get("db"),
            c.req.param("bookingId")!,
            await parseOptionalJsonBody(c, previewCheckoutCollectionSchema),
            options.policy,
          )

          if (!plan) {
            return c.json({ error: "Booking not found" }, 404)
          }

          return c.json({ data: plan })
        } catch (error) {
          const message =
            error instanceof Error ? error.message : "Failed to preview checkout collection"
          return c.json({ error: message }, 400)
        }
      })
      .post("/bookings/:bookingId/initiate-collection", collectionIdempotency(), async (c) => {
        try {
          const input = await parseJsonBody(c, initiateCheckoutCollectionSchema)
          const baseRuntime = getRuntime(c.env, c.var.container)
          const runtime = {
            ...baseRuntime,
            paymentLinkUrlTemplate:
              (await options.resolvePaymentLinkUrlTemplate?.(c.get("db"), c.env)) ?? null,
          }
          assertCheckoutRuntimeSupportsCollection(runtime, input)
          const result = await initiateCheckoutCollection(
            c.get("db"),
            c.req.param("bookingId")!,
            input,
            options.policy,
            runtime,
          )

          if (!result) {
            return c.json({ error: "Booking not found" }, 404)
          }

          return c.json({ data: result }, 201)
        } catch (error) {
          const message =
            error instanceof Error ? error.message : "Failed to initiate checkout collection"
          if (message.includes("Booking not found")) {
            return c.json({ error: message }, 404)
          }
          if (error instanceof CheckoutRouteRuntimeNotConfiguredError) {
            return c.json({ error: message }, 501)
          }
          return c.json({ error: message }, 409)
        }
      })
      .post("/collections/bootstrap", collectionIdempotency(), async (c) => {
        try {
          const input = await parseJsonBody(c, bootstrapCheckoutCollectionSchema)
          const baseRuntime = getRuntime(c.env, c.var.container)
          const runtime = {
            ...baseRuntime,
            paymentLinkUrlTemplate:
              (await options.resolvePaymentLinkUrlTemplate?.(c.get("db"), c.env)) ?? null,
          }
          assertCheckoutRuntimeSupportsCollection(runtime, input)
          const result = await bootstrapCheckoutCollection(
            c.get("db"),
            input,
            options.policy,
            runtime,
          )

          if (!result) {
            return c.json({ error: "Booking session not found" }, 404)
          }

          return c.json({ data: result }, 201)
        } catch (error) {
          const message =
            error instanceof Error ? error.message : "Failed to bootstrap checkout collection"
          if (message.includes("Booking not found")) {
            return c.json({ error: message }, 404)
          }
          if (error instanceof CheckoutRouteRuntimeNotConfiguredError) {
            return c.json({ error: message }, 501)
          }
          return c.json({ error: message }, 409)
        }
      })
  )
}

export function createCheckoutRoutes(options: CheckoutRoutesOptions = {}) {
  const app = new Hono<Env>()
  app.use("/bookings/:bookingId/collection-plan", collectionCapability("payment:read"))
  app.use("/bookings/:bookingId/initiate-collection", collectionCapability("payment:start"))
  return attachCollectionRoutes(app, options)
}

export function createCheckoutAdminRoutes(options: CheckoutRoutesOptions = {}) {
  const app = new Hono<Env>().get("/bookings/:bookingId/reminder-runs", async (c) => {
    const query = parseQuery(c, checkoutReminderRunListQuerySchema)
    const runtime = resolveCheckoutRouteRuntime(c.env, options, c.var.container)

    if (!runtime.listBookingReminderRuns) {
      return c.json({ data: [], total: 0, limit: query.limit, offset: query.offset })
    }

    return c.json(
      await runtime.listBookingReminderRuns(c.get("db"), c.req.param("bookingId"), query),
    )
  })
  return attachCollectionRoutes(app, options)
}

function resolveCheckoutRouteRuntime(
  bindings: Record<string, unknown>,
  options: CheckoutRoutesOptions,
  container?: ModuleContainer,
): CheckoutRouteRuntime {
  if (container?.has(CHECKOUT_ROUTE_RUNTIME_CONTAINER_KEY)) {
    return container.resolve<CheckoutRouteRuntime>(CHECKOUT_ROUTE_RUNTIME_CONTAINER_KEY)
  }

  return buildCheckoutRouteRuntime(bindings, options)
}

function assertCheckoutRuntimeSupportsCollection(
  runtime: CheckoutRouteRuntime,
  input: { method: "card" | "bank_transfer"; startProvider?: object },
) {
  if (input.method === "card" && input.startProvider) {
    if (!runtime.selectedPaymentStarter) {
      throw new CheckoutRouteRuntimeNotConfiguredError()
    }
    return
  }

  if (
    input.method === "card" &&
    !runtime.selectedPaymentStarter &&
    Object.keys(runtime.paymentStarters).length === 0
  ) {
    throw new CheckoutRouteRuntimeNotConfiguredError()
  }
}

export function buildCheckoutRouteRuntime(
  bindings: Record<string, unknown>,
  options: CheckoutRoutesOptions = {},
): CheckoutRouteRuntime {
  return {
    bindings,
    notificationDispatcher:
      options.resolveNotificationDispatcher?.(bindings) ?? options.notificationDispatcher ?? null,
    selectedPaymentStarter: options.resolveSelectedPaymentStarter?.(bindings) ?? null,
    paymentStarters: options.resolvePaymentStarters?.(bindings) ?? options.paymentStarters ?? {},
    bankTransferDetails:
      options.resolveBankTransferDetails?.(bindings) ?? options.bankTransferDetails ?? null,
    publicCheckoutBaseUrl:
      options.resolvePublicCheckoutBaseUrl?.(bindings) ?? options.publicCheckoutBaseUrl ?? null,
    listBookingReminderRuns: options.listBookingReminderRuns,
  }
}

export const createFinanceCheckoutRoutes = createCheckoutRoutes
export const createFinanceCheckoutAdminRoutes = createCheckoutAdminRoutes
export const buildFinanceCheckoutRouteRuntime = buildCheckoutRouteRuntime
export const FINANCE_CHECKOUT_ROUTE_RUNTIME_CONTAINER_KEY = CHECKOUT_ROUTE_RUNTIME_CONTAINER_KEY
