/**
 * Cruise content synthesizer — fallback for thin adapters that declare
 * `supportsContentFetch: false`.
 *
 * Produces the most complete `CruiseContent` blob we can legitimately
 * synthesize from the durable sourced-entry projection + locale-aware
 * overlays + plane-level provenance. Fields the projection doesn't
 * carry render as typed empty states (`sailings: []`,
 * `cabin_categories: []`).
 *
 * Per §3.6: never invents plausible-but-unverified fields, never
 * machine-translates, never mines snapshots, never caches its own
 * output.
 */

import {
  fetchOverlaysForEntity,
  mergeOverlaysIntoContent,
  type ProvenanceReadResult,
} from "@voyant-travel/catalog"
import type { AnyDrizzleDb } from "@voyant-travel/db"

import {
  CRUISES_CONTENT_SCHEMA_VERSION,
  type CruiseContent,
  cruiseContentSchema,
} from "./content-shape.js"

export interface SynthesizeCruiseContentOptions {
  provenance: Extract<ProvenanceReadResult, { kind: "sourced" }>
  overlays?: ReadonlyArray<{ field_path: string; value: unknown }>
}

export interface SynthesizedCruiseContent {
  content: CruiseContent
  content_schema_version: string
  served_locale: string
  source_kind: string
  source_provider?: string
}

export function synthesizeCruiseContent(
  scope: { locale: string },
  options: SynthesizeCruiseContentOptions,
): SynthesizedCruiseContent {
  const projection = options.provenance.projection
  const cruise = pickCruiseSummary(projection, options.provenance)
  const ship = pickShip(projection)
  const itinerary = pickItineraryStops(projection)
  const policies = pickPolicies(projection)

  const baseContent: CruiseContent = {
    cruise,
    ship,
    sailings: [],
    cabin_categories: [],
    itinerary_stops: itinerary,
    policies,
  }

  let merged = baseContent
  if (options.overlays && options.overlays.length > 0) {
    const result = mergeOverlaysIntoContent(baseContent, options.overlays, {
      validate(p) {
        const r = cruiseContentSchema.safeParse(p)
        return r.success
          ? { valid: true }
          : { valid: false, reason: r.error.issues[0]?.message ?? "invalid" }
      },
    })
    merged = cruiseContentSchema.parse(result)
  }

  return {
    content: merged,
    content_schema_version: CRUISES_CONTENT_SCHEMA_VERSION,
    served_locale: scope.locale,
    source_kind: options.provenance.provenance.source_kind,
    source_provider: options.provenance.provenance.source_provider,
  }
}

export async function synthesizeCruiseContentFromDb(
  db: AnyDrizzleDb,
  scope: { locale: string },
  provenance: Extract<ProvenanceReadResult, { kind: "sourced" }>,
): Promise<SynthesizedCruiseContent> {
  const entityId = entityIdFromProvenance(provenance)
  const overlays = await fetchOverlaysForEntity(db, "cruises", entityId)
  return synthesizeCruiseContent(scope, {
    provenance,
    overlays: overlays.map((o) => ({ field_path: o.field_path, value: o.value })),
  })
}

function entityIdFromProvenance(
  provenance: Extract<ProvenanceReadResult, { kind: "sourced" }>,
): string {
  const fromProjection = provenance.projection.id
  if (typeof fromProjection === "string" && fromProjection.length > 0) {
    return fromProjection
  }
  return provenance.entry_id
}

/**
 * Read the first non-empty string among `keys`.
 *
 * The catalog projection a cruise sourced-entry carries is written by
 * `toCatalogProjection` in the source-adapter shim, whose keys are **camelCase**
 * — they have to match the cruise field policy so the indexer doesn't drop them
 * (#1466). This synthesizer originally read the snake_case names of the content
 * shape it produces, which overlapped the projection on `id`/`name`/`status`
 * and nothing else, so every synthesized cruise rendered blank. Read the
 * projection's own spelling first and keep the snake_case names as a fallback
 * for adapters that project the content shape directly.
 */
function firstString(projection: Record<string, unknown>, ...keys: string[]): string | null {
  for (const key of keys) {
    const value = stringOr(projection[key], null)
    if (value !== null) return value
  }
  return null
}

function firstNumber(projection: Record<string, unknown>, ...keys: string[]): number | null {
  for (const key of keys) {
    const value = numberOr(projection[key], null)
    if (value !== null) return value
  }
  return null
}

function pickCruiseSummary(
  projection: Record<string, unknown>,
  provenance: Extract<ProvenanceReadResult, { kind: "sourced" }>,
): CruiseContent["cruise"] {
  return {
    id: stringOr(projection.id, "") || provenance.entry_id,
    name: stringOr(projection.name, "") || stringOr(projection.title, "") || "Unnamed cruise",
    status: stringOr(projection.status, undefined),
    description: firstString(projection, "description"),
    cruise_type: firstString(projection, "cruiseType", "cruise_type"),
    hero_image_url: firstString(projection, "heroImageUrl", "hero_image_url", "thumbnailUrl"),
    highlights: stringArrayOr(projection.highlights, []),
    cruise_line:
      firstString(projection, "lineName", "cruise_line", "line_name") ??
      displayableSourceProvider(provenance),
    duration_nights: firstNumber(projection, "nights", "duration_nights"),
    embarkation_port: firstString(projection, "embarkPortName", "embarkation_port"),
    disembarkation_port: firstString(projection, "disembarkPortName", "disembarkation_port"),
  }
}

/**
 * The provider key is a reasonable last-resort cruise line label, but only when
 * it is actually a provider key. `toCatalogProjection` used to fall back to the
 * connection id when it couldn't read one, which surfaced a raw
 * `conn_…` string as the cruise line on the detail page. Rows written before
 * that fix still carry it, so drop the fallback when it is just the connection
 * id restated.
 */
function displayableSourceProvider(
  provenance: Extract<ProvenanceReadResult, { kind: "sourced" }>,
): string | null {
  const provider = provenance.provenance.source_provider
  if (!provider) return null
  return provider === provenance.provenance.source_connection_id ? null : provider
}

function pickShip(projection: Record<string, unknown>): CruiseContent["ship"] {
  const shipName = firstString(projection, "shipName", "ship_name", "ship")
  if (!shipName) return null
  return {
    name: shipName,
    description: firstString(projection, "shipDescription", "ship_description"),
    deck_plan_url: firstString(projection, "shipDeckPlanUrl", "ship_deck_plan_url"),
    deck_plans: [],
    capacity: firstNumber(projection, "shipCapacity", "ship_capacity"),
    decks: firstNumber(projection, "shipDecks", "ship_decks"),
    gallery: [],
  }
}

function pickItineraryStops(projection: Record<string, unknown>): CruiseContent["itinerary_stops"] {
  const stops = projection.itinerary
  if (!Array.isArray(stops)) return []
  const result: CruiseContent["itinerary_stops"] = []
  for (const item of stops) {
    if (!item || typeof item !== "object") continue
    const obj = item as Record<string, unknown>
    const portName = stringOr(obj.port_name, null) ?? stringOr(obj.port, null)
    const dayNumber = numberOr(obj.day_number, null) ?? numberOr(obj.day, null)
    if (!portName || dayNumber === null || dayNumber <= 0) continue
    result.push({
      day_number: dayNumber,
      date: stringOr(obj.date, null),
      port_name: portName,
      arrival_time: stringOr(obj.arrival_time, null),
      departure_time: stringOr(obj.departure_time, null),
      description: stringOr(obj.description, null),
      is_at_sea: typeof obj.is_at_sea === "boolean" ? obj.is_at_sea : false,
    })
  }
  return result
}

function pickPolicies(projection: Record<string, unknown>): CruiseContent["policies"] {
  const out: CruiseContent["policies"] = []
  const cancel = stringOr(projection.cancellation_policy, null)
  if (cancel) out.push({ kind: "cancellation", body: cancel })
  const payment = stringOr(projection.payment_terms, null)
  if (payment) out.push({ kind: "payment", body: payment })
  return out
}

function stringOr<T>(value: unknown, fallback: T): string | T {
  return typeof value === "string" && value.length > 0 ? value : fallback
}

function numberOr<T>(value: unknown, fallback: T): number | T {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback
}

function stringArrayOr(value: unknown, fallback: string[]): string[] {
  if (!Array.isArray(value)) return fallback
  const out = value.filter((v): v is string => typeof v === "string")
  return out.length > 0 ? out : fallback
}
