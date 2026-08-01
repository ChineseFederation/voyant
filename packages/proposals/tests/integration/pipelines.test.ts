import { Hono } from "hono"
import { beforeAll, beforeEach, describe, expect, it } from "vitest"

import { proposalsRoutes } from "../../src/routes/index.js"

const DB_AVAILABLE = !!process.env.TEST_DATABASE_URL
const json = (body: Record<string, unknown>) => ({
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
})

describe.skipIf(!DB_AVAILABLE)("Pipeline routes", () => {
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

  describe("Pipelines", () => {
    it("creates a pipeline", async () => {
      const res = await app.request("/pipelines", {
        method: "POST",
        ...json({ name: "Sales Pipeline" }),
      })

      expect(res.status).toBe(201)
      const body = await res.json()
      expect(body.data.name).toBe("Sales Pipeline")
      expect(body.data.entityType).toBe("proposal")
      expect(body.data.id).toBeTruthy()
    })

    it("lists pipelines", async () => {
      await app.request("/pipelines", { method: "POST", ...json({ name: "Pipeline A" }) })
      await app.request("/pipelines", { method: "POST", ...json({ name: "Pipeline B" }) })

      const res = await app.request("/pipelines", { method: "GET" })

      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.data).toBeInstanceOf(Array)
      expect(body.data.length).toBe(2)
      expect(body.total).toBe(2)
    })

    it("gets a pipeline by id", async () => {
      const createRes = await app.request("/pipelines", {
        method: "POST",
        ...json({ name: "GetMe" }),
      })
      const { data: created } = await createRes.json()

      const res = await app.request(`/pipelines/${created.id}`, { method: "GET" })

      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.data.name).toBe("GetMe")
    })

    it("updates a pipeline", async () => {
      const createRes = await app.request("/pipelines", {
        method: "POST",
        ...json({ name: "Old" }),
      })
      const { data: created } = await createRes.json()

      const res = await app.request(`/pipelines/${created.id}`, {
        method: "PATCH",
        ...json({ name: "Updated" }),
      })

      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.data.name).toBe("Updated")
    })

    it("deletes a pipeline", async () => {
      const createRes = await app.request("/pipelines", {
        method: "POST",
        ...json({ name: "ToDelete" }),
      })
      const { data: created } = await createRes.json()

      const res = await app.request(`/pipelines/${created.id}`, { method: "DELETE" })

      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.success).toBe(true)
    })

    it("deletes a pipeline with stages and no proposals", async () => {
      const pipelineRes = await app.request("/pipelines", {
        method: "POST",
        ...json({ name: "StageOnly" }),
      })
      const { data: pipeline } = await pipelineRes.json()
      const stageRes = await app.request("/stages", {
        method: "POST",
        ...json({ pipelineId: pipeline.id, name: "Unused Stage" }),
      })
      const { data: stage } = await stageRes.json()

      const res = await app.request(`/pipelines/${pipeline.id}`, { method: "DELETE" })

      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.success).toBe(true)

      const deletedStageRes = await app.request(`/stages/${stage.id}`, { method: "GET" })
      expect(deletedStageRes.status).toBe(404)
    })

    it("returns 409 when deleting a pipeline with dependent proposals", async () => {
      const pipelineRes = await app.request("/pipelines", {
        method: "POST",
        ...json({ name: "InUse" }),
      })
      const { data: pipeline } = await pipelineRes.json()
      const stageRes = await app.request("/stages", {
        method: "POST",
        ...json({ pipelineId: pipeline.id, name: "Qualified" }),
      })
      const { data: stage } = await stageRes.json()
      await app.request("/proposals", {
        method: "POST",
        ...json({ title: "Active Proposal", pipelineId: pipeline.id, stageId: stage.id }),
      })

      const res = await app.request(`/pipelines/${pipeline.id}`, { method: "DELETE" })

      expect(res.status).toBe(409)
      const body = await res.json()
      expect(body.error).toContain("dependent")
      expect(body.error).toContain("proposal")
    })

    it("returns 404 for non-existent pipeline", async () => {
      const res = await app.request("/pipelines/crm_pip_00000000000000000000000000", {
        method: "GET",
      })
      expect(res.status).toBe(404)
    })
  })

  describe("Stages", () => {
    async function createPipeline() {
      const res = await app.request("/pipelines", {
        method: "POST",
        ...json({ name: `Pipeline-${Date.now()}` }),
      })
      const { data } = await res.json()
      return data
    }

    it("creates a stage", async () => {
      const pipeline = await createPipeline()

      const res = await app.request("/stages", {
        method: "POST",
        ...json({ pipelineId: pipeline.id, name: "Prospecting" }),
      })

      expect(res.status).toBe(201)
      const body = await res.json()
      expect(body.data.name).toBe("Prospecting")
      expect(body.data.pipelineId).toBe(pipeline.id)
    })

    it("lists stages filtered by pipelineId", async () => {
      const pipeline = await createPipeline()
      await app.request("/stages", {
        method: "POST",
        ...json({ pipelineId: pipeline.id, name: "Stage A" }),
      })
      await app.request("/stages", {
        method: "POST",
        ...json({ pipelineId: pipeline.id, name: "Stage B" }),
      })

      const res = await app.request(`/stages?pipelineId=${pipeline.id}`, { method: "GET" })

      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.data.length).toBe(2)
    })

    it("gets a stage by id", async () => {
      const pipeline = await createPipeline()
      const createRes = await app.request("/stages", {
        method: "POST",
        ...json({ pipelineId: pipeline.id, name: "GetMe" }),
      })
      const { data: created } = await createRes.json()

      const res = await app.request(`/stages/${created.id}`, { method: "GET" })

      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.data.name).toBe("GetMe")
    })

    it("updates a stage", async () => {
      const pipeline = await createPipeline()
      const createRes = await app.request("/stages", {
        method: "POST",
        ...json({ pipelineId: pipeline.id, name: "Old" }),
      })
      const { data: created } = await createRes.json()

      const res = await app.request(`/stages/${created.id}`, {
        method: "PATCH",
        ...json({ name: "Updated" }),
      })

      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.data.name).toBe("Updated")
    })

    it("deletes a stage", async () => {
      const pipeline = await createPipeline()
      const createRes = await app.request("/stages", {
        method: "POST",
        ...json({ pipelineId: pipeline.id, name: "ToDelete" }),
      })
      const { data: created } = await createRes.json()

      const res = await app.request(`/stages/${created.id}`, { method: "DELETE" })

      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.success).toBe(true)
    })

    it("returns 404 for non-existent stage", async () => {
      const res = await app.request("/stages/crm_stg_00000000000000000000000000", {
        method: "GET",
      })
      expect(res.status).toBe(404)
    })
  })
})
