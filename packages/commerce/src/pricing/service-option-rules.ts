import type { EventBus } from "@voyant-travel/core"
import { RequestValidationError } from "@voyant-travel/hono"
import {
  AMBIGUOUS_OCCUPANCY_PRICE_DIAGNOSTIC,
  classifyOccupancyPrice,
  type OccupancyPriceBasis,
} from "@voyant-travel/products-contracts/occupancy-pricing"
import { and, asc, desc, eq, isNull, ne, type SQL, sql } from "drizzle-orm"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"

import {
  PRICING_RULE_CHANGED_EVENT,
  type PricingRuleChangedEvent,
  type PricingRuleChangeSource,
} from "./events.js"
import {
  optionPriceRules,
  optionStartTimeRules,
  optionUnitPriceRules,
  optionUnitTiers,
} from "./schema.js"

/**
 * Optional runtime context for pricing-rule mutations. When `eventBus`
 * is wired the service emits `pricing.rule.changed` after a successful
 * mutation so the catalog bridge can reindex the affected product.
 *
 * Keeping it optional preserves back-compat with existing callers that
 * don't care about the catalog plane (e.g. data-import scripts).
 */
export interface RuleMutationRuntime {
  eventBus?: EventBus
  source?: PricingRuleChangeSource
}

async function emitRuleChanged(
  eventBus: EventBus | undefined,
  payload: PricingRuleChangedEvent,
): Promise<void> {
  if (!eventBus) return
  await eventBus.emit(PRICING_RULE_CHANGED_EVENT, payload, {
    category: "domain",
    source: "service",
  })
}

// A `per_booking` rule produces a single flat amount for the whole booking;
// per-unit prices implicitly assume a per-unit (or per-person) multiplier.
// The two are contradictory — see #482.
const PER_BOOKING_REJECTS_UNIT_PRICES_MESSAGE =
  "Rules with pricingMode = 'per_booking' cannot carry per-unit prices. " +
  "Use pricingMode = 'per_person' or 'starting_from' for unit-priced rules, " +
  "or remove the unit prices to keep this rule a flat per-booking amount."

async function executeRows(db: PostgresJsDatabase, query: SQL): Promise<unknown[]> {
  // biome-ignore lint/suspicious/noExplicitAny: pricing authoring checks read Product unit facts across the schema boundary.
  const result = await (db as any).execute(query)
  return Array.isArray(result) ? result : (result?.rows ?? [])
}

async function assertOccupancyPriceIsUnambiguous(
  db: PostgresJsDatabase,
  input: {
    optionPriceRuleId: string
    unitId: string
    occupancyAmountCents: number
  },
): Promise<void> {
  const [parent] = await db
    .select({
      occupancyPriceBasis: optionPriceRules.occupancyPriceBasis,
      baseSellAmountCents: optionPriceRules.baseSellAmountCents,
    })
    .from(optionPriceRules)
    .where(eq(optionPriceRules.id, input.optionPriceRuleId))
    .limit(1)
  if (!parent) return

  const [unit] = await executeRows(
    db,
    // agent-quality: raw-sql reviewed -- owner: pricing; reads the Product-owned unit type required to apply occupancy semantics.
    sql`SELECT unit_type::text AS "unitType" FROM option_units WHERE id = ${input.unitId} LIMIT 1`,
  )
  if ((unit as { unitType?: string } | undefined)?.unitType !== "room") return

  const classification = classifyOccupancyPrice({
    occupancyPriceBasis: parent.occupancyPriceBasis,
    travelerBaseFareAmountCents: parent.baseSellAmountCents ?? 0,
    occupancyAmountCents: input.occupancyAmountCents,
  })
  if (classification.status === "ambiguous") {
    throw new RequestValidationError(classification.diagnostic, {
      optionPriceRuleId: input.optionPriceRuleId,
      unitId: input.unitId,
      semanticsVersion: classification.semanticsVersion,
    })
  }
}

async function assertParentOccupancyPriceIsUnambiguous(
  db: PostgresJsDatabase,
  input: {
    optionPriceRuleId: string
    occupancyPriceBasis: OccupancyPriceBasis | null
    baseSellAmountCents: number
  },
): Promise<void> {
  if (input.occupancyPriceBasis !== null || input.baseSellAmountCents <= 0) return

  const [row] = await executeRows(
    db,
    // agent-quality: raw-sql reviewed -- owner: pricing; detects positive Product room prices before an ambiguous parent rule is saved.
    sql`
      SELECT EXISTS (
        SELECT 1
        FROM option_unit_price_rules unit_rule
        INNER JOIN option_units unit ON unit.id = unit_rule.unit_id
        LEFT JOIN option_unit_tiers tier
          ON tier.option_unit_price_rule_id = unit_rule.id AND tier.active = true
        WHERE unit_rule.option_price_rule_id = ${input.optionPriceRuleId}
          AND unit.unit_type::text = 'room'
          AND (
            coalesce(unit_rule.sell_amount_cents, 0) > 0
            OR coalesce(tier.sell_amount_cents, 0) > 0
          )
      ) AS ambiguous
    `,
  )
  if ((row as { ambiguous?: boolean } | undefined)?.ambiguous) {
    throw new RequestValidationError(AMBIGUOUS_OCCUPANCY_PRICE_DIAGNOSTIC, {
      optionPriceRuleId: input.optionPriceRuleId,
      semanticsVersion: 1,
    })
  }
}

import type {
  CreateOptionPriceRuleInput,
  CreateOptionStartTimeRuleInput,
  CreateOptionUnitPriceRuleInput,
  CreateOptionUnitTierInput,
  OptionPriceRuleListQuery,
  OptionStartTimeRuleListQuery,
  OptionUnitPriceRuleListQuery,
  OptionUnitTierListQuery,
  UpdateOptionPriceRuleInput,
  UpdateOptionStartTimeRuleInput,
  UpdateOptionUnitPriceRuleInput,
  UpdateOptionUnitTierInput,
} from "./service-shared.js"
import { assertPricingValidation, paginate } from "./service-shared.js"
import { validateMergedOptionPriceRule, validateMergedOptionUnitPriceRule } from "./validation.js"

export async function listOptionPriceRules(
  db: PostgresJsDatabase,
  query: OptionPriceRuleListQuery,
) {
  const conditions = []
  if (query.productId) conditions.push(eq(optionPriceRules.productId, query.productId))
  if (query.optionId) conditions.push(eq(optionPriceRules.optionId, query.optionId))
  if (query.priceCatalogId)
    conditions.push(eq(optionPriceRules.priceCatalogId, query.priceCatalogId))
  if (query.priceScheduleId)
    conditions.push(eq(optionPriceRules.priceScheduleId, query.priceScheduleId))
  if (query.cancellationPolicyId) {
    conditions.push(eq(optionPriceRules.cancellationPolicyId, query.cancellationPolicyId))
  }
  if (query.pricingMode) conditions.push(eq(optionPriceRules.pricingMode, query.pricingMode))
  if (query.active !== undefined) conditions.push(eq(optionPriceRules.active, query.active))
  const where = conditions.length ? and(...conditions) : undefined

  return paginate(
    db
      .select()
      .from(optionPriceRules)
      .where(where)
      .limit(query.limit)
      .offset(query.offset)
      .orderBy(desc(optionPriceRules.updatedAt)),
    db.select({ count: sql<number>`count(*)::int` }).from(optionPriceRules).where(where),
    query.limit,
    query.offset,
  )
}

export async function getOptionPriceRuleById(db: PostgresJsDatabase, id: string) {
  const [row] = await db.select().from(optionPriceRules).where(eq(optionPriceRules.id, id)).limit(1)
  return row ?? null
}

/**
 * Demote any *other* default rate plan in the same (option, catalog, schedule)
 * scope so at most one `is_default = true` plan survives per scope. Without
 * this, a save path that inserts (rather than upserts) the default plan can
 * fan out several active `is_default` rows — and the public departures reader
 * may then surface an empty duplicate instead of the priced plan, rendering a
 * bookable departure as "price on request" (#1601). Latest write wins.
 *
 * The schedule is part of the scope on purpose: the date resolver treats a
 * `priceScheduleId = null` default as the *out-of-season fallback* and each
 * scheduled default as a separate seasonal default (see `pickRulesForDate`).
 * Demoting across schedules would let a seasonal save clear the fallback
 * default, leaving dates outside that schedule with no priced rule.
 */
async function demoteOtherDefaultRules(
  tx: PostgresJsDatabase,
  scope: {
    optionId: string
    priceCatalogId: string
    priceScheduleId: string | null
    keepRuleId: string
  },
): Promise<void> {
  await tx
    .update(optionPriceRules)
    .set({ isDefault: false, updatedAt: new Date() })
    .where(
      and(
        eq(optionPriceRules.optionId, scope.optionId),
        eq(optionPriceRules.priceCatalogId, scope.priceCatalogId),
        scope.priceScheduleId === null
          ? isNull(optionPriceRules.priceScheduleId)
          : eq(optionPriceRules.priceScheduleId, scope.priceScheduleId),
        eq(optionPriceRules.isDefault, true),
        ne(optionPriceRules.id, scope.keepRuleId),
      ),
    )
}

export async function createOptionPriceRule(
  db: PostgresJsDatabase,
  data: CreateOptionPriceRuleInput,
  runtime: RuleMutationRuntime = {},
) {
  assertPricingValidation(validateMergedOptionPriceRule(data), "Invalid option price rule")

  const row = await db.transaction(async (tx) => {
    const [inserted] = await tx.insert(optionPriceRules).values(data).returning()
    if (!inserted) return null
    if (inserted.isDefault && inserted.active) {
      await demoteOtherDefaultRules(tx, {
        optionId: inserted.optionId,
        priceCatalogId: inserted.priceCatalogId,
        priceScheduleId: inserted.priceScheduleId,
        keepRuleId: inserted.id,
      })
    }
    return inserted
  })
  if (!row) return null
  await emitRuleChanged(runtime.eventBus, {
    productId: row.productId,
    ruleId: row.id,
    kind: "option-rule",
    source: runtime.source ?? "created",
  })
  return row
}

export async function updateOptionPriceRule(
  db: PostgresJsDatabase,
  id: string,
  data: UpdateOptionPriceRuleInput,
  runtime: RuleMutationRuntime = {},
) {
  if (data.pricingMode === "per_booking") {
    const [countRow] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(optionUnitPriceRules)
      .where(eq(optionUnitPriceRules.optionPriceRuleId, id))
    const unitPriceCount = countRow?.count ?? 0
    if (unitPriceCount > 0) {
      throw new RequestValidationError(PER_BOOKING_REJECTS_UNIT_PRICES_MESSAGE, {
        ruleId: id,
        unitPriceCount,
      })
    }
  }

  const result = await db.transaction(async (tx) => {
    // Snapshot the pre-update productId so reassignment (rule moves
    // between products) reindexes the *previous* product too. Without
    // this, the projection on the old product keeps a stale MIN that
    // includes a rule it no longer owns.
    const [pre] = await tx
      .select({
        productId: optionPriceRules.productId,
        minPerBooking: optionPriceRules.minPerBooking,
        maxPerBooking: optionPriceRules.maxPerBooking,
        occupancyPriceBasis: optionPriceRules.occupancyPriceBasis,
        baseSellAmountCents: optionPriceRules.baseSellAmountCents,
      })
      .from(optionPriceRules)
      .where(eq(optionPriceRules.id, id))
      .limit(1)

    if (!pre) return null

    await assertParentOccupancyPriceIsUnambiguous(tx, {
      optionPriceRuleId: id,
      occupancyPriceBasis:
        "occupancyPriceBasis" in data
          ? (data.occupancyPriceBasis ?? null)
          : pre.occupancyPriceBasis,
      baseSellAmountCents:
        "baseSellAmountCents" in data
          ? (data.baseSellAmountCents ?? 0)
          : (pre.baseSellAmountCents ?? 0),
    })

    assertPricingValidation(
      validateMergedOptionPriceRule({
        minPerBooking: "minPerBooking" in data ? data.minPerBooking : pre.minPerBooking,
        maxPerBooking: "maxPerBooking" in data ? data.maxPerBooking : pre.maxPerBooking,
      }),
      "Invalid option price rule",
    )

    const [updated] = await tx
      .update(optionPriceRules)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(optionPriceRules.id, id))
      .returning()
    if (!updated) return null

    // Promoting this plan to the active default demotes any sibling default
    // in the same (option, catalog) scope, so only one survives (#1601).
    if (updated.isDefault && updated.active) {
      await demoteOtherDefaultRules(tx, {
        optionId: updated.optionId,
        priceCatalogId: updated.priceCatalogId,
        priceScheduleId: updated.priceScheduleId,
        keepRuleId: updated.id,
      })
    }
    return { pre, row: updated }
  })
  if (!result) return null
  const { pre, row } = result

  await emitRuleChanged(runtime.eventBus, {
    productId: row.productId,
    ruleId: row.id,
    kind: "option-rule",
    source: runtime.source ?? "updated",
  })
  if (pre && pre.productId !== row.productId) {
    await emitRuleChanged(runtime.eventBus, {
      productId: pre.productId,
      ruleId: row.id,
      kind: "option-rule",
      source: runtime.source ?? "updated",
    })
  }
  return row
}

export async function deleteOptionPriceRule(
  db: PostgresJsDatabase,
  id: string,
  runtime: RuleMutationRuntime = {},
) {
  // Snapshot before deletion so the event payload carries productId —
  // can't read it back from the deleted row.
  const [snapshot] = await db
    .select({ productId: optionPriceRules.productId })
    .from(optionPriceRules)
    .where(eq(optionPriceRules.id, id))
    .limit(1)

  const [row] = await db
    .delete(optionPriceRules)
    .where(eq(optionPriceRules.id, id))
    .returning({ id: optionPriceRules.id })
  if (!row) return null

  if (snapshot) {
    await emitRuleChanged(runtime.eventBus, {
      productId: snapshot.productId,
      ruleId: row.id,
      kind: "option-rule",
      source: runtime.source ?? "deleted",
    })
  }
  return row
}

export async function listOptionUnitPriceRules(
  db: PostgresJsDatabase,
  query: OptionUnitPriceRuleListQuery,
) {
  const conditions = []
  if (query.optionPriceRuleId) {
    conditions.push(eq(optionUnitPriceRules.optionPriceRuleId, query.optionPriceRuleId))
  }
  if (query.optionId) conditions.push(eq(optionUnitPriceRules.optionId, query.optionId))
  if (query.unitId) conditions.push(eq(optionUnitPriceRules.unitId, query.unitId))
  if (query.pricingCategoryId) {
    conditions.push(eq(optionUnitPriceRules.pricingCategoryId, query.pricingCategoryId))
  }
  if (query.active !== undefined) conditions.push(eq(optionUnitPriceRules.active, query.active))
  const where = conditions.length ? and(...conditions) : undefined

  return paginate(
    db
      .select()
      .from(optionUnitPriceRules)
      .where(where)
      .limit(query.limit)
      .offset(query.offset)
      .orderBy(asc(optionUnitPriceRules.sortOrder), asc(optionUnitPriceRules.createdAt)),
    db.select({ count: sql<number>`count(*)::int` }).from(optionUnitPriceRules).where(where),
    query.limit,
    query.offset,
  )
}

export async function getOptionUnitPriceRuleById(db: PostgresJsDatabase, id: string) {
  const [row] = await db
    .select()
    .from(optionUnitPriceRules)
    .where(eq(optionUnitPriceRules.id, id))
    .limit(1)
  return row ?? null
}

/**
 * Look up the productId on an option-unit-rule's parent rule. Used by
 * the mutation paths to populate the `pricing.rule.changed` payload —
 * unit rules don't carry productId directly, so we walk through their
 * parent every time. One small extra query per mutation; pricing
 * mutations aren't on a hot path so the cost is negligible.
 */
async function getProductIdForUnitRule(
  db: PostgresJsDatabase,
  unitRuleId: string,
): Promise<string | null> {
  const [row] = await db
    .select({ productId: optionPriceRules.productId })
    .from(optionUnitPriceRules)
    .innerJoin(optionPriceRules, eq(optionPriceRules.id, optionUnitPriceRules.optionPriceRuleId))
    .where(eq(optionUnitPriceRules.id, unitRuleId))
    .limit(1)
  return row?.productId ?? null
}

export async function createOptionUnitPriceRule(
  db: PostgresJsDatabase,
  data: CreateOptionUnitPriceRuleInput,
  runtime: RuleMutationRuntime = {},
) {
  assertPricingValidation(validateMergedOptionUnitPriceRule(data), "Invalid option unit price rule")

  const [parent] = await db
    .select({ pricingMode: optionPriceRules.pricingMode, productId: optionPriceRules.productId })
    .from(optionPriceRules)
    .where(eq(optionPriceRules.id, data.optionPriceRuleId))
    .limit(1)
  if (parent?.pricingMode === "per_booking") {
    throw new RequestValidationError(PER_BOOKING_REJECTS_UNIT_PRICES_MESSAGE, {
      ruleId: data.optionPriceRuleId,
    })
  }

  await assertOccupancyPriceIsUnambiguous(db, {
    optionPriceRuleId: data.optionPriceRuleId,
    unitId: data.unitId,
    occupancyAmountCents: data.sellAmountCents ?? 0,
  })

  const [row] = await db.insert(optionUnitPriceRules).values(data).returning()
  if (!row) return null
  if (parent) {
    await emitRuleChanged(runtime.eventBus, {
      productId: parent.productId,
      ruleId: row.id,
      kind: "option-unit-rule",
      source: runtime.source ?? "created",
    })
  }
  return row
}

export async function updateOptionUnitPriceRule(
  db: PostgresJsDatabase,
  id: string,
  data: UpdateOptionUnitPriceRuleInput,
  runtime: RuleMutationRuntime = {},
) {
  const [existing] = await db
    .select({
      optionPriceRuleId: optionUnitPriceRules.optionPriceRuleId,
      unitId: optionUnitPriceRules.unitId,
      sellAmountCents: optionUnitPriceRules.sellAmountCents,
      minQuantity: optionUnitPriceRules.minQuantity,
      maxQuantity: optionUnitPriceRules.maxQuantity,
    })
    .from(optionUnitPriceRules)
    .where(eq(optionUnitPriceRules.id, id))
    .limit(1)

  if (!existing) return null

  assertPricingValidation(
    validateMergedOptionUnitPriceRule({
      minQuantity: "minQuantity" in data ? data.minQuantity : existing.minQuantity,
      maxQuantity: "maxQuantity" in data ? data.maxQuantity : existing.maxQuantity,
    }),
    "Invalid option unit price rule",
  )

  await assertOccupancyPriceIsUnambiguous(db, {
    optionPriceRuleId:
      "optionPriceRuleId" in data
        ? (data.optionPriceRuleId ?? existing.optionPriceRuleId)
        : existing.optionPriceRuleId,
    unitId: "unitId" in data ? (data.unitId ?? existing.unitId) : existing.unitId,
    occupancyAmountCents:
      "sellAmountCents" in data ? (data.sellAmountCents ?? 0) : (existing.sellAmountCents ?? 0),
  })

  // Snapshot the pre-update parent's productId. If the update reassigns
  // `optionPriceRuleId` to a parent rule under a different product, the
  // *previous* product also loses this unit-rule from its MIN
  // candidate set and needs reindexing. Without this snapshot the old
  // product's `priceFromAmountCents` stays stale.
  const prevProductId = await getProductIdForUnitRule(db, id)

  const [row] = await db
    .update(optionUnitPriceRules)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(optionUnitPriceRules.id, id))
    .returning()
  if (!row) return null

  const nextProductId = await getProductIdForUnitRule(db, row.id)
  if (nextProductId) {
    await emitRuleChanged(runtime.eventBus, {
      productId: nextProductId,
      ruleId: row.id,
      kind: "option-unit-rule",
      source: runtime.source ?? "updated",
    })
  }
  if (prevProductId && prevProductId !== nextProductId) {
    await emitRuleChanged(runtime.eventBus, {
      productId: prevProductId,
      ruleId: row.id,
      kind: "option-unit-rule",
      source: runtime.source ?? "updated",
    })
  }
  return row
}

export async function deleteOptionUnitPriceRule(
  db: PostgresJsDatabase,
  id: string,
  runtime: RuleMutationRuntime = {},
) {
  // Snapshot productId before deletion — the row is gone after.
  const productId = await getProductIdForUnitRule(db, id)

  const [row] = await db
    .delete(optionUnitPriceRules)
    .where(eq(optionUnitPriceRules.id, id))
    .returning({ id: optionUnitPriceRules.id })
  if (!row) return null

  if (productId) {
    await emitRuleChanged(runtime.eventBus, {
      productId,
      ruleId: row.id,
      kind: "option-unit-rule",
      source: runtime.source ?? "deleted",
    })
  }
  return row
}

export async function listOptionStartTimeRules(
  db: PostgresJsDatabase,
  query: OptionStartTimeRuleListQuery,
) {
  const conditions = []
  if (query.optionPriceRuleId) {
    conditions.push(eq(optionStartTimeRules.optionPriceRuleId, query.optionPriceRuleId))
  }
  if (query.optionId) conditions.push(eq(optionStartTimeRules.optionId, query.optionId))
  if (query.startTimeId) conditions.push(eq(optionStartTimeRules.startTimeId, query.startTimeId))
  if (query.active !== undefined) conditions.push(eq(optionStartTimeRules.active, query.active))
  const where = conditions.length ? and(...conditions) : undefined

  return paginate(
    db
      .select()
      .from(optionStartTimeRules)
      .where(where)
      .limit(query.limit)
      .offset(query.offset)
      .orderBy(asc(optionStartTimeRules.createdAt)),
    db.select({ count: sql<number>`count(*)::int` }).from(optionStartTimeRules).where(where),
    query.limit,
    query.offset,
  )
}

export async function getOptionStartTimeRuleById(db: PostgresJsDatabase, id: string) {
  const [row] = await db
    .select()
    .from(optionStartTimeRules)
    .where(eq(optionStartTimeRules.id, id))
    .limit(1)
  return row ?? null
}

export async function createOptionStartTimeRule(
  db: PostgresJsDatabase,
  data: CreateOptionStartTimeRuleInput,
) {
  const [row] = await db.insert(optionStartTimeRules).values(data).returning()
  return row ?? null
}

export async function updateOptionStartTimeRule(
  db: PostgresJsDatabase,
  id: string,
  data: UpdateOptionStartTimeRuleInput,
) {
  const [row] = await db
    .update(optionStartTimeRules)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(optionStartTimeRules.id, id))
    .returning()
  return row ?? null
}

export async function deleteOptionStartTimeRule(db: PostgresJsDatabase, id: string) {
  const [row] = await db
    .delete(optionStartTimeRules)
    .where(eq(optionStartTimeRules.id, id))
    .returning({ id: optionStartTimeRules.id })
  return row ?? null
}

export async function listOptionUnitTiers(db: PostgresJsDatabase, query: OptionUnitTierListQuery) {
  const conditions = []
  if (query.optionUnitPriceRuleId) {
    conditions.push(eq(optionUnitTiers.optionUnitPriceRuleId, query.optionUnitPriceRuleId))
  }
  if (query.active !== undefined) conditions.push(eq(optionUnitTiers.active, query.active))
  const where = conditions.length ? and(...conditions) : undefined

  return paginate(
    db
      .select()
      .from(optionUnitTiers)
      .where(where)
      .limit(query.limit)
      .offset(query.offset)
      .orderBy(asc(optionUnitTiers.sortOrder), asc(optionUnitTiers.minQuantity)),
    db.select({ count: sql<number>`count(*)::int` }).from(optionUnitTiers).where(where),
    query.limit,
    query.offset,
  )
}

export async function getOptionUnitTierById(db: PostgresJsDatabase, id: string) {
  const [row] = await db.select().from(optionUnitTiers).where(eq(optionUnitTiers.id, id)).limit(1)
  return row ?? null
}

async function assertOccupancyTierIsUnambiguous(
  db: PostgresJsDatabase,
  optionUnitPriceRuleId: string,
  occupancyAmountCents: number,
): Promise<void> {
  const [unitRule] = await db
    .select({
      optionPriceRuleId: optionUnitPriceRules.optionPriceRuleId,
      unitId: optionUnitPriceRules.unitId,
    })
    .from(optionUnitPriceRules)
    .where(eq(optionUnitPriceRules.id, optionUnitPriceRuleId))
    .limit(1)
  if (!unitRule) return
  await assertOccupancyPriceIsUnambiguous(db, {
    ...unitRule,
    occupancyAmountCents,
  })
}

export async function createOptionUnitTier(
  db: PostgresJsDatabase,
  data: CreateOptionUnitTierInput,
) {
  await assertOccupancyTierIsUnambiguous(db, data.optionUnitPriceRuleId, data.sellAmountCents ?? 0)
  const [row] = await db.insert(optionUnitTiers).values(data).returning()
  return row ?? null
}

export async function updateOptionUnitTier(
  db: PostgresJsDatabase,
  id: string,
  data: UpdateOptionUnitTierInput,
) {
  const [existing] = await db
    .select({
      optionUnitPriceRuleId: optionUnitTiers.optionUnitPriceRuleId,
      sellAmountCents: optionUnitTiers.sellAmountCents,
    })
    .from(optionUnitTiers)
    .where(eq(optionUnitTiers.id, id))
    .limit(1)
  if (!existing) return null
  await assertOccupancyTierIsUnambiguous(
    db,
    "optionUnitPriceRuleId" in data
      ? (data.optionUnitPriceRuleId ?? existing.optionUnitPriceRuleId)
      : existing.optionUnitPriceRuleId,
    "sellAmountCents" in data ? (data.sellAmountCents ?? 0) : (existing.sellAmountCents ?? 0),
  )
  const [row] = await db
    .update(optionUnitTiers)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(optionUnitTiers.id, id))
    .returning()
  return row ?? null
}

export async function deleteOptionUnitTier(db: PostgresJsDatabase, id: string) {
  const [row] = await db
    .delete(optionUnitTiers)
    .where(eq(optionUnitTiers.id, id))
    .returning({ id: optionUnitTiers.id })
  return row ?? null
}
