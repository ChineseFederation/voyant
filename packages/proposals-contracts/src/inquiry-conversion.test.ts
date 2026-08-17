import { describe, expect, it, vi } from "vitest"

import {
  formatProposalInquirySourceRef,
  parseProposalInquirySourceRef,
  proposalInquiryConversionRuntimePort,
} from "./inquiry-conversion.js"

describe("Proposal Inquiry conversion contract", () => {
  it("accepts the one-method conversion provider", () => {
    const provider = { convertInquiry: vi.fn() }
    expect(() => proposalInquiryConversionRuntimePort.test(provider)).not.toThrow()
  })

  it("rejects providers without the conversion command", () => {
    expect(() => proposalInquiryConversionRuntimePort.test({} as never)).toThrow(/convertInquiry/)
  })

  it("round-trips navigable Inquiry provenance and operation identity", () => {
    const sourceRef = formatProposalInquirySourceRef("inq/romania", "retry:key/2")
    expect(sourceRef).toBe("inq%2Fromania/conversion/retry%3Akey%2F2")
    expect(parseProposalInquirySourceRef(sourceRef)).toEqual({
      inquiryId: "inq/romania",
      idempotencyKey: "retry:key/2",
    })
    expect(parseProposalInquirySourceRef("not-an-inquiry-reference")).toBeNull()
  })
})
