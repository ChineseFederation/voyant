/**
 * OAuth 2.1 authorization server for MCP connectors (ADR: agent tool library
 * and MCP).
 *
 * Chat assistants — Claude, ChatGPT — add a remote MCP server by URL alone.
 * They have nowhere to paste an API token, so they follow the MCP
 * authorization spec instead: hit the resource unauthenticated, read the
 * `WWW-Authenticate` challenge, fetch protected-resource metadata, discover
 * this authorization server, register themselves (RFC 7591), and send the
 * operator through a browser consent flow. This module is the Voyant-specific
 * configuration of that server; the protocol itself is
 * `@better-auth/oauth-provider`.
 *
 * The grant is deliberately coarse — `mcp:read` and optionally `mcp:write` —
 * because a non-technical operator cannot reason about fifty resource scopes on
 * a consent screen. The fine-grained permissions are derived at request time
 * from the approving staff member (see {@link resolveMcpGrantScopes}), so a
 * connector can never exceed the person who connected it, and it loses access
 * the moment their role is narrowed.
 */

import {
  type AccessCatalog,
  hasApiKeyPermission,
  permissionStringsToPermissions,
} from "@voyant-travel/types/api-keys"

/** Lets the assistant read data the connecting staff member can read. */
export const MCP_OAUTH_SCOPE_READ = "mcp:read"
/** Additionally lets the assistant make changes, minus sensitive actions. */
export const MCP_OAUTH_SCOPE_WRITE = "mcp:write"
/** Standard OAuth scope for issuing a refresh token (keeps the connector alive). */
export const MCP_OAUTH_SCOPE_OFFLINE = "offline_access"

export const MCP_OAUTH_SCOPES = [
  MCP_OAUTH_SCOPE_READ,
  MCP_OAUTH_SCOPE_WRITE,
  MCP_OAUTH_SCOPE_OFFLINE,
] as const

/**
 * The one action name treated as non-mutating. The access catalog convention is
 * `read` / `write` / `delete`, so anything that is not exactly `read` is
 * withheld from a read-only connector rather than guessed at by prefix.
 */
const READ_ACTION = "read"

export interface McpGrantScopeInput {
  /** Voyant catalog scopes the approving staff member holds (their role). */
  staffScopes: readonly string[]
  /** OAuth scopes on the access token presented by the connector. */
  grantedOAuthScopes: readonly string[]
  accessCatalog: AccessCatalog | undefined
}

/**
 * Resolve the Voyant catalog scopes an MCP request runs with.
 *
 * Three filters compose, all narrowing:
 * 1. the action must be marked remote-safe by its package (the same signal the
 *    remote app grant uses) and must not be sensitive;
 * 2. the approving staff member must actually hold it;
 * 3. a connector without `mcp:write` keeps only `read` actions.
 *
 * Returns an empty list when the token carries no MCP scope at all, which makes
 * an unscoped grant see an empty `tools/list` rather than everything.
 */
export function resolveMcpGrantScopes(input: McpGrantScopeInput): string[] {
  const { accessCatalog } = input
  if (!accessCatalog) return []
  const granted = new Set(input.grantedOAuthScopes)
  if (!granted.has(MCP_OAUTH_SCOPE_READ) && !granted.has(MCP_OAUTH_SCOPE_WRITE)) return []
  const allowMutations = granted.has(MCP_OAUTH_SCOPE_WRITE)
  const permissions = permissionStringsToPermissions([...input.staffScopes])

  return accessCatalog.resources
    .flatMap((resource) =>
      resource.actions
        .filter((action) => {
          if (action.sensitive) return false
          if (!(resource.remoteSafe || action.remoteSafe)) return false
          if (!allowMutations && action.action !== READ_ACTION) return false
          return hasApiKeyPermission(permissions, resource.resource, action.action, accessCatalog)
        })
        .map((action) => `${resource.resource}:${action.action}`),
    )
    .sort()
}

/**
 * Read the OAuth `scope` claim off a verified access token.
 *
 * RFC 8693 carries it as a space-delimited string, but some issuers use an
 * array; accept both and ignore anything else rather than throwing, so a
 * malformed claim degrades to "no scopes" (an empty tool list) instead of a
 * 500 on the MCP surface.
 */
export function parseOAuthScopeClaim(claim: unknown): string[] {
  if (typeof claim === "string") return claim.split(/\s+/).filter(Boolean)
  if (Array.isArray(claim))
    return claim.filter((value): value is string => typeof value === "string")
  return []
}

/**
 * RFC 9728 protected-resource metadata for the MCP endpoint.
 *
 * The authorization server publishes its own metadata, but the *resource*
 * document is the resource server's to serve, and it must live at the origin
 * root — not under the auth base path — because that is where clients look
 * after reading the `WWW-Authenticate` challenge.
 */
export function mcpProtectedResourceMetadata(input: {
  resource: string
  authorizationServer: string
  resourceName?: string
}): {
  resource: string
  authorization_servers: string[]
  scopes_supported: string[]
  bearer_methods_supported: string[]
  resource_name?: string
} {
  return {
    resource: input.resource,
    authorization_servers: [input.authorizationServer],
    scopes_supported: [...MCP_OAUTH_SCOPES],
    bearer_methods_supported: ["header"],
    ...(input.resourceName ? { resource_name: input.resourceName } : {}),
  }
}

/** Metadata fields that carry a URL clients must be able to call directly. */
const AUTH_SERVER_ENDPOINT_FIELDS = [
  "authorization_endpoint",
  "token_endpoint",
  "registration_endpoint",
  "userinfo_endpoint",
  "revocation_endpoint",
  "introspection_endpoint",
  "end_session_endpoint",
  "jwks_uri",
] as const

/**
 * Rewrite authorization-server endpoints onto the publicly reachable API base.
 *
 * Better Auth is mounted behind the API base path, which the Hono app strips
 * before the auth handler sees a request — so its `baseURL` is the bare origin
 * and every URL it advertises omits that prefix. Left alone, a connector would
 * read `https://host/auth/admin/oauth2/authorize` and get the SSR app instead
 * of the authorization server.
 *
 * `issuer` is deliberately NOT rewritten: RFC 8414 requires it to match the URL
 * the document was fetched from (the origin), and it is what the access token's
 * `iss` claim is verified against.
 */
export function withPublicApiEndpoints(
  metadata: Record<string, unknown>,
  input: { authBaseUrl: string; publicApiBaseUrl: string },
): Record<string, unknown> {
  const origin = input.authBaseUrl.replace(/\/+$/, "")
  const publicBase = input.publicApiBaseUrl.replace(/\/+$/, "")
  if (origin === publicBase) return metadata

  const rewritten: Record<string, unknown> = { ...metadata }
  for (const field of AUTH_SERVER_ENDPOINT_FIELDS) {
    const value = rewritten[field]
    if (typeof value !== "string" || !value.startsWith(`${origin}/`)) continue
    rewritten[field] = `${publicBase}${value.slice(origin.length)}`
  }
  return rewritten
}

export interface McpOAuthPluginOptions {
  /** Absolute URL of the MCP endpoint this server issues tokens for. */
  resource: string
  /** Admin sign-in route, used when the client requests the `login` prompt. */
  loginPage?: string
  /** Admin consent route the operator is redirected to before a grant is issued. */
  consentPage?: string
  /** How long an access token lives. Refresh keeps the connector working. */
  accessTokenExpiresIn?: number
}

/** Voyant's configuration of the OAuth 2.1 provider, shaped for MCP connectors. */
export function mcpOAuthProviderConfig(options: McpOAuthPluginOptions) {
  return {
    loginPage: options.loginPage ?? "/sign-in",
    consentPage: options.consentPage ?? "/mcp-consent",
    scopes: [...MCP_OAUTH_SCOPES],
    validAudiences: [options.resource],
    // Chat clients self-register with no credentials — this is the whole point
    // of the flow. The consent screen, not registration, is the trust boundary.
    allowDynamicClientRegistration: true,
    allowUnauthenticatedClientRegistration: true,
    // A newly registered connector starts read-only; asking for write forces it
    // through consent for the wider grant.
    clientRegistrationDefaultScopes: [MCP_OAUTH_SCOPE_READ],
    clientRegistrationAllowedScopes: [...MCP_OAUTH_SCOPES],
    // Tokens are bearer credentials for the whole operator workspace: never
    // readable from a database dump.
    storeTokens: "hashed" as const,
    storeClientSecret: "hashed" as const,
    // Access tokens are signed JWTs so the resource server can verify them
    // against the published JWKS in-process, rather than introspecting itself
    // over HTTP (introspection requires client credentials, which a
    // same-process resource server has no sane way to hold).
    //
    // A JWT cannot be withdrawn once signed, so the resource server also
    // re-checks the connector's consent row on every request (see
    // `resolveMcpAccessToken`). That makes "Disconnect" take effect on the next
    // call rather than whenever the token lapses, which is why this lifetime
    // can stay comfortable instead of being squeezed into a revocation window.
    accessTokenExpiresIn: options.accessTokenExpiresIn ?? 60 * 60,
  }
}
