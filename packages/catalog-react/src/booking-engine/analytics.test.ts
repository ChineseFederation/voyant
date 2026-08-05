import { describe, expect, it } from "vitest"

import { referrerOrigin } from "./analytics.js"

describe("referrerOrigin", () => {
  it("keeps the origin, which is the part that says where a journey came from", () => {
    expect(referrerOrigin("https://www.google.com/search")).toBe("https://www.google.com")
    expect(referrerOrigin("https://partner.example.com")).toBe("https://partner.example.com")
  })

  it("drops the path and query, which are the part that can carry PII", () => {
    expect(
      referrerOrigin("https://mail.example.com/inbox/42?to=ada%40example.com&name=Ada%20Lovelace"),
    ).toBe("https://mail.example.com")
  })

  it("reports nothing rather than a fragment for a direct visit or a malformed referrer", () => {
    expect(referrerOrigin(undefined)).toBeUndefined()
    expect(referrerOrigin("")).toBeUndefined()
    expect(referrerOrigin("not a url")).toBeUndefined()
  })
})
