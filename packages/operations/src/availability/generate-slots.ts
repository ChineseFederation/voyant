import { availabilityRules, availabilitySlots } from "@voyant-travel/availability/schema"
import { and, eq, inArray } from "drizzle-orm"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"
import { resolveCurrentProductVersionId } from "./products-ref.js"
import { expandRRule } from "./rrule.js"
import { materializeSlotResourcesFromTemplateDefaults } from "./service-allocation-automation.js"
import { localToInstant } from "./slot-timezone.js"

export type GenerateAvailabilitySlotsOptions = {
  /** If provided, only generate slots for this rule. Otherwise, process all active rules. */
  ruleId?: string
  /** How many days ahead from "now" to generate slots for. Defaults to 90. */
  horizonDays?: number
  /** Default start time (HH:MM, 24h) used when a rule does not define one. Defaults to "09:00". */
  defaultStartTime?: string
  /** Cap on slots expanded per rule. Defaults to 1000. */
  perRuleLimit?: number
  /** Override "now" for deterministic generation. Defaults to new Date(). */
  now?: Date
  /**
   * Auto-seed `allocation_resources` for each freshly-created slot from
   * its option's `product_option_resource_templates.default_count`.
   * Templates without `default_count` are still skipped — those need
   * pax-aware materialisation via the admin route. Defaults to true.
   */
  materializeResources?: boolean
  /**
   * Resolves the Product Version each freshly-generated departure is bound to
   * — the product's currently published version, or `null` when it has never
   * been published.
   *
   * Resolved once per rule rather than per slot: a generation run materializes
   * against the version current when the run starts, so one run cannot produce
   * departures split across two definitions. Already-generated departures are
   * never rewritten by a later run.
   *
   * Defaults to reading the product's highest version number directly. Supply
   * an override to materialize a run against a specific definition. See #4032.
   */
  resolveCurrentProductVersionId?: (productId: string) => Promise<string | null>
}

export type GenerateAvailabilitySlotsResult = {
  rulesProcessed: number
  slotsCreated: number
  slotsSkipped: number
  resourcesMaterialized: number
}

/**
 * Materialize availability slots from active availability rules.
 *
 * `startsAt` is stored as a true UTC instant for the wall-clock time on
 * `dateLocal` in the rule's `timezone`.
 */
export async function generateAvailabilitySlots(
  db: PostgresJsDatabase,
  options: GenerateAvailabilitySlotsOptions = {},
): Promise<GenerateAvailabilitySlotsResult> {
  const horizonDays = options.horizonDays ?? 90
  const defaultStartTime = options.defaultStartTime ?? "09:00"
  const perRuleLimit = options.perRuleLimit ?? 1000
  const now = options.now ?? new Date()
  const shouldMaterializeResources = options.materializeResources !== false

  const from = new Date(now)
  from.setUTCHours(0, 0, 0, 0)
  const to = new Date(from)
  to.setUTCDate(to.getUTCDate() + horizonDays)

  const ruleFilters = [eq(availabilityRules.active, true)]
  if (options.ruleId) ruleFilters.push(eq(availabilityRules.id, options.ruleId))

  const rules = await db
    .select()
    .from(availabilityRules)
    .where(and(...ruleFilters))

  let slotsCreated = 0
  let slotsSkipped = 0
  let resourcesMaterialized = 0

  for (const rule of rules) {
    const dates = expandRRule(rule.recurrenceRule, from, to, perRuleLimit)
    if (dates.length === 0) continue

    const existing = await db
      .select({ dateLocal: availabilitySlots.dateLocal })
      .from(availabilitySlots)
      .where(
        and(
          eq(availabilitySlots.productId, rule.productId),
          eq(availabilitySlots.availabilityRuleId, rule.id),
          inArray(availabilitySlots.dateLocal, dates),
        ),
      )

    const existingSet = new Set(existing.map((row) => row.dateLocal))

    const toInsert = dates.filter((d) => !existingSet.has(d))
    slotsSkipped += dates.length - toInsert.length

    if (toInsert.length === 0) continue

    const [hh, mm] = defaultStartTime.split(":")
    const hour = Number.parseInt(hh ?? "9", 10) || 0
    const minute = Number.parseInt(mm ?? "0", 10) || 0

    const startTime = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`
    // Resolved once per rule so a single run cannot split its departures
    // across two Product Versions if a publish lands mid-run.
    const productVersionId = options.resolveCurrentProductVersionId
      ? await options.resolveCurrentProductVersionId(rule.productId)
      : await resolveCurrentProductVersionId(db, rule.productId)

    const rows = toInsert.map((dateLocal) => {
      return {
        productId: rule.productId,
        productVersionId,
        optionId: rule.optionId,
        facilityId: rule.facilityId,
        availabilityRuleId: rule.id,
        dateLocal,
        startsAt: new Date(
          localToInstant({ date: dateLocal, time: startTime, timezone: rule.timezone }),
        ),
        timezone: rule.timezone,
        status: "open" as const,
        unlimited: false,
        initialPax: rule.maxCapacity,
        remainingPax: rule.maxCapacity,
      }
    })

    const inserted = await db
      .insert(availabilitySlots)
      .values(rows)
      .returning({ id: availabilitySlots.id, optionId: availabilitySlots.optionId })
    slotsCreated += inserted.length

    if (shouldMaterializeResources && rule.optionId) {
      for (const created of inserted) {
        if (!created.optionId) continue
        const result = await materializeSlotResourcesFromTemplateDefaults(db, created.id)
        resourcesMaterialized += result.created
      }
    }
  }

  return {
    rulesProcessed: rules.length,
    slotsCreated,
    slotsSkipped,
    resourcesMaterialized,
  }
}
