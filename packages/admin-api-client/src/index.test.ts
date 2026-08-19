import { PUBLIC_API_KEY_PREFIXES } from "@voyant-travel/graph-contracts"
import { describe, expect, it } from "vitest"

import { AdminApiClientCredentialError, createAdminApiClient } from "./index.js"

/**
 * The Admin API is not reachable with a browser-resident credential, and the
 * useful moment to say so is at wiring time — a 401 in production tells you a
 * publishable key was shipped somewhere it can be read, long after the fact.
 *
 * The prefixes come from `@voyant-travel/graph-contracts`, not from literals here: a
 * copy of that table drifting from the first is an auth bypass, and a test that
 * hard-coded `vsk_` would keep passing while the real table moved.
 */
const SECRET = `${PUBLIC_API_KEY_PREFIXES.secret}test000000`
const PUBLISHABLE = `${PUBLIC_API_KEY_PREFIXES.publishable}test000000`

type Paths = Record<string, unknown>
const options = { baseUrl: "https://example.invalid" }

describe("createAdminApiClient", () => {
  it("constructs with a secret key", () => {
    expect(() => createAdminApiClient<Paths>({ ...options, secretKey: SECRET })).not.toThrow()
  })

  it("refuses a publishable key at construction, not on the first request", () => {
    expect(() => createAdminApiClient<Paths>({ ...options, secretKey: PUBLISHABLE })).toThrow(
      AdminApiClientCredentialError,
    )
    // Naming the kind matters: "invalid key" sends someone hunting for a typo.
    expect(() => createAdminApiClient<Paths>({ ...options, secretKey: PUBLISHABLE })).toThrow(
      /publishable/,
    )
  })

  it.each([
    ["empty", ""],
    ["an unrecognised prefix", "voy_deployment_key"],
    // Deliberately not a realistic JWT. The assertion is only that a token
    // without a Voyant prefix is refused, so the shape adds narrative rather
    // than coverage — and a JWT-shaped literal trips gitleaks' generic-api-key
    // rule, which is the correct behaviour for a repository with no
    // `.gitleaks.toml`. Keep fixtures here obviously inert.
    ["a bearer token from some other issuer", "not-a-voyant-key.issued-elsewhere"],
  ])("refuses %s", (_label, token) => {
    expect(() => createAdminApiClient<Paths>({ ...options, secretKey: token })).toThrow(
      AdminApiClientCredentialError,
    )
  })

  it("sends the credential on the header the Admin API reads", async () => {
    let seen: Headers | undefined
    const client = createAdminApiClient<{ "/v1/admin/ping": { get: never } }>({
      ...options,
      secretKey: SECRET,
      fetch: async (request: Request) => {
        seen = request.headers
        return new Response("{}", { status: 200, headers: { "content-type": "application/json" } })
      },
    })
    // biome-ignore lint/suspicious/noExplicitAny: the probe path is not a real operation
    await (client as any).GET("/v1/admin/ping")
    expect(seen?.get("x-api-key")).toBe(SECRET)
  })

  it("does not let a PER-CALL header replace the credential", async () => {
    // The bypass the constructor check alone did not close: openapi-fetch merges
    // per-call headers after the client defaults, so this replaced the validated
    // secret with whatever the call site passed.
    let seen: Headers | undefined
    const client = createAdminApiClient<{ "/v1/admin/ping": { get: never } }>({
      ...options,
      secretKey: SECRET,
      fetch: async (request: Request) => {
        seen = request.headers
        return new Response("{}", { status: 200, headers: { "content-type": "application/json" } })
      },
    })
    // biome-ignore lint/suspicious/noExplicitAny: the probe path is not a real operation
    await (client as any).GET("/v1/admin/ping", { headers: { "x-api-key": PUBLISHABLE } })
    expect(seen?.get("x-api-key")).toBe(SECRET)
  })

  it("does not let a constructor header override the credential", async () => {
    let seen: Headers | undefined
    const client = createAdminApiClient<{ "/v1/admin/ping": { get: never } }>({
      ...options,
      secretKey: SECRET,
      headers: { "x-api-key": PUBLISHABLE },
      fetch: async (request: Request) => {
        seen = request.headers
        return new Response("{}", { status: 200, headers: { "content-type": "application/json" } })
      },
    })
    // biome-ignore lint/suspicious/noExplicitAny: the probe path is not a real operation
    await (client as any).GET("/v1/admin/ping")
    expect(seen?.get("x-api-key")).toBe(SECRET)
  })
})
