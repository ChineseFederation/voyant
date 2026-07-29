import { and, eq, inArray } from "drizzle-orm"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"
import * as rrulePackage from "rrule"

import { priceSchedules } from "./schema-catalogs.js"
import { departurePriceOverrides } from "./schema-departure-overrides.js"
import { optionPriceRules } from "./schema-option-rules.js"

type RRulePackage = typeof import("rrule")
type RRulePackageCompat = RRulePackage & {
  default?: RRulePackage
  rrule?: RRulePackage
}

const rrulePackageCompat = rrulePackage as RRulePackageCompat
const { rrulestr } =
  rrulePackageCompat.rrulestr != null
    ? rrulePackageCompat
    : (rrulePackageCompat.default ?? rrulePackageCompat.rrule ?? rrulePackageCompat)

export interface ResolverRuleInput {
  id: string
  name: string
  isDefault: boolean
  priceScheduleId: string | null
}

export interface ResolverScheduleInput {
  id: string
  active: boolean
  priority: number
  recurrenceRule: string
  validFrom: string | null
  validTo: string | null
  weekdays: string[] | null
  timezone: string | null
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/

const WEEKDAY_TOKENS = [
  ["SU", "sunday", "sun", "0", "7"],
  ["MO", "monday", "mon", "1"],
  ["TU", "tuesday", "tue", "2"],
  ["WE", "wednesday", "wed", "3"],
  ["TH", "thursday", "thu", "4"],
  ["FR", "friday", "fri", "5"],
  ["SA", "saturday", "sat", "6"],
] as const

const WEEKDAY_CODES = WEEKDAY_TOKENS.map(([code]) => code)

export function normalizeScheduleWeekdayToken(token: string): string | null {
  const normalized = token.trim().toLowerCase()
  if (!normalized) return null
  for (const [code, ...aliases] of WEEKDAY_TOKENS) {
    if (code.toLowerCase() === normalized || aliases.some((alias) => alias === normalized)) {
      return code
    }
  }
  return null
}

function weekdayCode(isoDate: string): string {
  const d = new Date(`${isoDate}T00:00:00Z`)
  return WEEKDAY_CODES[d.getUTCDay()] ?? "MO"
}

function dateInWindow(isoDate: string, from: string | null, to: string | null): boolean {
  if (from && isoDate < from) return false
  if (to && isoDate > to) return false
  return true
}

function rruleMatchesDate(ruleString: string, isoDate: string, anchor: string): boolean {
  const trimmed = ruleString.trim()
  if (trimmed === "") return true

  const dtstart = `${anchor.replace(/-/g, "")}T000000Z`
  const hasDtstart = /(?:^|\n)DTSTART[:;]/.test(trimmed)
  const hasRrule = /(?:^|\n)RRULE[:;]/.test(trimmed)
  const body = hasRrule ? trimmed : `RRULE:${trimmed}`
  const fullRule = hasDtstart ? body : `DTSTART:${dtstart}\n${body}`

  let parsed: ReturnType<typeof rrulestr>
  try {
    parsed = rrulestr(fullRule)
  } catch {
    return false
  }

  const start = new Date(`${isoDate}T00:00:00Z`)
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000)
  const occurrences = parsed.between(start, end, true)
  return occurrences.some((occ) => occ.toISOString().slice(0, 10) === isoDate)
}

function scheduleMatchesDate(s: ResolverScheduleInput, isoDate: string): boolean {
  if (!s.active) return false
  if (!dateInWindow(isoDate, s.validFrom, s.validTo)) return false

  if (s.weekdays && s.weekdays.length > 0) {
    const weekdays = new Set(
      s.weekdays
        .map((entry) => normalizeScheduleWeekdayToken(entry))
        .filter((entry): entry is string => entry !== null),
    )
    if (!weekdays.has(weekdayCode(isoDate))) return false
  }

  const anchor = s.validFrom ?? "2000-01-01"
  if (!rruleMatchesDate(s.recurrenceRule, isoDate, anchor)) return false

  return true
}

interface Match {
  rule: ResolverRuleInput
  priority: number
  scheduled: boolean
}

function compareMatches(a: Match, b: Match): number {
  if (b.priority !== a.priority) return b.priority - a.priority
  const aDef = a.rule.isDefault ? 1 : 0
  const bDef = b.rule.isDefault ? 1 : 0
  if (aDef !== bDef) return bDef - aDef
  return a.rule.name.localeCompare(b.rule.name)
}

/**
 * Pick the option price rule that applies to a given date, given a set of
 * candidate rules and their schedules.
 *
 * - Rules with a matching schedule beat rules without one.
 * - Among scheduled matches, highest `priority` wins. Ties: `isDefault` first,
 *   then alphabetic by `name`.
 * - When no schedule matches, a rule with `isDefault=true` and no schedule acts
 *   as the fallback. Without one, returns an empty array.
 */
export function pickRulesForDate(
  rules: ResolverRuleInput[],
  schedules: Map<string, ResolverScheduleInput>,
  isoDate: string,
): ResolverRuleInput[] {
  if (!ISO_DATE_RE.test(isoDate)) {
    throw new Error(`pickRulesForDate: expected ISO yyyy-mm-dd, got "${isoDate}"`)
  }

  const matches: Match[] = []

  for (const rule of rules) {
    if (rule.priceScheduleId === null) {
      if (rule.isDefault) {
        matches.push({ rule, priority: Number.NEGATIVE_INFINITY, scheduled: false })
      }
      continue
    }
    const schedule = schedules.get(rule.priceScheduleId)
    if (!schedule) continue
    if (!scheduleMatchesDate(schedule, isoDate)) continue
    matches.push({ rule, priority: schedule.priority, scheduled: true })
  }

  if (matches.length === 0) return []

  const scheduled = matches.filter((m) => m.scheduled)
  if (scheduled.length > 0) {
    scheduled.sort(compareMatches)
    const winner = scheduled[0]
    return winner ? [winner.rule] : []
  }

  matches.sort(compareMatches)
  const winner = matches[0]
  return winner ? [winner.rule] : []
}

export interface ResolveOptionPriceRulesParams {
  productId: string
  optionIds: string[]
  catalogId: string
  date: string
}

/**
 * DB-backed wrapper around `pickRulesForDate`. Fetches active rules for the
 * product/option/catalog plus their schedules, then picks the winning rule
 * per option for the given date.
 *
 * Returns a Map keyed by optionId. Options whose rules don't match the date
 * (and have no default) are absent from the map.
 */
export async function resolveOptionPriceRulesForDate(
  db: PostgresJsDatabase,
  params: ResolveOptionPriceRulesParams,
): Promise<Map<string, ResolverRuleInput>> {
  if (params.optionIds.length === 0) return new Map()

  const rules = await db
    .select({
      id: optionPriceRules.id,
      optionId: optionPriceRules.optionId,
      name: optionPriceRules.name,
      isDefault: optionPriceRules.isDefault,
      priceScheduleId: optionPriceRules.priceScheduleId,
    })
    .from(optionPriceRules)
    .where(
      and(
        eq(optionPriceRules.productId, params.productId),
        inArray(optionPriceRules.optionId, params.optionIds),
        eq(optionPriceRules.priceCatalogId, params.catalogId),
        eq(optionPriceRules.active, true),
      ),
    )

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

  const rulesByOption = new Map<string, ResolverRuleInput[]>()
  for (const r of rules) {
    const existing = rulesByOption.get(r.optionId) ?? []
    existing.push({
      id: r.id,
      name: r.name,
      isDefault: r.isDefault,
      priceScheduleId: r.priceScheduleId,
    })
    rulesByOption.set(r.optionId, existing)
  }

  const result = new Map<string, ResolverRuleInput>()
  for (const [optionId, candidateRules] of rulesByOption) {
    const picked = pickRulesForDate(candidateRules, scheduleMap, params.date)
    const first = picked[0]
    if (first) result.set(optionId, first)
  }

  return result
}

/**
 * Per-departure price override applied to a specific unit, keyed by unitId.
 * Resolved AFTER rule selection: the rule's per-unit price gets replaced with
 * the override's amount for any matching unit. Units without an override fall
 * through to the rule's normal price.
 */
export interface UnitPriceOverride {
  id: string
  unitId: string
  sellAmountCents: number
  costAmountCents: number | null
}

/**
 * Fetch active per-unit price overrides for a given departure + catalog.
 *
 * Returns a Map keyed by `optionUnitId` so callers can apply overrides while
 * iterating per-unit prices in a snapshot. Inactive overrides are excluded at
 * query time.
 */
export async function loadDeparturePriceOverrides(
  db: PostgresJsDatabase,
  params: { departureId: string; catalogId: string },
): Promise<Map<string, UnitPriceOverride>> {
  const rows = await db
    .select({
      id: departurePriceOverrides.id,
      optionUnitId: departurePriceOverrides.optionUnitId,
      sellAmountCents: departurePriceOverrides.sellAmountCents,
      costAmountCents: departurePriceOverrides.costAmountCents,
    })
    .from(departurePriceOverrides)
    .where(
      and(
        eq(departurePriceOverrides.departureId, params.departureId),
        eq(departurePriceOverrides.priceCatalogId, params.catalogId),
        eq(departurePriceOverrides.active, true),
      ),
    )

  return new Map(
    rows.map((r) => [
      r.optionUnitId,
      {
        id: r.id,
        unitId: r.optionUnitId,
        sellAmountCents: r.sellAmountCents,
        costAmountCents: r.costAmountCents,
      },
    ]),
  )
}
