import { describe, expect, it } from "vitest"

import {
  classifyPublicApiKeyToken,
  hashPublicApiKeyToken,
  PUBLIC_API_KEY_HEADER,
  PUBLIC_API_KEY_PREFIXES,
} from "./public-api-key.js"

/**
 * These live in `graph-contracts` — the package with no dependencies — because
 * the generated API clients need them too and must not pull the kernel. Two
 * layers read them at different times — the
 * capability middleware classifies before authentication, the customer-auth
 * resolver classifies while resolving against the database — and a second copy
 * drifting from the first is an auth bypass (voyant#4625).
 */
describe("storefront key classification", () => {
  it("classifies each kind by its prefix", () => {
    expect(classifyPublicApiKeyToken("vpk_abc")).toBe("publishable")
    expect(classifyPublicApiKeyToken("vsk_abc")).toBe("secret")
  })

  it("returns null for anything that is not a storefront key", () => {
    // A `voy_` deployment key, an OAuth token or a session JWT must never be
    // mistaken for one — the capability line would then read the wrong ceiling.
    for (const token of ["voy_abc", "vy_abc", "abc.def.ghi", "", "   ", undefined, null]) {
      expect(classifyPublicApiKeyToken(token)).toBeNull()
    }
  })

  it("trims surrounding whitespace before classifying", () => {
    expect(classifyPublicApiKeyToken("  vsk_abc  ")).toBe("secret")
  })

  it("does not classify a prefix that merely contains the marker", () => {
    expect(classifyPublicApiKeyToken("xvpk_abc")).toBeNull()
  })

  it("pins the deployed prefixes and header — clients hold these", () => {
    expect(PUBLIC_API_KEY_PREFIXES).toEqual({ publishable: "vpk_", secret: "vsk_" })
    expect(PUBLIC_API_KEY_HEADER).toBe("x-api-key")
  })
})

describe("storefront key hashing", () => {
  it("produces the lowercase SHA-256 hex digest the column stores", async () => {
    // Pinned against a known vector rather than against itself: issuance and
    // the admin-surface lookup both resolve through this, so a changed digest
    // would make every existing secret key silently stop resolving.
    expect(await hashPublicApiKeyToken("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    )
    expect(await hashPublicApiKeyToken("")).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    )
  })

  it("is stable and distinct per token", async () => {
    const [first, second, other] = await Promise.all([
      hashPublicApiKeyToken("vsk_one"),
      hashPublicApiKeyToken("vsk_one"),
      hashPublicApiKeyToken("vsk_two"),
    ])
    expect(first).toBe(second)
    expect(first).not.toBe(other)
    expect(first).toMatch(/^[0-9a-f]{64}$/)
  })
})
