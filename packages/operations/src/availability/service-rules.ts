/**
 * Availability rules and start times — the recurring-supply authoring surface.
 *
 * Split out of `service-core.ts`, which had grown past the size gate while
 * owning four unrelated aggregates. Rules and start times are self-contained:
 * they touch neither `availability_slots` nor the slot mutation lifecycle, so
 * they move as a unit with no behaviour change.
 */

import { and, desc, eq, getTableColumns, sql } from "drizzle-orm"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"
import { productsRef } from "./products-ref.js"
import { availabilityRules, availabilityStartTimes } from "./schema.js"
import { assertProductAllowsStaticAvailability } from "./service-product-guard.js"
import type {
  AvailabilityRuleListQuery,
  AvailabilityStartTimeListQuery,
  CreateAvailabilityRuleInput,
  CreateAvailabilityStartTimeInput,
  UpdateAvailabilityRuleInput,
  UpdateAvailabilityStartTimeInput,
} from "./service-shared.js"
import { paginate } from "./service-shared.js"
import { assertAvailabilityRecurrenceRule } from "./service-validation.js"

export async function listRules(db: PostgresJsDatabase, query: AvailabilityRuleListQuery) {
  const conditions = []
  if (query.productId) conditions.push(eq(availabilityRules.productId, query.productId))
  if (query.optionId) conditions.push(eq(availabilityRules.optionId, query.optionId))
  if (query.facilityId) conditions.push(eq(availabilityRules.facilityId, query.facilityId))
  if (query.active !== undefined) conditions.push(eq(availabilityRules.active, query.active))

  const where = conditions.length ? and(...conditions) : undefined
  return paginate(
    db
      .select({ ...getTableColumns(availabilityRules), productName: productsRef.name })
      .from(availabilityRules)
      .leftJoin(productsRef, eq(availabilityRules.productId, productsRef.id))
      .where(where)
      .limit(query.limit)
      .offset(query.offset)
      .orderBy(desc(availabilityRules.updatedAt)),
    db.select({ count: sql<number>`count(*)::int` }).from(availabilityRules).where(where),
    query.limit,
    query.offset,
  )
}

export async function getRuleById(db: PostgresJsDatabase, id: string) {
  const [row] = await db
    .select()
    .from(availabilityRules)
    .where(eq(availabilityRules.id, id))
    .limit(1)
  return row ?? null
}

export async function createRule(db: PostgresJsDatabase, data: CreateAvailabilityRuleInput) {
  assertAvailabilityRecurrenceRule(data.recurrenceRule)

  if (data.active !== false) {
    await assertProductAllowsStaticAvailability(db, data.productId, "rule")
  }

  const [row] = await db.insert(availabilityRules).values(data).returning()
  return row
}

export async function updateRule(
  db: PostgresJsDatabase,
  id: string,
  data: UpdateAvailabilityRuleInput,
) {
  if (data.recurrenceRule !== undefined) {
    assertAvailabilityRecurrenceRule(data.recurrenceRule)
  }

  if (data.productId !== undefined || data.active === true) {
    const [current] = await db
      .select({ productId: availabilityRules.productId, active: availabilityRules.active })
      .from(availabilityRules)
      .where(eq(availabilityRules.id, id))
      .limit(1)
    if (!current) return null

    const nextProductId = data.productId ?? current.productId
    const nextActive = data.active ?? current.active
    if (nextActive) {
      await assertProductAllowsStaticAvailability(db, nextProductId, "rule")
    }
  }

  const [row] = await db
    .update(availabilityRules)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(availabilityRules.id, id))
    .returning()
  return row ?? null
}

export async function deleteRule(db: PostgresJsDatabase, id: string) {
  const [row] = await db
    .delete(availabilityRules)
    .where(eq(availabilityRules.id, id))
    .returning({ id: availabilityRules.id })
  return row ?? null
}

export async function listStartTimes(
  db: PostgresJsDatabase,
  query: AvailabilityStartTimeListQuery,
) {
  const conditions = []
  if (query.productId) conditions.push(eq(availabilityStartTimes.productId, query.productId))
  if (query.optionId) conditions.push(eq(availabilityStartTimes.optionId, query.optionId))
  if (query.facilityId) conditions.push(eq(availabilityStartTimes.facilityId, query.facilityId))
  if (query.active !== undefined) conditions.push(eq(availabilityStartTimes.active, query.active))
  const where = conditions.length ? and(...conditions) : undefined

  return paginate(
    db
      .select({ ...getTableColumns(availabilityStartTimes), productName: productsRef.name })
      .from(availabilityStartTimes)
      .leftJoin(productsRef, eq(availabilityStartTimes.productId, productsRef.id))
      .where(where)
      .limit(query.limit)
      .offset(query.offset)
      .orderBy(availabilityStartTimes.sortOrder, availabilityStartTimes.createdAt),
    db.select({ count: sql<number>`count(*)::int` }).from(availabilityStartTimes).where(where),
    query.limit,
    query.offset,
  )
}

export async function getStartTimeById(db: PostgresJsDatabase, id: string) {
  const [row] = await db
    .select()
    .from(availabilityStartTimes)
    .where(eq(availabilityStartTimes.id, id))
    .limit(1)
  return row ?? null
}

export async function createStartTime(
  db: PostgresJsDatabase,
  data: CreateAvailabilityStartTimeInput,
) {
  const [row] = await db.insert(availabilityStartTimes).values(data).returning()
  return row
}

export async function updateStartTime(
  db: PostgresJsDatabase,
  id: string,
  data: UpdateAvailabilityStartTimeInput,
) {
  const [row] = await db
    .update(availabilityStartTimes)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(availabilityStartTimes.id, id))
    .returning()
  return row ?? null
}

export async function deleteStartTime(db: PostgresJsDatabase, id: string) {
  const [row] = await db
    .delete(availabilityStartTimes)
    .where(eq(availabilityStartTimes.id, id))
    .returning({ id: availabilityStartTimes.id })
  return row ?? null
}
