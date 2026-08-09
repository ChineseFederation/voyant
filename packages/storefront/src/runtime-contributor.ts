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
import { createCommerceStorefrontOfferResolvers } from "@voyant-travel/commerce"
import type { VoyantRuntimeHostPrimitives } from "@voyant-travel/core"
import type { VoyantPort } from "@voyant-travel/core/project"
import { createStorefrontCustomerBusinessOnboardingRuntime } from "./customer-business-onboarding-runtime.js"
import { storefrontCustomerPortalRuntimePort, storefrontOffersRuntimePort } from "./runtime-port.js"
import { createClosedStorefrontShoppingLiveProvider } from "./shopping/closed-live-provider.js"
import { createClosedStorefrontShoppingAdapters } from "./shopping/closed-provider-adapters.js"
import { createManagedStorefrontShoppingRuntime } from "./shopping/managed-runtime.js"
import {
  type StorefrontDynamicPackageSourceProvider,
  type StorefrontOpaqueReferenceIssuer,
  type StorefrontShoppingLiveProvider,
  storefrontDynamicPackageSourceProviderPort,
  storefrontOpaqueReferenceIssuerPort,
  storefrontPresentationFxProviderPort,
  storefrontShoppingLiveProviderPort,
} from "./shopping/provider-ports.js"
import { storefrontShoppingRuntimePort } from "./shopping/runtime-port.js"

export interface StorefrontRuntimeContributorHost {
  primitives: VoyantRuntimeHostPrimitives
  hasRuntimePort?(port: { id: string }): boolean
  getRuntimePort?<T>(port: Pick<VoyantPort<T>, "id">): T | Promise<T>
}

/** Storefront-owned adapters derived exclusively from generic Node primitives. */
export function createStorefrontRuntimePortContribution(
  host: StorefrontRuntimeContributorHost,
): Readonly<Record<string, unknown>> {
  const managedShoppingDependencies = [
    catalogSearchRuntimePort,
    catalogRuntimeServicesPort,
    storefrontOpaqueReferenceIssuerPort,
  ] as const
  const canProvideManagedShopping =
    host.getRuntimePort !== undefined &&
    managedShoppingDependencies.every((port) => host.hasRuntimePort?.(port) === true)
  const getRuntimePort = host.getRuntimePort
  return {
    [storefrontOffersRuntimePort.id]: createCommerceStorefrontOfferResolvers(),
    [storefrontCustomerPortalRuntimePort.id]: {
      resolveDocumentDownloadUrl: host.primitives.storage.downloadUrl,
    },
    ...(host.hasRuntimePort?.(customerBusinessAccountOnboardingRuntimePort)
      ? {}
      : {
          [customerBusinessAccountOnboardingRuntimePort.id]:
            createStorefrontCustomerBusinessOnboardingRuntime(),
        }),
    ...(canProvideManagedShopping
      ? {
          [storefrontShoppingRuntimePort.id]: Promise.all([
            getRuntimePort?.<CatalogSearchRuntimeOptions>(catalogSearchRuntimePort),
            getRuntimePort?.<CatalogRuntimeServices>(catalogRuntimeServicesPort),
            host.hasRuntimePort?.(storefrontShoppingLiveProviderPort)
              ? getRuntimePort?.<StorefrontShoppingLiveProvider>(storefrontShoppingLiveProviderPort)
              : undefined,
            host.hasRuntimePort?.(storefrontDynamicPackageSourceProviderPort)
              ? getRuntimePort?.<StorefrontDynamicPackageSourceProvider>(
                  storefrontDynamicPackageSourceProviderPort,
                )
              : undefined,
            getRuntimePort?.<StorefrontOpaqueReferenceIssuer>(storefrontOpaqueReferenceIssuerPort),
            host.hasRuntimePort?.(storefrontPresentationFxProviderPort)
              ? getRuntimePort?.<PresentationFxQuoter>(storefrontPresentationFxProviderPort)
              : undefined,
          ]).then(
            ([
              catalogSearch,
              catalogServices,
              configuredLive,
              packageSources,
              references,
              quoteFx,
            ]) => {
              const adapters = createClosedStorefrontShoppingAdapters({
                primitives: host.primitives,
                catalogSearch: catalogSearch as CatalogSearchRuntimeOptions,
                catalogServices: catalogServices as CatalogRuntimeServices,
              })
              const live =
                configuredLive ??
                createClosedStorefrontShoppingLiveProvider({
                  primitives: host.primitives,
                  catalogServices: catalogServices as CatalogRuntimeServices,
                  markets: adapters.markets,
                  ...(packageSources
                    ? { packages: packageSources as StorefrontDynamicPackageSourceProvider }
                    : {}),
                })
              return createManagedStorefrontShoppingRuntime({
                ...adapters,
                live,
                references: references as StorefrontOpaqueReferenceIssuer,
                ...(quoteFx ? { quoteFx } : {}),
              })
            },
          ),
        }
      : {}),
  }
}
