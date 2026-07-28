import { describe, expect, it } from "vitest"

import { formatSlotTimeWithTimezone } from "./product-detail-shared.js"

describe("departure time labels", () => {
  it("renders the configured local time with an explicit timezone label", () => {
    expect(formatSlotTimeWithTimezone("2026-10-12T06:30:00.000Z", "Europe/Bucharest")).toBe(
      "09:30 · Europe/Bucharest",
    )
  })
})
