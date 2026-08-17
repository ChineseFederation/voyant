import { describe, expect, it, vi } from "vitest"

import { proposalInquiryConversionRuntimePort } from "./inquiry-conversion.js"

describe("Proposal Inquiry conversion contract", () => {
  it("accepts the one-method conversion provider", () => {
    const provider = { convertInquiry: vi.fn() }
    expect(() => proposalInquiryConversionRuntimePort.test(provider)).not.toThrow()
  })

  it("rejects providers without the conversion command", () => {
    expect(() => proposalInquiryConversionRuntimePort.test({} as never)).toThrow(/convertInquiry/)
  })
})
