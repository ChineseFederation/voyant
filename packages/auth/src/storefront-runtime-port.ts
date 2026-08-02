import type { LinkService } from "@voyant-travel/core"
import { definePort } from "@voyant-travel/core/project"
import type {
  StorefrontApiKeyKind,
  StorefrontCustomerAccountPolicy,
  StorefrontCustomerAuthMethods,
  StorefrontCustomerAuthSocialProvider,
  StorefrontHostingKind,
} from "@voyant-travel/db/schema/iam"
import type { VoyantDb } from "@voyant-travel/hono"

export interface StorefrontDto {
  id: string
  organizationId: string
  name: string
  slug: string
  hostingKind: StorefrontHostingKind
  siteId: string | null
  allowedOrigins: string[]
  methods: StorefrontCustomerAuthMethods
  accountPolicy: StorefrontCustomerAccountPolicy
  hostOnlyCookies: boolean
  createdAt: string
  updatedAt: string
}

export interface StorefrontChannelBindingDto {
  storefrontId: string
  channelId: string
  channelName: string | null
  channelStatus: string
  createdAt: string | null
  updatedAt: string | null
}

export interface SetStorefrontChannelBindingInput {
  channelId: string
}

export interface StorefrontWithChannelBindingDto extends StorefrontDto {
  channelBinding?: StorefrontChannelBindingDto | null
}

export interface StorefrontApiKeyDto {
  id: string
  storefrontId: string
  kind: StorefrontApiKeyKind
  tokenPreview: string
  name: string | null
  lastUsedAt: string | null
  revokedAt: string | null
  createdAt: string
}

/** Issuance/rotation result: the plaintext token is present exactly once. */
export interface IssuedStorefrontApiKeyDto extends StorefrontApiKeyDto {
  token: string
}

export interface StorefrontProviderCredentialStatusDto {
  provider: StorefrontCustomerAuthSocialProvider
  configured: boolean
  updatedAt: string | null
}

export interface CreateStorefrontInput {
  name: string
  slug: string
  hostingKind: StorefrontHostingKind
  siteId?: string | null
  allowedOrigins: readonly string[]
  methods: StorefrontCustomerAuthMethods
  accountPolicy?: StorefrontCustomerAccountPolicy
}

export interface UpdateStorefrontInput {
  name?: string
  allowedOrigins?: readonly string[]
  methods?: StorefrontCustomerAuthMethods
  accountPolicy?: StorefrontCustomerAccountPolicy
}

/** Operator-scoped admin context: every write is bounded to one organization. */
export interface StorefrontRequestContext {
  bindings: Record<string, unknown>
  db: VoyantDb
  link?: LinkService
  organizationId: string
}

/**
 * Request-time resolve context. Customer-auth resolution runs without an
 * operator user, so no organization scope is present — a token selects its
 * storefront globally, then the declared-origin check authorizes it.
 */
export interface StorefrontResolveContext {
  bindings: Record<string, unknown>
  db: VoyantDb
  link?: LinkService
}

/** A token resolved to its storefront + the key row it authenticated with. */
export interface ResolvedStorefrontApiKey {
  storefront: StorefrontDto
  key: StorefrontApiKeyDto
}

/** Decrypted provider secrets, keyed by provider, for enabled social methods. */
export type ResolvedStorefrontProviderCredentials = Partial<
  Record<StorefrontCustomerAuthSocialProvider, Record<string, string>>
>

export interface StorefrontRuntimeProvider {
  // storefront CRUD ------------------------------------------------------
  listStorefronts(context: StorefrontRequestContext): Promise<StorefrontDto[]>
  getStorefront(context: StorefrontRequestContext, storefrontId: string): Promise<StorefrontDto>
  createStorefront(
    context: StorefrontRequestContext,
    input: CreateStorefrontInput,
  ): Promise<StorefrontDto>
  updateStorefront(
    context: StorefrontRequestContext,
    storefrontId: string,
    patch: UpdateStorefrontInput,
  ): Promise<StorefrontDto>
  deleteStorefront(context: StorefrontRequestContext, storefrontId: string): Promise<void>
  // allowed origins ------------------------------------------------------
  setAllowedOrigins(
    context: StorefrontRequestContext,
    storefrontId: string,
    origins: readonly string[],
  ): Promise<StorefrontDto>
  // access keys ----------------------------------------------------------
  listApiKeys(
    context: StorefrontRequestContext,
    storefrontId: string,
  ): Promise<StorefrontApiKeyDto[]>
  issueApiKey(
    context: StorefrontRequestContext,
    storefrontId: string,
    kind: StorefrontApiKeyKind,
    name?: string | null,
  ): Promise<IssuedStorefrontApiKeyDto>
  rotateApiKey(
    context: StorefrontRequestContext,
    storefrontId: string,
    keyId: string,
  ): Promise<IssuedStorefrontApiKeyDto>
  revokeApiKey(
    context: StorefrontRequestContext,
    storefrontId: string,
    keyId: string,
  ): Promise<void>
  resolveStorefrontByApiKey(
    context: StorefrontResolveContext,
    token: string,
  ): Promise<ResolvedStorefrontApiKey | null>
  /**
   * Resolve a storefront that declares `origin` as an allowed browser origin
   * (exact or `https://*.host` wildcard). Used to authorize keyless CORS
   * preflight requests, which carry an `Origin` but no storefront key.
   */
  resolveStorefrontByOrigin(
    context: StorefrontResolveContext,
    origin: string,
  ): Promise<StorefrontDto | null>
  // account policy + methods --------------------------------------------
  updateAccountPolicy(
    context: StorefrontRequestContext,
    storefrontId: string,
    policy: StorefrontCustomerAccountPolicy,
  ): Promise<StorefrontDto>
  updateMethods(
    context: StorefrontRequestContext,
    storefrontId: string,
    methods: StorefrontCustomerAuthMethods,
  ): Promise<StorefrontDto>
  // provider credentials -------------------------------------------------
  listProviderCredentials(
    context: StorefrontRequestContext,
    storefrontId: string,
  ): Promise<StorefrontProviderCredentialStatusDto[]>
  putProviderCredential(
    context: StorefrontRequestContext,
    storefrontId: string,
    provider: StorefrontCustomerAuthSocialProvider,
    credentials: Record<string, unknown>,
  ): Promise<void>
  deleteProviderCredential(
    context: StorefrontRequestContext,
    storefrontId: string,
    provider: StorefrontCustomerAuthSocialProvider,
  ): Promise<void>
  /** Decrypt the stored secrets for the given providers (request-time seam). */
  resolveProviderCredentials(
    context: StorefrontResolveContext,
    storefrontId: string,
    providers: readonly StorefrontCustomerAuthSocialProvider[],
  ): Promise<ResolvedStorefrontProviderCredentials>
}

export interface StorefrontChannelBindingProvider {
  listStorefrontChannelBindings(
    context: StorefrontRequestContext | StorefrontResolveContext,
    storefrontIds: readonly string[],
  ): Promise<Record<string, StorefrontChannelBindingDto | null>>
  getStorefrontChannelBinding(
    context: StorefrontRequestContext | StorefrontResolveContext,
    storefrontId: string,
  ): Promise<StorefrontChannelBindingDto | null>
  setStorefrontChannelBinding(
    context: StorefrontRequestContext,
    storefrontId: string,
    input: SetStorefrontChannelBindingInput,
  ): Promise<StorefrontChannelBindingDto>
  clearStorefrontChannelBinding(
    context: StorefrontRequestContext,
    storefrontId: string,
  ): Promise<void>
}

const REQUIRED_METHODS = [
  "listStorefronts",
  "getStorefront",
  "createStorefront",
  "updateStorefront",
  "deleteStorefront",
  "setAllowedOrigins",
  "listApiKeys",
  "issueApiKey",
  "rotateApiKey",
  "revokeApiKey",
  "resolveStorefrontByApiKey",
  "resolveStorefrontByOrigin",
  "updateAccountPolicy",
  "updateMethods",
  "listProviderCredentials",
  "putProviderCredential",
  "deleteProviderCredential",
  "resolveProviderCredentials",
] as const

export const storefrontRuntimePort = definePort<StorefrontRuntimeProvider>({
  id: "auth.storefront-runtime",
  test(provider) {
    if (provider === null || typeof provider !== "object") {
      throw new Error("auth.storefront-runtime provider must be an object.")
    }
    for (const method of REQUIRED_METHODS) {
      if (typeof Reflect.get(provider, method) !== "function") {
        throw new Error(`auth.storefront-runtime provider must implement ${method}().`)
      }
    }
  },
})
