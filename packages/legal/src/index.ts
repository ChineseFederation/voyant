import { OpenAPIHono } from "@hono/zod-openapi"
import type { Module } from "@voyant-travel/core"
import { defineGraphRuntimeFactory } from "@voyant-travel/core/project"
import { openApiValidationHook, stampOpenApiRegistryApiId } from "@voyant-travel/hono"
import type { ApiModule } from "@voyant-travel/hono/module"
import {
  buildContractsRouteRuntime,
  CONTRACTS_ROUTE_RUNTIME_CONTAINER_KEY,
} from "./contracts/route-runtime.js"
import {
  type ContractsRouteOptions,
  createContractsAdminRoutes,
  createContractsPublicRoutes,
} from "./contracts/routes.js"
import { legalLinkable } from "./linkables.js"
import { policiesAdminRoutes, policiesPublicRoutes } from "./policies/routes.js"
import { legalRuntimePort } from "./runtime-port.js"
import { legalTermsAdminRoutes, legalTermsPublicRoutes } from "./terms/routes.js"

export { legalLinkable } from "./linkables.js"

export const legalModule: Module = {
  name: "legal",
  linkable: legalLinkable,
  requiresTransactionalDb: true,
}

export type CreateLegalApiModuleOptions = ContractsRouteOptions

export function createLegalApiModule(options: CreateLegalApiModuleOptions = {}): ApiModule {
  // Parents are `OpenAPIHono` so the contracts/policies/terms sub-chains'
  // `.openapi()` operations propagate up into the framework/operator OpenAPI
  // registries (voyant#2114). The shared `openApiValidationHook` is the
  // `defaultHook`.
  const legalAdminRoutes = new OpenAPIHono({ defaultHook: openApiValidationHook })
    .route("/contracts", createContractsAdminRoutes(options))
    .route("/policies", policiesAdminRoutes)
    .route("/terms", legalTermsAdminRoutes)

  const legalPublicRoutes = stampOpenApiRegistryApiId(
    new OpenAPIHono({ defaultHook: openApiValidationHook })
      .route("/contracts", createContractsPublicRoutes(options))
      .route("/policies", policiesPublicRoutes)
      .route("/terms", legalTermsPublicRoutes),
    "@voyant-travel/legal#api.public",
  )

  const module: Module = {
    ...legalModule,
    bootstrap: ({ bindings, container, eventBus }) => {
      const bindingsRecord = bindings as Record<string, unknown>
      const contractsRuntime = buildContractsRouteRuntime(bindingsRecord, options)
      contractsRuntime.eventBus ??= eventBus
      container.register(CONTRACTS_ROUTE_RUNTIME_CONTAINER_KEY, contractsRuntime)
    },
  }

  return {
    module,
    adminRoutes: legalAdminRoutes,
    publicRoutes: legalPublicRoutes,
  }
}

export const legalApiModule: ApiModule = createLegalApiModule()

/** Package-owned adapter from the graph port registry to the public module factory. */
export const createLegalVoyantRuntime = defineGraphRuntimeFactory(async ({ getPort }) =>
  createLegalApiModule(await getPort(legalRuntimePort)),
)

export {
  CONTRACT_DOCUMENT_ROUTE_PATHS,
  type ContractDocumentDelivery,
  type ContractDocumentRoutesOptions,
  type ContractDocumentStorageLike,
  createContractDocumentApiModule,
  createContractDocumentRoutes,
  createContractDocumentVoyantRuntime,
} from "./contract-document-routes.js"
export { legalContractDocumentRuntimePort } from "./contract-document-runtime-port.js"
export {
  assertLegalDocumentArtifactProviderConformance,
  checksumLegalDocumentBytes,
  LEGAL_DOCUMENT_ARTIFACT_PROVIDER_PROTOCOL,
  type LegalDocumentArtifactIdentity,
  type LegalDocumentArtifactInspection,
  LegalDocumentArtifactMismatchError,
  type LegalDocumentArtifactProvider,
  type LegalDocumentArtifactReference,
  type LegalDocumentRenderDescriptor,
  type LegalDocumentRenderedArtifact,
  legalDocumentArtifactProviderPort,
} from "./contracts/document-artifact-provider.js"
export * from "./contracts/index.js"
export {
  buildContractsRouteRuntime,
  CONTRACTS_ROUTE_RUNTIME_CONTAINER_KEY,
  type ContractsRouteRuntime,
} from "./contracts/route-runtime.js"
export type { ContractsRouteOptions } from "./contracts/routes.js"
export * from "./policies/index.js"
export { legalRuntimePort } from "./runtime-port.js"
export * from "./terms/index.js"
