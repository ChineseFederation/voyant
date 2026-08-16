/**
 * Public API access model (self-host runtime).
 *
 * There is no storefront entity. A deployment IS the tenant boundary
 * (ADR-0001), so it serves one set of surfaces, and the only scenario that ever
 * justified N storefront rows — several brands inside one tenant — is
 * explicitly not happening (voyant#4624). What the row carried is now split
 * between the two things that genuinely vary:
 *
 * - **The key** is the unit. It carries the origins it may be used from, the
 *   channel it publishes to, and its own cookie scope. Two frontends talking to
 *   this deployment are two keys, not two storefronts.
 * - **The deployment** owns customer accounts. Which sign-in methods are
 *   offered and what a buyer account may be are properties of the operator, not
 *   of whichever frontend the customer happened to arrive through — a customer
 *   who signs up on the website and returns through a mobile app is one
 *   account.
 *
 * Keys are stored only as hashes; the OAuth secrets are stored KMS-encrypted
 * using the framework's opaque `{ enc }` envelope, exactly like every other
 * toxic secret in the schema.
 */
import { boolean, index, jsonb, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core"

import { typeId } from "../../lib/typeid-column.js"
import type { KmsEnvelope } from "./kms.js"

export const CUSTOMER_AUTH_SOCIAL_PROVIDERS = ["google", "facebook", "apple"] as const
export type CustomerAuthSocialProvider = (typeof CUSTOMER_AUTH_SOCIAL_PROVIDERS)[number]

/**
 * `publishable` keys are safe to embed in a browser bundle or a native app and
 * authorize public read + customer-auth initiation from a declared origin.
 * `secret` keys are server-only (SSR/BFF) and carry the grant in `scopes`.
 */
export const PUBLIC_API_KEY_KINDS = ["publishable", "secret"] as const
export type PublicApiKeyKind = (typeof PUBLIC_API_KEY_KINDS)[number]

/**
 * Scope grant on a secret key, keyed by access-catalog resource. Structurally
 * identical to `ApiKeyPermissions` in `@voyant-travel/types` — declared here as
 * a plain alias so the schema package stays free of that dependency.
 */
export type PublicApiKeyScopes = Record<string, string[]>

/**
 * Operator-declared toggles for which customer-auth methods the deployment
 * offers. Distinct from the runtime `CustomerAuthMethods` (which carries the
 * resolved Better Auth social-provider secrets); this is the persisted,
 * secret-free declaration.
 */
export type CustomerAuthMethodToggles = {
  emailCode: boolean
  emailPassword: boolean
  google: boolean
  facebook: boolean
  apple: boolean
}

/** Buyer-account capability policy, mirroring `CustomerBuyerAccountPolicy`. */
export type CustomerAccountPolicy = {
  allowedKinds: ("personal" | "business")[]
  personalSignup: "open" | "disabled"
  businessOnboarding: "disabled" | "open" | "request" | "invite-only"
}

/**
 * Operator-issued public API keys. Only the SHA-256 hash is stored; the
 * plaintext is shown once at issuance. `tokenPreview` is a non-secret display
 * prefix (e.g. "vpk_ab12") so the admin can list keys without revealing them.
 */
export const publicApiKeys = pgTable(
  "public_api_keys",
  {
    id: typeId("public_api_keys"),
    kind: text("kind").$type<PublicApiKeyKind>().notNull(),
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
    scopes: jsonb("scopes").$type<PublicApiKeyScopes>(),
    tokenHash: text("token_hash").notNull(),
    tokenPreview: text("token_preview").notNull(),
    name: text("name"),
    /**
     * Origins allowed to present this key. Exact origins (incl.
     * `http://localhost:<port>`) or `https://*.host` wildcards. Drives CORS and
     * Better Auth trusted origins.
     *
     * On the key rather than on a parent row because this is the one thing that
     * genuinely differs between two frontends: the website and the mobile BFF
     * are the same operator, the same customer accounts and the same channel,
     * differing only in where they may be called from.
     */
    allowedOrigins: jsonb("allowed_origins").$type<string[]>().notNull().default([]),
    /**
     * Channel this key publishes to. NULL means the deployment's Direct channel
     * — the default every public surface gets without an operator configuring
     * anything (voyant#4633). A key naming another channel is how `affiliate` /
     * `reseller` / `api_partner` keep working.
     *
     * Deliberately not a foreign key: `channels` belongs to
     * `@voyant-travel/distribution` and this table to `@voyant-travel/db`, and
     * the resolution already tolerates a channel that has gone away by falling
     * back to Direct rather than taking the public surface down.
     */
    channelId: text("channel_id"),
    hostOnlyCookies: boolean("host_only_cookies").notNull().default(true),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("public_api_keys_token_hash_unique").on(table.tokenHash),
    index("public_api_keys_channel_idx").on(table.channelId),
  ],
)

/**
 * The deployment's customer-account configuration. Exactly one row: the
 * singleton column is `true` on every row and carries a unique index, so a
 * second one cannot be inserted rather than merely being discouraged.
 *
 * A singleton table and not a `settings` key/value row because the shape is
 * typed and read on the customer-auth hot path, and because a policy that
 * silently defaults when absent is how a deployment ends up serving a signup
 * policy nobody chose.
 */
export const customerAccountSettings = pgTable(
  "customer_account_settings",
  {
    id: typeId("customer_account_settings"),
    singleton: boolean("singleton").notNull().default(true),
    methods: jsonb("methods").$type<CustomerAuthMethodToggles>().notNull(),
    accountPolicy: jsonb("account_policy")
      .$type<CustomerAccountPolicy>()
      .notNull()
      .default({
        allowedKinds: ["personal"],
        personalSignup: "open",
        businessOnboarding: "disabled",
      }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("customer_account_settings_singleton_unique").on(table.singleton)],
)

/**
 * KMS-encrypted OAuth credential bundle for one provider, deployment-wide. The
 * plaintext credentials are never persisted; `encryptedCredentials` holds the
 * opaque `{ enc }` envelope the framework uses for every toxic secret.
 */
export const customerAccountCredentials = pgTable(
  "customer_account_credentials",
  {
    id: typeId("customer_account_credentials"),
    provider: text("provider").$type<CustomerAuthSocialProvider>().notNull(),
    encryptedCredentials: jsonb("encrypted_credentials").$type<KmsEnvelope>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("customer_account_credentials_provider_unique").on(table.provider)],
)

export type SelectPublicApiKey = typeof publicApiKeys.$inferSelect
export type InsertPublicApiKey = typeof publicApiKeys.$inferInsert
export type SelectCustomerAccountSettings = typeof customerAccountSettings.$inferSelect
export type InsertCustomerAccountSettings = typeof customerAccountSettings.$inferInsert
export type SelectCustomerAccountCredential = typeof customerAccountCredentials.$inferSelect
export type InsertCustomerAccountCredential = typeof customerAccountCredentials.$inferInsert
