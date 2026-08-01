import { Hono } from "hono"
import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => {
  class ProposalVersionConflictError extends Error {
    constructor(message: string) {
      super(message)
      this.name = "ProposalVersionConflictError"
    }
  }
  class TripsInvariantError extends Error {
    constructor(message: string) {
      super(message)
      this.name = "TripsInvariantError"
    }
  }
  return {
    ProposalVersionConflictError,
    TripsInvariantError,
    acceptProposalVersion: vi.fn(),
    applyTripSnapshotToProposalVersion: vi.fn(),
    declineProposalVersion: vi.fn(),
    expireProposalVersionIfPastValidUntil: vi.fn(),
    freezeTripSnapshot: vi.fn(),
    getProposalVersionById: vi.fn(),
    getProposalVersionProposal: vi.fn(),
    getTripSnapshotById: vi.fn(),
    listProposalMedia: vi.fn(),
    markProposalVersionViewed: vi.fn(),
    recordPublicProposalFeedback: vi.fn(),
    sendProposalVersion: vi.fn(),
  }
})

vi.mock("../../src/service/index.js", () => ({
  ProposalVersionConflictError: mocks.ProposalVersionConflictError,
  proposalsService: {
    acceptProposalVersion: mocks.acceptProposalVersion,
    applyTripSnapshotToProposalVersion: mocks.applyTripSnapshotToProposalVersion,
    declineProposalVersion: mocks.declineProposalVersion,
    expireProposalVersionIfPastValidUntil: mocks.expireProposalVersionIfPastValidUntil,
    getProposalVersionById: mocks.getProposalVersionById,
    getProposalVersionProposal: mocks.getProposalVersionProposal,
    listProposalMedia: mocks.listProposalMedia,
    markProposalVersionViewed: mocks.markProposalVersionViewed,
    sendProposalVersion: mocks.sendProposalVersion,
  },
}))

vi.mock("@voyant-travel/trips", () => ({
  TripsInvariantError: mocks.TripsInvariantError,
  tripsService: {
    freezeTripSnapshot: mocks.freezeTripSnapshot,
    getTripSnapshotById: mocks.getTripSnapshotById,
  },
}))

const proposalRoutes = await import("../../src/proposal-routes.js")

const fakeTx = { execute: vi.fn(), name: "tx" }
const fakeDb = {
  name: "db",
  transaction: vi.fn(async (callback: (tx: typeof fakeTx) => Promise<unknown>) => callback(fakeTx)),
}
const operatorProfile = { name: "Voyant Travel" }
const options = {
  resolveDb: () => fakeDb as never,
  resolvePublicProposalBaseUrl: () => null,
  resolveOperatorProfile: vi.fn(async () => operatorProfile as unknown),
  recordPublicProposalFeedback: mocks.recordPublicProposalFeedback,
}
const proposalVersion = {
  id: "prvr_123",
  proposalId: "prps_123",
  status: "sent",
  tripSnapshotId: "trsn_123",
  validUntil: "2099-01-01",
  currency: "EUR",
  subtotalAmountCents: 10000,
  taxAmountCents: 900,
  totalAmountCents: 10900,
  viewedAt: null,
  decidedAt: null,
}
const proposal = {
  proposal: { id: "prps_123", title: "Romania private tour", acceptedVersionId: null },
  proposalVersion,
  lines: [
    {
      id: "prvl_123",
      proposalVersionId: "prvr_123",
      productId: "prod_123",
      supplierServiceId: null,
      description: "Airport transfer",
      quantity: 1,
      unitPriceAmountCents: 10000,
      totalAmountCents: 10900,
      currency: "EUR",
    },
  ],
}
const frozenEnvelope = {
  id: "trip_123",
  status: "priced",
  aggregateCurrency: "EUR",
  aggregateSubtotalAmountCents: 10000,
  aggregateTaxAmountCents: 900,
  aggregateTotalAmountCents: 10900,
}
const frozenComponent = {
  id: "trcp_123",
  envelopeId: "trip_123",
  sequence: 0,
  kind: "manual_service",
  status: "priced",
  title: "Airport transfer",
  entityModule: "products",
  entityId: "prod_123",
  sourceKind: "manual",
}
const tripSnapshot = {
  id: "trsn_123",
  envelopeId: "trip_123",
  currency: "EUR",
  subtotalAmountCents: 10000,
  taxAmountCents: 900,
  totalAmountCents: 10900,
  frozenEnvelope,
  frozenComponents: [frozenComponent],
  proposal: {
    envelopeId: "trip_123",
    currency: "EUR",
    subtotalAmountCents: 10000,
    taxAmountCents: 900,
    totalAmountCents: 10900,
    lines: [
      {
        componentId: "trcp_123",
        sequence: 0,
        kind: "manual_service",
        status: "priced",
        title: "Airport transfer",
        description: "Airport transfer",
        entityModule: "products",
        entityId: "prod_123",
        sourceKind: "manual",
        currency: "EUR",
        subtotalAmountCents: 10000,
        taxAmountCents: 900,
        totalAmountCents: 10900,
        warnings: [],
      },
    ],
  },
}

function json(body: Record<string, unknown>) {
  return {
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }
}

function makeApp() {
  const app = new Hono()
  app.use("*", async (c, next) => {
    c.set("db" as never, fakeDb as never)
    c.set("userId" as never, "user_1" as never)
    await next()
  })
  app.route(
    "/v1/admin/proposal-versions",
    proposalRoutes.createProposalPresentationAdminRoutes(options as never) as never,
  )
  app.route(
    "/v1/public/proposals",
    proposalRoutes.createProposalPresentationPublicRoutes(options as never) as never,
  )
  app.route(
    "/v1/admin/trips",
    proposalRoutes.createProposalVersionSnapshotRoutes(options as never) as never,
  )
  return app
}

describe("proposal routes", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.expireProposalVersionIfPastValidUntil.mockResolvedValue(null)
    mocks.listProposalMedia.mockResolvedValue([])
  })

  it("describes package-owned proposal and snapshot extensions", () => {
    const proposalExtension = proposalRoutes.createProposalPresentationApiExtension(
      options as never,
    )
    const snapshotExtension = proposalRoutes.createProposalVersionSnapshotApiExtension(options)
    expect(proposalExtension).toMatchObject({
      extension: { name: "proposal", module: "proposal-versions" },
      publicPath: "proposals",
      anonymous: true,
    })
    expect(snapshotExtension).toMatchObject({
      extension: { name: "proposal-version-snapshot", module: "trips" },
    })
  })

  it("builds root-relative and absolute proposal URLs", () => {
    expect(proposalRoutes.buildProposalVersionProposalUrl("prvr_123")).toBe("/proposal/prvr_123")
    expect(
      proposalRoutes.buildProposalVersionProposalUrl("prvr 123", {
        baseUrl: "https://travel.example.com/",
      }),
    ).toBe("https://travel.example.com/proposal/prvr%20123")
  })

  it("maps a stored trip snapshot proposal into proposal-version lines", () => {
    expect(proposalRoutes.tripSnapshotToProposalVersionApply(tripSnapshot as never)).toMatchObject({
      tripSnapshotId: "trsn_123",
      currency: "EUR",
      totalAmountCents: 10900,
      lines: [
        {
          componentId: "trcp_123",
          productId: "prod_123",
          description: "Airport transfer",
          currency: "EUR",
        },
      ],
    })
  })

  it("sends a proposal version and returns the public proposal path", async () => {
    mocks.sendProposalVersion.mockResolvedValue(proposalVersion)
    const response = await makeApp().request("/v1/admin/proposal-versions/prvr_123/send", {
      method: "POST",
      ...json({ validUntil: "2099-01-01" }),
    })
    expect(response.status).toBe(200)
    expect(mocks.sendProposalVersion).toHaveBeenCalledWith(fakeDb, "prvr_123", {
      validUntil: "2099-01-01",
    })
    await expect(response.json()).resolves.toMatchObject({
      data: { proposalVersion: { id: "prvr_123" }, proposalUrl: "/proposal/prvr_123" },
    })
  })

  it("returns public proposals without exposing mutation capability flags", async () => {
    mocks.getProposalVersionProposal.mockResolvedValue(proposal)
    mocks.markProposalVersionViewed.mockResolvedValue({
      ...proposalVersion,
      viewedAt: "2026-06-09",
    })
    const response = await makeApp().request("/v1/public/proposals/prvr_123")
    expect(response.status).toBe(200)
    const body = (await response.json()) as { data: Record<string, unknown> }
    expect(body).toMatchObject({
      data: {
        title: "Romania private tour",
        status: "sent",
        operator: { name: "Voyant Travel" },
        proposalUrl: "/proposal/prvr_123",
      },
    })
    expect(body.data.acceptable).toBeUndefined()
  })

  it("records requested edits without accepting the proposal", async () => {
    mocks.getProposalVersionProposal.mockResolvedValue(proposal)
    mocks.recordPublicProposalFeedback.mockResolvedValue({ id: "act_123" })
    const response = await makeApp().request("/v1/public/proposals/prvr_123/request-edits", {
      method: "POST",
      ...json({ message: "Please add a private transfer." }),
    })
    expect(response.status).toBe(200)
    expect(mocks.acceptProposalVersion).not.toHaveBeenCalled()
    await expect(response.json()).resolves.toEqual({
      data: { status: "sent", feedbackId: "act_123" },
    })
  })

  it("declines a sent proposal", async () => {
    mocks.getProposalVersionProposal.mockResolvedValue(proposal)
    mocks.declineProposalVersion.mockResolvedValue({ ...proposalVersion, status: "declined" })
    const response = await makeApp().request("/v1/public/proposals/prvr_123/decline", {
      method: "POST",
    })
    expect(response.status).toBe(200)
    expect(mocks.declineProposalVersion).toHaveBeenCalledWith(fakeDb, "prvr_123")
  })

  it("accepts a snapshot-backed proposal with one Proposals-owned locked transaction", async () => {
    mocks.getProposalVersionProposal.mockResolvedValue(proposal)
    mocks.getTripSnapshotById.mockResolvedValue(tripSnapshot)
    mocks.acceptProposalVersion.mockResolvedValue({
      proposal: { ...proposal.proposal, acceptedVersionId: "prvr_123" },
      proposalVersion: { ...proposalVersion, status: "accepted" },
      closedProposalVersions: [],
    })
    const response = await makeApp().request("/v1/public/proposals/prvr_123/accept", {
      method: "POST",
    })
    expect(response.status).toBe(200)
    expect(fakeDb.transaction).toHaveBeenCalledTimes(1)
    expect(fakeTx.execute).toHaveBeenCalledTimes(1)
    expect(mocks.getTripSnapshotById).toHaveBeenCalledWith(fakeTx, "trsn_123")
    expect(mocks.acceptProposalVersion).toHaveBeenCalledWith(fakeTx, "prvr_123", {})
    await expect(response.json()).resolves.toEqual({
      data: { status: "accepted", currency: "EUR", totalAmountCents: 10900 },
    })
  })

  it("accepts a product-only proposal without acquiring Trips mutation authority", async () => {
    const productOnly = {
      ...proposal,
      proposalVersion: { ...proposalVersion, tripSnapshotId: null },
    }
    mocks.getProposalVersionProposal.mockResolvedValue(productOnly)
    mocks.acceptProposalVersion.mockResolvedValue({
      proposal: { ...proposal.proposal, acceptedVersionId: "prvr_123" },
      proposalVersion: { ...proposalVersion, tripSnapshotId: null, status: "accepted" },
      closedProposalVersions: [],
    })
    const response = await makeApp().request("/v1/public/proposals/prvr_123/accept", {
      method: "POST",
    })
    expect(response.status).toBe(200)
    expect(mocks.getTripSnapshotById).not.toHaveBeenCalled()
    expect(mocks.acceptProposalVersion).toHaveBeenCalledWith(fakeTx, "prvr_123", {})
  })

  it("serializes a losing concurrent accept before changing proposal state", async () => {
    mocks.getProposalVersionProposal.mockResolvedValueOnce(proposal).mockResolvedValueOnce({
      ...proposal,
      proposalVersion: { ...proposalVersion, status: "declined" },
    })
    const response = await makeApp().request("/v1/public/proposals/prvr_123/accept", {
      method: "POST",
    })
    expect(response.status).toBe(409)
    expect(mocks.acceptProposalVersion).not.toHaveBeenCalled()
    expect(mocks.getProposalVersionProposal.mock.invocationCallOrder[0]).toBeLessThan(
      fakeTx.execute.mock.invocationCallOrder[0],
    )
    expect(fakeTx.execute.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.getProposalVersionProposal.mock.invocationCallOrder[1],
    )
  })

  it("rejects a proposal that does not match its frozen snapshot", async () => {
    mocks.getProposalVersionProposal.mockResolvedValue(proposal)
    mocks.getTripSnapshotById.mockResolvedValue({
      ...tripSnapshot,
      proposal: { ...tripSnapshot.proposal, totalAmountCents: 11000 },
    })
    const response = await makeApp().request("/v1/public/proposals/prvr_123/accept", {
      method: "POST",
    })
    expect(response.status).toBe(409)
    expect(mocks.acceptProposalVersion).not.toHaveBeenCalled()
  })

  it("freezes and applies a snapshot to a draft proposal version", async () => {
    mocks.getProposalVersionById.mockResolvedValue({ id: "prvr_123", status: "draft" })
    mocks.freezeTripSnapshot.mockResolvedValue(tripSnapshot)
    mocks.applyTripSnapshotToProposalVersion.mockResolvedValue({
      proposalVersion: { id: "prvr_123", status: "draft", tripSnapshotId: "trsn_123" },
      lines: [],
    })
    const response = await makeApp().request(
      "/v1/admin/trips/trip_123/proposal-versions/prvr_123/snapshot",
      { method: "POST", ...json({ createdBy: "agent_1" }) },
    )
    expect(response.status).toBe(201)
    expect(mocks.freezeTripSnapshot).toHaveBeenCalledWith(fakeDb, {
      envelopeId: "trip_123",
      createdBy: "user_1",
    })
  })
})
