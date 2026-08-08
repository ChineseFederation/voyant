import type { ToolHandlerActionPolicyContext } from "@voyant-travel/tools"
import { afterEach, describe, expect, it, vi } from "vitest"

const executeAcceptProposalVersionCommand = vi.hoisted(() => vi.fn())
const executeAcceptProposalForBookingCommand = vi.hoisted(() => vi.fn())

vi.mock("../../src/service/proposal-version-acceptance-command.js", () => ({
  executeAcceptProposalVersionCommand,
}))
vi.mock("../../src/service/proposal-booking-acceptance-command.js", () => ({
  executeAcceptProposalForBookingCommand,
}))

import { voyantToolContextContribution } from "../../src/mcp-runtime.js"

afterEach(() => {
  executeAcceptProposalVersionCommand.mockReset()
  executeAcceptProposalForBookingCommand.mockReset()
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

  it("executes proposal-to-booking acceptance through the admitted durable command", async () => {
    const db = {}
    const admitted = {
      invocation: { idempotencyKey: "booking-accept-1" },
    } as ToolHandlerActionPolicyContext
    const accepted = { status: "accepted", bookingSession: { id: "session_1" } }
    executeAcceptProposalForBookingCommand.mockResolvedValue({ replayed: false, value: accepted })
    const presentation = {
      resolvePublicProposalBaseUrl: vi.fn(),
      seedAcceptedProposalBookingSession: vi.fn(),
    }
    const contribution = voyantToolContextContribution.contribute({
      request: request(db),
      context: { db },
      resources: { "proposals.presentation-runtime": presentation },
    })
    const acceptance = contribution.proposalAcceptance as {
      acceptProposalForBooking(id: string, policy: ToolHandlerActionPolicyContext): Promise<unknown>
    }

    await expect(acceptance.acceptProposalForBooking("version_1", admitted)).resolves.toEqual(
      accepted,
    )
    expect(executeAcceptProposalForBookingCommand).toHaveBeenCalledWith({
      db,
      context: expect.objectContaining({ organizationId: "org_1" }),
      admitted,
      proposalVersionId: "version_1",
      seedBookingSession: expect.any(Function),
    })
  })
})

function request(db: object) {
  return {
    req: { header: () => "request_1" },
    var: {
      db,
      userId: "user_1",
      callerType: "session",
      actor: "staff",
      organizationId: "org_1",
    },
  }
}
