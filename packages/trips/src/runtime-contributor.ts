import {
  type CatalogCompositeBookingSessionRuntime,
  catalogCompositeBookingSessionRuntimePort,
} from "@voyant-travel/catalog/composite-booking-session-runtime-port"
import {
  type CatalogRuntimeServices,
  catalogRuntimeServicesPort,
} from "@voyant-travel/catalog/runtime-contracts"
import {
  type CatalogCheckoutApiRuntime,
  catalogCheckoutApiRuntimePort,
} from "@voyant-travel/commerce/checkout"
import {
  type CommerceCardPaymentRuntime,
  commerceCardPaymentRuntimePort,
} from "@voyant-travel/commerce/runtime-port"
import type { VoyantRuntimeHostPrimitives } from "@voyant-travel/core"
import type { VoyantPort } from "@voyant-travel/core/project"
import type { AnyDrizzleDb } from "@voyant-travel/db"
import { type FlightsRuntime, flightsRuntimePort } from "@voyant-travel/flights"
import { type PaymentAdapter, paymentAdapterRuntimePort } from "@voyant-travel/payments"
import {
  publicApiPaymentLinkRuntimePort,
  publicApiPaymentReconciliationJobRuntimePort,
} from "@voyant-travel/public-api"
import {
  publicApiOpaqueReferenceIssuerPort,
  publicApiTripSelectionsRuntimePort,
} from "@voyant-travel/public-api/shopping"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"
import { createTripBookingSessionCompositeHandler } from "./booking-session-composite-handler.js"
import {
  createCommerceCardPaymentRuntime,
  createStandardPaymentLinkRouteOptions,
} from "./public-api-payment-link-runtime.js"
import { publicApiTripOfferResolverPort } from "./public-api-trip-offer-resolver-port.js"
import { createPublicApiTripSelectionsRuntime } from "./public-api-trip-selections-runtime.js"
import type { TripsRoutesOptionsProvider } from "./routes.js"
import { createTripsRoutesRuntime } from "./runtime.js"
import {
  type TripsDatabaseRuntime,
  tripsDatabaseRuntimePort,
  tripsRoutesRuntimePort,
} from "./runtime-port.js"
import { createTripShoppingReferenceRuntime } from "./shopping-opaque-references.js"
import { tripsSourcingJobRuntimePort } from "./sourcing-job-runtime-port.js"

type RuntimePortValue<T> = T | Promise<T>

export interface TripsRuntimePortContribution {
  tripsRoutes: RuntimePortValue<TripsRoutesOptionsProvider>
  tripsDatabase: RuntimePortValue<TripsDatabaseRuntime>
}

export interface TripsRuntimeContributorHost {
  primitives: VoyantRuntimeHostPrimitives
  hasRuntimePort?(port: Pick<VoyantPort<unknown>, "id">): boolean
  getRuntimePort<T>(port: Pick<VoyantPort<T>, "id">): T | Promise<T>
}

/** Package-owned registration map for Trips deployment adapters. */
export function createTripsRuntimePortContribution(
  host: TripsRuntimeContributorHost,
): Readonly<Record<string, unknown>> {
  const paymentAdapter =
    !host.hasRuntimePort?.(commerceCardPaymentRuntimePort) &&
    host.hasRuntimePort?.(paymentAdapterRuntimePort)
      ? host.getRuntimePort<PaymentAdapter>(paymentAdapterRuntimePort)
      : undefined
  const cardPayment = paymentAdapter
    ? Promise.resolve(paymentAdapter).then(createCommerceCardPaymentRuntime)
    : createUnconfiguredCardPaymentRuntime()
  const flights =
    host.hasRuntimePort?.(flightsRuntimePort) === false
      ? undefined
      : host.getRuntimePort<FlightsRuntime>(flightsRuntimePort)
  const compositeBookingSessionHandler = createTripBookingSessionCompositeHandler()
  const catalog = Promise.resolve(
    host.getRuntimePort<CatalogRuntimeServices>(catalogRuntimeServicesPort),
  ).then((services) => {
    services.registerCompositeBookingSessionHandler?.(compositeBookingSessionHandler)
    return services
  })
  const tripsRoutes = Promise.resolve()
    .then(() =>
      Promise.all([
        catalog,
        host.getRuntimePort<CatalogCheckoutApiRuntime>(catalogCheckoutApiRuntimePort),
        flights,
        Promise.resolve(cardPayment),
      ]),
    )
    .then(([catalog, checkout, flights, resolvedCardPayment]) =>
      createTripsRoutesRuntime(host.primitives, {
        catalog,
        checkout,
        cardPayment: resolvedCardPayment,
        flights,
      }),
    )
  const tripsDatabase: TripsDatabaseRuntime = {
    resolveDb: (bindings) => host.primitives.database.resolve(bindings),
    withDb: (bindings, operation) =>
      host.primitives.database.transaction(bindings, (database) => operation(database as never)),
  }
  const shoppingReferences = createTripShoppingReferenceRuntime({
    withTransaction: (operation) =>
      host.primitives.database.transaction(undefined, (database) =>
        operation(database as AnyDrizzleDb),
      ),
  })
  const contribution: Record<string, unknown> = {
    [publicApiPaymentLinkRuntimePort.id]: createStandardPaymentLinkRouteOptions(paymentAdapter),
    [publicApiPaymentReconciliationJobRuntimePort.id]: {
      resolveDb: (bindings: unknown) =>
        host.primitives.database.resolve<PostgresJsDatabase>(bindings),
      resolveAdapter: () => (paymentAdapter ? Promise.resolve(paymentAdapter) : null),
      resolveEnv: (bindings: unknown) => host.primitives.env(bindings),
      warn: (message: string, detail?: unknown) => console.warn(message, detail),
    },
    [tripsRoutesRuntimePort.id]: tripsRoutes,
    [tripsDatabaseRuntimePort.id]: tripsDatabase,
    [publicApiOpaqueReferenceIssuerPort.id]: shoppingReferences.issuer,
    [publicApiTripOfferResolverPort.id]: shoppingReferences.offerResolver,
    [publicApiTripSelectionsRuntimePort.id]: createPublicApiTripSelectionsRuntime({
      withTransaction: (operation) =>
        host.primitives.database.transaction(undefined, (database) =>
          operation(database as AnyDrizzleDb),
        ),
      offerResolver: shoppingReferences.offerResolver,
      compositeBookingSessions: host.getRuntimePort<CatalogCompositeBookingSessionRuntime>(
        catalogCompositeBookingSessionRuntimePort,
      ),
    }),
    [tripsSourcingJobRuntimePort.id]: {
      resolveDb: (bindings: unknown) =>
        host.primitives.database.resolve<PostgresJsDatabase>(bindings),
      async resolveSourceRegistry(bindings: unknown) {
        const services = await catalog
        return services.ensureSourceRegistry(host.primitives.env(bindings))
      },
      async resolveOwnedSearchHandlers() {
        const services = await catalog
        return services.getOwnedAvailabilitySearchHandlers()
      },
      warn: (message: string) => console.warn(message),
    },
  }
  if (paymentAdapter) {
    contribution[commerceCardPaymentRuntimePort.id] = cardPayment
  }
  return contribution
}

function createUnconfiguredCardPaymentRuntime(): CommerceCardPaymentRuntime {
  return {
    createStartCardPayment: () => async () => null,
  }
}
