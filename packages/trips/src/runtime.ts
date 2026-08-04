import type { CatalogRuntimeServices } from "@voyant-travel/catalog/runtime-contracts"
import type {
  CatalogCheckoutApiRuntime,
  CatalogCheckoutStartResult,
  CheckoutStartInput,
} from "@voyant-travel/commerce/checkout"
import { CatalogCheckoutStartError, startCatalogCheckout } from "@voyant-travel/commerce/checkout"
import type { CommerceCardPaymentRuntime } from "@voyant-travel/commerce/runtime-port"
import type { EventBus, VoyantRuntimeHostPrimitives } from "@voyant-travel/core"
import type { AnyDrizzleDb } from "@voyant-travel/db"
import type { FlightsRuntime } from "@voyant-travel/flights"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"
import type { Context } from "hono"

import { createCatalogComponentAdapter } from "./catalog-component.js"
import { createVoyantFxQuoter, type TripCheckoutDeps } from "./checkout/index.js"
import { createFlightComponentAdapter } from "./flight-component.js"
import { catalogCheckoutResultToComponentResult, createTripsRouteRuntime } from "./route-runtime.js"
import type { TripsRoutesOptionsProvider } from "./routes.js"
import type { ComponentCheckoutInput, ComponentCheckoutResult } from "./service-types.js"

export interface TripsRuntimeDependencies {
  catalog: CatalogRuntimeServices
  checkout: CatalogCheckoutApiRuntime
  cardPayment: CommerceCardPaymentRuntime
  flights?: FlightsRuntime
}

/** Compose Trips routes from generic host primitives and selected package ports. */
export function createTripsRoutesRuntime(
  primitives: VoyantRuntimeHostPrimitives,
  dependencies: TripsRuntimeDependencies,
): TripsRoutesOptionsProvider {
  const routeRuntime = createTripsRouteRuntime({
    createCatalogAdapter(context) {
      const db = getDb(primitives, context)
      return createCatalogComponentAdapter({
        db,
        registry: dependencies.catalog.getSourceRegistryFromContext(context),
        previewOffer: (input) => dependencies.catalog.previewOffer(context, input),
        adapterContext: (connectionId) => ({
          connection_id: connectionId ?? "engine",
          correlation_id: context.req.header("x-request-id") ?? crypto.randomUUID(),
        }),
        startCheckout: (input) => startComponentCheckout(primitives, dependencies, context, input),
      })
    },
    createFlightAdapter(context) {
      if (!dependencies.flights) {
        throw new Error(
          "trip_flight_components_require_flights_runtime: select @voyant-travel/flights or provide flights.runtime",
        )
      }
      return createFlightComponentAdapter({
        adapter: dependencies.flights.resolveAdapter(context),
        adapterContext: {
          connectionId: "demo",
          correlationId: context.req.header("x-request-id") ?? undefined,
        },
      })
    },
    createCheckoutDeps: (context) => createCheckoutDeps(primitives, dependencies, context),
  })
  return routeRuntime.createRoutesOptions
}

function createCheckoutDeps(
  primitives: VoyantRuntimeHostPrimitives,
  dependencies: TripsRuntimeDependencies,
  context: Context,
): TripCheckoutDeps {
  const env = primitives.env(context.env)
  const apiKey = resolveVoyantDataApiKey(env)
  return {
    db: getDb(primitives, context),
    quoteFx: apiKey
      ? createVoyantFxQuoter({ apiKey, baseUrl: stringValue(env.VOYANT_CLOUD_API_URL) })
      : async () => {
          throw new Error("trip_checkout_fx_requires_voyant_data_api_key")
        },
    resolveCheckoutBaseUrl: () => resolveCheckoutBaseUrl(env),
    startProviderPayment: async ({ paymentSessionId, billing, description }) => {
      await dependencies.cardPayment.createStartCardPayment(context)?.({
        db: getDb(primitives, context) as PostgresJsDatabase,
        sessionId: paymentSessionId,
        billing,
        description,
      })
    },
  }
}

async function startComponentCheckout(
  primitives: VoyantRuntimeHostPrimitives,
  dependencies: TripsRuntimeDependencies,
  context: Context,
  input: ComponentCheckoutInput,
): Promise<ComponentCheckoutResult> {
  const bookingId = required(input.component.bookingId, "component.bookingId")
  const checkoutInput: CheckoutStartInput = {
    ...(input.request as Partial<CheckoutStartInput>),
    bookingId,
    paymentIntent: input.intent,
  }
  try {
    const result: CatalogCheckoutStartResult = await startCatalogCheckout(
      {
        db: getDb(primitives, context) as PostgresJsDatabase,
        env: primitives.env(context.env) as Record<string, string | undefined>,
        eventBus: getEventBus(context),
        requestMeta: {
          clientIp:
            context.req.header("cf-connecting-ip") ??
            context.req.header("x-forwarded-for")?.split(",")[0]?.trim() ??
            context.req.header("x-real-ip") ??
            "",
          userAgent: context.req.header("user-agent") ?? "",
        },
        options: dependencies.checkout(context),
      },
      checkoutInput,
    )
    return catalogCheckoutResultToComponentResult(result)
  } catch (error) {
    if (error instanceof CatalogCheckoutStartError) throw new Error(error.code)
    throw error
  }
}

function getDb(primitives: VoyantRuntimeHostPrimitives, context: Context): AnyDrizzleDb {
  return primitives.database.fromContext<AnyDrizzleDb>(context)
}

function getEventBus(context: Context): EventBus | undefined {
  return (context.var as { eventBus?: EventBus }).eventBus
}

function resolveVoyantDataApiKey(env: Readonly<Record<string, unknown>>): string | undefined {
  return (
    nonEmpty(env.VOYANT_DATA_API_KEY) ??
    (nonEmpty(env.VOYANT_ADMIN_AUTH_MODE) === "voyant-cloud"
      ? (nonEmpty(env.VOYANT_API_KEY) ?? nonEmpty(env.VOYANT_CLOUD_API_KEY))
      : undefined)
  )
}

function resolveCheckoutBaseUrl(env: Readonly<Record<string, unknown>>): string | null {
  return (
    nonEmpty(env.PUBLIC_CHECKOUT_BASE_URL) ??
    nonEmpty(env.DASH_BASE_URL) ??
    nonEmpty(env.APP_URL)?.replace(/\/api\/?$/, "") ??
    null
  )
}

function nonEmpty(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined
  const trimmed = value.trim()
  return trimmed && trimmed !== "local-dev" ? trimmed : undefined
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined
}

function required(value: string | null | undefined, label: string): string {
  if (!value) throw new Error(`${label} is required`)
  return value
}
