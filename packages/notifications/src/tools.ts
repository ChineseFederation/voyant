import {
  admitHandlerActionPolicy,
  defineTool,
  type HandlerActionPolicyExpectation,
  READ_ONLY_RISK,
  requireService,
  type ToolContext,
  type ToolHandlerActionPolicyContext,
} from "@voyant-travel/tools"
import { listResponseSchema } from "@voyant-travel/types"
import { z } from "zod"

import { notificationDeliverySchema } from "./response-schemas.js"
import { notificationChannelSchema, notificationDeliveryListQuerySchema } from "./validation.js"

export interface SendTemplatedNotificationInput {
  templateSlug: string
  to: string
  channel?: z.infer<typeof notificationChannelSchema>
  data?: Record<string, unknown>
  bookingId?: string
  invoiceId?: string
  personId?: string
  organizationId?: string
}

export interface NotificationsToolServices {
  listDeliveries(query: z.infer<typeof notificationDeliveryListQuerySchema>): Promise<unknown>
  getDeliveryById(id: string): Promise<unknown>
  sendTemplated(
    input: SendTemplatedNotificationInput,
    admitted: ToolHandlerActionPolicyContext,
  ): Promise<unknown>
}

export type NotificationsToolContext = ToolContext & { notifications?: NotificationsToolServices }

function notifications(ctx: NotificationsToolContext): NotificationsToolServices {
  return requireService(ctx.notifications, "notifications")
}

export const listDeliveriesTool = defineTool<
  z.infer<typeof notificationDeliveryListQuerySchema>,
  unknown,
  NotificationsToolContext
>({
  name: "list_notification_deliveries",
  description: "List notification deliveries with filters and pagination. Read-only.",
  inputSchema: notificationDeliveryListQuerySchema,
  outputSchema: listResponseSchema(notificationDeliverySchema),
  requiredScopes: ["notifications:read"],
  tier: "read",
  riskPolicy: READ_ONLY_RISK,
  async handler(query, ctx) {
    return parseJsonResult(
      listResponseSchema(notificationDeliverySchema),
      await notifications(ctx).listDeliveries(query),
    )
  },
})

const getDeliveryArgs = z.object({
  id: z.string().min(1).describe("The notification delivery id."),
})

export const getDeliveryTool = defineTool<
  z.infer<typeof getDeliveryArgs>,
  unknown,
  NotificationsToolContext
>({
  name: "get_notification_delivery",
  description: "Read a single notification delivery by id. Read-only.",
  inputSchema: getDeliveryArgs,
  outputSchema: notificationDeliverySchema.nullable(),
  requiredScopes: ["notifications:read"],
  tier: "read",
  riskPolicy: READ_ONLY_RISK,
  async handler({ id }, ctx) {
    return parseJsonResult(
      notificationDeliverySchema.nullable(),
      await notifications(ctx).getDeliveryById(id),
    )
  },
})

const sendNotificationArgs = z
  .object({
    templateSlug: z.string().min(1),
    to: z.string().min(1),
    channel: notificationChannelSchema.optional(),
    data: z.record(z.string(), z.unknown()).optional(),
    bookingId: z.string().optional(),
    invoiceId: z.string().optional(),
    personId: z.string().optional(),
    organizationId: z.string().optional(),
  })
  .strict()

export const SEND_NOTIFICATION_HANDLER_POLICY = {
  capabilityId: "@voyant-travel/notifications#tool.send-notification",
  capabilityVersion: "v2",
  canonicalName: "send_notification",
  actionPolicy: {
    id: "@voyant-travel/notifications#action.send-notification",
    capabilityId: "@voyant-travel/notifications#action.send-notification",
    version: "v2",
    kind: "execute",
    targetType: "notification-template",
    commandTargetField: "templateSlug",
    targetLifecycle: "existing",
    existingTarget: { durability: "handler-command-result-v1" },
    risk: "high",
    ledger: "required",
    approval: "required",
    policy: "notifications-agent-send",
    reversible: false,
  },
} as const satisfies HandlerActionPolicyExpectation

export const sendNotificationTool = defineTool<
  z.infer<typeof sendNotificationArgs>,
  unknown,
  NotificationsToolContext
>({
  owner: "@voyant-travel/notifications",
  capabilityId: "@voyant-travel/notifications#tool.send-notification",
  capabilityVersion: "v2",
  name: "send_notification",
  description:
    "Accept a vetted template for durable asynchronous notification delivery. Returns an immutable pending delivery snapshot.",
  inputSchema: sendNotificationArgs,
  outputSchema: notificationDeliverySchema,
  requiredScopes: ["notifications:send"],
  tier: "destructive",
  riskPolicy: {
    destructive: true,
    reversible: false,
    dryRunSupported: false,
    confirmationRequired: true,
    sideEffects: ["email", "sms"],
  },
  annotations: { idempotentHint: true },
  actionPolicyEnforcement: "handler",
  async handler(input, ctx) {
    const admitted = admitHandlerActionPolicy(ctx, SEND_NOTIFICATION_HANDLER_POLICY)
    return parseJsonResult(
      notificationDeliverySchema,
      await notifications(ctx).sendTemplated(input, admitted),
    )
  },
})

export const notificationsTools = [
  listDeliveriesTool,
  getDeliveryTool,
  sendNotificationTool,
] as const

function parseJsonResult<T extends z.ZodType>(schema: T, value: unknown): z.output<T> {
  return schema.parse(toJsonValue(value))
}

function toJsonValue(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString()
  if (Array.isArray(value)) return value.map(toJsonValue)
  if (typeof value !== "object" || value === null) return value
  return Object.fromEntries(
    Object.entries(value)
      .map(([key, nested]) => [key, toJsonValue(nested)] as const)
      .filter(([, nested]) => nested !== undefined),
  )
}
