import { describe, expect, it } from "vitest"

import type { ReminderTargetSnapshot } from "./service-sequence.js"
import { resolveAnchor } from "./service-sequence.js"

describe("reminder due-date anchors", () => {
  it("prefers the authoritative projected instant over date-only UTC reconstruction", () => {
    const target: ReminderTargetSnapshot = {
      id: "bps_test",
      bookingId: "book_test",
      dueDate: "2026-03-29",
      dueAt: "2026-03-29T20:59:59.999Z",
      issuedAt: null,
      departureDate: null,
      bookingCreatedAt: null,
      status: "pending",
      isTerminal: false,
    }

    expect(resolveAnchor("due_date", target, [])?.toISOString()).toBe("2026-03-29T20:59:59.999Z")
  })
})
