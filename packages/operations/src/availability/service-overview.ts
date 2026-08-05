import { and, asc, eq, getTableColumns, gte, inArray, notExists, sql } from "drizzle-orm"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"
import { productsRef } from "./products-ref.js"
import { availabilityPickupPoints, availabilityRules, availabilitySlots } from "./schema.js"

export interface AvailabilityOverviewOptions {
  productId?: string
  attentionLimit?: number
}

export interface AvailabilityOverview {
  openSlotsCount: number
  constrainedSlotsCount: number
  activeRulesCount: number
  activePickupPointsCount: number
  productsWithoutUpcomingDeparturesCount: number
  productsWithoutUpcomingDepartures: Array<{ id: string; name: string }>
  constrainedSlots: Array<
    typeof availabilitySlots.$inferSelect & {
      productName: string | null
    }
  >
}

export async function getAvailabilityOverview(
  db: PostgresJsDatabase,
  options: AvailabilityOverviewOptions = {},
): Promise<AvailabilityOverview> {
  const now = new Date()
  const attentionLimit = options.attentionLimit ?? 4

  const productSlotCondition = options.productId
    ? eq(availabilitySlots.productId, options.productId)
    : undefined
  const productRuleCondition = options.productId
    ? eq(availabilityRules.productId, options.productId)
    : undefined
  const productPickupCondition = options.productId
    ? eq(availabilityPickupPoints.productId, options.productId)
    : undefined
  const productCondition = options.productId ? eq(productsRef.id, options.productId) : undefined

  const openUpcomingWhere = and(
    productSlotCondition,
    eq(availabilitySlots.status, "open"),
    gte(availabilitySlots.startsAt, now),
  )
  const constrainedUpcomingWhere = and(
    productSlotCondition,
    inArray(availabilitySlots.status, ["closed", "sold_out"]),
    gte(availabilitySlots.startsAt, now),
  )
  const coverageGapWhere = and(
    productCondition,
    notExists(
      db
        .select({ one: sql`1` })
        .from(availabilitySlots)
        .where(
          and(
            eq(availabilitySlots.productId, productsRef.id),
            eq(availabilitySlots.status, "open"),
            gte(availabilitySlots.startsAt, now),
          ),
        ),
    ),
  )

  const [
    openSlotsRow,
    constrainedSlotsRow,
    constrainedSlots,
    activeRulesRow,
    activePickupPointsRow,
    coverageGapRow,
    productsWithoutUpcomingDepartures,
  ] = await Promise.all([
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(availabilitySlots)
      .where(openUpcomingWhere),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(availabilitySlots)
      .where(constrainedUpcomingWhere),
    db
      .select({ ...getTableColumns(availabilitySlots), productName: productsRef.name })
      .from(availabilitySlots)
      .leftJoin(productsRef, eq(availabilitySlots.productId, productsRef.id))
      .where(constrainedUpcomingWhere)
      .orderBy(asc(availabilitySlots.startsAt))
      .limit(attentionLimit),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(availabilityRules)
      .where(and(productRuleCondition, eq(availabilityRules.active, true))),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(availabilityPickupPoints)
      .where(and(productPickupCondition, eq(availabilityPickupPoints.active, true))),
    db.select({ count: sql<number>`count(*)::int` }).from(productsRef).where(coverageGapWhere),
    db
      .select({ id: productsRef.id, name: productsRef.name })
      .from(productsRef)
      .where(coverageGapWhere)
      .orderBy(asc(productsRef.name))
      .limit(attentionLimit),
  ])

  return {
    openSlotsCount: openSlotsRow[0]?.count ?? 0,
    constrainedSlotsCount: constrainedSlotsRow[0]?.count ?? 0,
    activeRulesCount: activeRulesRow[0]?.count ?? 0,
    activePickupPointsCount: activePickupPointsRow[0]?.count ?? 0,
    productsWithoutUpcomingDeparturesCount: coverageGapRow[0]?.count ?? 0,
    productsWithoutUpcomingDepartures,
    constrainedSlots,
  }
}
