import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi"
import {
  type ActionLedgerRequestContextValues,
  appendActionLedgerMutation,
  evaluateActionLedgerCapabilityAccess,
  ledgerSensitiveRead,
} from "@voyant-travel/action-ledger"
import type { LinkService, ModuleContainer } from "@voyant-travel/core"
import {
  openApiValidationHook,
  parseJsonBody,
  parseQuery,
  requireAdditionalPermission,
  requireUserId,
} from "@voyant-travel/hono"
import {
  addInquiryTargetSchema,
  inquiryActivityListQuerySchema,
  inquiryActivityListResponseSchema,
  attachInquiryAssetSchema,
  eraseInquiryPrivacySchema,
  type InquiryBookingConversionResult,
  type InquiryProposalConversionResult,
  inquiryBookingConversionRefusalSchema,
  inquiryBookingConversionResultSchema,
  inquiryCreateResponseSchema,
  inquiryAttachmentResponseSchema,
  inquiryAttachmentsResponseSchema,
  inquiryListResponseSchema,
  inquiryPrivacyExportResponseSchema,
  inquiryProposalConversionRefusalSchema,
  inquiryProposalConversionResultSchema,
  inquiryResponseSchema,
  inquiryTargetResponseSchema,
  recordInquiryActivityResultSchema,
  recordInquiryActivitySchema,
  updateInquiryAttachmentSchema,
} from "@voyant-travel/relationships-contracts"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"
import type { Context } from "hono"
import {
  INQUIRY_PRIVATE_DATA_READ_CAPABILITY,
  INQUIRY_PRIVACY_ERASURE_CAPABILITY,
} from "../action-ledger-capabilities.js"
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
  recordInquiryFirstResponseSchema,
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
    sessionId?: string
    organizationId?: string | null
    actor?: string
    callerType?: string
    scopes?: string[] | null
    isInternalRequest?: boolean
    apiKeyId?: string
    apiTokenId?: string
  }
}

function actionLedgerContext(c: Context<Env>): ActionLedgerRequestContextValues {
  return {
    userId: c.get("userId") ?? null,
    agentId: null,
    workflowPrincipalId: null,
    principalSubtype: null,
    sessionId: c.get("sessionId") ?? null,
    apiTokenId: c.get("apiTokenId") ?? c.get("apiKeyId") ?? null,
    callerType: c.get("callerType") ?? null,
    actor: c.get("actor") ?? null,
    isInternalRequest: c.get("isInternalRequest") ?? false,
    organizationId: c.get("organizationId") ?? null,
    workflowRunId: null,
    workflowStepId: null,
    correlationId: c.req.header("x-correlation-id") ?? c.req.header("x-request-id") ?? null,
  }
}

function inquiryPrivateAccess(c: Context<Env>, action: "read" | "delete") {
  return evaluateActionLedgerCapabilityAccess({
    definition:
      action === "read"
        ? INQUIRY_PRIVATE_DATA_READ_CAPABILITY
        : INQUIRY_PRIVACY_ERASURE_CAPABILITY,
    actor: c.get("actor") ?? null,
    callerType: c.get("callerType") ?? null,
    scopes: c.get("scopes") ?? null,
    isInternalRequest: c.get("isInternalRequest") ?? false,
  })
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
const documentedRecordFirstResponseSchema: z.ZodObject = recordInquiryFirstResponseSchema
const documentedConvertSchema: z.ZodTypeAny = convertInquirySchema
const documentedActivityListQuerySchema: z.ZodObject = inquiryActivityListQuerySchema
const documentedRecordActivitySchema: z.ZodObject = recordInquiryActivitySchema
const documentedInquiryResponseSchema: z.ZodObject = inquiryResponseSchema
const documentedInquiryCreateResponseSchema: z.ZodObject = inquiryCreateResponseSchema
const documentedInquiryListResponseSchema: z.ZodObject = inquiryListResponseSchema
const inquiryResponse = jsonContent(documentedInquiryResponseSchema)
const inquiryCreateResponse = jsonContent(documentedInquiryCreateResponseSchema)
const inquiryConversionResponse = jsonContent(
  inquiryProposalConversionResultSchema.or(inquiryBookingConversionResultSchema),
)
const inquiryTargetResponse = jsonContent(inquiryTargetResponseSchema)
const inquiryActivityListResponse = jsonContent(inquiryActivityListResponseSchema)
const recordInquiryActivityResponse = jsonContent(recordInquiryActivityResultSchema)

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
function inquiryAttachmentAuthority(c: Context<Env>) {
  const runtime = c.get("container")?.resolve(RELATIONSHIPS_ROUTE_RUNTIME_CONTAINER_KEY) as
    | RelationshipsRouteRuntime
    | undefined
  return runtime?.inquiryAttachments
}

async function withTargets(
  db: PostgresJsDatabase,
  link: LinkService,
  inquiry: Record<string, unknown>,
) {
  return {
    ...inquiry,
    targets: await relationshipsService.listInquiryTargets(db, link, inquiry.id as string),
    attachments: await relationshipsService.listInquiryAttachments(db, link, inquiry.id as string),
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
  if (error.code === "INQUIRY_ATTACHMENT_AUTHORITY_UNAVAILABLE") {
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
    503: { description: "Target owner authority unavailable", ...jsonContent(errorResponseSchema) },
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
    503: { description: "Target owner authority unavailable", ...jsonContent(errorResponseSchema) },
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
const listActivitiesRoute = createRoute({
  method: "get",
  path: "/inquiries/{id}/activities",
  request: { params: idParamSchema, query: documentedActivityListQuerySchema },
  responses: {
    200: { description: "Chronological Inquiry activity timeline", ...inquiryActivityListResponse },
    404: { description: "Inquiry not found", ...jsonContent(errorResponseSchema) },
  },
})
const recordActivityRoute = createRoute({
  method: "post",
  path: "/inquiries/{id}/activities",
  request: { params: idParamSchema, ...requiredJsonBody(documentedRecordActivitySchema) },
  responses: {
    201: { description: "Recorded Inquiry activity", ...recordInquiryActivityResponse },
    404: { description: "Inquiry not found", ...jsonContent(errorResponseSchema) },
    409: { description: "Inquiry activity conflict", ...jsonContent(errorResponseSchema) },
    503: { description: "Inquiry activity owner unavailable", ...jsonContent(errorResponseSchema) },
  },
})
const listAttachmentsRoute = createRoute({
  method: "get",
  path: "/inquiries/{id}/attachments",
  request: { params: idParamSchema },
  responses: {
    200: { description: "Inquiry attachments", ...jsonContent(inquiryAttachmentsResponseSchema) },
    404: { description: "Inquiry not found", ...jsonContent(errorResponseSchema) },
  },
})
const attachAssetRoute = createRoute({
  method: "post",
  path: "/inquiries/{id}/attachments",
  request: { params: idParamSchema, ...requiredJsonBody(attachInquiryAssetSchema) },
  responses: {
    201: { description: "Attached Media asset", ...jsonContent(inquiryAttachmentResponseSchema) },
    404: { description: "Inquiry or Media asset not found", ...jsonContent(errorResponseSchema) },
    409: { description: "Attachment conflict", ...jsonContent(errorResponseSchema) },
    503: { description: "Media attachment authority unavailable", ...jsonContent(errorResponseSchema) },
  },
})
const updateAttachmentRoute = createRoute({
  method: "patch",
  path: "/inquiries/{id}/attachments/{linkId}",
  request: {
    params: idParamSchema.extend({ linkId: z.string().min(1) }),
    ...requiredJsonBody(updateInquiryAttachmentSchema),
  },
  responses: {
    200: { description: "Updated attachment caption", ...jsonContent(inquiryAttachmentResponseSchema) },
    404: { description: "Inquiry attachment not found", ...jsonContent(errorResponseSchema) },
    409: { description: "Attachment conflict", ...jsonContent(errorResponseSchema) },
    503: { description: "Inquiry service unavailable", ...jsonContent(errorResponseSchema) },
  },
})
const removeAttachmentRoute = createRoute({
  method: "delete",
  path: "/inquiries/{id}/attachments/{linkId}",
  request: { params: idParamSchema.extend({ linkId: z.string().min(1) }) },
  responses: {
    204: { description: "Inquiry attachment removed" },
    404: { description: "Inquiry attachment not found", ...jsonContent(errorResponseSchema) },
  },
})
const downloadAttachmentRoute = createRoute({
  method: "get",
  path: "/inquiries/{id}/attachments/{linkId}/download",
  request: { params: idParamSchema.extend({ linkId: z.string().min(1) }) },
  responses: {
    200: { description: "Authenticated private Inquiry attachment bytes" },
    403: { description: "Relationship PII grant required", ...jsonContent(errorResponseSchema) },
    404: { description: "Inquiry attachment not found", ...jsonContent(errorResponseSchema) },
    503: { description: "Media attachment authority unavailable", ...jsonContent(errorResponseSchema) },
  },
})
const privacyExportRoute = createRoute({
  method: "get",
  path: "/inquiries/{id}/privacy-export",
  request: { params: idParamSchema },
  responses: {
    200: { description: "Inquiry privacy export", ...jsonContent(inquiryPrivacyExportResponseSchema) },
    403: { description: "Relationship PII grant required", ...jsonContent(errorResponseSchema) },
    404: { description: "Inquiry not found", ...jsonContent(errorResponseSchema) },
    409: { description: "Inquiry export conflict", ...jsonContent(errorResponseSchema) },
    503: { description: "Inquiry service unavailable", ...jsonContent(errorResponseSchema) },
  },
})
const privacyErasureRoute = createRoute({
  method: "post",
  path: "/inquiries/{id}/privacy-erasure",
  request: { params: idParamSchema, ...requiredJsonBody(eraseInquiryPrivacySchema) },
  responses: {
    200: { description: "Privacy-erased inquiry", ...inquiryResponse },
    403: { description: "Relationship PII erase grant required", ...jsonContent(errorResponseSchema) },
    404: { description: "Inquiry not found", ...jsonContent(errorResponseSchema) },
    409: { description: "Inquiry conflict", ...jsonContent(errorResponseSchema) },
    503: { description: "Media attachment authority unavailable", ...jsonContent(errorResponseSchema) },
  },
})

const commandResponses = {
  200: { description: "Updated inquiry", ...inquiryResponse },
  404: { description: "Inquiry not found", ...jsonContent(errorResponseSchema) },
  409: { description: "Inquiry lifecycle conflict", ...jsonContent(errorResponseSchema) },
  503: { description: "Inquiry owner authority unavailable", ...jsonContent(errorResponseSchema) },
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
const recordFirstResponseRoute = createRoute({
  method: "post",
  path: "/inquiries/{id}/record-first-response",
  request: {
    params: idParamSchema,
    ...requiredJsonBody(documentedRecordFirstResponseSchema),
  },
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

// Multipart is deliberately owned by the Inquiry surface so CRM writers do not
// need a second Media-library grant. Media still owns storage and asset creation.
inquiryRoutes.post("/inquiries/:id/attachments/upload", async (c) => {
  const actorId = requireUserId(c)
  const form = await c.req.parseBody()
  const file = form.file
  if (!(file instanceof File)) return c.json({ error: "Missing file field" }, 400)
  if (file.size > 25 * 1024 * 1024) return c.json({ error: "Attachment exceeds 25 MB" }, 413)
  const caption = typeof form.caption === "string" ? form.caption.trim() : ""
  const operationKey = typeof form.operationKey === "string" ? form.operationKey.trim() : ""
  if (!/^[A-Za-z0-9_-]{16,128}$/.test(operationKey)) {
    return c.json({ error: "A valid attachment operation key is required" }, 400)
  }
  if (caption.length > 2_000) return c.json({ error: "Caption exceeds 2000 characters" }, 400)
  try {
    const data = await relationshipsService.uploadInquiryAttachment(
      c.get("db"),
      c.req.param("id"),
      {
        operationKey,
        name: file.name,
        mimeType: file.type || null,
        caption: caption || null,
        body: await file.arrayBuffer(),
      },
      actorId,
      c.env,
      inquiryAttachmentAuthority(c),
    )
    return c.json({ data }, 201)
  } catch (error) {
    return serviceErrorResponse(c, error)
  }
})
inquiryRoutes.openAPIRegistry.registerPath({
  method: "post",
  path: "/inquiries/{id}/attachments/upload",
  summary: "Upload and attach a private Inquiry document",
  request: {
    params: idParamSchema,
    body: {
      required: true,
      content: {
        "multipart/form-data": {
          schema: z.object({
            file: z.any(),
            operationKey: z.string().min(16).max(128),
            caption: z.string().max(2_000).optional(),
          }),
        },
      },
    },
  },
  responses: {
    201: { description: "Uploaded private document and attached it to the Inquiry" },
    400: { description: "Invalid multipart request" },
    404: { description: "Inquiry not found" },
    413: { description: "Attachment is too large" },
    503: { description: "Private document storage is unavailable" },
  },
})

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
      data: await Promise.all(
        result.data.map(async (inquiry) => ({
          ...inquiry,
          targets: targets.get(inquiry.id) ?? [],
          attachments: await relationshipsService.listInquiryAttachments(db, requireLink(c), inquiry.id),
        })),
      ),
    },
    200,
  )
})
inquiryRoutes.openapi(createRouteDefinition, async (c) => {
  const actorId = requireUserId(c)
  try {
    const runtime = c.get("container")?.resolve(RELATIONSHIPS_ROUTE_RUNTIME_CONTAINER_KEY) as
      | RelationshipsRouteRuntime
      | undefined
    const result = await relationshipsService.createInquiry(
      c.get("db"),
      await parseJsonBody(c, createInquirySchema),
      actorId,
      { slaPolicy: runtime?.inquiryFirstResponseSlaPolicy },
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
inquiryRoutes.openapi(listActivitiesRoute, async (c) => {
  const id = c.req.valid("param").id
  const inquiry = await relationshipsService.getInquiry(c.get("db"), id)
  if (!inquiry) return c.json({ error: "Inquiry not found" }, 404)
  return c.json(
    await relationshipsService.listActivities(c.get("db"), {
      ...parseQuery(c, inquiryActivityListQuerySchema),
      entityType: "inquiry",
      entityId: id,
    }),
    200,
  )
})
inquiryRoutes.openapi(recordActivityRoute, async (c) => {
  try {
    const result = await relationshipsService.recordInquiryActivity(
      c.get("db"),
      c.req.valid("param").id,
      await parseJsonBody(c, recordInquiryActivitySchema),
      requireUserId(c),
    )
    return c.json(result, 201)
  } catch (error) {
    return serviceErrorResponse(c, error)
  }
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
inquiryRoutes.openapi(listAttachmentsRoute, async (c) => {
  const { id } = c.req.valid("param")
  const inquiry = await relationshipsService.getInquiry(c.get("db"), id)
  if (!inquiry) return c.json({ error: "Inquiry not found" }, 404)
  return c.json({ data: await relationshipsService.listInquiryAttachments(c.get("db"), requireLink(c), id) }, 200)
})
inquiryRoutes.openapi(attachAssetRoute, async (c) => {
  try {
    const data = await relationshipsService.attachInquiryAsset(
      c.get("db"),
      c.req.valid("param").id,
      await parseJsonBody(c, attachInquiryAssetSchema),
      requireUserId(c),
      inquiryAttachmentAuthority(c),
    )
    return c.json({ data }, 201)
  } catch (error) {
    return serviceErrorResponse(c, error)
  }
})
inquiryRoutes.openapi(updateAttachmentRoute, async (c) => {
  try {
    const { id, linkId } = c.req.valid("param")
    const data = await relationshipsService.updateInquiryAttachment(
      c.get("db"),
      id,
      linkId,
      await parseJsonBody(c, updateInquiryAttachmentSchema),
      requireUserId(c),
    )
    return c.json({ data }, 200)
  } catch (error) {
    return serviceErrorResponse(c, error)
  }
})
inquiryRoutes.openapi(removeAttachmentRoute, async (c) => {
  try {
    const { id, linkId } = c.req.valid("param")
    await relationshipsService.removeInquiryAttachment(
      c.get("db"),
      id,
      linkId,
      requireUserId(c),
      inquiryAttachmentAuthority(c),
    )
    return c.body(null, 204)
  } catch (error) {
    return serviceErrorResponse(c, error)
  }
})
inquiryRoutes.openapi(downloadAttachmentRoute, async (c) => {
  const access = inquiryPrivateAccess(c, "read")
  if (!access.allowed) return c.json({ error: "Forbidden", reason: access.reason }, 403)
  const { id, linkId } = c.req.valid("param")
  const attachment = await relationshipsService.resolveInquiryAttachment(
    c.get("db"),
    requireLink(c),
    id,
    linkId,
  )
  if (!attachment) return c.json({ error: "Inquiry attachment not found" }, 404)
  const authority = inquiryAttachmentAuthority(c)
  if (!authority) return c.json({ error: "Media attachment authority is unavailable" }, 503)
  const download = await ledgerSensitiveRead(
    c.get("db"),
    {
      context: actionLedgerContext(c),
      actionName: "relationships.inquiry.attachment.download",
      actionVersion: "v1",
      status: "succeeded",
      evaluatedRisk: access.evaluatedRisk ?? "high",
      targetType: "inquiry",
      targetId: id,
      routeOrToolName: "relationships.inquiries.attachment.download",
      capabilityId: INQUIRY_PRIVATE_DATA_READ_CAPABILITY.id,
      capabilityVersion: INQUIRY_PRIVATE_DATA_READ_CAPABILITY.version,
      authorizationSource: access.authorizationSource ?? "scope",
      reasonCode: "inquiry_attachment_download",
      disclosedFieldSet: ["attachment.bytes", "attachment.name", "attachment.mimeType"],
      disclosureSummary: "Private Inquiry attachment download",
      decisionPolicy: "scope_grant",
    },
    () => authority.downloadPrivateDocument(c.get("db"), c.env, attachment.assetId),
  )
  if (!download) return c.json({ error: "Inquiry attachment not found" }, 404)
  const filename = attachment.name.replace(/["\\\r\n]/g, "_")
  return c.body(download.body, 200, {
    "Content-Type": attachment.mimeType ?? "application/octet-stream",
    "Content-Disposition": `attachment; filename="${filename}"`,
    "Cache-Control": "private, no-store",
  })
})
inquiryRoutes.openapi(privacyExportRoute, async (c) => {
  const access = inquiryPrivateAccess(c, "read")
  if (!access.allowed) return c.json({ error: "Forbidden", reason: access.reason }, 403)
  try {
    const inquiryId = c.req.valid("param").id
    const data = await ledgerSensitiveRead(
      c.get("db"),
      {
        context: actionLedgerContext(c),
        actionName: "relationships.inquiry.privacy_export",
        actionVersion: "v1",
        status: "succeeded",
        evaluatedRisk: access.evaluatedRisk ?? "high",
        targetType: "inquiry",
        targetId: inquiryId,
        routeOrToolName: "relationships.inquiries.privacy-export",
        capabilityId: INQUIRY_PRIVATE_DATA_READ_CAPABILITY.id,
        capabilityVersion: INQUIRY_PRIVATE_DATA_READ_CAPABILITY.version,
        authorizationSource: access.authorizationSource ?? "scope",
        reasonCode: "inquiry_privacy_export",
        disclosedFieldSet: ["inquiry", "activities", "attachments", "conversionProvenance"],
        disclosureSummary: "Inquiry privacy export",
        decisionPolicy: "scope_grant",
      },
      () => relationshipsService.exportInquiryPrivacy(c.get("db"), requireLink(c), inquiryId),
    )
    return c.json({ data }, 200)
  } catch (error) {
    return serviceErrorResponse(c, error)
  }
})
inquiryRoutes.openapi(privacyErasureRoute, async (c) => {
  const access = inquiryPrivateAccess(c, "delete")
  if (!access.allowed) return c.json({ error: "Forbidden", reason: access.reason }, 403)
  try {
    const inquiryId = c.req.valid("param").id
    const row = await relationshipsService.eraseInquiryPrivacy(
      c.get("db"),
      inquiryId,
      await parseJsonBody(c, eraseInquiryPrivacySchema),
      requireUserId(c),
      c.env,
      inquiryAttachmentAuthority(c),
      (tx) =>
        appendActionLedgerMutation(tx, {
          context: actionLedgerContext(c),
          actionName: "relationships.inquiry.privacy_erasure",
          actionVersion: "v1",
          actionKind: "delete",
          evaluatedRisk: access.evaluatedRisk ?? "high",
          targetType: "inquiry",
          targetId: inquiryId,
          routeOrToolName: "relationships.inquiries.privacy-erasure",
          capabilityId: INQUIRY_PRIVACY_ERASURE_CAPABILITY.id,
          capabilityVersion: INQUIRY_PRIVACY_ERASURE_CAPABILITY.version,
          authorizationSource: access.authorizationSource ?? "scope",
          mutationDetail: {
            summary: "Privacy-erased Inquiry personal data and queued private document purges",
            reversalKind: "none",
          },
        }),
    )
    return c.json({ data: await withTargets(c.get("db"), requireLink(c), row) }, 200)
  } catch (error) {
    return serviceErrorResponse(c, error)
  }
})
inquiryRoutes.openapi(recordFirstResponseRoute, async (c) => {
  const actorId = requireUserId(c)
  const id = c.req.valid("param").id
  try {
    await parseJsonBody(c, recordInquiryFirstResponseSchema)
    const row = await relationshipsService.recordFirstResponse(c.get("db"), id, actorId)
    return c.json({ data: await withTargets(c.get("db"), requireLink(c), row) }, 200)
  } catch (error) {
    return serviceErrorResponse(c, error)
  }
})
inquiryRoutes.openapi(convertRoute, async (c) => {
  const actorId = requireUserId(c)
  const command = await parseJsonBody(c, convertInquirySchema)
  await requireAdditionalPermission(
    c,
    command.kind === "proposal"
      ? { resource: "proposals", action: "write" }
      : { resource: "catalog", action: "booking-session-write" },
  )
  const runtime = c.get("container")?.resolve(RELATIONSHIPS_ROUTE_RUNTIME_CONTAINER_KEY) as
    | RelationshipsRouteRuntime
    | undefined
  try {
    const inquiryId = c.req.valid("param").id
    if (command.kind === "proposal") {
      if (!runtime?.proposalInquiryConversion) {
        return c.json({ error: "Proposal conversion is unavailable" }, 503)
      }
      const result = await convertInquiryToProposal(
        c.get("db"),
        runtime.proposalInquiryConversion,
        inquiryId,
        command,
        actorId,
      )
      const body = { data: result }
      return result.kind === "created" ? c.json(body, 201) : c.json(body, 200)
    } else if (command.kind === "booking") {
      throw new InquiryBookingConversionRefusedError("booking_session_required")
    } else {
      if (!runtime?.inquiryBookingSession) {
        return c.json({ error: "Booking Session conversion is unavailable" }, 503)
      }
      const result = await convertInquiryToBookingTarget(
        c.get("db"),
        runtime.inquiryBookingSession,
        requireLink(c),
        inquiryId,
        command,
        actorId,
      )
      const body = { data: result }
      return result.kind === "created" ? c.json(body, 201) : c.json(body, 200)
    }
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
