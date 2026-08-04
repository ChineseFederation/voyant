import { describe, expect, it, vi } from "vitest"

import { createAuthBasePathFetcher, type VoyantFetcher } from "./client.js"

describe("createAuthBasePathFetcher", () => {
  it("routes only auth calls under the configured API base URL to the selected realm", async () => {
    const fetcher = vi.fn(async () => new Response(null, { status: 204 }))
    const customerFetcher = createAuthBasePathFetcher(fetcher, {
      baseUrl: "https://storefront.example/api/",
      authBasePath: "/auth/customer/",
    })

    await customerFetcher("https://storefront.example/api/auth/sign-in/email", { method: "POST" })
    await customerFetcher("https://storefront.example/api/auth/status")
    await customerFetcher("https://storefront.example/api/v1/public/products")
    await customerFetcher("https://admin.example/api/auth/status")

    expect(fetcher).toHaveBeenNthCalledWith(
      1,
      "https://storefront.example/api/auth/customer/sign-in/email",
      { method: "POST" },
    )
    expect(fetcher).toHaveBeenNthCalledWith(
      2,
      "https://storefront.example/api/auth/customer/status",
      undefined,
    )
    expect(fetcher).toHaveBeenNthCalledWith(
      3,
      "https://storefront.example/api/v1/public/products",
      undefined,
    )
    expect(fetcher).toHaveBeenNthCalledWith(4, "https://admin.example/api/auth/status", undefined)
  })

  it("leaves shared deployment-owned auth paths on the default prefix", async () => {
    // Typed parameters so `mock.calls[n][0]` is the requested URL rather than an
    // element of an empty tuple.
    const fetcher = vi.fn<VoyantFetcher>(async () => new Response(null, { status: 204 }))
    const adminFetcher = createAuthBasePathFetcher(fetcher, {
      baseUrl: "https://operator.example/api",
      authBasePath: "/auth/admin",
      sharedPaths: ["/me", "/status", "/api-tokens", "/organization/list-members"],
    })

    const calls = [
      // Shared: the deployment serves these itself, off the realm prefix.
      ["https://operator.example/api/auth/status", "https://operator.example/api/auth/status"],
      ["https://operator.example/api/auth/me", "https://operator.example/api/auth/me"],
      [
        "https://operator.example/api/auth/api-tokens?limit=25",
        "https://operator.example/api/auth/api-tokens?limit=25",
      ],
      [
        "https://operator.example/api/auth/api-tokens/key_1/rotate",
        "https://operator.example/api/auth/api-tokens/key_1/rotate",
      ],
      [
        "https://operator.example/api/auth/organization/list-members",
        "https://operator.example/api/auth/organization/list-members",
      ],
      // Realm-scoped: Better Auth handles these under /auth/admin.
      [
        "https://operator.example/api/auth/sign-in/email",
        "https://operator.example/api/auth/admin/sign-in/email",
      ],
      // A sibling of a shared path is not itself shared.
      [
        "https://operator.example/api/auth/organization/invite-member",
        "https://operator.example/api/auth/admin/organization/invite-member",
      ],
      // A shared path is matched whole, not as a string prefix.
      [
        "https://operator.example/api/auth/status-report",
        "https://operator.example/api/auth/admin/status-report",
      ],
    ] as const

    for (const [requested] of calls) await adminFetcher(requested)

    expect(fetcher.mock.calls.map((call) => call[0])).toEqual(calls.map(([, target]) => target))
  })
})
