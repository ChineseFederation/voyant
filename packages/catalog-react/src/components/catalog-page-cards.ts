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
    footerNote: (fields) => departureNote(fields, messages, locale),
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
  return messages.card.daysNights
    .replace("{days}", String(days))
    .replace("{nights}", String(nights))
}

function nightsMeta(fields: Record<string, unknown>, messages: CatalogPageMessages): string | null {
  const nights = asNumber(fields.nights)
  if (nights == null || nights < 1) return null
  return messages.card.nights.replace("{nights}", String(nights))
}

function departureNote(
  fields: Record<string, unknown>,
  messages: CatalogPageMessages,
  locale: string,
  opts: { dateField?: string; countField?: string; withYear?: boolean } = {},
): string | null {
  const next = asString(fields[opts.dateField ?? "nextDepartureDate"])
  const count = asNumber(fields[opts.countField ?? "availableDeparturesCount"])
  const parts: string[] = []
  if (next)
    parts.push(
      messages.card.nextDeparture.replace("{date}", formatShortDate(next, locale, opts.withYear)),
    )
  if (count != null && count > 0) {
    parts.push(
      count === 1
        ? messages.card.oneDeparture
        : messages.card.departures.replace("{count}", String(count)),
    )
  }
  return parts.length > 0 ? parts.join(" · ") : null
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

function formatShortDate(iso: string, locale: string, withYear = false): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short",
    ...(withYear ? { year: "numeric" } : {}),
  }).format(date)
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
