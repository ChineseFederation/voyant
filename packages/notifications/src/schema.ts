// agent-quality: file-size exception -- owner: notifications; existing schema contract stays co-located until a dedicated split preserves behavior and tests.
import type { LinkableDefinition, Module } from "@voyant-travel/core"
import { typeId, typeIdRef } from "@voyant-travel/db/lib/typeid-column"
import type { ApiModule } from "@voyant-travel/hono/module"
import { relations } from "drizzle-orm"
import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core"

export const notificationChannelEnum = pgEnum("notification_channel", ["email", "sms"])

export const notificationTemplateStatusEnum = pgEnum("notification_template_status", [
  "draft",
  "active",
  "archived",
])

export const notificationDeliveryStatusEnum = pgEnum("notification_delivery_status", [
  "pending",
  "sent",
  "failed",
  "cancelled",
])

export const notificationSendOperationStatusEnum = pgEnum("notification_send_operation_status", [
  "pending",
  "processing",
  "retry",
  "sent",
  "dead_letter",
])

export const notificationTargetTypeEnum = pgEnum("notification_target_type", [
  "booking",
  "booking_payment_schedule",
  "booking_guarantee",
  "invoice",
  "payment_session",
  "person",
  "organization",
  "other",
])

export const notificationReminderStatusEnum = pgEnum("notification_reminder_status", [
  "draft",
  "active",
  "archived",
])

export const notificationReminderTargetTypeEnum = pgEnum("notification_reminder_target_type", [
  "booking_confirmed",
  "booking_payment_schedule",
  "payment_complete",
  "booking_cancelled_non_payment",
  "invoice",
])

export const notificationReminderRunStatusEnum = pgEnum("notification_reminder_run_status", [
  "queued",
  "processing",
  "sent",
  "skipped",
  "failed",
])

export const notificationReminderStageAnchorEnum = pgEnum("notification_reminder_stage_anchor", [
  "due_date",
  "booking_created_at",
  "departure_date",
  "invoice_issued_at",
  "last_send_at",
])

export const notificationReminderStageCadenceKindEnum = pgEnum(
  "notification_reminder_stage_cadence_kind",
  ["once", "every_n_days", "escalating"],
)

export const notificationStageRecipientKindEnum = pgEnum("notification_stage_recipient_kind", [
  "primary",
  "cc",
  "bcc",
])

export const notificationTemplates = pgTable(
  "notification_templates",
  {
    id: typeId("notification_templates"),
    slug: text("slug").notNull().unique(),
    name: text("name").notNull(),
    channel: notificationChannelEnum("channel").notNull(),
    provider: text("provider"),
    status: notificationTemplateStatusEnum("status").notNull().default("draft"),
    subjectTemplate: text("subject_template"),
    htmlTemplate: text("html_template"),
    textTemplate: text("text_template"),
    fromAddress: text("from_address"),
    isSystem: boolean("is_system").notNull().default(false),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_notification_templates_updated").on(table.updatedAt),
    index("idx_notification_templates_channel_updated").on(table.channel, table.updatedAt),
    index("idx_notification_templates_provider_updated").on(table.provider, table.updatedAt),
    index("idx_notification_templates_status_updated").on(table.status, table.updatedAt),
    uniqueIndex("uidx_notification_templates_slug").on(table.slug),
  ],
)

export type NotificationTemplate = typeof notificationTemplates.$inferSelect
export type NewNotificationTemplate = typeof notificationTemplates.$inferInsert

export const notificationDeliveries = pgTable(
  "notification_deliveries",
  {
    id: typeId("notification_deliveries"),
    templateId: typeIdRef("template_id").references(() => notificationTemplates.id, {
      onDelete: "set null",
    }),
    templateSlug: text("template_slug"),
    targetType: notificationTargetTypeEnum("target_type").notNull().default("other"),
    targetId: text("target_id"),
    personId: text("person_id"),
    organizationId: text("organization_id"),
    bookingId: text("booking_id"),
    invoiceId: text("invoice_id"),
    paymentSessionId: text("payment_session_id"),
    channel: notificationChannelEnum("channel").notNull(),
    provider: text("provider").notNull(),
    providerMessageId: text("provider_message_id"),
    status: notificationDeliveryStatusEnum("status").notNull().default("pending"),
    toAddress: text("to_address").notNull(),
    fromAddress: text("from_address"),
    subject: text("subject"),
    htmlBody: text("html_body"),
    textBody: text("text_body"),
    payloadData: jsonb("payload_data").$type<Record<string, unknown>>(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    errorMessage: text("error_message"),
    scheduledFor: timestamp("scheduled_for", { withTimezone: true }),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    failedAt: timestamp("failed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_notification_deliveries_created").on(table.createdAt),
    index("idx_notification_deliveries_template_created").on(table.templateId, table.createdAt),
    index("idx_notification_deliveries_target_created").on(
      table.targetType,
      table.targetId,
      table.createdAt,
    ),
    index("idx_notification_deliveries_person_created").on(table.personId, table.createdAt),
    index("idx_notification_deliveries_org_created").on(table.organizationId, table.createdAt),
    index("idx_notification_deliveries_booking_created").on(table.bookingId, table.createdAt),
    index("idx_notification_deliveries_invoice_created").on(table.invoiceId, table.createdAt),
    index("idx_notification_deliveries_payment_session_created").on(
      table.paymentSessionId,
      table.createdAt,
    ),
    index("idx_notification_deliveries_channel_created").on(table.channel, table.createdAt),
    index("idx_notification_deliveries_provider_created").on(table.provider, table.createdAt),
    index("idx_notification_deliveries_status_created").on(table.status, table.createdAt),
    index("idx_notification_deliveries_scheduled_for").on(table.scheduledFor),
  ],
)

export type NotificationDelivery = typeof notificationDeliveries.$inferSelect
export type NewNotificationDelivery = typeof notificationDeliveries.$inferInsert

/**
 * Package-owned durable state for every notification enqueue.
 *
 * This row owns canonical drift detection, the exact rendered provider request,
 * the stable provider idempotency key, retry lease, and delivery result.
 */
export const notificationSendOperations = pgTable(
  "notification_send_operations",
  {
    id: typeId("notification_send_operations"),
    commandScope: text("command_scope").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    requestFingerprint: text("request_fingerprint").notNull(),
    claimActionId: text("claim_action_id").notNull().unique(),
    organizationId: text("organization_id"),
    targetType: text("target_type").notNull(),
    targetId: text("target_id").notNull(),
    deliveryId: typeIdRef("delivery_id")
      .notNull()
      .references(() => notificationDeliveries.id, { onDelete: "restrict" }),
    provider: text("provider").notNull(),
    providerIdempotencyKey: text("provider_idempotency_key").notNull(),
    requestPayload: jsonb("request_payload").$type<Record<string, unknown>>().notNull(),
    resultSnapshot: jsonb("result_snapshot").$type<Record<string, unknown>>().notNull(),
    terminalEvent: jsonb("terminal_event").$type<{
      name: string
      data: Record<string, unknown>
    } | null>(),
    status: notificationSendOperationStatusEnum("status").notNull().default("pending"),
    attempts: integer("attempts").notNull().default(0),
    maxAttempts: integer("max_attempts").notNull().default(8),
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }).notNull().defaultNow(),
    leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true }),
    lastError: text("last_error"),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("uidx_notification_send_operations_command").on(
      table.commandScope,
      table.idempotencyKey,
    ),
    uniqueIndex("uidx_notification_send_operations_provider_key").on(
      table.provider,
      table.providerIdempotencyKey,
    ),
    index("idx_notification_send_operations_due").on(
      table.status,
      table.nextAttemptAt,
      table.leaseExpiresAt,
    ),
    index("idx_notification_send_operations_delivery").on(table.deliveryId),
  ],
)

export type NotificationSendOperation = typeof notificationSendOperations.$inferSelect
export type NewNotificationSendOperation = typeof notificationSendOperations.$inferInsert

export const notificationReminderRules = pgTable(
  "notification_reminder_rules",
  {
    id: typeId("notification_reminder_rules"),
    slug: text("slug").notNull().unique(),
    name: text("name").notNull(),
    status: notificationReminderStatusEnum("status").notNull().default("draft"),
    targetType: notificationReminderTargetTypeEnum("target_type").notNull(),
    channel: notificationChannelEnum("channel").notNull(),
    provider: text("provider"),
    templateId: typeIdRef("template_id").references(() => notificationTemplates.id, {
      onDelete: "set null",
    }),
    templateSlug: text("template_slug"),
    priority: integer("priority").notNull().default(0),
    suppressionGroup: text("suppression_group"),
    isSystem: boolean("is_system").notNull().default(false),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_notification_reminder_rules_updated").on(table.updatedAt),
    index("idx_notification_reminder_rules_status_updated").on(table.status, table.updatedAt),
    index("idx_notification_reminder_rules_target_updated").on(table.targetType, table.updatedAt),
    index("idx_notification_reminder_rules_channel_updated").on(table.channel, table.updatedAt),
    index("idx_notification_reminder_rules_priority").on(table.priority),
    index("idx_notification_reminder_rules_suppression_group").on(table.suppressionGroup),
    uniqueIndex("uidx_notification_reminder_rules_slug").on(table.slug),
  ],
)

export type NotificationReminderRule = typeof notificationReminderRules.$inferSelect
export type NewNotificationReminderRule = typeof notificationReminderRules.$inferInsert

export const notificationReminderRuns = pgTable(
  "notification_reminder_runs",
  {
    id: typeId("notification_reminder_runs"),
    reminderRuleId: typeIdRef("reminder_rule_id")
      .notNull()
      .references(() => notificationReminderRules.id, { onDelete: "cascade" }),
    targetType: notificationReminderTargetTypeEnum("target_type").notNull(),
    targetId: text("target_id").notNull(),
    dedupeKey: text("dedupe_key").notNull().unique(),
    bookingId: text("booking_id"),
    personId: text("person_id"),
    organizationId: text("organization_id"),
    paymentSessionId: text("payment_session_id"),
    notificationDeliveryId: typeIdRef("notification_delivery_id").references(
      () => notificationDeliveries.id,
      { onDelete: "set null" },
    ),
    status: notificationReminderRunStatusEnum("status").notNull(),
    recipient: text("recipient"),
    scheduledFor: timestamp("scheduled_for", { withTimezone: true }).notNull(),
    processedAt: timestamp("processed_at", { withTimezone: true }).notNull().defaultNow(),
    errorMessage: text("error_message"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_notification_reminder_runs_created").on(table.createdAt),
    index("idx_notification_reminder_runs_rule_created").on(table.reminderRuleId, table.createdAt),
    index("idx_notification_reminder_runs_target_created").on(
      table.targetType,
      table.targetId,
      table.createdAt,
    ),
    index("idx_notification_reminder_runs_booking_created").on(table.bookingId, table.createdAt),
    index("idx_notification_reminder_runs_payment_session_created").on(
      table.paymentSessionId,
      table.createdAt,
    ),
    index("idx_notification_reminder_runs_delivery_created").on(
      table.notificationDeliveryId,
      table.createdAt,
    ),
    index("idx_notification_reminder_runs_person_created").on(table.personId, table.createdAt),
    index("idx_notification_reminder_runs_org_created").on(table.organizationId, table.createdAt),
    index("idx_notification_reminder_runs_recipient_created").on(table.recipient, table.createdAt),
    index("idx_notification_reminder_runs_status_created").on(table.status, table.createdAt),
    uniqueIndex("uidx_notification_reminder_runs_dedupe").on(table.dedupeKey),
  ],
)

export type NotificationReminderRun = typeof notificationReminderRuns.$inferSelect
export type NewNotificationReminderRun = typeof notificationReminderRuns.$inferInsert

export type NotificationReminderStageCadenceInterval = {
  whenDaysUntilDueGT?: number | null
  whenDaysUntilDueLT?: number | null
  repeatEveryDays: number
}

export const notificationReminderRuleStages = pgTable(
  "notification_reminder_rule_stages",
  {
    id: typeId("notification_reminder_rule_stages"),
    reminderRuleId: typeIdRef("reminder_rule_id")
      .notNull()
      .references(() => notificationReminderRules.id, { onDelete: "cascade" }),
    orderIndex: integer("order_index").notNull(),
    name: text("name"),
    anchor: notificationReminderStageAnchorEnum("anchor").notNull(),
    windowStartDays: integer("window_start_days").notNull(),
    windowEndDays: integer("window_end_days").notNull(),
    cadenceKind: notificationReminderStageCadenceKindEnum("cadence_kind").notNull(),
    cadenceEveryDays: integer("cadence_every_days"),
    cadenceIntervals:
      jsonb("cadence_intervals").$type<NotificationReminderStageCadenceInterval[]>(),
    maxSendsInStage: integer("max_sends_in_stage"),
    respectQuietHours: boolean("respect_quiet_hours").notNull().default(true),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("uidx_notification_reminder_rule_stages_rule_order").on(
      table.reminderRuleId,
      table.orderIndex,
    ),
    index("idx_notification_reminder_rule_stages_rule").on(table.reminderRuleId),
    index("idx_notification_reminder_rule_stages_anchor").on(table.anchor),
  ],
)

export type NotificationReminderRuleStage = typeof notificationReminderRuleStages.$inferSelect
export type NewNotificationReminderRuleStage = typeof notificationReminderRuleStages.$inferInsert

export const notificationReminderStageChannels = pgTable(
  "notification_reminder_stage_channels",
  {
    id: typeId("notification_reminder_stage_channels"),
    stageId: typeIdRef("stage_id")
      .notNull()
      .references(() => notificationReminderRuleStages.id, { onDelete: "cascade" }),
    orderIndex: integer("order_index").notNull().default(0),
    channel: notificationChannelEnum("channel").notNull(),
    provider: text("provider"),
    templateId: typeIdRef("template_id").references(() => notificationTemplates.id, {
      onDelete: "set null",
    }),
    templateSlug: text("template_slug"),
    recipientKind: notificationStageRecipientKindEnum("recipient_kind")
      .notNull()
      .default("primary"),
    recipientRole: text("recipient_role"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_notification_reminder_stage_channels_stage").on(table.stageId),
    index("idx_notification_reminder_stage_channels_template").on(table.templateId),
  ],
)

export type NotificationReminderStageChannel = typeof notificationReminderStageChannels.$inferSelect
export type NewNotificationReminderStageChannel =
  typeof notificationReminderStageChannels.$inferInsert

export type NotificationQuietHoursConfig = {
  start: string
  end: string
  tz: string
}

export const notificationSettings = pgTable(
  "notification_settings",
  {
    id: typeId("notification_settings"),
    scope: text("scope").notNull().default("default"),
    quietHoursLocal: jsonb("quiet_hours_local").$type<NotificationQuietHoursConfig | null>(),
    blackoutDates: jsonb("blackout_dates").$type<string[]>(),
    skipWeekends: boolean("skip_weekends").notNull().default(false),
    recipientRateLimitPerDay: integer("recipient_rate_limit_per_day"),
    suppressionWindowHours: integer("suppression_window_hours").notNull().default(24),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("uidx_notification_settings_scope").on(table.scope)],
)

export type NotificationSettings = typeof notificationSettings.$inferSelect
export type NewNotificationSettings = typeof notificationSettings.$inferInsert

/**
 * Which staff roles a staff alert fans out to. Role slugs are resolved against
 * the deployment's access catalog at send time rather than constrained here —
 * the catalog is deployment data, so a `pgEnum` would freeze it.
 */
export type StaffAlertRoleRouting = string[]

/**
 * Deployment-wide default for one staff alert, keyed by the domain event it
 * fires on. Admin-owned: it decides whether an alert exists on this deployment
 * at all and who it reaches.
 *
 * `eventKey` is `text` rather than a `pgEnum` on purpose — a new alert type is
 * then a registry entry plus a template, with no migration. The registry in
 * `staff-alert-registry.ts` is the authority on which keys mean anything.
 */
export const staffAlertSettings = pgTable(
  "staff_alert_settings",
  {
    id: typeId("staff_alert_settings"),
    eventKey: text("event_key").notNull(),
    enabled: boolean("enabled").notNull().default(false),
    /** Route to the record's assigned staff member, where the owning module has one. */
    routeToAssignee: boolean("route_to_assignee").notNull().default(true),
    /** Staff role slugs that receive this alert. */
    routeToRoles: jsonb("route_to_roles").$type<StaffAlertRoleRouting>().notNull().default([]),
    /** Additional literal addresses (shared mailboxes such as `ops@`). */
    extraAddresses: jsonb("extra_addresses").$type<string[]>().notNull().default([]),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("uidx_staff_alert_settings_event_key").on(table.eventKey)],
)

export type StaffAlertSettings = typeof staffAlertSettings.$inferSelect
export type NewStaffAlertSettings = typeof staffAlertSettings.$inferInsert

/**
 * One staff user's override of a deployment default.
 *
 * ABSENCE MEANS INHERIT, never "off". A staff user who has never opened the
 * preferences page has no rows here and receives everything the deployment
 * enables — which is what makes a new hire reachable on their first day.
 * Storing a materialized copy of the default instead would silently freeze
 * each user at the defaults in force when their account was created.
 *
 * `userId` is a Better Auth user id (`user.id` in `@voyant-travel/db/schema/iam`),
 * deliberately not an FK: the auth tables are foundation-owned and a deployment
 * may run either the local or the Voyant Cloud realm.
 */
export const staffAlertPreferences = pgTable(
  "staff_alert_preferences",
  {
    id: typeId("staff_alert_preferences"),
    userId: text("user_id").notNull(),
    eventKey: text("event_key").notNull(),
    enabled: boolean("enabled").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("uidx_staff_alert_preferences_user_event").on(table.userId, table.eventKey),
    index("idx_staff_alert_preferences_event").on(table.eventKey),
  ],
)

export type StaffAlertPreference = typeof staffAlertPreferences.$inferSelect
export type NewStaffAlertPreference = typeof staffAlertPreferences.$inferInsert

/**
 * Dedup ledger for composite reminder-rule authoring. A compose request creates
 * several rows, so retried calls need a stable way to return the original rule
 * instead of building a second graph.
 */
export const notificationReminderRuleAuthoringRequests = pgTable(
  "notification_reminder_rule_authoring_requests",
  {
    idempotencyKey: text("idempotency_key").primaryKey(),
    reminderRuleId: typeIdRef("reminder_rule_id")
      .notNull()
      .references(() => notificationReminderRules.id, { onDelete: "cascade" }),
    operation: text("operation").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("idx_notification_reminder_rule_authoring_rule").on(table.reminderRuleId)],
)

export type NotificationReminderRuleAuthoringRequest =
  typeof notificationReminderRuleAuthoringRequests.$inferSelect
export type NewNotificationReminderRuleAuthoringRequest =
  typeof notificationReminderRuleAuthoringRequests.$inferInsert

export const notificationTemplatesRelations = relations(notificationTemplates, ({ many }) => ({
  deliveries: many(notificationDeliveries),
  reminderRules: many(notificationReminderRules),
}))

export const notificationDeliveriesRelations = relations(notificationDeliveries, ({ one }) => ({
  template: one(notificationTemplates, {
    fields: [notificationDeliveries.templateId],
    references: [notificationTemplates.id],
  }),
}))

export const notificationReminderRulesRelations = relations(
  notificationReminderRules,
  ({ many, one }) => ({
    template: one(notificationTemplates, {
      fields: [notificationReminderRules.templateId],
      references: [notificationTemplates.id],
    }),
    runs: many(notificationReminderRuns),
    stages: many(notificationReminderRuleStages),
  }),
)

export const notificationReminderRunsRelations = relations(notificationReminderRuns, ({ one }) => ({
  reminderRule: one(notificationReminderRules, {
    fields: [notificationReminderRuns.reminderRuleId],
    references: [notificationReminderRules.id],
  }),
  notificationDelivery: one(notificationDeliveries, {
    fields: [notificationReminderRuns.notificationDeliveryId],
    references: [notificationDeliveries.id],
  }),
}))

export const notificationReminderRuleStagesRelations = relations(
  notificationReminderRuleStages,
  ({ many, one }) => ({
    rule: one(notificationReminderRules, {
      fields: [notificationReminderRuleStages.reminderRuleId],
      references: [notificationReminderRules.id],
    }),
    channels: many(notificationReminderStageChannels),
  }),
)

export const notificationReminderStageChannelsRelations = relations(
  notificationReminderStageChannels,
  ({ one }) => ({
    stage: one(notificationReminderRuleStages, {
      fields: [notificationReminderStageChannels.stageId],
      references: [notificationReminderRuleStages.id],
    }),
    template: one(notificationTemplates, {
      fields: [notificationReminderStageChannels.templateId],
      references: [notificationTemplates.id],
    }),
  }),
)

export const notificationTemplateLinkable: LinkableDefinition = {
  module: "notifications",
  entity: "notificationTemplate",
  table: "notification_templates",
  idPrefix: "ntpl",
}

export const notificationDeliveryLinkable: LinkableDefinition = {
  module: "notifications",
  entity: "notificationDelivery",
  table: "notification_deliveries",
  idPrefix: "ntdl",
}

export const notificationReminderRuleLinkable: LinkableDefinition = {
  module: "notifications",
  entity: "notificationReminderRule",
  table: "notification_reminder_rules",
  idPrefix: "ntrl",
}

export const notificationReminderRunLinkable: LinkableDefinition = {
  module: "notifications",
  entity: "notificationReminderRun",
  table: "notification_reminder_runs",
  idPrefix: "ntrn",
}

export const notificationReminderRuleStageLinkable: LinkableDefinition = {
  module: "notifications",
  entity: "notificationReminderRuleStage",
  table: "notification_reminder_rule_stages",
  idPrefix: "ntrs",
}

export const notificationReminderStageChannelLinkable: LinkableDefinition = {
  module: "notifications",
  entity: "notificationReminderStageChannel",
  table: "notification_reminder_stage_channels",
  idPrefix: "ntsc",
}

export const notificationSettingsLinkable: LinkableDefinition = {
  module: "notifications",
  entity: "notificationSettings",
  table: "notification_settings",
  idPrefix: "nset",
}

export const staffAlertSettingsLinkable: LinkableDefinition = {
  module: "notifications",
  entity: "staffAlertSettings",
  table: "staff_alert_settings",
  idPrefix: "sals",
}

export const staffAlertPreferenceLinkable: LinkableDefinition = {
  module: "notifications",
  entity: "staffAlertPreference",
  table: "staff_alert_preferences",
  idPrefix: "salp",
}

export const notificationsLinkable = {
  notificationTemplate: notificationTemplateLinkable,
  notificationDelivery: notificationDeliveryLinkable,
  notificationReminderRule: notificationReminderRuleLinkable,
  notificationReminderRun: notificationReminderRunLinkable,
  notificationReminderRuleStage: notificationReminderRuleStageLinkable,
  notificationReminderStageChannel: notificationReminderStageChannelLinkable,
  notificationSettings: notificationSettingsLinkable,
  staffAlertSettings: staffAlertSettingsLinkable,
  staffAlertPreference: staffAlertPreferenceLinkable,
}

export const notificationsModule: Module = {
  name: "notifications",
  linkable: notificationsLinkable,
  requiresTransactionalDb: true,
}

// Created in index.ts once routes are available.
export type NotificationsApiModule = ApiModule
