import { catalogSourcesRuntimeExtensionPort } from "@voyant-travel/catalog/runtime-contracts"
import type { VoyantRuntimeHostPrimitives } from "@voyant-travel/core"
import { storefrontDynamicPackageSourceProviderPort } from "@voyant-travel/storefront/shopping/provider-ports"

import { createVoyantConnectCatalogSourcesExtension } from "./catalog-sources-extension.js"
import { createVoyantConnectStorefrontPackageSourceProvider } from "./storefront-package-sources.js"

export interface VoyantConnectRuntimeContributorHost {
  primitives: VoyantRuntimeHostPrimitives
}

/** Bind Voyant Connect as the deployment's catalog inventory channel. */
export function createVoyantConnectRuntimePortContribution(
  host: VoyantConnectRuntimeContributorHost,
): Readonly<Record<string, unknown>> {
  return {
    [catalogSourcesRuntimeExtensionPort.id]: createVoyantConnectCatalogSourcesExtension(),
    [storefrontDynamicPackageSourceProviderPort.id]:
      createVoyantConnectStorefrontPackageSourceProvider(host.primitives),
  }
}
