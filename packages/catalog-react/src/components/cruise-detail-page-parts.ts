import type { CatalogUiMessages } from "../i18n/messages.js"

export interface CruiseSailing {
  id: string | null
  sourceRef: string | null
  startDate: string | null
  endDate: string | null
  nights: number | null
  status: string | null
  embarkationPort: string | null
  disembarkationPort: string | null
  lowestPriceCents: number | null
  currency: string | null
}

export interface CruiseCabin {
  id: string
  /**
   * Provider cabin id (e.g. `omi_V`, `88-from-2027_CLASSIC`) — the join key
   * against a live pricing row's `code`. See `providerExternalIdFromCatalogId`.
   */
  externalId: string | null
  name: string
  type: string | null
  view: string | null
  squareFeet: string | null
  capacityMin: number | null
  capacityMax: number | null
  images: string[]
  inclusions: string[]
}

export interface CabinPrice {
  code: string
  fromAmountMinor: number
  available: boolean
}

export interface CruiseStop {
  dayNumber: number | null
  date: string | null
  portName: string | null
  arrivalTime: string | null
  departureTime: string | null
  isAtSea: boolean
  description: string | null
}

export interface CruiseDetail {
  name: string | null
  description: string | null
  cruiseType: string | null
  cruiseLine: string | null
  nights: number | null
  heroImageUrl: string | null
  highlights: string[]
  embarkationPort: string | null
  disembarkationPort: string | null
  ship: {
    name: string | null
    shipType: string | null
    description: string | null
    capacity: number | null
    decks: number | null
    yearBuilt: number | null
    gallery: string[]
  } | null
  sailings: CruiseSailing[]
  cabins: CruiseCabin[]
  itinerary: CruiseStop[]
}

export type SearchMessages = CatalogUiMessages["catalogBrowser"]["search"]

// ── Content mapping (Connect cruise content → render shape) ─────────────────
export function mapCruiseContent(content: unknown): CruiseDetail | null {
  const c = asRecord(content)
  const cruise = asRecord(c?.cruise)
  if (!cruise) return null
  const ship = asRecord(c?.ship)
  const sailingsRaw = Array.isArray(c?.sailings) ? c.sailings : []
  const cabinsRaw = Array.isArray(c?.cabin_categories) ? c.cabin_categories : []
  // The route is per-sailing; the cruise-level array is a representative copy
  // an adapter may leave empty. Fall back to the first sailing that has one so
  // the Itinerary section still renders, matching the operator-side mapper.
  const cruiseStopsRaw = Array.isArray(c?.itinerary_stops) ? c.itinerary_stops : []
  const stopsRaw =
    cruiseStopsRaw.length > 0 ? cruiseStopsRaw : firstSailingItineraryStops(sailingsRaw)
  return {
    name: asStr(cruise.name),
    description: asStr(cruise.description),
    cruiseType: asStr(cruise.cruise_type),
    cruiseLine: asStr(cruise.cruise_line),
    nights: asNum(cruise.duration_nights),
    heroImageUrl: asStr(cruise.hero_image_url),
    highlights: asStrArray(cruise.highlights),
    embarkationPort: asStr(cruise.embarkation_port),
    disembarkationPort: asStr(cruise.disembarkation_port),
    ship: ship
      ? {
          name: asStr(ship.name),
          shipType: asStr(ship.ship_type),
          description: asStr(ship.description),
          capacity: asNum(ship.capacity),
          decks: asNum(ship.decks),
          yearBuilt: asNum(ship.year_built),
          gallery: asStrArray(ship.gallery),
        }
      : null,
    sailings: sailingsRaw.map((row) => {
      const r = asRecord(row) ?? {}
      return {
        id: asStr(r.id),
        sourceRef: asStr(r.source_ref),
        startDate: asStr(r.start_date),
        endDate: asStr(r.end_date),
        nights: asNum(r.duration_nights),
        status: asStr(r.status),
        embarkationPort: asStr(r.embarkation_port),
        disembarkationPort: asStr(r.disembarkation_port),
        lowestPriceCents: asNum(r.lowest_price_cents),
        currency: asStr(r.currency),
      }
    }),
    cabins: cabinsRaw.map((row, i) => {
      const r = asRecord(row) ?? {}
      return {
        id: asStr(r.id) ?? `cabin-${i}`,
        externalId: providerExternalIdFromCatalogId(asStr(r.id)),
        // Pure mapper, no messages in scope; "Cabin" is a last-resort fallback for an unnamed upstream cabin, not chrome copy.
        // i18n-literal-ok
        name: asStr(r.name) ?? asStr(r.code) ?? "Cabin",
        type: asStr(r.type),
        view: asStr(r.view_type) ?? asStr(r.type),
        squareFeet: asStr(r.square_feet),
        capacityMin: asNum(r.capacity_min),
        capacityMax: asNum(r.capacity_max),
        images: asStrArray(r.images),
        inclusions: asStrArray(r.inclusions),
      }
    }),
    itinerary: stopsRaw.map((row) => {
      const r = asRecord(row) ?? {}
      return {
        dayNumber: asNum(r.day_number),
        date: asStr(r.date),
        portName: asStr(r.port_name),
        arrivalTime: asStr(r.arrival_time),
        departureTime: asStr(r.departure_time),
        isAtSea: r.is_at_sea === true,
        description: asStr(r.description),
      }
    }),
  }
}

function firstSailingItineraryStops(sailings: readonly unknown[]): unknown[] {
  for (const sailing of sailings) {
    const stops = asRecord(sailing)?.itinerary_stops
    if (Array.isArray(stops) && stops.length > 0) return stops
  }
  return []
}

export function formatCruiseType(type: string | null, s: SearchMessages): string | null {
  if (type === "river") return s.typeRiver
  if (type === "ocean") return s.typeOcean
  return type
}

export function formatMoney(m: { amountMinor: number; currency: string }, locale?: string): string {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: m.currency,
    maximumFractionDigits: 0,
  }).format(m.amountMinor / 100)
}

export function formatDay(iso: string | null, locale?: string): string {
  if (!iso) return ""
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return new Intl.DateTimeFormat(locale, {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(d)
}

/**
 * The provider id a catalog id stands for — the join key against a live pricing
 * row's `code`.
 *
 * A catalog id arrives in one of two shapes, and only one of them wraps
 * anything:
 *
 * - `<prefix>_sr_<base64url(JSON{externalId,…})>` — the SourceRef-wrapped id the
 *   catalog plane builds for a sourced entity; the provider id is inside it.
 * - a bare provider id (`88-from-2027_CLASSIC`) — what the cruise content
 *   adapter emits for a cabin category. It already *is* the provider id.
 *
 * Anything that does not decode is the second shape, matching
 * `sourceRefFromExternalKeyRef` in `@voyant-travel/cruises`: an unwrappable ref
 * is a raw external id, not an absent one. Returning `null` for the bare shape
 * instead left every cabin unjoinable, so the rate rows printed the raw
 * provider id where the cabin name belongs (#4766).
 */
export function providerExternalIdFromCatalogId(id: string | null): string | null {
  if (!id) return null
  const idx = id.indexOf("_sr_")
  if (idx < 0) return id
  try {
    const b64 = id
      .slice(idx + 4)
      .replace(/-/g, "+")
      .replace(/_/g, "/")
    const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4)
    const obj = JSON.parse(atob(padded)) as { externalId?: string }
    return typeof obj.externalId === "string" && obj.externalId.length > 0 ? obj.externalId : id
  } catch {
    return id
  }
}

/**
 * The catalog cabin a live pricing row describes. Named and exported so the
 * page's join is the one under test — the bug in #4766 was the join failing,
 * not the decode in isolation.
 */
export function findCabinForPrice(
  cabins: CruiseCabin[],
  price: CabinPrice,
): CruiseCabin | undefined {
  return cabins.find((c) => c.externalId === price.code)
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined
}
function asStr(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null
}
function asNum(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (typeof value === "string" && value.trim() !== "" && !Number.isNaN(Number(value))) {
    return Number(value)
  }
  return null
}
function asStrArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((v): v is string => typeof v === "string" && v.length > 0)
    : []
}
