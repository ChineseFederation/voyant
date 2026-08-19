import type { AccessCatalog } from "@voyant-travel/types/api-keys"
import { describe, expect, it } from "vitest"
import {
  MCP_OAUTH_SCOPE_READ,
  MCP_OAUTH_SCOPE_WRITE,
  mcpOAuthProviderConfig,
  mcpProtectedResourceMetadata,
  parseOAuthClientIdClaim,
  parseOAuthScopeClaim,
  resolveMcpGrantScopes,
  withPublicApiEndpoints,
} from "../../src/mcp-oauth.js"

const catalog: AccessCatalog = {
  presets: [],
  resources: [
    {
      id: "bookings",
      unitId: "@voyant-travel/bookings",
      resource: "bookings",
      label: "Bookings",
      description: "",
      wildcard: "allow",
      remoteSafe: true,
      actions: [
        { action: "read", label: "", description: "" },
        { action: "write", label: "", description: "" },
      ],
    },
    {
      id: "settings",
      unitId: "@voyant-travel/operator-settings",
      resource: "settings",
      label: "Settings",
      description: "",
      wildcard: "allow",
      actions: [
        // Not remote-safe: withheld even from a full-access operator.
        { action: "read", label: "", description: "" },
        { action: "delete", label: "", description: "", sensitive: true, remoteSafe: true },
      ],
    },
  ],
}

const fullAccess = ["*"]

describe("resolveMcpGrantScopes", () => {
  it("gives a read-only connector only remote-safe read actions", () => {
    expect(
      resolveMcpGrantScopes({
        staffScopes: fullAccess,
        grantedOAuthScopes: [MCP_OAUTH_SCOPE_READ],
        accessCatalog: catalog,
      }),
    ).toEqual(["bookings:read"])
  })

  it("adds mutations only when the grant includes mcp:write", () => {
    expect(
      resolveMcpGrantScopes({
        staffScopes: fullAccess,
        grantedOAuthScopes: [MCP_OAUTH_SCOPE_READ, MCP_OAUTH_SCOPE_WRITE],
        accessCatalog: catalog,
      }),
    ).toEqual(["bookings:read", "bookings:write"])
  })

  it("never exceeds the approving staff member's own permissions", () => {
    expect(
      resolveMcpGrantScopes({
        staffScopes: ["bookings:read"],
        grantedOAuthScopes: [MCP_OAUTH_SCOPE_READ, MCP_OAUTH_SCOPE_WRITE],
        accessCatalog: catalog,
      }),
    ).toEqual(["bookings:read"])
  })

  it("withholds sensitive and non-remote-safe actions from a full-access operator", () => {
    const resolved = resolveMcpGrantScopes({
      staffScopes: fullAccess,
      grantedOAuthScopes: [MCP_OAUTH_SCOPE_READ, MCP_OAUTH_SCOPE_WRITE],
      accessCatalog: catalog,
    })

    expect(resolved).not.toContain("settings:delete")
    expect(resolved).not.toContain("settings:read")
  })

  it("returns nothing when the token carries no MCP scope", () => {
    expect(
      resolveMcpGrantScopes({
        staffScopes: fullAccess,
        grantedOAuthScopes: ["offline_access"],
        accessCatalog: catalog,
      }),
    ).toEqual([])
  })

  it("returns nothing when the deployment has no access catalog", () => {
    expect(
      resolveMcpGrantScopes({
        staffScopes: fullAccess,
        grantedOAuthScopes: [MCP_OAUTH_SCOPE_READ],
        accessCatalog: undefined,
      }),
    ).toEqual([])
  })
})

describe("parseOAuthScopeClaim", () => {
  it("splits the space-delimited form", () => {
    expect(parseOAuthScopeClaim("mcp:read mcp:write offline_access")).toEqual([
      "mcp:read",
      "mcp:write",
      "offline_access",
    ])
  })

  it("accepts the array form", () => {
    expect(parseOAuthScopeClaim(["mcp:read"])).toEqual(["mcp:read"])
  })

  it("degrades a malformed claim to no scopes rather than throwing", () => {
    expect(parseOAuthScopeClaim(undefined)).toEqual([])
    expect(parseOAuthScopeClaim(42)).toEqual([])
    expect(parseOAuthScopeClaim([1, "mcp:read"])).toEqual(["mcp:read"])
  })
})

describe("parseOAuthClientIdClaim", () => {
  it("reads the azp claim carried by signed JWT access tokens", () => {
    expect(parseOAuthClientIdClaim({ azp: "hosted-client" })).toBe("hosted-client")
  })

  it("keeps compatibility with introspection's client_id shape", () => {
    expect(parseOAuthClientIdClaim({ client_id: "introspected-client" })).toBe(
      "introspected-client",
    )
  })

  it("fails closed when two client identifiers disagree", () => {
    expect(parseOAuthClientIdClaim({ azp: "signed-client", client_id: "other-client" })).toBe("")
  })
})

describe("mcpProtectedResourceMetadata", () => {
  it("points clients at the authorization server for the MCP resource", () => {
    expect(
      mcpProtectedResourceMetadata({
        resource: "https://ops.example.com/api/v1/admin/mcp",
        authorizationServer: "https://ops.example.com/api/auth/admin",
        resourceName: "Voyant",
      }),
    ).toEqual({
      resource: "https://ops.example.com/api/v1/admin/mcp",
      authorization_servers: ["https://ops.example.com/api/auth/admin"],
      scopes_supported: ["mcp:read", "mcp:write"],
      bearer_methods_supported: ["header"],
      resource_name: "Voyant",
    })
  })
})

describe("withPublicApiEndpoints", () => {
  const input = {
    authBaseUrl: "https://ops.example.com",
    publicApiBaseUrl: "https://ops.example.com/api",
  }

  it("prefixes every callable endpoint with the public API base", () => {
    expect(
      withPublicApiEndpoints(
        {
          issuer: "https://ops.example.com",
          authorization_endpoint: "https://ops.example.com/auth/admin/oauth2/authorize",
          token_endpoint: "https://ops.example.com/auth/admin/oauth2/token",
          registration_endpoint: "https://ops.example.com/auth/admin/oauth2/register",
          jwks_uri: "https://ops.example.com/auth/admin/jwks",
        },
        input,
      ),
    ).toEqual({
      issuer: "https://ops.example.com",
      authorization_endpoint: "https://ops.example.com/api/auth/admin/oauth2/authorize",
      token_endpoint: "https://ops.example.com/api/auth/admin/oauth2/token",
      registration_endpoint: "https://ops.example.com/api/auth/admin/oauth2/register",
      jwks_uri: "https://ops.example.com/api/auth/admin/jwks",
    })
  })

  it("leaves the issuer alone so it still matches the discovery URL", () => {
    const result = withPublicApiEndpoints({ issuer: "https://ops.example.com" }, input)

    expect(result.issuer).toBe("https://ops.example.com")
  })

  it("preserves non-URL metadata such as supported scopes and methods", () => {
    const result = withPublicApiEndpoints(
      { scopes_supported: ["mcp:read"], code_challenge_methods_supported: ["S256"] },
      input,
    )

    expect(result).toEqual({
      scopes_supported: ["mcp:read"],
      code_challenge_methods_supported: ["S256"],
    })
  })

  it("is a no-op when the deployment serves the API at the origin root", () => {
    const metadata = { token_endpoint: "https://ops.example.com/auth/admin/oauth2/token" }

    expect(
      withPublicApiEndpoints(metadata, {
        authBaseUrl: "https://ops.example.com",
        publicApiBaseUrl: "https://ops.example.com",
      }),
    ).toEqual(metadata)
  })

  it("ignores endpoints already pointing somewhere else entirely", () => {
    const metadata = { jwks_uri: "https://cloud.example.com/.well-known/jwks.json" }

    expect(withPublicApiEndpoints(metadata, input)).toEqual(metadata)
  })
})

describe("mcpOAuthProviderConfig", () => {
  const config = mcpOAuthProviderConfig({ resource: "https://ops.example.com/api/v1/admin/mcp" })

  it("allows unauthenticated dynamic registration so chat clients can self-register", () => {
    expect(config.allowDynamicClientRegistration).toBe(true)
    expect(config.allowUnauthenticatedClientRegistration).toBe(true)
  })

  it("defaults scope-less hosted-client registrations to all authorization scopes", () => {
    expect(config.clientRegistrationDefaultScopes).toEqual([
      MCP_OAUTH_SCOPE_READ,
      "mcp:write",
      "offline_access",
    ])
  })

  it("hashes tokens and client secrets at rest", () => {
    expect(config.storeTokens).toBe("hashed")
    expect(config.storeClientSecret).toBe("hashed")
  })

  it("binds tokens to the MCP resource as the audience", () => {
    expect(config.validAudiences).toEqual(["https://ops.example.com/api/v1/admin/mcp"])
  })
})
