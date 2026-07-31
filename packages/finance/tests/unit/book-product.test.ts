import { describe, expect, it } from "vitest"

import {
  type BookProductInput,
  collectBookProductIssues,
  deriveBookProductIdempotencyKey,
  mapBookProductIntentToCommand,
} from "../../src/book-product.js"

function completeInput(overrides: Partial<BookProductInput> = {}): BookProductInput {
  return {
    productId: "product_1",
    personId: "person_1",
    billingContact: { firstName: "Ada", lastName: "Lovelace", email: "ada@example.com" },
    travelers: [
      { clientTravelerKey: "ada", firstName: "Ada", lastName: "Lovelace", isPrimary: true },
    ],
    ...overrides,
  } as BookProductInput
}

describe("book_product validate-before-write", () => {
  it("returns no issues for a complete private-client request", () => {
    expect(collectBookProductIssues(completeInput())).toBeNull()
  })

  it("returns an actionable billing-party issue when neither person nor organization is set", () => {
    const issues = collectBookProductIssues(
      completeInput({ personId: undefined, organizationId: undefined }),
    )
    expect(issues).not.toBeNull()
    expect(issues).toContainEqual(
      expect.objectContaining({
        path: "personId",
        message: expect.stringMatching(/billing party/i),
      }),
    )
  })

  it("flags a private client missing an email or phone", () => {
    const issues = collectBookProductIssues(
      completeInput({ billingContact: { firstName: "Ada", lastName: "Lovelace" } }),
    )
    expect(issues).not.toBeNull()
    expect(issues?.some((issue) => /email or phone/i.test(issue.message))).toBe(true)
  })

  it("flags an unknown travelerKey referenced by a room", () => {
    const issues = collectBookProductIssues(
      completeInput({
        rooms: [{ optionUnitId: "unit_1", quantity: 1, travelerKeys: ["ghost"] }],
      }),
    )
    expect(issues?.some((issue) => /Unknown travelerKey/i.test(issue.message))).toBe(true)
  })
})

describe("book_product mapping", () => {
  it("threads the billing party, contact snapshot, and rooms into the command", () => {
    const command = mapBookProductIntentToCommand(
      completeInput({
        rooms: [{ optionUnitId: "unit_1", quantity: 2, travelerKeys: ["ada"], title: "Suite" }],
      }),
      "BK-2607-000123",
    )
    expect(command).toMatchObject({
      productId: "product_1",
      bookingNumber: "BK-2607-000123",
      personId: "person_1",
      contactFirstName: "Ada",
      contactLastName: "Lovelace",
      contactEmail: "ada@example.com",
      itemLines: [{ optionUnitId: "unit_1", quantity: 2, travelerKeys: ["ada"], title: "Suite" }],
    })
  })
})

describe("book_product idempotency key", () => {
  it("is deterministic and independent of key order", async () => {
    const a = await deriveBookProductIdempotencyKey(completeInput())
    const b = await deriveBookProductIdempotencyKey({
      travelers: [
        { clientTravelerKey: "ada", firstName: "Ada", lastName: "Lovelace", isPrimary: true },
      ],
      billingContact: { email: "ada@example.com", firstName: "Ada", lastName: "Lovelace" },
      personId: "person_1",
      productId: "product_1",
    } as BookProductInput)
    expect(a).toBe(b)
    expect(a).toMatch(/^book-product:v1:[0-9a-f]{64}$/)
  })

  it("differs when the semantic request differs", async () => {
    const a = await deriveBookProductIdempotencyKey(completeInput())
    const b = await deriveBookProductIdempotencyKey(completeInput({ productId: "product_2" }))
    expect(a).not.toBe(b)
  })
})
