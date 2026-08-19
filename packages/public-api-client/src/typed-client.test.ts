import { PUBLIC_API_KEY_HEADER, PUBLIC_API_KEY_PREFIXES } from "@voyant-travel/graph-contracts"
import { describe, expect, it } from "vitest"

import { createPublicApiClient, PublicApiClientCredentialError } from "./typed-client.js"

const PUBLISHABLE = `${PUBLIC_API_KEY_PREFIXES.publishable}test000000`
const SECRET = `${PUBLIC_API_KEY_PREFIXES.secret}test000000`
const OTHER_PUBLISHABLE = `${PUBLIC_API_KEY_PREFIXES.publishable}other000000`

const options = { baseUrl: "https://example.invalid" }

// This function is intentionally not called. The package typecheck proves that
// credential posture is part of the client Interface rather than only a
// runtime 403.
const assertPublishableTypeSurface = () => {
  const browserClient = createPublicApiClient({ ...options, publishableKey: PUBLISHABLE })
  const managedClient = createPublicApiClient({ ...options, managed: true })
  // @ts-expect-error -- /leads is secret-only until an intake guard changes generated posture.
  void browserClient.POST("/v1/public/leads")
  // @ts-expect-error -- managed transports cannot widen the publishable operation posture.
  void managedClient.POST("/v1/public/leads")
}
void assertPublishableTypeSurface

describe("createPublicApiClient", () => {
  it("constructs a client for each credential class", () => {
    expect(() => createPublicApiClient({ ...options, publishableKey: PUBLISHABLE })).not.toThrow()
    expect(() => createPublicApiClient({ ...options, secretKey: SECRET })).not.toThrow()
    expect(() => createPublicApiClient({ ...options, managed: true })).not.toThrow()
  })

  it("never forwards an API key in managed mode", async () => {
    let seen: Request | undefined
    const client = createPublicApiClient({
      ...options,
      managed: true,
      headers: { [PUBLIC_API_KEY_HEADER]: OTHER_PUBLISHABLE },
      fetch: async (request: Request) => {
        seen = request
        return Response.json({ data: {} })
      },
    })

    await client.GET("/v1/public/settings", {
      headers: { [PUBLIC_API_KEY_HEADER]: PUBLISHABLE },
    })

    expect(seen?.headers.get(PUBLIC_API_KEY_HEADER)).toBeNull()
  })

  it.each([
    ["an empty publishable key", { publishableKey: "" }],
    ["an empty secret key", { secretKey: "" }],
    ["an unrecognised key", { publishableKey: "not-a-voyant-key" }],
    ["a secret key in the browser option", { publishableKey: SECRET }],
    ["a publishable key in the server option", { secretKey: PUBLISHABLE }],
  ])("rejects %s at construction", (_label, credential) => {
    expect(() => createPublicApiClient({ ...options, ...credential } as never)).toThrow(
      PublicApiClientCredentialError,
    )
  })

  it("uses the configured base URL and credential header", async () => {
    let seen: Request | undefined
    const client = createPublicApiClient({
      ...options,
      publishableKey: PUBLISHABLE,
      fetch: async (request: Request) => {
        seen = request
        return Response.json({ data: {} })
      },
    })

    await client.GET("/v1/public/settings")

    expect(seen?.url).toBe("https://example.invalid/v1/public/settings")
    expect(seen?.headers.get(PUBLIC_API_KEY_HEADER)).toBe(PUBLISHABLE)
  })

  it("does not let constructor or per-call headers replace the credential", async () => {
    let seen: Request | undefined
    const client = createPublicApiClient({
      ...options,
      publishableKey: PUBLISHABLE,
      headers: { [PUBLIC_API_KEY_HEADER]: OTHER_PUBLISHABLE },
      fetch: async (request: Request) => {
        seen = request
        return Response.json({ data: {} })
      },
    })

    await client.GET("/v1/public/settings", {
      headers: { [PUBLIC_API_KEY_HEADER]: OTHER_PUBLISHABLE },
    })

    expect(seen?.headers.get(PUBLIC_API_KEY_HEADER)).toBe(PUBLISHABLE)
  })
})
