import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi"
import { openApiValidationHook, parseOptionalJsonBody } from "@voyant-travel/hono"
import { listResponseSchema } from "@voyant-travel/types"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"

import { proposalsService } from "../service/index.js"
import {
  ProposalVersionConflictError,
  ProposalVersionParentNotFoundError,
} from "../service/proposal-versions.js"
import {
  acceptProposalVersionSchema,
  applyTripSnapshotToProposalVersionSchema,
  declineProposalVersionSchema,
  expireProposalVersionsSchema,
  insertProposalVersionLineSchema,
  insertProposalVersionSchema,
  proposalVersionListQuerySchema,
  sendProposalVersionSchema,
  updateProposalVersionLineSchema,
  updateProposalVersionSchema,
} from "../validation.js"
import {
  acceptProposalVersionResultSchema,
  applyTripSnapshotResultSchema,
  errorResponseSchema,
  idParamSchema,
  proposalVersionLineSchema,
  proposalVersionSchema,
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

const validityBodySchema = z.object({ validUntil: z.string().date().nullable() })

// --- versions: core CRUD + lifecycle entry points ---------------------------

const listProposalVersionsRoute = createRoute({
  method: "get",
  path: "/proposal-versions",
  request: { query: proposalVersionListQuerySchema },
  responses: {
    200: {
      description: "Paginated list of proposal versions",
      ...jsonContent(listResponseSchema(proposalVersionSchema)),
    },
  },
})

const createProposalVersionRoute = createRoute({
  method: "post",
  path: "/proposals/{id}/versions",
  request: {
    params: idParamSchema,
    ...requiredJsonBody(insertProposalVersionSchema.omit({ proposalId: true })),
  },
  responses: {
    201: {
      description: "The created proposal version",
      ...jsonContent(z.object({ data: proposalVersionSchema })),
    },
    400: { description: "invalid_request", ...jsonContent(errorResponseSchema) },
    404: { description: "Proposal not found", ...jsonContent(errorResponseSchema) },
    409: { description: "Proposal version conflict", ...jsonContent(errorResponseSchema) },
  },
})

const setProposalVersionValidityRoute = createRoute({
  method: "patch",
  path: "/proposal-versions/{id}/validity",
  request: { params: idParamSchema, ...requiredJsonBody(validityBodySchema) },
  responses: {
    200: {
      description: "The proposal version with updated validity",
      ...jsonContent(z.object({ data: proposalVersionSchema })),
    },
    400: { description: "invalid_request", ...jsonContent(errorResponseSchema) },
    404: { description: "Proposal version not found", ...jsonContent(errorResponseSchema) },
  },
})

const snapshotProposalVersionRoute = createRoute({
  method: "post",
  path: "/proposals/{id}/versions/snapshot",
  request: { params: idParamSchema },
  responses: {
    201: {
      description: "The created proposal version snapshot",
      ...jsonContent(z.object({ data: proposalVersionSchema })),
    },
    404: { description: "Proposal not found", ...jsonContent(errorResponseSchema) },
    409: { description: "Proposal version conflict", ...jsonContent(errorResponseSchema) },
  },
})

const expireProposalVersionsRoute = createRoute({
  method: "post",
  path: "/proposal-versions/expire",
  description:
    "Expire every sent proposal version past its validity date. Accepts an optional " +
    "`now` JSON body; an empty or absent body is accepted. The body is parsed in " +
    "the handler (not as a declared OpenAPI request body) because Hono's JSON " +
    "validator would reject a zero-length `application/json` request before the " +
    "handler runs.",
  responses: {
    200: {
      description: "The expired proposal versions",
      ...jsonContent(z.object({ data: z.array(proposalVersionSchema) })),
    },
  },
})

const getProposalVersionRoute = createRoute({
  method: "get",
  path: "/proposal-versions/{id}",
  request: { params: idParamSchema },
  responses: {
    200: {
      description: "A proposal version by id",
      ...jsonContent(z.object({ data: proposalVersionSchema })),
    },
    404: { description: "Proposal version not found", ...jsonContent(errorResponseSchema) },
  },
})

const updateProposalVersionRoute = createRoute({
  method: "patch",
  path: "/proposal-versions/{id}",
  request: { params: idParamSchema, ...requiredJsonBody(updateProposalVersionSchema) },
  responses: {
    200: {
      description: "The updated proposal version",
      ...jsonContent(z.object({ data: proposalVersionSchema })),
    },
    400: { description: "invalid_request", ...jsonContent(errorResponseSchema) },
    404: { description: "Proposal version not found", ...jsonContent(errorResponseSchema) },
    409: { description: "Proposal version conflict", ...jsonContent(errorResponseSchema) },
  },
})

const deleteProposalVersionRoute = createRoute({
  method: "delete",
  path: "/proposal-versions/{id}",
  request: { params: idParamSchema },
  responses: {
    200: { description: "Proposal version deleted", ...jsonContent(successResponseSchema) },
    404: { description: "Proposal version not found", ...jsonContent(errorResponseSchema) },
    409: { description: "Proposal version conflict", ...jsonContent(errorResponseSchema) },
  },
})

const versionsCoreChild = new OpenAPIHono<Env>({ defaultHook: openApiValidationHook })
  .openapi(listProposalVersionsRoute, async (c) =>
    c.json(await proposalsService.listProposalVersions(c.get("db"), c.req.valid("query")), 200),
  )
  .openapi(createProposalVersionRoute, async (c) => {
    try {
      const body = c.req.valid("json")
      const row = await proposalsService.createProposalVersion(c.get("db"), {
        ...body,
        proposalId: c.req.valid("param").id,
      })
      return c.json({ data: row! }, 201)
    } catch (error) {
      if (error instanceof ProposalVersionConflictError) {
        return c.json({ error: error.message }, 409)
      }
      if (error instanceof ProposalVersionParentNotFoundError) {
        return c.json({ error: "Proposal not found" }, 404)
      }
      throw error
    }
  })
  .openapi(setProposalVersionValidityRoute, async (c) => {
    const row = await proposalsService.setProposalVersionValidUntil(
      c.get("db"),
      c.req.valid("param").id,
      c.req.valid("json").validUntil,
    )
    return row ? c.json({ data: row }, 200) : c.json({ error: "Proposal version not found" }, 404)
  })
  .openapi(snapshotProposalVersionRoute, async (c) => {
    try {
      const version = await proposalsService.createVersionSnapshotFromProposal(
        c.get("db"),
        c.req.valid("param").id,
      )
      return version ? c.json({ data: version }, 201) : c.json({ error: "Proposal not found" }, 404)
    } catch (error) {
      if (error instanceof ProposalVersionConflictError) {
        return c.json({ error: error.message }, 409)
      }
      throw error
    }
  })
  .openapi(expireProposalVersionsRoute, async (c) =>
    c.json(
      {
        data: await proposalsService.expireProposalVersions(
          c.get("db"),
          await parseOptionalJsonBody(c, expireProposalVersionsSchema),
        ),
      },
      200,
    ),
  )
  .openapi(getProposalVersionRoute, async (c) => {
    const row = await proposalsService.getProposalVersionById(c.get("db"), c.req.valid("param").id)
    return row ? c.json({ data: row }, 200) : c.json({ error: "Proposal version not found" }, 404)
  })
  .openapi(updateProposalVersionRoute, async (c) => {
    try {
      const row = await proposalsService.updateProposalVersion(
        c.get("db"),
        c.req.valid("param").id,
        c.req.valid("json"),
      )
      return row ? c.json({ data: row }, 200) : c.json({ error: "Proposal version not found" }, 404)
    } catch (error) {
      if (error instanceof ProposalVersionConflictError) {
        return c.json({ error: error.message }, 409)
      }
      throw error
    }
  })
  .openapi(deleteProposalVersionRoute, async (c) => {
    try {
      const row = await proposalsService.deleteProposalVersion(c.get("db"), c.req.valid("param").id)
      return row
        ? c.json({ success: true } as const, 200)
        : c.json({ error: "Proposal version not found" }, 404)
    } catch (error) {
      if (error instanceof ProposalVersionConflictError) {
        return c.json({ error: error.message }, 409)
      }
      throw error
    }
  })

// --- versions: lifecycle transitions ----------------------------------------

const applyTripSnapshotRoute = createRoute({
  method: "post",
  path: "/proposal-versions/{id}/trip-snapshot",
  request: { params: idParamSchema, ...requiredJsonBody(applyTripSnapshotToProposalVersionSchema) },
  responses: {
    200: {
      description: "The proposal version with the applied trip snapshot",
      ...jsonContent(z.object({ data: applyTripSnapshotResultSchema })),
    },
    400: { description: "invalid_request", ...jsonContent(errorResponseSchema) },
    404: { description: "Proposal version not found", ...jsonContent(errorResponseSchema) },
    409: { description: "Proposal version conflict", ...jsonContent(errorResponseSchema) },
  },
})

const sendProposalVersionRoute = createRoute({
  method: "post",
  path: "/proposal-versions/{id}/send",
  "x-voyant-api-id": "@voyant-travel/proposals#presentation-extension.api.admin",
  description:
    "Send a proposal version for client review. Accepts an optional `validUntil` JSON " +
    "body; an empty or absent body is accepted. The body is parsed in the handler " +
    "(not as a declared OpenAPI request body) because Hono's JSON validator would " +
    "reject a zero-length `application/json` request before the handler runs.",
  request: { params: idParamSchema },
  responses: {
    200: {
      description: "The sent proposal version",
      ...jsonContent(z.object({ data: proposalVersionSchema })),
    },
    404: { description: "Proposal version not found", ...jsonContent(errorResponseSchema) },
    409: { description: "Proposal version conflict", ...jsonContent(errorResponseSchema) },
  },
})

const viewProposalVersionRoute = createRoute({
  method: "post",
  path: "/proposal-versions/{id}/view",
  request: { params: idParamSchema },
  responses: {
    200: {
      description: "The proposal version marked as viewed",
      ...jsonContent(z.object({ data: proposalVersionSchema })),
    },
    404: { description: "Proposal version not found", ...jsonContent(errorResponseSchema) },
  },
})

const acceptProposalVersionRoute = createRoute({
  method: "post",
  path: "/proposal-versions/{id}/accept",
  description:
    "Accept a sent proposal version. Accepts an optional JSON body; an empty or absent " +
    "body is accepted. The body is parsed in the handler (not as a declared OpenAPI " +
    "request body) because Hono's JSON validator would reject a zero-length " +
    "`application/json` request before the handler runs.",
  request: { params: idParamSchema },
  responses: {
    200: {
      description: "The accepted proposal version and its proposal",
      ...jsonContent(z.object({ data: acceptProposalVersionResultSchema })),
    },
    404: { description: "Proposal version not found", ...jsonContent(errorResponseSchema) },
    409: { description: "Proposal version conflict", ...jsonContent(errorResponseSchema) },
  },
})

const declineProposalVersionRoute = createRoute({
  method: "post",
  path: "/proposal-versions/{id}/decline",
  description:
    "Decline a sent proposal version. Accepts an optional JSON body; an empty or absent " +
    "body is accepted. The body is parsed in the handler (not as a declared OpenAPI " +
    "request body) because Hono's JSON validator would reject a zero-length " +
    "`application/json` request before the handler runs.",
  request: { params: idParamSchema },
  responses: {
    200: {
      description: "The declined proposal version",
      ...jsonContent(z.object({ data: proposalVersionSchema })),
    },
    404: { description: "Proposal version not found", ...jsonContent(errorResponseSchema) },
    409: { description: "Proposal version conflict", ...jsonContent(errorResponseSchema) },
  },
})

const versionsLifecycleChild = new OpenAPIHono<Env>({ defaultHook: openApiValidationHook })
  .openapi(applyTripSnapshotRoute, async (c) => {
    try {
      const row = await proposalsService.applyTripSnapshotToProposalVersion(
        c.get("db"),
        c.req.valid("param").id,
        c.req.valid("json"),
      )
      return row ? c.json({ data: row }, 200) : c.json({ error: "Proposal version not found" }, 404)
    } catch (error) {
      if (error instanceof ProposalVersionConflictError) {
        return c.json({ error: error.message }, 409)
      }
      throw error
    }
  })
  .openapi(sendProposalVersionRoute, async (c) => {
    try {
      const row = await proposalsService.sendProposalVersion(
        c.get("db"),
        c.req.valid("param").id,
        await parseOptionalJsonBody(c, sendProposalVersionSchema),
      )
      return row ? c.json({ data: row }, 200) : c.json({ error: "Proposal version not found" }, 404)
    } catch (error) {
      if (error instanceof ProposalVersionConflictError) {
        return c.json({ error: error.message }, 409)
      }
      throw error
    }
  })
  .openapi(viewProposalVersionRoute, async (c) => {
    const row = await proposalsService.markProposalVersionViewed(
      c.get("db"),
      c.req.valid("param").id,
    )
    return row ? c.json({ data: row }, 200) : c.json({ error: "Proposal version not found" }, 404)
  })
  .openapi(acceptProposalVersionRoute, async (c) => {
    try {
      const row = await proposalsService.acceptProposalVersion(
        c.get("db"),
        c.req.valid("param").id,
        await parseOptionalJsonBody(c, acceptProposalVersionSchema),
      )
      return row ? c.json({ data: row }, 200) : c.json({ error: "Proposal version not found" }, 404)
    } catch (error) {
      if (error instanceof ProposalVersionConflictError) {
        return c.json({ error: error.message }, 409)
      }
      throw error
    }
  })
  .openapi(declineProposalVersionRoute, async (c) => {
    try {
      const row = await proposalsService.declineProposalVersion(
        c.get("db"),
        c.req.valid("param").id,
        await parseOptionalJsonBody(c, declineProposalVersionSchema),
      )
      return row ? c.json({ data: row }, 200) : c.json({ error: "Proposal version not found" }, 404)
    } catch (error) {
      if (error instanceof ProposalVersionConflictError) {
        return c.json({ error: error.message }, 409)
      }
      throw error
    }
  })

// --- version lines ----------------------------------------------------------

const listProposalVersionLinesRoute = createRoute({
  method: "get",
  path: "/proposal-versions/{id}/lines",
  request: { params: idParamSchema },
  responses: {
    200: {
      description: "Lines for a proposal version",
      ...jsonContent(z.object({ data: z.array(proposalVersionLineSchema) })),
    },
  },
})

const createProposalVersionLineRoute = createRoute({
  method: "post",
  path: "/proposal-versions/{id}/lines",
  request: { params: idParamSchema, ...requiredJsonBody(insertProposalVersionLineSchema) },
  responses: {
    201: {
      description: "The created proposal version line",
      ...jsonContent(z.object({ data: proposalVersionLineSchema })),
    },
    400: { description: "invalid_request", ...jsonContent(errorResponseSchema) },
    404: { description: "Proposal version not found", ...jsonContent(errorResponseSchema) },
    409: { description: "Proposal version conflict", ...jsonContent(errorResponseSchema) },
  },
})

const updateProposalVersionLineRoute = createRoute({
  method: "patch",
  path: "/proposal-version-lines/{id}",
  request: { params: idParamSchema, ...requiredJsonBody(updateProposalVersionLineSchema) },
  responses: {
    200: {
      description: "The updated proposal version line",
      ...jsonContent(z.object({ data: proposalVersionLineSchema })),
    },
    400: { description: "invalid_request", ...jsonContent(errorResponseSchema) },
    404: { description: "Proposal version line not found", ...jsonContent(errorResponseSchema) },
    409: { description: "Proposal version conflict", ...jsonContent(errorResponseSchema) },
  },
})

const deleteProposalVersionLineRoute = createRoute({
  method: "delete",
  path: "/proposal-version-lines/{id}",
  request: { params: idParamSchema },
  responses: {
    200: { description: "Proposal version line deleted", ...jsonContent(successResponseSchema) },
    404: { description: "Proposal version line not found", ...jsonContent(errorResponseSchema) },
    409: { description: "Proposal version conflict", ...jsonContent(errorResponseSchema) },
  },
})

const versionLinesChild = new OpenAPIHono<Env>({ defaultHook: openApiValidationHook })
  .openapi(listProposalVersionLinesRoute, async (c) =>
    c.json(
      {
        data: await proposalsService.listProposalVersionLines(c.get("db"), c.req.valid("param").id),
      },
      200,
    ),
  )
  .openapi(createProposalVersionLineRoute, async (c) => {
    try {
      const row = await proposalsService.createProposalVersionLine(
        c.get("db"),
        c.req.valid("param").id,
        c.req.valid("json"),
      )
      return row ? c.json({ data: row }, 201) : c.json({ error: "Proposal version not found" }, 404)
    } catch (error) {
      if (error instanceof ProposalVersionConflictError) {
        return c.json({ error: error.message }, 409)
      }
      throw error
    }
  })
  .openapi(updateProposalVersionLineRoute, async (c) => {
    try {
      const row = await proposalsService.updateProposalVersionLine(
        c.get("db"),
        c.req.valid("param").id,
        c.req.valid("json"),
      )
      return row
        ? c.json({ data: row }, 200)
        : c.json({ error: "Proposal version line not found" }, 404)
    } catch (error) {
      if (error instanceof ProposalVersionConflictError) {
        return c.json({ error: error.message }, 409)
      }
      throw error
    }
  })
  .openapi(deleteProposalVersionLineRoute, async (c) => {
    try {
      const row = await proposalsService.deleteProposalVersionLine(
        c.get("db"),
        c.req.valid("param").id,
      )
      return row
        ? c.json({ success: true } as const, 200)
        : c.json({ error: "Proposal version line not found" }, 404)
    } catch (error) {
      if (error instanceof ProposalVersionConflictError) {
        return c.json({ error: error.message }, 409)
      }
      throw error
    }
  })

export const proposalVersionRoutes = new OpenAPIHono<Env>({ defaultHook: openApiValidationHook })
  .route("/", versionsCoreChild)
  .route("/", versionsLifecycleChild)
  .route("/", versionLinesChild)
