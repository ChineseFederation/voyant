import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi"
import { openApiValidationHook } from "@voyant-travel/hono"
import { listResponseSchema } from "@voyant-travel/types"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"

import { PipelineDeleteConflictError, proposalsService } from "../service/index.js"
import {
  insertPipelineSchema,
  insertStageSchema,
  pipelineListQuerySchema,
  stageListQuerySchema,
  updatePipelineSchema,
  updateStageSchema,
} from "../validation.js"
import {
  errorResponseSchema,
  idParamSchema,
  pipelineSchema,
  stageSchema,
  successResponseSchema,
} from "./openapi-schemas.js"

type Env = {
  Variables: {
    db: PostgresJsDatabase
    userId?: string
  }
}

const jsonContent = <T extends z.ZodTypeAny>(schema: T) => ({
  content: { "application/json": { schema } },
})

const requiredJsonBody = <T extends z.ZodTypeAny>(schema: T) => ({
  body: { required: true, content: { "application/json": { schema } } },
})

// --- pipelines --------------------------------------------------------------

const listPipelinesRoute = createRoute({
  method: "get",
  path: "/pipelines",
  request: { query: pipelineListQuerySchema },
  responses: {
    200: {
      description: "Paginated list of pipelines",
      ...jsonContent(listResponseSchema(pipelineSchema)),
    },
  },
})

const createPipelineRoute = createRoute({
  method: "post",
  path: "/pipelines",
  request: requiredJsonBody(insertPipelineSchema),
  responses: {
    201: {
      description: "The created pipeline",
      ...jsonContent(z.object({ data: pipelineSchema })),
    },
    400: { description: "invalid_request", ...jsonContent(errorResponseSchema) },
  },
})

const getPipelineRoute = createRoute({
  method: "get",
  path: "/pipelines/{id}",
  request: { params: idParamSchema },
  responses: {
    200: { description: "A pipeline by id", ...jsonContent(z.object({ data: pipelineSchema })) },
    404: { description: "Pipeline not found", ...jsonContent(errorResponseSchema) },
  },
})

const updatePipelineRoute = createRoute({
  method: "patch",
  path: "/pipelines/{id}",
  request: { params: idParamSchema, ...requiredJsonBody(updatePipelineSchema) },
  responses: {
    200: {
      description: "The updated pipeline",
      ...jsonContent(z.object({ data: pipelineSchema })),
    },
    400: { description: "invalid_request", ...jsonContent(errorResponseSchema) },
    404: { description: "Pipeline not found", ...jsonContent(errorResponseSchema) },
  },
})

const deletePipelineRoute = createRoute({
  method: "delete",
  path: "/pipelines/{id}",
  request: { params: idParamSchema },
  responses: {
    200: { description: "Pipeline deleted", ...jsonContent(successResponseSchema) },
    404: { description: "Pipeline not found", ...jsonContent(errorResponseSchema) },
    409: { description: "Pipeline has dependent records", ...jsonContent(errorResponseSchema) },
  },
})

const pipelinesChild = new OpenAPIHono<Env>({ defaultHook: openApiValidationHook })
  .openapi(listPipelinesRoute, async (c) =>
    c.json(await proposalsService.listPipelines(c.get("db"), c.req.valid("query")), 200),
  )
  .openapi(createPipelineRoute, async (c) => {
    const row = await proposalsService.createPipeline(c.get("db"), c.req.valid("json"))
    return c.json({ data: row! }, 201)
  })
  .openapi(getPipelineRoute, async (c) => {
    const row = await proposalsService.getPipelineById(c.get("db"), c.req.valid("param").id)
    return row ? c.json({ data: row }, 200) : c.json({ error: "Pipeline not found" }, 404)
  })
  .openapi(updatePipelineRoute, async (c) => {
    const row = await proposalsService.updatePipeline(
      c.get("db"),
      c.req.valid("param").id,
      c.req.valid("json"),
    )
    return row ? c.json({ data: row }, 200) : c.json({ error: "Pipeline not found" }, 404)
  })
  .openapi(deletePipelineRoute, async (c) => {
    try {
      const row = await proposalsService.deletePipeline(c.get("db"), c.req.valid("param").id)
      return row
        ? c.json({ success: true } as const, 200)
        : c.json({ error: "Pipeline not found" }, 404)
    } catch (error) {
      if (error instanceof PipelineDeleteConflictError) {
        return c.json({ error: error.message }, 409)
      }
      throw error
    }
  })

// --- stages -----------------------------------------------------------------

const listStagesRoute = createRoute({
  method: "get",
  path: "/stages",
  request: { query: stageListQuerySchema },
  responses: {
    200: {
      description: "Paginated list of stages",
      ...jsonContent(listResponseSchema(stageSchema)),
    },
  },
})

const createStageRoute = createRoute({
  method: "post",
  path: "/stages",
  request: requiredJsonBody(insertStageSchema),
  responses: {
    201: { description: "The created stage", ...jsonContent(z.object({ data: stageSchema })) },
    400: { description: "invalid_request", ...jsonContent(errorResponseSchema) },
  },
})

const getStageRoute = createRoute({
  method: "get",
  path: "/stages/{id}",
  request: { params: idParamSchema },
  responses: {
    200: { description: "A stage by id", ...jsonContent(z.object({ data: stageSchema })) },
    404: { description: "Stage not found", ...jsonContent(errorResponseSchema) },
  },
})

const updateStageRoute = createRoute({
  method: "patch",
  path: "/stages/{id}",
  request: { params: idParamSchema, ...requiredJsonBody(updateStageSchema) },
  responses: {
    200: { description: "The updated stage", ...jsonContent(z.object({ data: stageSchema })) },
    400: { description: "invalid_request", ...jsonContent(errorResponseSchema) },
    404: { description: "Stage not found", ...jsonContent(errorResponseSchema) },
  },
})

const deleteStageRoute = createRoute({
  method: "delete",
  path: "/stages/{id}",
  request: { params: idParamSchema },
  responses: {
    200: { description: "Stage deleted", ...jsonContent(successResponseSchema) },
    404: { description: "Stage not found", ...jsonContent(errorResponseSchema) },
  },
})

const stagesChild = new OpenAPIHono<Env>({ defaultHook: openApiValidationHook })
  .openapi(listStagesRoute, async (c) =>
    c.json(await proposalsService.listStages(c.get("db"), c.req.valid("query")), 200),
  )
  .openapi(createStageRoute, async (c) => {
    const row = await proposalsService.createStage(c.get("db"), c.req.valid("json"))
    return c.json({ data: row! }, 201)
  })
  .openapi(getStageRoute, async (c) => {
    const row = await proposalsService.getStageById(c.get("db"), c.req.valid("param").id)
    return row ? c.json({ data: row }, 200) : c.json({ error: "Stage not found" }, 404)
  })
  .openapi(updateStageRoute, async (c) => {
    const row = await proposalsService.updateStage(
      c.get("db"),
      c.req.valid("param").id,
      c.req.valid("json"),
    )
    return row ? c.json({ data: row }, 200) : c.json({ error: "Stage not found" }, 404)
  })
  .openapi(deleteStageRoute, async (c) => {
    const row = await proposalsService.deleteStage(c.get("db"), c.req.valid("param").id)
    return row ? c.json({ success: true } as const, 200) : c.json({ error: "Stage not found" }, 404)
  })

export const pipelineRoutes = new OpenAPIHono<Env>({ defaultHook: openApiValidationHook })
  .route("/", pipelinesChild)
  .route("/", stagesChild)
