import type { ShipRecord } from "../schemas.js"

/**
 * Ship presentation helpers, kept free of React so the browse page, the
 * detail page and their tests all agree on one reading of a row.
 */

export interface ShipSpecMessages {
  guests: string
  crew: string
  cabins: string
  decks: string
  length: string
  speed: string
  built: string
  refurbished: string
  imo: string
}

export interface ShipSpec {
  key: keyof ShipSpecMessages
  label: string
  value: string
}

/**
 * The specs worth printing for a ship, in a fixed order, with the ones the
 * record does not carry dropped entirely.
 *
 * A ship row is sparse in practice — a sourced vessel often arrives with a
 * name, a type and nothing else — so rendering every field regardless would
 * fill the page with "—" and bury the two facts that did come through. An
 * absent spec is not displayed at all.
 */
export function shipSpecs(ship: ShipRecord, messages: ShipSpecMessages): ShipSpec[] {
  const specs: Array<[keyof ShipSpecMessages, string | null]> = [
    ["guests", formatCount(ship.capacityGuests)],
    ["crew", formatCount(ship.capacityCrew)],
    ["cabins", formatCount(ship.cabinCount)],
    ["decks", formatCount(ship.deckCount)],
    ["length", formatMeasure(ship.lengthMeters, "m")],
    ["speed", formatMeasure(ship.cruisingSpeedKnots, "kn")],
    ["built", formatYear(ship.yearBuilt)],
    ["refurbished", formatYear(ship.yearRefurbished)],
    ["imo", ship.imo?.trim() || null],
  ]
  return specs
    .filter((entry): entry is [keyof ShipSpecMessages, string] => entry[1] != null)
    .map(([key, value]) => ({ key, label: messages[key], value }))
}

function formatCount(value: number | null): string | null {
  // 0 guests is not a capacity, it is an unfilled column.
  return value != null && value > 0 ? String(value) : null
}

function formatYear(value: number | null): string | null {
  return value != null && value > 0 ? String(value) : null
}

/**
 * `numeric` columns arrive as strings to keep their precision. Trailing zeros
 * from the column's scale (`294.00`) are noise in a spec list, so they are
 * dropped without touching significant digits.
 */
function formatMeasure(value: string | null, unit: string): string | null {
  if (!value) return null
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed <= 0) return null
  return `${parsed} ${unit}`
}

/**
 * A ship's one-line summary: its type, then whichever of guests and decks the
 * record actually carries.
 */
export function shipSummary(
  ship: ShipRecord,
  messages: { types: Record<string, string>; guestsShort: string; decksShort: string },
): string {
  const parts = [messages.types[ship.shipType] ?? ship.shipType]
  if (ship.capacityGuests != null && ship.capacityGuests > 0) {
    parts.push(messages.guestsShort.replace("{count}", String(ship.capacityGuests)))
  }
  if (ship.deckCount != null && ship.deckCount > 0) {
    parts.push(messages.decksShort.replace("{count}", String(ship.deckCount)))
  }
  return parts.join(" · ")
}

/** First gallery image, when the row carries a usable one. */
export function shipCoverImage(ship: ShipRecord): string | null {
  const first = ship.gallery?.find((url) => typeof url === "string" && url.trim().length > 0)
  return first ?? null
}
