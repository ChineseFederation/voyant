import { handleApiError } from "@voyant-travel/hono"
import { Hono } from "hono"
import { beforeAll, beforeEach, describe, expect, it } from "vitest"

import { createProposalsRoutes } from "../../src/routes/index.js"

const DB_AVAILABLE = !!process.env.TEST_DATABASE_URL
const json = (body: Record<string, unknown>) => ({
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
})

describe.skipIf(!DB_AVAILABLE)("Proposal routes", () => {
  let app: Hono
  const existingPersonIds = new Set<string>()

  beforeAll(async () => {
    const { createTestDb, cleanupTestDb } = await import("@voyant-travel/db/test-utils")
    const db = createTestDb()
    await cleanupTestDb(db)

    app = new Hono()
    app.onError(handleApiError)
    app.use("*", async (c, next) => {
      c.set("db" as never, db)
      c.set("userId" as never, "test-user-id")
      await next()
    })
    app.route(
      "/",
      createProposalsRoutes({
        resolveParticipantPersonById: async (_db, personId) => existingPersonIds.has(personId),
      }),
    )
  })

  beforeEach(async () => {
    const { createTestDb, cleanupTestDb } = await import("@voyant-travel/db/test-utils")
    await cleanupTestDb(createTestDb())
    existingPersonIds.clear()
  })

  async function seedPipelineAndStage() {
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

    return { pipeline, stage }
  }

  async function seedProposal() {
    const { pipeline, stage } = await seedPipelineAndStage()
    const res = await app.request("/proposals", {
      method: "POST",
      ...json({ title: "Test Proposal", pipelineId: pipeline.id, stageId: stage.id }),
    })
    const { data: proposal } = await res.json()
    return { pipeline, stage, proposal }
  }

  describe("Proposals CRUD", () => {
    it("creates a proposal", async () => {
      const { pipeline, stage } = await seedPipelineAndStage()

      const res = await app.request("/proposals", {
        method: "POST",
        ...json({ title: "Big Deal", pipelineId: pipeline.id, stageId: stage.id }),
      })

      expect(res.status).toBe(201)
      const body = await res.json()
      expect(body.data.title).toBe("Big Deal")
      expect(body.data.status).toBe("open")
      expect(body.data.id).toBeTruthy()
    })

    it("lists proposals", async () => {
      await seedProposal()

      const res = await app.request("/proposals", { method: "GET" })

      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.data).toBeInstanceOf(Array)
      expect(body.total).toBeTypeOf("number")
    })

    it("gets a proposal by id", async () => {
      const { proposal } = await seedProposal()

      const res = await app.request(`/proposals/${proposal.id}`, { method: "GET" })

      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.data.title).toBe("Test Proposal")
    })

    it("updates a proposal", async () => {
      const { proposal } = await seedProposal()

      const res = await app.request(`/proposals/${proposal.id}`, {
        method: "PATCH",
        ...json({ title: "Updated Deal" }),
      })

      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.data.title).toBe("Updated Deal")
    })

    it("deletes a proposal", async () => {
      const { proposal } = await seedProposal()

      const res = await app.request(`/proposals/${proposal.id}`, { method: "DELETE" })

      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.success).toBe(true)
    })

    it("returns 404 for non-existent proposal", async () => {
      const res = await app.request("/proposals/prps_00000000000000000000000000", {
        method: "GET",
      })
      expect(res.status).toBe(404)
    })

    it("updates stageChangedAt when stageId changes", async () => {
      const { pipeline, proposal } = await seedProposal()

      const stg2Res = await app.request("/stages", {
        method: "POST",
        ...json({ pipelineId: pipeline.id, name: `Stage2-${Date.now()}` }),
      })
      const { data: stage2 } = await stg2Res.json()

      const res = await app.request(`/proposals/${proposal.id}`, {
        method: "PATCH",
        ...json({ stageId: stage2.id }),
      })

      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.data.stageId).toBe(stage2.id)
      expect(new Date(body.data.stageChangedAt).getTime()).toBeGreaterThan(
        new Date(proposal.stageChangedAt).getTime(),
      )
    })

    it("sets closedAt when status changes to won", async () => {
      const { proposal } = await seedProposal()

      const res = await app.request(`/proposals/${proposal.id}`, {
        method: "PATCH",
        ...json({ status: "won" }),
      })

      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.data.status).toBe("won")
      expect(body.data.closedAt).toBeTruthy()
    })

    it("clears closedAt when status changes back to open", async () => {
      const { proposal } = await seedProposal()

      await app.request(`/proposals/${proposal.id}`, {
        method: "PATCH",
        ...json({ status: "won" }),
      })

      const res = await app.request(`/proposals/${proposal.id}`, {
        method: "PATCH",
        ...json({ status: "open" }),
      })

      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.data.status).toBe("open")
      expect(body.data.closedAt).toBeNull()
    })
  })

  describe("Proposal Participants", () => {
    it("creates and lists participants", async () => {
      const { proposal } = await seedProposal()
      const personId = "pers_proposal_participant_1"
      existingPersonIds.add(personId)

      const createRes = await app.request(`/proposals/${proposal.id}/participants`, {
        method: "POST",
        ...json({ personId, role: "decision_maker" }),
      })

      expect(createRes.status).toBe(201)
      const createBody = await createRes.json()
      expect(createBody.data.personId).toBe(personId)
      expect(createBody.data.role).toBe("decision_maker")

      const listRes = await app.request(`/proposals/${proposal.id}/participants`, {
        method: "GET",
      })

      expect(listRes.status).toBe(200)
      const listBody = await listRes.json()
      expect(listBody.data.length).toBe(1)
    })

    it("rejects participants for missing people without inserting a row", async () => {
      const { proposal } = await seedProposal()
      const missingPersonId = "missing_mr073yt6"

      const createRes = await app.request(`/proposals/${proposal.id}/participants`, {
        method: "POST",
        ...json({ personId: missingPersonId, role: "traveler" }),
      })

      expect(createRes.status).toBe(400)
      const createBody = await createRes.json()
      expect(createBody.code).toBe("invalid_request")
      expect(createBody.error).toContain("personId")

      const listRes = await app.request(`/proposals/${proposal.id}/participants`, {
        method: "GET",
      })

      expect(listRes.status).toBe(200)
      const listBody = await listRes.json()
      expect(listBody.data).toEqual([])
    })

    it("deletes a participant", async () => {
      const { proposal } = await seedProposal()
      const personId = "pers_proposal_participant_2"
      existingPersonIds.add(personId)

      const createRes = await app.request(`/proposals/${proposal.id}/participants`, {
        method: "POST",
        ...json({ personId }),
      })
      const { data: participant } = await createRes.json()

      const res = await app.request(`/proposal-participants/${participant.id}`, {
        method: "DELETE",
      })

      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.success).toBe(true)
    })
  })

  describe("Proposal Products", () => {
    it("creates and lists products", async () => {
      const { proposal } = await seedProposal()

      const createRes = await app.request(`/proposals/${proposal.id}/products`, {
        method: "POST",
        ...json({ nameSnapshot: "Hotel Room", quantity: 2, unitPriceAmountCents: 15000 }),
      })

      expect(createRes.status).toBe(201)
      const createBody = await createRes.json()
      expect(createBody.data.nameSnapshot).toBe("Hotel Room")
      expect(createBody.data.quantity).toBe(2)

      const listRes = await app.request(`/proposals/${proposal.id}/products`, {
        method: "GET",
      })

      expect(listRes.status).toBe(200)
      const listBody = await listRes.json()
      expect(listBody.data.length).toBe(1)
    })

    it("updates a product", async () => {
      const { proposal } = await seedProposal()

      const createRes = await app.request(`/proposals/${proposal.id}/products`, {
        method: "POST",
        ...json({ nameSnapshot: "Old Name" }),
      })
      const { data: product } = await createRes.json()

      const res = await app.request(`/proposal-products/${product.id}`, {
        method: "PATCH",
        ...json({ nameSnapshot: "New Name" }),
      })

      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.data.nameSnapshot).toBe("New Name")
    })

    it("deletes a product", async () => {
      const { proposal } = await seedProposal()

      const createRes = await app.request(`/proposals/${proposal.id}/products`, {
        method: "POST",
        ...json({ nameSnapshot: "ToDelete" }),
      })
      const { data: product } = await createRes.json()

      const res = await app.request(`/proposal-products/${product.id}`, { method: "DELETE" })

      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.success).toBe(true)
    })
  })
})
