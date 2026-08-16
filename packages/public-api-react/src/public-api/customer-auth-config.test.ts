import { describe, expect, it, vi } from "vitest"

import { fetchCustomerAuthConfig } from "./customer-auth-config.js"

describe("fetchCustomerAuthConfig", () => {
  it("loads and validates the public customer auth method contract", async () => {
    const fetcher = vi.fn(async () =>
      Response.json({
        methods: {
          emailCode: true,
          emailPassword: false,
          google: true,
          facebook: false,
          apple: true,
        },
      }),
    )

    await expect(
      fetchCustomerAuthConfig("https://storefront.example/api/", fetcher),
    ).resolves.toEqual({
      methods: {
        emailCode: true,
        emailPassword: false,
        google: true,
        facebook: false,
        apple: true,
      },
    })
    expect(fetcher).toHaveBeenCalledWith("https://storefront.example/api/auth/customer/config", {
      method: "GET",
    })
  })

  it("rejects incomplete method configuration instead of enabling an unintended method", async () => {
    const fetcher = vi.fn(async () => Response.json({ methods: { emailCode: true } }))

    await expect(fetchCustomerAuthConfig("/api", fetcher)).rejects.toThrow()
  })
})
