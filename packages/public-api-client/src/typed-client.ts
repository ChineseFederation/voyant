/**
 * A typed client for the whole Public API, where the credential picks the type.
 *
 * `createPublicApiClient({ publishableKey })` is typed on `PublishablePaths`;
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
 * This sits beside the hand-written `createVoyantPublicApiClient`, which covers
 * a couple of dozen operations with runtime validation. That one is still the
 * ergonomic path for those; this one reaches everything the surface serves.
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
}

export interface SecretClientOptions extends BaseOptions {
  /** A secret (`vsk_`) key. Server-side only — never ship this to a browser. */
  secretKey: string
  publishableKey?: never
}

export function createPublicApiClient(
  options: PublishableClientOptions,
): ReturnType<typeof createClient<PublishablePaths>>
export function createPublicApiClient(
  options: SecretClientOptions,
): ReturnType<typeof createClient<SecretPaths>>
export function createPublicApiClient(
  options: PublishableClientOptions | SecretClientOptions,
): ReturnType<typeof createClient<SecretPaths>> {
  // Read through a plain shape rather than the intersection of the two overload
  // types: `secretKey?: never` and `secretKey: string` intersect to `never`,
  // which makes the whole object un-spreadable.
  const { publishableKey, secretKey, headers, ...rest } = options as BaseOptions & {
    publishableKey?: string
    secretKey?: string
  }
  const token = publishableKey ?? secretKey

  if (!token) {
    throw new PublicApiClientCredentialError(
      "createPublicApiClient requires either a publishableKey or a secretKey.",
    )
  }
  if (publishableKey && secretKey) {
    throw new PublicApiClientCredentialError(
      "createPublicApiClient takes one credential; both a publishableKey and a secretKey were given.",
    )
  }

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
