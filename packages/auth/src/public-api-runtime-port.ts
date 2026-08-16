import type { LinkService } from "@voyant-travel/core"
import { definePort } from "@voyant-travel/core/project"
import type {
  CustomerAccountPolicy,
  CustomerAuthMethodToggles,
  CustomerAuthSocialProvider,
  PublicApiKeyKind,
} from "@voyant-travel/db/schema/iam"
import type { VoyantDb } from "@voyant-travel/hono"
import type { PublicApiKeyScopes } from "@voyant-travel/types/public-api-key-scopes"

/**
 * One issued public API key. The key is the unit: there is no storefront row
 * above it, so everything that used to be grouped by one — the origins it may
 * be presented from, the channel it publishes to, its cookie scope — is here.
 */
export interface PublicApiKeyDto {
  id: string
  kind: PublicApiKeyKind
  /**
   * Grant carried by a SECRET key, in the deployment's access-catalog
   * vocabulary. `null` on every publishable key (a `vpk_` is bounded by the
   * capability line, not by scopes) and on secret keys minted before scopes
   * existed, which are honoured unscoped for the compatibility window.
   */
  scopes: PublicApiKeyScopes | null
  tokenPreview: string
  name: string | null
  allowedOrigins: string[]
  /**
   * Channel the key names explicitly, or `null` for the deployment's Direct
   * channel. `null` is the ordinary case, not an unconfigured one — see
   * {@link ResolvedPublicApiChannel.implicit}.
   */
  channelId: string | null
  hostOnlyCookies: boolean
  lastUsedAt: string | null
  revokedAt: string | null
  createdAt: string
  updatedAt: string
}

/** Issuance/rotation result: the plaintext token is present exactly once. */
export interface IssuedPublicApiKeyDto extends PublicApiKeyDto {
  token: string
}

/** The deployment's customer-account configuration. Exactly one of these. */
export interface CustomerAccountSettingsDto {
  methods: CustomerAuthMethodToggles
  accountPolicy: CustomerAccountPolicy
  updatedAt: string
}

export interface CustomerAccountCredentialStatusDto {
  provider: CustomerAuthSocialProvider
  configured: boolean
  updatedAt: string | null
}

export interface CreatePublicApiKeyInput {
  kind: PublicApiKeyKind
  name?: string | null
  allowedOrigins?: readonly string[]
  channelId?: string | null
  hostOnlyCookies?: boolean
  /**
   * Grant for a secret key. Omitted means the commerce-shaped default set;
   * ignored entirely for a publishable key.
   */
  scopes?: PublicApiKeyScopes | null
}

export interface UpdatePublicApiKeyInput {
  name?: string | null
  allowedOrigins?: readonly string[]
  channelId?: string | null
  hostOnlyCookies?: boolean
  scopes?: PublicApiKeyScopes | null
}

export interface UpdateCustomerAccountSettingsInput {
  methods?: CustomerAuthMethodToggles
  accountPolicy?: CustomerAccountPolicy
}

/**
 * Operator admin context. The deployment is the tenant boundary
 * (docs/adr/0001-tenant-scoping.md), so there is no in-process organization
 * scope to bound a write to — the operator actor guard on `/v1/admin/*` and the
 * access-catalog scopes are the authorization.
 */
export interface PublicApiRequestContext {
  bindings: Record<string, unknown>
  db: VoyantDb
  link?: LinkService
}

/**
 * Request-time resolve context. Customer-auth resolution runs without an
 * operator user — a token selects its key, then the declared-origin check
 * authorizes it.
 */
export interface PublicApiResolveContext {
  bindings: Record<string, unknown>
  db: VoyantDb
  link?: LinkService
}

/** Decrypted provider secrets, keyed by provider, for enabled social methods. */
export type ResolvedCustomerAccountCredentials = Partial<
  Record<CustomerAuthSocialProvider, Record<string, string>>
>

export interface PublicApiRuntimeProvider {
  // access keys ----------------------------------------------------------
  listApiKeys(context: PublicApiRequestContext): Promise<PublicApiKeyDto[]>
  getApiKey(context: PublicApiRequestContext, keyId: string): Promise<PublicApiKeyDto>
  issueApiKey(
    context: PublicApiRequestContext,
    input: CreatePublicApiKeyInput,
  ): Promise<IssuedPublicApiKeyDto>
  updateApiKey(
    context: PublicApiRequestContext,
    keyId: string,
    patch: UpdatePublicApiKeyInput,
  ): Promise<PublicApiKeyDto>
  rotateApiKey(context: PublicApiRequestContext, keyId: string): Promise<IssuedPublicApiKeyDto>
  revokeApiKey(context: PublicApiRequestContext, keyId: string): Promise<void>
  /** A presented token resolved to the key row it authenticated with. */
  resolveApiKeyByToken(
    context: PublicApiResolveContext,
    token: string,
  ): Promise<PublicApiKeyDto | null>
  /**
   * Every live key that declares `origin` as an allowed browser origin (exact
   * or `https://*.host` wildcard), oldest first. Used to authorize keyless CORS
   * preflight, which carries an `Origin` but no key.
   *
   * Returns them ALL rather than picking one, because deciding whether the
   * origin is ambiguous means comparing the channels they RESOLVE to, and only
   * the caller holds the channel provider — `channels` belongs to
   * `@voyant-travel/distribution` and this port to `@voyant-travel/auth`.
   * Comparing the stored `channelId` here would deny a perfectly ordinary
   * setup: `null` (implicit Direct) and an explicit Direct binding are the same
   * channel, and so is a key whose named channel has gone away.
   */
  resolveApiKeysByOrigin(
    context: PublicApiResolveContext,
    origin: string,
  ): Promise<PublicApiKeyDto[]>
  // customer accounts ----------------------------------------------------
  getCustomerAccountSettings(
    context: PublicApiRequestContext | PublicApiResolveContext,
  ): Promise<CustomerAccountSettingsDto>
  updateCustomerAccountSettings(
    context: PublicApiRequestContext,
    patch: UpdateCustomerAccountSettingsInput,
  ): Promise<CustomerAccountSettingsDto>
  // provider credentials -------------------------------------------------
  listProviderCredentials(
    context: PublicApiRequestContext,
  ): Promise<CustomerAccountCredentialStatusDto[]>
  putProviderCredential(
    context: PublicApiRequestContext,
    provider: CustomerAuthSocialProvider,
    credentials: Record<string, unknown>,
  ): Promise<void>
  deleteProviderCredential(
    context: PublicApiRequestContext,
    provider: CustomerAuthSocialProvider,
  ): Promise<void>
  /** Decrypt the stored secrets for the given providers (request-time seam). */
  resolveProviderCredentials(
    context: PublicApiResolveContext,
    providers: readonly CustomerAuthSocialProvider[],
  ): Promise<ResolvedCustomerAccountCredentials>
}

/**
 * The channel a key publishes to, once resolved.
 *
 * `implicit` is true when the key named no channel and resolved to the
 * deployment's Direct one — the default every public surface gets without an
 * operator configuring anything. The distinction is for display and
 * diagnostics only; both are equally valid to serve on. An admin surface should
 * show an implicit channel as the default rather than as a configured choice,
 * so clearing it reads as "back to Direct" and not as "breaks the public API".
 */
export interface ResolvedPublicApiChannel {
  channelId: string
  channelName: string | null
  channelStatus: string
  implicit: boolean
}

/**
 * Reads the `channels` table on behalf of the public API.
 *
 * A separate provider because `channels` belongs to
 * `@voyant-travel/distribution` and this port to `@voyant-travel/auth`; the
 * seam is what keeps auth from importing distribution's schema.
 */
export interface PublicApiChannelProvider {
  /**
   * Resolve the channel for a key. `channelId` null — or naming a channel that
   * is gone or inactive — falls back to Direct: losing the channel an operator
   * chose is a reason to serve the default, not a reason to take the public
   * surface down.
   */
  resolveChannelForKey(
    context: PublicApiRequestContext | PublicApiResolveContext,
    channelId: string | null,
  ): Promise<ResolvedPublicApiChannel | null>
  /** Batch form for the admin key list. */
  resolveChannelsForKeys(
    context: PublicApiRequestContext | PublicApiResolveContext,
    channelIds: readonly (string | null)[],
  ): Promise<Map<string | null, ResolvedPublicApiChannel | null>>
}

const REQUIRED_METHODS = [
  "listApiKeys",
  "getApiKey",
  "issueApiKey",
  "updateApiKey",
  "rotateApiKey",
  "revokeApiKey",
  "resolveApiKeyByToken",
  "resolveApiKeysByOrigin",
  "getCustomerAccountSettings",
  "updateCustomerAccountSettings",
  "listProviderCredentials",
  "putProviderCredential",
  "deleteProviderCredential",
  "resolveProviderCredentials",
] as const

export const publicApiRuntimePort = definePort<PublicApiRuntimeProvider>({
  id: "auth.public-api-runtime",
  test(provider) {
    if (provider === null || typeof provider !== "object") {
      throw new Error("auth.public-api-runtime provider must be an object.")
    }
    for (const method of REQUIRED_METHODS) {
      if (typeof Reflect.get(provider, method) !== "function") {
        throw new Error(`auth.public-api-runtime provider must implement ${method}().`)
      }
    }
  },
})
