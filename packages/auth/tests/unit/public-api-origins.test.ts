import { describe, expect, it } from "vitest"

import {
  isPublicApiOriginAllowed,
  normalizeCustomerAccountPolicy,
  normalizeCustomerAuthMethods,
  normalizePublicApiAllowedOrigins,
  PublicApiInputError,
} from "../../src/public-api-origins.js"

describe("normalizePublicApiAllowedOrigins", () => {
  it("accepts https origins, localhost http-with-port, and wildcards; dedupes + sorts", () => {
    expect(
      normalizePublicApiAllowedOrigins([
        "https://shop.example.com",
        "https://shop.example.com/",
        "http://localhost:3000",
        "https://*.example.com",
      ]),
    ).toEqual(["http://localhost:3000", "https://*.example.com", "https://shop.example.com"])
  })

  it("permits http only for localhost / loopback", () => {
    expect(normalizePublicApiAllowedOrigins(["http://127.0.0.1:8080"])).toEqual([
      "http://127.0.0.1:8080",
    ])
    expect(() => normalizePublicApiAllowedOrigins(["http://shop.example.com"])).toThrow(
      PublicApiInputError,
    )
  })

  it("rejects paths, credentials, query, hash, empty, and malformed wildcards", () => {
    for (const bad of [
      "",
      "   ",
      "https://shop.example.com/path",
      "https://user:pass@shop.example.com",
      "https://shop.example.com?x=1",
      "https://shop.example.com#a",
      "not a url",
      "https://*.*.example.com",
      "https://*./",
      "https://*.example.com:8443",
    ]) {
      expect(() => normalizePublicApiAllowedOrigins([bad])).toThrow(PublicApiInputError)
    }
  })
})

describe("isPublicApiOriginAllowed", () => {
  const allowed = ["https://shop.example.com", "https://*.example.com", "http://localhost:3000"]

  it("matches exact origins", () => {
    expect(isPublicApiOriginAllowed("https://shop.example.com", allowed)).toBe(true)
    expect(isPublicApiOriginAllowed("http://localhost:3000", allowed)).toBe(true)
  })

  it("matches a wildcard for exactly one extra label", () => {
    expect(isPublicApiOriginAllowed("https://app.example.com", allowed)).toBe(true)
    expect(isPublicApiOriginAllowed("https://a.b.example.com", allowed)).toBe(false)
    expect(isPublicApiOriginAllowed("https://example.com", allowed)).toBe(false)
  })

  it("never matches http against an https wildcard, nor unlisted origins", () => {
    expect(isPublicApiOriginAllowed("http://app.example.com", allowed)).toBe(false)
    expect(isPublicApiOriginAllowed("https://evil.com", allowed)).toBe(false)
    expect(isPublicApiOriginAllowed("https://shop.example.com/path", allowed)).toBe(false)
    expect(isPublicApiOriginAllowed("not-a-url", allowed)).toBe(false)
  })
})

describe("normalizeCustomerAuthMethods", () => {
  it("coerces flags to strict booleans", () => {
    expect(
      normalizeCustomerAuthMethods({
        emailCode: true,
        emailPassword: false,
        google: true,
        facebook: false,
        apple: false,
      }),
    ).toEqual({
      emailCode: true,
      emailPassword: false,
      google: true,
      facebook: false,
      apple: false,
    })
  })

  it("requires at least one enabled method", () => {
    expect(() =>
      normalizeCustomerAuthMethods({
        emailCode: false,
        emailPassword: false,
        google: false,
        facebook: false,
        apple: false,
      }),
    ).toThrow(PublicApiInputError)
  })
})

describe("normalizeCustomerAccountPolicy", () => {
  it("keeps a valid personal-only policy and orders kinds", () => {
    expect(
      normalizeCustomerAccountPolicy({
        allowedKinds: ["business", "personal"],
        personalSignup: "open",
        businessOnboarding: "request",
      }),
    ).toEqual({
      allowedKinds: ["personal", "business"],
      personalSignup: "open",
      businessOnboarding: "request",
    })
  })

  it("enforces the personal / business gating invariants", () => {
    expect(() =>
      normalizeCustomerAccountPolicy({
        allowedKinds: ["business"],
        personalSignup: "open",
        businessOnboarding: "open",
      }),
    ).toThrow(PublicApiInputError)
    expect(() =>
      normalizeCustomerAccountPolicy({
        allowedKinds: ["business"],
        personalSignup: "disabled",
        businessOnboarding: "disabled",
      }),
    ).toThrow(PublicApiInputError)
    expect(() =>
      normalizeCustomerAccountPolicy({
        allowedKinds: ["personal", "personal"],
        personalSignup: "open",
        businessOnboarding: "disabled",
      }),
    ).toThrow(PublicApiInputError)
  })
})
