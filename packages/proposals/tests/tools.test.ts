import assert from "node:assert/strict"
import {
  createToolRegistry,
  type ToolContext,
  type ToolHandlerActionPolicyContext,
} from "@voyant-travel/tools"
import { describe, expect, it } from "vitest"

import {
  PROPOSALS_CREATED_TARGET_POLICIES,
  proposalsHandlerActionPolicyExpectation,
} from "../src/created-target-policy.js"
import {
  createProposalTool,
  type ProposalDeliveryToolServices,
  type ProposalsToolServices,
  proposalsTools,
  SNAPSHOT_AND_SEND_PROPOSAL_HANDLER_POLICY,
  snapshotAndSendProposalTool,
} from "../src/tools.js"

function ctx(
  services?: Partial<ProposalsToolServices>,
  actor: ToolContext["actor"] = "staff",
  delivery?: ProposalDeliveryToolServices,
  handlerActionPolicy: ToolHandlerActionPolicyContext = snapshotSendActionPolicy(),
): ToolContext & {
  proposals?: ProposalsToolServices
  proposalDelivery?: ProposalDeliveryToolServices
} {
  return {
    db: {},
    actor,
    audience: actor,
    tenantId: "default",
    resolverScope: { locale: "en-GB", audience: actor, market: "default", actor },
    handlerActionPolicy,
    proposals: services as ProposalsToolServices | undefined,
    proposalDelivery: delivery,
  }
}

/** The admitted context the create handler must have produced. */
function assertAdmitted(admitted: ToolHandlerActionPolicyContext) {
  assert.equal(admitted.canonicalName, "create_proposal")
  assert.equal(admitted.actionPolicy.targetLifecycle, "created")
  assert.equal(admitted.actionPolicy.createdTarget?.durability, "handler-command-claim-v1")
}

/** Admitted policy for the created-target proposal command. */
function createProposalActionPolicy(key = "proposal-create-1"): ToolHandlerActionPolicyContext {
  const expectation = proposalsHandlerActionPolicyExpectation(
    PROPOSALS_CREATED_TARGET_POLICIES.proposal,
  )
  return {
    capabilityId: expectation.capabilityId,
    capabilityVersion: expectation.capabilityVersion,
    canonicalName: expectation.canonicalName,
    actionPolicy: {
      ...expectation.actionPolicy,
      enforcement: "handler",
      invocation: {
        controlField: "_voyant",
        requiredFields: ["idempotencyKey"],
        optionalFields: ["reasonCode", "approvalId", "idempotencyFingerprint"],
        fingerprintAlgorithm: "action-ledger-command-v1",
      },
    },
    invocation: { idempotencyKey: key },
  }
}

function snapshotSendActionPolicy(): ToolHandlerActionPolicyContext {
  return {
    capabilityId: SNAPSHOT_AND_SEND_PROPOSAL_HANDLER_POLICY.capabilityId,
    capabilityVersion: SNAPSHOT_AND_SEND_PROPOSAL_HANDLER_POLICY.capabilityVersion,
    canonicalName: SNAPSHOT_AND_SEND_PROPOSAL_HANDLER_POLICY.canonicalName,
    actionPolicy: {
      ...SNAPSHOT_AND_SEND_PROPOSAL_HANDLER_POLICY.actionPolicy,
      enforcement: "handler",
      invocation: {
        controlField: "_voyant",
        requiredFields: ["idempotencyKey", "approvalId", "idempotencyFingerprint"],
        optionalFields: ["reasonCode", "approvalId", "idempotencyFingerprint"],
        fingerprintAlgorithm: "action-ledger-command-v1",
      },
    },
    invocation: {
      idempotencyKey: "proposal-send-1",
      approvalId: "approval_1",
      idempotencyFingerprint: "sha256:test",
    },
  }
}

function registry() {
  const registry = createToolRegistry()
  for (const tool of proposalsTools) {
    if (tool === snapshotAndSendProposalTool) {
      registry.register(tool, {
        actionPolicy: SNAPSHOT_AND_SEND_PROPOSAL_HANDLER_POLICY.actionPolicy,
      })
    } else if (tool === createProposalTool) {
      registry.register(tool, {
        actionPolicy: proposalsHandlerActionPolicyExpectation(
          PROPOSALS_CREATED_TARGET_POLICIES.proposal,
        ).actionPolicy,
      })
    } else {
      registry.register(tool)
    }
  }
  return registry
}

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
  notes: null,
  sentAt: null,
  viewedAt: null,
  decidedAt: null,
  createdAt: timestamp,
  updatedAt: timestamp,
  archivedAt: null,
}

describe("proposals Tools", () => {
  it("registers structural reads and the complete guarded proposal lifecycle", () => {
    const list = registry().list()
    expect(list.map((tool) => tool.name).sort()).toEqual([
      "accept_proposal_version",
      "add_proposal_product",
      "create_proposal",
      "decline_proposal_version",
      "get_proposal",
      "list_proposal_pipelines",
      "list_proposal_stages",
      "list_proposals",
      "send_proposal_version",
      "snapshot_and_send_proposal",
      "snapshot_proposal_version",
    ])
    for (const tool of list.filter(({ name }) => name !== "snapshot_and_send_proposal")) {
      expect(tool.owner).toBe("@voyant-travel/proposals")
    }
    expect(list.find(({ name }) => name === "snapshot_and_send_proposal")?.owner).toBe(
      "@voyant-travel/proposals#presentation-extension",
    )
    for (const tool of list) {
      expect(tool.capabilityVersion).toBe(tool.name === "snapshot_and_send_proposal" ? "v2" : "v1")
      expect(tool.audience).toEqual({ source: "grant", allowed: ["staff"] })
      expect(tool.outputSchema).not.toHaveProperty("x-voyant-schema-quality")
    }
    for (const name of [
      "snapshot_proposal_version",
      "send_proposal_version",
      "accept_proposal_version",
      "decline_proposal_version",
      "create_proposal",
      "add_proposal_product",
    ]) {
      expect(list.find((tool) => tool.name === name)).toMatchObject({
        tier: "write",
        requiredScopes: ["proposals:write"],
        riskPolicy: {
          destructive: false,
          reversible: false,
          confirmationRequired: true,
          sideEffects: ["data-write"],
        },
      })
    }
  })

  it("composes a snapshot and vetted-template delivery through one exact-idempotent service", async () => {
    const toolRegistry = registry()
    const delivery: ProposalDeliveryToolServices = {
      async snapshotAndSendProposal(input, admitted) {
        expect(input).toMatchObject({
          proposalId: proposal.id,
          templateSlug: "proposal-proposal",
        })
        expect(admitted.invocation.idempotencyKey).toBe("proposal-send-1")
        return {
          proposalVersion: { ...version, status: "sent", sentAt: timestamp },
          proposalUrl: `/proposal/${version.id}`,
          delivery: {
            id: "ndel_1",
            status: "pending",
            channel: "email",
            provider: "local",
            providerMessageId: "message_1",
            toAddress: "traveler@example.test",
          },
        }
      },
    }

    const result = await toolRegistry.dispatch<Record<string, unknown>>(
      "snapshot_and_send_proposal",
      {
        proposalId: proposal.id,
        to: "traveler@example.test",
        templateSlug: "proposal-proposal",
      },
      ctx(undefined, "staff", delivery),
    )

    expect(result).toMatchObject({
      proposalUrl: `/proposal/${version.id}`,
      delivery: { id: "ndel_1", status: "pending" },
    })
  })

  it("dispatches the full lifecycle through domain services and serializes dates", async () => {
    const calls: string[] = []
    const toolRegistry = registry()
    const services: ProposalsToolServices = {
      async listProposals(query) {
        calls.push(`list:${query.limit}`)
        return { data: [proposal], total: 1, limit: query.limit, offset: query.offset }
      },
      async getProposalById(id) {
        calls.push(`get:${id}`)
        return proposal
      },
      async snapshotProposalVersion(proposalId) {
        calls.push(`snapshot:${proposalId}`)
        return version
      },
      async sendProposalVersion(id, input) {
        calls.push(`send:${id}:${input.validUntil}`)
        return {
          ...version,
          status: "sent",
          validUntil: input.validUntil ?? null,
          sentAt: timestamp,
        }
      },
      async acceptProposalVersion(id) {
        calls.push(`accept:${id}`)
        return {
          proposal: { ...proposal, status: "won", acceptedVersionId: id, closedAt: timestamp },
          proposalVersion: { ...version, id, status: "accepted", decidedAt: timestamp },
          closedProposalVersions: [],
        }
      },
      async declineProposalVersion(id) {
        calls.push(`decline:${id}`)
        return { ...version, id, status: "declined", decidedAt: timestamp }
      },
    }

    const snapshot = await toolRegistry.dispatch<Record<string, unknown>>(
      "snapshot_proposal_version",
      { proposalId: proposal.id },
      ctx(services),
    )
    const sent = await toolRegistry.dispatch<Record<string, unknown>>(
      "send_proposal_version",
      { proposalVersionId: version.id, validUntil: "2026-09-01" },
      ctx(services),
    )
    const accepted = await toolRegistry.dispatch<{ proposalVersion: Record<string, unknown> }>(
      "accept_proposal_version",
      { proposalVersionId: version.id },
      ctx(services),
    )
    const declined = await toolRegistry.dispatch<Record<string, unknown>>(
      "decline_proposal_version",
      { proposalVersionId: version.id },
      ctx(services),
    )

    expect(snapshot.createdAt).toBe(timestamp.toISOString())
    expect(sent).toMatchObject({ status: "sent", validUntil: "2026-09-01" })
    expect(accepted.proposalVersion).toMatchObject({ status: "accepted" })
    expect(declined).toMatchObject({ status: "declined" })
    expect(calls).toEqual([
      `snapshot:${proposal.id}`,
      `send:${version.id}:2026-09-01`,
      `accept:${version.id}`,
      `decline:${version.id}`,
    ])
  })

  it("authors a proposal end to end: pipeline, stage, proposal, priced line", async () => {
    // The lifecycle Tools could send and accept a proposal that nothing could
    // build. This is the path an operator actually takes when a customer asks
    // for a price: find where proposals are filed, open one, put a line on it.
    const toolRegistry = registry()
    const services: Partial<ProposalsToolServices> = {
      async listPipelines() {
        return {
          data: [
            {
              id: "pipe_1",
              entityType: "proposal",
              name: "Sales",
              isDefault: true,
              sortOrder: 0,
              createdAt: timestamp,
              updatedAt: timestamp,
            },
          ],
          total: 1,
          limit: 50,
          offset: 0,
        }
      },
      async listStages() {
        return {
          data: [
            {
              id: "stge_1",
              pipelineId: "pipe_1",
              name: "New enquiry",
              sortOrder: 0,
              probability: 10,
              isClosed: false,
              isWon: false,
              isLost: false,
              createdAt: timestamp,
              updatedAt: timestamp,
            },
          ],
          total: 1,
          limit: 50,
          offset: 0,
        }
      },
      async createProposal(input, admitted) {
        // The handler must admit the created-target policy before the service
        // is reached, or a retry could open a second proposal.
        assertAdmitted(admitted)
        return { ...proposal, ...input, id: "prps_new", status: "open" }
      },
      async addProposalProduct(proposalId, line) {
        return {
          id: "prpd_1",
          proposalId,
          productId: null,
          supplierServiceId: null,
          description: null,
          unitPriceAmountCents: null,
          costAmountCents: null,
          currency: null,
          discountAmountCents: null,
          createdAt: timestamp,
          updatedAt: timestamp,
          ...line,
        }
      },
    }

    const pipelines = (await toolRegistry.dispatch(
      "list_proposal_pipelines",
      {},
      ctx(services),
    )) as {
      data: { id: string; isDefault: boolean }[]
    }
    const pipelineId = pipelines.data.find((p) => p.isDefault)?.id
    expect(pipelineId).toBe("pipe_1")

    const stages = (await toolRegistry.dispatch(
      "list_proposal_stages",
      { pipelineId },
      ctx(services),
    )) as { data: { id: string }[] }
    const stageId = stages.data[0]?.id

    const created = (await toolRegistry.dispatch(
      "create_proposal",
      { title: "Coastal Day Cruise — Ana Ionescu", pipelineId, stageId, paxCount: 4 },
      ctx(services, "staff", undefined, createProposalActionPolicy()),
    )) as { id: string; title: string; paxCount: number }
    expect(created).toMatchObject({ id: "prps_new", paxCount: 4 })

    const line = (await toolRegistry.dispatch(
      "add_proposal_product",
      {
        proposalId: created.id,
        nameSnapshot: "Coastal Day Cruise",
        quantity: 4,
        unitPriceAmountCents: 40_000,
        currency: "EUR",
      },
      ctx(services),
    )) as {
      proposalId: string
      nameSnapshot: string
      quantity: number
      unitPriceAmountCents: number
      createdAt: string
    }
    // proposalId addresses the proposal; it must not leak into the line payload as a
    // column, and the customer-facing name is captured on the line.
    expect(line).toMatchObject({
      proposalId: "prps_new",
      nameSnapshot: "Coastal Day Cruise",
      quantity: 4,
      unitPriceAmountCents: 40_000,
    })
    // Dates serialize, matching every other Tool in this package.
    expect(typeof line.createdAt).toBe("string")
  })

  it("fails closed for non-staff grants and missing services", async () => {
    const toolRegistry = registry()
    await expect(toolRegistry.dispatch("list_proposals", {}, ctx(undefined))).rejects.toMatchObject(
      {
        code: "MISSING_SERVICE",
      },
    )
    await expect(
      toolRegistry.dispatch("get_proposal", { id: proposal.id }, ctx(undefined, "customer")),
    ).rejects.toMatchObject({ code: "AUTHORIZATION_DENIED" })
    // Authoring is staff-only too, or a customer grant could open proposals.
    await expect(
      toolRegistry.dispatch(
        "create_proposal",
        { title: "x", pipelineId: "pipe_1", stageId: "stge_1" },
        ctx(undefined, "customer", undefined, createProposalActionPolicy()),
      ),
    ).rejects.toMatchObject({ code: "AUTHORIZATION_DENIED" })
    await expect(
      toolRegistry.dispatch(
        "add_proposal_product",
        { proposalId: proposal.id, nameSnapshot: "x" },
        ctx(undefined, "customer"),
      ),
    ).rejects.toMatchObject({ code: "AUTHORIZATION_DENIED" })
  })
})
