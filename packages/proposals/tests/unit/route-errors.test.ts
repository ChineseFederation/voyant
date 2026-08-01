import { Hono } from "hono"
import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => {
  class PipelineDeleteConflictError extends Error {
    constructor(
      readonly pipelineId: string,
      readonly dependentProposalCount: number,
    ) {
      super(
        `Pipeline ${pipelineId} cannot be deleted because it has dependent ${dependentProposalCount} proposal(s)`,
      )
      this.name = "PipelineDeleteConflictError"
    }
  }

  class ProposalVersionConflictError extends Error {
    constructor(message: string) {
      super(message)
      this.name = "ProposalVersionConflictError"
    }
  }

  class ProposalVersionParentNotFoundError extends Error {
    constructor(proposalId: string) {
      super(`Proposal not found: ${proposalId}`)
      this.name = "ProposalVersionParentNotFoundError"
    }
  }

  return {
    PipelineDeleteConflictError,
    ProposalVersionConflictError,
    ProposalVersionParentNotFoundError,
    createProposalVersion: vi.fn(),
    deletePipeline: vi.fn(),
    updateProposalVersion: vi.fn(),
  }
})

vi.mock("../../src/service/index.js", () => ({
  PipelineDeleteConflictError: mocks.PipelineDeleteConflictError,
  proposalsService: {
    createProposalVersion: mocks.createProposalVersion,
    deletePipeline: mocks.deletePipeline,
    updateProposalVersion: mocks.updateProposalVersion,
  },
}))

vi.mock("../../src/service/proposal-versions.js", () => ({
  ProposalVersionConflictError: mocks.ProposalVersionConflictError,
  ProposalVersionParentNotFoundError: mocks.ProposalVersionParentNotFoundError,
}))

const { pipelineRoutes } = await import("../../src/routes/pipelines.js")
const { proposalVersionRoutes } = await import("../../src/routes/proposal-versions.js")

const json = (body: Record<string, unknown>) => ({
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
})

function makeApp() {
  const app = new Hono()
  app.use("*", async (c, next) => {
    c.set("db" as never, {} as never)
    c.set("userId" as never, "test-user-id")
    await next()
  })
  app.route("/", pipelineRoutes)
  app.route("/", proposalVersionRoutes)
  return app
}

describe("Proposals route errors", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.updateProposalVersion.mockImplementation(
      async (
        _db: unknown,
        id: string,
        data: { status?: string; label?: string; notes?: string },
      ) => {
        if (data.status !== undefined) {
          throw new mocks.ProposalVersionConflictError(
            "Proposal Version status changes must use lifecycle routes",
          )
        }
        return {
          id,
          proposalId: "prps_123",
          label: data.label ?? null,
          status: "draft",
          notes: data.notes ?? null,
        }
      },
    )
  })

  it("returns 404 when creating a proposal version for a missing proposal", async () => {
    mocks.createProposalVersion.mockRejectedValueOnce(
      new mocks.ProposalVersionParentNotFoundError("not_a_proposal_mr073yt6"),
    )

    const res = await makeApp().request("/proposals/not_a_proposal_mr073yt6/versions", {
      method: "POST",
      ...json({ currency: "USD" }),
    })

    expect(res.status).toBe(404)
    await expect(res.json()).resolves.toEqual({ error: "Proposal not found" })
  })

  it("returns 409 when deleting a pipeline with dependent records", async () => {
    mocks.deletePipeline.mockRejectedValueOnce(new mocks.PipelineDeleteConflictError("pipe_123", 1))

    const res = await makeApp().request("/pipelines/pipe_123", { method: "DELETE" })

    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toContain("dependent")
    expect(body.error).toContain("proposal")
  })

  it.each([
    ["notes", { notes: "Notes patch only" }],
    ["label", { label: "Updated label" }],
    ["empty", {}],
  ])("allows draft proposal version %s PATCH without treating status as changed", async (_name, body) => {
    const res = await makeApp().request("/proposal-versions/prvr_123", {
      method: "PATCH",
      ...json(body),
    })

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toMatchObject({
      data: { id: "prvr_123", status: "draft" },
    })
    expect(mocks.updateProposalVersion).toHaveBeenCalledWith({}, "prvr_123", body)
  })

  it("returns 409 when a generic proposal version PATCH explicitly mutates status", async () => {
    const res = await makeApp().request("/proposal-versions/prvr_123", {
      method: "PATCH",
      ...json({ status: "sent" }),
    })

    expect(res.status).toBe(409)
    await expect(res.json()).resolves.toEqual({
      error: "Proposal Version status changes must use lifecycle routes",
    })
  })
})
