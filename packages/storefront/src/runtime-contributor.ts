import { customerBusinessAccountOnboardingRuntimePort } from "@voyant-travel/auth/customer-business-onboarding-runtime-port"
import type { PresentationFxQuoter } from "@voyant-travel/catalog-contracts/presentation-money"
import { createCommerceStorefrontOfferResolvers } from "@voyant-travel/commerce"
import type { VoyantRuntimeHostPrimitives } from "@voyant-travel/core"
import type { VoyantPort } from "@voyant-travel/core/project"
import { createStorefrontCustomerBusinessOnboardingRuntime } from "./customer-business-onboarding-runtime.js"
import { storefrontCustomerPortalRuntimePort, storefrontOffersRuntimePort } from "./runtime-port.js"
import { createManagedStorefrontShoppingRuntime } from "./shopping/managed-runtime.js"
import {
  type StorefrontOpaqueReferenceIssuer,
  type StorefrontShoppingCatalogProvider,
  type StorefrontShoppingLiveProvider,
  type StorefrontShoppingMarketProvider,
  storefrontOpaqueReferenceIssuerPort,
  storefrontPresentationFxProviderPort,
  storefrontShoppingCatalogProviderPort,
  storefrontShoppingLiveProviderPort,
  storefrontShoppingMarketProviderPort,
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
    storefrontShoppingMarketProviderPort,
    storefrontShoppingCatalogProviderPort,
    storefrontShoppingLiveProviderPort,
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
            getRuntimePort?.<StorefrontShoppingMarketProvider>(
              storefrontShoppingMarketProviderPort,
            ),
            getRuntimePort?.<StorefrontShoppingCatalogProvider>(
              storefrontShoppingCatalogProviderPort,
            ),
            getRuntimePort?.<StorefrontShoppingLiveProvider>(storefrontShoppingLiveProviderPort),
            getRuntimePort?.<StorefrontOpaqueReferenceIssuer>(storefrontOpaqueReferenceIssuerPort),
            host.hasRuntimePort?.(storefrontPresentationFxProviderPort)
              ? getRuntimePort?.<PresentationFxQuoter>(storefrontPresentationFxProviderPort)
              : undefined,
          ]).then(([markets, catalog, live, references, quoteFx]) =>
            createManagedStorefrontShoppingRuntime({
              markets: markets as StorefrontShoppingMarketProvider,
              catalog: catalog as StorefrontShoppingCatalogProvider,
              live: live as StorefrontShoppingLiveProvider,
              references: references as StorefrontOpaqueReferenceIssuer,
              ...(quoteFx ? { quoteFx } : {}),
            }),
          ),
        }
      : {}),
  }
}
