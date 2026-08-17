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
    if (sourceRef === null) throw new Error("valid source reference was refused")
    expect(parseProposalInquirySourceRef(sourceRef)).toEqual({
      inquiryId: "inq/romania",
      idempotencyKey: "retry:key/2",
    })
    expect(parseProposalInquirySourceRef("not-an-inquiry-reference")).toBeNull()
  })

  it.each([
    ["empty Inquiry id", "", "key"],
    ["empty operation key", "inq_1", ""],
    ["blank Inquiry id", "   ", "key"],
    ["oversized Inquiry id", "i".repeat(256), "key"],
    ["oversized operation key", "inq_1", "k".repeat(256)],
    ["malformed Inquiry Unicode", "inq_\ud800", "key"],
    ["malformed key Unicode", "inq_1", "key_\udc00"],
  ])("refuses %s without throwing", (_label, inquiryId, idempotencyKey) => {
    expect(() => formatProposalInquirySourceRef(inquiryId, idempotencyKey)).not.toThrow()
    expect(formatProposalInquirySourceRef(inquiryId, idempotencyKey)).toBeNull()
  })

  it("rejects malformed or invalid encoded references", () => {
    expect(parseProposalInquirySourceRef("/conversion/key")).toBeNull()
    expect(parseProposalInquirySourceRef("inq_1/conversion/")).toBeNull()
    expect(parseProposalInquirySourceRef("inq_%ED%A0%80/conversion/key")).toBeNull()
    expect(parseProposalInquirySourceRef(`${"i".repeat(256)}/conversion/key`)).toBeNull()
  })
})
