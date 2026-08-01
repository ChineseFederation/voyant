export interface CheckoutInquiryPipelineSelection {
  pipelineId: string
  stageId: string
}

export interface CheckoutInquiryPipelinePreference {
  pipelineId?: string | null
  stageId?: string | null
}

export interface CreateCheckoutInquiryInput {
  title: string
  pipelineId: string
  stageId: string
  personId: string | null
  organizationId: string | null
  valueAmountCents: number | null
  valueCurrency: string | null
  source: string
  sourceRef: string
}

export interface CheckoutInquiryRuntime {
  resolvePipeline(
    database: unknown,
    preference: CheckoutInquiryPipelinePreference,
  ): Promise<CheckoutInquiryPipelineSelection | null>
  createInquiry(
    database: unknown,
    input: CreateCheckoutInquiryInput,
  ): Promise<{ id: string } | null>
}

export const checkoutInquiryRuntimePort = Object.freeze({
  id: "proposals.checkout-inquiry.runtime",
  test(provider: CheckoutInquiryRuntime) {
    if (provider === null || typeof provider !== "object") {
      throw new Error("proposals.checkout-inquiry.runtime provider must be an object.")
    }
    for (const method of ["resolvePipeline", "createInquiry"] as const) {
      if (typeof Reflect.get(provider, method) !== "function") {
        throw new Error(`proposals.checkout-inquiry.runtime provider must implement ${method}().`)
      }
    }
  },
})
