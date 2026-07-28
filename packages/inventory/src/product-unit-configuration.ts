import { sha256 } from "@voyant-travel/action-ledger"
import {
  optionPriceRules,
  optionUnitPriceRules,
  priceCatalogs,
} from "@voyant-travel/commerce/schema"
import { and, asc, eq, inArray } from "drizzle-orm"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"
import { z } from "zod"

import { optionUnits, productOptions, products } from "./schema.js"

export const productUnitConfigurationChangeSchema = z
  .object({
    unitId: z.string().min(1),
    maxQuantity: z.number().int().min(0).nullable().optional(),
    sellAmountCents: z.number().int().min(0).nullable().optional(),
  })
  .strict()

export const previewProductUnitConfigurationInputSchema = z
  .object({
    productId: z.string().min(1),
    optionPriceRuleId: z.string().min(1),
    changes: z.array(productUnitConfigurationChangeSchema).min(1),
  })
  .strict()

const unitValueSchema = z
  .object({
    maxQuantity: z.number().int().nullable(),
    sellAmountCents: z.number().int().nullable(),
  })
  .strict()

export const productUnitConfigurationPlanSchema = z
  .object({
    status: z.literal("ready"),
    productId: z.string(),
    optionId: z.string(),
    optionPriceRuleId: z.string(),
    currencyCode: z.string(),
    beforeRevision: z.string(),
    afterRevision: z.string(),
    units: z.array(
      z
        .object({
          unitId: z.string(),
          unitPriceRuleId: z.string().nullable(),
          name: z.string(),
          changed: z.boolean(),
          before: unitValueSchema,
          after: unitValueSchema,
        })
        .strict(),
    ),
  })
  .strict()

const productUnitConfigurationIssueSchema = z
  .object({
    code: z.enum([
      "duplicate_unit_change",
      "option_price_rule_missing",
      "unit_missing",
      "unit_price_rule_missing",
      "unit_price_rule_ambiguous",
    ]),
    message: z.string(),
    unitId: z.string().optional(),
  })
  .strict()

export const productUnitConfigurationPreviewSchema = z.discriminatedUnion("status", [
  productUnitConfigurationPlanSchema,
  z
    .object({ status: z.literal("invalid"), issues: z.array(productUnitConfigurationIssueSchema) })
    .strict(),
])

export const applyProductUnitConfigurationInputSchema = productUnitConfigurationPlanSchema

export const appliedProductUnitConfigurationSchema = productUnitConfigurationPlanSchema
  .omit({ status: true })
  .extend({ status: z.enum(["applied", "replayed"]) })

export type PreviewProductUnitConfigurationInput = z.input<
  typeof previewProductUnitConfigurationInputSchema
>
export type ProductUnitConfigurationPlan = z.output<typeof productUnitConfigurationPlanSchema>
export type ProductUnitConfigurationPreview = z.output<typeof productUnitConfigurationPreviewSchema>

export class ProductUnitConfigurationError extends Error {
  constructor(
    message: string,
    readonly code: "invalid_plan" | "stale_plan" | "postcondition_failed",
  ) {
    super(message)
    this.name = "ProductUnitConfigurationError"
  }
}

/**
 * Build the exhaustive approval payload for one option rate plan. Every unit
 * is included so an operator can see exact before/after values and verify that
 * unmentioned units remain untouched before approving the write.
 */
export async function previewProductUnitConfiguration(
  db: PostgresJsDatabase,
  rawInput: PreviewProductUnitConfigurationInput,
): Promise<ProductUnitConfigurationPreview> {
  const input = previewProductUnitConfigurationInputSchema.parse(rawInput)
  const duplicate = duplicateUnitId(input.changes)
  if (duplicate) {
    return invalid("duplicate_unit_change", `Unit ${duplicate} appears more than once.`, duplicate)
  }

  const snapshot = await readConfiguration(db, input.productId, input.optionPriceRuleId)
  if (!snapshot) {
    return invalid(
      "option_price_rule_missing",
      "The option price rule does not belong to the requested product.",
    )
  }

  const ambiguous = snapshot.units.find((unit) => unit.priceRuleCount > 1)
  if (ambiguous) {
    return invalid(
      "unit_price_rule_ambiguous",
      `Unit ${ambiguous.name} has multiple active price rows in this rate plan.`,
      ambiguous.unitId,
    )
  }

  const changes = new Map(input.changes.map((change) => [change.unitId, change]))
  for (const change of input.changes) {
    const unit = snapshot.units.find((candidate) => candidate.unitId === change.unitId)
    if (!unit) {
      return invalid(
        "unit_missing",
        `Unit ${change.unitId} does not belong to this option.`,
        change.unitId,
      )
    }
    if (change.sellAmountCents !== undefined && unit.priceRuleCount === 0) {
      return invalid(
        "unit_price_rule_missing",
        `Unit ${unit.name} has no active price row in this rate plan.`,
        unit.unitId,
      )
    }
  }

  const units = snapshot.units.map((unit) => {
    const change = changes.get(unit.unitId)
    const before = {
      maxQuantity: unit.maxQuantity,
      sellAmountCents: unit.sellAmountCents,
    }
    const after = {
      maxQuantity: change?.maxQuantity === undefined ? before.maxQuantity : change.maxQuantity,
      sellAmountCents:
        change?.sellAmountCents === undefined ? before.sellAmountCents : change.sellAmountCents,
    }
    return {
      unitId: unit.unitId,
      unitPriceRuleId: unit.unitPriceRuleId,
      name: unit.name,
      changed:
        before.maxQuantity !== after.maxQuantity ||
        before.sellAmountCents !== after.sellAmountCents,
      before,
      after,
    }
  })

  return productUnitConfigurationPlanSchema.parse({
    status: "ready",
    productId: input.productId,
    optionId: snapshot.optionId,
    optionPriceRuleId: input.optionPriceRuleId,
    currencyCode: snapshot.currencyCode,
    beforeRevision: await revision(snapshot.units.map(revisionUnit)),
    afterRevision: await revision(
      units.map((unit) => ({
        unitId: unit.unitId,
        unitPriceRuleId: unit.unitPriceRuleId,
        name: unit.name,
        maxQuantity: unit.after.maxQuantity,
        sellAmountCents: unit.after.sellAmountCents,
      })),
    ),
    units,
  })
}

/** Apply exactly one previously previewed plan, atomically across Inventory and Commerce rows. */
export async function applyProductUnitConfiguration(
  db: PostgresJsDatabase,
  rawPlan: ProductUnitConfigurationPlan,
) {
  const plan = applyProductUnitConfigurationInputSchema.parse(rawPlan)
  await assertPlanIntegrity(plan)
  return db.transaction(async (tx) => {
    const transaction = tx as PostgresJsDatabase
    await lockConfiguration(transaction, plan)
    const current = await previewProductUnitConfiguration(transaction, {
      productId: plan.productId,
      optionPriceRuleId: plan.optionPriceRuleId,
      changes: plan.units.map((unit) => ({
        unitId: unit.unitId,
        maxQuantity: unit.after.maxQuantity,
        sellAmountCents: unit.after.sellAmountCents,
      })),
    })
    if (current.status !== "ready") {
      throw new ProductUnitConfigurationError(
        "The approved configuration is no longer valid.",
        "invalid_plan",
      )
    }
    assertSamePlanIdentity(plan, current)

    if (current.beforeRevision === plan.afterRevision) {
      return appliedProductUnitConfigurationSchema.parse({ ...plan, status: "replayed" })
    }
    if (current.beforeRevision !== plan.beforeRevision) {
      throw new ProductUnitConfigurationError(
        "The product configuration changed after preview; request a fresh preview.",
        "stale_plan",
      )
    }

    for (const unit of plan.units.filter((candidate) => candidate.changed)) {
      if (unit.before.maxQuantity !== unit.after.maxQuantity) {
        await tx
          .update(optionUnits)
          .set({ maxQuantity: unit.after.maxQuantity, updatedAt: new Date() })
          .where(and(eq(optionUnits.id, unit.unitId), eq(optionUnits.optionId, plan.optionId)))
      }
      if (unit.before.sellAmountCents !== unit.after.sellAmountCents) {
        if (!unit.unitPriceRuleId) {
          throw new ProductUnitConfigurationError(
            "Approved unit price row is missing.",
            "invalid_plan",
          )
        }
        await tx
          .update(optionUnitPriceRules)
          .set({ sellAmountCents: unit.after.sellAmountCents, updatedAt: new Date() })
          .where(
            and(
              eq(optionUnitPriceRules.id, unit.unitPriceRuleId),
              eq(optionUnitPriceRules.optionPriceRuleId, plan.optionPriceRuleId),
            ),
          )
      }
    }

    const after = await previewProductUnitConfiguration(transaction, {
      productId: plan.productId,
      optionPriceRuleId: plan.optionPriceRuleId,
      changes: plan.units.map((unit) => ({
        unitId: unit.unitId,
        maxQuantity: unit.after.maxQuantity,
        sellAmountCents: unit.after.sellAmountCents,
      })),
    })
    if (after.status !== "ready" || after.beforeRevision !== plan.afterRevision) {
      throw new ProductUnitConfigurationError(
        "The committed configuration did not match the approved result.",
        "postcondition_failed",
      )
    }
    return appliedProductUnitConfigurationSchema.parse({ ...plan, status: "applied" })
  })
}

type ConfigurationRow = {
  unitId: string
  unitPriceRuleId: string | null
  priceRuleCount: number
  name: string
  maxQuantity: number | null
  sellAmountCents: number | null
}

async function readConfiguration(
  db: PostgresJsDatabase,
  productId: string,
  optionPriceRuleId: string,
): Promise<{ optionId: string; currencyCode: string; units: ConfigurationRow[] } | null> {
  const [rule] = await db
    .select({
      optionId: optionPriceRules.optionId,
      currencyCode: priceCatalogs.currencyCode,
      productCurrency: products.sellCurrency,
    })
    .from(optionPriceRules)
    .innerJoin(priceCatalogs, eq(priceCatalogs.id, optionPriceRules.priceCatalogId))
    .innerJoin(products, eq(products.id, optionPriceRules.productId))
    .where(
      and(eq(optionPriceRules.id, optionPriceRuleId), eq(optionPriceRules.productId, productId)),
    )
    .limit(1)
  if (!rule) return null

  const units = await db
    .select({ id: optionUnits.id, name: optionUnits.name, maxQuantity: optionUnits.maxQuantity })
    .from(optionUnits)
    .innerJoin(productOptions, eq(productOptions.id, optionUnits.optionId))
    .where(and(eq(optionUnits.optionId, rule.optionId), eq(productOptions.productId, productId)))
    .orderBy(asc(optionUnits.sortOrder), asc(optionUnits.createdAt), asc(optionUnits.id))
  const unitIds = units.map((unit) => unit.id)
  const priceRows = unitIds.length
    ? await db
        .select({
          id: optionUnitPriceRules.id,
          unitId: optionUnitPriceRules.unitId,
          sellAmountCents: optionUnitPriceRules.sellAmountCents,
        })
        .from(optionUnitPriceRules)
        .where(
          and(
            eq(optionUnitPriceRules.optionPriceRuleId, optionPriceRuleId),
            eq(optionUnitPriceRules.active, true),
            inArray(optionUnitPriceRules.unitId, unitIds),
          ),
        )
        .orderBy(asc(optionUnitPriceRules.sortOrder), asc(optionUnitPriceRules.createdAt))
    : []
  const pricesByUnit = new Map<string, typeof priceRows>()
  for (const price of priceRows) {
    pricesByUnit.set(price.unitId, [...(pricesByUnit.get(price.unitId) ?? []), price])
  }

  return {
    optionId: rule.optionId,
    currencyCode: rule.currencyCode ?? rule.productCurrency,
    units: units.map((unit) => {
      const prices = pricesByUnit.get(unit.id) ?? []
      return {
        unitId: unit.id,
        unitPriceRuleId: prices.length === 1 ? (prices[0]?.id ?? null) : null,
        priceRuleCount: prices.length,
        name: unit.name,
        maxQuantity: unit.maxQuantity,
        sellAmountCents: prices.length === 1 ? (prices[0]?.sellAmountCents ?? null) : null,
      }
    }),
  }
}

async function lockConfiguration(db: PostgresJsDatabase, plan: ProductUnitConfigurationPlan) {
  await db
    .select({ id: optionPriceRules.id })
    .from(optionPriceRules)
    .where(eq(optionPriceRules.id, plan.optionPriceRuleId))
    .for("update")
  await db
    .select({ id: productOptions.id })
    .from(productOptions)
    .where(eq(productOptions.id, plan.optionId))
    .for("update")
  const unitIds = plan.units.map((unit) => unit.unitId)
  if (unitIds.length) {
    await db
      .select({ id: optionUnits.id })
      .from(optionUnits)
      .where(inArray(optionUnits.id, unitIds))
      .for("update")
    await db
      .select({ id: optionUnitPriceRules.id })
      .from(optionUnitPriceRules)
      .where(eq(optionUnitPriceRules.optionPriceRuleId, plan.optionPriceRuleId))
      .for("update")
  }
}

function revisionUnit(unit: ConfigurationRow) {
  return {
    unitId: unit.unitId,
    unitPriceRuleId: unit.unitPriceRuleId,
    name: unit.name,
    maxQuantity: unit.maxQuantity,
    sellAmountCents: unit.sellAmountCents,
  }
}

async function revision(units: ReturnType<typeof revisionUnit>[]) {
  return `product-unit-configuration:v1:sha256:${await sha256({ units })}`
}

async function assertPlanIntegrity(plan: ProductUnitConfigurationPlan) {
  const beforeRevision = await revision(
    plan.units.map((unit) => ({
      unitId: unit.unitId,
      unitPriceRuleId: unit.unitPriceRuleId,
      name: unit.name,
      maxQuantity: unit.before.maxQuantity,
      sellAmountCents: unit.before.sellAmountCents,
    })),
  )
  const afterRevision = await revision(
    plan.units.map((unit) => ({
      unitId: unit.unitId,
      unitPriceRuleId: unit.unitPriceRuleId,
      name: unit.name,
      maxQuantity: unit.after.maxQuantity,
      sellAmountCents: unit.after.sellAmountCents,
    })),
  )
  const invalidChangedFlag = plan.units.some(
    (unit) =>
      unit.changed !==
      (unit.before.maxQuantity !== unit.after.maxQuantity ||
        unit.before.sellAmountCents !== unit.after.sellAmountCents),
  )
  if (
    invalidChangedFlag ||
    plan.beforeRevision !== beforeRevision ||
    plan.afterRevision !== afterRevision
  ) {
    throw new ProductUnitConfigurationError(
      "The approved plan was modified after preview.",
      "invalid_plan",
    )
  }
}

function duplicateUnitId(changes: PreviewProductUnitConfigurationInput["changes"]) {
  const seen = new Set<string>()
  for (const change of changes) {
    if (seen.has(change.unitId)) return change.unitId
    seen.add(change.unitId)
  }
  return null
}

function invalid(
  code: z.output<typeof productUnitConfigurationIssueSchema>["code"],
  message: string,
  unitId?: string,
): ProductUnitConfigurationPreview {
  return { status: "invalid", issues: [{ code, message, ...(unitId ? { unitId } : {}) }] }
}

function assertSamePlanIdentity(
  approved: ProductUnitConfigurationPlan,
  current: ProductUnitConfigurationPlan,
) {
  if (
    approved.productId !== current.productId ||
    approved.optionId !== current.optionId ||
    approved.optionPriceRuleId !== current.optionPriceRuleId ||
    approved.currencyCode !== current.currencyCode ||
    approved.units.length !== current.units.length ||
    approved.units.some((unit, index) => {
      const candidate = current.units[index]
      return (
        !candidate ||
        unit.unitId !== candidate.unitId ||
        unit.unitPriceRuleId !== candidate.unitPriceRuleId ||
        unit.name !== candidate.name ||
        unit.after.maxQuantity !== candidate.after.maxQuantity ||
        unit.after.sellAmountCents !== candidate.after.sellAmountCents
      )
    })
  ) {
    throw new ProductUnitConfigurationError(
      "The approved plan does not match the authoritative option configuration.",
      "invalid_plan",
    )
  }
}
