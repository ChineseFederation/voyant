import { catalogSourcesRuntimeExtensionPort } from "@voyant-travel/catalog/runtime-contracts"
import type { VoyantRuntimeHostPrimitives } from "@voyant-travel/core"
import { publicApiDynamicPackageSourceProviderPort } from "@voyant-travel/public-api/shopping/provider-ports"

import { createVoyantConnectCatalogSourcesExtension } from "./catalog-sources-extension.js"
import { createVoyantConnectPublicApiPackageSourceProvider } from "./public-api-package-sources.js"

export interface VoyantConnectRuntimeContributorHost {
  primitives: VoyantRuntimeHostPrimitives
}

/** Bind Voyant Connect as the deployment's catalog inventory channel. */
export function createVoyantConnectRuntimePortContribution(
  host: VoyantConnectRuntimeContributorHost,
): Readonly<Record<string, unknown>> {
  return {
    [catalogSourcesRuntimeExtensionPort.id]: createVoyantConnectCatalogSourcesExtension(),
    [publicApiDynamicPackageSourceProviderPort.id]:
      createVoyantConnectPublicApiPackageSourceProvider(host.primitives),
  }
}
