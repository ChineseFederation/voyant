import type { AnyDrizzleDb } from "@voyant-travel/db"
import { type SQL, sql } from "drizzle-orm"

export interface AvailabilityPushSlot {
  id: string
  productId: string
  optionId: string | null
  startsAt: Date
  unlimited: boolean
  remainingPax: number | null
  updatedAt: Date
}

export interface ContentPushProduct {
  id: string
  name: string
  description: string | null
}

type AvailabilitySlotRow = {
  id: string
  product_id: string
  option_id: string | null
  starts_at: Date | string
  unlimited: boolean
  remaining_pax: number | string | null
  updated_at: Date | string
}

type ProductContentRow = {
  id: string
  name: string
  description: string | null
}

async function executeBoundaryRows<T extends object>(db: AnyDrizzleDb, query: SQL): Promise<T[]> {
  // biome-ignore lint/suspicious/noExplicitAny: #1141 keeps cross-package SQL boundary reads driver-agnostic.
  const result = await (db as any).execute(query)
  return (Array.isArray(result) ? result : (result?.rows ?? [])) as T[]
}

function sqlList(values: readonly string[]): SQL {
  // agent-quality: raw-sql reviewed -- owner: distribution; callers pass only parameter-bound scalar ids into the joined SQL fragment.
  return sql.join(
    values.map((value) => sql`${value}`),
    sql`, `,
  )
}

function toDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value)
}

function toNumber(value: number | string | null): number | null {
  if (value === null) return null
  return typeof value === "number" ? value : Number(value)
}

function mapAvailabilitySlot(row: AvailabilitySlotRow): AvailabilityPushSlot {
  return {
    id: row.id,
    productId: row.product_id,
    optionId: row.option_id,
    startsAt: toDate(row.starts_at),
    unlimited: row.unlimited,
    remainingPax: toNumber(row.remaining_pax),
    updatedAt: toDate(row.updated_at),
  }
}

export async function loadAvailabilityPushSlot(
  db: AnyDrizzleDb,
  slotId: string,
): Promise<AvailabilityPushSlot | null> {
  const rows = await executeBoundaryRows<AvailabilitySlotRow>(
    db,
    // agent-quality: raw-sql reviewed -- owner: distribution; Availability is a read-only push source and slot id is parameter-bound.
    sql`
      SELECT id, product_id, option_id, starts_at, unlimited, remaining_pax, updated_at
      FROM availability_slots
      WHERE id = ${slotId}
      LIMIT 1
    `,
  )
  return rows[0] ? mapAvailabilitySlot(rows[0]) : null
}

export async function loadRecentlyUpdatedAvailabilityPushSlots(
  db: AnyDrizzleDb,
  input: { updatedAfter: Date; limit: number },
): Promise<AvailabilityPushSlot[]> {
  const rows = await executeBoundaryRows<AvailabilitySlotRow>(
    db,
    // agent-quality: raw-sql reviewed -- owner: distribution; Availability slots are read-only reconciler sources with parameter-bound cursor and limit.
    sql`
      SELECT id, product_id, option_id, starts_at, unlimited, remaining_pax, updated_at
      FROM availability_slots
      WHERE updated_at > ${input.updatedAfter.toISOString()}
      ORDER BY updated_at ASC
      LIMIT ${input.limit}
    `,
  )
  return rows.map(mapAvailabilitySlot)
}

export async function loadContentPushProduct(
  db: AnyDrizzleDb,
  productId: string,
): Promise<ContentPushProduct | null> {
  const rows = await executeBoundaryRows<ProductContentRow>(
    db,
    // agent-quality: raw-sql reviewed -- owner: distribution; Product is a read-only content-push source and product id is parameter-bound.
    sql`
      SELECT id, name, description
      FROM products
      WHERE id = ${productId}
      LIMIT 1
    `,
  )
  return rows[0] ?? null
}

export async function loadContentPushProducts(
  db: AnyDrizzleDb,
  productIds: readonly string[],
): Promise<Map<string, ContentPushProduct>> {
  if (productIds.length === 0) return new Map()
  const rows = await executeBoundaryRows<ProductContentRow>(
    db,
    // agent-quality: raw-sql reviewed -- owner: distribution; Product is a read-only content-push source and product ids are parameter-bound.
    sql`
      SELECT id, name, description
      FROM products
      WHERE id IN (${sqlList(productIds)})
    `,
  )
  return new Map(rows.map((row) => [row.id, row]))
}
