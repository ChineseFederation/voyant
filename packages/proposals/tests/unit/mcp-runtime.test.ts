import type { ToolHandlerActionPolicyContext } from "@voyant-travel/tools"
import { afterEach, describe, expect, it, vi } from "vitest"

const executeAcceptProposalVersionCommand = vi.hoisted(() => vi.fn())

vi.mock("../../src/service/proposal-version-acceptance-command.js", () => ({
  executeAcceptProposalVersionCommand,
}))

import { voyantToolContextContribution } from "../../src/mcp-runtime.js"

afterEach(() => {
  executeAcceptProposalVersionCommand.mockReset()
})

describe("proposals MCP runtime", () => {
  it("executes proposal acceptance through the admitted durable command", async () => {
    const db = {}
    const admitted = {
      invocation: { idempotencyKey: "accept-1" },
    } as ToolHandlerActionPolicyContext
    const accepted = { proposal: { id: "proposal_1" }, proposalVersion: { id: "version_1" } }
    executeAcceptProposalVersionCommand.mockResolvedValue({ replayed: false, value: accepted })
    const request = {
      req: {
        header(name: string) {
          return name === "x-request-id" ? "request_1" : undefined
        },
      },
      var: {
        db,
        userId: "user_1",
        callerType: "session",
        actor: "staff",
        organizationId: "org_1",
      },
    }

    const contribution = voyantToolContextContribution.contribute({
      request,
      context: { db },
      resources: {},
    })
    const proposals = contribution.proposals as {
      acceptProposalVersion(id: string, policy: ToolHandlerActionPolicyContext): Promise<unknown>
    }

    await expect(proposals.acceptProposalVersion("version_1", admitted)).resolves.toEqual(accepted)
    expect(executeAcceptProposalVersionCommand).toHaveBeenCalledWith({
      db,
      context: expect.objectContaining({
        userId: "user_1",
        callerType: "session",
        actor: "staff",
        organizationId: "org_1",
        correlationId: "request_1",
      }),
      admitted,
      proposalVersionId: "version_1",
    })
  })
})
