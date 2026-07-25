import { checkoutInquiryRuntimePort } from "@voyant-travel/quotes-contracts/checkout-inquiry"
import { describe, expect, it, vi } from "vitest"

vi.mock("../../src/runtime.js", () => ({
  createQuotesRuntime: vi.fn(async () => ({
    quotes: {},
    proposal: {},
    snapshot: {},
  })),
}))

import { createCheckoutInquiryRuntime } from "../../src/checkout-inquiry-runtime.js"
import { createQuotesRuntimePortContribution } from "../../src/runtime-contributor.js"

describe("Quotes checkout inquiry runtime", () => {
  it("adapts pipeline discovery and inquiry creation to quotesService", async () => {
    const service = {
      listPipelines: vi.fn().mockResolvedValue({ data: [{ id: "pipeline_1" }] }),
      listStages: vi.fn().mockResolvedValue({ data: [{ id: "stage_1" }] }),
      createQuote: vi.fn().mockResolvedValue({ id: "quote_1" }),
    }
    const runtime = createCheckoutInquiryRuntime(service as never)
    const database = {}

    await expect(runtime.resolvePipeline(database, {})).resolves.toEqual({
      pipelineId: "pipeline_1",
      stageId: "stage_1",
    })
    await expect(
      runtime.createInquiry(database, {
        title: "Inquiry — booking BK-1",
        pipelineId: "pipeline_1",
        stageId: "stage_1",
        personId: null,
        organizationId: null,
        valueAmountCents: 1000,
        valueCurrency: "EUR",
        source: "storefront-inquiry",
        sourceRef: "bk_1",
      }),
    ).resolves.toEqual({ id: "quote_1" })
    expect(service.createQuote).toHaveBeenCalledWith(
      database,
      expect.objectContaining({ status: "open", tags: [] }),
    )
  })

  it("contributes the inquiry adapter without waiting for Trips", () => {
    const never = new Promise<never>(() => undefined)
    const contribution = createQuotesRuntimePortContribution({
      primitives: {} as never,
      getRuntimePort: vi.fn(() => never) as never,
    })

    expect(contribution[checkoutInquiryRuntimePort.id]).toMatchObject({
      resolvePipeline: expect.any(Function),
      createInquiry: expect.any(Function),
    })
    expect(contribution[checkoutInquiryRuntimePort.id]).not.toBeInstanceOf(Promise)
  })
})
