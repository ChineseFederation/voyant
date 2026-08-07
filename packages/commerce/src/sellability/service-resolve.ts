// agent-quality: file-size exception -- owner: sellability; resolve remains a single pricing/sellability workflow after #1734 split the surrounding service operations.
import {
  channelInventoryAllotments,
  channelInventoryAllotmentTargets,
  channelInventoryReleaseRules,
  channels,
} from "@voyant-travel/distribution/schema"
import { RequestValidationError } from "@voyant-travel/hono"
import { classifyOccupancyPrice } from "@voyant-travel/products-contracts/occupancy-pricing"
import { and, desc, eq, inArray, type SQL, sql } from "drizzle-orm"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"
import {
  exchangeRates,
  fxRateSets,
  marketChannelRules,
  marketPriceCatalogs,
  marketProductRules,
  markets,
} from "../markets/schema.js"
import {
  departurePriceOverrides,
  optionPriceRules,
  optionStartTimeRules,
  optionUnitPriceRules,
  optionUnitTiers,
  pickupPriceRules,
  priceCatalogs,
  priceSchedules,
  pricingCategories,
} from "../pricing/schema.js"

import {
  applyAdjustment,
  chooseBestScheduledRule,
  chooseBestSpecificRule,
  computeUnitAmounts,
  type ResolvedPriceBreakdown,
  type ResolvedPriceComponent,
  type SellabilityResolveQuery,
  scheduleMatches,
  toNumeric,
} from "./service-shared.js"

type ResolveOptionRow = {
  productId: string
  productName: string
  productSellCurrency: string
  optionId: string
  optionName: string
  optionCode: string | null
  optionIsDefault: boolean
  optionAvailableFrom: string | null
  optionAvailableTo: string | null
}

type ResolveSlotRow = {
  id: string
  productId: string
  optionId: string | null
  startTimeId: string | null
  dateLocal: string
  startsAt: Date | string
  timezone: string
  unlimited: boolean
  remainingPax: number | null
  remainingPickups: number | null
  pastCutoff: boolean
  tooEarly: boolean
}

type ResolveUnitRow = {
  id: string
  name: string
  unitType: string
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

function normalizeDateOnly(value: Date | string | null | undefined): string | null {
  if (!value) return null
  return value instanceof Date ? value.toISOString().slice(0, 10) : value.slice(0, 10)
}

async function loadResolveOptions(
  db: PostgresJsDatabase,
  query: SellabilityResolveQuery,
): Promise<ResolveOptionRow[]> {
  const conditions = [sql`product.status::text = 'active'`, sql`option.status::text = 'active'`]
  if (query.productId) conditions.push(sql`product.id = ${query.productId}`)
  if (query.optionId) conditions.push(sql`option.id = ${query.optionId}`)

  const rows = await executeRows(
    db,
    // agent-quality: raw-sql reviewed -- owner: sellability; cross-module Product option read with parameter-bound filters.
    sql`
      SELECT
        product.id AS product_id,
        product.name AS product_name,
        product.sell_currency AS product_sell_currency,
        option.id AS option_id,
        option.name AS option_name,
        option.code AS option_code,
        option.is_default AS option_is_default,
        option.available_from AS option_available_from,
        option.available_to AS option_available_to
      FROM product_options option
      INNER JOIN products product
        ON option.product_id = product.id
      WHERE ${andSql(conditions)}
      ORDER BY product.name ASC, option.sort_order ASC
    `,
  )

  return rows.map((row) => {
    const value = row as {
      product_id: string
      product_name: string
      product_sell_currency: string
      option_id: string
      option_name: string
      option_code: string | null
      option_is_default: boolean
      option_available_from: Date | string | null
      option_available_to: Date | string | null
    }
    return {
      productId: value.product_id,
      productName: value.product_name,
      productSellCurrency: value.product_sell_currency,
      optionId: value.option_id,
      optionName: value.option_name,
      optionCode: value.option_code,
      optionIsDefault: value.option_is_default,
      optionAvailableFrom: normalizeDateOnly(value.option_available_from),
      optionAvailableTo: normalizeDateOnly(value.option_available_to),
    }
  })
}

async function loadResolveSlots(
  db: PostgresJsDatabase,
  optionIds: readonly string[],
  query: SellabilityResolveQuery,
): Promise<ResolveSlotRow[]> {
  if (optionIds.length === 0) return []

  const conditions = [
    sql`slot.option_id IN (${sqlList(optionIds)})`,
    sql`slot.status::text = 'open'`,
  ]
  if (query.slotId) conditions.push(sql`slot.id = ${query.slotId}`)
  if (query.dateLocal) conditions.push(sql`slot.date_local = ${query.dateLocal}`)
  if (query.startTimeId) conditions.push(sql`slot.start_time_id = ${query.startTimeId}`)

  const rows = await executeRows(
    db,
    // agent-quality: raw-sql reviewed -- owner: sellability; cross-module Availability slot read with parameter-bound filters.
    sql`
      SELECT
        slot.id,
        slot.product_id,
        slot.option_id,
        slot.start_time_id,
        slot.date_local,
        slot.starts_at,
        slot.timezone,
        slot.unlimited,
        slot.remaining_pax,
        slot.remaining_pickups,
        slot.past_cutoff,
        slot.too_early
      FROM availability_slots slot
      WHERE ${andSql(conditions)}
      ORDER BY slot.starts_at ASC
      LIMIT ${query.limit}
    `,
  )

  return rows.map((row) => {
    const value = row as {
      id: string
      product_id: string
      option_id: string | null
      start_time_id: string | null
      date_local: Date | string
      starts_at: Date | string
      timezone: string
      unlimited: boolean
      remaining_pax: number | null
      remaining_pickups: number | null
      past_cutoff: boolean
      too_early: boolean
    }
    return {
      id: value.id,
      productId: value.product_id,
      optionId: value.option_id,
      startTimeId: value.start_time_id,
      dateLocal: normalizeDateOnly(value.date_local) ?? "",
      startsAt: value.starts_at,
      timezone: value.timezone,
      unlimited: value.unlimited,
      remainingPax: value.remaining_pax,
      remainingPickups: value.remaining_pickups,
      pastCutoff: value.past_cutoff,
      tooEarly: value.too_early,
    }
  })
}

async function loadResolveUnits(db: PostgresJsDatabase): Promise<ResolveUnitRow[]> {
  const rows = await executeRows(
    db,
    // agent-quality: raw-sql reviewed -- owner: sellability; cross-module Product unit labels/types read for resolved price components.
    sql`SELECT id, name, unit_type::text AS unit_type FROM option_units`,
  )
  return rows.map((row) => {
    const value = row as { id: string; name: string; unit_type: string }
    return { id: value.id, name: value.name, unitType: value.unit_type }
  })
}

export async function resolve(db: PostgresJsDatabase, query: SellabilityResolveQuery) {
  const optionRows = await loadResolveOptions(db, query)

  if (optionRows.length === 0) {
    return { data: [], meta: { total: 0 } }
  }

  const optionIds = optionRows.map((row) => row.optionId)
  const productIds = [...new Set(optionRows.map((row) => row.productId))]

  const slots = await loadResolveSlots(db, optionIds, query)

  const startTimeIds = [
    ...new Set(slots.flatMap((slot) => (slot.startTimeId ? [slot.startTimeId] : []))),
  ]
  const slotIds = slots.map((slot) => slot.id)

  const [
    marketRow,
    channelRow,
    marketProductRuleRows,
    marketChannelRuleRows,
    marketCatalogRows,
    catalogRows,
    optionPriceRuleRows,
    optionScheduleRows,
    unitPriceRuleRows,
    unitTierRows,
    unitRows,
    pricingCategoryRows,
    startTimeRuleRows,
    pickupRuleRows,
    allotmentRows,
    allotmentTargetRows,
    releaseRuleRows,
    exchangeRateRow,
    departureOverrideRows,
  ] = await Promise.all([
    query.marketId
      ? db
          .select()
          .from(markets)
          .where(eq(markets.id, query.marketId))
          .limit(1)
          .then((rows) => rows[0] ?? null)
      : Promise.resolve(null),
    query.channelId
      ? db
          .select({ id: channels.id, kind: channels.kind })
          .from(channels)
          .where(eq(channels.id, query.channelId))
          .limit(1)
          .then((rows) => rows[0] ?? null)
      : Promise.resolve(null),
    query.marketId
      ? db
          .select()
          .from(marketProductRules)
          .where(
            and(
              eq(marketProductRules.marketId, query.marketId),
              eq(marketProductRules.active, true),
              inArray(marketProductRules.productId, productIds),
            ),
          )
      : Promise.resolve([]),
    query.marketId && query.channelId
      ? db
          .select()
          .from(marketChannelRules)
          .where(
            and(
              eq(marketChannelRules.marketId, query.marketId),
              eq(marketChannelRules.channelId, query.channelId),
              eq(marketChannelRules.active, true),
            ),
          )
      : Promise.resolve([]),
    query.marketId
      ? db
          .select({
            id: marketPriceCatalogs.id,
            marketId: marketPriceCatalogs.marketId,
            priceCatalogId: marketPriceCatalogs.priceCatalogId,
            isDefault: marketPriceCatalogs.isDefault,
            priority: marketPriceCatalogs.priority,
            active: marketPriceCatalogs.active,
          })
          .from(marketPriceCatalogs)
          .where(
            and(
              eq(marketPriceCatalogs.marketId, query.marketId),
              eq(marketPriceCatalogs.active, true),
            ),
          )
      : Promise.resolve([]),
    db
      .select({ id: priceCatalogs.id, currencyCode: priceCatalogs.currencyCode })
      .from(priceCatalogs),
    db
      .select()
      .from(optionPriceRules)
      .where(and(inArray(optionPriceRules.optionId, optionIds), eq(optionPriceRules.active, true))),
    db.select().from(priceSchedules),
    db
      .select()
      .from(optionUnitPriceRules)
      .where(
        and(
          inArray(optionUnitPriceRules.optionId, optionIds),
          eq(optionUnitPriceRules.active, true),
        ),
      ),
    db.select().from(optionUnitTiers).where(eq(optionUnitTiers.active, true)),
    loadResolveUnits(db),
    db
      .select({ id: pricingCategories.id, name: pricingCategories.name })
      .from(pricingCategories)
      .where(eq(pricingCategories.active, true)),
    startTimeIds.length
      ? db
          .select()
          .from(optionStartTimeRules)
          .where(
            and(
              inArray(optionStartTimeRules.optionId, optionIds),
              inArray(optionStartTimeRules.startTimeId, startTimeIds),
              eq(optionStartTimeRules.active, true),
            ),
          )
      : Promise.resolve([]),
    query.pickupPointId
      ? db
          .select()
          .from(pickupPriceRules)
          .where(
            and(
              inArray(pickupPriceRules.optionId, optionIds),
              eq(pickupPriceRules.pickupPointId, query.pickupPointId),
              eq(pickupPriceRules.active, true),
            ),
          )
      : Promise.resolve([]),
    query.channelId
      ? db
          .select()
          .from(channelInventoryAllotments)
          .where(
            and(
              eq(channelInventoryAllotments.channelId, query.channelId),
              eq(channelInventoryAllotments.active, true),
              inArray(channelInventoryAllotments.productId, productIds),
            ),
          )
      : Promise.resolve([]),
    query.channelId && slotIds.length
      ? db
          .select()
          .from(channelInventoryAllotmentTargets)
          .where(
            and(
              inArray(channelInventoryAllotmentTargets.slotId, slotIds),
              eq(channelInventoryAllotmentTargets.active, true),
            ),
          )
      : Promise.resolve([]),
    query.channelId ? db.select().from(channelInventoryReleaseRules) : Promise.resolve([]),
    query.currencyCode
      ? db
          .select({
            rateDecimal: exchangeRates.rateDecimal,
            baseCurrency: exchangeRates.baseCurrency,
            quoteCurrency: exchangeRates.quoteCurrency,
            fxRateSetId: exchangeRates.fxRateSetId,
            effectiveAt: fxRateSets.effectiveAt,
          })
          .from(exchangeRates)
          .innerJoin(fxRateSets, eq(exchangeRates.fxRateSetId, fxRateSets.id))
          .where(eq(exchangeRates.quoteCurrency, query.currencyCode))
          .orderBy(desc(fxRateSets.effectiveAt))
      : Promise.resolve([]),
    slotIds.length
      ? db
          .select({
            departureId: departurePriceOverrides.departureId,
            priceCatalogId: departurePriceOverrides.priceCatalogId,
            optionUnitId: departurePriceOverrides.optionUnitId,
            sellAmountCents: departurePriceOverrides.sellAmountCents,
            costAmountCents: departurePriceOverrides.costAmountCents,
          })
          .from(departurePriceOverrides)
          .where(
            and(
              inArray(departurePriceOverrides.departureId, slotIds),
              eq(departurePriceOverrides.active, true),
            ),
          )
      : Promise.resolve([]),
  ])

  const optionMap = new Map(optionRows.map((row) => [row.optionId, row]))
  const scheduleMap = new Map(optionScheduleRows.map((row) => [row.id, row]))
  const marketCatalogMap = new Map(marketCatalogRows.map((row) => [row.id, row]))
  const catalogMap = new Map(catalogRows.map((row) => [row.id, row]))
  const unitMap = new Map(unitRows.map((row) => [row.id, row]))
  const pricingCategoryMap = new Map(pricingCategoryRows.map((row) => [row.id, row]))
  const departureOverrideMap = new Map(
    departureOverrideRows.map((row) => [
      `${row.departureId}:${row.priceCatalogId}:${row.optionUnitId}`,
      row,
    ]),
  )

  const candidates = []

  for (const slot of slots) {
    if (!slot.optionId) continue
    const option = optionMap.get(slot.optionId)
    if (!option) continue

    if (option.optionAvailableFrom && slot.dateLocal < option.optionAvailableFrom) continue
    if (option.optionAvailableTo && slot.dateLocal > option.optionAvailableTo) continue
    if (slot.pastCutoff || slot.tooEarly) continue
    if (!slot.unlimited && (slot.remainingPax ?? 0) <= 0) continue

    const marketRule = query.marketId
      ? chooseBestSpecificRule(
          marketProductRuleRows.filter((row) => {
            if (row.productId !== option.productId) return false
            if (row.optionId && row.optionId !== option.optionId) return false
            if (query.dateLocal && row.availableFrom && query.dateLocal < row.availableFrom)
              return false
            if (query.dateLocal && row.availableTo && query.dateLocal > row.availableTo)
              return false
            return true
          }),
        )
      : null

    if (marketRule?.sellability === "unavailable") continue

    const channelRule =
      query.marketId && query.channelId
        ? [...marketChannelRuleRows]
            .sort((a, b) => b.priority - a.priority)
            .find((row) => row.sellability !== "unavailable")
        : null

    if (query.marketId && query.channelId && !channelRule && marketChannelRuleRows.length > 0) {
      continue
    }

    const catalogSelection =
      (channelRule?.priceCatalogId ? marketCatalogMap.get(channelRule.priceCatalogId) : null) ??
      (marketRule?.priceCatalogId ? marketCatalogMap.get(marketRule.priceCatalogId) : null) ??
      [...marketCatalogRows].sort((a, b) => {
        const scoreA = Number(a.isDefault) * 10 - a.priority
        const scoreB = Number(b.isDefault) * 10 - b.priority
        return scoreB - scoreA
      })[0] ??
      null

    const applicableRules = optionPriceRuleRows.filter((row) => {
      if (row.optionId !== option.optionId || row.productId !== option.productId) return false
      if (catalogSelection && row.priceCatalogId !== catalogSelection.priceCatalogId) return false
      const schedule = row.priceScheduleId ? scheduleMap.get(row.priceScheduleId) : null
      return scheduleMatches(
        {
          validFrom: schedule?.validFrom ?? null,
          validTo: schedule?.validTo ?? null,
          weekdays: (schedule?.weekdays as string[] | null | undefined) ?? null,
        },
        slot.dateLocal,
      )
    })

    const chosenRule = chooseBestScheduledRule(applicableRules)
    if (!chosenRule) continue

    const applicableStartRule = slot.startTimeId
      ? (startTimeRuleRows.find(
          (row) => row.optionPriceRuleId === chosenRule.id && row.startTimeId === slot.startTimeId,
        ) ?? null)
      : null

    if (applicableStartRule?.ruleMode === "excluded") continue

    const ruleUnitRows = unitPriceRuleRows.filter((row) => row.optionPriceRuleId === chosenRule.id)
    const ruleTierRows = unitTierRows.filter((row) =>
      ruleUnitRows.some((unitRule) => unitRule.id === row.optionUnitPriceRuleId),
    )

    const requestedUnits = query.requestedUnits.length > 0 ? query.requestedUnits : []
    const breakdown: ResolvedPriceBreakdown[] = []
    const components: ResolvedPriceComponent[] = []
    let sellAmountCents = 0
    let costAmountCents = 0
    let onRequest = chosenRule.pricingMode === "on_request"
    let resolvedOccupancyBasis: "supplement" | "all_in" | null = null

    for (const request of requestedUnits) {
      const candidateUnitRules = ruleUnitRows.filter((row) => {
        if (request.unitId && row.unitId !== request.unitId) return false
        if (
          request.pricingCategoryId &&
          row.pricingCategoryId &&
          row.pricingCategoryId !== request.pricingCategoryId
        )
          return false
        if (row.minQuantity && request.quantity < row.minQuantity) return false
        if (row.maxQuantity && request.quantity > row.maxQuantity) return false
        return true
      })
      const unitRule =
        [...candidateUnitRules].sort((a, b) => {
          const scoreA =
            Number(Boolean(request.unitId && a.unitId === request.unitId)) * 10 +
            Number(
              Boolean(
                request.pricingCategoryId && a.pricingCategoryId === request.pricingCategoryId,
              ),
            )
          const scoreB =
            Number(Boolean(request.unitId && b.unitId === request.unitId)) * 10 +
            Number(
              Boolean(
                request.pricingCategoryId && b.pricingCategoryId === request.pricingCategoryId,
              ),
            )
          return scoreB - scoreA
        })[0] ?? null

      const tier = unitRule
        ? ([...ruleTierRows]
            .filter(
              (row) =>
                row.optionUnitPriceRuleId === unitRule.id &&
                row.active &&
                request.quantity >= row.minQuantity &&
                (row.maxQuantity === null || request.quantity <= row.maxQuantity),
            )
            .sort((a, b) => a.sortOrder - b.sortOrder)[0] ?? null)
        : null

      if (unitRule?.pricingMode === "on_request") onRequest = true
      const overrideUnitId = request.unitId ?? unitRule?.unitId ?? null
      const override =
        overrideUnitId == null
          ? null
          : (departureOverrideMap.get(
              `${slot.id}:${chosenRule.priceCatalogId}:${overrideUnitId}`,
            ) ?? null)
      const item = computeUnitAmounts(
        request,
        {
          unitName: request.unitId ? (unitMap.get(request.unitId)?.name ?? null) : null,
          unitType: request.unitId ? (unitMap.get(request.unitId)?.unitType ?? null) : null,
          pricingCategoryName: request.pricingCategoryId
            ? (pricingCategoryMap.get(request.pricingCategoryId)?.name ?? null)
            : null,
        },
        unitRule,
        tier,
        override,
      )
      if (item.unitType === "room") {
        const occupancyPrice = classifyOccupancyPrice({
          occupancyPriceBasis: chosenRule.occupancyPriceBasis,
          travelerBaseFareAmountCents: chosenRule.baseSellAmountCents ?? 0,
          occupancyAmountCents: item.sellAmountCents,
        })
        if (occupancyPrice.status === "ambiguous") {
          throw new RequestValidationError(occupancyPrice.diagnostic, {
            optionPriceRuleId: chosenRule.id,
            optionUnitPriceRuleId: unitRule?.id ?? null,
            unitId: item.unitId,
            semanticsVersion: occupancyPrice.semanticsVersion,
          })
        }
        resolvedOccupancyBasis = occupancyPrice.occupancyPriceBasis
      }
      breakdown.push(item)
      components.push({
        kind: "unit",
        title:
          [option.optionName, item.unitName, item.pricingCategoryName]
            .filter(Boolean)
            .join(" · ") || option.optionName,
        quantity: item.quantity,
        pricingMode: item.pricingMode,
        sellAmountCents: item.sellAmountCents,
        costAmountCents: item.costAmountCents,
        unitId: item.unitId,
        unitName: item.unitName,
        unitType: item.unitType,
        pricingCategoryId: item.pricingCategoryId,
        pricingCategoryName: item.pricingCategoryName,
        requestRef: item.requestRef,
        sourceRuleId: item.sourceRuleId,
        tierId: item.tierId,
      })
      sellAmountCents += item.sellAmountCents
      costAmountCents += item.costAmountCents
    }

    const travelerCount =
      query.travelerCount ??
      Math.max(
        1,
        requestedUnits.reduce((sum, unit) => sum + unit.quantity, 0),
      )
    const baseMultiplier = chosenRule.pricingMode === "per_person" ? travelerCount : 1
    const baseSellAmountCents =
      resolvedOccupancyBasis === "all_in"
        ? 0
        : (chosenRule.baseSellAmountCents ?? 0) * baseMultiplier
    const baseCostAmountCents =
      resolvedOccupancyBasis === "all_in"
        ? 0
        : (chosenRule.baseCostAmountCents ?? 0) * baseMultiplier
    sellAmountCents += baseSellAmountCents
    costAmountCents += baseCostAmountCents
    if (baseSellAmountCents !== 0 || baseCostAmountCents !== 0) {
      components.unshift({
        kind: "base",
        title: option.optionName,
        quantity: baseMultiplier,
        pricingMode: chosenRule.pricingMode,
        sellAmountCents: baseSellAmountCents,
        costAmountCents: baseCostAmountCents,
        unitId: null,
        unitName: null,
        unitType: null,
        pricingCategoryId: null,
        pricingCategoryName: null,
        requestRef: null,
        sourceRuleId: chosenRule.id,
        tierId: null,
      })
    }

    if (query.pickupPointId) {
      const pickupRule =
        pickupRuleRows.find(
          (row) =>
            row.optionPriceRuleId === chosenRule.id && row.pickupPointId === query.pickupPointId,
        ) ?? null
      if (pickupRule) {
        const quantity = Math.max(
          1,
          query.requestedUnits.reduce((sum, unit) => sum + unit.quantity, 0),
        )
        const pickupSellAmountCents =
          pickupRule.pricingMode === "per_person"
            ? (pickupRule.sellAmountCents ?? 0) * quantity
            : (pickupRule.sellAmountCents ?? 0)
        const pickupCostAmountCents =
          pickupRule.pricingMode === "per_person"
            ? (pickupRule.costAmountCents ?? 0) * quantity
            : (pickupRule.costAmountCents ?? 0)
        if (pickupRule.pricingMode === "on_request") onRequest = true
        components.push({
          kind: "pickup",
          title: "Pickup",
          quantity: pickupRule.pricingMode === "per_person" ? quantity : 1,
          pricingMode: pickupRule.pricingMode,
          sellAmountCents: pickupSellAmountCents,
          costAmountCents: pickupCostAmountCents,
          unitId: null,
          unitName: null,
          unitType: null,
          pricingCategoryId: null,
          pricingCategoryName: null,
          requestRef: null,
          sourceRuleId: pickupRule.id,
          tierId: null,
        })
        if (pickupRule.pricingMode === "per_booking") {
          sellAmountCents += pickupRule.sellAmountCents ?? 0
          costAmountCents += pickupRule.costAmountCents ?? 0
        } else if (pickupRule.pricingMode === "per_person") {
          sellAmountCents += (pickupRule.sellAmountCents ?? 0) * quantity
          costAmountCents += (pickupRule.costAmountCents ?? 0) * quantity
        }
      }
    }

    const preAdjustmentTotal = { sellAmountCents, costAmountCents }
    const adjusted = applicableStartRule
      ? applyAdjustment(preAdjustmentTotal, {
          adjustmentType: applicableStartRule.adjustmentType,
          sellAdjustmentCents: applicableStartRule.sellAdjustmentCents,
          costAdjustmentCents: applicableStartRule.costAdjustmentCents,
          adjustmentBasisPoints: applicableStartRule.adjustmentBasisPoints,
        })
      : { sellAmountCents, costAmountCents }

    sellAmountCents = adjusted.sellAmountCents
    costAmountCents = adjusted.costAmountCents

    const startTimeAdjustmentSellAmountCents =
      adjusted.sellAmountCents - preAdjustmentTotal.sellAmountCents
    const startTimeAdjustmentCostAmountCents =
      adjusted.costAmountCents - preAdjustmentTotal.costAmountCents

    if (
      applicableStartRule &&
      (startTimeAdjustmentSellAmountCents !== 0 || startTimeAdjustmentCostAmountCents !== 0)
    ) {
      components.push({
        kind: "start_time_adjustment",
        title: "Start time adjustment",
        quantity: 1,
        pricingMode: applicableStartRule.adjustmentType ?? "fixed",
        sellAmountCents: startTimeAdjustmentSellAmountCents,
        costAmountCents: startTimeAdjustmentCostAmountCents,
        unitId: null,
        unitName: null,
        unitType: null,
        pricingCategoryId: null,
        pricingCategoryName: null,
        requestRef: null,
        sourceRuleId: applicableStartRule.id,
        tierId: null,
      })
    }

    const relevantAllotments = allotmentRows.filter((row) => {
      if (row.productId !== option.productId) return false
      if (row.optionId && row.optionId !== option.optionId) return false
      if (row.startTimeId && row.startTimeId !== slot.startTimeId) return false
      if (slot.dateLocal && row.validFrom && slot.dateLocal < row.validFrom) return false
      if (slot.dateLocal && row.validTo && slot.dateLocal > row.validTo) return false
      return true
    })

    const relevantTargets = allotmentTargetRows.filter(
      (row) =>
        relevantAllotments.some((allotment) => allotment.id === row.allotmentId) &&
        (row.slotId === slot.id || (!row.slotId && row.startTimeId === slot.startTimeId)),
    )

    let allotmentStatus: "not_applicable" | "sellable" | "sold_out" = "not_applicable"
    let releaseRuleId: string | null = null
    if (relevantAllotments.length > 0) {
      const remaining = relevantTargets.reduce(
        (sum, row) => sum + Math.max(0, row.remainingCapacity ?? 0),
        0,
      )
      allotmentStatus = remaining > 0 ? "sellable" : "sold_out"
      const firstReleaseRule = releaseRuleRows.find((row) =>
        relevantAllotments.some((allotment) => allotment.id === row.allotmentId),
      )
      releaseRuleId = firstReleaseRule?.id ?? null
      if (allotmentStatus === "sold_out") continue
    }

    let displayCurrency =
      (catalogSelection ? catalogMap.get(catalogSelection.priceCatalogId)?.currencyCode : null) ??
      option.productSellCurrency

    let convertedSellAmountCents = sellAmountCents
    let convertedCostAmountCents = costAmountCents
    let fx = null as {
      fxRateSetId: string
      baseCurrency: string
      quoteCurrency: string
      rateDecimal: number
    } | null

    if (query.currencyCode && query.currencyCode !== displayCurrency) {
      const fxRate = exchangeRateRow.find(
        (row) => row.baseCurrency === displayCurrency && row.quoteCurrency === query.currencyCode,
      )
      if (fxRate) {
        const rate = toNumeric(fxRate.rateDecimal) ?? 1
        convertedSellAmountCents = Math.round(sellAmountCents * rate)
        convertedCostAmountCents = Math.round(costAmountCents * rate)
        fx = {
          fxRateSetId: fxRate.fxRateSetId,
          baseCurrency: displayCurrency,
          quoteCurrency: query.currencyCode,
          rateDecimal: rate,
        }
        displayCurrency = query.currencyCode
      }
    }

    candidates.push({
      product: {
        id: option.productId,
        name: option.productName,
      },
      option: {
        id: option.optionId,
        name: option.optionName,
        code: option.optionCode,
      },
      slot,
      market: marketRow
        ? {
            id: marketRow.id,
            code: marketRow.code,
            name: marketRow.name,
          }
        : null,
      channel: channelRow,
      sellability: {
        mode: marketRule?.sellability ?? channelRule?.sellability ?? "sellable",
        onRequest,
        allotmentStatus,
      },
      pricing: {
        currencyCode: displayCurrency,
        sellAmountCents: convertedSellAmountCents,
        costAmountCents: convertedCostAmountCents,
        marginAmountCents: convertedSellAmountCents - convertedCostAmountCents,
        breakdown,
        components,
        fx,
      },
      sources: {
        marketProductRuleId: marketRule?.id ?? null,
        marketChannelRuleId: channelRule?.id ?? null,
        marketPriceCatalogId: catalogSelection?.id ?? null,
        optionPriceRuleId: chosenRule.id,
        optionStartTimeRuleId: applicableStartRule?.id ?? null,
        channelInventoryAllotmentIds: relevantAllotments.map((row) => row.id),
        channelInventoryReleaseRuleId: releaseRuleId,
      },
    })
  }

  return {
    data: candidates,
    meta: {
      total: candidates.length,
    },
  }
}
