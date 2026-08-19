import { PUBLIC_API_KEY_HEADER, PUBLIC_API_KEY_PREFIXES } from "@voyant-travel/graph-contracts"
import { describe, expect, it, vi } from "vitest"

import {
  createManagedPublicApiFetch,
  ManagedPublicApiFetchConfigurationError,
} from "./managed-fetch.js"
import { createPublicApiClient } from "./typed-client.js"

const PUBLISHABLE = `${PUBLIC_API_KEY_PREFIXES.publishable}test000000`

describe("createManagedPublicApiFetch", () => {
  it.each([
    "not-a-url",
    " https://site.example ",
    "ftp://site.example",
    "https://user@site.example",
    "https://site.example/proxy",
    "https://site.example/?environment=preview",
    "https://site.example/#preview",
  ])("rejects a non-origin proxy target: %s", (proxyOrigin) => {
    expect(() => createManagedPublicApiFetch({ proxyOrigin, fetch: vi.fn() })).toThrow(
      ManagedPublicApiFetchConfigurationError,
    )
  })

  it.each([
    "https://api.example.invalid/v1/admin/settings",
    "https://api.example.invalid/v1/publicity/settings",
  ])("refuses to proxy a non-Public-API path: %s", async (url) => {
    const dispatch = vi.fn<typeof fetch>()
    const managedFetch = createManagedPublicApiFetch({
      proxyOrigin: "https://site.example",
      fetch: dispatch,
    })

    await expect(managedFetch(new Request(url))).rejects.toThrow(
      "Managed Public API Fetch only accepts /v1/public requests.",
    )
    expect(dispatch).not.toHaveBeenCalled()
  })

  it("rewrites only the origin and preserves the complete Fetch request", async () => {
    let seen: Request | undefined
    const dispatch = vi.fn<typeof fetch>(async (request) => {
      seen = new Request(request)
      return new Response("proxied", {
        headers: { "content-type": "text/plain", "x-proxy": "managed" },
        status: 202,
      })
    })
    const managedFetch = createManagedPublicApiFetch({
      proxyOrigin: new URL("http://localhost:4321"),
      fetch: dispatch,
    })
    const abort = new AbortController()

    const response = await managedFetch(
      new Request("https://api.example.invalid/v1/public/search?locale=ro-RO&tag=city", {
        body: JSON.stringify({ query: "Bucharest" }),
        headers: {
          "content-type": "application/json",
          "x-request-id": "req_test",
        },
        method: "POST",
        signal: abort.signal,
      }),
    )

    expect(dispatch).toHaveBeenCalledOnce()
    expect(seen?.url).toBe("http://localhost:4321/v1/public/search?locale=ro-RO&tag=city")
    expect(seen?.method).toBe("POST")
    expect(seen?.headers.get("content-type")).toBe("application/json")
    expect(seen?.headers.get("x-request-id")).toBe("req_test")
    expect(await seen?.json()).toEqual({ query: "Bucharest" })
    expect(response.status).toBe(202)
    expect(response.headers.get("x-proxy")).toBe("managed")
    expect(await response.text()).toBe("proxied")

    abort.abort()
    expect(seen?.signal.aborted).toBe(true)
  })

  it("composes with the generated client and keeps its pinned credential", async () => {
    let seen: Request | undefined
    const managedFetch = createManagedPublicApiFetch({
      proxyOrigin: "https://site.example",
      fetch: async (request) => {
        seen = request
        return Response.json({ data: {} })
      },
    })
    const client = createPublicApiClient({
      baseUrl: "https://api.example.invalid",
      fetch: managedFetch,
      publishableKey: PUBLISHABLE,
    })

    await client.GET("/v1/public/settings")

    expect(seen?.url).toBe("https://site.example/v1/public/settings")
    expect(seen?.headers.get(PUBLIC_API_KEY_HEADER)).toBe(PUBLISHABLE)
  })
})
