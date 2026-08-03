/**
 * Local storefront runtime provider — backs {@link storefrontRuntimePort} with
 * the deployment's own runtime DB (self-host). Mirrors the team-management
 * local adapter: every operator write is bounded to `context.organizationId`,
 * and request-time resolution (`resolveStorefrontByApiKey`) is org-agnostic.
 */
import {
  type InsertStorefront,
  type SelectStorefront,
  type SelectStorefrontApiKey,
  type SelectStorefrontCustomerAuthCredential,
  type StorefrontCustomerAuthSocialProvider,
  storefrontApiKeys,
  storefrontCustomerAuthCredentials,
  storefronts,
} from "@voyant-travel/db/schema/iam"
import { and, desc, eq, sql } from "drizzle-orm"

import {
  type StorefrontCredentialCipher,
  validateStorefrontCredentialBundle,
} from "./storefront-credentials.js"
import {
  classifyStorefrontApiKey,
  generateStorefrontApiKey,
  hashStorefrontApiKey,
} from "./storefront-keys.js"
import {
  enabledStorefrontSocialProviders,
  isStorefrontOriginAllowed,
  normalizeStorefrontAllowedOrigins,
  normalizeStorefrontCustomerAccountPolicy,
  normalizeStorefrontCustomerAuthMethods,
  StorefrontInputError,
} from "./storefront-origins.js"
import type {
  IssuedStorefrontApiKeyDto,
  ResolvedStorefrontApiKey,
  ResolvedStorefrontProviderCredentials,
  StorefrontApiKeyDto,
  StorefrontDto,
  StorefrontProviderCredentialStatusDto,
  StorefrontRequestContext,
  StorefrontResolveContext,
  StorefrontRuntimeProvider,
} from "./storefront-runtime-port.js"

export { isStorefrontOriginAllowed } from "./storefront-origins.js"

function toStorefrontDto(row: SelectStorefront): StorefrontDto {
  return {
    id: row.id,
    organizationId: row.organizationId,
    name: row.name,
    slug: row.slug,
    hostingKind: row.hostingKind,
    siteId: row.siteId ?? null,
    allowedOrigins: [...row.allowedOrigins],
    methods: row.methods,
    accountPolicy: row.accountPolicy,
    hostOnlyCookies: row.hostOnlyCookies,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

function toApiKeyDto(row: SelectStorefrontApiKey): StorefrontApiKeyDto {
  return {
    id: row.id,
    storefrontId: row.storefrontId,
    kind: row.kind,
    tokenPreview: row.tokenPreview,
    name: row.name ?? null,
    lastUsedAt: row.lastUsedAt?.toISOString() ?? null,
    revokedAt: row.revokedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  }
}

function originsOverlap(left: string, right: string): boolean {
  if (left === right) return true
  if (left.startsWith("https://*.") && !right.startsWith("https://*.")) {
    return isStorefrontOriginAllowed(right, [left])
  }
  if (right.startsWith("https://*.") && !left.startsWith("https://*.")) {
    return isStorefrontOriginAllowed(left, [right])
  }
  return false
}

export function createLocalStorefrontAdapter(options: {
  /**
   * Resolve the KMS-backed credential cipher for a deployment. Called with the
   * request bindings so per-deployment KMS config is honoured; the self-host
   * host passes `createKmsStorefrontCredentialCipher(env)`.
   */
  resolveCipher: (bindings: Record<string, unknown>) => StorefrontCredentialCipher
}): StorefrontRuntimeProvider {
  const { resolveCipher } = options

  /** Load a storefront and prove it belongs to the acting organization. */
  async function requireOwnedStorefront(
    context: StorefrontRequestContext,
    storefrontId: string,
  ): Promise<SelectStorefront> {
    const [row] = await context.db
      .select()
      .from(storefronts)
      .where(
        and(
          eq(storefronts.id, storefrontId),
          eq(storefronts.organizationId, context.organizationId),
        ),
      )
      .limit(1)
    if (!row) throw new StorefrontInputError("Storefront was not found.")
    return row
  }

  async function requireCredentialsForEnabledSocialMethods(
    context: StorefrontRequestContext,
    storefrontId: string,
    methods: StorefrontDto["methods"],
  ): Promise<void> {
    const providers = enabledStorefrontSocialProviders(methods)
    if (providers.length === 0) return
    const rows = await context.db
      .select({ provider: storefrontCustomerAuthCredentials.provider })
      .from(storefrontCustomerAuthCredentials)
      .where(eq(storefrontCustomerAuthCredentials.storefrontId, storefrontId))
    const configured = new Set(rows.map((row) => row.provider))
    for (const provider of providers) {
      if (!configured.has(provider)) {
        throw new StorefrontInputError(
          `Customer auth provider ${provider} cannot be enabled without a stored credential.`,
        )
      }
    }
  }

  async function persistStorefrontPatch(
    context: StorefrontRequestContext,
    storefrontId: string,
    patch: Partial<InsertStorefront>,
  ): Promise<StorefrontDto> {
    const [row] = await context.db
      .update(storefronts)
      .set({ ...patch, updatedAt: new Date() })
      .where(
        and(
          eq(storefronts.id, storefrontId),
          eq(storefronts.organizationId, context.organizationId),
        ),
      )
      .returning()
    if (!row) throw new StorefrontInputError("Storefront was not found.")
    return toStorefrontDto(row)
  }

  async function assertNoOverlappingOrigins(
    context: StorefrontRequestContext,
    storefrontId: string | null,
    allowedOrigins: readonly string[],
  ): Promise<void> {
    if (allowedOrigins.length === 0) return
    const rows = await context.db
      .select({ id: storefronts.id, allowedOrigins: storefronts.allowedOrigins })
      .from(storefronts)
      .where(eq(storefronts.organizationId, context.organizationId))
    for (const row of rows) {
      if (storefrontId && row.id === storefrontId) continue
      for (const candidate of allowedOrigins) {
        if (row.allowedOrigins.some((existing) => originsOverlap(candidate, existing))) {
          throw new StorefrontInputError(
            "Storefront allowed origin overlaps another storefront in this organization.",
          )
        }
      }
    }
  }

  async function issueKeyRow(
    context: StorefrontRequestContext,
    storefront: SelectStorefront,
    kind: StorefrontApiKeyDto["kind"],
    name?: string | null,
  ): Promise<IssuedStorefrontApiKeyDto> {
    const generated = await generateStorefrontApiKey(kind)
    const [row] = await context.db
      .insert(storefrontApiKeys)
      .values({
        storefrontId: storefront.id,
        organizationId: storefront.organizationId,
        kind,
        tokenHash: generated.tokenHash,
        tokenPreview: generated.tokenPreview,
        name: name?.trim() || null,
      })
      .returning()
    if (!row) throw new StorefrontInputError("Failed to issue storefront access key.")
    return { ...toApiKeyDto(row), token: generated.token }
  }

  return {
    async listStorefronts(context) {
      const rows = await context.db
        .select()
        .from(storefronts)
        .where(eq(storefronts.organizationId, context.organizationId))
        .orderBy(desc(storefronts.createdAt))
      return rows.map(toStorefrontDto)
    },

    async getStorefront(context, storefrontId) {
      return toStorefrontDto(await requireOwnedStorefront(context, storefrontId))
    },

    async createStorefront(context, input) {
      const methods = normalizeStorefrontCustomerAuthMethods(input.methods)
      if (enabledStorefrontSocialProviders(methods).length > 0) {
        throw new StorefrontInputError(
          "Add the provider credential before creating a storefront with a social method enabled.",
        )
      }
      const accountPolicy = normalizeStorefrontCustomerAccountPolicy(
        input.accountPolicy ?? {
          allowedKinds: ["personal"],
          personalSignup: "open",
          businessOnboarding: "disabled",
        },
      )
      const allowedOrigins = normalizeStorefrontAllowedOrigins(input.allowedOrigins)
      await assertNoOverlappingOrigins(context, null, allowedOrigins)
      if (input.hostingKind === "external" && input.siteId) {
        throw new StorefrontInputError("External storefronts cannot reference a hosting site.")
      }
      const slug = input.slug.trim()
      if (!slug) throw new StorefrontInputError("Storefront slug is required.")
      const [row] = await context.db
        .insert(storefronts)
        .values({
          organizationId: context.organizationId,
          name: input.name.trim(),
          slug,
          hostingKind: input.hostingKind,
          siteId: input.hostingKind === "cloud_site" ? (input.siteId ?? null) : null,
          methods,
          accountPolicy,
          allowedOrigins,
          hostOnlyCookies: true,
        })
        .returning()
      if (!row) throw new StorefrontInputError("Failed to create storefront.")
      return toStorefrontDto(row)
    },

    async updateStorefront(context, storefrontId, patch) {
      await requireOwnedStorefront(context, storefrontId)
      const update: Partial<InsertStorefront> = {}
      if (patch.name !== undefined) update.name = patch.name.trim()
      if (patch.allowedOrigins !== undefined) {
        update.allowedOrigins = normalizeStorefrontAllowedOrigins(patch.allowedOrigins)
        await assertNoOverlappingOrigins(context, storefrontId, update.allowedOrigins)
      }
      if (patch.accountPolicy !== undefined) {
        update.accountPolicy = normalizeStorefrontCustomerAccountPolicy(patch.accountPolicy)
      }
      if (patch.methods !== undefined) {
        const methods = normalizeStorefrontCustomerAuthMethods(patch.methods)
        await requireCredentialsForEnabledSocialMethods(context, storefrontId, methods)
        update.methods = methods
      }
      return persistStorefrontPatch(context, storefrontId, update)
    },

    async deleteStorefront(context, storefrontId) {
      await requireOwnedStorefront(context, storefrontId)
      await context.db
        .delete(storefronts)
        .where(
          and(
            eq(storefronts.id, storefrontId),
            eq(storefronts.organizationId, context.organizationId),
          ),
        )
    },

    async setAllowedOrigins(context, storefrontId, origins) {
      await requireOwnedStorefront(context, storefrontId)
      const allowedOrigins = normalizeStorefrontAllowedOrigins(origins)
      await assertNoOverlappingOrigins(context, storefrontId, allowedOrigins)
      return persistStorefrontPatch(context, storefrontId, {
        allowedOrigins,
      })
    },

    async listApiKeys(context, storefrontId) {
      await requireOwnedStorefront(context, storefrontId)
      const rows = await context.db
        .select()
        .from(storefrontApiKeys)
        .where(eq(storefrontApiKeys.storefrontId, storefrontId))
        .orderBy(desc(storefrontApiKeys.createdAt))
      return rows.map(toApiKeyDto)
    },

    async issueApiKey(context, storefrontId, kind, name) {
      const storefront = await requireOwnedStorefront(context, storefrontId)
      return issueKeyRow(context, storefront, kind, name)
    },

    async rotateApiKey(context, storefrontId, keyId) {
      const storefront = await requireOwnedStorefront(context, storefrontId)
      const [existing] = await context.db
        .select()
        .from(storefrontApiKeys)
        .where(
          and(eq(storefrontApiKeys.id, keyId), eq(storefrontApiKeys.storefrontId, storefrontId)),
        )
        .limit(1)
      if (!existing) throw new StorefrontInputError("Storefront access key was not found.")
      await context.db
        .update(storefrontApiKeys)
        .set({ revokedAt: new Date(), updatedAt: new Date() })
        .where(eq(storefrontApiKeys.id, keyId))
      return issueKeyRow(context, storefront, existing.kind, existing.name)
    },

    async revokeApiKey(context, storefrontId, keyId) {
      await requireOwnedStorefront(context, storefrontId)
      await context.db
        .update(storefrontApiKeys)
        .set({ revokedAt: new Date(), updatedAt: new Date() })
        .where(
          and(eq(storefrontApiKeys.id, keyId), eq(storefrontApiKeys.storefrontId, storefrontId)),
        )
    },

    async resolveStorefrontByApiKey(
      context: StorefrontResolveContext,
      token: string,
    ): Promise<ResolvedStorefrontApiKey | null> {
      if (classifyStorefrontApiKey(token) === null) return null
      const tokenHash = await hashStorefrontApiKey(token)
      const [key] = await context.db
        .select()
        .from(storefrontApiKeys)
        .where(eq(storefrontApiKeys.tokenHash, tokenHash))
        .limit(1)
      if (!key || key.revokedAt) return null
      const [storefront] = await context.db
        .select()
        .from(storefronts)
        .where(eq(storefronts.id, key.storefrontId))
        .limit(1)
      if (!storefront) return null
      try {
        await context.db
          .update(storefrontApiKeys)
          .set({ lastUsedAt: new Date() })
          .where(eq(storefrontApiKeys.id, key.id))
      } catch {
        // Best-effort usage stamping; never fail the request on it.
      }
      return { storefront: toStorefrontDto(storefront), key: toApiKeyDto(key) }
    },

    async resolveStorefrontByOrigin(
      context: StorefrontResolveContext,
      origin: string,
    ): Promise<StorefrontDto | null> {
      // Preflight authorization is keyless, so it cannot select a single
      // storefront up front. Exact-origin entries are filtered in SQL via
      // containment; wildcard (`https://*.host`) declarations are matched in
      // memory over the small self-host storefront set. Multiple matches are
      // rejected so keyless preflight cannot authorize an ambiguous origin.
      //
      // `allowed_origins` is a jsonb array, not a Postgres text[]. Both filters
      // below have to speak jsonb: `jsonb @> text[]` and `unnest(jsonb)` do not
      // exist, so the text[] forms failed to plan and every origin-bearing
      // request 500ed regardless of the stored data.
      const exactMatches = await context.db
        .select()
        .from(storefronts)
        // agent-quality: raw-sql reviewed -- jsonb containment authorizes the exact declared origin without loading every row.
        .where(sql`${storefronts.allowedOrigins} @> ${JSON.stringify([origin])}::jsonb`)
      const wildcardCandidates = await context.db
        .select()
        .from(storefronts)
        // agent-quality: raw-sql reviewed -- Only rows carrying a wildcard origin declaration are considered for the in-memory match.
        .where(
          sql`EXISTS (SELECT 1 FROM jsonb_array_elements_text(${storefronts.allowedOrigins}) AS o WHERE o LIKE 'https://*.%')`,
        )
      const wildcardMatches = wildcardCandidates.filter((row) =>
        isStorefrontOriginAllowed(origin, row.allowedOrigins),
      )
      const matchesByStorefrontId = new Map(
        [...exactMatches, ...wildcardMatches].map((row) => [row.id, row]),
      )
      const matches = [...matchesByStorefrontId.values()]
      if (matches.length > 1) {
        throw new StorefrontInputError("Storefront origin resolves to multiple storefronts.")
      }
      return matches[0] ? toStorefrontDto(matches[0]) : null
    },

    async updateAccountPolicy(context, storefrontId, policy) {
      await requireOwnedStorefront(context, storefrontId)
      return persistStorefrontPatch(context, storefrontId, {
        accountPolicy: normalizeStorefrontCustomerAccountPolicy(policy),
      })
    },

    async updateMethods(context, storefrontId, methods) {
      await requireOwnedStorefront(context, storefrontId)
      const normalized = normalizeStorefrontCustomerAuthMethods(methods)
      await requireCredentialsForEnabledSocialMethods(context, storefrontId, normalized)
      return persistStorefrontPatch(context, storefrontId, { methods: normalized })
    },

    async listProviderCredentials(context, storefrontId) {
      await requireOwnedStorefront(context, storefrontId)
      const rows = await context.db
        .select()
        .from(storefrontCustomerAuthCredentials)
        .where(eq(storefrontCustomerAuthCredentials.storefrontId, storefrontId))
      const byProvider = new Map<
        StorefrontCustomerAuthSocialProvider,
        SelectStorefrontCustomerAuthCredential
      >(rows.map((row) => [row.provider, row]))
      return (["google", "facebook", "apple"] as const).map(
        (provider): StorefrontProviderCredentialStatusDto => {
          const row = byProvider.get(provider)
          return {
            provider,
            configured: Boolean(row),
            updatedAt: row?.updatedAt.toISOString() ?? null,
          }
        },
      )
    },

    async putProviderCredential(context, storefrontId, provider, credentials) {
      const storefront = await requireOwnedStorefront(context, storefrontId)
      const bundle = validateStorefrontCredentialBundle(provider, credentials)
      const encrypted = await resolveCipher(context.bindings).encrypt(JSON.stringify(bundle))
      const [existing] = await context.db
        .select({ id: storefrontCustomerAuthCredentials.id })
        .from(storefrontCustomerAuthCredentials)
        .where(
          and(
            eq(storefrontCustomerAuthCredentials.storefrontId, storefrontId),
            eq(storefrontCustomerAuthCredentials.provider, provider),
          ),
        )
        .limit(1)
      if (existing) {
        await context.db
          .update(storefrontCustomerAuthCredentials)
          .set({ encryptedCredentials: encrypted, updatedAt: new Date() })
          .where(eq(storefrontCustomerAuthCredentials.id, existing.id))
        return
      }
      await context.db.insert(storefrontCustomerAuthCredentials).values({
        storefrontId,
        organizationId: storefront.organizationId,
        provider,
        encryptedCredentials: encrypted,
      })
    },

    async deleteProviderCredential(context, storefrontId, provider) {
      await requireOwnedStorefront(context, storefrontId)
      await context.db
        .delete(storefrontCustomerAuthCredentials)
        .where(
          and(
            eq(storefrontCustomerAuthCredentials.storefrontId, storefrontId),
            eq(storefrontCustomerAuthCredentials.provider, provider),
          ),
        )
    },

    async resolveProviderCredentials(
      context: StorefrontResolveContext,
      storefrontId: string,
      providers: readonly StorefrontCustomerAuthSocialProvider[],
    ): Promise<ResolvedStorefrontProviderCredentials> {
      if (providers.length === 0) return {}
      const rows = await context.db
        .select()
        .from(storefrontCustomerAuthCredentials)
        .where(eq(storefrontCustomerAuthCredentials.storefrontId, storefrontId))
      const cipher = resolveCipher(context.bindings)
      const resolved: ResolvedStorefrontProviderCredentials = {}
      for (const row of rows) {
        if (!providers.includes(row.provider)) continue
        const plaintext = await cipher.decrypt(row.encryptedCredentials)
        resolved[row.provider] = JSON.parse(plaintext) as Record<string, string>
      }
      return resolved
    },
  }
}
