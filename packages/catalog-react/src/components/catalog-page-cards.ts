import type { CatalogCardConfig } from "./catalog-card.js"
import { asNumber, asString, asStringArray } from "./catalog-hit.js"
import type { CatalogPageMessages } from "./catalog-page-config.js"

// Card configs ─────────────────────────────────────────────────────────────
// Each vertical's merchandising card is a declarative projection of indexed
// fields (no extra fetch). The grid view renders `CatalogCard` from these.

export function makeProductCard(
  formatSupplier: (id: string | number) => string,
  messages: CatalogPageMessages,
  locale: string,
): CatalogCardConfig {
  return {
    imageField: "thumbnailUrl",
    // Prefer the computed lowest price; fall back to the headline sell price.
    priceAmountField: ["priceFromAmountCents", "priceFromAmountMinor", "sellAmountCents"],
    priceCurrencyField: ["priceFromCurrency", "sellCurrency"],
    subtitle: (fields) => productSubtitle(fields, locale),
    meta: (fields) => durationMeta(fields, messages),
    footerNote: (fields) =>
      departureNote(fields, messages, locale, {
        instantField: "nextDepartureAt",
        dateField: "nextDepartureDate",
      }),
    footerNoteTooltip: (fields) =>
      departureNoteTooltip(fields, messages, locale, { instantField: "nextDepartureAt" }),
    // Transport + board basis lead the chips, then categories/themes.
    chips: (fields) =>
      [
        asString(fields.familyName) ?? asString(fields.familyCode),
        humanizeCode(asString(fields.subtypeCode)),
        formatTransport(asString(fields.transport), messages),
        formatBoard(asString(fields.board), messages),
        ...asStringArray(fields.categories),
      ]
        .filter((v): v is string => Boolean(v))
        .slice(0, 3),
    badges: (fields) => supplierBadge(fields, "supplierId", formatSupplier),
  }
}

/** Product card subtitle: star rating + location (e.g. "4.5★ · Belek · Turkey"). */
function productSubtitle(fields: Record<string, unknown>, locale: string): string | null {
  const parts = [formatStars(fields.stars), locationSubtitle(fields, locale)].filter(
    (v): v is string => Boolean(v),
  )
  return parts.length > 0 ? parts.join(" · ") : null
}

/** Resolve a board code (AI/HB/BB/RO/FB) to a localized, readable label. */
export function formatBoard(value: string | null, messages: CatalogPageMessages): string | null {
  if (!value) return null
  const code = value.toUpperCase()
  return (messages.boards as Record<string, string>)[code] ?? value
}

/** Resolve a transport code ("flight") to a readable label. */
export function formatTransport(
  value: string | null,
  messages: CatalogPageMessages,
): string | null {
  if (!value) return null
  return value === "flight" ? messages.card.flightIncluded : value
}

function humanizeCode(value: string | null): string | null {
  if (!value) return null
  return value
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ")
}

/** Format a (possibly fractional) star rating as e.g. "4.5★". */
export function formatStars(value: unknown): string | null {
  const n = asNumber(value)
  if (n == null || n <= 0) return null
  return `${Number.isInteger(n) ? n : n.toFixed(1)}★`
}

export function makeCruiseCard(
  formatSupplier: (id: string | number) => string,
  messages: CatalogPageMessages,
  locale: string,
): CatalogCardConfig {
  return {
    // Newly indexed cruise docs declare `lowestPriceUnit: "minor"`; legacy
    // docs without that field stored `lowestPriceCached` as major units.
    imageField: "thumbnailUrl",
    priceAmountField: "lowestPriceCached",
    priceCurrencyField: "lowestPriceCurrencyCached",
    priceUnit: "major",
    priceUnitField: "lowestPriceUnit",
    subtitle: (fields) => locationSubtitle(fields, locale),
    meta: (fields) => nightsMeta(fields, messages),
    // Next departure + how many sailings — sourced from the per-cruise sailing
    // rollup (`earliestDepartureCached` / `departureCount`).
    footerNote: (fields) =>
      departureNote(fields, messages, locale, {
        dateField: "earliestDepartureCached",
        countField: "departureCount",
        withYear: true,
      }),
    chips: (fields) =>
      [...asStringArray(fields.themes), ...asStringArray(fields.regions)].slice(0, 3),
    badges: (fields) => supplierBadge(fields, "lineSupplierId", formatSupplier),
  }
}

export function makeCharterCard(
  formatSupplier: (id: string | number) => string,
  locale: string,
): CatalogCardConfig {
  return {
    imageField: "heroImageUrl",
    priceAmountField: "lowestPriceCachedAmount",
    priceCurrencyField: "lowestPriceCachedCurrency",
    subtitle: (fields) => locationSubtitle(fields, locale),
    chips: (fields) =>
      [...asStringArray(fields.themes), ...asStringArray(fields.regions)].slice(0, 3),
    badges: (fields) => supplierBadge(fields, "lineSupplierId", formatSupplier),
  }
}

export function makeAccommodationCard(
  formatSupplier: (id: string | number) => string,
  _locale: string,
): CatalogCardConfig {
  return {
    imageField: "thumbnailUrl",
    subtitle: (fields) => asString(fields.roomClass),
    badges: (fields) => supplierBadge(fields, "supplierId", formatSupplier),
  }
}

function locationSubtitle(fields: Record<string, unknown>, locale: string): string | null {
  const cities = asStringArray(fields.cities)
  const regions = asStringArray(fields.regions)
  const countries = asStringArray(fields.countries)
  // Owned products carry resolved destination labels (cities/regions/countries);
  // sourced rows carry raw `destinations` + ISO `countryCodes` from the upstream
  // search document, so fall back to those and resolve the code to a name.
  const place = cities[0] ?? regions[0] ?? asStringArray(fields.destinations)[0] ?? null
  const country =
    countries[0] ??
    asStringArray(fields.countryCodes).map((code) => formatCountry(code, locale))[0] ??
    null
  const parts = [...new Set([place, country].filter((v): v is string => Boolean(v)))]
  return parts.length > 0 ? parts.join(" · ") : null
}

/** Resolve an ISO 3166 alpha-2 country code to a localized name (e.g. TR → Turkey). */
export function formatCountry(value: string | number, locale: string): string {
  const code = String(value)
  if (!/^[A-Za-z]{2}$/.test(code)) return code
  try {
    return new Intl.DisplayNames(locale, { type: "region" }).of(code.toUpperCase()) ?? code
  } catch {
    return code
  }
}

export function durationMeta(
  fields: Record<string, unknown>,
  messages: CatalogPageMessages,
): string | null {
  const minutes = asNumber(fields.durationMinutes)
  if (minutes != null) {
    return messages.card.minutes.replace("{minutes}", String(minutes))
  }
  const days = asNumber(fields.durationDays)
  if (days == null || days < 1) return null
  const nights = Math.max(0, days - 1)
  // A single-day product has no nights, and "1d / 0n" reads as a missing value
  // rather than as "no overnight". Only span the nights when there are some.
  if (nights === 0) return messages.card.days.replace("{days}", String(days))
  return messages.card.daysNights
    .replace("{days}", String(days))
    .replace("{nights}", String(nights))
}

function nightsMeta(fields: Record<string, unknown>, messages: CatalogPageMessages): string | null {
  const nights = asNumber(fields.nights)
  if (nights == null || nights < 1) return null
  return messages.card.nights.replace("{nights}", String(nights))
}

/**
 * The operator-facing noun for one entry on a product's schedule. Resolved
 * once, upstream, from the product's duration (`resolveScheduleTerm` in
 * `@voyant-travel/inventory`) and carried on the catalog document, so the card
 * agrees with every other surface instead of calling everything a departure.
 *
 * "6 departures" is right for a Tour and wrong for a timed Activity or a
 * one-night Event — a gig has dates, a sixty-minute sail has sessions.
 */
type ScheduleTerm = "session" | "occurrence" | "departure"

function resolveScheduleTerm(fields: Record<string, unknown>): ScheduleTerm {
  const raw = asString(fields.scheduleTerm)
  return raw === "session" || raw === "occurrence" ? raw : "departure"
}

function scheduleCountLabel(
  term: ScheduleTerm,
  count: number,
  messages: CatalogPageMessages,
): string {
  const card = messages.card
  const one = { session: card.oneSession, occurrence: card.oneDate, departure: card.oneDeparture }
  const many = { session: card.sessions, occurrence: card.dates, departure: card.departures }
  return count === 1 ? one[term] : many[term].replace("{count}", String(count))
}

/**
 * Which document field carries the next departure, in which frame.
 *
 * Catalog documents name the frame in the field's suffix (#4116) and never mix
 * them: `…At` is an ISO instant, `…Date` is a bare `YYYY-MM-DD` in
 * `departureTimezone`. A card must therefore ask for the instant by name — it
 * cannot sniff the frame off one field, because the `…Date` field is bare in
 * every document and would report "no time of day" for a timed product that
 * has one.
 *
 * Cruises project only a bare `earliestDepartureCached` (a `date` column), so
 * they pass no `instantField` and correctly get no time and no tooltip.
 */
interface DepartureFields {
  /** Field carrying an ISO instant, when the vertical projects one. */
  instantField?: string
  /** Field carrying a bare local calendar date. */
  dateField?: string
  countField?: string
  withYear?: boolean
}

/** The next departure as an instant, or null when the document has only a date. */
function departureInstant(
  fields: Record<string, unknown>,
  opts: DepartureFields,
): { iso: string; date: Date } | null {
  if (!opts.instantField) return null
  const raw = asString(fields[opts.instantField])
  // A bare date sitting in an `…At` field is a malformed document, not an
  // instant to invent midnight for.
  if (!raw || isBareCalendarDate(raw)) return null
  const date = new Date(raw)
  return Number.isNaN(date.getTime()) ? null : { iso: raw, date }
}

function departureNote(
  fields: Record<string, unknown>,
  messages: CatalogPageMessages,
  locale: string,
  opts: DepartureFields = {},
): string | null {
  const instant = departureInstant(fields, opts)
  const next = instant?.iso ?? asString(fields[opts.dateField ?? "nextDepartureDate"])
  const count = asNumber(fields[opts.countField ?? "availableDeparturesCount"])
  // The frame the document declares its local dates in; only consulted when
  // the resolved field is an instant rather than a bare calendar date.
  const timeZone = asString(fields.departureTimezone)
  const parts: string[] = []
  if (next)
    parts.push(
      messages.card.nextDeparture.replace(
        "{date}",
        formatShortDate(next, locale, opts.withYear, timeZone, instant != null),
      ),
    )
  if (count != null && count > 0) {
    parts.push(scheduleCountLabel(resolveScheduleTerm(fields), count, messages))
  }
  return parts.length > 0 ? parts.join(" · ") : null
}

/**
 * Hover text for the footer note's date — the same instant in the departure's
 * own zone and in the reader's.
 *
 * Only an instant has a time of day to disagree about. A bare `YYYY-MM-DD` is a
 * calendar date in the departure's zone with no clock reading, so there is
 * nothing to convert and no tooltip is offered rather than inventing a midnight.
 */
function departureNoteTooltip(
  fields: Record<string, unknown>,
  messages: CatalogPageMessages,
  locale: string,
  opts: DepartureFields = {},
): string | null {
  const instant = departureInstant(fields, opts)
  if (!instant) return null
  const { date } = instant
  const venueZone = asString(fields.departureTimezone)
  const viewerZone = resolveViewerTimeZone(locale)
  // Nothing to compare against: the document declares no zone, so the card
  // already showed the only reading there is.
  if (!venueZone) return null
  const there = formatZonedDateTime(date, locale, venueZone)
  const yours = formatZonedDateTime(date, locale, viewerZone)
  // The reader is in the departure's zone (or one that keeps the same clock),
  // so the two frames agree and printing both says nothing twice.
  if (there === yours) return null
  return [
    messages.card.timeThere.replace("{time}", there).replace("{zone}", venueZone),
    messages.card.timeYours.replace("{time}", yours).replace("{zone}", viewerZone),
  ].join("\n")
}

function isBareCalendarDate(iso: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(iso)
}

/**
 * The reader's own zone, as the runtime reports it.
 *
 * `resolvedOptions().timeZone` is a property of the environment, not of the
 * locale, so the locale here does not change the answer — it is passed because
 * a bare `Intl.DateTimeFormat()` inherits whatever ambient locale the process
 * happens to have, and this repo does not allow that anywhere (see
 * `check-ui-hardcoded-strings`). Binding it explicitly keeps the one rule with
 * no exceptions to argue about.
 */
function resolveViewerTimeZone(locale: string): string {
  try {
    return new Intl.DateTimeFormat(locale).resolvedOptions().timeZone || "UTC"
  } catch {
    return "UTC"
  }
}

function formatZonedDateTime(date: Date, locale: string, timeZone: string): string {
  const options: Intl.DateTimeFormatOptions = {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }
  try {
    return new Intl.DateTimeFormat(locale, { ...options, timeZone }).format(date)
  } catch {
    return new Intl.DateTimeFormat(locale, { ...options, timeZone: "UTC" }).format(date)
  }
}

function supplierBadge(
  fields: Record<string, unknown>,
  supplierField: string,
  formatSupplier: (id: string | number) => string,
): { label: string; variant?: "default" | "secondary" | "outline" }[] {
  const id = asString(fields[supplierField])
  if (!id) return []
  // The supplier (e.g. "TUI") is the merchandising signal operators care
  // about — more than the sourcing channel (Voyant Connect), which stays a
  // filter facet + a detail-sheet attribute.
  return [{ label: formatSupplier(id), variant: "secondary" }]
}

/**
 * Format a departure date without moving it to another calendar day.
 *
 * Catalog documents carry two frames (#4116): bare `YYYY-MM-DD` calendar
 * dates in the departure's own zone, and ISO instants. `new Date(...)`
 * reads a bare date as UTC midnight, so formatting it in the *viewer's*
 * zone renders a 26 September departure as the 25th for anyone west of
 * UTC. Bare dates are therefore formatted in UTC — round-tripping the
 * same calendar day — and instants in the departure's zone when the
 * document declares one.
 *
 * An instant also carries a time of day, and for a timed product that time is
 * the distinguishing fact — a 09:00 and an 18:00 sailing are different
 * departures. It is shown; a bare date has no clock reading to show.
 *
 * Which frame this is comes from **which field the value was read out of**, not
 * from the shape of the string. Sniffing would mean a malformed document — an
 * instant sitting in a `…Date` field — silently gets a time of day the frame
 * does not promise, in a zone nobody declared.
 */
function formatShortDate(
  iso: string,
  locale: string,
  withYear = false,
  timeZone?: string | null,
  isInstant = false,
): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  const resolvedZone = isInstant ? (timeZone ?? "UTC") : "UTC"
  const options: Intl.DateTimeFormatOptions = {
    day: "numeric",
    month: "short",
    ...(withYear ? { year: "numeric" } : {}),
    ...(isInstant ? { hour: "2-digit", minute: "2-digit" } : {}),
  }
  try {
    return new Intl.DateTimeFormat(locale, { ...options, timeZone: resolvedZone }).format(date)
  } catch {
    // A document carrying an unparseable zone still renders — in UTC, the
    // frame every other field in the document already agrees on.
    return new Intl.DateTimeFormat(locale, { ...options, timeZone: "UTC" }).format(date)
  }
}

/**
 * Render a `YYYY-MM` departure-month facet value as a localized "Mon YYYY"
 * label (e.g. `2027-03` → "Mar 2027"). Falls back to the raw value when it
 * isn't a parseable month key.
 */
export function formatDepartureMonth(value: unknown, locale: string): string {
  const raw = String(value)
  const match = /^(\d{4})-(\d{2})$/.exec(raw)
  if (!match) return raw
  const date = new Date(Number(match[1]), Number(match[2]) - 1, 1)
  if (Number.isNaN(date.getTime())) return raw
  return new Intl.DateTimeFormat(locale, { month: "short", year: "numeric" }).format(date)
}
