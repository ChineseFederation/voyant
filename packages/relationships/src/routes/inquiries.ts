import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi"
import type { LinkService, ModuleContainer } from "@voyant-travel/core"
import {
  openApiValidationHook,
  parseJsonBody,
  parseQuery,
  requireUserId,
} from "@voyant-travel/hono"
import {
  addInquiryTargetSchema,
  inquiryCreateResponseSchema,
  inquiryBookingConversionRefusalSchema,
  inquiryBookingConversionResultSchema,
  inquiryListResponseSchema,
  inquiryProposalConversionRefusalSchema,
  inquiryProposalConversionResultSchema,
  inquiryResponseSchema,
  inquiryTargetResponseSchema,
} from "@voyant-travel/relationships-contracts"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"
import type { Context } from "hono"
import {
  RELATIONSHIPS_ROUTE_RUNTIME_CONTAINER_KEY,
  type RelationshipsRouteRuntime,
} from "../route-runtime.js"
import {
  convertInquiryToBookingTarget,
  convertInquiryToProposal,
  InquiryBookingConversionRefusedError,
  InquiryProposalConversionRefusedError,
  InquiryServiceError,
  relationshipsService,
} from "../service/index.js"
import {
  assignInquirySchema,
  closeInquirySchema,
  convertInquirySchema,
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
    container?: ModuleContainer
    link?: LinkService
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
const documentedConvertSchema: z.ZodTypeAny = convertInquirySchema
const documentedInquiryResponseSchema: z.ZodObject = inquiryResponseSchema
const documentedInquiryCreateResponseSchema: z.ZodObject = inquiryCreateResponseSchema
const documentedInquiryListResponseSchema: z.ZodObject = inquiryListResponseSchema
const inquiryResponse = jsonContent(documentedInquiryResponseSchema)
const inquiryCreateResponse = jsonContent(documentedInquiryCreateResponseSchema)
const inquiryConversionResponse = jsonContent(
  inquiryProposalConversionResultSchema.or(inquiryBookingConversionResultSchema),
)
const inquiryTargetResponse = jsonContent(inquiryTargetResponseSchema)

function requireLink(c: Context<Env>): LinkService {
  const link = c.get("link")
  if (!link) throw new Error("Inquiry target links are unavailable")
  return link
}

function inquiryTargetValidation(c: Context<Env>) {
  const runtime = c.get("container")?.resolve(RELATIONSHIPS_ROUTE_RUNTIME_CONTAINER_KEY) as
    | RelationshipsRouteRuntime
    | undefined
  return runtime?.inquiryTargetValidation
}

async function withTargets(
  db: PostgresJsDatabase,
  link: LinkService,
  inquiry: Record<string, unknown>,
) {
  return {
    ...inquiry,
    targets: await relationshipsService.listInquiryTargets(db, link, inquiry.id as string),
  }
}
function serviceErrorResponse(c: Context<Env>, error: unknown) {
  if (!(error instanceof InquiryServiceError)) throw error
  if (error.code === "INQUIRY_NOT_FOUND") return c.json({ error: error.message }, 404)
  if (error.code === "INQUIRY_RELATED_RECORD_NOT_FOUND") {
    return c.json({ error: error.message }, 404)
  }
  if (error.code === "INQUIRY_TARGET_NOT_FOUND") return c.json({ error: error.message }, 404)
  if (error.code === "INQUIRY_TARGET_VALIDATION_UNAVAILABLE") {
    return c.json({ error: error.message }, 503)
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
const addTargetRoute = createRoute({
  method: "post",
  path: "/inquiries/{id}/targets",
  request: { params: idParamSchema, ...requiredJsonBody(addInquiryTargetSchema) },
  responses: {
    201: { description: "Linked Inquiry target", ...inquiryTargetResponse },
    404: { description: "Inquiry or target not found", ...jsonContent(errorResponseSchema) },
    409: { description: "Inquiry target conflict", ...jsonContent(errorResponseSchema) },
    503: { description: "Target owner authority unavailable", ...jsonContent(errorResponseSchema) },
  },
})
const deleteTargetRoute = createRoute({
  method: "delete",
  path: "/inquiries/{id}/targets/{linkId}",
  request: { params: idParamSchema.extend({ linkId: z.string().min(1) }) },
  responses: {
    204: { description: "Inquiry target removed" },
    404: { description: "Inquiry or target not found", ...jsonContent(errorResponseSchema) },
    409: { description: "Inquiry target conflict", ...jsonContent(errorResponseSchema) },
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
const convertRoute = createRoute({
  method: "post",
  path: "/inquiries/{id}/convert",
  request: { params: idParamSchema, ...requiredJsonBody(documentedConvertSchema) },
  responses: {
    200: { description: "Replayed Inquiry conversion", ...inquiryConversionResponse },
    201: { description: "Created Inquiry conversion", ...inquiryConversionResponse },
    404: { description: "Inquiry not found", ...jsonContent(errorResponseSchema) },
    409: {
      description: "Inquiry lifecycle conflict or target-owner refusal",
      ...jsonContent(
        inquiryProposalConversionRefusalSchema
          .or(inquiryBookingConversionRefusalSchema)
          .or(errorResponseSchema),
      ),
    },
    503: { description: "Conversion owner unavailable", ...jsonContent(errorResponseSchema) },
  },
})

export const inquiryRoutes = new OpenAPIHono<Env>({ defaultHook: openApiValidationHook })

inquiryRoutes.openapi(listRoute, async (c) => {
  const query = parseQuery(c, inquiryListQuerySchema)
  const db = c.get("db")
  const result = await relationshipsService.listInquiries(db, query, requireUserId(c))
  const targets = await relationshipsService.listInquiryTargetsForInquiries(
    db,
    requireLink(c),
    result.data.map((inquiry) => inquiry.id),
  )
  return c.json(
    {
      ...result,
      data: result.data.map((inquiry) => ({
        ...inquiry,
        targets: targets.get(inquiry.id) ?? [],
      })),
    },
    200,
  )
})
inquiryRoutes.openapi(createRouteDefinition, async (c) => {
  const actorId = requireUserId(c)
  try {
    const result = await relationshipsService.createInquiry(
      c.get("db"),
      await parseJsonBody(c, createInquirySchema),
      actorId,
    )
    const body = {
      data: await withTargets(c.get("db"), requireLink(c), result.inquiry),
      replayed: result.replayed,
    }
    return result.replayed ? c.json(body, 200) : c.json(body, 201)
  } catch (error) {
    return serviceErrorResponse(c, error)
  }
})
inquiryRoutes.openapi(getRoute, async (c) => {
  const row = await relationshipsService.getInquiry(c.get("db"), c.req.valid("param").id)
  return row
    ? c.json({ data: await withTargets(c.get("db"), requireLink(c), row) }, 200)
    : c.json({ error: "Inquiry not found" }, 404)
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
    return c.json({ data: await withTargets(c.get("db"), requireLink(c), row) }, 200)
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
    return c.json({ data: await withTargets(c.get("db"), requireLink(c), row) }, 200)
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
    return c.json({ data: await withTargets(c.get("db"), requireLink(c), row) }, 200)
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
    return c.json({ data: await withTargets(c.get("db"), requireLink(c), row) }, 200)
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
    return c.json({ data: await withTargets(c.get("db"), requireLink(c), row) }, 200)
  } catch (error) {
    return serviceErrorResponse(c, error)
  }
})
inquiryRoutes.openapi(addTargetRoute, async (c) => {
  try {
    const data = await relationshipsService.addInquiryTarget(
      c.get("db"),
      c.req.valid("param").id,
      await parseJsonBody(c, addInquiryTargetSchema),
      requireUserId(c),
      inquiryTargetValidation(c),
    )
    return c.json({ data }, 201)
  } catch (error) {
    return serviceErrorResponse(c, error)
  }
})
inquiryRoutes.openapi(deleteTargetRoute, async (c) => {
  try {
    const { id, linkId } = c.req.valid("param")
    await relationshipsService.deleteInquiryTarget(c.get("db"), id, linkId, requireUserId(c))
    return c.body(null, 204)
  } catch (error) {
    return serviceErrorResponse(c, error)
  }
})
inquiryRoutes.openapi(convertRoute, async (c) => {
  const actorId = requireUserId(c)
  const command = await parseJsonBody(c, convertInquirySchema)
  const runtime = c.get("container")?.resolve(RELATIONSHIPS_ROUTE_RUNTIME_CONTAINER_KEY) as
    | RelationshipsRouteRuntime
    | undefined
  try {
    const inquiryId = c.req.valid("param").id
    let result
    if (command.kind === "proposal") {
      if (!runtime?.proposalInquiryConversion) {
        return c.json({ error: "Proposal conversion is unavailable" }, 503)
      }
      result = await convertInquiryToProposal(
        c.get("db"),
        runtime.proposalInquiryConversion,
        inquiryId,
        command,
        actorId,
      )
    } else if (command.kind === "booking") {
      throw new InquiryBookingConversionRefusedError("booking_session_required")
    } else {
      if (!runtime?.inquiryBookingSession || !runtime.inquiryBookingTargetResolver) {
        return c.json({ error: "Booking Session conversion is unavailable" }, 503)
      }
      result = await convertInquiryToBookingTarget(
        c.get("db"),
        runtime.inquiryBookingSession,
        runtime.inquiryBookingTargetResolver,
        inquiryId,
        command,
        actorId,
      )
    }
    const body = { data: result }
    return result.kind === "created" ? c.json(body, 201) : c.json(body, 200)
  } catch (error) {
    if (error instanceof InquiryProposalConversionRefusedError) {
      return c.json({ error: error.message, reason: error.reason }, 409)
    }
    if (error instanceof InquiryBookingConversionRefusedError) {
      return c.json({ error: error.message, reason: error.reason }, 409)
    }
    return serviceErrorResponse(c, error)
  }
})
