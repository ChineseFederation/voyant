"use client"

/**
 * The airports this operator actually works with, remembered locally.
 *
 * An agency flies a handful of routes over and over, and the global airport
 * reference has no idea which. Recording what was searched is the cheapest
 * honest signal available: it needs no contract, no capability, and no server
 * round-trip, and it is right from the second search onward.
 *
 * Deliberately per-browser. This is a convenience ordering, not operator
 * configuration — nothing downstream may depend on it being present, and
 * losing it costs a user one extra keystroke.
 */

const STORAGE_KEY = "voyant.flights.recent-airports"
const MAX_REMEMBERED = 12

/**
 * One remembered airport. The display fields are stored alongside the code so
 * the group can render without a second reference lookup — a recent airport
 * that fell off the current result page must still appear.
 */
export interface RecentAirport {
  iataCode: string
  city: string
  name: string
  country: string
  /** Epoch millis of the last search, so ties break on recency. */
  lastUsedAt: number
  /**
   * Searches this airport has appeared in. Selection alone records the airport
   * at zero; only a submitted search counts as a use, so a code that was
   * picked and then thought better of never becomes "a route you fly".
   */
  uses: number
}

function readStore(): RecentAirport[] {
  if (typeof localStorage === "undefined") return []
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(isRecentAirport)
  } catch {
    // A corrupt or unreadable store is not worth a broken picker.
    return []
  }
}

function isRecentAirport(value: unknown): value is RecentAirport {
  if (typeof value !== "object" || value === null) return false
  const candidate = value as Partial<RecentAirport>
  return (
    typeof candidate.iataCode === "string" &&
    typeof candidate.city === "string" &&
    typeof candidate.name === "string" &&
    typeof candidate.country === "string" &&
    typeof candidate.lastUsedAt === "number" &&
    typeof candidate.uses === "number"
  )
}

function writeStore(entries: RecentAirport[]): void {
  const next = entries
    .sort((a, b) => b.uses - a.uses || b.lastUsedAt - a.lastUsedAt)
    .slice(0, MAX_REMEMBERED)
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch {
    // Storage full or blocked (private mode, strict cookie policy). The
    // picker still works; it just won't learn.
  }
}

/**
 * Airports actually searched, most useful first: frequency, then recency.
 * Airports only ever selected — never searched — are held but not returned.
 */
export function readRecentAirports(): RecentAirport[] {
  return readStore()
    .filter((entry) => entry.uses > 0)
    .sort((a, b) => b.uses - a.uses || b.lastUsedAt - a.lastUsedAt)
}

/** Cache an airport's display fields when it is picked. Does not count a use. */
export function noteAirportSelected(airport: {
  iataCode: string
  city: string
  name: string
  country: string
}): void {
  if (typeof localStorage === "undefined") return
  const entries = readStore()
  const existing = entries.find((entry) => entry.iataCode === airport.iataCode)
  if (existing) {
    existing.city = airport.city
    existing.name = airport.name
    existing.country = airport.country
    writeStore(entries)
    return
  }
  entries.push({ ...airport, lastUsedAt: Date.now(), uses: 0 })
  writeStore(entries)
}

/**
 * Count a submitted search against its airports. Codes with no cached display
 * fields are skipped rather than stored half-formed — they'll be picked up the
 * next time the airport is chosen from the picker.
 */
export function rememberSearchedAirports(codes: Array<string | null | undefined>): void {
  if (typeof localStorage === "undefined") return
  const entries = readStore()
  const now = Date.now()
  let touched = false

  for (const code of codes) {
    if (!code) continue
    const entry = entries.find((candidate) => candidate.iataCode === code)
    if (!entry) continue
    entry.uses += 1
    entry.lastUsedAt = now
    touched = true
  }

  if (touched) writeStore(entries)
}

/** Forget everything. Exposed for settings/reset surfaces and tests. */
export function clearRecentAirports(): void {
  if (typeof localStorage === "undefined") return
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    // Nothing to do — see above.
  }
}

/**
 * Narrow remembered airports to those matching the typeahead, using the same
 * fields the server matches on. Without this the group would keep offering
 * "your routes" while the user is plainly searching for something else.
 */
export function matchRecentAirports(entries: RecentAirport[], query: string): RecentAirport[] {
  const needle = query.trim().toLowerCase()
  if (!needle) return entries
  return entries.filter((entry) =>
    [entry.iataCode, entry.city, entry.name].some((field) => field.toLowerCase().includes(needle)),
  )
}
