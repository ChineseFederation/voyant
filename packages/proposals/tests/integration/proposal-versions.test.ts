// agent-quality: file-size exception -- owner: crm; existing coverage file stays co-located until a dedicated split preserves behavior and tests.
import { Hono } from "hono"
import { beforeAll, beforeEach, describe, expect, it } from "vitest"

import { proposalsRoutes } from "../../src/routes/index.js"

const DB_AVAILABLE = !!process.env.TEST_DATABASE_URL
const json = (body: Record<string, unknown>) => ({
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
})

describe.skipIf(!DB_AVAILABLE)("Proposal Version routes", () => {
  let app: Hono

  beforeAll(async () => {
    const { createTestDb, cleanupTestDb } = await import("@voyant-travel/db/test-utils")
    const db = createTestDb()
    await cleanupTestDb(db)

    app = new Hono()
    app.use("*", async (c, next) => {
      c.set("db" as never, db)
      c.set("userId" as never, "test-user-id")
      await next()
    })
    app.route("/", proposalsRoutes)
  })

  beforeEach(async () => {
    const { createTestDb, cleanupTestDb } = await import("@voyant-travel/db/test-utils")
    await cleanupTestDb(createTestDb())
  })

  async function seedProposal() {
    const pipRes = await app.request("/pipelines", {
      method: "POST",
      ...json({ name: `Pipeline-${Date.now()}` }),
    })
    const { data: pipeline } = await pipRes.json()

    const stgRes = await app.request("/stages", {
      method: "POST",
      ...json({ pipelineId: pipeline.id, name: `Stage-${Date.now()}` }),
    })
    const { data: stage } = await stgRes.json()

    const proposalRes = await app.request("/proposals", {
      method: "POST",
      ...json({ title: "Test Proposal", pipelineId: pipeline.id, stageId: stage.id }),
    })
    const { data: proposal } = await proposalRes.json()

    return { pipeline, stage, proposal }
  }

  async function seedProposalVersion() {
    const { proposal } = await seedProposal()
    const proposalVersionRes = await app.request(`/proposals/${proposal.id}/versions`, {
      method: "POST",
      ...json({ currency: "USD" }),
    })
    const { data: proposalVersion } = await proposalVersionRes.json()
    return { proposal, proposalVersion }
  }

  async function applySnapshot(proposalVersionId: string, overrides: Record<string, unknown> = {}) {
    return app.request(`/proposal-versions/${proposalVersionId}/trip-snapshot`, {
      method: "POST",
      ...json({
        tripSnapshotId: `trsn_${Date.now()}`,
        currency: "EUR",
        subtotalAmountCents: 10000,
        taxAmountCents: 900,
        totalAmountCents: 10900,
        lines: [
          {
            componentId: "trcp_123",
            description: "Airport transfer",
            quantity: 1,
            unitPriceAmountCents: 10000,
            totalAmountCents: 10900,
            currency: "EUR",
          },
        ],
        ...overrides,
      }),
    })
  }

  describe("Proposal Versions CRUD", () => {
    it("creates a proposal version", async () => {
      const { proposal } = await seedProposal()

      const res = await app.request(`/proposals/${proposal.id}/versions`, {
        method: "POST",
        ...json({ currency: "USD" }),
      })

      expect(res.status).toBe(201)
      const body = await res.json()
      expect(body.data.proposalId).toBe(proposal.id)
      expect(body.data.currency).toBe("USD")
      expect(body.data.status).toBe("draft")
      expect(body.data.totalAmountCents).toBe(0)
    })

    it("returns 404 when creating a proposal version for a missing proposal", async () => {
      const res = await app.request("/proposals/not_a_proposal_mr073yt6/versions", {
        method: "POST",
        ...json({ currency: "USD" }),
      })

      expect(res.status).toBe(404)
      const body = await res.json()
      expect(body.error).toBe("Proposal not found")
    })

    it("lists proposal versions filtered by proposalId", async () => {
      const { proposal } = await seedProposal()
      await app.request(`/proposals/${proposal.id}/versions`, {
        method: "POST",
        ...json({ currency: "USD" }),
      })
      await app.request(`/proposals/${proposal.id}/versions`, {
        method: "POST",
        ...json({ currency: "EUR" }),
      })

      const res = await app.request(`/proposal-versions?proposalId=${proposal.id}`, {
        method: "GET",
      })

      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.data.length).toBe(2)
    })

    it("gets a proposal version by id", async () => {
      const { proposal } = await seedProposal()
      const createRes = await app.request(`/proposals/${proposal.id}/versions`, {
        method: "POST",
        ...json({ currency: "GBP" }),
      })
      const { data: proposalVersion } = await createRes.json()

      const res = await app.request(`/proposal-versions/${proposalVersion.id}`, { method: "GET" })

      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.data.currency).toBe("GBP")
    })

    it("updates a proposal version", async () => {
      const { proposal } = await seedProposal()
      const createRes = await app.request(`/proposals/${proposal.id}/versions`, {
        method: "POST",
        ...json({ currency: "USD" }),
      })
      const { data: proposalVersion } = await createRes.json()

      const res = await app.request(`/proposal-versions/${proposalVersion.id}`, {
        method: "PATCH",
        ...json({ totalAmountCents: 50000 }),
      })

      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.data.status).toBe("draft")
      expect(body.data.totalAmountCents).toBe(50000)
    })

    it("rejects generic proposal version status updates", async () => {
      const { proposal } = await seedProposal()
      const createRes = await app.request(`/proposals/${proposal.id}/versions`, {
        method: "POST",
        ...json({ currency: "USD" }),
      })
      const { data: proposalVersion } = await createRes.json()

      const res = await app.request(`/proposal-versions/${proposalVersion.id}`, {
        method: "PATCH",
        ...json({ status: "sent" }),
      })

      expect(res.status).toBe(409)
      const body = await res.json()
      expect(body.error).toContain("lifecycle")
    })

    it("rejects creating non-draft proposal versions through the CRUD route", async () => {
      const { proposal } = await seedProposal()

      const res = await app.request(`/proposals/${proposal.id}/versions`, {
        method: "POST",
        ...json({ currency: "USD", status: "accepted" }),
      })

      expect(res.status).toBe(409)
      const body = await res.json()
      expect(body.error).toContain("draft")
    })

    it("snapshots a proposal using its explicit product currency", async () => {
      const { proposal } = await seedProposal()
      await app.request(`/proposals/${proposal.id}/products`, {
        method: "POST",
        ...json({
          nameSnapshot: "Hotel room",
          quantity: 2,
          unitPriceAmountCents: 15000,
          currency: "EUR",
        }),
      })

      const res = await app.request(`/proposals/${proposal.id}/versions/snapshot`, {
        method: "POST",
      })

      expect(res.status).toBe(201)
      const body = await res.json()
      expect(body.data.currency).toBe("EUR")
      expect(body.data.totalAmountCents).toBe(30000)

      const linesRes = await app.request(`/proposal-versions/${body.data.id}/lines`, {
        method: "GET",
      })
      const linesBody = await linesRes.json()
      expect(linesBody.data).toMatchObject([{ currency: "EUR", totalAmountCents: 30000 }])
    })

    it("snapshots blank product currency lines using the resolved version currency", async () => {
      const { proposal } = await seedProposal()
      await app.request(`/proposals/${proposal.id}/products`, {
        method: "POST",
        ...json({
          nameSnapshot: "Hotel room",
          quantity: 2,
          unitPriceAmountCents: 15000,
          currency: "",
        }),
      })

      const res = await app.request(`/proposals/${proposal.id}/versions/snapshot`, {
        method: "POST",
      })

      expect(res.status).toBe(201)
      const body = await res.json()
      expect(body.data.currency).toBe("USD")

      const linesRes = await app.request(`/proposal-versions/${body.data.id}/lines`, {
        method: "GET",
      })
      const linesBody = await linesRes.json()
      expect(linesBody.data).toMatchObject([{ currency: "USD", totalAmountCents: 30000 }])
    })

    it("rejects snapshotting proposal products with mixed currencies", async () => {
      const { proposal } = await seedProposal()
      await app.request(`/proposals/${proposal.id}/products`, {
        method: "POST",
        ...json({
          nameSnapshot: "Hotel room",
          unitPriceAmountCents: 15000,
          currency: "EUR",
        }),
      })
      await app.request(`/proposals/${proposal.id}/products`, {
        method: "POST",
        ...json({
          nameSnapshot: "Tour",
          unitPriceAmountCents: 5000,
          currency: "GBP",
        }),
      })

      const res = await app.request(`/proposals/${proposal.id}/versions/snapshot`, {
        method: "POST",
      })

      expect(res.status).toBe(409)
      const body = await res.json()
      expect(body.error).toContain("single currency")
    })

    it("deletes a proposal version", async () => {
      const { proposal } = await seedProposal()
      const createRes = await app.request(`/proposals/${proposal.id}/versions`, {
        method: "POST",
        ...json({ currency: "USD" }),
      })
      const { data: proposalVersion } = await createRes.json()

      const res = await app.request(`/proposal-versions/${proposalVersion.id}`, {
        method: "DELETE",
      })

      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.success).toBe(true)
    })

    it("rejects deleting non-draft proposal versions", async () => {
      const { proposal } = await seedProposal()
      const createRes = await app.request(`/proposals/${proposal.id}/versions`, {
        method: "POST",
        ...json({ currency: "USD" }),
      })
      const { data: proposalVersion } = await createRes.json()
      await applySnapshot(proposalVersion.id)
      await app.request(`/proposal-versions/${proposalVersion.id}/send`, {
        method: "POST",
        ...json({ validUntil: "2099-01-01" }),
      })

      const res = await app.request(`/proposal-versions/${proposalVersion.id}`, {
        method: "DELETE",
      })

      expect(res.status).toBe(409)
      const body = await res.json()
      expect(body.error).toContain("draft")
    })

    it("returns 404 for non-existent proposal version", async () => {
      const res = await app.request("/proposal-versions/prvr_00000000000000000000000000", {
        method: "GET",
      })
      expect(res.status).toBe(404)
    })
  })

  describe("Proposal Version Lines", () => {
    it("applies a trip snapshot read model to a proposal version", async () => {
      const { proposalVersion } = await seedProposalVersion()

      const res = await app.request(`/proposal-versions/${proposalVersion.id}/trip-snapshot`, {
        method: "POST",
        ...json({
          tripSnapshotId: "trsn_snapshot_1",
          currency: "EUR",
          subtotalAmountCents: 10000,
          taxAmountCents: 900,
          totalAmountCents: 10900,
          lines: [
            {
              componentId: "trcp_123",
              description: "Airport transfer",
              quantity: 1,
              unitPriceAmountCents: 10000,
              totalAmountCents: 10900,
              currency: "EUR",
            },
          ],
        }),
      })

      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.data.proposalVersion.tripSnapshotId).toBe("trsn_snapshot_1")
      expect(body.data.proposalVersion.totalAmountCents).toBe(10900)
      expect(body.data.lines).toHaveLength(1)
      expect(body.data.lines[0].description).toBe("Airport transfer")
    })

    it("rejects applying a trip snapshot with mixed line currency", async () => {
      const { proposalVersion } = await seedProposalVersion()

      const res = await app.request(`/proposal-versions/${proposalVersion.id}/trip-snapshot`, {
        method: "POST",
        ...json({
          tripSnapshotId: "trsn_snapshot_1",
          currency: "EUR",
          subtotalAmountCents: 10000,
          taxAmountCents: 900,
          totalAmountCents: 10900,
          lines: [
            {
              componentId: "trcp_123",
              description: "Airport transfer",
              quantity: 1,
              unitPriceAmountCents: 10000,
              totalAmountCents: 10900,
              currency: "USD",
            },
          ],
        }),
      })

      expect(res.status).toBe(409)
      const body = await res.json()
      expect(body.error).toContain("currency")
    })

    it("rejects applying a trip snapshot to a non-draft proposal version", async () => {
      const { proposalVersion } = await seedProposalVersion()
      await applySnapshot(proposalVersion.id)
      await app.request(`/proposal-versions/${proposalVersion.id}/send`, {
        method: "POST",
        ...json({ validUntil: "2099-01-01" }),
      })

      const res = await app.request(`/proposal-versions/${proposalVersion.id}/trip-snapshot`, {
        method: "POST",
        ...json({
          tripSnapshotId: "trsn_snapshot_1",
          currency: "EUR",
          subtotalAmountCents: 10000,
          taxAmountCents: 900,
          totalAmountCents: 10900,
          lines: [],
        }),
      })

      expect(res.status).toBe(409)
      const body = await res.json()
      expect(body.error).toContain("draft")
    })

    it("sends a product-only proposal version when line currencies match", async () => {
      const { proposalVersion } = await seedProposalVersion()
      await app.request(`/proposal-versions/${proposalVersion.id}/lines`, {
        method: "POST",
        ...json({ description: "Hotel Transfer", quantity: 1, currency: "USD" }),
      })

      const res = await app.request(`/proposal-versions/${proposalVersion.id}/send`, {
        method: "POST",
        ...json({ validUntil: "2099-01-01" }),
      })

      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.data.status).toBe("sent")
    })

    it("sends, tracks view, and declines proposal versions through lifecycle routes", async () => {
      const { proposalVersion } = await seedProposalVersion()
      await applySnapshot(proposalVersion.id)

      const sendRes = await app.request(`/proposal-versions/${proposalVersion.id}/send`, {
        method: "POST",
        ...json({ validUntil: "2099-01-01" }),
      })
      expect(sendRes.status).toBe(200)
      const sendBody = await sendRes.json()
      expect(sendBody.data.status).toBe("sent")
      expect(sendBody.data.sentAt).not.toBeNull()
      expect(sendBody.data.validUntil).toBe("2099-01-01")

      const viewRes = await app.request(`/proposal-versions/${proposalVersion.id}/view`, {
        method: "POST",
        ...json({}),
      })
      expect(viewRes.status).toBe(200)
      const viewBody = await viewRes.json()
      expect(viewBody.data.status).toBe("sent")
      expect(viewBody.data.viewedAt).not.toBeNull()

      const declineRes = await app.request(`/proposal-versions/${proposalVersion.id}/decline`, {
        method: "POST",
        ...json({}),
      })
      expect(declineRes.status).toBe(200)
      const declineBody = await declineRes.json()
      expect(declineBody.data.status).toBe("declined")
      expect(declineBody.data.decidedAt).not.toBeNull()
    })

    it("accepts one sent proposal version, closes other open versions, and wins the proposal", async () => {
      const { proposal, proposalVersion } = await seedProposalVersion()
      await applySnapshot(proposalVersion.id)
      await app.request(`/proposal-versions/${proposalVersion.id}/send`, {
        method: "POST",
        ...json({ validUntil: "2099-01-01" }),
      })

      const alternativeRes = await app.request(`/proposals/${proposal.id}/versions`, {
        method: "POST",
        ...json({ currency: "EUR", label: "Alternative" }),
      })
      const { data: alternative } = await alternativeRes.json()
      await applySnapshot(alternative.id, { tripSnapshotId: "trsn_alternative" })
      await app.request(`/proposal-versions/${alternative.id}/send`, {
        method: "POST",
        ...json({ validUntil: "2099-01-01" }),
      })

      const draftRes = await app.request(`/proposals/${proposal.id}/versions`, {
        method: "POST",
        ...json({ currency: "EUR", label: "Draft after send" }),
      })
      const { data: draft } = await draftRes.json()

      const res = await app.request(`/proposal-versions/${proposalVersion.id}/accept`, {
        method: "POST",
        ...json({}),
      })

      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.data.proposalVersion.status).toBe("accepted")
      expect(body.data.proposalVersion.decidedAt).not.toBeNull()
      expect(body.data.proposal.status).toBe("won")
      expect(body.data.proposal.acceptedVersionId).toBe(proposalVersion.id)
      expect(body.data.proposal.valueAmountCents).toBe(10900)
      expect(body.data.proposal.valueCurrency).toBe("EUR")
      expect(body.data.closedProposalVersions.map((row: { id: string }) => row.id)).toEqual(
        expect.arrayContaining([alternative.id, draft.id]),
      )

      const alternativeGet = await app.request(`/proposal-versions/${alternative.id}`, {
        method: "GET",
      })
      const alternativeBody = await alternativeGet.json()
      expect(alternativeBody.data.status).toBe("declined")

      const draftGet = await app.request(`/proposal-versions/${draft.id}`, { method: "GET" })
      const draftBody = await draftGet.json()
      expect(draftBody.data.status).toBe("superseded")
    })

    it("rejects accepting a non-sent proposal version", async () => {
      const { proposalVersion } = await seedProposalVersion()

      const res = await app.request(`/proposal-versions/${proposalVersion.id}/accept`, {
        method: "POST",
        ...json({}),
      })

      expect(res.status).toBe(409)
      const body = await res.json()
      expect(body.error).toContain("sent")
    })

    it("expires sent proposal versions past validUntil", async () => {
      const { proposal } = await seedProposal()
      const proposalVersionRes = await app.request(`/proposals/${proposal.id}/versions`, {
        method: "POST",
        ...json({ currency: "USD" }),
      })
      const { data: proposalVersion } = await proposalVersionRes.json()
      await applySnapshot(proposalVersion.id, { tripSnapshotId: "trsn_expiring" })
      await app.request(`/proposal-versions/${proposalVersion.id}/send`, {
        method: "POST",
        ...json({ validUntil: "2099-01-01" }),
      })

      const res = await app.request("/proposal-versions/expire", {
        method: "POST",
        ...json({ now: "2100-01-02T00:00:00.000Z" }),
      })

      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.data.map((row: { id: string }) => row.id)).toContain(proposalVersion.id)
      const getRes = await app.request(`/proposal-versions/${proposalVersion.id}`, {
        method: "GET",
      })
      const getBody = await getRes.json()
      expect(getBody.data.status).toBe("expired")
      expect(getBody.data.decidedAt).not.toBeNull()
    })

    it("creates a proposal version line", async () => {
      const { proposalVersion } = await seedProposalVersion()

      const res = await app.request(`/proposal-versions/${proposalVersion.id}/lines`, {
        method: "POST",
        ...json({ description: "Hotel Transfer", quantity: 1, currency: "USD" }),
      })

      expect(res.status).toBe(201)
      const body = await res.json()
      expect(body.data.description).toBe("Hotel Transfer")
      expect(body.data.proposalVersionId).toBe(proposalVersion.id)
    })

    it("rejects proposal version lines in a different currency from the version", async () => {
      const { proposalVersion } = await seedProposalVersion()

      const createRes = await app.request(`/proposal-versions/${proposalVersion.id}/lines`, {
        method: "POST",
        ...json({ description: "Hotel Transfer", quantity: 1, currency: "EUR" }),
      })
      expect(createRes.status).toBe(409)

      const usdLineRes = await app.request(`/proposal-versions/${proposalVersion.id}/lines`, {
        method: "POST",
        ...json({ description: "Hotel Transfer", quantity: 1, currency: "USD" }),
      })
      const { data: line } = await usdLineRes.json()

      const updateRes = await app.request(`/proposal-version-lines/${line.id}`, {
        method: "PATCH",
        ...json({ currency: "EUR" }),
      })
      expect(updateRes.status).toBe(409)
    })

    it("lists proposal version lines", async () => {
      const { proposalVersion } = await seedProposalVersion()
      await app.request(`/proposal-versions/${proposalVersion.id}/lines`, {
        method: "POST",
        ...json({ description: "Line A", currency: "USD" }),
      })
      await app.request(`/proposal-versions/${proposalVersion.id}/lines`, {
        method: "POST",
        ...json({ description: "Line B", currency: "USD" }),
      })

      const res = await app.request(`/proposal-versions/${proposalVersion.id}/lines`, {
        method: "GET",
      })

      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.data.length).toBe(2)
    })

    it("updates a proposal version line", async () => {
      const { proposalVersion } = await seedProposalVersion()
      const createRes = await app.request(`/proposal-versions/${proposalVersion.id}/lines`, {
        method: "POST",
        ...json({ description: "Old", currency: "USD" }),
      })
      const { data: line } = await createRes.json()

      const res = await app.request(`/proposal-version-lines/${line.id}`, {
        method: "PATCH",
        ...json({ description: "Updated", quantity: 5 }),
      })

      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.data.description).toBe("Updated")
      expect(body.data.quantity).toBe(5)
    })

    it("deletes a proposal version line", async () => {
      const { proposalVersion } = await seedProposalVersion()
      const createRes = await app.request(`/proposal-versions/${proposalVersion.id}/lines`, {
        method: "POST",
        ...json({ description: "ToDelete", currency: "USD" }),
      })
      const { data: line } = await createRes.json()

      const res = await app.request(`/proposal-version-lines/${line.id}`, { method: "DELETE" })

      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.success).toBe(true)
    })

    it("rejects mutating proposal version lines after send", async () => {
      const { proposalVersion } = await seedProposalVersion()
      await applySnapshot(proposalVersion.id)
      await app.request(`/proposal-versions/${proposalVersion.id}/send`, {
        method: "POST",
        ...json({ validUntil: "2099-01-01" }),
      })

      const linesRes = await app.request(`/proposal-versions/${proposalVersion.id}/lines`, {
        method: "GET",
      })
      const linesBody = await linesRes.json()
      const line = linesBody.data[0]

      const createRes = await app.request(`/proposal-versions/${proposalVersion.id}/lines`, {
        method: "POST",
        ...json({ description: "Late add", currency: "USD" }),
      })
      expect(createRes.status).toBe(409)

      const updateRes = await app.request(`/proposal-version-lines/${line.id}`, {
        method: "PATCH",
        ...json({ description: "Late edit" }),
      })
      expect(updateRes.status).toBe(409)

      const deleteRes = await app.request(`/proposal-version-lines/${line.id}`, {
        method: "DELETE",
      })
      expect(deleteRes.status).toBe(409)
    })
  })
})
