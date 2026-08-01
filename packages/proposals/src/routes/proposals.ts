import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi"
import type { EventBus } from "@voyant-travel/core"
import { openApiValidationHook } from "@voyant-travel/hono"
import { listResponseSchema } from "@voyant-travel/types"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"

import type { ProposalsRouteRuntime } from "../route-runtime.js"
import { proposalsService } from "../service/index.js"
import {
  insertProposalMediaSchema,
  insertProposalParticipantSchema,
  insertProposalProductSchema,
  insertProposalSchema,
  proposalListQuerySchema,
  updateProposalProductSchema,
  updateProposalSchema,
} from "../validation.js"
import {
  errorResponseSchema,
  idParamSchema,
  proposalMediaSchema,
  proposalParticipantSchema,
  proposalProductSchema,
  proposalSchema,
  successResponseSchema,
} from "./openapi-schemas.js"

type Env = {
  Variables: {
    db: PostgresJsDatabase
    userId?: string
    eventBus?: EventBus
  }
}

const jsonContent = <T extends z.ZodTypeAny>(schema: T) => ({
  content: { "application/json": { schema } },
})

const requiredJsonBody = <T extends z.ZodTypeAny>(schema: T) => ({
  body: { required: true, content: { "application/json": { schema } } },
})

// --- proposals -----------------------------------------------------------------

const listProposalsRoute = createRoute({
  method: "get",
  path: "/proposals",
  request: { query: proposalListQuerySchema },
  responses: {
    200: {
      description: "Paginated list of proposals",
      ...jsonContent(listResponseSchema(proposalSchema)),
    },
  },
})

const createProposalRoute = createRoute({
  method: "post",
  path: "/proposals",
  request: requiredJsonBody(insertProposalSchema),
  responses: {
    201: {
      description: "The created proposal",
      ...jsonContent(z.object({ data: proposalSchema })),
    },
    400: { description: "invalid_request", ...jsonContent(errorResponseSchema) },
  },
})

const getProposalRoute = createRoute({
  method: "get",
  path: "/proposals/{id}",
  request: { params: idParamSchema },
  responses: {
    200: { description: "A proposal by id", ...jsonContent(z.object({ data: proposalSchema })) },
    404: { description: "Proposal not found", ...jsonContent(errorResponseSchema) },
  },
})

const updateProposalRoute = createRoute({
  method: "patch",
  path: "/proposals/{id}",
  request: { params: idParamSchema, ...requiredJsonBody(updateProposalSchema) },
  responses: {
    200: {
      description: "The updated proposal",
      ...jsonContent(z.object({ data: proposalSchema })),
    },
    400: { description: "invalid_request", ...jsonContent(errorResponseSchema) },
    404: { description: "Proposal not found", ...jsonContent(errorResponseSchema) },
  },
})

const deleteProposalRoute = createRoute({
  method: "delete",
  path: "/proposals/{id}",
  request: { params: idParamSchema },
  responses: {
    200: { description: "Proposal deleted", ...jsonContent(successResponseSchema) },
    404: { description: "Proposal not found", ...jsonContent(errorResponseSchema) },
  },
})

const proposalsChild = new OpenAPIHono<Env>({ defaultHook: openApiValidationHook })
  .openapi(listProposalsRoute, async (c) =>
    c.json(await proposalsService.listProposals(c.get("db"), c.req.valid("query")), 200),
  )
  .openapi(createProposalRoute, async (c) => {
    const row = await proposalsService.createProposal(
      c.get("db"),
      c.req.valid("json"),
      c.get("userId") ?? null,
    )
    if (row) await c.get("eventBus")?.emit("proposal.created", { id: row.id })
    return c.json({ data: row! }, 201)
  })
  .openapi(getProposalRoute, async (c) => {
    const row = await proposalsService.getProposalById(c.get("db"), c.req.valid("param").id)
    return row ? c.json({ data: row }, 200) : c.json({ error: "Proposal not found" }, 404)
  })
  .openapi(updateProposalRoute, async (c) => {
    const row = await proposalsService.updateProposal(
      c.get("db"),
      c.req.valid("param").id,
      c.req.valid("json"),
      c.get("userId") ?? null,
    )
    if (!row) return c.json({ error: "Proposal not found" }, 404)
    await c.get("eventBus")?.emit("proposal.updated", { id: row.id })
    return c.json({ data: row }, 200)
  })
  .openapi(deleteProposalRoute, async (c) => {
    const row = await proposalsService.deleteProposal(c.get("db"), c.req.valid("param").id)
    if (!row) return c.json({ error: "Proposal not found" }, 404)
    await c.get("eventBus")?.emit("proposal.deleted", { id: row.id })
    return c.json({ success: true } as const, 200)
  })

// --- proposal participants -----------------------------------------------------

const listProposalParticipantsRoute = createRoute({
  method: "get",
  path: "/proposals/{id}/participants",
  request: { params: idParamSchema },
  responses: {
    200: {
      description: "Participants for a proposal",
      ...jsonContent(z.object({ data: z.array(proposalParticipantSchema) })),
    },
  },
})

const createProposalParticipantRoute = createRoute({
  method: "post",
  path: "/proposals/{id}/participants",
  request: { params: idParamSchema, ...requiredJsonBody(insertProposalParticipantSchema) },
  responses: {
    201: {
      description: "The created proposal participant",
      ...jsonContent(z.object({ data: proposalParticipantSchema })),
    },
    400: { description: "invalid_request", ...jsonContent(errorResponseSchema) },
  },
})

const deleteProposalParticipantRoute = createRoute({
  method: "delete",
  path: "/proposal-participants/{id}",
  request: { params: idParamSchema },
  responses: {
    200: { description: "Proposal participant deleted", ...jsonContent(successResponseSchema) },
    404: { description: "Proposal participant not found", ...jsonContent(errorResponseSchema) },
  },
})

function createParticipantsChild(runtime: ProposalsRouteRuntime = {}) {
  return new OpenAPIHono<Env>({ defaultHook: openApiValidationHook })
    .openapi(listProposalParticipantsRoute, async (c) =>
      c.json(
        {
          data: await proposalsService.listProposalParticipants(
            c.get("db"),
            c.req.valid("param").id,
          ),
        },
        200,
      ),
    )
    .openapi(createProposalParticipantRoute, async (c) => {
      const row = await proposalsService.createProposalParticipant(
        c.get("db"),
        c.req.valid("param").id,
        c.req.valid("json"),
        runtime,
      )
      return c.json({ data: row! }, 201)
    })
    .openapi(deleteProposalParticipantRoute, async (c) => {
      const row = await proposalsService.deleteProposalParticipant(
        c.get("db"),
        c.req.valid("param").id,
      )
      return row
        ? c.json({ success: true } as const, 200)
        : c.json({ error: "Proposal participant not found" }, 404)
    })
}

// --- proposal products ---------------------------------------------------------

const listProposalProductsRoute = createRoute({
  method: "get",
  path: "/proposals/{id}/products",
  request: { params: idParamSchema },
  responses: {
    200: {
      description: "Products for a proposal",
      ...jsonContent(z.object({ data: z.array(proposalProductSchema) })),
    },
  },
})

const createProposalProductRoute = createRoute({
  method: "post",
  path: "/proposals/{id}/products",
  request: { params: idParamSchema, ...requiredJsonBody(insertProposalProductSchema) },
  responses: {
    201: {
      description: "The created proposal product",
      ...jsonContent(z.object({ data: proposalProductSchema })),
    },
    400: { description: "invalid_request", ...jsonContent(errorResponseSchema) },
  },
})

const updateProposalProductRoute = createRoute({
  method: "patch",
  path: "/proposal-products/{id}",
  request: { params: idParamSchema, ...requiredJsonBody(updateProposalProductSchema) },
  responses: {
    200: {
      description: "The updated proposal product",
      ...jsonContent(z.object({ data: proposalProductSchema })),
    },
    400: { description: "invalid_request", ...jsonContent(errorResponseSchema) },
    404: { description: "Proposal product not found", ...jsonContent(errorResponseSchema) },
  },
})

const deleteProposalProductRoute = createRoute({
  method: "delete",
  path: "/proposal-products/{id}",
  request: { params: idParamSchema },
  responses: {
    200: { description: "Proposal product deleted", ...jsonContent(successResponseSchema) },
    404: { description: "Proposal product not found", ...jsonContent(errorResponseSchema) },
  },
})

const productsChild = new OpenAPIHono<Env>({ defaultHook: openApiValidationHook })
  .openapi(listProposalProductsRoute, async (c) =>
    c.json(
      { data: await proposalsService.listProposalProducts(c.get("db"), c.req.valid("param").id) },
      200,
    ),
  )
  .openapi(createProposalProductRoute, async (c) => {
    const row = await proposalsService.createProposalProduct(
      c.get("db"),
      c.req.valid("param").id,
      c.req.valid("json"),
      c.get("userId") ?? null,
    )
    return c.json({ data: row! }, 201)
  })
  .openapi(updateProposalProductRoute, async (c) => {
    const row = await proposalsService.updateProposalProduct(
      c.get("db"),
      c.req.valid("param").id,
      c.req.valid("json"),
      c.get("userId") ?? null,
    )
    return row ? c.json({ data: row }, 200) : c.json({ error: "Proposal product not found" }, 404)
  })
  .openapi(deleteProposalProductRoute, async (c) => {
    const row = await proposalsService.deleteProposalProduct(
      c.get("db"),
      c.req.valid("param").id,
      c.get("userId") ?? null,
    )
    return row
      ? c.json({ success: true } as const, 200)
      : c.json({ error: "Proposal product not found" }, 404)
  })

// --- proposal media ------------------------------------------------------------

const listProposalMediaRoute = createRoute({
  method: "get",
  path: "/proposals/{id}/media",
  request: { params: idParamSchema },
  responses: {
    200: {
      description: "Media for a proposal",
      ...jsonContent(z.object({ data: z.array(proposalMediaSchema) })),
    },
  },
})

const createProposalMediaRoute = createRoute({
  method: "post",
  path: "/proposals/{id}/media",
  request: { params: idParamSchema, ...requiredJsonBody(insertProposalMediaSchema) },
  responses: {
    201: {
      description: "The created proposal media",
      ...jsonContent(z.object({ data: proposalMediaSchema })),
    },
    400: { description: "invalid_request", ...jsonContent(errorResponseSchema) },
  },
})

const deleteProposalMediaRoute = createRoute({
  method: "delete",
  path: "/proposal-media/{id}",
  request: { params: idParamSchema },
  responses: {
    200: { description: "Proposal media deleted", ...jsonContent(successResponseSchema) },
    404: { description: "Proposal media not found", ...jsonContent(errorResponseSchema) },
  },
})

const mediaChild = new OpenAPIHono<Env>({ defaultHook: openApiValidationHook })
  .openapi(listProposalMediaRoute, async (c) =>
    c.json(
      { data: await proposalsService.listProposalMedia(c.get("db"), c.req.valid("param").id) },
      200,
    ),
  )
  .openapi(createProposalMediaRoute, async (c) => {
    const row = await proposalsService.createProposalMedia(
      c.get("db"),
      c.req.valid("param").id,
      c.req.valid("json"),
    )
    return c.json({ data: row! }, 201)
  })
  .openapi(deleteProposalMediaRoute, async (c) => {
    const row = await proposalsService.deleteProposalMedia(c.get("db"), c.req.valid("param").id)
    return row
      ? c.json({ success: true } as const, 200)
      : c.json({ error: "Proposal media not found" }, 404)
  })

export function createProposalRoutes(runtime: ProposalsRouteRuntime = {}) {
  return new OpenAPIHono<Env>({ defaultHook: openApiValidationHook })
    .route("/", proposalsChild)
    .route("/", createParticipantsChild(runtime))
    .route("/", productsChild)
    .route("/", mediaChild)
}

export const proposalRoutes = createProposalRoutes()
