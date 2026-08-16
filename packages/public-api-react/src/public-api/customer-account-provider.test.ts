import { describe, expect, it } from "vitest"

import {
  createCustomerAccountFetcher,
  rewriteCustomerAccountAuthUrl,
} from "./customer-account-provider.js"

describe("rewriteCustomerAccountAuthUrl", () => {
  it("routes customer auth UI calls through the customer auth facade", () => {
    expect(rewriteCustomerAccountAuthUrl("https://example.test/api/auth/sign-in/email")).toBe(
      "https://example.test/api/auth/customer/sign-in/email",
    )
    expect(rewriteCustomerAccountAuthUrl("https://example.test/api/auth/sign-up/email")).toBe(
      "https://example.test/api/auth/customer/sign-up/email",
    )
  })

  it("keeps auth status calls out of the admin provisioning endpoint", () => {
    expect(rewriteCustomerAccountAuthUrl("https://example.test/api/auth/status")).toBe(
      "https://example.test/api/auth/customer/status",
    )
  })

  it("leaves public API calls unchanged", () => {
    expect(
      rewriteCustomerAccountAuthUrl("https://example.test/api/v1/public/customer-portal/me"),
    ).toBe("https://example.test/api/v1/public/customer-portal/me")
  })

  it("does not double-prefix customer auth calls", () => {
    expect(
      rewriteCustomerAccountAuthUrl("https://example.test/api/auth/customer/sign-in/email"),
    ).toBe("https://example.test/api/auth/customer/sign-in/email")
  })

  it("uses the explicit storefront API base and leaves admin auth URLs untouched", async () => {
    const calls: string[] = []
    const fetcher = createCustomerAccountFetcher(async (url) => {
      calls.push(url)
      return new Response(null, { status: 204 })
    }, "https://storefront.example/api")

    await fetcher("https://storefront.example/api/auth/status")
    await fetcher("https://admin.example/api/auth/status")

    expect(calls).toEqual([
      "https://storefront.example/api/auth/customer/status",
      "https://admin.example/api/auth/status",
    ])
  })
})
