import { type SQL, sql } from "drizzle-orm"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"

export {
  getStorefrontSlotResourceAvailability,
  getStorefrontSlotsResourceAvailability,
  type StorefrontSlotResourceAvailability,
} from "./service-boundary-resource-sql.js"

export type StorefrontSlotStatus = "open" | "closed" | "sold_out" | "cancelled"

export interface StorefrontSlotRow {
  id: string
  productId: string
  itineraryId: string | null
  optionId: string | null
  startTimeId: string | null
  dateLocal: Date | string
  startsAt: Date | string
  endsAt: Date | string | null
  timezone: string
  status: StorefrontSlotStatus
  unlimited: boolean
  initialPax: number | null
  remainingPax: number | null
  pastCutoff: boolean
  tooEarly: boolean
  nights: number | null
  days: number | null
  startTimeLabel: string | null
  startTimeLocal: string | null
  durationMinutes: number | null
}

export interface StorefrontProductPricingFacts {
  id: string
  sellCurrency: string
  sellAmountCents: number | null
  capacityMode: string
}

export interface StorefrontProductOptionFacts {
  id: string
  name: string
  description: string | null
}

export interface StorefrontOptionUnitFacts {
  id: string
  name: string
  unitType: string
  minAge: number | null
  maxAge: number | null
  occupancyMin: number | null
  occupancyMax: number | null
  isRequired: boolean
}

export interface StorefrontItineraryDay {
  id: string
  dayNumber: number
  title: string | null
  description: string | null
}

export interface StorefrontItineraryDayService {
  id: string
  dayId: string
  name: string
  description: string | null
  sortOrder: number | null
}

export interface StorefrontItineraryDayMedia {
  id: string
  dayId: string | null
  url: string
  isCover: boolean
  sortOrder: number
}

type StorefrontSlotDbRow = {
  id: string
  product_id: string
  itinerary_id: string | null
  option_id: string | null
  start_time_id: string | null
  date_local: Date | string
  starts_at: Date | string
  ends_at: Date | string | null
  timezone: string
  status: StorefrontSlotStatus
  unlimited: boolean
  initial_pax: number | string | null
  remaining_pax: number | string | null
  past_cutoff: boolean
  too_early: boolean
  nights: number | string | null
  days: number | string | null
  start_time_label: string | null
  start_time_local: string | null
  duration_minutes: number | string | null
}

type ProductPricingFactsDbRow = {
  id: string
  sell_currency: string
  sell_amount_cents: number | string | null
  capacity_mode: string
}

type ProductOptionFactsDbRow = {
  id: string
  name: string
  description: string | null
}

type OptionUnitFactsDbRow = {
  id: string
  name: string
  unit_type: string
  min_age: number | string | null
  max_age: number | string | null
  occupancy_min: number | string | null
  occupancy_max: number | string | null
  is_required: boolean
}

type ProductLocationDbRow = {
  product_id: string
  title: string
}

type ProductItineraryDbRow = {
  product_id: string
  itinerary_id: string
}

function isRowsResult(value: unknown): value is { rows: unknown[] } {
  return (
    typeof value === "object" && value !== null && Array.isArray((value as { rows?: unknown }).rows)
  )
}

async function executeBoundaryRows<T extends object>(
  db: PostgresJsDatabase,
  query: SQL,
): Promise<T[]> {
  const result: unknown = await db.execute(query)
  return (Array.isArray(result) ? result : isRowsResult(result) ? result.rows : []) as T[]
}

function sqlList(values: readonly string[]): SQL {
  // agent-quality: raw-sql reviewed -- owner: storefront; callers pass only parameter-bound scalar ids into this SQL fragment.
  return sql.join(
    values.map((value) => sql`${value}`),
    sql`, `,
  )
}

function sqlAnd(conditions: readonly SQL[]): SQL {
  return sql.join([...conditions], sql` AND `)
}

function toNumber(value: number | string | null): number | null {
  if (value === null) return null
  return typeof value === "number" ? value : Number(value)
}

function mapSlot(row: StorefrontSlotDbRow): StorefrontSlotRow {
  return {
    id: row.id,
    productId: row.product_id,
    itineraryId: row.itinerary_id,
    optionId: row.option_id,
    startTimeId: row.start_time_id,
    dateLocal: row.date_local,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    timezone: row.timezone,
    status: row.status,
    unlimited: row.unlimited,
    initialPax: toNumber(row.initial_pax),
    remainingPax: toNumber(row.remaining_pax),
    pastCutoff: row.past_cutoff,
    tooEarly: row.too_early,
    nights: toNumber(row.nights),
    days: toNumber(row.days),
    startTimeLabel: row.start_time_label,
    startTimeLocal: row.start_time_local,
    durationMinutes: toNumber(row.duration_minutes),
  }
}

function buildSlotFilters(filters: {
  productId?: string
  slotId?: string
  optionId?: string
  status?: StorefrontSlotStatus
  dateFrom?: string
  dateTo?: string
  includeCancelled?: boolean
}): SQL[] {
  const conditions: SQL[] = [
    sql`p.status = 'active'`,
    sql`p.activated = true`,
    sql`p.visibility = 'public'`,
  ]

  if (filters.productId) {
    // agent-quality: raw-sql reviewed -- owner: storefront; product id is parameter-bound in the public slot filter.
    conditions.push(sql`s.product_id = ${filters.productId}`)
  }

  if (filters.slotId) {
    // agent-quality: raw-sql reviewed -- owner: storefront; slot id is parameter-bound in the public slot filter.
    conditions.push(sql`s.id = ${filters.slotId}`)
  }

  if (filters.optionId) {
    // agent-quality: raw-sql reviewed -- owner: storefront; option id is parameter-bound in the public slot filter.
    conditions.push(sql`s.option_id = ${filters.optionId}`)
  }

  if (filters.status) {
    // agent-quality: raw-sql reviewed -- owner: storefront; slot status is validated by Storefront before binding.
    conditions.push(sql`s.status = ${filters.status}`)
  } else if (!filters.includeCancelled) {
    conditions.push(sql`s.status <> 'cancelled'`)
  }

  if (filters.dateFrom) {
    // agent-quality: raw-sql reviewed -- owner: storefront; dateFrom is schema-validated and parameter-bound.
    conditions.push(sql`s.date_local >= ${filters.dateFrom}`)
  }

  if (filters.dateTo) {
    // agent-quality: raw-sql reviewed -- owner: storefront; dateTo is schema-validated and parameter-bound.
    conditions.push(sql`s.date_local <= ${filters.dateTo}`)
  }

  return conditions
}

export async function listStorefrontSlots(
  db: PostgresJsDatabase,
  filters: {
    productId?: string
    slotId?: string
    optionId?: string
    status?: StorefrontSlotStatus
    dateFrom?: string
    dateTo?: string
    limit?: number
    offset?: number
    includeCancelled?: boolean
  } = {},
): Promise<StorefrontSlotRow[]> {
  const rows = await executeBoundaryRows<StorefrontSlotDbRow>(
    db,
    // agent-quality: raw-sql reviewed -- owner: storefront; public slot reads are filtered by parameter-bound user inputs and public Product flags.
    sql`
      SELECT
        s.id,
        s.product_id,
        s.itinerary_id,
        s.option_id,
        s.start_time_id,
        s.date_local,
        s.starts_at,
        s.ends_at,
        s.timezone,
        s.status,
        s.unlimited,
        s.initial_pax,
        s.remaining_pax,
        s.past_cutoff,
        s.too_early,
        s.nights,
        s.days,
        st.label AS start_time_label,
        st.start_time_local,
        st.duration_minutes
      FROM availability_slots s
      JOIN products p ON p.id = s.product_id
      LEFT JOIN availability_start_times st ON st.id = s.start_time_id
      WHERE ${sqlAnd(buildSlotFilters(filters))}
      ORDER BY s.starts_at ASC
      LIMIT ${filters.limit ?? 100}
      OFFSET ${filters.offset ?? 0}
    `,
  )
  return rows.map(mapSlot)
}

export async function countStorefrontSlots(
  db: PostgresJsDatabase,
  filters: {
    productId?: string
    slotId?: string
    optionId?: string
    status?: StorefrontSlotStatus
    dateFrom?: string
    dateTo?: string
    includeCancelled?: boolean
  } = {},
): Promise<number> {
  const rows = await executeBoundaryRows<{ value: number | string }>(
    db,
    // agent-quality: raw-sql reviewed -- owner: storefront; count uses the same public slot predicates as listStorefrontSlots.
    sql`
      SELECT COUNT(*)::int AS value
      FROM availability_slots s
      JOIN products p ON p.id = s.product_id
      WHERE ${sqlAnd(buildSlotFilters(filters))}
    `,
  )
  return Number(rows[0]?.value ?? 0)
}

export async function listMeetingPointsByProductIds(
  db: PostgresJsDatabase,
  productIds: string[],
): Promise<Map<string, string>> {
  const uniqueIds = [...new Set(productIds)].filter(Boolean)
  if (uniqueIds.length === 0) return new Map()

  const rows = await executeBoundaryRows<ProductLocationDbRow>(
    db,
    // agent-quality: raw-sql reviewed -- owner: storefront; Product location ids are parameter-bound and read-only for public meeting points.
    sql`
      SELECT product_id, title
      FROM product_locations
      WHERE product_id IN (${sqlList(uniqueIds)})
      ORDER BY location_type ASC, sort_order ASC, created_at ASC
    `,
  )

  const byProduct = new Map<string, string>()
  for (const row of rows) {
    if (!byProduct.has(row.product_id)) {
      byProduct.set(row.product_id, row.title)
    }
  }
  return byProduct
}

export async function listDefaultItineraryIdsByProductIds(
  db: PostgresJsDatabase,
  productIds: string[],
): Promise<Map<string, string>> {
  const uniqueIds = [...new Set(productIds)].filter(Boolean)
  if (uniqueIds.length === 0) return new Map()

  const rows = await executeBoundaryRows<ProductItineraryDbRow>(
    db,
    // agent-quality: raw-sql reviewed -- owner: storefront; Product itinerary ids are parameter-bound and read-only.
    sql`
      SELECT product_id, id AS itinerary_id
      FROM product_itineraries
      WHERE product_id IN (${sqlList(uniqueIds)})
        AND is_default = true
      ORDER BY sort_order ASC, created_at ASC
    `,
  )

  return new Map(rows.map((row) => [row.product_id, row.itinerary_id] as const))
}

export async function loadProductPricingFacts(
  db: PostgresJsDatabase,
  productId: string,
): Promise<StorefrontProductPricingFacts | null> {
  const rows = await executeBoundaryRows<ProductPricingFactsDbRow>(
    db,
    // agent-quality: raw-sql reviewed -- owner: storefront; Product pricing facts are read-only and product id is parameter-bound.
    sql`
      SELECT id, sell_currency, sell_amount_cents, capacity_mode
      FROM products
      WHERE id = ${productId}
      LIMIT 1
    `,
  )
  const row = rows[0]
  return row
    ? {
        id: row.id,
        sellCurrency: row.sell_currency,
        sellAmountCents: toNumber(row.sell_amount_cents),
        capacityMode: row.capacity_mode,
      }
    : null
}

export async function loadProductOptionFacts(
  db: PostgresJsDatabase,
  input: { productId: string; optionId?: string | null },
): Promise<StorefrontProductOptionFacts | null> {
  // agent-quality: raw-sql reviewed -- owner: storefront; optional Product option id is parameter-bound when present.
  const optionFilter = input.optionId ? sql`AND id = ${input.optionId}` : sql``
  const rows = await executeBoundaryRows<ProductOptionFactsDbRow>(
    db,
    // agent-quality: raw-sql reviewed -- owner: storefront; Product option facts are read-only and filters are parameter-bound.
    sql`
      SELECT id, name, description
      FROM product_options
      WHERE product_id = ${input.productId}
        AND status = 'active'
        ${optionFilter}
      ORDER BY is_default DESC, sort_order ASC, name ASC
      LIMIT 1
    `,
  )
  return rows[0] ?? null
}

export async function listOptionUnitFacts(
  db: PostgresJsDatabase,
  optionId: string,
): Promise<StorefrontOptionUnitFacts[]> {
  const rows = await executeBoundaryRows<OptionUnitFactsDbRow>(
    db,
    // agent-quality: raw-sql reviewed -- owner: storefront; option unit facts are read-only and option id is parameter-bound.
    sql`
      SELECT
        id,
        name,
        unit_type,
        min_age,
        max_age,
        occupancy_min,
        occupancy_max,
        is_required
      FROM option_units
      WHERE option_id = ${optionId}
        AND is_hidden = false
      ORDER BY sort_order ASC, name ASC
    `,
  )
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    unitType: row.unit_type,
    minAge: toNumber(row.min_age),
    maxAge: toNumber(row.max_age),
    occupancyMin: toNumber(row.occupancy_min),
    occupancyMax: toNumber(row.occupancy_max),
    isRequired: row.is_required,
  }))
}

export async function listItineraryDays(
  db: PostgresJsDatabase,
  itineraryId: string,
  languageTag?: string | null,
): Promise<StorefrontItineraryDay[]> {
  return executeBoundaryRows<StorefrontItineraryDay>(
    db,
    // agent-quality: raw-sql reviewed -- owner: storefront; itinerary id and optional language tag are parameter-bound and rows are read-only.
    sql`
      SELECT
        d.id,
        d.day_number AS "dayNumber",
        COALESCE(dt.title, d.title) AS title,
        COALESCE(dt.description, d.description) AS description
      FROM product_days d
      LEFT JOIN product_day_translations dt
        ON dt.day_id = d.id
       AND dt.language_tag = ${languageTag ?? null}
      WHERE d.itinerary_id = ${itineraryId}
      ORDER BY d.day_number ASC
    `,
  )
}

export async function listItineraryDayServices(
  db: PostgresJsDatabase,
  dayIds: string[],
  languageTag?: string | null,
): Promise<StorefrontItineraryDayService[]> {
  const uniqueIds = [...new Set(dayIds)].filter(Boolean)
  if (uniqueIds.length === 0) return []

  return executeBoundaryRows<StorefrontItineraryDayService>(
    db,
    // agent-quality: raw-sql reviewed -- owner: storefront; day ids and optional language tag are parameter-bound and service rows are read-only.
    sql`
      SELECT
        s.id,
        s.day_id AS "dayId",
        COALESCE(st.name, s.name) AS name,
        COALESCE(st.description, s.description) AS description,
        s.sort_order AS "sortOrder"
      FROM product_day_services s
      LEFT JOIN product_day_service_translations st
        ON st.service_id = s.id
       AND st.language_tag = ${languageTag ?? null}
      WHERE s.day_id IN (${sqlList(uniqueIds)})
      ORDER BY s.sort_order ASC, s.created_at ASC
    `,
  )
}

export async function listItineraryDayMedia(
  db: PostgresJsDatabase,
  input: { productId: string; dayIds: string[] },
): Promise<StorefrontItineraryDayMedia[]> {
  const uniqueDayIds = [...new Set(input.dayIds)].filter(Boolean)
  if (uniqueDayIds.length === 0) return []

  return executeBoundaryRows<StorefrontItineraryDayMedia>(
    db,
    // agent-quality: raw-sql reviewed -- owner: storefront; product/day ids are parameter-bound and media rows are read-only.
    sql`
      SELECT
        id,
        day_id AS "dayId",
        url,
        is_cover AS "isCover",
        sort_order AS "sortOrder"
      FROM product_media
      WHERE product_id = ${input.productId}
        AND day_id IN (${sqlList(uniqueDayIds)})
      ORDER BY is_cover DESC, sort_order ASC, created_at ASC
    `,
  )
}
