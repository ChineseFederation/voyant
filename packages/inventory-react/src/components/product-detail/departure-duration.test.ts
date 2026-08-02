import { describe, expect, it } from "vitest"
import { deriveDepartureEndIso } from "./departure-duration.js"

describe("deriveDepartureEndIso", () => {
  it("derives the saved end instant from an explicit product duration", () => {
    expect(deriveDepartureEndIso("2026-08-20T06:00:00.000Z", 480)).toBe("2026-08-20T14:00:00.000Z")
  })

  it("keeps elapsed duration correct across a daylight-saving transition", () => {
    expect(deriveDepartureEndIso("2026-10-25T00:30:00.000Z", 120)).toBe("2026-10-25T02:30:00.000Z")
  })

  it("does not invent an end for unresolved or invalid durations", () => {
    expect(deriveDepartureEndIso("2026-08-20T06:00:00.000Z", null)).toBeNull()
    expect(deriveDepartureEndIso("2026-08-20T06:00:00.000Z", 0)).toBeNull()
  })
})
