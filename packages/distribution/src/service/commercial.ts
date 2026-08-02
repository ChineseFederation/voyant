import { bookings } from "@voyant-travel/bookings/schema"
import type { EventBus } from "@voyant-travel/core"
import { ApiHttpError, RequestValidationError } from "@voyant-travel/hono"
import { and, desc, eq, isNull, sql } from "drizzle-orm"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"

import { classifyMappingUpdate, emitChannelProductMappingChanged } from "../events.js"
import {
  type ChannelBookingLink,
  channelBookingLinks,
  channelCommissionRules,
  channelContracts,
  channelProductMappings,
  channels,
  channelWebhookEvents,
} from "../schema.js"
import { paginate, toDateOrNull } from "./helpers.js"
import type {
  ChannelBookingLinkListQuery,
  ChannelCommissionRuleListQuery,
  ChannelContractListQuery,
  ChannelProductMappingListQuery,
  ChannelWebhookEventListQuery,
  CreateChannelBookingLinkInput,
  CreateChannelCommissionRuleInput,
  CreateChannelContractInput,
  CreateChannelProductMappingInput,
  CreateChannelWebhookEventInput,
  UpdateChannelBookingLinkInput,
  UpdateChannelCommissionRuleInput,
  UpdateChannelContractInput,
  UpdateChannelProductMappingInput,
  UpdateChannelWebhookEventInput,
} from "./types.js"

const UNIQUE_VIOLATION_SQLSTATE = "23505"
const DUPLICATE_BOOKING_LINK_CONSTRAINT = "uniq_channel_booking_links_per_item"

async function requireChannel(db: PostgresJsDatabase, channelId: string) {
  const [row] = await db
    .select({ id: channels.id })
    .from(channels)
    .where(eq(channels.id, channelId))
    .limit(1)
  if (!row) {
    throw new RequestValidationError("Channel not found", {
      fields: { channelId: ["Channel not found"] },
    })
  }
}

async function requireBooking(db: PostgresJsDatabase, bookingId: string) {
  const [row] = await db
    .select({ id: bookings.id })
    .from(bookings)
    .where(eq(bookings.id, bookingId))
    .limit(1)
  if (!row) {
    throw new RequestValidationError("Booking not found", {
      fields: { bookingId: ["Booking not found"] },
    })
  }
}

function duplicateBookingLinkError(): ApiHttpError {
  return new ApiHttpError("Channel booking link already exists", {
    status: 409,
    code: "duplicate_channel_booking_link",
    details: {
      fields: {
        channelId: ["Channel booking link already exists"],
        bookingId: ["Channel booking link already exists"],
      },
    },
  })
}

function isDuplicateBookingLinkError(error: unknown): boolean {
  const signals = collectErrorStrings(error, new Set(), 0)
  return (
    signals.some((value) => value.includes(UNIQUE_VIOLATION_SQLSTATE)) &&
    signals.some((value) => value.includes(DUPLICATE_BOOKING_LINK_CONSTRAINT))
  )
}

function collectErrorStrings(error: unknown, seen: Set<object>, depth: number): string[] {
  if (!error || typeof error !== "object" || seen.has(error) || depth > 6) return []
  seen.add(error)

  const record = error as Record<string, unknown>
  const values = [
    record.code,
    record.sqlState,
    record.sqlstate,
    record.sql_state,
    record.constraint,
    record.constraintName,
    record.constraint_name,
    record.detail,
    record.message,
  ].filter((value): value is string => typeof value === "string")

  const nested = [
    record.cause,
    record.originalError,
    record.original,
    record.error,
    record.queryError,
  ]
  if (Array.isArray(record.errors)) nested.push(...record.errors)
  for (const child of nested) {
    values.push(...collectErrorStrings(child, seen, depth + 1))
  }

  return values
}

export const commercialServiceOperations = {
  async listContracts(db: PostgresJsDatabase, query: ChannelContractListQuery) {
    const conditions = []
    if (query.channelId) conditions.push(eq(channelContracts.channelId, query.channelId))
    if (query.supplierId) conditions.push(eq(channelContracts.supplierId, query.supplierId))
    if (query.status) conditions.push(eq(channelContracts.status, query.status))
    const where = conditions.length ? and(...conditions) : undefined
    return paginate(
      db
        .select()
        .from(channelContracts)
        .where(where)
        .limit(query.limit)
        .offset(query.offset)
        .orderBy(desc(channelContracts.createdAt)),
      db.select({ count: sql<number>`count(*)::int` }).from(channelContracts).where(where),
      query.limit,
      query.offset,
    )
  },

  async getContractById(db: PostgresJsDatabase, id: string) {
    const [row] = await db
      .select()
      .from(channelContracts)
      .where(eq(channelContracts.id, id))
      .limit(1)
    return row ?? null
  },

  async createContract(db: PostgresJsDatabase, data: CreateChannelContractInput) {
    const [row] = await db.insert(channelContracts).values(data).returning()
    return row
  },

  async updateContract(db: PostgresJsDatabase, id: string, data: UpdateChannelContractInput) {
    const [row] = await db
      .update(channelContracts)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(channelContracts.id, id))
      .returning()
    return row ?? null
  },

  async deleteContract(db: PostgresJsDatabase, id: string) {
    const [row] = await db
      .delete(channelContracts)
      .where(eq(channelContracts.id, id))
      .returning({ id: channelContracts.id })
    return row ?? null
  },

  async listCommissionRules(db: PostgresJsDatabase, query: ChannelCommissionRuleListQuery) {
    const conditions = []
    if (query.contractId) conditions.push(eq(channelCommissionRules.contractId, query.contractId))
    if (query.productId) conditions.push(eq(channelCommissionRules.productId, query.productId))
    if (query.scope) conditions.push(eq(channelCommissionRules.scope, query.scope))
    const where = conditions.length ? and(...conditions) : undefined
    return paginate(
      db
        .select()
        .from(channelCommissionRules)
        .where(where)
        .limit(query.limit)
        .offset(query.offset)
        .orderBy(desc(channelCommissionRules.createdAt)),
      db.select({ count: sql<number>`count(*)::int` }).from(channelCommissionRules).where(where),
      query.limit,
      query.offset,
    )
  },

  async getCommissionRuleById(db: PostgresJsDatabase, id: string) {
    const [row] = await db
      .select()
      .from(channelCommissionRules)
      .where(eq(channelCommissionRules.id, id))
      .limit(1)
    return row ?? null
  },

  async createCommissionRule(db: PostgresJsDatabase, data: CreateChannelCommissionRuleInput) {
    const [row] = await db.insert(channelCommissionRules).values(data).returning()
    return row
  },

  async updateCommissionRule(
    db: PostgresJsDatabase,
    id: string,
    data: UpdateChannelCommissionRuleInput,
  ) {
    const [row] = await db
      .update(channelCommissionRules)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(channelCommissionRules.id, id))
      .returning()
    return row ?? null
  },

  async deleteCommissionRule(db: PostgresJsDatabase, id: string) {
    const [row] = await db
      .delete(channelCommissionRules)
      .where(eq(channelCommissionRules.id, id))
      .returning({ id: channelCommissionRules.id })
    return row ?? null
  },

  async listProductMappings(db: PostgresJsDatabase, query: ChannelProductMappingListQuery) {
    const conditions = []
    if (query.channelId) conditions.push(eq(channelProductMappings.channelId, query.channelId))
    if (query.productId) conditions.push(eq(channelProductMappings.productId, query.productId))
    if (query.active !== undefined) conditions.push(eq(channelProductMappings.active, query.active))
    const where = conditions.length ? and(...conditions) : undefined
    return paginate(
      db
        .select()
        .from(channelProductMappings)
        .where(where)
        .limit(query.limit)
        .offset(query.offset)
        .orderBy(desc(channelProductMappings.createdAt)),
      db.select({ count: sql<number>`count(*)::int` }).from(channelProductMappings).where(where),
      query.limit,
      query.offset,
    )
  },

  async getProductMappingById(db: PostgresJsDatabase, id: string) {
    const [row] = await db
      .select()
      .from(channelProductMappings)
      .where(eq(channelProductMappings.id, id))
      .limit(1)
    return row ?? null
  },

  async createProductMapping(
    db: PostgresJsDatabase,
    data: CreateChannelProductMappingInput,
    eventBus?: EventBus,
  ) {
    await requireChannel(db, data.channelId)
    const [row] = await db.insert(channelProductMappings).values(data).returning()
    if (row) {
      await emitChannelProductMappingChanged(eventBus, db, {
        productId: row.productId,
        channelId: row.channelId,
        mappingId: row.id,
        previousActive: null,
        nextActive: row.active,
        operation: "created",
      })
    }
    return row
  },

  async updateProductMapping(
    db: PostgresJsDatabase,
    id: string,
    data: UpdateChannelProductMappingInput,
    eventBus?: EventBus,
  ) {
    // Read the prior `active` flag (to classify activate/deactivate vs a plain
    // edit) plus the prior product/channel — an update can REASSIGN the mapping
    // to a different product (the update schema is a partial of the mapping
    // schema, so `productId`/`channelId` are editable). Only needed with a bus.
    const previous = eventBus
      ? (
          await db
            .select({
              active: channelProductMappings.active,
              productId: channelProductMappings.productId,
              channelId: channelProductMappings.channelId,
            })
            .from(channelProductMappings)
            .where(eq(channelProductMappings.id, id))
            .limit(1)
        )[0]
      : undefined
    const [row] = await db
      .update(channelProductMappings)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(channelProductMappings.id, id))
      .returning()
    if (row && previous) {
      await emitChannelProductMappingChanged(eventBus, db, {
        productId: row.productId,
        channelId: row.channelId,
        mappingId: row.id,
        previousActive: previous.active,
        nextActive: row.active,
        operation: classifyMappingUpdate(previous.active, row.active),
      })
      if (previous.productId !== row.productId || previous.channelId !== row.channelId) {
        await emitChannelProductMappingChanged(eventBus, db, {
          productId: previous.productId,
          channelId: previous.channelId,
          mappingId: row.id,
          previousActive: previous.active,
          nextActive: null,
          operation: "deleted",
        })
      }
    }
    return row ?? null
  },

  async deleteProductMapping(db: PostgresJsDatabase, id: string, eventBus?: EventBus) {
    // Capture the row before deleting so the tombstone event carries the
    // product/channel it affected (the delete only returns the id).
    const previous = eventBus
      ? (
          await db
            .select({
              productId: channelProductMappings.productId,
              channelId: channelProductMappings.channelId,
              active: channelProductMappings.active,
            })
            .from(channelProductMappings)
            .where(eq(channelProductMappings.id, id))
            .limit(1)
        )[0]
      : undefined
    const [row] = await db
      .delete(channelProductMappings)
      .where(eq(channelProductMappings.id, id))
      .returning({ id: channelProductMappings.id })
    if (row && previous) {
      await emitChannelProductMappingChanged(eventBus, db, {
        productId: previous.productId,
        channelId: previous.channelId,
        mappingId: row.id,
        previousActive: previous.active,
        nextActive: null,
        operation: "deleted",
      })
    }
    return row ?? null
  },

  async listBookingLinks(db: PostgresJsDatabase, query: ChannelBookingLinkListQuery) {
    const conditions = []
    if (query.channelId) conditions.push(eq(channelBookingLinks.channelId, query.channelId))
    if (query.bookingId) conditions.push(eq(channelBookingLinks.bookingId, query.bookingId))
    if (query.externalBookingId)
      conditions.push(eq(channelBookingLinks.externalBookingId, query.externalBookingId))
    const where = conditions.length ? and(...conditions) : undefined
    return paginate(
      db
        .select()
        .from(channelBookingLinks)
        .where(where)
        .limit(query.limit)
        .offset(query.offset)
        .orderBy(desc(channelBookingLinks.createdAt)),
      db.select({ count: sql<number>`count(*)::int` }).from(channelBookingLinks).where(where),
      query.limit,
      query.offset,
    )
  },

  async getBookingLinkById(db: PostgresJsDatabase, id: string) {
    const [row] = await db
      .select()
      .from(channelBookingLinks)
      .where(eq(channelBookingLinks.id, id))
      .limit(1)
    return row ?? null
  },

  async createBookingLink(db: PostgresJsDatabase, data: CreateChannelBookingLinkInput) {
    await requireChannel(db, data.channelId)
    await requireBooking(db, data.bookingId)

    const [existing] = await db
      .select({ id: channelBookingLinks.id })
      .from(channelBookingLinks)
      .where(
        and(
          eq(channelBookingLinks.channelId, data.channelId),
          eq(channelBookingLinks.bookingId, data.bookingId),
          isNull(channelBookingLinks.bookingItemId),
        ),
      )
      .limit(1)
    if (existing) throw duplicateBookingLinkError()

    let row: ChannelBookingLink | undefined
    try {
      ;[row] = await db
        .insert(channelBookingLinks)
        .values({
          ...data,
          bookedAtExternal: toDateOrNull(data.bookedAtExternal),
          lastSyncedAt: toDateOrNull(data.lastSyncedAt),
        })
        .returning()
    } catch (error) {
      if (isDuplicateBookingLinkError(error)) throw duplicateBookingLinkError()
      throw error
    }
    return row
  },

  async updateBookingLink(db: PostgresJsDatabase, id: string, data: UpdateChannelBookingLinkInput) {
    const [row] = await db
      .update(channelBookingLinks)
      .set({
        ...data,
        bookedAtExternal:
          data.bookedAtExternal === undefined ? undefined : toDateOrNull(data.bookedAtExternal),
        lastSyncedAt: data.lastSyncedAt === undefined ? undefined : toDateOrNull(data.lastSyncedAt),
        updatedAt: new Date(),
      })
      .where(eq(channelBookingLinks.id, id))
      .returning()
    return row ?? null
  },

  async deleteBookingLink(db: PostgresJsDatabase, id: string) {
    const [row] = await db
      .delete(channelBookingLinks)
      .where(eq(channelBookingLinks.id, id))
      .returning({ id: channelBookingLinks.id })
    return row ?? null
  },

  async listWebhookEvents(db: PostgresJsDatabase, query: ChannelWebhookEventListQuery) {
    const conditions = []
    if (query.channelId) conditions.push(eq(channelWebhookEvents.channelId, query.channelId))
    if (query.status) conditions.push(eq(channelWebhookEvents.status, query.status))
    if (query.eventType) conditions.push(eq(channelWebhookEvents.eventType, query.eventType))
    const where = conditions.length ? and(...conditions) : undefined
    return paginate(
      db
        .select()
        .from(channelWebhookEvents)
        .where(where)
        .limit(query.limit)
        .offset(query.offset)
        .orderBy(desc(channelWebhookEvents.receivedAt)),
      db.select({ count: sql<number>`count(*)::int` }).from(channelWebhookEvents).where(where),
      query.limit,
      query.offset,
    )
  },

  async getWebhookEventById(db: PostgresJsDatabase, id: string) {
    const [row] = await db
      .select()
      .from(channelWebhookEvents)
      .where(eq(channelWebhookEvents.id, id))
      .limit(1)
    return row ?? null
  },

  async createWebhookEvent(db: PostgresJsDatabase, data: CreateChannelWebhookEventInput) {
    await requireChannel(db, data.channelId)
    const [row] = await db
      .insert(channelWebhookEvents)
      .values({
        ...data,
        receivedAt: toDateOrNull(data.receivedAt) ?? new Date(),
        processedAt: toDateOrNull(data.processedAt),
      })
      .returning()
    return row
  },

  async updateWebhookEvent(
    db: PostgresJsDatabase,
    id: string,
    data: UpdateChannelWebhookEventInput,
  ) {
    const [row] = await db
      .update(channelWebhookEvents)
      .set({
        ...data,
        receivedAt: data.receivedAt ? new Date(data.receivedAt) : undefined,
        processedAt: data.processedAt === undefined ? undefined : toDateOrNull(data.processedAt),
      })
      .where(eq(channelWebhookEvents.id, id))
      .returning()
    return row ?? null
  },

  async deleteWebhookEvent(db: PostgresJsDatabase, id: string) {
    const [row] = await db
      .delete(channelWebhookEvents)
      .where(eq(channelWebhookEvents.id, id))
      .returning({ id: channelWebhookEvents.id })
    return row ?? null
  },
}
