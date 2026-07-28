// agent-quality: file-size exception -- owner: notifications; existing route module stays co-located until a dedicated split preserves behavior and tests.
//
// Migrated to `@hono/zod-openapi` for the OpenAPI admin backfill (voyant#2114).
// The factory `createNotificationsRoutes(options)` still constructs and returns
// an app with provider injection (`resolveProviders`/`resolveEventBus`/… read
// off the container or bindings) — only the registration style changed from
// plain Hono `.get/.post(...)` handlers to `createRoute(...).openapi(...)`. The
// 36 legs are organised into seven per-resource child `OpenAPIHono` sub-chains
// composed onto the returned parent via `.route("/", child)` so the `.openapi()`
// operations propagate up through whichever spec composes the standard
// notifications module (the routes mount at `/v1/admin/notifications/*`), while
// keeping type-inference cost bounded (one flat chain has O(n²) inference cost).
// Request schemas reuse the exported `validation.ts` insert/update/list-query
// schemas the handlers already parse; response row schemas are authored here
// from the Drizzle `$inferSelect` shapes (§17 dates → ISO strings). Endpoints
// that parse an optional/empty body (`parseOptionalJsonBody`) declare no forcing
// `request.body` and parse in-handler exactly as before.
import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi"
import type { EventBus, ModuleContainer } from "@voyant-travel/core"
import { openApiValidationHook, parseOptionalJsonBody } from "@voyant-travel/hono"
import { listResponseSchema } from "@voyant-travel/types"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"
import { notificationDeliverySchema } from "./response-schemas.js"
import { createNotificationService, notificationsService } from "./service.js"
import type { BookingDocumentAttachmentResolver } from "./service-booking-documents.js"
import type { NotificationProvider } from "./types.js"
import {
  bookingDocumentBundleSchema,
  composeNotificationReminderRuleSchema,
  confirmAndDispatchBookingResultSchema,
  confirmAndDispatchBookingSchema,
  insertNotificationReminderRuleSchema,
  insertNotificationReminderRuleStageSchema,
  insertNotificationReminderStageChannelSchema,
  insertNotificationTemplateSchema,
  notificationChannelSchema,
  notificationDeliveryListQuerySchema,
  notificationReminderRuleListQuerySchema,
  notificationReminderRunListQuerySchema,
  notificationReminderRunRecordSchema,
  notificationReminderStageAnchorSchema,
  notificationReminderStageCadenceIntervalSchema,
  notificationReminderStageCadenceKindSchema,
  notificationReminderStatusSchema,
  notificationReminderTargetTypeSchema,
  notificationStageRecipientKindSchema,
  notificationTemplateListQuerySchema,
  notificationTemplateStatusSchema,
  previewNotificationTemplateResultSchema,
  previewNotificationTemplateSchema,
  previewRemindersQuerySchema,
  reorderReminderRuleStagesSchema,
  runDueRemindersSchema,
  sendBookingDocumentsNotificationResultSchema,
  sendBookingDocumentsNotificationSchema,
  sendInvoiceNotificationSchema,
  sendPaymentSessionNotificationSchema,
  updateNotificationReminderRuleSchema,
  updateNotificationReminderRuleStageSchema,
  updateNotificationReminderStageChannelSchema,
  updateNotificationSettingsSchema,
  updateNotificationTemplateSchema,
} from "./validation.js"

type Env = {
  Bindings: Record<string, unknown>
  Variables: {
    container: ModuleContainer
    db: PostgresJsDatabase
    userId?: string
  }
}

export type NotificationsRoutesOptions = {
  providers?: ReadonlyArray<NotificationProvider>
  resolveProviders?: (bindings: Record<string, unknown>) => ReadonlyArray<NotificationProvider>
  publicCheckoutBaseUrl?: string | null
  resolvePublicCheckoutBaseUrl?: (bindings: Record<string, unknown>) => string | null | undefined
  publicCustomerPortalBaseUrl?: string | null
  resolvePublicCustomerPortalBaseUrl?: (
    bindings: Record<string, unknown>,
  ) => string | null | undefined
  documentAttachmentResolver?: BookingDocumentAttachmentResolver
  resolveDocumentAttachmentResolver?: (
    bindings: Record<string, unknown>,
  ) => BookingDocumentAttachmentResolver | undefined
  eventBus?: EventBus
  resolveEventBus?: (bindings: Record<string, unknown>) => EventBus | undefined
}

export type NotificationsRouteRuntime = {
  providers: ReadonlyArray<NotificationProvider>
  publicCheckoutBaseUrl?: string | null
  publicCustomerPortalBaseUrl?: string | null
  documentAttachmentResolver?: BookingDocumentAttachmentResolver
  eventBus?: EventBus
}

export const NOTIFICATIONS_ROUTE_RUNTIME_CONTAINER_KEY = "providers.notifications.runtime"

export function buildNotificationsRouteRuntime(
  bindings: Record<string, unknown>,
  options?: NotificationsRoutesOptions,
): NotificationsRouteRuntime {
  return {
    providers: options?.resolveProviders?.(bindings) ?? options?.providers ?? [],
    publicCheckoutBaseUrl:
      options?.resolvePublicCheckoutBaseUrl?.(bindings) ?? options?.publicCheckoutBaseUrl ?? null,
    publicCustomerPortalBaseUrl:
      options?.resolvePublicCustomerPortalBaseUrl?.(bindings) ??
      options?.publicCustomerPortalBaseUrl ??
      null,
    documentAttachmentResolver:
      options?.resolveDocumentAttachmentResolver?.(bindings) ?? options?.documentAttachmentResolver,
    eventBus: options?.resolveEventBus?.(bindings) ?? options?.eventBus,
  }
}

function getRuntime(
  bindings: Record<string, unknown>,
  options: NotificationsRoutesOptions | undefined,
  resolveFromContainer: (key: string) => NotificationsRouteRuntime,
): NotificationsRouteRuntime {
  try {
    return resolveFromContainer(NOTIFICATIONS_ROUTE_RUNTIME_CONTAINER_KEY)
  } catch {
    return buildNotificationsRouteRuntime(bindings, options)
  }
}

function idempotencyKey(
  c: { req: { header: (name: string) => string | undefined } },
  bodyKey?: string,
) {
  return c.req.header("Idempotency-Key") ?? bodyKey
}

// --- shared response schemas ------------------------------------------------

const errorResponseSchema = z.object({ error: z.string() })
const idSchema = z.string()
const isoTimestamp = z.string()
const jsonMetadata = z.record(z.string(), z.unknown())

const invalidRequestResponse = {
  description: "invalid_request: request body failed validation",
  content: { "application/json": { schema: errorResponseSchema } },
} as const

const notFoundResponse = (description: string) => ({
  description,
  content: { "application/json": { schema: errorResponseSchema } },
})

// §17: timestamps/dates are serialized to ISO strings on the wire.

const notificationTemplateSchema = z.object({
  id: idSchema,
  slug: z.string(),
  name: z.string(),
  channel: notificationChannelSchema,
  provider: z.string().nullable(),
  status: notificationTemplateStatusSchema,
  subjectTemplate: z.string().nullable(),
  htmlTemplate: z.string().nullable(),
  textTemplate: z.string().nullable(),
  fromAddress: z.string().nullable(),
  isSystem: z.boolean(),
  metadata: jsonMetadata.nullable(),
  createdAt: isoTimestamp,
  updatedAt: isoTimestamp,
})

const notificationReminderRuleSchema = z.object({
  id: idSchema,
  slug: z.string(),
  name: z.string(),
  status: notificationReminderStatusSchema,
  targetType: notificationReminderTargetTypeSchema,
  channel: notificationChannelSchema,
  provider: z.string().nullable(),
  templateId: z.string().nullable(),
  templateSlug: z.string().nullable(),
  priority: z.number().int(),
  suppressionGroup: z.string().nullable(),
  isSystem: z.boolean(),
  metadata: jsonMetadata.nullable(),
  createdAt: isoTimestamp,
  updatedAt: isoTimestamp,
})

const notificationReminderRuleStageSchema = z.object({
  id: idSchema,
  reminderRuleId: z.string(),
  orderIndex: z.number().int(),
  name: z.string().nullable(),
  anchor: notificationReminderStageAnchorSchema,
  windowStartDays: z.number().int(),
  windowEndDays: z.number().int(),
  cadenceKind: notificationReminderStageCadenceKindSchema,
  cadenceEveryDays: z.number().int().nullable(),
  cadenceIntervals: z.array(notificationReminderStageCadenceIntervalSchema).nullable(),
  maxSendsInStage: z.number().int().nullable(),
  respectQuietHours: z.boolean(),
  metadata: jsonMetadata.nullable(),
  createdAt: isoTimestamp,
  updatedAt: isoTimestamp,
})

const notificationReminderStageChannelSchema = z.object({
  id: idSchema,
  stageId: z.string(),
  orderIndex: z.number().int(),
  channel: notificationChannelSchema,
  provider: z.string().nullable(),
  templateId: z.string().nullable(),
  templateSlug: z.string().nullable(),
  recipientKind: notificationStageRecipientKindSchema,
  recipientRole: z.string().nullable(),
  metadata: jsonMetadata.nullable(),
  createdAt: isoTimestamp,
  updatedAt: isoTimestamp,
})

const notificationSettingsSchema = z.object({
  id: idSchema,
  scope: z.string(),
  quietHoursLocal: z.object({ start: z.string(), end: z.string(), tz: z.string() }).nullable(),
  blackoutDates: z.array(z.string()).nullable(),
  skipWeekends: z.boolean(),
  recipientRateLimitPerDay: z.number().int().nullable(),
  suppressionWindowHours: z.number().int(),
  metadata: jsonMetadata.nullable(),
  createdAt: isoTimestamp,
  updatedAt: isoTimestamp,
})

const reminderPreviewRowSchema = z.object({
  ruleId: z.string(),
  ruleName: z.string(),
  ruleSlug: z.string(),
  targetType: z.string(),
  targetId: z.string(),
  bookingId: z.string().nullable(),
  stageId: z.string(),
  stageName: z.string().nullable(),
  stageOrderIndex: z.number().int(),
  anchor: z.string(),
  anchorDate: isoTimestamp,
  scheduledAt: isoTimestamp,
  sendCountAtFire: z.number().int(),
  reasoning: z.string(),
})

const reminderSweepResultSchema = z.object({
  processed: z.number().int(),
  sent: z.number().int(),
  skipped: z.number().int(),
  failed: z.number().int(),
})

const composeReminderRuleResultSchema = z.object({
  ruleId: z.string(),
  stages: z.array(
    z.object({
      id: z.string(),
      orderIndex: z.number().int(),
      channels: z.array(z.object({ id: z.string(), orderIndex: z.number().int() })),
    }),
  ),
})

const composeReminderRuleInvalidSchema = z.object({
  error: z.literal("invalid_reminder_rule_graph"),
  issues: z.array(
    z.object({
      code: z.string(),
      field: z.string().optional(),
      message: z.string(),
      fix: z.string().optional(),
    }),
  ),
})

const idParamSchema = z.object({ id: idSchema })
const stageParamSchema = z.object({ id: idSchema, stageId: idSchema })
const channelParamSchema = z.object({ id: idSchema, stageId: idSchema, channelId: idSchema })

const dataEnvelope = <T extends z.ZodTypeAny>(schema: T) => z.object({ data: schema })
const noContentResponse = { description: "Deleted" } as const

export function createNotificationsRoutes(options?: NotificationsRoutesOptions) {
  // --- templates + preview --------------------------------------------------

  const listTemplatesRoute = createRoute({
    method: "get",
    path: "/templates",
    request: { query: notificationTemplateListQuerySchema },
    responses: {
      200: {
        description: "Paginated notification templates",
        content: {
          "application/json": { schema: listResponseSchema(notificationTemplateSchema) },
        },
      },
    },
  })

  const createTemplateRoute = createRoute({
    method: "post",
    path: "/templates",
    request: {
      body: {
        required: true,
        content: { "application/json": { schema: insertNotificationTemplateSchema } },
      },
    },
    responses: {
      201: {
        description: "The created notification template",
        content: { "application/json": { schema: dataEnvelope(notificationTemplateSchema) } },
      },
      400: invalidRequestResponse,
    },
  })

  const getTemplateRoute = createRoute({
    method: "get",
    path: "/templates/{id}",
    request: { params: idParamSchema },
    responses: {
      200: {
        description: "A notification template by id",
        content: { "application/json": { schema: dataEnvelope(notificationTemplateSchema) } },
      },
      404: notFoundResponse("Notification template not found"),
    },
  })

  const updateTemplateRoute = createRoute({
    method: "patch",
    path: "/templates/{id}",
    request: {
      params: idParamSchema,
      body: {
        required: true,
        content: { "application/json": { schema: updateNotificationTemplateSchema } },
      },
    },
    responses: {
      200: {
        description: "The updated notification template",
        content: { "application/json": { schema: dataEnvelope(notificationTemplateSchema) } },
      },
      400: invalidRequestResponse,
      404: notFoundResponse("Notification template not found"),
    },
  })

  const deleteTemplateRoute = createRoute({
    method: "delete",
    path: "/templates/{id}",
    request: { params: idParamSchema },
    responses: {
      204: noContentResponse,
      404: notFoundResponse("Notification template not found"),
    },
  })

  const previewTemplateRoute = createRoute({
    method: "post",
    path: "/preview",
    request: {
      body: {
        required: true,
        content: { "application/json": { schema: previewNotificationTemplateSchema } },
      },
    },
    responses: {
      200: {
        description: "The rendered template preview",
        content: {
          "application/json": { schema: dataEnvelope(previewNotificationTemplateResultSchema) },
        },
      },
      400: invalidRequestResponse,
    },
  })

  const templateRoutes = new OpenAPIHono<Env>({ defaultHook: openApiValidationHook })
    .openapi(listTemplatesRoute, async (c) =>
      c.json(await notificationsService.listTemplates(c.get("db"), c.req.valid("query")), 200),
    )
    .openapi(createTemplateRoute, async (c) => {
      const row = await notificationsService.createTemplate(c.get("db"), c.req.valid("json"))
      return c.json({ data: row! }, 201)
    })
    .openapi(getTemplateRoute, async (c) => {
      const row = await notificationsService.getTemplateById(c.get("db"), c.req.valid("param").id)
      return row
        ? c.json({ data: row }, 200)
        : c.json({ error: "Notification template not found" }, 404)
    })
    .openapi(updateTemplateRoute, async (c) => {
      const row = await notificationsService.updateTemplate(
        c.get("db"),
        c.req.valid("param").id,
        c.req.valid("json"),
      )
      return row
        ? c.json({ data: row }, 200)
        : c.json({ error: "Notification template not found" }, 404)
    })
    .openapi(deleteTemplateRoute, async (c) => {
      const ok = await notificationsService.deleteTemplate(c.get("db"), c.req.valid("param").id)
      return ok ? c.body(null, 204) : c.json({ error: "Notification template not found" }, 404)
    })
    .openapi(previewTemplateRoute, async (c) => {
      const rendered = notificationsService.previewNotificationTemplate(c.req.valid("json"))
      return c.json({ data: previewNotificationTemplateResultSchema.parse(rendered) }, 200)
    })

  // --- deliveries -----------------------------------------------------------

  const listDeliveriesRoute = createRoute({
    method: "get",
    path: "/deliveries",
    request: { query: notificationDeliveryListQuerySchema },
    responses: {
      200: {
        description: "Paginated notification deliveries",
        content: {
          "application/json": { schema: listResponseSchema(notificationDeliverySchema) },
        },
      },
    },
  })

  const getDeliveryRoute = createRoute({
    method: "get",
    path: "/deliveries/{id}",
    request: { params: idParamSchema },
    responses: {
      200: {
        description: "A notification delivery by id",
        content: { "application/json": { schema: dataEnvelope(notificationDeliverySchema) } },
      },
      404: notFoundResponse("Notification delivery not found"),
    },
  })

  const resendDeliveryRoute = createRoute({
    method: "post",
    path: "/deliveries/{id}/resend",
    request: {
      params: idParamSchema,
      body: {
        required: true,
        content: {
          "application/json": {
            schema: z.object({ idempotencyKey: z.string().trim().min(8).max(255) }),
          },
        },
      },
    },
    responses: {
      201: {
        description: "The resent notification delivery",
        content: { "application/json": { schema: dataEnvelope(notificationDeliverySchema) } },
      },
      400: invalidRequestResponse,
      404: notFoundResponse("Notification delivery not found"),
    },
  })

  const deliveryRoutes = new OpenAPIHono<Env>({ defaultHook: openApiValidationHook })
    .openapi(listDeliveriesRoute, async (c) =>
      c.json(await notificationsService.listDeliveries(c.get("db"), c.req.valid("query")), 200),
    )
    .openapi(getDeliveryRoute, async (c) => {
      const row = await notificationsService.getDeliveryById(c.get("db"), c.req.valid("param").id)
      return row
        ? c.json({ data: row }, 200)
        : c.json({ error: "Notification delivery not found" }, 404)
    })
    .openapi(resendDeliveryRoute, async (c) => {
      try {
        const runtime = getRuntime(c.env, options, (key) => c.var.container.resolve(key))
        const dispatcher = createNotificationService(runtime.providers)
        const row = await notificationsService.resendDelivery(
          c.get("db"),
          dispatcher,
          c.req.valid("param").id,
          c.req.valid("json").idempotencyKey,
        )
        if (!row) return c.json({ error: "Notification delivery not found" }, 404)
        return c.json({ data: row }, 201)
      } catch (error) {
        const message = error instanceof Error ? error.message : "Notification resend failed"
        return c.json({ error: message }, 400)
      }
    })

  // --- reminder rules -------------------------------------------------------

  const listReminderRulesRoute = createRoute({
    method: "get",
    path: "/reminder-rules",
    request: { query: notificationReminderRuleListQuerySchema },
    responses: {
      200: {
        description: "Paginated notification reminder rules",
        content: {
          "application/json": { schema: listResponseSchema(notificationReminderRuleSchema) },
        },
      },
    },
  })

  const createReminderRuleRoute = createRoute({
    method: "post",
    path: "/reminder-rules",
    request: {
      body: {
        required: true,
        content: { "application/json": { schema: insertNotificationReminderRuleSchema } },
      },
    },
    responses: {
      201: {
        description: "The created notification reminder rule",
        content: { "application/json": { schema: dataEnvelope(notificationReminderRuleSchema) } },
      },
      400: invalidRequestResponse,
    },
  })

  const composeReminderRuleRoute = createRoute({
    method: "post",
    path: "/reminder-rules/compose",
    request: {
      body: {
        required: true,
        content: { "application/json": { schema: composeNotificationReminderRuleSchema } },
      },
    },
    responses: {
      200: {
        description: "An existing reminder-rule graph (idempotent replay)",
        content: { "application/json": { schema: dataEnvelope(composeReminderRuleResultSchema) } },
      },
      201: {
        description: "The newly composed reminder-rule graph",
        content: { "application/json": { schema: dataEnvelope(composeReminderRuleResultSchema) } },
      },
      400: invalidRequestResponse,
      422: {
        description: "invalid_reminder_rule_graph: the proposed graph failed validation",
        content: { "application/json": { schema: composeReminderRuleInvalidSchema } },
      },
    },
  })

  const getReminderRuleRoute = createRoute({
    method: "get",
    path: "/reminder-rules/{id}",
    request: { params: idParamSchema },
    responses: {
      200: {
        description: "A notification reminder rule by id",
        content: { "application/json": { schema: dataEnvelope(notificationReminderRuleSchema) } },
      },
      404: notFoundResponse("Notification reminder rule not found"),
    },
  })

  const updateReminderRuleRoute = createRoute({
    method: "patch",
    path: "/reminder-rules/{id}",
    request: {
      params: idParamSchema,
      body: {
        required: true,
        content: { "application/json": { schema: updateNotificationReminderRuleSchema } },
      },
    },
    responses: {
      200: {
        description: "The updated notification reminder rule",
        content: { "application/json": { schema: dataEnvelope(notificationReminderRuleSchema) } },
      },
      400: invalidRequestResponse,
      404: notFoundResponse("Notification reminder rule not found"),
    },
  })

  const deleteReminderRuleRoute = createRoute({
    method: "delete",
    path: "/reminder-rules/{id}",
    request: { params: idParamSchema },
    responses: {
      204: noContentResponse,
      404: notFoundResponse("Notification reminder rule not found"),
    },
  })

  const reminderRuleRoutes = new OpenAPIHono<Env>({ defaultHook: openApiValidationHook })
    .openapi(listReminderRulesRoute, async (c) =>
      c.json(await notificationsService.listReminderRules(c.get("db"), c.req.valid("query")), 200),
    )
    .openapi(createReminderRuleRoute, async (c) => {
      const row = await notificationsService.createReminderRule(c.get("db"), c.req.valid("json"))
      return c.json({ data: row! }, 201)
    })
    .openapi(composeReminderRuleRoute, async (c) => {
      const body = c.req.valid("json")
      const outcome = await notificationsService.composeNotificationReminderRule(
        c.get("db"),
        body,
        {
          idempotencyKey: idempotencyKey(c, body.idempotencyKey),
        },
      )
      if (outcome.status === "invalid") {
        return c.json(
          { error: "invalid_reminder_rule_graph", issues: outcome.issues } as const,
          422,
        )
      }
      return c.json({ data: outcome.result }, outcome.reused ? 200 : 201)
    })
    .openapi(getReminderRuleRoute, async (c) => {
      const row = await notificationsService.getReminderRuleById(
        c.get("db"),
        c.req.valid("param").id,
      )
      return row
        ? c.json({ data: row }, 200)
        : c.json({ error: "Notification reminder rule not found" }, 404)
    })
    .openapi(updateReminderRuleRoute, async (c) => {
      const row = await notificationsService.updateReminderRule(
        c.get("db"),
        c.req.valid("param").id,
        c.req.valid("json"),
      )
      return row
        ? c.json({ data: row }, 200)
        : c.json({ error: "Notification reminder rule not found" }, 404)
    })
    .openapi(deleteReminderRuleRoute, async (c) => {
      const ok = await notificationsService.deleteReminderRule(c.get("db"), c.req.valid("param").id)
      return ok ? c.body(null, 204) : c.json({ error: "Notification reminder rule not found" }, 404)
    })

  // --- reminder-rule stages -------------------------------------------------

  const listStagesRoute = createRoute({
    method: "get",
    path: "/reminder-rules/{id}/stages",
    request: { params: idParamSchema },
    responses: {
      200: {
        description: "The reminder rule's stages",
        content: {
          "application/json": {
            schema: dataEnvelope(z.array(notificationReminderRuleStageSchema)),
          },
        },
      },
    },
  })

  const createStageRoute = createRoute({
    method: "post",
    path: "/reminder-rules/{id}/stages",
    request: {
      params: idParamSchema,
      body: {
        required: true,
        content: { "application/json": { schema: insertNotificationReminderRuleStageSchema } },
      },
    },
    responses: {
      201: {
        description: "The created reminder rule stage",
        content: {
          "application/json": { schema: dataEnvelope(notificationReminderRuleStageSchema) },
        },
      },
      400: invalidRequestResponse,
    },
  })

  const reorderStagesRoute = createRoute({
    method: "post",
    path: "/reminder-rules/{id}/stages/reorder",
    request: {
      params: idParamSchema,
      body: {
        required: true,
        content: { "application/json": { schema: reorderReminderRuleStagesSchema } },
      },
    },
    responses: {
      200: {
        description: "The reordered reminder rule stages",
        content: {
          "application/json": {
            schema: dataEnvelope(z.array(notificationReminderRuleStageSchema)),
          },
        },
      },
      400: invalidRequestResponse,
    },
  })

  const updateStageRoute = createRoute({
    method: "patch",
    path: "/reminder-rules/{id}/stages/{stageId}",
    request: {
      params: stageParamSchema,
      body: {
        required: true,
        content: { "application/json": { schema: updateNotificationReminderRuleStageSchema } },
      },
    },
    responses: {
      200: {
        description: "The updated reminder rule stage",
        content: {
          "application/json": { schema: dataEnvelope(notificationReminderRuleStageSchema) },
        },
      },
      400: invalidRequestResponse,
      404: notFoundResponse("Reminder stage not found"),
    },
  })

  const deleteStageRoute = createRoute({
    method: "delete",
    path: "/reminder-rules/{id}/stages/{stageId}",
    request: { params: stageParamSchema },
    responses: {
      204: noContentResponse,
      404: notFoundResponse("Reminder stage not found"),
    },
  })

  const stageRoutes = new OpenAPIHono<Env>({ defaultHook: openApiValidationHook })
    .openapi(listStagesRoute, async (c) => {
      const stages = await notificationsService.listReminderRuleStages(
        c.get("db"),
        c.req.valid("param").id,
      )
      return c.json({ data: stages }, 200)
    })
    .openapi(createStageRoute, async (c) => {
      const stage = await notificationsService.createReminderRuleStage(
        c.get("db"),
        c.req.valid("param").id,
        c.req.valid("json"),
      )
      return c.json({ data: stage }, 201)
    })
    .openapi(reorderStagesRoute, async (c) => {
      const stages = await notificationsService.reorderReminderRuleStages(
        c.get("db"),
        c.req.valid("param").id,
        c.req.valid("json"),
      )
      return c.json({ data: stages }, 200)
    })
    .openapi(updateStageRoute, async (c) => {
      const stage = await notificationsService.updateReminderRuleStage(
        c.get("db"),
        c.req.valid("param").stageId,
        c.req.valid("json"),
      )
      return stage
        ? c.json({ data: stage }, 200)
        : c.json({ error: "Reminder stage not found" }, 404)
    })
    .openapi(deleteStageRoute, async (c) => {
      const ok = await notificationsService.deleteReminderRuleStage(
        c.get("db"),
        c.req.valid("param").stageId,
      )
      return ok ? c.body(null, 204) : c.json({ error: "Reminder stage not found" }, 404)
    })

  // --- reminder-stage channels ----------------------------------------------

  const listStageChannelsRoute = createRoute({
    method: "get",
    path: "/reminder-rules/{id}/stages/{stageId}/channels",
    request: { params: stageParamSchema },
    responses: {
      200: {
        description: "The stage's channels",
        content: {
          "application/json": {
            schema: dataEnvelope(z.array(notificationReminderStageChannelSchema)),
          },
        },
      },
    },
  })

  const createStageChannelRoute = createRoute({
    method: "post",
    path: "/reminder-rules/{id}/stages/{stageId}/channels",
    request: {
      params: stageParamSchema,
      body: {
        required: true,
        content: { "application/json": { schema: insertNotificationReminderStageChannelSchema } },
      },
    },
    responses: {
      201: {
        description: "The created stage channel",
        content: {
          "application/json": { schema: dataEnvelope(notificationReminderStageChannelSchema) },
        },
      },
      400: invalidRequestResponse,
    },
  })

  const updateStageChannelRoute = createRoute({
    method: "patch",
    path: "/reminder-rules/{id}/stages/{stageId}/channels/{channelId}",
    request: {
      params: channelParamSchema,
      body: {
        required: true,
        content: { "application/json": { schema: updateNotificationReminderStageChannelSchema } },
      },
    },
    responses: {
      200: {
        description: "The updated stage channel",
        content: {
          "application/json": { schema: dataEnvelope(notificationReminderStageChannelSchema) },
        },
      },
      400: invalidRequestResponse,
      404: notFoundResponse("Stage channel not found"),
    },
  })

  const deleteStageChannelRoute = createRoute({
    method: "delete",
    path: "/reminder-rules/{id}/stages/{stageId}/channels/{channelId}",
    request: { params: channelParamSchema },
    responses: {
      204: noContentResponse,
      404: notFoundResponse("Stage channel not found"),
    },
  })

  const stageChannelRoutes = new OpenAPIHono<Env>({ defaultHook: openApiValidationHook })
    .openapi(listStageChannelsRoute, async (c) => {
      const channels = await notificationsService.listStageChannels(
        c.get("db"),
        c.req.valid("param").stageId,
      )
      return c.json({ data: channels }, 200)
    })
    .openapi(createStageChannelRoute, async (c) => {
      const row = await notificationsService.createStageChannel(
        c.get("db"),
        c.req.valid("param").stageId,
        c.req.valid("json"),
      )
      return c.json({ data: row }, 201)
    })
    .openapi(updateStageChannelRoute, async (c) => {
      const row = await notificationsService.updateStageChannel(
        c.get("db"),
        c.req.valid("param").channelId,
        c.req.valid("json"),
      )
      return row ? c.json({ data: row }, 200) : c.json({ error: "Stage channel not found" }, 404)
    })
    .openapi(deleteStageChannelRoute, async (c) => {
      const ok = await notificationsService.deleteStageChannel(
        c.get("db"),
        c.req.valid("param").channelId,
      )
      return ok ? c.body(null, 204) : c.json({ error: "Stage channel not found" }, 404)
    })

  // --- settings, reminders preview / runs / run-due -------------------------

  const getSettingsRoute = createRoute({
    method: "get",
    path: "/notification-settings",
    responses: {
      200: {
        description: "The notification settings",
        content: { "application/json": { schema: dataEnvelope(notificationSettingsSchema) } },
      },
    },
  })

  const updateSettingsRoute = createRoute({
    method: "patch",
    path: "/notification-settings",
    request: {
      body: {
        required: true,
        content: { "application/json": { schema: updateNotificationSettingsSchema } },
      },
    },
    responses: {
      200: {
        description: "The updated notification settings",
        content: { "application/json": { schema: dataEnvelope(notificationSettingsSchema) } },
      },
      400: invalidRequestResponse,
    },
  })

  const previewRemindersRoute = createRoute({
    method: "get",
    path: "/reminders/preview",
    request: { query: previewRemindersQuerySchema },
    responses: {
      200: {
        description: "Reminders that would fire for the requested date",
        content: {
          "application/json": { schema: dataEnvelope(z.array(reminderPreviewRowSchema)) },
        },
      },
    },
  })

  const listReminderRunsRoute = createRoute({
    method: "get",
    path: "/reminder-runs",
    request: { query: notificationReminderRunListQuerySchema },
    responses: {
      200: {
        description: "Paginated notification reminder runs",
        content: {
          "application/json": { schema: listResponseSchema(notificationReminderRunRecordSchema) },
        },
      },
    },
  })

  const getReminderRunRoute = createRoute({
    method: "get",
    path: "/reminder-runs/{id}",
    request: { params: idParamSchema },
    responses: {
      200: {
        description: "A notification reminder run by id",
        content: {
          "application/json": { schema: dataEnvelope(notificationReminderRunRecordSchema) },
        },
      },
      404: notFoundResponse("Notification reminder run not found"),
    },
  })

  const runDueRemindersRoute = createRoute({
    method: "post",
    path: "/reminders/run-due",
    responses: {
      200: {
        description: "The reminder sweep result",
        content: { "application/json": { schema: dataEnvelope(reminderSweepResultSchema) } },
      },
      400: invalidRequestResponse,
    },
  })

  const settingsAndRunsRoutes = new OpenAPIHono<Env>({ defaultHook: openApiValidationHook })
    .openapi(getSettingsRoute, async (c) => {
      const row = await notificationsService.getNotificationSettings(c.get("db"))
      return c.json({ data: row }, 200)
    })
    .openapi(updateSettingsRoute, async (c) => {
      const row = await notificationsService.upsertNotificationSettings(
        c.get("db"),
        c.req.valid("json"),
      )
      return c.json({ data: row }, 200)
    })
    .openapi(previewRemindersRoute, async (c) => {
      const query = c.req.valid("query")
      const now = query.date ? new Date(`${query.date}T00:00:00Z`) : new Date()
      const rows = await notificationsService.previewReminders(c.get("db"), {
        now,
        ruleId: query.ruleId,
        targetId: query.targetId,
      })
      return c.json({ data: rows }, 200)
    })
    .openapi(listReminderRunsRoute, async (c) =>
      c.json(await notificationsService.listReminderRuns(c.get("db"), c.req.valid("query")), 200),
    )
    .openapi(getReminderRunRoute, async (c) => {
      const row = await notificationsService.getReminderRunById(
        c.get("db"),
        c.req.valid("param").id,
      )
      return row
        ? c.json({ data: row }, 200)
        : c.json({ error: "Notification reminder run not found" }, 404)
    })
    .openapi(runDueRemindersRoute, async (c) => {
      try {
        const runtime = getRuntime(c.env, options, (key) => c.var.container.resolve(key))
        const dispatcher = createNotificationService(runtime.providers)
        const result = await notificationsService.runDueReminders(
          c.get("db"),
          dispatcher,
          await parseOptionalJsonBody(c, runDueRemindersSchema),
        )
        return c.json({ data: result }, 200)
      } catch (error) {
        const message = error instanceof Error ? error.message : "Reminder sweep failed"
        return c.json({ error: message }, 400)
      }
    })

  // --- dispatch (sends + booking documents) ---------------------------------

  const sendPaymentSessionRoute = createRoute({
    method: "post",
    path: "/payment-sessions/{id}/send",
    request: {
      params: idParamSchema,
      body: {
        required: true,
        content: { "application/json": { schema: sendPaymentSessionNotificationSchema } },
      },
    },
    responses: {
      201: {
        description: "The dispatched payment-session notification delivery",
        content: { "application/json": { schema: dataEnvelope(notificationDeliverySchema) } },
      },
      400: invalidRequestResponse,
      404: notFoundResponse("Payment session not found"),
    },
  })

  const sendInvoiceRoute = createRoute({
    method: "post",
    path: "/invoices/{id}/send",
    request: {
      params: idParamSchema,
      body: {
        required: true,
        content: { "application/json": { schema: sendInvoiceNotificationSchema } },
      },
    },
    responses: {
      201: {
        description: "The dispatched invoice notification delivery",
        content: { "application/json": { schema: dataEnvelope(notificationDeliverySchema) } },
      },
      400: invalidRequestResponse,
      404: notFoundResponse("Invoice not found"),
    },
  })

  const documentBundleRoute = createRoute({
    method: "get",
    path: "/bookings/{id}/document-bundle",
    request: { params: idParamSchema },
    responses: {
      200: {
        description: "The booking's deliverable document bundle",
        content: { "application/json": { schema: dataEnvelope(bookingDocumentBundleSchema) } },
      },
      404: notFoundResponse("Booking not found"),
    },
  })

  const confirmAndDispatchRoute = createRoute({
    method: "post",
    path: "/bookings/{id}/confirm-and-dispatch",
    request: {
      params: idParamSchema,
      body: {
        required: true,
        content: { "application/json": { schema: confirmAndDispatchBookingSchema } },
      },
    },
    responses: {
      200: {
        description: "Preview / skipped outcome (no delivery attempted)",
        content: {
          "application/json": { schema: dataEnvelope(confirmAndDispatchBookingResultSchema) },
        },
      },
      201: {
        description: "Confirm-and-dispatch result with a delivery",
        content: {
          "application/json": { schema: dataEnvelope(confirmAndDispatchBookingResultSchema) },
        },
      },
      400: invalidRequestResponse,
      404: notFoundResponse("Booking not found"),
    },
  })

  const sendDocumentsRoute = createRoute({
    method: "post",
    path: "/bookings/{id}/send-documents",
    request: {
      params: idParamSchema,
      body: {
        required: true,
        content: { "application/json": { schema: sendBookingDocumentsNotificationSchema } },
      },
    },
    responses: {
      201: {
        description: "The dispatched booking-documents notification result",
        content: {
          "application/json": {
            schema: dataEnvelope(sendBookingDocumentsNotificationResultSchema),
          },
        },
      },
      400: invalidRequestResponse,
      404: notFoundResponse("Booking not found"),
    },
  })

  const dispatchRoutes = new OpenAPIHono<Env>({ defaultHook: openApiValidationHook })
    .openapi(sendPaymentSessionRoute, async (c) => {
      try {
        const runtime = getRuntime(c.env, options, (key) => c.var.container.resolve(key))
        const dispatcher = createNotificationService(runtime.providers)
        const row = await notificationsService.sendPaymentSessionNotification(
          c.get("db"),
          dispatcher,
          c.req.valid("param").id,
          c.req.valid("json"),
          {
            paymentLinkBaseUrl: runtime.publicCheckoutBaseUrl,
            publicCustomerPortalBaseUrl: runtime.publicCustomerPortalBaseUrl,
          },
        )
        if (!row) return c.json({ error: "Payment session not found" }, 404)
        return c.json({ data: row }, 201)
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Payment session notification failed"
        return c.json({ error: message }, 400)
      }
    })
    .openapi(sendInvoiceRoute, async (c) => {
      try {
        const runtime = getRuntime(c.env, options, (key) => c.var.container.resolve(key))
        const dispatcher = createNotificationService(runtime.providers)
        const row = await notificationsService.sendInvoiceNotification(
          c.get("db"),
          dispatcher,
          c.req.valid("param").id,
          c.req.valid("json"),
          {
            paymentLinkBaseUrl: runtime.publicCheckoutBaseUrl,
            publicCustomerPortalBaseUrl: runtime.publicCustomerPortalBaseUrl,
          },
        )
        if (!row) return c.json({ error: "Invoice not found" }, 404)
        return c.json({ data: row }, 201)
      } catch (error) {
        const message = error instanceof Error ? error.message : "Invoice notification failed"
        return c.json({ error: message }, 400)
      }
    })
    .openapi(documentBundleRoute, async (c) => {
      const bundle = await notificationsService.listBookingDocumentBundle(
        c.get("db"),
        c.req.valid("param").id,
      )
      if (!bundle) return c.json({ error: "Booking not found" }, 404)
      return c.json({ data: bookingDocumentBundleSchema.parse(bundle) }, 200)
    })
    .openapi(confirmAndDispatchRoute, async (c) => {
      try {
        const runtime = getRuntime(c.env, options, (key) => c.var.container.resolve(key))
        const dispatcher = createNotificationService(runtime.providers)
        const result = await notificationsService.confirmAndDispatchBooking(
          c.get("db"),
          dispatcher,
          c.req.valid("param").id,
          c.req.valid("json"),
          {
            attachmentResolver: runtime.documentAttachmentResolver,
            publicCustomerPortalBaseUrl: runtime.publicCustomerPortalBaseUrl,
          },
        )
        if (result.status === "not_found") return c.json({ error: "Booking not found" }, 404)
        if (result.status === "preview") {
          return c.json(
            {
              data: confirmAndDispatchBookingResultSchema.parse({
                bookingId: result.bookingId,
                documents: result.documents,
                notification: null,
                skipReason: "preview_only",
              }),
            },
            200,
          )
        }
        if (result.status === "skipped") {
          return c.json(
            {
              data: confirmAndDispatchBookingResultSchema.parse({
                bookingId: result.bookingId,
                documents: result.documents,
                notification: null,
                skipReason: result.skipReason,
              }),
            },
            200,
          )
        }
        return c.json(
          {
            data: confirmAndDispatchBookingResultSchema.parse({
              bookingId: result.bookingId,
              documents: result.documents,
              notification: {
                recipient: result.recipient,
                deliveryId: result.delivery.id,
                provider: result.delivery.provider,
                status: result.delivery.status,
              },
              skipReason: null,
            }),
          },
          201,
        )
      } catch (error) {
        const message = error instanceof Error ? error.message : "Confirm-and-dispatch failed"
        return c.json({ error: message }, 400)
      }
    })
    .openapi(sendDocumentsRoute, async (c) => {
      try {
        const runtime = getRuntime(c.env, options, (key) => c.var.container.resolve(key))
        const dispatcher = createNotificationService(runtime.providers)
        const result = await notificationsService.sendBookingDocumentsNotification(
          c.get("db"),
          dispatcher,
          c.req.valid("param").id,
          c.req.valid("json"),
          {
            attachmentResolver: runtime.documentAttachmentResolver,
            publicCustomerPortalBaseUrl: runtime.publicCustomerPortalBaseUrl,
          },
        )
        if (result.status === "not_found") return c.json({ error: "Booking not found" }, 404)
        if (result.status === "no_documents") return c.json({ error: "No booking documents" }, 400)
        if (result.status === "no_recipient")
          return c.json({ error: "No recipient available" }, 400)
        if (result.status === "no_attachments") {
          return c.json({ error: "No deliverable document attachments available" }, 400)
        }
        if (result.status === "send_failed") {
          return c.json({ error: "Booking document notification failed" }, 400)
        }
        return c.json(
          {
            data: sendBookingDocumentsNotificationResultSchema.parse({
              bookingId: result.bookingId,
              recipient: result.recipient,
              documents: result.documents,
              deliveryId: result.delivery.id,
              provider: result.delivery.provider,
              status: result.delivery.status,
            }),
          },
          201,
        )
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Booking document notification failed"
        return c.json({ error: message }, 400)
      }
    })

  // Compose the per-resource sub-chains onto a single returned `OpenAPIHono` so
  // the `.openapi()` operations propagate up through the composed admin app
  // (`OpenAPIHono.route` copies each sub-app's registered routes).
  return new OpenAPIHono<Env>({ defaultHook: openApiValidationHook })
    .route("/", templateRoutes)
    .route("/", deliveryRoutes)
    .route("/", reminderRuleRoutes)
    .route("/", stageRoutes)
    .route("/", stageChannelRoutes)
    .route("/", settingsAndRunsRoutes)
    .route("/", dispatchRoutes)
}
