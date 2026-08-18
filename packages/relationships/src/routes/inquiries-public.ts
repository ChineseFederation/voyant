import { createRoute, OpenAPIHono, type z } from "@hono/zod-openapi"
import type { ModuleContainer } from "@voyant-travel/core"
import { openApiValidationHook, parseJsonBody } from "@voyant-travel/hono"
import {
  createPublicInquirySchema,
  publicInquiryReceiptSchema,
} from "@voyant-travel/relationships-contracts"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"
import type { Context, Next } from "hono"

import {
  RELATIONSHIPS_ROUTE_RUNTIME_CONTAINER_KEY,
  type RelationshipsRouteRuntime,
} from "../route-runtime.js"
import { InquiryServiceError, relationshipsService } from "../service/index.js"
import {
  RELATIONSHIPS_ROUTE_RUNTIME_CONTAINER_KEY,
  type RelationshipsRouteRuntime,
} from "../route-runtime.js"
import { errorResponseSchema } from "./rest-openapi-schemas.js"

type Env = {
  Variables: {
    db: PostgresJsDatabase
    userId?: string
    relationshipPersonId?: string | null
    publicChannel?: { channelId: string; channelStatus?: string | null }
    container?: ModuleContainer
  }
}

const jsonContent = <T extends z.ZodTypeAny>(schema: T) => ({
  content: { "application/json": { schema } },
})

const intakeRoute = createRoute({
  method: "post",
  path: "/inquiries",
  request: {
    body: {
      required: true,
      content: { "application/json": { schema: createPublicInquirySchema } },
    },
  },
  responses: {
    200: { description: "Replayed Inquiry intake", ...jsonContent(publicInquiryReceiptSchema) },
    201: { description: "Received Inquiry intake", ...jsonContent(publicInquiryReceiptSchema) },
    400: { description: "Invalid guarded intake request", ...jsonContent(errorResponseSchema) },
    403: {
      description: "Missing active channel or intake guard",
      ...jsonContent(errorResponseSchema),
    },
    404: { description: "Known Person or target not found", ...jsonContent(errorResponseSchema) },
    409: { description: "Inquiry intake conflict", ...jsonContent(errorResponseSchema) },
    429: { description: "Guarded intake rate limit exceeded", ...jsonContent(errorResponseSchema) },
    503: { description: "Target owner authority unavailable", ...jsonContent(errorResponseSchema) },
  },
})

export const publicInquiryRoutes = new OpenAPIHono<Env>({ defaultHook: openApiValidationHook })

async function requireActiveChannel(c: Context<Env>, next: Next) {
  const channel = c.get("publicChannel")
  if (!channel?.channelId || channel.channelStatus !== "active") {
    return c.json({ error: "Active channel context is required." }, 403)
  }
  return next()
}

publicInquiryRoutes.use("/inquiries", requireActiveChannel)

publicInquiryRoutes.openapi(intakeRoute, async (c) => {
  const input = await parseJsonBody(c, createPublicInquirySchema)
  const channelId = c.get("publicChannel")?.channelId
  if (!channelId) return c.json({ error: "Active channel context is required." }, 403)
  const customerUserId = c.get("userId")
  const runtime = c.get("container")?.resolve(RELATIONSHIPS_ROUTE_RUNTIME_CONTAINER_KEY) as
    | RelationshipsRouteRuntime
    | undefined
  try {
    const result = await relationshipsService.createPublicInquiry(c.get("db"), input, {
      actorId: customerUserId ? `customer:${customerUserId}` : `storefront:${channelId}`,
      channelId,
      relationshipPersonId: c.get("relationshipPersonId"),
      targetValidation: runtime?.inquiryTargetValidation,
      slaPolicy: runtime?.inquiryFirstResponseSlaPolicy,
    })
    const body = {
      data: {
        inquiryId: result.inquiry.id,
        status: "new" as const,
        duplicate: result.replayed,
        receivedAt: result.inquiry.createdAt.toISOString(),
      },
    }
    return result.replayed ? c.json(body, 200) : c.json(body, 201)
  } catch (error) {
    if (!(error instanceof InquiryServiceError)) throw error
    if (
      error.code === "INQUIRY_NOT_FOUND" ||
      error.code === "INQUIRY_RELATED_RECORD_NOT_FOUND" ||
      error.code === "INQUIRY_TARGET_NOT_FOUND"
    ) {
      return c.json({ error: error.message }, 404)
    }
    if (error.code === "INQUIRY_TARGET_VALIDATION_UNAVAILABLE") {
      return c.json({ error: error.message }, 503)
    }
    return c.json({ error: error.message }, 409)
  }
})
