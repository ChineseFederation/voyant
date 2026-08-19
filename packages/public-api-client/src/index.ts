/**
 * A typed client for the Voyant Public API.
 *
 * Operation types are generated from the tracked OpenAPI documents composed
 * into one public surface. The only hand-written runtime pieces are a thin
 * constructor over `openapi-fetch` and host-neutral Fetch transports; there is
 * no second operation layer. The former hand-written operation layer covered
 * 23 of the 138 paths, and reaching into `bookings`, `finance` and `public-api`
 * for runtime schemas is what made this package unpublishable. It now lives in
 * `@voyant-travel/public-api-react`, its only consumer, which stays private
 * (voyant#4626).
 */
export type {
  components,
  operations,
  PublishablePath,
  PublishablePaths,
  paths,
  SecretPaths,
  webhooks,
} from "./generated/index.js"
export {
  type PublicApiHttpMethod,
  type PublicApiOperationId,
  type PublicApiOperationKeyKind,
  type PublicApiOperationMetadata,
  publicApiOperations,
} from "./generated/index.js"
export {
  createManagedPublicApiFetch,
  ManagedPublicApiFetchConfigurationError,
  type ManagedPublicApiFetchOptions,
  type PublicApiFetch,
} from "./managed-fetch.js"
export {
  createPublicApiClient,
  type ManagedClientOptions,
  PublicApiClientCredentialError,
  type PublishableClientOptions,
  type SecretClientOptions,
} from "./typed-client.js"
