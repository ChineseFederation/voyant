import type { ProposalInquiryConversionRuntime } from "../inquiry-conversion.js"

/** Import-cheap port consumed by deployment manifests and the Relationships coordinator. */
export const proposalInquiryConversionRuntimePort = Object.freeze({
  id: "proposals.inquiry-conversion.runtime",
  test(provider: ProposalInquiryConversionRuntime) {
    if (provider === null || typeof provider !== "object") {
      throw new Error("proposals.inquiry-conversion.runtime provider must be an object.")
    }
    if (typeof Reflect.get(provider, "convertInquiry") !== "function") {
      throw new Error(
        "proposals.inquiry-conversion.runtime provider must implement convertInquiry().",
      )
    }
  },
})
