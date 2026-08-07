// agent-quality: file-size exception -- owner: pricing; existing service module stays co-located until a dedicated split preserves behavior and tests.
import type {
  productBookingModeSchema,
  productCapacityModeSchema,
  productOptionStatusSchema,
} from "@voyant-travel/products-contracts/validation"
import { and, asc, desc, eq, inArray, type SQL, sql } from "drizzle-orm"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"
import type { z } from "zod"

import {
  optionPriceRules,
  optionUnitPriceRules,
  optionUnitTiers,
  priceCatalogs,
  priceSchedules,
} from "./schema.js"
import {
  loadDeparturePriceOverrides,
  pickRulesForDate,
  type ResolverScheduleInput,
  type UnitPriceOverride,
} from "./service-rule-resolver.js"
import type {
  PublicAvailabilitySnapshotQuery,
  PublicProductPricingQuery,
} from "./validation-public.js"

function normalizeDate(value: Date | string | null | undefined): string | null {
  if (!value) {
    return null
  }

  return value instanceof Date ? value.toISOString() : value
}

function normalizeDateOnly(value: Date | string | null | undefined): string | null {
  if (!value) {
    return null
  }

  return value instanceof Date ? value.toISOString().slice(0, 10) : value.slice(0, 10)
}

async function executeRows(db: PostgresJsDatabase, query: SQL): Promise<unknown[]> {
  // biome-ignore lint/suspicious/noExplicitAny: #1141 keeps cross-package SQL boundary reads driver-agnostic.
  const result = await (db as any).execute(query)
  return Array.isArray(result) ? result : (result?.rows ?? [])
}

function sqlList(values: readonly string[]): SQL {
  return sql.join(
    values.map((value) => sql`${value}`),
    sql`, `,
  )
}

function andSql(conditions: SQL[]): SQL {
  return sql.join(conditions, sql` AND `)
}

function readCount(row: unknown): number {
  const value = (row as { count?: unknown } | undefined)?.count
  if (typeof value === "number") return Number.isFinite(value) ? value : 0
  if (typeof value === "string") {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : 0
  }
  return 0
}

// These rows come from parameter-bound raw SQL over enum-typed columns, so the
// values are constrained to the product-contract enums; type them precisely
// (not `string`) so the public snapshot matches `publicPricedOptionSchema`.
type ProductBookingMode = z.infer<typeof productBookingModeSchema>
type ProductCapacityMode = z.infer<typeof productCapacityModeSchema>
type ProductOptionStatus = z.infer<typeof productOptionStatusSchema>

type PublicProductRow = {
  id: string
  booking_mode: ProductBookingMode
  capacity_mode: ProductCapacityMode
  sell_currency: string
}

type PublicProductContext = {
  id: string
  bookingMode: ProductBookingMode
  capacityMode: ProductCapacityMode
  sellCurrency: string
}

type PublicProductOptionRow = {
  id: string
  name: string
  description: string | null
  status: ProductOptionStatus
  is_default: boolean
}

type PublicOptionUnitRow = {
  id: string
  option_id: string
  name: string
  unit_type: string
  sort_order: number
}

type PublicStartTimeAdjustmentRow = {
  id: string
  option_price_rule_id: string
  start_time_id: string
  label: string | null
  start_time_local: string
  duration_minutes: number | null
  rule_mode: string
  adjustment_type: string | null
  sell_adjustment_cents: number | null
  adjustment_basis_points: number | null
}

type PublicAvailabilitySlotRow = {
  id: string
  option_id: string | null
  date_local: Date | string
  starts_at: Date | string
  ends_at: Date | string | null
  timezone: string
  status: string
  unlimited: boolean
  remaining_pax: number | null
  remaining_resources: number | null
  past_cutoff: boolean
  too_early: boolean
  start_time_id: string | null
  start_time_label: string | null
  start_time_local: string | null
  duration_minutes: number | null
}

async function ensurePublicProduct(
  db: PostgresJsDatabase,
  productId: string,
): Promise<PublicProductContext | null> {
  const rows = await executeRows(
    db,
    // agent-quality: raw-sql reviewed -- owner: pricing; cross-module Product visibility check with parameter-bound id.
    sql`
      SELECT id, booking_mode, capacity_mode, sell_currency
      FROM products
      WHERE id = ${productId}
        AND status::text = 'active'
        AND activated = true
        AND visibility::text = 'public'
      LIMIT 1
    `,
  )
  const product = rows[0] as PublicProductRow | undefined
  return product
    ? {
        id: product.id,
        bookingMode: product.booking_mode,
        capacityMode: product.capacity_mode,
        sellCurrency: product.sell_currency,
      }
    : null
}

async function resolvePublicCatalog(
  db: PostgresJsDatabase,
  input: { catalogId?: string | undefined },
) {
  if (input.catalogId) {
    const [catalog] = await db
      .select({
        id: priceCatalogs.id,
        code: priceCatalogs.code,
        name: priceCatalogs.name,
        currencyCode: priceCatalogs.currencyCode,
      })
      .from(priceCatalogs)
      .where(
        and(
          eq(priceCatalogs.id, input.catalogId),
          eq(priceCatalogs.catalogType, "public"),
          eq(priceCatalogs.active, true),
        ),
      )
      .limit(1)

    return catalog ?? null
  }

  const [catalog] = await db
    .select({
      id: priceCatalogs.id,
      code: priceCatalogs.code,
      name: priceCatalogs.name,
      currencyCode: priceCatalogs.currencyCode,
    })
    .from(priceCatalogs)
    .where(and(eq(priceCatalogs.catalogType, "public"), eq(priceCatalogs.active, true)))
    .orderBy(desc(priceCatalogs.isDefault), asc(priceCatalogs.name))
    .limit(1)

  return catalog ?? null
}

async function resolveQueryDate(
  db: PostgresJsDatabase,
  query: PublicProductPricingQuery,
): Promise<string | null> {
  if (query.date) return query.date
  if (!query.departureId) return null

  const rows = await executeRows(
    db,
    // agent-quality: raw-sql reviewed -- owner: pricing; cross-module Availability date lookup by parameter-bound slot id.
    sql`SELECT date_local FROM availability_slots WHERE id = ${query.departureId} LIMIT 1`,
  )
  const slot = rows[0] as { date_local?: Date | string | null } | undefined

  return normalizeDateOnly(slot?.date_local)
}

async function loadPublicProductOptions(
  db: PostgresJsDatabase,
  productId: string,
  optionId?: string,
): Promise<PublicProductOptionRow[]> {
  const conditions = [sql`product_id = ${productId}`, sql`status::text = 'active'`]
  if (optionId) {
    conditions.push(sql`id = ${optionId}`)
  }

  return executeRows(
    db,
    // agent-quality: raw-sql reviewed -- owner: pricing; cross-module Product option read with parameter-bound filters.
    sql`
      SELECT id, name, description, status::text AS status, is_default
      FROM product_options
      WHERE ${andSql(conditions)}
      ORDER BY is_default DESC, sort_order ASC, name ASC
    `,
  ) as Promise<PublicProductOptionRow[]>
}

async function loadPublicOptionUnits(
  db: PostgresJsDatabase,
  optionIds: readonly string[],
): Promise<PublicOptionUnitRow[]> {
  if (optionIds.length === 0) return []

  return executeRows(
    db,
    // agent-quality: raw-sql reviewed -- owner: pricing; cross-module Product option-unit read with parameter-bound option ids.
    sql`
      SELECT id, option_id, name, unit_type::text AS unit_type, sort_order
      FROM option_units
      WHERE option_id IN (${sqlList(optionIds)})
        AND is_hidden = false
      ORDER BY sort_order ASC, name ASC
    `,
  ) as Promise<PublicOptionUnitRow[]>
}

async function loadPublicStartTimeAdjustments(
  db: PostgresJsDatabase,
  ruleIds: readonly string[],
): Promise<PublicStartTimeAdjustmentRow[]> {
  if (ruleIds.length === 0) return []

  return executeRows(
    db,
    // agent-quality: raw-sql reviewed -- owner: pricing; joins local pricing rules to cross-module Availability start-time labels by parameter-bound rule ids.
    sql`
      SELECT
        rule.id,
        rule.option_price_rule_id,
        rule.start_time_id,
        start_time.label,
        start_time.start_time_local,
        start_time.duration_minutes,
        rule.rule_mode::text AS rule_mode,
        rule.adjustment_type::text AS adjustment_type,
        rule.sell_adjustment_cents,
        rule.adjustment_basis_points
      FROM option_start_time_rules rule
      INNER JOIN availability_start_times start_time
        ON start_time.id = rule.start_time_id
      WHERE rule.option_price_rule_id IN (${sqlList(ruleIds)})
        AND rule.active = true
        AND start_time.active = true
      ORDER BY start_time.sort_order ASC, start_time.start_time_local ASC
    `,
  ) as Promise<PublicStartTimeAdjustmentRow[]>
}

type PricingRuleRow = {
  id: string
  optionId: string
  name: string
  isDefault: boolean
  priceScheduleId: string | null
}

async function narrowRulesByDate<T extends PricingRuleRow>(
  db: PostgresJsDatabase,
  rules: T[],
  isoDate: string,
): Promise<T[]> {
  if (rules.length === 0) return rules

  const scheduleIds = Array.from(
    new Set(rules.map((r) => r.priceScheduleId).filter((id): id is string => id !== null)),
  )

  const schedules =
    scheduleIds.length > 0
      ? await db
          .select({
            id: priceSchedules.id,
            active: priceSchedules.active,
            priority: priceSchedules.priority,
            recurrenceRule: priceSchedules.recurrenceRule,
            validFrom: priceSchedules.validFrom,
            validTo: priceSchedules.validTo,
            weekdays: priceSchedules.weekdays,
            timezone: priceSchedules.timezone,
          })
          .from(priceSchedules)
          .where(inArray(priceSchedules.id, scheduleIds))
      : []

  const scheduleMap = new Map<string, ResolverScheduleInput>(
    schedules.map((s) => [
      s.id,
      {
        id: s.id,
        active: s.active,
        priority: s.priority,
        recurrenceRule: s.recurrenceRule,
        validFrom: s.validFrom,
        validTo: s.validTo,
        weekdays: s.weekdays ?? null,
        timezone: s.timezone,
      },
    ]),
  )

  const rulesByOption = new Map<string, T[]>()
  for (const r of rules) {
    const existing = rulesByOption.get(r.optionId) ?? []
    existing.push(r)
    rulesByOption.set(r.optionId, existing)
  }

  const winners: T[] = []
  for (const [, candidateRules] of rulesByOption) {
    const picked = pickRulesForDate(candidateRules, scheduleMap, isoDate)
    const winnerId = picked[0]?.id
    if (!winnerId) continue
    const winner = candidateRules.find((r) => r.id === winnerId)
    if (winner) winners.push(winner)
  }

  return winners
}

export const publicPricingService = {
  async getProductPricingSnapshot(
    db: PostgresJsDatabase,
    productId: string,
    query: PublicProductPricingQuery,
  ) {
    const product = await ensurePublicProduct(db, productId)
    if (!product) {
      return null
    }

    const catalog = await resolvePublicCatalog(db, query)
    if (!catalog) {
      return null
    }

    const options = await loadPublicProductOptions(db, productId, query.optionId)

    if (options.length === 0) {
      return {
        productId,
        catalog: {
          ...catalog,
          currencyCode: catalog.currencyCode ?? product.sellCurrency,
        },
        options: [],
      }
    }

    const optionIds = options.map((option) => option.id)

    const resolvedDate = await resolveQueryDate(db, query)
    const overridesByUnit: Map<string, UnitPriceOverride> = query.departureId
      ? await loadDeparturePriceOverrides(db, {
          departureId: query.departureId,
          catalogId: catalog.id,
        })
      : new Map()

    const [units, allRules] = await Promise.all([
      loadPublicOptionUnits(db, optionIds),
      db
        .select({
          id: optionPriceRules.id,
          optionId: optionPriceRules.optionId,
          name: optionPriceRules.name,
          description: optionPriceRules.description,
          pricingMode: optionPriceRules.pricingMode,
          occupancyPriceBasis: optionPriceRules.occupancyPriceBasis,
          baseSellAmountCents: optionPriceRules.baseSellAmountCents,
          minPerBooking: optionPriceRules.minPerBooking,
          maxPerBooking: optionPriceRules.maxPerBooking,
          isDefault: optionPriceRules.isDefault,
          cancellationPolicyId: optionPriceRules.cancellationPolicyId,
          priceScheduleId: optionPriceRules.priceScheduleId,
        })
        .from(optionPriceRules)
        .where(
          and(
            eq(optionPriceRules.productId, productId),
            inArray(optionPriceRules.optionId, optionIds),
            eq(optionPriceRules.priceCatalogId, catalog.id),
            eq(optionPriceRules.active, true),
          ),
        )
        .orderBy(desc(optionPriceRules.isDefault), asc(optionPriceRules.name)),
    ])

    const rules = resolvedDate ? await narrowRulesByDate(db, allRules, resolvedDate) : allRules

    const ruleIds = rules.map((rule) => rule.id)

    const [unitPrices, startTimeAdjustments] = await Promise.all([
      ruleIds.length > 0
        ? db
            .select({
              id: optionUnitPriceRules.id,
              optionPriceRuleId: optionUnitPriceRules.optionPriceRuleId,
              unitId: optionUnitPriceRules.unitId,
              pricingMode: optionUnitPriceRules.pricingMode,
              sellAmountCents: optionUnitPriceRules.sellAmountCents,
              minQuantity: optionUnitPriceRules.minQuantity,
              maxQuantity: optionUnitPriceRules.maxQuantity,
              pricingCategoryId: optionUnitPriceRules.pricingCategoryId,
              sortOrder: optionUnitPriceRules.sortOrder,
            })
            .from(optionUnitPriceRules)
            .where(
              and(
                inArray(optionUnitPriceRules.optionPriceRuleId, ruleIds),
                eq(optionUnitPriceRules.active, true),
              ),
            )
            .orderBy(asc(optionUnitPriceRules.sortOrder), asc(optionUnitPriceRules.createdAt))
        : Promise.resolve([]),
      loadPublicStartTimeAdjustments(db, ruleIds),
    ])

    const unitPriceIds = unitPrices.map((unitPrice) => unitPrice.id)
    const tiers =
      unitPriceIds.length > 0
        ? await db
            .select({
              id: optionUnitTiers.id,
              optionUnitPriceRuleId: optionUnitTiers.optionUnitPriceRuleId,
              minQuantity: optionUnitTiers.minQuantity,
              maxQuantity: optionUnitTiers.maxQuantity,
              sellAmountCents: optionUnitTiers.sellAmountCents,
              sortOrder: optionUnitTiers.sortOrder,
            })
            .from(optionUnitTiers)
            .where(
              and(
                inArray(optionUnitTiers.optionUnitPriceRuleId, unitPriceIds),
                eq(optionUnitTiers.active, true),
              ),
            )
            .orderBy(asc(optionUnitTiers.sortOrder), asc(optionUnitTiers.minQuantity))
        : []

    const unitById = new Map(
      units.map((unit) => [
        unit.id,
        {
          id: unit.id,
          unitId: unit.id,
          unitName: unit.name,
          unitType: unit.unit_type,
          sortOrder: unit.sort_order,
        },
      ]),
    )

    const tiersByUnitPriceRule = new Map<string, Array<(typeof tiers)[number]>>()
    for (const tier of tiers) {
      const existing = tiersByUnitPriceRule.get(tier.optionUnitPriceRuleId) ?? []
      existing.push(tier)
      tiersByUnitPriceRule.set(tier.optionUnitPriceRuleId, existing)
    }

    const unitPricesByRule = new Map<string, Array<(typeof unitPrices)[number]>>()
    for (const unitPrice of unitPrices) {
      const existing = unitPricesByRule.get(unitPrice.optionPriceRuleId) ?? []
      existing.push(unitPrice)
      unitPricesByRule.set(unitPrice.optionPriceRuleId, existing)
    }

    const startTimeAdjustmentsByRule = new Map<
      string,
      Array<(typeof startTimeAdjustments)[number]>
    >()
    for (const adjustment of startTimeAdjustments) {
      const existing = startTimeAdjustmentsByRule.get(adjustment.option_price_rule_id) ?? []
      existing.push(adjustment)
      startTimeAdjustmentsByRule.set(adjustment.option_price_rule_id, existing)
    }

    const rulesByOption = new Map<string, Array<(typeof rules)[number]>>()
    for (const rule of rules) {
      const existing = rulesByOption.get(rule.optionId) ?? []
      existing.push(rule)
      rulesByOption.set(rule.optionId, existing)
    }

    return {
      productId,
      catalog: {
        ...catalog,
        currencyCode: catalog.currencyCode ?? product.sellCurrency,
      },
      options: options.map((option) => ({
        id: option.id,
        name: option.name,
        description: option.description ?? null,
        status: option.status,
        isDefault: option.is_default,
        bookingMode: product.bookingMode,
        capacityMode: product.capacityMode,
        pricingRules: (rulesByOption.get(option.id) ?? []).map((rule) => ({
          id: rule.id,
          name: rule.name,
          description: rule.description ?? null,
          pricingMode: rule.pricingMode,
          occupancyPriceBasis: rule.occupancyPriceBasis ?? null,
          baseSellAmountCents: rule.baseSellAmountCents ?? null,
          minPerBooking: rule.minPerBooking ?? null,
          maxPerBooking: rule.maxPerBooking ?? null,
          isDefault: rule.isDefault,
          cancellationPolicyId: rule.cancellationPolicyId ?? null,
          unitPrices: (unitPricesByRule.get(rule.id) ?? [])
            .map((unitPrice) => {
              const unit = unitById.get(unitPrice.unitId)
              if (!unit) {
                return null
              }

              const override = overridesByUnit.get(unit.unitId)

              return {
                id: unitPrice.id,
                unitId: unit.unitId,
                unitName: unit.unitName,
                unitType: unit.unitType,
                pricingMode: unitPrice.pricingMode,
                sellAmountCents: override
                  ? override.sellAmountCents
                  : (unitPrice.sellAmountCents ?? null),
                minQuantity: unitPrice.minQuantity ?? null,
                maxQuantity: unitPrice.maxQuantity ?? null,
                pricingCategoryId: unitPrice.pricingCategoryId ?? null,
                sortOrder: unitPrice.sortOrder,
                tiers: (tiersByUnitPriceRule.get(unitPrice.id) ?? []).map((tier) => ({
                  id: tier.id,
                  minQuantity: tier.minQuantity,
                  maxQuantity: tier.maxQuantity ?? null,
                  sellAmountCents: tier.sellAmountCents ?? null,
                  sortOrder: tier.sortOrder,
                })),
              }
            })
            .filter((value): value is NonNullable<typeof value> => value !== null),
          startTimeAdjustments: (startTimeAdjustmentsByRule.get(rule.id) ?? []).map(
            (adjustment) => ({
              id: adjustment.id,
              startTimeId: adjustment.start_time_id,
              label: adjustment.label ?? null,
              startTimeLocal: adjustment.start_time_local,
              ruleMode: adjustment.rule_mode,
              adjustmentType: adjustment.adjustment_type ?? null,
              sellAdjustmentCents: adjustment.sell_adjustment_cents ?? null,
              adjustmentBasisPoints: adjustment.adjustment_basis_points ?? null,
            }),
          ),
        })),
      })),
    }
  },

  async getAvailabilitySnapshot(
    db: PostgresJsDatabase,
    productId: string,
    query: PublicAvailabilitySnapshotQuery,
  ) {
    const product = await ensurePublicProduct(db, productId)
    if (!product) {
      return null
    }

    const conditions = [sql`slot.product_id = ${productId}`, sql`slot.status::text <> 'cancelled'`]

    if (query.optionId) {
      conditions.push(sql`slot.option_id = ${query.optionId}`)
    }

    if (query.dateFrom) {
      conditions.push(sql`slot.date_local >= ${query.dateFrom}`)
    }

    if (query.dateTo) {
      conditions.push(sql`slot.date_local <= ${query.dateTo}`)
    }

    if (query.status) {
      conditions.push(sql`slot.status::text = ${query.status}`)
    } else {
      conditions.push(sql`slot.status::text IN ('open', 'sold_out')`)
    }

    const where = andSql(conditions)

    const [rows, countResult] = await Promise.all([
      executeRows(
        db,
        // agent-quality: raw-sql reviewed -- owner: pricing; cross-module Availability public snapshot read with parameter-bound filters.
        sql`
          SELECT
            slot.id,
            slot.option_id,
            slot.date_local,
            slot.starts_at,
            slot.ends_at,
            slot.timezone,
            slot.status::text AS status,
            slot.unlimited,
            slot.remaining_pax,
            slot.remaining_resources,
            slot.past_cutoff,
            slot.too_early,
            start_time.id AS start_time_id,
            start_time.label AS start_time_label,
            start_time.start_time_local,
            start_time.duration_minutes
          FROM availability_slots slot
          LEFT JOIN availability_start_times start_time
            ON start_time.id = slot.start_time_id
          WHERE ${where}
          ORDER BY slot.starts_at ASC
          LIMIT ${query.limit}
          OFFSET ${query.offset}
        `,
      ) as Promise<PublicAvailabilitySlotRow[]>,
      executeRows(
        db,
        // agent-quality: raw-sql reviewed -- owner: pricing; count query uses the same parameter-bound Availability filters as the page query.
        sql`SELECT count(*)::int AS count FROM availability_slots slot WHERE ${where}`,
      ),
    ])

    return {
      productId,
      slots: rows.map((row) => ({
        id: row.id,
        optionId: row.option_id ?? null,
        dateLocal: normalizeDateOnly(row.date_local),
        startsAt: normalizeDate(row.starts_at),
        endsAt: normalizeDate(row.ends_at),
        timezone: row.timezone,
        status: row.status,
        unlimited: row.unlimited,
        remainingPax: row.remaining_pax ?? null,
        remainingResources: row.remaining_resources ?? null,
        pastCutoff: row.past_cutoff,
        tooEarly: row.too_early,
        startTime: row.start_time_id
          ? {
              id: row.start_time_id,
              label: row.start_time_label ?? null,
              startTimeLocal: row.start_time_local ?? "",
              durationMinutes: row.duration_minutes ?? null,
            }
          : null,
      })),
      total: readCount(countResult[0]),
      limit: query.limit,
      offset: query.offset,
    }
  },
}
