import { createToolRegistry, type ToolContext } from "@voyant-travel/tools"
import { describe, expect, it } from "vitest"

import {
  getProposalVersionTool,
  listProposalVersionsTool,
  type ProposalsToolServices,
} from "../src/tools.js"

const timestamp = new Date("2026-07-15T08:00:00.000Z")
const proposal = {
  id: "prps_1",
  title: "Danube proposal",
  personId: null,
  organizationId: null,
  pipelineId: "pipe_1",
  stageId: "stge_1",
  ownerId: null,
  status: "open",
  acceptedVersionId: null,
  valueAmountCents: 120_000,
  valueCurrency: "EUR",
  paxCount: 2,
  expectedCloseDate: null,
  source: null,
  sourceRef: null,
  lostReason: null,
  tags: [],
  customFields: {},
  description: null,
  createdBy: null,
  updatedBy: null,
  createdAt: timestamp,
  updatedAt: timestamp,
  stageChangedAt: timestamp,
  closedAt: null,
}
const version = {
  id: "prvr_1",
  proposalId: proposal.id,
  label: null,
  status: "draft",
  supersedesId: null,
  tripSnapshotId: null,
  validUntil: null,
  currency: "EUR",
  subtotalAmountCents: 120_000,
  taxAmountCents: 0,
  totalAmountCents: 120_000,
  paymentTerms: null,
  notes: null,
  sentAt: null,
  viewedAt: null,
  decidedAt: null,
  createdAt: timestamp,
  updatedAt: timestamp,
  archivedAt: null,
}

function registry() {
  const registry = createToolRegistry()
  registry.register(getProposalVersionTool)
  registry.register(listProposalVersionsTool)
  return registry
}

function context(services: Partial<ProposalsToolServices>): ToolContext & {
  proposals: ProposalsToolServices
} {
  return {
    db: {},
    actor: "staff",
    audience: "staff",
    tenantId: "default",
    resolverScope: { locale: "en-GB", audience: "staff", market: "default", actor: "staff" },
    proposals: services as ProposalsToolServices,
  }
}

describe("proposal version read Tools", () => {
  it("reads one frozen proposal version with its proposal and line items", async () => {
    const line = {
      id: "prvl_1",
      proposalVersionId: version.id,
      productId: "prod_1",
      supplierServiceId: null,
      description: "Danube cabin",
      quantity: 2,
      unitPriceAmountCents: 60_000,
      totalAmountCents: 120_000,
      currency: "EUR",
      createdAt: timestamp,
      updatedAt: timestamp,
    }
    const result = await registry().dispatch<Record<string, unknown>>(
      "get_proposal_version",
      { proposalVersionId: version.id },
      context({
        async getProposalVersionProposal(id) {
          expect(id).toBe(version.id)
          return { proposal, proposalVersion: version, lines: [line] }
        },
      }),
    )

    expect(result).toEqual({
      proposal: {
        ...proposal,
        createdAt: timestamp.toISOString(),
        updatedAt: timestamp.toISOString(),
        stageChangedAt: timestamp.toISOString(),
      },
      proposalVersion: {
        ...version,
        createdAt: timestamp.toISOString(),
        updatedAt: timestamp.toISOString(),
      },
      lines: [{ ...line, createdAt: timestamp.toISOString(), updatedAt: timestamp.toISOString() }],
    })
  })

  it("lists the versions belonging to one proposal", async () => {
    const result = await registry().dispatch<Record<string, unknown>>(
      "list_proposal_versions",
      { proposalId: proposal.id, limit: 10, offset: 0 },
      context({
        async listProposalVersions(query) {
          expect(query).toEqual({ proposalId: proposal.id, limit: 10, offset: 0 })
          return { data: [version], total: 1, limit: 10, offset: 0 }
        },
      }),
    )

    expect(result).toEqual({
      data: [
        { ...version, createdAt: timestamp.toISOString(), updatedAt: timestamp.toISOString() },
      ],
      total: 1,
      limit: 10,
      offset: 0,
    })
  })
})
