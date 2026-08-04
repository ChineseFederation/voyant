import { catalogSourcesRuntimeExtensionPort } from "@voyant-travel/catalog/runtime-contracts"

import { createVoyantConnectCatalogSourcesExtension } from "./catalog-sources-extension.js"

/** Bind Voyant Connect as the deployment's catalog inventory channel. */
export function createVoyantConnectRuntimePortContribution(): Readonly<Record<string, unknown>> {
  return {
    [catalogSourcesRuntimeExtensionPort.id]: createVoyantConnectCatalogSourcesExtension(),
  }
}
