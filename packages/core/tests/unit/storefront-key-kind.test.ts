import { describe, expect, it } from "vitest"

import {
  classifyStorefrontKeyToken,
  hashStorefrontKeyToken,
  STOREFRONT_KEY_HEADER,
  STOREFRONT_KEY_PREFIXES,
} from "../../src/storefront-key-kind.js"

/**
 * These live in `core` because two layers read them at different times — the
 * capability middleware classifies before authentication, the customer-auth
 * resolver classifies while resolving against the database — and a second copy
 * drifting from the first is an auth bypass (voyant#4625).
 */
describe("storefront key classification", () => {
  it("classifies each kind by its prefix", () => {
    expect(classifyStorefrontKeyToken("vpk_abc")).toBe("publishable")
    expect(classifyStorefrontKeyToken("vsk_abc")).toBe("secret")
  })

  it("returns null for anything that is not a storefront key", () => {
    // A `voy_` deployment key, an OAuth token or a session JWT must never be
    // mistaken for one — the capability line would then read the wrong ceiling.
    for (const token of ["voy_abc", "vy_abc", "abc.def.ghi", "", "   ", undefined, null]) {
      expect(classifyStorefrontKeyToken(token)).toBeNull()
    }
  })

  it("trims surrounding whitespace before classifying", () => {
    expect(classifyStorefrontKeyToken("  vsk_abc  ")).toBe("secret")
  })

  it("does not classify a prefix that merely contains the marker", () => {
    expect(classifyStorefrontKeyToken("xvpk_abc")).toBeNull()
  })

  it("pins the deployed prefixes and header — clients hold these", () => {
    expect(STOREFRONT_KEY_PREFIXES).toEqual({ publishable: "vpk_", secret: "vsk_" })
    expect(STOREFRONT_KEY_HEADER).toBe("x-api-key")
  })
})

describe("storefront key hashing", () => {
  it("produces the lowercase SHA-256 hex digest the column stores", async () => {
    // Pinned against a known vector rather than against itself: issuance and
    // the admin-surface lookup both resolve through this, so a changed digest
    // would make every existing secret key silently stop resolving.
    expect(await hashStorefrontKeyToken("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    )
    expect(await hashStorefrontKeyToken("")).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    )
  })

  it("is stable and distinct per token", async () => {
    const [first, second, other] = await Promise.all([
      hashStorefrontKeyToken("vsk_one"),
      hashStorefrontKeyToken("vsk_one"),
      hashStorefrontKeyToken("vsk_two"),
    ])
    expect(first).toBe(second)
    expect(first).not.toBe(other)
    expect(first).toMatch(/^[0-9a-f]{64}$/)
  })
})
