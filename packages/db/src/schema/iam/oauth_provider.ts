/**
 * OAuth 2.1 authorization-server table definitions (public schema).
 *
 * These tables are managed by the `@better-auth/oauth-provider` plugin, which
 * backs the MCP connector flow: an external assistant (Claude, ChatGPT) hits
 * `/v1/admin/mcp` unauthenticated, discovers this authorization server, and
 * registers itself dynamically (RFC 7591) — so `oauth_client` rows are created
 * at runtime by clients we never configured, not seeded by us.
 *
 * Defining them in Drizzle ensures they are created by `pnpm db:migrate` and
 * can be queried with typed Drizzle queries (the request auth middleware
 * resolves access tokens through them).
 *
 * Column names use snake_case in SQL but Better Auth accesses them via
 * camelCase JS property names — the Drizzle adapter handles the mapping.
 * Nullability mirrors the plugin's field contract exactly: a column the plugin
 * treats as optional must stay nullable or inserts fail at runtime.
 *
 * `string[]` fields are real Postgres text arrays — the Drizzle adapter reports
 * `supportsArrays: true` for pg, so the plugin passes JS arrays straight
 * through rather than JSON-encoding them.
 */

import { boolean, index, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core"
import { authSession, authUser } from "./auth.js"

// ---------------------------------------------------------------------------
// jwks
//
// Signing keys for the JWT access tokens issued to MCP connectors. Managed by
// Better Auth's `jwt` plugin; the resource server verifies tokens against the
// published JWKS instead of a database round trip per request.
// ---------------------------------------------------------------------------
export const jwksTable = pgTable("jwks", {
  id: text("id").primaryKey(),
  publicKey: text("public_key").notNull(),
  privateKey: text("private_key").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
})

// ---------------------------------------------------------------------------
// oauth_client
//
// One row per connected assistant. Dynamically registered clients are public
// (no secret, PKCE required); `referenceId` carries the organization for
// org-owned registrations, matching the `apikey` table's convention.
// ---------------------------------------------------------------------------
export const oauthClientTable = pgTable(
  "oauth_client",
  {
    id: text("id").primaryKey(),
    clientId: text("client_id").notNull().unique(),
    clientSecret: text("client_secret"),
    disabled: boolean("disabled").default(false),
    skipConsent: boolean("skip_consent"),
    enableEndSession: boolean("enable_end_session"),
    subjectType: text("subject_type"),
    scopes: text("scopes").array(),
    userId: text("user_id").references(() => authUser.id),
    createdAt: timestamp("created_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true }),
    name: text("name"),
    uri: text("uri"),
    icon: text("icon"),
    contacts: text("contacts").array(),
    tos: text("tos"),
    policy: text("policy"),
    softwareId: text("software_id"),
    softwareVersion: text("software_version"),
    softwareStatement: text("software_statement"),
    redirectUris: text("redirect_uris").array().notNull(),
    postLogoutRedirectUris: text("post_logout_redirect_uris").array(),
    tokenEndpointAuthMethod: text("token_endpoint_auth_method"),
    grantTypes: text("grant_types").array(),
    responseTypes: text("response_types").array(),
    public: boolean("public"),
    type: text("type"),
    requirePKCE: boolean("require_pkce"),
    referenceId: text("reference_id"),
    metadata: jsonb("metadata"),
  },
  (table) => [index("idx_oauth_client_user_id").on(table.userId)],
)

// ---------------------------------------------------------------------------
// oauth_refresh_token
//
// `sessionId` is ON DELETE SET NULL so signing out of the admin UI does not
// cascade-delete a connector's long-lived grant.
// ---------------------------------------------------------------------------
export const oauthRefreshTokenTable = pgTable(
  "oauth_refresh_token",
  {
    id: text("id").primaryKey(),
    token: text("token").notNull().unique(),
    clientId: text("client_id")
      .notNull()
      .references(() => oauthClientTable.clientId),
    sessionId: text("session_id").references(() => authSession.id, { onDelete: "set null" }),
    userId: text("user_id")
      .notNull()
      .references(() => authUser.id),
    referenceId: text("reference_id"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    revoked: timestamp("revoked", { withTimezone: true }),
    authTime: timestamp("auth_time", { withTimezone: true }),
    scopes: text("scopes").array().notNull(),
  },
  (table) => [
    index("idx_oauth_refresh_token_client_id").on(table.clientId),
    index("idx_oauth_refresh_token_session_id").on(table.sessionId),
    index("idx_oauth_refresh_token_user_id").on(table.userId),
  ],
)

// ---------------------------------------------------------------------------
// oauth_access_token
//
// Opaque access tokens. `scopes` is the authoritative grant the MCP server
// gates each tool against.
// ---------------------------------------------------------------------------
export const oauthAccessTokenTable = pgTable(
  "oauth_access_token",
  {
    id: text("id").primaryKey(),
    token: text("token").notNull().unique(),
    clientId: text("client_id")
      .notNull()
      .references(() => oauthClientTable.clientId),
    sessionId: text("session_id").references(() => authSession.id, { onDelete: "set null" }),
    userId: text("user_id").references(() => authUser.id),
    referenceId: text("reference_id"),
    refreshId: text("refresh_id").references(() => oauthRefreshTokenTable.id),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    scopes: text("scopes").array().notNull(),
  },
  (table) => [
    index("idx_oauth_access_token_client_id").on(table.clientId),
    index("idx_oauth_access_token_session_id").on(table.sessionId),
    index("idx_oauth_access_token_user_id").on(table.userId),
    index("idx_oauth_access_token_refresh_id").on(table.refreshId),
  ],
)

// ---------------------------------------------------------------------------
// oauth_consent
//
// What the staff member approved on the consent screen, per client. Revoking a
// connector in Settings → MCP deletes this row and its tokens.
// ---------------------------------------------------------------------------
export const oauthConsentTable = pgTable(
  "oauth_consent",
  {
    id: text("id").primaryKey(),
    clientId: text("client_id")
      .notNull()
      .references(() => oauthClientTable.clientId),
    userId: text("user_id").references(() => authUser.id),
    referenceId: text("reference_id"),
    scopes: text("scopes").array().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    index("idx_oauth_consent_client_id").on(table.clientId),
    index("idx_oauth_consent_user_id").on(table.userId),
  ],
)
