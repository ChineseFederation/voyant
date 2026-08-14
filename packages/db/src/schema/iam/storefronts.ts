/**
 * Storefront access model (self-host runtime).
 *
 * A storefront is the commerce-access identity for one frontend that talks to
 * this operator's public API and customer auth. Unlike the managed control
 * plane — where a storefront is scoped to a workload/environment — a self-host
 * deployment IS the tenant boundary (ADR-0001), so a storefront belongs to the
 * deployment rather than to a row-level owner. There is deliberately no
 * `organization_id`: the operator realm never creates a Better Auth
 * organization, so scoping storefronts by one made every write fail its foreign
 * key and every read return nothing (voyant#4261).
 *
 * Access keys (`storefrontApiKeys`) and OAuth provider credentials
 * (`storefrontCustomerAuthCredentials`) hang off a storefront row. The keys are
 * stored only as hashes; the OAuth secrets are stored KMS-encrypted using the
 * framework's opaque `{ enc }` envelope, exactly like every other toxic secret
 * in the schema.
 */
import { boolean, index, jsonb, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core"

import { typeId, typeIdRef } from "../../lib/typeid-column.js"
import type { KmsEnvelope } from "./kms.js"

export const STOREFRONT_CUSTOMER_AUTH_SOCIAL_PROVIDERS = ["google", "facebook", "apple"] as const
export type StorefrontCustomerAuthSocialProvider =
  (typeof STOREFRONT_CUSTOMER_AUTH_SOCIAL_PROVIDERS)[number]

/**
 * `cloud_site` storefronts are hosted on a first-party site whose origin is
 * known from the linked site/domain. `external` storefronts are hosted anywhere
 * else — third-party clouds, static hosts, or a developer's localhost — and
 * declare their own allowed origins.
 */
export const STOREFRONT_HOSTING_KINDS = ["cloud_site", "external"] as const
export type StorefrontHostingKind = (typeof STOREFRONT_HOSTING_KINDS)[number]

/**
 * `publishable` keys are safe to embed in a browser bundle or a native app and
 * authorize public read + customer-auth initiation from a declared origin.
 * `secret` keys are server-only (SSR/BFF) and carry full storefront trust.
 */
export const STOREFRONT_API_KEY_KINDS = ["publishable", "secret"] as const
export type StorefrontApiKeyKind = (typeof STOREFRONT_API_KEY_KINDS)[number]

/**
 * Scope grant on a secret key, keyed by access-catalog resource. Structurally
 * identical to `ApiKeyPermissions` in `@voyant-travel/types` — declared here as
 * a plain alias so the schema package stays free of that dependency.
 */
export type StorefrontApiKeyScopes = Record<string, string[]>

/**
 * Operator-declared toggles for which customer-auth methods a storefront
 * offers. Distinct from the runtime `CustomerAuthMethods` (which carries the
 * resolved Better Auth social-provider secrets); this is the persisted,
 * secret-free declaration.
 */
export type StorefrontCustomerAuthMethods = {
  emailCode: boolean
  emailPassword: boolean
  google: boolean
  facebook: boolean
  apple: boolean
}

/** Buyer-account capability policy, mirroring `CustomerBuyerAccountPolicy`. */
export type StorefrontCustomerAccountPolicy = {
  allowedKinds: ("personal" | "business")[]
  personalSignup: "open" | "disabled"
  businessOnboarding: "disabled" | "open" | "request" | "invite-only"
}

export const storefronts = pgTable(
  "storefronts",
  {
    id: typeId("storefronts"),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    hostingKind: text("hosting_kind").$type<StorefrontHostingKind>().notNull().default("external"),
    // Loose, optional link to the hosting site/domain for `cloud_site`
    // storefronts; null for `external` ones. Kept as a plain reference (no FK)
    // because a self-host deployment may model sites outside this schema.
    siteId: text("site_id"),
    // Operator-declared origins allowed to use this storefront's keys. Exact
    // origins (incl. http://localhost:<port>) or https://*.host wildcards.
    // Drives CORS and Better Auth trusted origins.
    allowedOrigins: jsonb("allowed_origins").$type<string[]>().notNull().default([]),
    methods: jsonb("methods").$type<StorefrontCustomerAuthMethods>().notNull(),
    accountPolicy: jsonb("account_policy")
      .$type<StorefrontCustomerAccountPolicy>()
      .notNull()
      .default({
        allowedKinds: ["personal"],
        personalSignup: "open",
        businessOnboarding: "disabled",
      }),
    hostOnlyCookies: boolean("host_only_cookies").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("storefronts_slug_unique").on(table.slug)],
)

/**
 * Operator-issued storefront access keys. Only the SHA-256 hash is stored; the
 * plaintext is shown once at issuance. `tokenPreview` is a non-secret display
 * prefix (e.g. "vpk_ab12") so the admin can list keys without revealing them.
 */
export const storefrontApiKeys = pgTable(
  "storefront_api_keys",
  {
    id: typeId("storefront_api_keys"),
    storefrontId: typeIdRef("storefront_id")
      .notNull()
      .references(() => storefronts.id, { onDelete: "cascade" }),
    kind: text("kind").$type<StorefrontApiKeyKind>().notNull(),
    /**
     * Grant carried by a SECRET key, in the deployment's own access-catalog
     * vocabulary (`{ resource: [action, ...] }`, the same shape as
     * `apikey.permissions`). A secret key authenticates `/v1/admin/*` as well as
     * `/v1/public/*` (voyant#4625), so it needs a grant narrower than the whole
     * deployment.
     *
     * NULL means "minted before scopes existed" — the unscoped legacy grant,
     * honoured during the compatibility window and deliberately distinguishable
     * from an explicit empty grant. Publishable keys stay NULL forever: a `vpk_`
     * is bounded by the capability line, not by scopes.
     */
    scopes: jsonb("scopes").$type<StorefrontApiKeyScopes>(),
    tokenHash: text("token_hash").notNull(),
    tokenPreview: text("token_preview").notNull(),
    name: text("name"),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("storefront_api_keys_token_hash_unique").on(table.tokenHash),
    index("storefront_api_keys_storefront_idx").on(table.storefrontId),
  ],
)

/**
 * KMS-encrypted OAuth credential bundle for one storefront + provider. The
 * plaintext credentials are never persisted; `encryptedCredentials` holds the
 * opaque `{ enc }` envelope the framework uses for every toxic secret.
 */
export const storefrontCustomerAuthCredentials = pgTable(
  "storefront_customer_auth_credentials",
  {
    id: typeId("storefront_customer_auth_credentials"),
    storefrontId: typeIdRef("storefront_id")
      .notNull()
      .references(() => storefronts.id, { onDelete: "cascade" }),
    provider: text("provider").$type<StorefrontCustomerAuthSocialProvider>().notNull(),
    encryptedCredentials: jsonb("encrypted_credentials").$type<KmsEnvelope>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("storefront_customer_auth_credentials_storefront_provider_unique").on(
      table.storefrontId,
      table.provider,
    ),
  ],
)

export type SelectStorefront = typeof storefronts.$inferSelect
export type InsertStorefront = typeof storefronts.$inferInsert
export type SelectStorefrontApiKey = typeof storefrontApiKeys.$inferSelect
export type InsertStorefrontApiKey = typeof storefrontApiKeys.$inferInsert
export type SelectStorefrontCustomerAuthCredential =
  typeof storefrontCustomerAuthCredentials.$inferSelect
export type InsertStorefrontCustomerAuthCredential =
  typeof storefrontCustomerAuthCredentials.$inferInsert
