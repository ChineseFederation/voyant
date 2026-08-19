/**
 * End-to-end exercise of the MCP connector handshake against a real Postgres.
 *
 * This is the flow a chat assistant performs when an operator pastes the MCP
 * URL into it, and the parts most likely to break are exactly the ones unit
 * tests cannot see: whether the plugin actually mounts, whether an
 * unauthenticated client can register itself, and whether the issued token's
 * claims line up with what the resource server verifies.
 *
 * Requires the local test database (see docs: `voyant-test-db` on 5436). The
 * suite skips itself when that database is unreachable so it never fails a
 * machine that simply is not running Docker.
 */

import { createHash } from "node:crypto"
import { drizzle } from "drizzle-orm/postgres-js"
import { decodeJwt } from "jose"
import postgres from "postgres"
import { afterAll, describe, expect, it } from "vitest"
import { parseOAuthScopeClaim, withPublicApiEndpoints } from "../../src/mcp-oauth.js"
import { createBetterAuth } from "../../src/server.js"

const CONNECTION = process.env.MCP_OAUTH_TEST_DATABASE_URL ?? ""
/** Throwaway credential for the fixture operator; never leaves this suite. */
const TEST_PASSWORD = "test-operator-password"
const BASE_URL = "http://localhost:3300"
const RESOURCE = `${BASE_URL}/api/v1/admin/mcp`

// Set up at module scope, not in `beforeAll`: vitest picks `it` vs `it.skip`
// while collecting the suite, which happens before any hook has run.
const setup = await (async () => {
  if (!CONNECTION) return null
  try {
    const sql = postgres(CONNECTION, { max: 1, onnotice: () => {} })
    await sql`select 1`
    // Start from a clean slate: the operator signup block refuses a second
    // account once any user exists, which would make this suite pass only on a
    // fresh database.
    await sql`truncate "user", session, account, oauth_client, oauth_consent, oauth_access_token, oauth_refresh_token, jwks cascade`
    const { oauthProvider } = await import("@better-auth/oauth-provider")
    const { jwt } = await import("better-auth/plugins")
    const { mcpOAuthProviderConfig } = await import("../../src/mcp-oauth.js")
    const auth = createBetterAuth({
      db: drizzle(sql) as never,
      secret: "x".repeat(32),
      baseURL: BASE_URL,
      basePath: "/auth/admin",
      plugins: [jwt(), oauthProvider(mcpOAuthProviderConfig({ resource: RESOURCE }))] as never,
    })
    return { sql, auth }
  } catch (error) {
    console.warn(`[mcp-oauth-flow] skipping: ${(error as Error).message}`)
    return null
  }
})()

afterAll(async () => {
  await setup?.sql.end({ timeout: 5 })
})

const maybe = () => (setup ? it : it.skip)

async function call(path: string, init?: RequestInit): Promise<Response> {
  if (!setup) throw new Error("auth not initialized")
  return setup.auth.handler(new Request(`${BASE_URL}${path}`, init))
}

describe("MCP connector OAuth handshake", () => {
  maybe()("publishes authorization-server metadata with the endpoints MCP needs", async () => {
    const response = await call("/auth/admin/.well-known/oauth-authorization-server")
    expect(response.status).toBe(200)

    const metadata = (await response.json()) as Record<string, unknown>
    // Without dynamic registration a chat client cannot connect at all: it has
    // no client_id to offer and the operator has nowhere to obtain one.
    expect(metadata.registration_endpoint).toBeTruthy()
    expect(metadata.code_challenge_methods_supported).toContain("S256")
    expect(metadata.grant_types_supported).toEqual(
      expect.arrayContaining(["authorization_code", "refresh_token"]),
    )
    expect(metadata.scopes_supported).toEqual(expect.arrayContaining(["mcp:read", "mcp:write"]))
  })

  maybe()("rewrites the real published endpoints onto the public API base", async () => {
    const response = await call("/auth/admin/.well-known/oauth-authorization-server")
    const raw = (await response.json()) as Record<string, unknown>

    // Better Auth advertises endpoints under its own baseURL, which omits the
    // API prefix the Hono app strips. Assert against the genuine document so
    // this catches an upstream change in how those URLs are built.
    expect(raw.authorization_endpoint).toBe(`${BASE_URL}/auth/admin/oauth2/authorize`)

    const served = withPublicApiEndpoints(raw, {
      authBaseUrl: BASE_URL,
      publicApiBaseUrl: `${BASE_URL}/api`,
    })
    expect(served.authorization_endpoint).toBe(`${BASE_URL}/api/auth/admin/oauth2/authorize`)
    expect(served.token_endpoint).toBe(`${BASE_URL}/api/auth/admin/oauth2/token`)
    expect(served.registration_endpoint).toBe(`${BASE_URL}/api/auth/admin/oauth2/register`)
    // The issuer is Better Auth's baseURL PLUS its basePath — not the bare
    // origin. Token verification must use this exact value, and the rewrite
    // must leave it alone.
    expect(raw.issuer).toBe(`${BASE_URL}/auth/admin`)
    expect(served.issuer).toBe(`${BASE_URL}/auth/admin`)
  })

  maybe()("signs access tokens with the issuer the resource server verifies", async () => {
    const response = await call("/auth/admin/.well-known/oauth-authorization-server")
    const { issuer } = (await response.json()) as { issuer: string }

    // `resolveMcpAccessToken` passes `${getAuthBaseUrl(env)}/auth/admin` as the
    // expected issuer. If Better Auth ever derives it differently, every
    // connector token would silently fail to verify — so pin the shape here.
    expect(issuer.endsWith("/auth/admin")).toBe(true)
  })

  maybe()("lets an unauthenticated client register itself (RFC 7591)", async () => {
    const response = await call("/auth/admin/oauth2/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        client_name: "Claude",
        redirect_uris: ["https://claude.ai/api/mcp/auth_callback"],
        token_endpoint_auth_method: "none",
        grant_types: ["authorization_code", "refresh_token"],
        response_types: ["code"],
        scope: "mcp:read",
      }),
    })

    expect(response.status).toBeLessThan(300)
    const client = (await response.json()) as Record<string, unknown>
    expect(client.client_id).toEqual(expect.any(String))
    expect(client.redirect_uris).toEqual(["https://claude.ai/api/mcp/auth_callback"])
  })

  maybe()(
    "accepts advertised scopes after a hosted client registers without a scope field",
    async () => {
      const registration = await call("/auth/admin/oauth2/register", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          client_name: "Hosted Chat Client",
          redirect_uris: ["https://chatgpt.com/connector/oauth/callback"],
          token_endpoint_auth_method: "none",
          grant_types: ["authorization_code", "refresh_token"],
          response_types: ["code"],
        }),
      })
      expect(registration.status).toBeLessThan(300)
      const client = (await registration.json()) as { client_id: string }

      const authorize = await call(
        "/auth/admin/oauth2/authorize?" +
          new URLSearchParams({
            response_type: "code",
            client_id: client.client_id,
            redirect_uri: "https://chatgpt.com/connector/oauth/callback",
            scope: "mcp:read mcp:write offline_access",
            code_challenge: "a".repeat(43),
            code_challenge_method: "S256",
            resource: RESOURCE,
          }).toString(),
        { redirect: "manual" },
      )

      expect(await authorize.text()).not.toContain("invalid_scope")
      expect(authorize.status).not.toBe(400)
    },
  )

  maybe()(
    "completes authorize → consent → token and issues a token the resource server accepts",
    async () => {
      if (!setup) throw new Error("no setup")

      // 1. A staff member signs in (the operator who will approve the connector).
      const email = `mcp-${Date.now()}@example.com`
      const signUp = await call("/auth/admin/sign-up/email", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password: TEST_PASSWORD, name: "Operator" }),
      })
      expect(signUp.status).toBeLessThan(300)

      // This deployment requires email verification before a session is issued.
      // Verifying out-of-band keeps the test about the OAuth handshake rather
      // than about the OTP mail flow.
      await setup.sql`update "user" set email_verified = true where email = ${email}`
      const signIn = await call("/auth/admin/sign-in/email", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password: TEST_PASSWORD }),
      })
      expect(signIn.status).toBeLessThan(300)
      const cookie = (signIn.headers.getSetCookie?.() ?? [])
        .map((value) => value.split(";")[0])
        .join("; ")
      expect(cookie).not.toBe("")

      // 2. The assistant registers itself.
      const registration = await call("/auth/admin/oauth2/register", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          client_name: "Flow Client",
          redirect_uris: ["https://claude.ai/api/mcp/auth_callback"],
          token_endpoint_auth_method: "none",
          grant_types: ["authorization_code", "refresh_token"],
          response_types: ["code"],
          scope: "mcp:read mcp:write",
        }),
      })
      const { client_id } = (await registration.json()) as { client_id: string }

      // 3. Authorization request with PKCE, bound to the MCP resource.
      const verifier = "a".repeat(64)
      const challenge = createHash("sha256").update(verifier).digest("base64url")
      const authorizeUrl =
        `/auth/admin/oauth2/authorize?response_type=code&client_id=${client_id}` +
        `&redirect_uri=${encodeURIComponent("https://claude.ai/api/mcp/auth_callback")}` +
        `&scope=${encodeURIComponent("mcp:read mcp:write")}` +
        `&code_challenge=${challenge}&code_challenge_method=S256` +
        `&resource=${encodeURIComponent(RESOURCE)}&state=xyz`
      const authorize = await call(authorizeUrl, { headers: { cookie }, redirect: "manual" })

      // The operator is sent to the consent screen with a consent code.
      const consentLocation = authorize.headers.get("location") ?? ""
      expect(consentLocation).toContain("/mcp-consent")
      // There is no short "consent code": the server signs the whole query and
      // expects it back verbatim. The consent page posts exactly this.
      const oauthQuery = consentLocation.slice(consentLocation.indexOf("?") + 1)
      expect(oauthQuery).toContain("sig=")
      expect(new URLSearchParams(oauthQuery).get("client_id")).toBe(client_id)

      // 4. The operator approves — this is what the consent page posts.
      const consent = await call("/auth/admin/oauth2/consent", {
        method: "POST",
        headers: { "content-type": "application/json", cookie },
        body: JSON.stringify({ accept: true, oauth_query: oauthQuery }),
      })
      expect(consent.status).toBeLessThan(300)
      // Approving can answer with either `redirectURI` or `url` depending on
      // the branch taken; the consent page accepts both for the same reason.
      const consentBody = (await consent.json()) as { redirectURI?: string; url?: string }
      const redirectURI = consentBody.redirectURI ?? consentBody.url
      expect(redirectURI).toBeTruthy()
      const code = new URL(redirectURI ?? "").searchParams.get("code")
      expect(code).toBeTruthy()

      // 5. The assistant exchanges the code for a token.
      const token = await call("/auth/admin/oauth2/token", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          code: code ?? "",
          redirect_uri: "https://claude.ai/api/mcp/auth_callback",
          client_id,
          code_verifier: verifier,
          resource: RESOURCE,
        }).toString(),
      })
      expect(token.status).toBeLessThan(300)
      const grant = (await token.json()) as { access_token: string; scope?: string }
      expect(grant.access_token).toEqual(expect.any(String))

      // 6. The claims the resource server actually checks. This is the pairing
      //    that was never proven together: issuer AND audience on a real token.
      const claims = decodeJwt(grant.access_token)
      expect(claims.iss).toBe(`${BASE_URL}/auth/admin`)
      expect([claims.aud].flat()).toContain(RESOURCE)
      expect(claims.sub).toEqual(expect.any(String))
      expect(parseOAuthScopeClaim(claims.scope)).toEqual(
        expect.arrayContaining(["mcp:read", "mcp:write"]),
      )

      // 7. Revoking consent is what makes "Disconnect" immediate.
      const consents = await setup.sql`select id from oauth_consent where client_id = ${client_id}`
      expect(consents.length).toBeGreaterThan(0)
    },
  )

  maybe()("persists the registered client so consent can be checked later", async () => {
    if (!setup) throw new Error("no db")
    const rows =
      await setup.sql`select client_id, name from oauth_client where name = 'Claude' limit 1`
    expect(rows).toHaveLength(1)
  })
})
