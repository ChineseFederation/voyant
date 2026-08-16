import { describe, expect, it } from "vitest"

import {
  classifyPublicApiApiKey,
  generatePublicApiApiKey,
  hashPublicApiApiKey,
} from "../../src/public-api-key-tokens.js"

describe("storefront access keys", () => {
  it("mints publishable keys with the vpk_ prefix and a stored hash", async () => {
    const key = await generatePublicApiApiKey("publishable")
    expect(key.kind).toBe("publishable")
    expect(key.token.startsWith("vpk_")).toBe(true)
    expect(key.tokenHash).toMatch(/^[0-9a-f]{64}$/)
    expect(key.tokenHash).toBe(await hashPublicApiApiKey(key.token))
    expect(key.tokenPreview).toBe(key.token.slice(0, "vpk_".length + 6))
    expect(key.token.startsWith(key.tokenPreview)).toBe(true)
  })

  it("mints secret keys with the vsk_ prefix", async () => {
    const key = await generatePublicApiApiKey("secret")
    expect(key.kind).toBe("secret")
    expect(key.token.startsWith("vsk_")).toBe(true)
  })

  it("never repeats a token or its hash", async () => {
    const [a, b] = await Promise.all([
      generatePublicApiApiKey("publishable"),
      generatePublicApiApiKey("publishable"),
    ])
    expect(a.token).not.toBe(b.token)
    expect(a.tokenHash).not.toBe(b.tokenHash)
  })

  it("classifies tokens by prefix and rejects foreign tokens", () => {
    expect(classifyPublicApiApiKey("vpk_abc")).toBe("publishable")
    expect(classifyPublicApiApiKey("vsk_abc")).toBe("secret")
    expect(classifyPublicApiApiKey("sk_live_abc")).toBeNull()
    expect(classifyPublicApiApiKey("")).toBeNull()
  })

  it("hashes deterministically", async () => {
    expect(await hashPublicApiApiKey("vpk_fixed-token")).toBe(
      await hashPublicApiApiKey("vpk_fixed-token"),
    )
    expect(await hashPublicApiApiKey("vpk_a")).not.toBe(await hashPublicApiApiKey("vpk_b"))
  })
})
