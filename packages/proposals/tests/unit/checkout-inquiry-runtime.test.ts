import { checkoutInquiryRuntimePort } from "@voyant-travel/proposals-contracts/checkout-inquiry"
import { describe, expect, it, vi } from "vitest"

vi.mock("../../src/runtime.js", () => ({
  createProposalsRuntime: vi.fn(async () => ({
    proposals: {},
    proposal: {},
    snapshot: {},
  })),
}))

import { createCheckoutInquiryRuntime } from "../../src/checkout-inquiry-runtime.js"
import { createProposalsRuntimePortContribution } from "../../src/runtime-contributor.js"

describe("Proposals checkout inquiry runtime", () => {
  it("adapts pipeline discovery and inquiry creation to proposalsService", async () => {
    const service = {
      listPipelines: vi.fn().mockResolvedValue({ data: [{ id: "pipeline_1" }] }),
      listStages: vi.fn().mockResolvedValue({ data: [{ id: "stage_1" }] }),
      createProposal: vi.fn().mockResolvedValue({ id: "proposal_1" }),
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
    ).resolves.toEqual({ id: "proposal_1" })
    expect(service.createProposal).toHaveBeenCalledWith(
      database,
      expect.objectContaining({ status: "open", tags: [] }),
    )
  })

  it("contributes the inquiry adapter without waiting for Trips", () => {
    const never = new Promise<never>(() => undefined)
    const contribution = createProposalsRuntimePortContribution({
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
