/**
 * A typed client for the whole Public API, where the credential picks the type.
 *
 * `createPublicApiClient({ publishableKey })` and the platform-managed form
 * `createPublicApiClient({ managed: true })` are typed on `PublishablePaths`;
 * `createPublicApiClient({ secretKey })` is typed on every operation. A
 * secret-only path is **absent** from the publishable type, so reaching for one
 * with a browser key does not compile — it is not a runtime 403 that a
 * storefront discovers in production (ADR-0023, voyant#4626).
 *
 * The direction surprises people, so it is worth stating: `/v1/public/leads` is
 * secret-only. "Public" names the audience, not the trust level, and a route
 * that captures a person with nothing challenging the submitter stays behind a
 * secret key until the deployment configures an intake guard.
 *
 * Request and response types come from the generated OpenAPI document. There
 * is intentionally no second hand-written operation layer in this package.
 */
import { classifyPublicApiKeyToken, PUBLIC_API_KEY_HEADER } from "@voyant-travel/graph-contracts"
import createClient, { type ClientOptions } from "openapi-fetch"

import type { PublishablePaths, SecretPaths } from "./generated/index.js"

export class PublicApiClientCredentialError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "PublicApiClientCredentialError"
  }
}

interface BaseOptions extends Omit<ClientOptions, "headers"> {
  /** Extra headers. The credential header is set from the key and wins. */
  headers?: Record<string, string>
}

export interface PublishableClientOptions extends BaseOptions {
  /** A publishable (`vpk_`) key. Safe to ship in a browser bundle. */
  publishableKey: string
  secretKey?: never
  managed?: never
}

export interface SecretClientOptions extends BaseOptions {
  /** A secret (`vsk_`) key. Server-side only — never ship this to a browser. */
  secretKey: string
  publishableKey?: never
  managed?: never
}

export interface ManagedClientOptions extends BaseOptions {
  /**
   * Use a Voyant-provided transport that supplies tenant authority outside an
   * API key (for example, a managed Site proxy or connected dev capability).
   * This mode is intentionally limited to the publishable operation surface.
   */
  managed: true
  publishableKey?: never
  secretKey?: never
}

export function createPublicApiClient(
  options: PublishableClientOptions,
): ReturnType<typeof createClient<PublishablePaths>>
export function createPublicApiClient(
  options: SecretClientOptions,
): ReturnType<typeof createClient<SecretPaths>>
export function createPublicApiClient(
  options: ManagedClientOptions,
): ReturnType<typeof createClient<PublishablePaths>>
export function createPublicApiClient(
  options: PublishableClientOptions | SecretClientOptions | ManagedClientOptions,
): ReturnType<typeof createClient<SecretPaths>> {
  // Read through a plain shape rather than the intersection of the two overload
  // types: `secretKey?: never` and `secretKey: string` intersect to `never`,
  // which makes the whole object un-spreadable.
  const { publishableKey, secretKey, managed, headers, ...rest } = options as BaseOptions & {
    publishableKey?: string
    secretKey?: string
    managed?: true
  }
  const token = publishableKey ?? secretKey

  if (!token && !managed) {
    throw new PublicApiClientCredentialError(
      "createPublicApiClient requires a publishableKey, a secretKey, or managed: true.",
    )
  }
  if ([Boolean(publishableKey), Boolean(secretKey), Boolean(managed)].filter(Boolean).length > 1) {
    throw new PublicApiClientCredentialError(
      "createPublicApiClient takes exactly one authority mode; publishableKey, secretKey, and managed cannot be combined.",
    )
  }

  if (managed) {
    const client = createClient<SecretPaths>({ ...rest, headers })
    client.use({
      onRequest({ request }) {
        request.headers.delete(PUBLIC_API_KEY_HEADER)
        return request
      },
    })
    return client
  }

  if (!token) throw new PublicApiClientCredentialError("Public API authority is missing.")

  // Classified by the one prefix table in the repo rather than a
  // local rule, for the reason recorded next to it: two copies of that table
  // drifting is an auth bypass, and this would be the copy that drifts.
  const kind = classifyPublicApiKeyToken(token)
  if (kind === null) {
    throw new PublicApiClientCredentialError(
      "createPublicApiClient requires a Voyant public API key; the value given is not shaped like one.",
    )
  }
  // Caught at wiring time rather than on the first request. A secret key passed
  // as `publishableKey` is about to be shipped into a browser bundle, and the
  // useful moment to say so is before it is.
  if (publishableKey && kind !== "publishable") {
    throw new PublicApiClientCredentialError(
      `publishableKey was given a ${kind} key. A secret key must never reach a browser bundle; ` +
        "pass it as `secretKey` from a server instead.",
    )
  }
  if (secretKey && kind !== "secret") {
    throw new PublicApiClientCredentialError(
      `secretKey was given a ${kind} key. Pass it as \`publishableKey\` — it is typed on the ` +
        "operations that key may actually call.",
    )
  }

  const client = createClient<SecretPaths>({
    ...rest,
    headers: { ...headers, [PUBLIC_API_KEY_HEADER]: token },
  })

  // Not redundant with the header above. openapi-fetch merges per-call headers
  // AFTER the client defaults, so a per-request `x-api-key` would replace the
  // validated credential and walk straight past the checks in this constructor.
  // Middleware runs after that merge.
  client.use({
    onRequest({ request }) {
      request.headers.set(PUBLIC_API_KEY_HEADER, token)
      return request
    },
  })

  return client
}
