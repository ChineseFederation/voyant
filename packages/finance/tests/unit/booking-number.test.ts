import { describe, expect, it } from "vitest"

import {
  allocateBookingNumber,
  BOOKING_NUMBER_PATTERN,
  formatBookingNumber,
} from "../../src/booking-number.js"

/** Minimal stand-in for the drizzle chain `allocateBookingNumber` walks. */
function dbWithTaken(taken: string[]) {
  const probed: string[] = []
  const db = {
    select: () => ({
      from: () => ({
        where: (_predicate: unknown) => ({
          limit: async () => {
            // The predicate is an opaque drizzle SQL object, so the fake reads the
            // candidate off the call order the allocator uses.
            const candidate = probed[probed.length - 1]
            return candidate && taken.includes(candidate) ? [{ id: "book_existing" }] : []
          },
        }),
      }),
    }),
  }
  return { db, probed }
}

describe("booking reference allocation", () => {
  it("formats the reference as BK-YYMM-NNNNNN", () => {
    const number = formatBookingNumber(new Date("2026-07-27T00:00:00Z"), 123)
    expect(number).toBe("BK-2607-000123")
    expect(number).toMatch(BOOKING_NUMBER_PATTERN)
  })

  it("pads a six-digit sequence and zero-pads a single-digit month", () => {
    expect(formatBookingNumber(new Date("2026-01-05T00:00:00Z"), 999_999)).toBe("BK-2601-999999")
  })

  it("skips a reference that is already taken", async () => {
    const { db, probed } = dbWithTaken(["BK-2607-000001"])
    const sequences = [1, 2]
    let index = 0

    const allocated = await allocateBookingNumber(db as never, {
      now: new Date("2026-07-27T00:00:00Z"),
      nextSequence: () => {
        const sequence = sequences[index++] ?? 99
        probed.push(formatBookingNumber(new Date("2026-07-27T00:00:00Z"), sequence))
        return sequence
      },
    })

    expect(allocated).toBe("BK-2607-000002")
  })

  it("fails loudly rather than reusing a reference when the space is exhausted", async () => {
    const { db, probed } = dbWithTaken(["BK-2607-000007"])

    await expect(
      allocateBookingNumber(db as never, {
        now: new Date("2026-07-27T00:00:00Z"),
        nextSequence: () => {
          probed.push("BK-2607-000007")
          return 7
        },
      }),
    ).rejects.toThrow(/Could not allocate a free booking reference/)
  })
})
