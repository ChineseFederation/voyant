/**
 * Legal-terms admin + public routes. The combined `legalApiModule` mounts these
 * under `/v1/admin/legal/terms/*` and `/v1/public/legal/terms/*`.
 *
 * Migrated to `@hono/zod-openapi` for the OpenAPI admin backfill (voyant#2114).
 * Each bundle is a small `OpenAPIHono` (terms is a single CRUD resource, so no
 * per-resource sub-chains are needed). Request schemas reuse the `./validation`
 * (legal-contracts) schemas the handlers already parse; the response schema is
 * authored here from the row shape (§17: timestamp columns serialize to strings
 * over the wire — never `Date`).
 */

import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi"
import { openApiValidationHook } from "@voyant-travel/hono"
import { legalTargetKindSchema } from "@voyant-travel/legal-contracts/targets/validation"
import { listResponseSchema } from "@voyant-travel/types"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"
import type { Context } from "hono"

import { acceptLegalTerm } from "./disclosure-archive.js"
import { legalTermsService } from "./service.js"
import {
  acceptLegalTermSchema,
  insertLegalTermSchema,
  legalTermAcceptanceStatusSchema,
  legalTermListQuerySchema,
  legalTermTypeSchema,
  updateLegalTermSchema,
} from "./validation.js"

type Env = {
  Variables: {
    db: PostgresJsDatabase
  }
}

const PUBLIC_LEGAL_CACHE_CONTROL = "public, s-maxage=300, stale-while-revalidate=600"

function cachePublicLegalRead(c: Context) {
  c.header("Cache-Control", PUBLIC_LEGAL_CACHE_CONTROL)
}

// ==========================================================================
// Shared response building blocks
// ==========================================================================

const errorResponseSchema = z.object({ error: z.string() })
const deleteResponseSchema = z.object({ success: z.boolean() })

const idParamSchema = z.object({ id: z.string() })

// Open jsonb column (`metadata`) carries no Drizzle `$type`, so the wire
// contract is an opaque JSON value (mirrors `contracts/routes.ts`).
const jsonValue = z.unknown()

/**
 * Wire shape of a `legal_terms` row (§17 timestamps → strings).
 *
 * `termType`/`acceptanceStatus` reuse the legal-contracts enums rather than a
 * local copy: the local copy had to be remembered, and the insurer-disclosure
 * kinds are exactly the sort of addition that gets remembered in one place.
 */
const legalTermSchema = z.object({
  id: z.string(),
  contractId: z.string().nullable(),
  policyVersionId: z.string().nullable(),
  targetKind: legalTargetKindSchema.nullable(),
  targetId: z.string().nullable(),
  targetProvider: z.string().nullable(),
  targetSourceRef: z.string().nullable(),
  legacyTransactionOfferId: z.string().nullable(),
  legacyTransactionOrderId: z.string().nullable(),
  termType: legalTermTypeSchema,
  title: z.string(),
  body: z.string(),
  language: z.string().nullable(),
  required: z.boolean(),
  sortOrder: z.number().int(),
  acceptanceStatus: legalTermAcceptanceStatusSchema,
  acceptedAt: z.string().nullable(),
  acceptedBy: z.string().nullable(),
  sourceVersionId: z.string().nullable(),
  archivedStorageKey: z.string().nullable(),
  archivedChecksum: z.string().nullable(),
  metadata: jsonValue,
  createdAt: z.string(),
  updatedAt: z.string(),
})

// ==========================================================================
// Admin routes — `/v1/admin/legal/terms/*`
// ==========================================================================

const listTermsRoute = createRoute({
  method: "get",
  path: "/",
  request: { query: legalTermListQuerySchema },
  responses: {
    200: {
      description: "Paginated list of legal terms",
      content: { "application/json": { schema: listResponseSchema(legalTermSchema) } },
    },
  },
})

const createTermRoute = createRoute({
  method: "post",
  path: "/",
  request: {
    body: { required: true, content: { "application/json": { schema: insertLegalTermSchema } } },
  },
  responses: {
    201: {
      description: "The created legal term",
      content: { "application/json": { schema: z.object({ data: legalTermSchema }) } },
    },
    400: {
      description: "Invalid request body",
      content: { "application/json": { schema: errorResponseSchema } },
    },
  },
})

const getTermRoute = createRoute({
  method: "get",
  path: "/{id}",
  request: { params: idParamSchema },
  responses: {
    200: {
      description: "A legal term by id",
      content: { "application/json": { schema: z.object({ data: legalTermSchema }) } },
    },
    404: {
      description: "Legal term not found",
      content: { "application/json": { schema: errorResponseSchema } },
    },
  },
})

const updateTermRoute = createRoute({
  method: "patch",
  path: "/{id}",
  request: {
    params: idParamSchema,
    body: { required: true, content: { "application/json": { schema: updateLegalTermSchema } } },
  },
  responses: {
    200: {
      description: "The updated legal term",
      content: { "application/json": { schema: z.object({ data: legalTermSchema }) } },
    },
    400: {
      description: "Invalid request body",
      content: { "application/json": { schema: errorResponseSchema } },
    },
    404: {
      description: "Legal term not found",
      content: { "application/json": { schema: errorResponseSchema } },
    },
  },
})

/**
 * Record acceptance of a term on the existing acceptance columns.
 *
 * The body deliberately cannot name a version. For an insurer disclosure the
 * accepted version is whatever the stored row was archived from, so a later
 * change to the insurer's current wording is a different row and cannot reach
 * back into what this acceptance says.
 */
const acceptTermRoute = createRoute({
  method: "post",
  path: "/{id}/acceptance",
  request: {
    params: idParamSchema,
    body: { required: true, content: { "application/json": { schema: acceptLegalTermSchema } } },
  },
  responses: {
    200: {
      description: "The accepted legal term",
      content: { "application/json": { schema: z.object({ data: legalTermSchema }) } },
    },
    400: {
      description: "Invalid request body, or the term carries no archived disclosure",
      content: { "application/json": { schema: errorResponseSchema } },
    },
    404: {
      description: "Legal term not found",
      content: { "application/json": { schema: errorResponseSchema } },
    },
  },
})

const deleteTermRoute = createRoute({
  method: "delete",
  path: "/{id}",
  request: { params: idParamSchema },
  responses: {
    200: {
      description: "Legal term deleted",
      content: { "application/json": { schema: deleteResponseSchema } },
    },
    404: {
      description: "Legal term not found",
      content: { "application/json": { schema: errorResponseSchema } },
    },
  },
})

export const legalTermsAdminRoutes = new OpenAPIHono<Env>({ defaultHook: openApiValidationHook })
  .openapi(listTermsRoute, async (c) =>
    c.json(await legalTermsService.listTerms(c.get("db"), c.req.valid("query")), 200),
  )
  .openapi(createTermRoute, async (c) => {
    const row = await legalTermsService.createTerm(c.get("db"), c.req.valid("json"))
    return c.json({ data: row! }, 201)
  })
  .openapi(getTermRoute, async (c) => {
    const row = await legalTermsService.getTermById(c.get("db"), c.req.valid("param").id)
    return row ? c.json({ data: row }, 200) : c.json({ error: "Legal term not found" }, 404)
  })
  .openapi(updateTermRoute, async (c) => {
    const row = await legalTermsService.updateTerm(
      c.get("db"),
      c.req.valid("param").id,
      c.req.valid("json"),
    )
    return row ? c.json({ data: row }, 200) : c.json({ error: "Legal term not found" }, 404)
  })
  .openapi(acceptTermRoute, async (c) => {
    const body = c.req.valid("json")
    const row = await acceptLegalTerm(c.get("db"), c.req.valid("param").id, {
      acceptedBy: body.acceptedBy,
      acceptedAt: body.acceptedAt ? new Date(body.acceptedAt) : undefined,
    })
    return row ? c.json({ data: row }, 200) : c.json({ error: "Legal term not found" }, 404)
  })
  .openapi(deleteTermRoute, async (c) => {
    const row = await legalTermsService.deleteTerm(c.get("db"), c.req.valid("param").id)
    return row ? c.json({ success: true }, 200) : c.json({ error: "Legal term not found" }, 404)
  })

export type LegalTermsAdminRoutes = typeof legalTermsAdminRoutes

// ==========================================================================
// Public routes — `/v1/public/legal/terms/*`
// ==========================================================================

const listPublicTermsRoute = createRoute({
  method: "get",
  path: "/",
  request: { query: legalTermListQuerySchema },
  responses: {
    200: {
      description: "Paginated list of legal terms (public read)",
      content: { "application/json": { schema: listResponseSchema(legalTermSchema) } },
    },
  },
})

const getPublicTermRoute = createRoute({
  method: "get",
  path: "/{id}",
  request: { params: idParamSchema },
  responses: {
    200: {
      description: "A legal term by id (public read)",
      content: { "application/json": { schema: z.object({ data: legalTermSchema }) } },
    },
    404: {
      description: "Legal term not found",
      content: { "application/json": { schema: errorResponseSchema } },
    },
  },
})

export const legalTermsPublicRoutes = new OpenAPIHono<Env>({ defaultHook: openApiValidationHook })
  .openapi(listPublicTermsRoute, async (c) => {
    const result = await legalTermsService.listTerms(c.get("db"), c.req.valid("query"))
    cachePublicLegalRead(c)
    return c.json(result, 200)
  })
  .openapi(getPublicTermRoute, async (c) => {
    const row = await legalTermsService.getTermById(c.get("db"), c.req.valid("param").id)
    if (!row) return c.json({ error: "Legal term not found" }, 404)
    cachePublicLegalRead(c)
    return c.json({ data: row }, 200)
  })

export type LegalTermsPublicRoutes = typeof legalTermsPublicRoutes
