import { Hono } from "hono"
import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => {
  class QuoteVersionConflictError extends Error {
    constructor(message: string) {
      super(message)
      this.name = "QuoteVersionConflictError"
    }
  }
  class TripsInvariantError extends Error {
    constructor(message: string) {
      super(message)
      this.name = "TripsInvariantError"
    }
  }
  return {
    QuoteVersionConflictError,
    TripsInvariantError,
    acceptQuoteVersion: vi.fn(),
    applyTripSnapshotToQuoteVersion: vi.fn(),
    declineQuoteVersion: vi.fn(),
    expireQuoteVersionIfPastValidUntil: vi.fn(),
    freezeTripSnapshot: vi.fn(),
    getQuoteVersionById: vi.fn(),
    getQuoteVersionProposal: vi.fn(),
    getTripSnapshotById: vi.fn(),
    listQuoteMedia: vi.fn(),
    markQuoteVersionViewed: vi.fn(),
    recordPublicProposalFeedback: vi.fn(),
    sendQuoteVersion: vi.fn(),
  }
})

vi.mock("../../src/service/index.js", () => ({
  QuoteVersionConflictError: mocks.QuoteVersionConflictError,
  quotesService: {
    acceptQuoteVersion: mocks.acceptQuoteVersion,
    applyTripSnapshotToQuoteVersion: mocks.applyTripSnapshotToQuoteVersion,
    declineQuoteVersion: mocks.declineQuoteVersion,
    expireQuoteVersionIfPastValidUntil: mocks.expireQuoteVersionIfPastValidUntil,
    getQuoteVersionById: mocks.getQuoteVersionById,
    getQuoteVersionProposal: mocks.getQuoteVersionProposal,
    listQuoteMedia: mocks.listQuoteMedia,
    markQuoteVersionViewed: mocks.markQuoteVersionViewed,
    sendQuoteVersion: mocks.sendQuoteVersion,
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
const quoteVersion = {
  id: "qver_123",
  quoteId: "quot_123",
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
  quote: { id: "quot_123", title: "Romania private tour", acceptedVersionId: null },
  quoteVersion,
  lines: [
    {
      id: "qtln_123",
      quoteVersionId: "qver_123",
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
    "/v1/admin/quote-versions",
    proposalRoutes.createQuoteProposalAdminRoutes(options as never) as never,
  )
  app.route(
    "/v1/public/proposals",
    proposalRoutes.createQuoteProposalPublicRoutes(options as never) as never,
  )
  app.route(
    "/v1/admin/trips",
    proposalRoutes.createQuoteVersionSnapshotRoutes(options as never) as never,
  )
  return app
}

describe("quote proposal routes", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.expireQuoteVersionIfPastValidUntil.mockResolvedValue(null)
    mocks.listQuoteMedia.mockResolvedValue([])
  })

  it("describes package-owned proposal and snapshot extensions", () => {
    const proposalExtension = proposalRoutes.createQuoteProposalApiExtension(options as never)
    const snapshotExtension = proposalRoutes.createQuoteVersionSnapshotApiExtension(options)
    expect(proposalExtension).toMatchObject({
      extension: { name: "proposal", module: "quote-versions" },
      publicPath: "proposals",
      anonymous: true,
    })
    expect(snapshotExtension).toMatchObject({
      extension: { name: "quote-version-snapshot", module: "trips" },
    })
  })

  it("builds root-relative and absolute proposal URLs", () => {
    expect(proposalRoutes.buildQuoteVersionProposalUrl("qver_123")).toBe("/proposal/qver_123")
    expect(
      proposalRoutes.buildQuoteVersionProposalUrl("qver 123", {
        baseUrl: "https://travel.example.com/",
      }),
    ).toBe("https://travel.example.com/proposal/qver%20123")
  })

  it("maps a stored trip snapshot proposal into quote-version lines", () => {
    expect(proposalRoutes.tripSnapshotToQuoteVersionApply(tripSnapshot as never)).toMatchObject({
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

  it("sends a quote version and returns the public proposal path", async () => {
    mocks.sendQuoteVersion.mockResolvedValue(quoteVersion)
    const response = await makeApp().request("/v1/admin/quote-versions/qver_123/send", {
      method: "POST",
      ...json({ validUntil: "2099-01-01" }),
    })
    expect(response.status).toBe(200)
    expect(mocks.sendQuoteVersion).toHaveBeenCalledWith(fakeDb, "qver_123", {
      validUntil: "2099-01-01",
    })
    await expect(response.json()).resolves.toMatchObject({
      data: { quoteVersion: { id: "qver_123" }, proposalUrl: "/proposal/qver_123" },
    })
  })

  it("returns public proposals without exposing mutation capability flags", async () => {
    mocks.getQuoteVersionProposal.mockResolvedValue(proposal)
    mocks.markQuoteVersionViewed.mockResolvedValue({ ...quoteVersion, viewedAt: "2026-06-09" })
    const response = await makeApp().request("/v1/public/proposals/qver_123")
    expect(response.status).toBe(200)
    const body = (await response.json()) as { data: Record<string, unknown> }
    expect(body).toMatchObject({
      data: {
        title: "Romania private tour",
        status: "sent",
        operator: { name: "Voyant Travel" },
        proposalUrl: "/proposal/qver_123",
      },
    })
    expect(body.data.acceptable).toBeUndefined()
  })

  it("records requested edits without accepting the proposal", async () => {
    mocks.getQuoteVersionProposal.mockResolvedValue(proposal)
    mocks.recordPublicProposalFeedback.mockResolvedValue({ id: "act_123" })
    const response = await makeApp().request("/v1/public/proposals/qver_123/request-edits", {
      method: "POST",
      ...json({ message: "Please add a private transfer." }),
    })
    expect(response.status).toBe(200)
    expect(mocks.acceptQuoteVersion).not.toHaveBeenCalled()
    await expect(response.json()).resolves.toEqual({
      data: { status: "sent", feedbackId: "act_123" },
    })
  })

  it("declines a sent proposal", async () => {
    mocks.getQuoteVersionProposal.mockResolvedValue(proposal)
    mocks.declineQuoteVersion.mockResolvedValue({ ...quoteVersion, status: "declined" })
    const response = await makeApp().request("/v1/public/proposals/qver_123/decline", {
      method: "POST",
    })
    expect(response.status).toBe(200)
    expect(mocks.declineQuoteVersion).toHaveBeenCalledWith(fakeDb, "qver_123")
  })

  it("accepts a snapshot-backed proposal with one Quotes-owned locked transaction", async () => {
    mocks.getQuoteVersionProposal.mockResolvedValue(proposal)
    mocks.getTripSnapshotById.mockResolvedValue(tripSnapshot)
    mocks.acceptQuoteVersion.mockResolvedValue({
      quote: { ...proposal.quote, acceptedVersionId: "qver_123" },
      quoteVersion: { ...quoteVersion, status: "accepted" },
      closedQuoteVersions: [],
    })
    const response = await makeApp().request("/v1/public/proposals/qver_123/accept", {
      method: "POST",
    })
    expect(response.status).toBe(200)
    expect(fakeDb.transaction).toHaveBeenCalledTimes(1)
    expect(fakeTx.execute).toHaveBeenCalledTimes(1)
    expect(mocks.getTripSnapshotById).toHaveBeenCalledWith(fakeTx, "trsn_123")
    expect(mocks.acceptQuoteVersion).toHaveBeenCalledWith(fakeTx, "qver_123", {})
    await expect(response.json()).resolves.toEqual({
      data: { status: "accepted", currency: "EUR", totalAmountCents: 10900 },
    })
  })

  it("accepts a product-only proposal without acquiring Trips mutation authority", async () => {
    const productOnly = {
      ...proposal,
      quoteVersion: { ...quoteVersion, tripSnapshotId: null },
    }
    mocks.getQuoteVersionProposal.mockResolvedValue(productOnly)
    mocks.acceptQuoteVersion.mockResolvedValue({
      quote: { ...proposal.quote, acceptedVersionId: "qver_123" },
      quoteVersion: { ...quoteVersion, tripSnapshotId: null, status: "accepted" },
      closedQuoteVersions: [],
    })
    const response = await makeApp().request("/v1/public/proposals/qver_123/accept", {
      method: "POST",
    })
    expect(response.status).toBe(200)
    expect(mocks.getTripSnapshotById).not.toHaveBeenCalled()
    expect(mocks.acceptQuoteVersion).toHaveBeenCalledWith(fakeTx, "qver_123", {})
  })

  it("serializes a losing concurrent accept before changing quote state", async () => {
    mocks.getQuoteVersionProposal.mockResolvedValueOnce(proposal).mockResolvedValueOnce({
      ...proposal,
      quoteVersion: { ...quoteVersion, status: "declined" },
    })
    const response = await makeApp().request("/v1/public/proposals/qver_123/accept", {
      method: "POST",
    })
    expect(response.status).toBe(409)
    expect(mocks.acceptQuoteVersion).not.toHaveBeenCalled()
    expect(mocks.getQuoteVersionProposal.mock.invocationCallOrder[0]).toBeLessThan(
      fakeTx.execute.mock.invocationCallOrder[0],
    )
    expect(fakeTx.execute.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.getQuoteVersionProposal.mock.invocationCallOrder[1],
    )
  })

  it("rejects a proposal that does not match its frozen snapshot", async () => {
    mocks.getQuoteVersionProposal.mockResolvedValue(proposal)
    mocks.getTripSnapshotById.mockResolvedValue({
      ...tripSnapshot,
      proposal: { ...tripSnapshot.proposal, totalAmountCents: 11000 },
    })
    const response = await makeApp().request("/v1/public/proposals/qver_123/accept", {
      method: "POST",
    })
    expect(response.status).toBe(409)
    expect(mocks.acceptQuoteVersion).not.toHaveBeenCalled()
  })

  it("freezes and applies a snapshot to a draft quote version", async () => {
    mocks.getQuoteVersionById.mockResolvedValue({ id: "qver_123", status: "draft" })
    mocks.freezeTripSnapshot.mockResolvedValue(tripSnapshot)
    mocks.applyTripSnapshotToQuoteVersion.mockResolvedValue({
      quoteVersion: { id: "qver_123", status: "draft", tripSnapshotId: "trsn_123" },
      lines: [],
    })
    const response = await makeApp().request(
      "/v1/admin/trips/trip_123/quote-versions/qver_123/snapshot",
      { method: "POST", ...json({ createdBy: "agent_1" }) },
    )
    expect(response.status).toBe(201)
    expect(mocks.freezeTripSnapshot).toHaveBeenCalledWith(fakeDb, {
      envelopeId: "trip_123",
      createdBy: "user_1",
    })
  })
})
