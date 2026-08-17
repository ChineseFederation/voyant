import { createRoute, OpenAPIHono, type z } from "@hono/zod-openapi"
import {
  openApiValidationHook,
  parseJsonBody,
  parseQuery,
  requireUserId,
} from "@voyant-travel/hono"
import {
  inquiryCreateResponseSchema,
  inquiryListResponseSchema,
  inquiryResponseSchema,
} from "@voyant-travel/relationships-contracts"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"
import type { Context } from "hono"

import { InquiryServiceError, relationshipsService } from "../service/index.js"
import {
  assignInquirySchema,
  closeInquirySchema,
  createInquirySchema,
  inquiryListQuerySchema,
  reopenInquirySchema,
  transitionInquirySchema,
  updateInquirySchema,
} from "../validation.js"
import { errorResponseSchema, idParamSchema } from "./rest-openapi-schemas.js"

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

// Keep OpenAPI route inference bounded. Handlers parse against the original,
// fully inferred schemas below; these erased aliases affect documentation type
// computation only and avoid multiplying the large Inquiry shape per route.
const documentedListQuerySchema: z.ZodObject = inquiryListQuerySchema
const documentedCreateSchema: z.ZodObject = createInquirySchema
const documentedUpdateSchema: z.ZodObject = updateInquirySchema
const documentedTransitionSchema: z.ZodObject = transitionInquirySchema
const documentedAssignSchema: z.ZodObject = assignInquirySchema
const documentedCloseSchema: z.ZodObject = closeInquirySchema
const documentedReopenSchema: z.ZodObject = reopenInquirySchema
const documentedInquiryResponseSchema: z.ZodObject = inquiryResponseSchema
const documentedInquiryCreateResponseSchema: z.ZodObject = inquiryCreateResponseSchema
const documentedInquiryListResponseSchema: z.ZodObject = inquiryListResponseSchema
const inquiryResponse = jsonContent(documentedInquiryResponseSchema)
const inquiryCreateResponse = jsonContent(documentedInquiryCreateResponseSchema)

function serviceErrorResponse(c: Context<Env>, error: unknown) {
  if (!(error instanceof InquiryServiceError)) throw error
  if (error.code === "INQUIRY_NOT_FOUND") return c.json({ error: error.message }, 404)
  if (error.code === "INQUIRY_RELATED_RECORD_NOT_FOUND") {
    return c.json({ error: error.message }, 404)
  }
  return c.json({ error: error.message }, 409)
}

const listRoute = createRoute({
  method: "get",
  path: "/inquiries",
  request: { query: documentedListQuerySchema },
  responses: {
    200: {
      description: "Paginated inquiry work queue",
      ...jsonContent(documentedInquiryListResponseSchema),
    },
  },
})
const createRouteDefinition = createRoute({
  method: "post",
  path: "/inquiries",
  request: requiredJsonBody(documentedCreateSchema),
  responses: {
    200: { description: "Replayed existing inquiry", ...inquiryCreateResponse },
    201: { description: "Created inquiry", ...inquiryCreateResponse },
    404: { description: "Related record not found", ...jsonContent(errorResponseSchema) },
    409: { description: "Inquiry conflict", ...jsonContent(errorResponseSchema) },
  },
})
const getRoute = createRoute({
  method: "get",
  path: "/inquiries/{id}",
  request: { params: idParamSchema },
  responses: {
    200: { description: "Inquiry detail", ...inquiryResponse },
    404: { description: "Inquiry not found", ...jsonContent(errorResponseSchema) },
  },
})
const updateRoute = createRoute({
  method: "patch",
  path: "/inquiries/{id}",
  request: { params: idParamSchema, ...requiredJsonBody(documentedUpdateSchema) },
  responses: {
    200: { description: "Updated inquiry", ...inquiryResponse },
    404: {
      description: "Inquiry or related record not found",
      ...jsonContent(errorResponseSchema),
    },
    409: { description: "Inquiry conflict", ...jsonContent(errorResponseSchema) },
  },
})

const commandResponses = {
  200: { description: "Updated inquiry", ...inquiryResponse },
  404: { description: "Inquiry not found", ...jsonContent(errorResponseSchema) },
  409: { description: "Inquiry lifecycle conflict", ...jsonContent(errorResponseSchema) },
} as const
const transitionRoute = createRoute({
  method: "post",
  path: "/inquiries/{id}/transition",
  request: { params: idParamSchema, ...requiredJsonBody(documentedTransitionSchema) },
  responses: commandResponses,
})
const assignRoute = createRoute({
  method: "post",
  path: "/inquiries/{id}/assign",
  request: { params: idParamSchema, ...requiredJsonBody(documentedAssignSchema) },
  responses: commandResponses,
})
const closeRoute = createRoute({
  method: "post",
  path: "/inquiries/{id}/close",
  request: { params: idParamSchema, ...requiredJsonBody(documentedCloseSchema) },
  responses: commandResponses,
})
const reopenRoute = createRoute({
  method: "post",
  path: "/inquiries/{id}/reopen",
  request: { params: idParamSchema, ...requiredJsonBody(documentedReopenSchema) },
  responses: commandResponses,
})

export const inquiryRoutes = new OpenAPIHono<Env>({ defaultHook: openApiValidationHook })

inquiryRoutes.openapi(listRoute, async (c) => {
  const query = parseQuery(c, inquiryListQuerySchema)
  return c.json(await relationshipsService.listInquiries(c.get("db"), query, requireUserId(c)), 200)
})
inquiryRoutes.openapi(createRouteDefinition, async (c) => {
  const actorId = requireUserId(c)
  try {
    const result = await relationshipsService.createInquiry(
      c.get("db"),
      await parseJsonBody(c, createInquirySchema),
      actorId,
    )
    const body = { data: result.inquiry, replayed: result.replayed }
    return result.replayed ? c.json(body, 200) : c.json(body, 201)
  } catch (error) {
    return serviceErrorResponse(c, error)
  }
})
inquiryRoutes.openapi(getRoute, async (c) => {
  const row = await relationshipsService.getInquiry(c.get("db"), c.req.valid("param").id)
  return row ? c.json({ data: row }, 200) : c.json({ error: "Inquiry not found" }, 404)
})
inquiryRoutes.openapi(updateRoute, async (c) => {
  const actorId = requireUserId(c)
  try {
    const row = await relationshipsService.updateInquiry(
      c.get("db"),
      c.req.valid("param").id,
      await parseJsonBody(c, updateInquirySchema),
      actorId,
    )
    return c.json({ data: row }, 200)
  } catch (error) {
    return serviceErrorResponse(c, error)
  }
})
inquiryRoutes.openapi(transitionRoute, async (c) => {
  const actorId = requireUserId(c)
  const id = c.req.valid("param").id
  try {
    const row = await relationshipsService.transitionInquiry(
      c.get("db"),
      id,
      await parseJsonBody(c, transitionInquirySchema),
      actorId,
    )
    return c.json({ data: row }, 200)
  } catch (error) {
    return serviceErrorResponse(c, error)
  }
})
inquiryRoutes.openapi(assignRoute, async (c) => {
  const actorId = requireUserId(c)
  const id = c.req.valid("param").id
  try {
    const row = await relationshipsService.assignInquiry(
      c.get("db"),
      id,
      await parseJsonBody(c, assignInquirySchema),
      actorId,
    )
    return c.json({ data: row }, 200)
  } catch (error) {
    return serviceErrorResponse(c, error)
  }
})
inquiryRoutes.openapi(closeRoute, async (c) => {
  const actorId = requireUserId(c)
  const id = c.req.valid("param").id
  try {
    const row = await relationshipsService.closeInquiry(
      c.get("db"),
      id,
      await parseJsonBody(c, closeInquirySchema),
      actorId,
    )
    return c.json({ data: row }, 200)
  } catch (error) {
    return serviceErrorResponse(c, error)
  }
})
inquiryRoutes.openapi(reopenRoute, async (c) => {
  const actorId = requireUserId(c)
  const id = c.req.valid("param").id
  try {
    const row = await relationshipsService.reopenInquiry(
      c.get("db"),
      id,
      await parseJsonBody(c, reopenInquirySchema),
      actorId,
    )
    return c.json({ data: row }, 200)
  } catch (error) {
    return serviceErrorResponse(c, error)
  }
})
