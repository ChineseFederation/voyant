import { and, sql } from "drizzle-orm"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"

import { suppliers } from "./schema.js"

type SupplierStatus = (typeof suppliers.$inferSelect)["status"]
type SupplierType = (typeof suppliers.$inferSelect)["type"]

const ALL_SUPPLIER_STATUSES: readonly SupplierStatus[] = ["active", "inactive", "pending"]
const ALL_SUPPLIER_TYPES: readonly SupplierType[] = [
  "hotel",
  "transfer",
  "guide",
  "experience",
  "airline",
  "restaurant",
  "other",
]

export interface SupplierAggregates {
  total: number
  countsByStatus: Array<{ status: SupplierStatus; count: number }>
  countsByType: Array<{ type: SupplierType; count: number }>
  /** Shorthand for the `active` bucket — dashboard KPI card. */
  active: number
}

export async function getSupplierAggregates(
  db: PostgresJsDatabase,
  options: { from?: string; to?: string } = {},
): Promise<SupplierAggregates> {
  const fromDate = options.from ? new Date(options.from) : undefined
  const toDate = options.to ? new Date(options.to) : undefined

  const rangeConditions = []
  // Bind ISO strings — raw Date params stringify via Date#toString() and fail
  // against timestamptz (same pattern as bookings/inventory/finance aggregates).
  // agent-quality: raw-sql reviewed -- owner: suppliers; dynamic SQL interpolation uses Drizzle parameter binding or vetted SQL identifiers.
  if (fromDate) rangeConditions.push(sql`${suppliers.createdAt} >= ${fromDate.toISOString()}`)
  // agent-quality: raw-sql reviewed -- owner: suppliers; dynamic SQL interpolation uses Drizzle parameter binding or vetted SQL identifiers.
  if (toDate) rangeConditions.push(sql`${suppliers.createdAt} < ${toDate.toISOString()}`)
  const rangeWhere = rangeConditions.length ? and(...rangeConditions) : undefined

  const [[totalRow], statusRows, typeRows] = await Promise.all([
    db.select({ count: sql<number>`count(*)::int` }).from(suppliers).where(rangeWhere),
    db
      .select({ status: suppliers.status, count: sql<number>`count(*)::int` })
      .from(suppliers)
      .where(rangeWhere)
      .groupBy(suppliers.status),
    db
      .select({ type: suppliers.type, count: sql<number>`count(*)::int` })
      .from(suppliers)
      .where(rangeWhere)
      .groupBy(suppliers.type),
  ])

  const statusMap = new Map<SupplierStatus, number>(statusRows.map((r) => [r.status, r.count]))
  const typeMap = new Map<SupplierType, number>(typeRows.map((r) => [r.type, r.count]))

  return {
    total: totalRow?.count ?? 0,
    countsByStatus: ALL_SUPPLIER_STATUSES.map((status) => ({
      status,
      count: statusMap.get(status) ?? 0,
    })),
    countsByType: ALL_SUPPLIER_TYPES.map((type) => ({
      type,
      count: typeMap.get(type) ?? 0,
    })),
    active: statusMap.get("active") ?? 0,
  }
}
