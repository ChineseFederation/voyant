import { describe, expect, it } from "vitest"

import {
  applyTripSnapshotToProposalVersionSchema,
  insertPipelineSchema,
  insertProposalSchema,
  insertProposalVersionSchema,
  insertStageSchema,
  updateProposalVersionSchema,
} from "../../src/validation.js"

describe("Pipeline schemas", () => {
  it("applies defaults", () => {
    const result = insertPipelineSchema.parse({ name: "Sales" })
    expect(result.entityType).toBe("proposal")
    expect(result.isDefault).toBe(false)
    expect(result.sortOrder).toBe(0)
  })

  it("rejects empty name", () => {
    expect(() => insertPipelineSchema.parse({ name: "" })).toThrow()
  })
})

describe("Stage schemas", () => {
  it("requires pipelineId", () => {
    const result = insertStageSchema.parse({
      pipelineId: "crm_pip_abc",
      name: "Prospecting",
    })
    expect(result.pipelineId).toBe("crm_pip_abc")
  })

  it("rejects missing pipelineId", () => {
    expect(() => insertStageSchema.parse({ name: "Prospecting" })).toThrow()
  })

  it("accepts probability in range 0-100", () => {
    const result = insertStageSchema.parse({
      pipelineId: "crm_pip_abc",
      name: "Closing",
      probability: 75,
    })
    expect(result.probability).toBe(75)
  })

  it("rejects probability over 100", () => {
    expect(() =>
      insertStageSchema.parse({
        pipelineId: "crm_pip_abc",
        name: "Closing",
        probability: 150,
      }),
    ).toThrow()
  })

  it("rejects negative probability", () => {
    expect(() =>
      insertStageSchema.parse({
        pipelineId: "crm_pip_abc",
        name: "Closing",
        probability: -1,
      }),
    ).toThrow()
  })
})

describe("Proposal schemas", () => {
  const validProposal = {
    title: "Big Deal",
    pipelineId: "crm_pip_abc",
    stageId: "crm_stg_abc",
  }

  it("requires title, pipelineId, stageId", () => {
    const result = insertProposalSchema.parse(validProposal)
    expect(result.title).toBe("Big Deal")
    expect(result.status).toBe("open")
    expect(result.tags).toEqual([])
  })

  it("rejects missing title", () => {
    expect(() =>
      insertProposalSchema.parse({
        pipelineId: "crm_pip_abc",
        stageId: "crm_stg_abc",
      }),
    ).toThrow()
  })

  it("accepts valid status enum", () => {
    const result = insertProposalSchema.parse({ ...validProposal, status: "won" })
    expect(result.status).toBe("won")
  })

  it("rejects invalid status enum", () => {
    expect(() => insertProposalSchema.parse({ ...validProposal, status: "invalid" })).toThrow()
  })
})

describe("Proposal Version schemas", () => {
  it("requires proposalId and currency", () => {
    const result = insertProposalVersionSchema.parse({
      proposalId: "prps_abc",
      currency: "USD",
    })
    expect(result.proposalId).toBe("prps_abc")
    expect(result.currency).toBe("USD")
    expect(result.subtotalAmountCents).toBe(0)
    expect(result.taxAmountCents).toBe(0)
    expect(result.totalAmountCents).toBe(0)
    expect(result.status).toBe("draft")
  })

  it("rejects missing currency", () => {
    expect(() => insertProposalVersionSchema.parse({ proposalId: "prps_abc" })).toThrow()
  })

  it("does not apply insert defaults to proposal version updates", () => {
    expect(updateProposalVersionSchema.parse({})).toEqual({})
    expect(updateProposalVersionSchema.parse({ notes: "Notes patch only" })).toEqual({
      notes: "Notes patch only",
    })
  })

  it("accepts a trip snapshot proposal payload for a proposal version", () => {
    const result = applyTripSnapshotToProposalVersionSchema.parse({
      tripSnapshotId: "trsn_abc",
      currency: "EUR",
      totalAmountCents: 10900,
      lines: [
        {
          componentId: "trcp_123",
          description: "Airport transfer",
          currency: "EUR",
          totalAmountCents: 10900,
        },
      ],
    })

    expect(result.lines[0]).toMatchObject({
      componentId: "trcp_123",
      description: "Airport transfer",
      quantity: 1,
      unitPriceAmountCents: 0,
      totalAmountCents: 10900,
    })
  })
})
