import { describe, expect, it } from "vitest"

import { resolvePublicCheckoutBaseUrl } from "../../src/runtime.js"

describe("resolvePublicCheckoutBaseUrl", () => {
  it("uses only the explicitly configured customer origin", () => {
    expect(
      resolvePublicCheckoutBaseUrl({
        PUBLIC_CHECKOUT_BASE_URL: " https://booking.example.com ",
        DASH_BASE_URL: "https://admin.example.com",
        APP_URL: "https://admin.example.com/api",
      }),
    ).toBe("https://booking.example.com")
  })

  it("does not fall back to an admin origin", () => {
    expect(
      resolvePublicCheckoutBaseUrl({
        DASH_BASE_URL: "https://admin.example.com",
        APP_URL: "https://admin.example.com/api",
      }),
    ).toBeNull()
  })
})
