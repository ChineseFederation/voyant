import { typeId, typeIdRef } from "@voyant-travel/db/lib/typeid-column"
import { sql } from "drizzle-orm"
import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core"
import {
  channelCommissionScopeEnum,
  channelCommissionTypeEnum,
  channelContractStatusEnum,
  channelKindEnum,
  channelStatusEnum,
  channelWebhookStatusEnum,
  distributionCancellationOwnerEnum,
  distributionPaymentOwnerEnum,
} from "./schema-shared.js"
import { suppliers } from "./suppliers/schema.js"

/**
 * The Direct channel: everything the operator sells through itself — its
 * website, the booking engine, the customer portal, a custom frontend on the
 * Public API — publishes to this one channel. Exactly one row per deployment
 * carries it, provisioned by migration, and it is the channel a public request
 * resolves to when nothing names another one.
 */
export const DIRECT_CHANNEL_SYSTEM_KEY = "direct"

/** Every system-provisioned channel marker. Only Direct exists today. */
export const CHANNEL_SYSTEM_KEYS = [DIRECT_CHANNEL_SYSTEM_KEY] as const
export type ChannelSystemKey = (typeof CHANNEL_SYSTEM_KEYS)[number]

export const channels = pgTable(
  "channels",
  {
    id: typeId("channels"),
    name: text("name").notNull(),
    description: text("description"),
    kind: channelKindEnum("kind").notNull(),
    status: channelStatusEnum("status").notNull().default("active"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    /**
     * Non-null on a channel the deployment provisions for itself rather than
     * one the operator created for a counterparty. Today the only value is
     * `direct` (see {@link DIRECT_CHANNEL_SYSTEM_KEY}): the channel everything
     * we sell through ourselves publishes to.
     *
     * It is a column rather than a `metadata` key because three things depend
     * on it being unforgeable and indexable — the public surface resolves its
     * channel through it, `deleteChannel` refuses on it, and the counterparty
     * list filters on it. A `metadata` flag is editable through the ordinary
     * channel PATCH, which would let an operator delete the row the public API
     * depends on by first clearing the marker.
     */
    systemKey: text("system_key").$type<ChannelSystemKey>(),
    /**
     * The catalog entry this channel was created from (`channel-presets.ts`),
     * for named networks only — a stable identity a connector can bind to
     * instead of matching on a display name the operator is free to rename.
     *
     * Null for a channel the operator described themselves, and null for the
     * partner-type presets, which prefill a form rather than name a
     * counterparty.
     */
    presetKey: text("preset_key"),

    // ── Channel push: per-channel rate-limit defaults ───────────────
    // Per channel-push-architecture §14.1. Contract-level rules in
    // `channel_contracts` override these for specific commercial deals.
    /** Sustained requests per second the channel allows (operator estimate). */
    rateLimitRps: integer("rate_limit_rps"),
    /** Max tokens in the bucket — controls burst capacity. */
    rateLimitBurst: integer("rate_limit_burst"),
    /**
     * Per-priority reserve thresholds. Example:
     *   { "booking": 0, "availability": 0.3, "content": 0.7 }
     * Reads as: bookings dispatch with any tokens; availability when
     * bucket ≥ 30% full; content when ≥ 70% full. Bookings always
     * pre-empt availability/content within one shared upstream budget.
     */
    rateLimitPriorityGates: jsonb("rate_limit_priority_gates").$type<Record<string, number>>(),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_channels_created").on(table.createdAt),
    index("idx_channels_kind_created").on(table.kind, table.createdAt),
    index("idx_channels_status_created").on(table.status, table.createdAt),
    // Partial, so the column stays null on every operator-created channel and
    // only the one system row per key is constrained.
    uniqueIndex("uniq_channels_system_key")
      .on(table.systemKey)
      .where(sql`${table.systemKey} IS NOT NULL`),
    // One channel per named network: the point of the key is that it resolves
    // to exactly one row, so a connector asking for "the GetYourGuide channel"
    // gets an answer rather than a list.
    uniqueIndex("uniq_channels_preset_key")
      .on(table.presetKey)
      .where(sql`${table.presetKey} IS NOT NULL`),
  ],
)

export const channelContactProjections = pgTable("channel_contact_projections", {
  channelId: typeIdRef("channel_id")
    .primaryKey()
    .references(() => channels.id, { onDelete: "cascade" }),
  websiteContactPointId: text("website_contact_point_id"),
  primaryNamedContactId: text("primary_named_contact_id"),
  website: text("website"),
  contactName: text("contact_name"),
  contactEmail: text("contact_email"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
})

export const channelContracts = pgTable(
  "channel_contracts",
  {
    id: typeId("channel_contracts"),
    channelId: typeIdRef("channel_id")
      .notNull()
      .references(() => channels.id, { onDelete: "cascade" }),
    supplierId: typeIdRef("supplier_id").references(() => suppliers.id, { onDelete: "set null" }),
    status: channelContractStatusEnum("status").notNull().default("draft"),
    startsAt: date("starts_at").notNull(),
    endsAt: date("ends_at"),
    paymentOwner: distributionPaymentOwnerEnum("payment_owner").notNull().default("operator"),
    cancellationOwner: distributionCancellationOwnerEnum("cancellation_owner")
      .notNull()
      .default("operator"),
    settlementTerms: text("settlement_terms"),
    notes: text("notes"),

    // ── Channel push: per-contract rate-limit overrides ─────────────
    // Per §14.1 — overrides the `channels.*` defaults for this specific
    // supplier relationship (e.g. an enterprise contract gets a higher
    // burst than the public default).
    rateLimitRps: integer("rate_limit_rps"),
    rateLimitBurst: integer("rate_limit_burst"),
    rateLimitPriorityGates: jsonb("rate_limit_priority_gates").$type<Record<string, number>>(),

    /**
     * Per-contract policy bag for channel-push behavior. Currently
     * carries the compensation policy ("strict-atomic" vs
     * "eventually-consistent"), per-mapping field include/exclude
     * lists, and adapter-specific commercial parameters echoed to push
     * calls. Treated as opaque JSON; the channel-push pipeline reads
     * known keys and ignores the rest.
     */
    policy: jsonb("policy").$type<Record<string, unknown>>(),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_channel_contracts_channel_created").on(table.channelId, table.createdAt),
    index("idx_channel_contracts_supplier_created").on(table.supplierId, table.createdAt),
    index("idx_channel_contracts_status_created").on(table.status, table.createdAt),
  ],
)

export const channelCommissionRules = pgTable(
  "channel_commission_rules",
  {
    id: typeId("channel_commission_rules"),
    contractId: typeIdRef("contract_id")
      .notNull()
      .references(() => channelContracts.id, { onDelete: "cascade" }),
    scope: channelCommissionScopeEnum("scope").notNull(),
    productId: typeIdRef("product_id"),
    externalRateId: text("external_rate_id"),
    externalCategoryId: text("external_category_id"),
    commissionType: channelCommissionTypeEnum("commission_type").notNull(),
    amountCents: integer("amount_cents"),
    percentBasisPoints: integer("percent_basis_points"),
    validFrom: date("valid_from"),
    validTo: date("valid_to"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_channel_commission_rules_contract_created").on(table.contractId, table.createdAt),
    index("idx_channel_commission_rules_product_created").on(table.productId, table.createdAt),
    index("idx_channel_commission_rules_scope_created").on(table.scope, table.createdAt),
  ],
)

export const channelProductMappings = pgTable(
  "channel_product_mappings",
  {
    id: typeId("channel_product_mappings"),
    channelId: typeIdRef("channel_id")
      .notNull()
      .references(() => channels.id, { onDelete: "cascade" }),
    productId: typeIdRef("product_id").notNull(),
    externalProductId: text("external_product_id"),
    externalRateId: text("external_rate_id"),
    externalCategoryId: text("external_category_id"),
    active: boolean("active").notNull().default(true),

    // ── Channel push: per-mapping routing + idempotency ──────────────
    // Per §3.1 + §7.2 + §6.1.
    /** Mirrors adapter kind for routing (e.g. "voyant-connect", "direct:tui"). */
    sourceKind: text("source_kind"),
    /** Connection id resolving to a registered SourceAdapter. */
    sourceConnectionId: text("source_connection_id"),
    /** Per-flow push toggles. Default true: a mapping with no override
     *  participates in all push flows. */
    pushBookings: boolean("push_bookings").notNull().default(true),
    pushAvailability: boolean("push_availability").notNull().default(true),
    pushContent: boolean("push_content").notNull().default(true),
    /**
     * Per-mapping policy (rate caps, field include/exclude, push-time
     * overrides). Treated as opaque JSON; the channel-push pipeline
     * reads known keys and ignores the rest.
     */
    policy: jsonb("policy").$type<Record<string, unknown>>(),
    /**
     * Last content hash the upstream acknowledged. Idempotency for the
     * content-push flow: skip when current `sha256(canonicalJson(content))`
     * equals this value. Per §6.1.
     */
    lastPushedContentHash: text("last_pushed_content_hash"),
    /** Time of the last successful content push. */
    lastPushedContentAt: timestamp("last_pushed_content_at", { withTimezone: true }),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_channel_product_mappings_channel_created").on(table.channelId, table.createdAt),
    index("idx_channel_product_mappings_product_created").on(table.productId, table.createdAt),
    index("idx_channel_product_mappings_active_created").on(table.active, table.createdAt),
    index("idx_channel_product_mappings_source_connection").on(table.sourceConnectionId),
  ],
)

export const channelBookingLinks = pgTable(
  "channel_booking_links",
  {
    id: typeId("channel_booking_links"),
    channelId: typeIdRef("channel_id")
      .notNull()
      .references(() => channels.id, { onDelete: "cascade" }),
    bookingId: text("booking_id").notNull(),
    /**
     * Booking-item scope. Null = booking-level link. Multi-line bookings
     * fan out into one row per `(booking_item_id, channel_id)` so each
     * line can target a different channel. Per §7.1.
     */
    bookingItemId: text("booking_item_id"),
    externalBookingId: text("external_booking_id"),
    externalReference: text("external_reference"),
    externalStatus: text("external_status"),
    bookedAtExternal: timestamp("booked_at_external", { withTimezone: true }),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),

    // ── Channel push lifecycle ───────────────────────────────────────
    // Per §7.1. The row IS the durable intent: pending → ok | failed |
    // compensated. The subscriber INSERTs with `pushStatus = 'pending'`
    // and the durable workflow drains it.
    sourceKind: text("source_kind"),
    sourceConnectionId: text("source_connection_id"),
    /** "pending" | "ok" | "failed" | "compensated" */
    pushStatus: text("push_status").notNull().default("pending"),
    pushAttempts: integer("push_attempts").notNull().default(0),
    lastPushAt: timestamp("last_push_at", { withTimezone: true }),
    lastError: text("last_error"),
    /**
     * SHA-256 of the canonical pushed payload — drift detection on
     * subsequent pushes. Per §7.1.
     */
    pushedPayloadHash: text("pushed_payload_hash"),
    /**
     * Stable idempotency key for the upstream call. Generated from
     * `(booking_id, booking_item_id, channel_id)` so retries don't
     * double-push.
     */
    idempotencyKey: text("idempotency_key"),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_channel_booking_links_channel_created").on(table.channelId, table.createdAt),
    index("idx_channel_booking_links_booking_created").on(table.bookingId, table.createdAt),
    index("idx_channel_booking_links_external_booking_created").on(
      table.externalBookingId,
      table.createdAt,
    ),
    index("idx_channel_booking_links_push_status").on(table.pushStatus, table.lastPushAt),
    index("idx_channel_booking_links_booking_item")
      .on(table.bookingItemId)
      // agent-quality: raw-sql reviewed -- owner: distribution; dynamic SQL interpolation uses Drizzle parameter binding or vetted SQL identifiers.
      .where(sql`${table.bookingItemId} IS NOT NULL`),
    /**
     * Per §7.1: the subscriber's `INSERT ... ON CONFLICT DO NOTHING`
     * needs a stable durable-handoff key. `COALESCE(booking_item_id,
     * '')` collapses booking-level rows (item id null) and item-scoped
     * rows into one uniqueness rule.
     */
    uniqueIndex("uniq_channel_booking_links_per_item").on(
      table.channelId,
      table.bookingId,
      // agent-quality: raw-sql reviewed -- owner: distribution; dynamic SQL interpolation uses Drizzle parameter binding or vetted SQL identifiers.
      sql`COALESCE(${table.bookingItemId}, '')`,
    ),
  ],
)

export const channelWebhookEvents = pgTable(
  "channel_webhook_events",
  {
    id: typeId("channel_webhook_events"),
    channelId: typeIdRef("channel_id")
      .notNull()
      .references(() => channels.id, { onDelete: "cascade" }),
    eventType: text("event_type").notNull(),
    externalEventId: text("external_event_id"),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
    processedAt: timestamp("processed_at", { withTimezone: true }),
    status: channelWebhookStatusEnum("status").notNull().default("pending"),
    errorMessage: text("error_message"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_channel_webhook_events_channel_received").on(table.channelId, table.receivedAt),
    index("idx_channel_webhook_events_status_received").on(table.status, table.receivedAt),
    index("idx_channel_webhook_events_event_type_received").on(table.eventType, table.receivedAt),
    index("idx_channel_webhook_events_external_event").on(table.externalEventId),
  ],
)

export type Channel = typeof channels.$inferSelect
export type NewChannel = typeof channels.$inferInsert
export type ChannelContactProjection = typeof channelContactProjections.$inferSelect
export type NewChannelContactProjection = typeof channelContactProjections.$inferInsert
export type ChannelContract = typeof channelContracts.$inferSelect
export type NewChannelContract = typeof channelContracts.$inferInsert
export type ChannelCommissionRule = typeof channelCommissionRules.$inferSelect
export type NewChannelCommissionRule = typeof channelCommissionRules.$inferInsert
export type ChannelProductMapping = typeof channelProductMappings.$inferSelect
export type NewChannelProductMapping = typeof channelProductMappings.$inferInsert
export type ChannelBookingLink = typeof channelBookingLinks.$inferSelect
export type NewChannelBookingLink = typeof channelBookingLinks.$inferInsert
export type ChannelWebhookEvent = typeof channelWebhookEvents.$inferSelect
export type NewChannelWebhookEvent = typeof channelWebhookEvents.$inferInsert
