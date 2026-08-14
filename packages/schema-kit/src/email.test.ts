import { describe, expect, it } from "vitest"
import { z } from "zod"

import { emailAddress, emailPattern } from "./email.js"

/**
 * The load-bearing claim of voyant#4598's fix is that swapping zod's default
 * email pattern for a lookaround-free one changes no field's verdict. Assert it
 * against zod's default rather than against a hand-written expectation, so the
 * comparison stays honest if zod changes either pattern.
 */
const zodDefault = z.email()

const ACCEPTED = [
  "a@b.co",
  "john.doe+x@mail.example.com",
  "o'brien@x.io",
  "a_b@x.co",
  "A@B.CO",
  "a@b-c.io",
]

const REJECTED = [
  "",
  "plainstring",
  ".a@b.co",
  "a..b@c.io",
  "a.@b.co",
  "a@b",
  "a@.b.co",
  "a@b..co",
  "a b@c.co",
  "a@",
  "@b.co",
]

describe("emailAddress", () => {
  it("advertises a pattern with no regex lookaround", () => {
    // Round-trip through JSON: this is the document a transport serializes and
    // a client parses, not the in-memory payload type.
    const serialized: { properties: { email: { pattern: string } } } = JSON.parse(
      JSON.stringify(z.toJSONSchema(z.object({ email: emailAddress() }), { io: "input" })),
    )
    const { pattern } = serialized.properties.email
    expect(pattern).toBe(emailPattern.source)
    expect(/\((\?=|\?!|\?<=|\?<!)/.test(pattern)).toBe(false)
  })

  it("accepts every address zod's default accepts", () => {
    for (const value of ACCEPTED) {
      expect(zodDefault.safeParse(value).success, `${value} (zod default)`).toBe(true)
      expect(emailAddress().safeParse(value).success, value).toBe(true)
    }
  })

  it("rejects every address zod's default rejects", () => {
    for (const value of REJECTED) {
      expect(zodDefault.safeParse(value).success, `${value} (zod default)`).toBe(false)
      expect(emailAddress().safeParse(value).success, value).toBe(false)
    }
  })

  // Parity is the whole claim, so assert it the way it was established: by
  // differential comparison over generated input, not a curated list that can
  // only contain cases someone already thought of. Seeded, so a failure is
  // reproducible rather than a once-in-a-while red.
  it("agrees with zod's default on every generated input", () => {
    const alphabet = ["a", "Z", "9", "_", "'", "+", "-", ".", "@", "co", "..", "ü", '"', " "]
    let seed = 1
    const next = () => {
      seed = (seed * 1103515245 + 12345) % 2147483648
      return seed / 2147483648
    }
    const differences: string[] = []
    // 5k, not the 700k the equivalence was originally established with. That
    // sweep was a one-off argument; this is a regression guard, and a loop long
    // enough to approach the default timeout under CI load would just become a
    // rotating red — the exact failure mode this branch already had to fix once.
    for (let index = 0; index < 5_000; index += 1) {
      let value = ""
      const length = 1 + Math.floor(next() * 8)
      for (let part = 0; part < length; part += 1) {
        value += alphabet[Math.floor(next() * alphabet.length)]
      }
      if (zodDefault.safeParse(value).success !== emailAddress().safeParse(value).success) {
        differences.push(value)
      }
    }
    expect(differences).toEqual([])
  })

  // These patterns ship inside every advertised Tool schema, so length is a
  // running cost charged to the model on every connection — see email.ts.
  it("is shorter than the pattern it replaces", () => {
    expect(emailPattern.source.length).toBeLessThan(z.regexes.email.source.length)
  })

  it("carries a caller-supplied error message", () => {
    const result = emailAddress("Enter a valid email address").safeParse("nope")
    expect(result.success).toBe(false)
    expect(result.error?.issues[0]?.message).toBe("Enter a valid email address")
  })

  it("chains string constraints", () => {
    const bounded = emailAddress().max(10)
    expect(bounded.safeParse("a@b.co").success).toBe(true)
    expect(bounded.safeParse("aaaaaaaaaa@b.co").success).toBe(false)
  })

  it("keeps trim-before-validate available through emailPattern", () => {
    const trimmed = z.string().trim().email({ pattern: emailPattern })
    expect(trimmed.safeParse(" a@b.co ").success).toBe(true)
    expect(trimmed.safeParse(" nope ").success).toBe(false)
  })
})
