/**
 * Small, hand-rolled helpers for a SUBSET of the iCalendar RRULE grammar used by
 * the guided recurrence picker. We intentionally avoid an external rrule library:
 * the guided UI only understands FREQ + BYMONTH + BYDAY + BYMONTHDAY, and anything
 * outside that subset gracefully falls back to a raw "custom" string so nothing is
 * ever lost.
 */

export type RecurrenceFrequency = "yearly" | "monthly" | "weekly" | "custom"

/**
 * The RRULE weekday tokens in iCalendar order (Monday-first), matching how a
 * guided weekly rule is serialized. `index` is the `Date.getDay()`-compatible
 * value (0 = Sunday) so display names can be derived from a real Date.
 */
export const RECURRENCE_WEEKDAYS = [
  { token: "MO", index: 1 },
  { token: "TU", index: 2 },
  { token: "WE", index: 3 },
  { token: "TH", index: 4 },
  { token: "FR", index: 5 },
  { token: "SA", index: 6 },
  { token: "SU", index: 0 },
] as const

export type RecurrenceWeekdayToken = (typeof RECURRENCE_WEEKDAYS)[number]["token"]

const WEEKDAY_TOKENS = new Set<string>(RECURRENCE_WEEKDAYS.map((day) => day.token))

/** 1-based month numbers, Jan..Dec. `index` is the 0-based month for Date-based names. */
export const RECURRENCE_MONTHS = Array.from({ length: 12 }, (_, index) => ({
  value: index + 1,
  index,
}))

export interface RecurrenceState {
  frequency: RecurrenceFrequency
  /** 1-based month numbers for a yearly rule (BYMONTH). */
  months: number[]
  /** RRULE weekday tokens for a weekly rule (BYDAY). */
  weekdays: RecurrenceWeekdayToken[]
  /** Optional 1..31 day-of-month for a monthly rule (BYMONTHDAY). */
  monthDay: number | null
  /** The raw RRULE string. Authoritative when frequency === "custom". */
  raw: string
}

function uniqueSorted(values: number[]): number[] {
  return Array.from(new Set(values)).sort((a, b) => a - b)
}

/** Parse the `KEY=VALUE;KEY=VALUE` body of an RRULE into an uppercase-keyed map. */
function parseRuleParts(rule: string): Map<string, string> {
  const parts = new Map<string, string>()
  for (const segment of rule.split(";")) {
    const trimmed = segment.trim()
    if (!trimmed) continue
    const eq = trimmed.indexOf("=")
    if (eq === -1) return new Map() // malformed → treat as no recognizable parts
    const key = trimmed.slice(0, eq).trim().toUpperCase()
    const value = trimmed.slice(eq + 1).trim()
    parts.set(key, value)
  }
  return parts
}

/**
 * Serialize a guided state to an RRULE string. For "custom" the raw string is
 * returned verbatim so the user can express anything the guided UI cannot.
 */
const FREQ_TOKENS: Record<Exclude<RecurrenceFrequency, "custom">, string> = {
  yearly: "YEARLY",
  monthly: "MONTHLY",
  weekly: "WEEKLY",
}

function freqPrefix(frequency: Exclude<RecurrenceFrequency, "custom">): string {
  return `FREQ=${FREQ_TOKENS[frequency]}`
}

export function serializeRecurrence(state: RecurrenceState): string {
  switch (state.frequency) {
    case "yearly": {
      const months = uniqueSorted(state.months)
      return months.length > 0
        ? `${freqPrefix("yearly")};BYMONTH=${months.join(",")}`
        : freqPrefix("yearly")
    }
    case "weekly": {
      const weekdays = state.weekdays.filter((token) => WEEKDAY_TOKENS.has(token))
      return weekdays.length > 0
        ? `${freqPrefix("weekly")};BYDAY=${weekdays.join(",")}`
        : freqPrefix("weekly")
    }
    case "monthly": {
      if (state.monthDay && state.monthDay >= 1 && state.monthDay <= 31) {
        return `${freqPrefix("monthly")};BYMONTHDAY=${state.monthDay}`
      }
      return freqPrefix("monthly")
    }
    default:
      return state.raw
  }
}

function customState(rule: string): RecurrenceState {
  return { frequency: "custom", months: [], weekdays: [], monthDay: null, raw: rule }
}

/**
 * Parse an RRULE string into guided state. Falls back to "custom" (raw) whenever
 * the rule contains parts the guided UI cannot represent, so round-tripping never
 * silently drops data.
 */
export function parseRecurrence(rule: string): RecurrenceState {
  const trimmed = rule.trim()
  if (!trimmed) return customState(rule)

  const parts = parseRuleParts(trimmed)
  const freq = parts.get("FREQ")
  if (!freq) return customState(rule)

  const known = new Set(["FREQ"])

  if (freq === "YEARLY") {
    known.add("BYMONTH")
    if (![...parts.keys()].every((key) => known.has(key))) return customState(rule)
    const byMonth = parts.get("BYMONTH")
    if (byMonth === undefined) {
      return { frequency: "yearly", months: [], weekdays: [], monthDay: null, raw: trimmed }
    }
    const months = byMonth.split(",").map((value) => Number.parseInt(value.trim(), 10))
    if (months.some((month) => !Number.isInteger(month) || month < 1 || month > 12)) {
      return customState(rule)
    }
    return {
      frequency: "yearly",
      months: uniqueSorted(months),
      weekdays: [],
      monthDay: null,
      raw: trimmed,
    }
  }

  if (freq === "WEEKLY") {
    known.add("BYDAY")
    if (![...parts.keys()].every((key) => known.has(key))) return customState(rule)
    const byDay = parts.get("BYDAY")
    if (byDay === undefined) {
      return { frequency: "weekly", months: [], weekdays: [], monthDay: null, raw: trimmed }
    }
    const tokens = byDay.split(",").map((value) => value.trim().toUpperCase())
    if (tokens.some((token) => !WEEKDAY_TOKENS.has(token))) return customState(rule)
    const ordered = RECURRENCE_WEEKDAYS.filter((day) => tokens.includes(day.token)).map(
      (day) => day.token,
    )
    return { frequency: "weekly", months: [], weekdays: ordered, monthDay: null, raw: trimmed }
  }

  if (freq === "MONTHLY") {
    known.add("BYMONTHDAY")
    if (![...parts.keys()].every((key) => known.has(key))) return customState(rule)
    const byMonthDay = parts.get("BYMONTHDAY")
    if (byMonthDay === undefined) {
      return { frequency: "monthly", months: [], weekdays: [], monthDay: null, raw: trimmed }
    }
    const day = Number.parseInt(byMonthDay.trim(), 10)
    if (!Number.isInteger(day) || day < 1 || day > 31) return customState(rule)
    return { frequency: "monthly", months: [], weekdays: [], monthDay: day, raw: trimmed }
  }

  return customState(rule)
}

/** Display name for a 0-based month index, derived from Intl (no i18n keys needed). */
export function monthDisplayName(monthIndex: number, locale?: string): string {
  return new Intl.DateTimeFormat(locale, { month: "short" }).format(new Date(2020, monthIndex, 1))
}

/** Display name for a weekday token, derived from Intl (no i18n keys needed). */
export function weekdayDisplayName(dayIndex: number, locale?: string): string {
  // 2020-06-01 is a Monday; offset by the target day index (0 = Sunday).
  const base = new Date(2020, 5, 1 + ((dayIndex + 6) % 7))
  return new Intl.DateTimeFormat(locale, { weekday: "short" }).format(base)
}
