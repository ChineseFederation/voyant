/**
 * Local public-API runtime provider — backs {@link publicApiRuntimePort} with
 * the deployment's own runtime DB (self-host). The deployment is the tenant
 * boundary (docs/adr/0001-tenant-scoping.md), so keys and customer-account
 * settings are deployment-wide: operator writes are authorized by the
 * `/v1/admin/*` staff guard and the access-catalog scopes, and request-time
 * resolution (`resolveApiKeyByToken`) selects by token.
 */
import {
  type CustomerAccountPolicy,
  type CustomerAuthMethodToggles,
  type CustomerAuthSocialProvider,
  customerAccountCredentials,
  customerAccountSettings,
  type InsertPublicApiKey,
  publicApiKeys,
  type SelectCustomerAccountCredential,
  type SelectPublicApiKey,
} from "@voyant-travel/db/schema/iam"
import {
  normalizePublicApiKeyScopes,
  PUBLIC_API_SECRET_KEY_DEFAULT_SCOPES,
  type PublicApiKeyScopes,
} from "@voyant-travel/types/public-api-key-scopes"
import { asc, desc, eq, sql } from "drizzle-orm"
import {
  type PublicApiCredentialCipher,
  validatePublicApiCredentialBundle,
} from "./public-api-credentials.js"
import {
  classifyPublicApiApiKey,
  generatePublicApiApiKey,
  hashPublicApiApiKey,
} from "./public-api-key-tokens.js"
import {
  enabledCustomerSocialProviders,
  isPublicApiOriginAllowed,
  normalizeCustomerAccountPolicy,
  normalizeCustomerAuthMethods,
  normalizePublicApiAllowedOrigins,
  PublicApiInputError,
} from "./public-api-origins.js"
import type {
  CustomerAccountCredentialStatusDto,
  CustomerAccountSettingsDto,
  IssuedPublicApiKeyDto,
  PublicApiKeyDto,
  PublicApiRequestContext,
  PublicApiResolveContext,
  PublicApiRuntimeProvider,
  ResolvedCustomerAccountCredentials,
} from "./public-api-runtime-port.js"

export { isPublicApiOriginAllowed } from "./public-api-origins.js"

const SOCIAL_PROVIDERS = ["google", "facebook", "apple"] as const

const DEFAULT_ACCOUNT_POLICY: CustomerAccountPolicy = {
  allowedKinds: ["personal"],
  personalSignup: "open",
  businessOnboarding: "disabled",
}

const DEFAULT_METHODS: CustomerAuthMethodToggles = {
  emailCode: true,
  emailPassword: true,
  google: false,
  facebook: false,
  apple: false,
}

function toApiKeyDto(row: SelectPublicApiKey): PublicApiKeyDto {
  return {
    id: row.id,
    kind: row.kind,
    scopes: row.scopes ?? null,
    tokenPreview: row.tokenPreview,
    name: row.name ?? null,
    allowedOrigins: [...row.allowedOrigins],
    channelId: row.channelId ?? null,
    hostOnlyCookies: row.hostOnlyCookies,
    lastUsedAt: row.lastUsedAt?.toISOString() ?? null,
    revokedAt: row.revokedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

export function createLocalPublicApiAdapter(options: {
  /**
   * Resolve the KMS-backed credential cipher for a deployment. Called with the
   * request bindings so per-deployment KMS config is honoured; the self-host
   * host passes `createKmsPublicApiCredentialCipher(env)`.
   */
  resolveCipher: (bindings: Record<string, unknown>) => PublicApiCredentialCipher
}): PublicApiRuntimeProvider {
  const { resolveCipher } = options

  async function requireKey(
    context: PublicApiRequestContext,
    keyId: string,
  ): Promise<SelectPublicApiKey> {
    const [row] = await context.db
      .select()
      .from(publicApiKeys)
      .where(eq(publicApiKeys.id, keyId))
      .limit(1)
    if (!row) throw new PublicApiInputError("Public API key was not found.")
    return row
  }

  /**
   * The single settings row, created on first read if the migration has not
   * left one. Returning a default rather than throwing keeps a deployment that
   * has never opened the admin surface able to serve customer auth.
   */
  async function loadSettings(
    context: PublicApiRequestContext | PublicApiResolveContext,
  ): Promise<CustomerAccountSettingsDto> {
    const [row] = await context.db.select().from(customerAccountSettings).limit(1)
    if (row) {
      return {
        methods: row.methods,
        accountPolicy: row.accountPolicy,
        updatedAt: row.updatedAt.toISOString(),
      }
    }
    const [created] = await context.db
      .insert(customerAccountSettings)
      .values({ methods: DEFAULT_METHODS, accountPolicy: DEFAULT_ACCOUNT_POLICY })
      .onConflictDoNothing()
      .returning()
    if (created) {
      return {
        methods: created.methods,
        accountPolicy: created.accountPolicy,
        updatedAt: created.updatedAt.toISOString(),
      }
    }
    // Lost the insert race against a concurrent request; re-read its row.
    const [existing] = await context.db.select().from(customerAccountSettings).limit(1)
    if (!existing) throw new PublicApiInputError("Customer account settings are unavailable.")
    return {
      methods: existing.methods,
      accountPolicy: existing.accountPolicy,
      updatedAt: existing.updatedAt.toISOString(),
    }
  }

  async function requireCredentialsForEnabledSocialMethods(
    context: PublicApiRequestContext,
    methods: CustomerAuthMethodToggles,
  ): Promise<void> {
    const providers = enabledCustomerSocialProviders(methods)
    if (providers.length === 0) return
    const rows = await context.db
      .select({ provider: customerAccountCredentials.provider })
      .from(customerAccountCredentials)
    const configured = new Set(rows.map((row) => row.provider))
    for (const provider of providers) {
      if (!configured.has(provider)) {
        throw new PublicApiInputError(
          `Customer auth provider ${provider} cannot be enabled without a stored credential.`,
        )
      }
    }
  }

  function normalizeChannelId(channelId: string | null | undefined): string | null {
    if (channelId === undefined || channelId === null) return null
    const trimmed = channelId.trim()
    return trimmed || null
  }

  async function issueKeyRow(
    context: PublicApiRequestContext,
    values: Omit<InsertPublicApiKey, "tokenHash" | "tokenPreview">,
    scopes: PublicApiKeyScopes | null | undefined,
  ): Promise<IssuedPublicApiKeyDto> {
    const generated = await generatePublicApiApiKey(values.kind)
    // A publishable key never carries scopes: it is bounded by the capability
    // line, and a scope set on it would imply it could be widened. A secret key
    // always gets one — the commerce-shaped default when the operator picked
    // nothing — so `null` keeps meaning "minted before scopes existed".
    const grant =
      values.kind === "publishable"
        ? null
        : (normalizePublicApiKeyScopes(scopes) ?? PUBLIC_API_SECRET_KEY_DEFAULT_SCOPES)
    const [row] = await context.db
      .insert(publicApiKeys)
      .values({
        ...values,
        scopes: grant,
        tokenHash: generated.tokenHash,
        tokenPreview: generated.tokenPreview,
      })
      .returning()
    if (!row) throw new PublicApiInputError("Failed to issue public API key.")
    return { ...toApiKeyDto(row), token: generated.token }
  }

  return {
    async listApiKeys(context) {
      const rows = await context.db
        .select()
        .from(publicApiKeys)
        .orderBy(desc(publicApiKeys.createdAt))
      return rows.map(toApiKeyDto)
    },

    async getApiKey(context, keyId) {
      return toApiKeyDto(await requireKey(context, keyId))
    },

    async issueApiKey(context, input) {
      const allowedOrigins = normalizePublicApiAllowedOrigins(input.allowedOrigins ?? [])
      // A publishable key ships in a browser bundle, so the declared-origin
      // check is the only thing narrowing where it may be used. Minting one
      // with no origins would produce a key nothing can present.
      if (input.kind === "publishable" && allowedOrigins.length === 0) {
        throw new PublicApiInputError("A publishable key requires at least one allowed origin.")
      }
      return issueKeyRow(
        context,
        {
          kind: input.kind,
          name: input.name?.trim() || null,
          allowedOrigins,
          channelId: normalizeChannelId(input.channelId),
          hostOnlyCookies: input.hostOnlyCookies ?? true,
        },
        input.scopes,
      )
    },

    async updateApiKey(context, keyId, patch) {
      const existing = await requireKey(context, keyId)
      const update: Partial<InsertPublicApiKey> = { updatedAt: new Date() }
      if (patch.name !== undefined) update.name = patch.name?.trim() || null
      if (patch.allowedOrigins !== undefined) {
        const allowedOrigins = normalizePublicApiAllowedOrigins(patch.allowedOrigins)
        if (existing.kind === "publishable" && allowedOrigins.length === 0) {
          throw new PublicApiInputError("A publishable key requires at least one allowed origin.")
        }
        update.allowedOrigins = allowedOrigins
      }
      if (patch.channelId !== undefined) update.channelId = normalizeChannelId(patch.channelId)
      if (patch.hostOnlyCookies !== undefined) update.hostOnlyCookies = patch.hostOnlyCookies
      if (patch.scopes !== undefined) {
        if (existing.kind === "publishable") {
          throw new PublicApiInputError("A publishable key cannot carry scopes.")
        }
        update.scopes =
          normalizePublicApiKeyScopes(patch.scopes) ?? PUBLIC_API_SECRET_KEY_DEFAULT_SCOPES
      }
      const [row] = await context.db
        .update(publicApiKeys)
        .set(update)
        .where(eq(publicApiKeys.id, keyId))
        .returning()
      if (!row) throw new PublicApiInputError("Public API key was not found.")
      return toApiKeyDto(row)
    },

    async rotateApiKey(context, keyId) {
      const existing = await requireKey(context, keyId)
      await context.db
        .update(publicApiKeys)
        .set({ revokedAt: new Date(), updatedAt: new Date() })
        .where(eq(publicApiKeys.id, keyId))
      // Rotation replaces the token, never the grant or the binding: an
      // operator rotating a leaked key is not asking to re-authorize it, and
      // its origins and channel are what keep the frontend working.
      return issueKeyRow(
        context,
        {
          kind: existing.kind,
          name: existing.name,
          allowedOrigins: existing.allowedOrigins,
          channelId: existing.channelId,
          hostOnlyCookies: existing.hostOnlyCookies,
        },
        existing.scopes,
      )
    },

    async revokeApiKey(context, keyId) {
      await requireKey(context, keyId)
      await context.db
        .update(publicApiKeys)
        .set({ revokedAt: new Date(), updatedAt: new Date() })
        .where(eq(publicApiKeys.id, keyId))
    },

    async resolveApiKeyByToken(context: PublicApiResolveContext, token: string) {
      if (classifyPublicApiApiKey(token) === null) return null
      const tokenHash = await hashPublicApiApiKey(token)
      const [key] = await context.db
        .select()
        .from(publicApiKeys)
        .where(eq(publicApiKeys.tokenHash, tokenHash))
        .limit(1)
      if (!key || key.revokedAt) return null
      try {
        await context.db
          .update(publicApiKeys)
          .set({ lastUsedAt: new Date() })
          .where(eq(publicApiKeys.id, key.id))
      } catch {
        // Best-effort usage stamping; never fail the request on it.
      }
      return toApiKeyDto(key)
    },

    async resolveApiKeysByOrigin(context: PublicApiResolveContext, origin: string) {
      // Preflight authorization is keyless, so it cannot select a single key up
      // front. Exact-origin entries are filtered in SQL via containment;
      // wildcard (`https://*.host`) declarations are matched in memory over the
      // small key set.
      //
      // `allowed_origins` is a jsonb array, not a Postgres text[]. Both filters
      // below have to speak jsonb: `jsonb @> text[]` and `unnest(jsonb)` do not
      // exist, so the text[] forms failed to plan and every origin-bearing
      // request 500ed regardless of the stored data.
      const exactMatches = await context.db
        .select()
        .from(publicApiKeys)
        // agent-quality: raw-sql reviewed -- jsonb containment authorizes the exact declared origin without loading every row.
        .where(sql`${publicApiKeys.allowedOrigins} @> ${JSON.stringify([origin])}::jsonb`)
      const wildcardCandidates = await context.db
        .select()
        .from(publicApiKeys)
        // agent-quality: raw-sql reviewed -- Only rows carrying a wildcard origin declaration are considered for the in-memory match.
        .where(
          sql`EXISTS (SELECT 1 FROM jsonb_array_elements_text(${publicApiKeys.allowedOrigins}) AS o WHERE o LIKE 'https://*.%')`,
        )
      const wildcardMatches = wildcardCandidates.filter((row) =>
        isPublicApiOriginAllowed(origin, row.allowedOrigins),
      )
      const byId = new Map([...exactMatches, ...wildcardMatches].map((row) => [row.id, row]))
      // Oldest first, so a caller taking the head gets a stable answer. Several
      // keys declaring one origin is the ORDINARY case now that the key is the
      // unit — a site's publishable key and its BFF's secret key are two rows on
      // the same origin. Whether that is AMBIGUOUS depends on the channels they
      // resolve to, which only the caller can determine.
      return [...byId.values()]
        .filter((row) => !row.revokedAt)
        .sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime())
        .map(toApiKeyDto)
    },

    async getCustomerAccountSettings(context) {
      return loadSettings(context)
    },

    async updateCustomerAccountSettings(context, patch) {
      const current = await loadSettings(context)
      const update: { methods?: CustomerAuthMethodToggles; accountPolicy?: CustomerAccountPolicy } =
        {}
      if (patch.methods !== undefined) {
        const methods = normalizeCustomerAuthMethods(patch.methods)
        await requireCredentialsForEnabledSocialMethods(context, methods)
        update.methods = methods
      }
      if (patch.accountPolicy !== undefined) {
        update.accountPolicy = normalizeCustomerAccountPolicy(patch.accountPolicy)
      }
      if (update.methods === undefined && update.accountPolicy === undefined) return current
      const [row] = await context.db
        .update(customerAccountSettings)
        .set({ ...update, updatedAt: new Date() })
        .returning()
      if (!row) throw new PublicApiInputError("Customer account settings are unavailable.")
      return {
        methods: row.methods,
        accountPolicy: row.accountPolicy,
        updatedAt: row.updatedAt.toISOString(),
      }
    },

    async listProviderCredentials(context) {
      const rows = await context.db.select().from(customerAccountCredentials)
      const byProvider = new Map<CustomerAuthSocialProvider, SelectCustomerAccountCredential>(
        rows.map((row) => [row.provider, row]),
      )
      return SOCIAL_PROVIDERS.map((provider): CustomerAccountCredentialStatusDto => {
        const row = byProvider.get(provider)
        return {
          provider,
          configured: Boolean(row),
          updatedAt: row?.updatedAt.toISOString() ?? null,
        }
      })
    },

    async putProviderCredential(context, provider, credentials) {
      const bundle = validatePublicApiCredentialBundle(provider, credentials)
      const encrypted = await resolveCipher(context.bindings).encrypt(JSON.stringify(bundle))
      const [existing] = await context.db
        .select({ id: customerAccountCredentials.id })
        .from(customerAccountCredentials)
        .where(eq(customerAccountCredentials.provider, provider))
        .limit(1)
      if (existing) {
        await context.db
          .update(customerAccountCredentials)
          .set({ encryptedCredentials: encrypted, updatedAt: new Date() })
          .where(eq(customerAccountCredentials.id, existing.id))
        return
      }
      await context.db
        .insert(customerAccountCredentials)
        .values({ provider, encryptedCredentials: encrypted })
    },

    async deleteProviderCredential(context, provider) {
      // Deleting the secret behind an enabled method would leave customer auth
      // advertising a provider it cannot complete a sign-in with, so the method
      // has to be turned off first — the mirror of the check on enabling it.
      const settings = await loadSettings(context)
      if (enabledCustomerSocialProviders(settings.methods).includes(provider)) {
        throw new PublicApiInputError(
          `Disable the ${provider} sign-in method before removing its credential.`,
        )
      }
      await context.db
        .delete(customerAccountCredentials)
        .where(eq(customerAccountCredentials.provider, provider))
    },

    async resolveProviderCredentials(
      context: PublicApiResolveContext,
      providers: readonly CustomerAuthSocialProvider[],
    ): Promise<ResolvedCustomerAccountCredentials> {
      if (providers.length === 0) return {}
      const rows = await context.db
        .select()
        .from(customerAccountCredentials)
        .orderBy(asc(customerAccountCredentials.provider))
      const cipher = resolveCipher(context.bindings)
      const resolved: ResolvedCustomerAccountCredentials = {}
      for (const row of rows) {
        if (!providers.includes(row.provider)) continue
        const plaintext = await cipher.decrypt(row.encryptedCredentials)
        resolved[row.provider] = JSON.parse(plaintext) as Record<string, string>
      }
      return resolved
    },
  }
}
