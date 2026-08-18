/**
 * A typed client for the Voyant Public API.
 *
 * Everything here is generated from the tracked OpenAPI documents composed into
 * one public surface, plus a thin constructor over `openapi-fetch`. There is no
 * hand-written operation layer: it covered 23 of the 138 paths, and reaching
 * into `bookings`, `finance` and `public-api` for runtime schemas is what made
 * this package unpublishable. It now lives in `@voyant-travel/public-api-react`,
 * its only consumer, which stays private (voyant#4626).
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
  createPublicApiClient,
  PublicApiClientCredentialError,
  type PublishableClientOptions,
  type SecretClientOptions,
} from "./typed-client.js"
