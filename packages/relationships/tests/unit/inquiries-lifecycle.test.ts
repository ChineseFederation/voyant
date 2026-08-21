import { describe, expect, it } from "vitest"

import { canTransitionInquiry } from "../../src/service/inquiries.js"

describe("Inquiry lifecycle", () => {
  it("admits the operational happy path", () => {
    expect(canTransitionInquiry("new", "triaged")).toBe(true)
    expect(canTransitionInquiry("triaged", "in_progress")).toBe(true)
    expect(canTransitionInquiry("in_progress", "waiting_on_customer")).toBe(true)
    expect(canTransitionInquiry("waiting_on_customer", "qualified")).toBe(true)
  })

  it("keeps terminal and command-owned states out of generic transitions", () => {
    expect(canTransitionInquiry("new", "qualified")).toBe(false)
    expect(canTransitionInquiry("qualified", "converted")).toBe(false)
    expect(canTransitionInquiry("closed", "triaged")).toBe(false)
    expect(canTransitionInquiry("converted", "closed")).toBe(false)
  })
})
