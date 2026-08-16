import { customerBusinessAccountOnboardingRuntimePort } from "@voyant-travel/auth/customer-business-onboarding-runtime-port"
import {
  type CatalogSearchRuntimeOptions,
  catalogSearchRuntimePort,
} from "@voyant-travel/catalog/api-runtime-ports"
import {
  type CatalogRuntimeServices,
  catalogRuntimeServicesPort,
} from "@voyant-travel/catalog/runtime-contracts"
import type { PresentationFxQuoter } from "@voyant-travel/catalog-contracts/presentation-money"
import { createCommercePublicApiOfferResolvers } from "@voyant-travel/commerce"
import type { VoyantRuntimeHostPrimitives } from "@voyant-travel/core"
import type { VoyantPort } from "@voyant-travel/core/project"
import { type FlightsRuntime, flightsRuntimePort } from "@voyant-travel/flights"
import { createPublicApiCustomerBusinessOnboardingRuntime } from "./customer-business-onboarding-runtime.js"
import { publicApiCustomerPortalRuntimePort, publicApiOffersRuntimePort } from "./runtime-port.js"
import { createClosedPublicApiShoppingLiveProvider } from "./shopping/closed-live-provider.js"
import { createClosedPublicApiShoppingAdapters } from "./shopping/closed-provider-adapters.js"
import { createManagedPublicApiShoppingRuntime } from "./shopping/managed-runtime.js"
import {
  type PublicApiDynamicPackageSourceProvider,
  type PublicApiOpaqueReferenceIssuer,
  type PublicApiShoppingLiveProvider,
  publicApiDynamicPackageSourceProviderPort,
  publicApiOpaqueReferenceIssuerPort,
  publicApiPresentationFxProviderPort,
  publicApiShoppingLiveProviderPort,
} from "./shopping/provider-ports.js"
import { publicApiShoppingRuntimePort } from "./shopping/runtime-port.js"

export interface PublicApiRuntimeContributorHost {
  primitives: VoyantRuntimeHostPrimitives
  hasRuntimePort?(port: { id: string }): boolean
  getRuntimePort?<T>(port: Pick<VoyantPort<T>, "id">): T | Promise<T>
}

/** Storefront-owned adapters derived exclusively from generic Node primitives. */
export function createPublicApiRuntimePortContribution(
  host: PublicApiRuntimeContributorHost,
): Readonly<Record<string, unknown>> {
  const managedShoppingDependencies = [
    catalogSearchRuntimePort,
    catalogRuntimeServicesPort,
    publicApiOpaqueReferenceIssuerPort,
  ] as const
  const canProvideManagedShopping =
    host.getRuntimePort !== undefined &&
    managedShoppingDependencies.every((port) => host.hasRuntimePort?.(port) === true)
  const getRuntimePort = host.getRuntimePort
  return {
    [publicApiOffersRuntimePort.id]: createCommercePublicApiOfferResolvers(),
    [publicApiCustomerPortalRuntimePort.id]: {
      resolveDocumentDownloadUrl: host.primitives.storage.downloadUrl,
    },
    ...(host.hasRuntimePort?.(customerBusinessAccountOnboardingRuntimePort)
      ? {}
      : {
          [customerBusinessAccountOnboardingRuntimePort.id]:
            createPublicApiCustomerBusinessOnboardingRuntime(),
        }),
    ...(canProvideManagedShopping
      ? {
          [publicApiShoppingRuntimePort.id]: Promise.all([
            getRuntimePort?.<CatalogSearchRuntimeOptions>(catalogSearchRuntimePort),
            getRuntimePort?.<CatalogRuntimeServices>(catalogRuntimeServicesPort),
            host.hasRuntimePort?.(publicApiShoppingLiveProviderPort)
              ? getRuntimePort?.<PublicApiShoppingLiveProvider>(publicApiShoppingLiveProviderPort)
              : undefined,
            host.hasRuntimePort?.(publicApiDynamicPackageSourceProviderPort)
              ? getRuntimePort?.<PublicApiDynamicPackageSourceProvider>(
                  publicApiDynamicPackageSourceProviderPort,
                )
              : undefined,
            host.hasRuntimePort?.(flightsRuntimePort)
              ? getRuntimePort?.<FlightsRuntime>(flightsRuntimePort)
              : undefined,
            getRuntimePort?.<PublicApiOpaqueReferenceIssuer>(publicApiOpaqueReferenceIssuerPort),
            host.hasRuntimePort?.(publicApiPresentationFxProviderPort)
              ? getRuntimePort?.<PresentationFxQuoter>(publicApiPresentationFxProviderPort)
              : undefined,
          ]).then(
            ([
              catalogSearch,
              catalogServices,
              configuredLive,
              packageSources,
              flights,
              references,
              quoteFx,
            ]) => {
              const adapters = createClosedPublicApiShoppingAdapters({
                primitives: host.primitives,
                catalogSearch: catalogSearch as CatalogSearchRuntimeOptions,
                catalogServices: catalogServices as CatalogRuntimeServices,
              })
              const live =
                configuredLive ??
                createClosedPublicApiShoppingLiveProvider({
                  primitives: host.primitives,
                  catalogServices: catalogServices as CatalogRuntimeServices,
                  markets: adapters.markets,
                  ...(flights ? { flights: flights as FlightsRuntime } : {}),
                  ...(packageSources
                    ? { packages: packageSources as PublicApiDynamicPackageSourceProvider }
                    : {}),
                })
              return createManagedPublicApiShoppingRuntime({
                ...adapters,
                live,
                references: references as PublicApiOpaqueReferenceIssuer,
                ...(quoteFx ? { quoteFx } : {}),
              })
            },
          ),
        }
      : {}),
  }
}
