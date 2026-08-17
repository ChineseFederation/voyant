/**
 * The handshake a hosted chat client actually performs, driven end to end.
 *
 * ChatGPT Web and Claude Web are given nothing but the MCP URL. Everything they
 * do afterwards is derived from documents this server publishes, which makes the
 * published metadata a contract rather than documentation: whatever
 * `scopes_supported` says, the client will ask for, and whatever dynamic
 * registration defaults to is what `authorize` will hold it to. Those two were
 * allowed to disagree — discovery advertised three scopes, registration stored
 * one — and every hosted client bounced off `invalid_scope` before a human ever
 * saw the consent screen ([#4793](https://github.com/voyant-travel/voyant/issues/4793)).
 *
 * Unlike `mcp-oauth-flow.test.ts`, this suite needs no database: it runs the
 * real Better Auth handler over the in-memory adapter, so the discovery →
 * registration → authorize → consent → token chain is exercised on every CI run
 * rather than only where Postgres happens to be reachable.
 */

import { createHash } from "node:crypto"
import { oauthProvider } from "@better-auth/oauth-provider"
import { betterAuth } from "better-auth"
import { memoryAdapter } from "better-auth/adapters/memory"
import { jwt } from "better-auth/plugins"
import { decodeJwt } from "jose"
import { beforeAll, describe, expect, it } from "vitest"
import {
  MCP_OAUTH_SCOPES,
  mcpOAuthProviderConfig,
  parseOAuthScopeClaim,
} from "../../src/mcp-oauth.js"

const BASE_URL = "http://localhost:3300"
const RESOURCE = `${BASE_URL}/api/v1/admin/mcp`
/** Throwaway credential for the fixture operator; never leaves this suite. */
const TEST_PASSWORD = "test-operator-password"

/**
 * The models the flow touches. The in-memory adapter clones this object per
 * transaction, so every table has to exist up front — a lazily created one
 * would not survive the clone.
 */
function emptyDatabase() {
  return {
    user: [],
    session: [],
    account: [],
    verification: [],
    jwks: [],
    oauthClient: [],
    oauthConsent: [],
    oauthAccessToken: [],
    rateLimit: [],
  }
}

const auth = betterAuth({
  appName: "Voyant",
  baseURL: BASE_URL,
  // The admin realm's mount point. The issuer, and therefore every signature the
  // resource server verifies, is derived from it.
  basePath: "/auth/admin",
  secret: "x".repeat(32),
  database: memoryAdapter(emptyDatabase()),
  emailAndPassword: { enabled: true },
  plugins: [jwt(), oauthProvider(mcpOAuthProviderConfig({ resource: RESOURCE }))],
})

function call(path: string, init?: RequestInit): Promise<Response> {
  return auth.handler(new Request(`${BASE_URL}${path}`, init))
}

/**
 * The two clients this has to work with, described the way they describe
 * themselves: a public client, PKCE only, no credential to present at the token
 * endpoint, and — the part that broke — no `scope` field during registration.
 */
const HOSTED_CLIENTS = [
  { name: "ChatGPT", redirectUri: "https://chatgpt.com/connector_platform_oauth_redirect" },
  { name: "Claude", redirectUri: "https://claude.ai/api/mcp/auth_callback" },
] as const

function registrationRequest(client: (typeof HOSTED_CLIENTS)[number], scope?: string) {
  return {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      client_name: client.name,
      redirect_uris: [client.redirectUri],
      token_endpoint_auth_method: "none",
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      ...(scope ? { scope } : {}),
    }),
  } satisfies RequestInit
}

function pkce(verifier: string) {
  return createHash("sha256").update(verifier).digest("base64url")
}

function authorizeUrl(input: {
  clientId: string
  redirectUri: string
  scope: string
  challenge: string
  state: string
}): string {
  const query = new URLSearchParams({
    response_type: "code",
    client_id: input.clientId,
    redirect_uri: input.redirectUri,
    scope: input.scope,
    code_challenge: input.challenge,
    code_challenge_method: "S256",
    resource: RESOURCE,
    state: input.state,
  })
  return `/auth/admin/oauth2/authorize?${query.toString()}`
}

/** The signed query the authorization server hands the consent page. */
function oauthQueryFrom(location: string): string {
  return location.slice(location.indexOf("?") + 1)
}

let operatorCookie = ""

beforeAll(async () => {
  const signUp = await call("/auth/admin/sign-up/email", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      email: "operator@example.com",
      password: TEST_PASSWORD,
      name: "Operator",
    }),
  })
  expect(signUp.status).toBeLessThan(300)
  operatorCookie = (signUp.headers.getSetCookie?.() ?? [])
    .map((value) => value.split(";")[0])
    .join("; ")
  expect(operatorCookie).not.toBe("")
})

describe("hosted MCP client handshake", () => {
  it("advertises the same scopes registration will accept", async () => {
    const response = await call("/auth/admin/.well-known/oauth-authorization-server")
    expect(response.status).toBe(200)
    const metadata = (await response.json()) as { scopes_supported?: string[] }

    expect(metadata.scopes_supported).toEqual([...MCP_OAUTH_SCOPES])
  })

  for (const client of HOSTED_CLIENTS) {
    it(`lets ${client.name} register without a scope and still ask for the advertised ones`, async () => {
      // 1. Discovery. Everything below is derived from this document alone.
      const discovery = await call("/auth/admin/.well-known/oauth-authorization-server")
      const { scopes_supported } = (await discovery.json()) as { scopes_supported: string[] }

      // 2. Dynamic registration, with no `scope` field — the hosted-client shape.
      const registration = await call("/auth/admin/oauth2/register", registrationRequest(client))
      expect(registration.status).toBeLessThan(300)
      const registered = (await registration.json()) as { client_id: string; scope: string }
      expect(registered.scope.split(" ")).toEqual(scopes_supported)

      // 3. Authorize, asking for exactly what discovery advertised. This is the
      //    step that used to redirect back with `invalid_scope`.
      const verifier = "a".repeat(64)
      const authorize = await call(
        authorizeUrl({
          clientId: registered.client_id,
          redirectUri: client.redirectUri,
          scope: scopes_supported.join(" "),
          challenge: pkce(verifier),
          state: "hosted-state",
        }),
        { headers: { cookie: operatorCookie }, redirect: "manual" },
      )
      const location = authorize.headers.get("location") ?? ""
      expect(location).not.toContain("error=")
      expect(location).toContain("/mcp-consent")

      // 4. The operator approves. This is the request the consent page posts.
      const oauthQuery = oauthQueryFrom(location)
      const consent = await call("/auth/admin/oauth2/consent", {
        method: "POST",
        headers: { "content-type": "application/json", cookie: operatorCookie },
        body: JSON.stringify({ accept: true, oauth_query: oauthQuery }),
      })
      expect(consent.status).toBeLessThan(300)
      const decision = (await consent.json()) as { redirectURI?: string; url?: string }
      const redirectURI = decision.redirectURI ?? decision.url ?? ""
      const handback = new URL(redirectURI)
      expect(handback.origin + handback.pathname).toBe(client.redirectUri)
      expect(handback.searchParams.get("state")).toBe("hosted-state")
      const code = handback.searchParams.get("code")
      expect(code).toBeTruthy()

      // 5. Code exchange. A public client presents only its PKCE verifier.
      const token = await call("/auth/admin/oauth2/token", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          code: code ?? "",
          redirect_uri: client.redirectUri,
          client_id: registered.client_id,
          code_verifier: verifier,
          resource: RESOURCE,
        }).toString(),
      })
      expect(token.status).toBeLessThan(300)
      const grant = (await token.json()) as {
        access_token: string
        refresh_token?: string
        scope?: string
      }

      // `offline_access` was granted, so the connector must come away with a
      // refresh token — without one it dies at the first token expiry and the
      // operator has to reconnect it by hand.
      expect(grant.refresh_token).toEqual(expect.any(String))

      const claims = decodeJwt(grant.access_token)
      expect(claims.iss).toBe(`${BASE_URL}/auth/admin`)
      expect([claims.aud].flat()).toContain(RESOURCE)
      expect(parseOAuthScopeClaim(claims.scope)).toEqual(scopes_supported)
    })
  }

  it("still holds a client to a scope set it asked to be restricted to", async () => {
    // Registering *with* a scope is an explicit narrowing, and it stays binding
    // — the coherence fix above must not turn every client into a full one.
    const registration = await call(
      "/auth/admin/oauth2/register",
      registrationRequest(HOSTED_CLIENTS[0], "mcp:read"),
    )
    const registered = (await registration.json()) as { client_id: string; scope: string }
    expect(registered.scope).toBe("mcp:read")

    const authorize = await call(
      authorizeUrl({
        clientId: registered.client_id,
        redirectUri: HOSTED_CLIENTS[0].redirectUri,
        scope: "mcp:read mcp:write",
        challenge: pkce("b".repeat(64)),
        state: "restricted-state",
      }),
      { headers: { cookie: operatorCookie }, redirect: "manual" },
    )

    const location = authorize.headers.get("location") ?? ""
    expect(location).toContain("error=invalid_scope")
    expect(location).toContain("mcp%3Awrite")
  })

  it("hands the consent page a signed query carrying repeated parameters", async () => {
    // The signature covers a `ba_param` entry per signed parameter, so the query
    // cannot survive being parsed into an object and re-serialized. The consent
    // page posts the raw string for exactly this reason.
    const registration = await call(
      "/auth/admin/oauth2/register",
      registrationRequest(HOSTED_CLIENTS[1]),
    )
    const registered = (await registration.json()) as { client_id: string }

    const authorize = await call(
      authorizeUrl({
        clientId: registered.client_id,
        redirectUri: HOSTED_CLIENTS[1].redirectUri,
        scope: MCP_OAUTH_SCOPES.join(" "),
        challenge: pkce("c".repeat(64)),
        state: "repeated-state",
      }),
      { headers: { cookie: operatorCookie }, redirect: "manual" },
    )

    const oauthQuery = oauthQueryFrom(authorize.headers.get("location") ?? "")
    const params = new URLSearchParams(oauthQuery)
    expect(params.get("sig")).toBeTruthy()
    expect(params.getAll("ba_param").length).toBeGreaterThan(1)

    // Round-tripping through an object collapses the repeats and invalidates
    // the signature — proving the verbatim requirement rather than asserting it.
    const collapsed = new URLSearchParams(Object.fromEntries(params)).toString()
    const rejected = await call("/auth/admin/oauth2/consent", {
      method: "POST",
      headers: { "content-type": "application/json", cookie: operatorCookie },
      body: JSON.stringify({ accept: true, oauth_query: collapsed }),
    })
    expect(rejected.status).toBeGreaterThanOrEqual(400)
  })
})
