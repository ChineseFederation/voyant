import { proposalInquiryConversionRuntimePort } from "@voyant-travel/proposals-contracts/inquiry-conversion"
import { describe, expect, it, vi } from "vitest"

vi.mock("../../src/runtime.js", () => ({
  createProposalsRuntime: vi.fn(async () => ({
    proposals: {},
    proposal: {},
    snapshot: {},
  })),
}))

import { createProposalInquiryConversionRuntime } from "../../src/inquiry-conversion-runtime.js"
import { createProposalsRuntimePortContribution } from "../../src/runtime-contributor.js"

function createStore(overrides: Record<string, unknown> = {}) {
  return {
    withConversionLock: vi.fn(
      async (
        _database: unknown,
        _sourceRef: string,
        operation: (database: unknown) => Promise<unknown>,
      ) => operation("locked-db"),
    ),
    findBySourceRef: vi.fn().mockResolvedValue([]),
    getPipeline: vi.fn(),
    getDefaultPipeline: vi
      .fn()
      .mockResolvedValue({ id: "pipeline_default", entityType: "proposal" }),
    getStage: vi.fn(),
    getInitialOpenStage: vi
      .fn()
      .mockResolvedValue({ id: "stage_initial", pipelineId: "pipeline_default", isClosed: false }),
    createProposal: vi.fn(
      async (_database: unknown, input: { pipelineId: string; stageId: string }) => ({
        id: "proposal_1",
        pipelineId: input.pipelineId,
        stageId: input.stageId,
      }),
    ),
    ...overrides,
  }
}

function createStatefulStore() {
  const proposalsBySourceRef = new Map<
    string,
    Array<{ id: string; pipelineId: string; stageId: string }>
  >()
  let sequence = 0
  const store = createStore({
    findBySourceRef: vi.fn(async (_database: unknown, sourceRef: string) => {
      return proposalsBySourceRef.get(sourceRef) ?? []
    }),
    createProposal: vi.fn(
      async (
        _database: unknown,
        input: { sourceRef: string; pipelineId: string; stageId: string },
      ) => {
        sequence += 1
        const proposal = {
          id: `proposal_${sequence}`,
          pipelineId: input.pipelineId,
          stageId: input.stageId,
        }
        proposalsBySourceRef.set(input.sourceRef, [proposal])
        return proposal
      },
    ),
  })
  return { store, proposalsBySourceRef }
}

describe("Proposal Inquiry conversion runtime", () => {
  it("creates an open Proposal from the default pipeline and preserves unpriced snapshots", async () => {
    const store = createStore()
    const runtime = createProposalInquiryConversionRuntime(store as never)

    await expect(
      runtime.convertInquiry("db", {
        inquiryId: "inq_1",
        idempotencyKey: "conversion_1",
        title: "Custom Japan journey",
        summary: "Two weeks in autumn",
        personId: "person_1",
        organizationId: "org_1",
        ownerId: "staff_1",
        actorId: "staff_2",
        tags: ["bespoke", "japan"],
        productTargets: [
          {
            productId: "product_1",
            nameSnapshot: "Kyoto ryokan",
            description: "Customer-selected stay",
            quantity: 2,
          },
        ],
      }),
    ).resolves.toEqual({
      kind: "created",
      proposalId: "proposal_1",
      pipelineId: "pipeline_default",
      stageId: "stage_initial",
    })
    expect(store.withConversionLock).toHaveBeenCalledWith(
      "db",
      "inq_1/conversion/conversion_1",
      expect.any(Function),
    )
    expect(store.createProposal).toHaveBeenCalledWith("locked-db", {
      title: "Custom Japan journey",
      description: "Two weeks in autumn",
      personId: "person_1",
      organizationId: "org_1",
      ownerId: "staff_1",
      actorId: "staff_2",
      tags: ["bespoke", "japan"],
      sourceRef: "inq_1/conversion/conversion_1",
      pipelineId: "pipeline_default",
      stageId: "stage_initial",
      productTargets: [
        {
          productId: "product_1",
          nameSnapshot: "Kyoto ryokan",
          description: "Customer-selected stay",
          quantity: 2,
        },
      ],
    })
    expect(store.createProposal.mock.calls[0]?.[1]).not.toHaveProperty("valueAmountCents")
  })

  it("replays the same conversion after the Proposal lifecycle changes", async () => {
    const store = createStore({
      findBySourceRef: vi.fn().mockResolvedValue([
        {
          id: "proposal_existing",
          pipelineId: "pipeline_old",
          stageId: "stage_old",
          status: "won",
        },
      ]),
    })
    const runtime = createProposalInquiryConversionRuntime(store as never)

    await expect(
      runtime.convertInquiry("db", {
        inquiryId: "inq_1",
        idempotencyKey: "conversion_1",
        title: "Ignored on replay",
      }),
    ).resolves.toEqual({
      kind: "replayed",
      proposalId: "proposal_existing",
      pipelineId: "pipeline_old",
      stageId: "stage_old",
    })
    expect(store.getDefaultPipeline).not.toHaveBeenCalled()
    expect(store.createProposal).not.toHaveBeenCalled()
  })

  it("creates once and replays an exact idempotency-key retry", async () => {
    const { store } = createStatefulStore()
    const runtime = createProposalInquiryConversionRuntime(store as never)
    const input = {
      inquiryId: "inq_1",
      idempotencyKey: "conversion_1",
      title: "One operation",
    }

    await expect(runtime.convertInquiry("db", input)).resolves.toMatchObject({
      kind: "created",
      proposalId: "proposal_1",
    })
    await expect(runtime.convertInquiry("db", input)).resolves.toMatchObject({
      kind: "replayed",
      proposalId: "proposal_1",
    })
    expect(store.createProposal).toHaveBeenCalledTimes(1)
  })

  it("creates another Proposal when the same Inquiry uses a different operation key", async () => {
    const { store, proposalsBySourceRef } = createStatefulStore()
    const runtime = createProposalInquiryConversionRuntime(store as never)

    await expect(
      runtime.convertInquiry("db", {
        inquiryId: "inq_1",
        idempotencyKey: "conversion_1",
        title: "First pursuit",
      }),
    ).resolves.toMatchObject({ kind: "created", proposalId: "proposal_1" })
    await expect(
      runtime.convertInquiry("db", {
        inquiryId: "inq_1",
        idempotencyKey: "conversion_2",
        title: "Second pursuit",
      }),
    ).resolves.toMatchObject({ kind: "created", proposalId: "proposal_2" })

    expect(proposalsBySourceRef.has("inq_1/conversion/conversion_1")).toBe(true)
    expect(proposalsBySourceRef.has("inq_1/conversion/conversion_2")).toBe(true)
    expect(store.createProposal).toHaveBeenCalledTimes(2)
  })

  it("refuses ambiguous duplicate targets for one Inquiry operation", async () => {
    const store = createStore({
      findBySourceRef: vi.fn().mockResolvedValue([
        { id: "proposal_1", pipelineId: "pipeline_1", stageId: "stage_1" },
        { id: "proposal_2", pipelineId: "pipeline_1", stageId: "stage_1" },
      ]),
    })
    const runtime = createProposalInquiryConversionRuntime(store as never)

    await expect(
      runtime.convertInquiry("db", {
        inquiryId: "inq_1",
        idempotencyKey: "conversion_1",
        title: "Ambiguous operation",
      }),
    ).resolves.toEqual({ kind: "refused", reason: "source_conflict" })
    expect(store.createProposal).not.toHaveBeenCalled()
  })

  it("uses an explicit Stage only when it belongs to the selected Proposal pipeline", async () => {
    const store = createStore({
      getPipeline: vi.fn().mockResolvedValue({ id: "pipeline_1", entityType: "proposal" }),
      getStage: vi
        .fn()
        .mockResolvedValue({ id: "stage_other", pipelineId: "pipeline_2", isClosed: false }),
    })
    const runtime = createProposalInquiryConversionRuntime(store as never)

    await expect(
      runtime.convertInquiry("db", {
        inquiryId: "inq_1",
        idempotencyKey: "conversion_1",
        title: "Mismatch",
        pipeline: { pipelineId: "pipeline_1", stageId: "stage_other" },
      }),
    ).resolves.toEqual({ kind: "refused", reason: "stage_pipeline_mismatch" })
    expect(store.createProposal).not.toHaveBeenCalled()
  })

  it.each([
    [
      "a missing default pipeline",
      { getDefaultPipeline: vi.fn().mockResolvedValue(null) },
      "default_pipeline_not_found",
    ],
    [
      "a default pipeline without an open stage",
      { getInitialOpenStage: vi.fn().mockResolvedValue(null) },
      "open_stage_not_found",
    ],
  ])("returns a typed refusal for %s", async (_label, overrides, reason) => {
    const store = createStore(overrides)
    const runtime = createProposalInquiryConversionRuntime(store as never)
    await expect(
      runtime.convertInquiry("db", {
        inquiryId: "inq_1",
        idempotencyKey: "conversion_1",
        title: "Inquiry",
      }),
    ).resolves.toEqual({ kind: "refused", reason })
    expect(store.createProposal).not.toHaveBeenCalled()
  })

  it("contributes the provider without waiting for unrelated runtime ports", () => {
    const never = new Promise<never>(() => undefined)
    const contribution = createProposalsRuntimePortContribution({
      primitives: {} as never,
      getRuntimePort: vi.fn(() => never) as never,
    })

    expect(contribution[proposalInquiryConversionRuntimePort.id]).toMatchObject({
      convertInquiry: expect.any(Function),
    })
    expect(contribution[proposalInquiryConversionRuntimePort.id]).not.toBeInstanceOf(Promise)
  })
})
