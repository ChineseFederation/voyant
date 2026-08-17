import type { CatalogDetailEnrichment, CatalogSlotAvailability } from "./catalog-enrichment.js"

export interface ContentResponseEnvelope {
  data: {
    content: SourcedContentPayload
    provenance?: ContentProvenancePayload
    served_locale: string
    match_kind: "exact" | "language_match" | "fallback_chain" | "any"
    source: "sourced-cache" | "sourced-fresh" | "synthesized" | "owned"
    served_stale: boolean
    synthesized: boolean
    machine_translated: boolean
  }
}

interface ContentProvenancePayload {
  source_kind: string
  source_provider?: string | null
  source_connection_id?: string | null
  source_ref?: string | null
}

type SourcedContentPayload =
  | ProductContentPayload
  | CruiseContentPayload
  | AccommodationContentPayload

interface ProductContentPayload {
  product: {
    id: string
    name: string
    description?: string | null
    highlights?: string[]
    hero_image_url?: string | null
    duration_days?: number | null
    sell_currency?: string | null
    supplier?: string | null
    country?: string | null
  }
  options: Array<{ id: string; name: string; description?: string | null }>
  days: Array<{
    day_number: number
    title?: string | null
    description?: string | null
    location?: string | null
    hero_image_url?: string | null
  }>
  media: Array<{ url: string; type: string; caption?: string | null }>
  policies: Array<{ kind: string; body: string }>
  departures?: Array<{
    id: string
    starts_at: string
    ends_at?: string | null
    status?: string | null
    capacity?: number | null
    remaining?: number | null
    lowest_price_cents?: number | null
    currency?: string | null
    note?: string | null
  }>
}

interface CruiseContentPayload {
  cruise: {
    id: string
    name: string
    description?: string | null
    highlights?: string[]
    hero_image_url?: string | null
    cruise_line?: string | null
  }
  ship?: {
    id?: string | null
    name: string
    ship_type?: string | null
    description?: string | null
    deck_plan_url?: string | null
    deck_plans?: Array<{
      name: string
      level?: number | null
      image_url?: string | null
    }>
    capacity?: number | null
    decks?: number | null
    year_built?: number | null
    gallery?: string[]
  } | null
  sailings?: Array<{
    id: string
    source_ref?: string | null
    start_date: string
    end_date: string
    duration_nights?: number | null
    status?: string | null
    embarkation_port?: string | null
    disembarkation_port?: string | null
    itinerary_stops?: CruiseItineraryStopPayload[]
    lowest_price_cents: number | null
    currency: string | null
  }>
  cabin_categories?: Array<{
    id: string
    code?: string | null
    name: string
    description?: string | null
    type?: string | null
    images?: string[]
    floorplan_images?: string[]
    square_feet?: string | null
    grade_codes?: string[]
    wheelchair_accessible?: boolean
    capacity_max?: number | null
    inclusions?: string[]
  }>
  itinerary_stops?: CruiseItineraryStopPayload[]
  policies: Array<{ kind: string; body: string }>
}

interface AccommodationContentPayload {
  hotel: {
    id: string
    name: string
    description?: string | null
    star_rating?: number | null
    hero_image_url?: string | null
    highlights?: string[]
    brand?: string | null
    city?: string | null
    country?: string | null
  }
  room_types?: Array<{
    id: string
    code?: string | null
    name: string
    description?: string | null
    room_class?: string | null
    view?: string | null
    size_sqm?: number | null
    max_occupancy?: number | null
    amenities?: string[]
    images?: string[]
  }>
  amenities?: Array<{ id: string; category?: string | null; name: string }>
  policies?: Array<{ kind: string; body: string }>
}

interface CruiseItineraryStopPayload {
  day_number: number
  port_name: string
  description?: string | null
  date?: string | null
  arrival_time?: string | null
  departure_time?: string | null
  is_at_sea?: boolean | null
}

export function mapContentToEnrichment(
  payload: ContentResponseEnvelope,
  availability: Map<string, CatalogSlotAvailability>,
  formatSupplier?: (id: string) => string,
): CatalogDetailEnrichment {
  const {
    content,
    served_locale,
    match_kind,
    source,
    served_stale,
    synthesized,
    machine_translated,
    provenance,
  } = payload.data
  const base = isCruiseContent(content)
    ? mapCruiseContentToEnrichment(content)
    : isAccommodationContent(content)
      ? mapAccommodationContentToEnrichment(content)
      : mapProductContentToEnrichment(content, availability, formatSupplier)

  return {
    ...base,
    servedLocale: served_locale,
    matchKind: match_kind,
    source,
    sourceKind: provenance?.source_kind,
    sourceProvider: provenance?.source_provider ?? undefined,
    sourceConnectionId: provenance?.source_connection_id ?? undefined,
    sourceRef: provenance?.source_ref ?? undefined,
    servedStale: served_stale,
    synthesized,
    machineTranslated: machine_translated,
  }
}

function isCruiseContent(content: SourcedContentPayload): content is CruiseContentPayload {
  return "cruise" in content
}

function isAccommodationContent(
  content: SourcedContentPayload,
): content is AccommodationContentPayload {
  return "hotel" in content
}

function mapAccommodationContentToEnrichment(
  content: AccommodationContentPayload,
): CatalogDetailEnrichment {
  const rooms = content.room_types ?? []
  return {
    name: content.hotel.name ?? null,
    description: content.hotel.description ?? null,
    highlights: content.hotel.highlights ?? [],
    heroImageUrl: content.hotel.hero_image_url ?? null,
    supplier: content.hotel.brand ?? null,
    options: rooms.map((r) => ({
      id: r.id,
      name: r.name,
      description: r.description ?? null,
      images: r.images ?? [],
      squareFeet: r.size_sqm != null ? String(r.size_sqm) : null,
      capacityMax: r.max_occupancy ?? null,
      amenities: r.amenities ?? [],
    })),
    media: rooms.flatMap((r) =>
      (r.images ?? []).map((url) => ({ url, type: "image", caption: r.name })),
    ),
    policies: (content.policies ?? []).map((p) => ({ kind: p.kind, body: p.body })),
  }
}

function mapProductContentToEnrichment(
  content: ProductContentPayload,
  availability: Map<string, CatalogSlotAvailability>,
  formatSupplier?: (id: string) => string,
): CatalogDetailEnrichment {
  const supplierName =
    typeof content.product.supplier === "string"
      ? formatSupplier
        ? formatSupplier(content.product.supplier)
        : content.product.supplier
      : (content.product.supplier ?? null)

  return {
    name: content.product.name ?? null,
    description: content.product.description ?? null,
    highlights: content.product.highlights ?? [],
    heroImageUrl: content.product.hero_image_url ?? null,
    supplier: supplierName,
    itinerary: content.days.map((d) => ({
      dayNumber: d.day_number,
      title: d.title ?? null,
      description: d.description ?? null,
      location: d.location ?? null,
      heroImageUrl: d.hero_image_url ?? null,
    })),
    media: content.media.map((m) => ({
      url: m.url,
      type: m.type,
      caption: m.caption ?? null,
    })),
    options: content.options.map((o) => ({
      id: o.id,
      name: o.name,
      description: o.description ?? null,
    })),
    policies: content.policies.map((p) => ({ kind: p.kind, body: p.body })),
    departures: (content.departures ?? []).map((d) => {
      const slot = availability.get(d.id)
      return {
        id: d.id,
        startsAt: d.starts_at,
        endsAt: d.ends_at ?? null,
        status: slot?.status ?? d.status ?? null,
        unlimited: slot?.unlimited ?? null,
        capacity: slot?.initialPax ?? d.capacity ?? null,
        remaining: slot?.remainingPax ?? d.remaining ?? null,
        lowestPriceCents: d.lowest_price_cents ?? null,
        currency: d.currency ?? null,
        note: d.note ?? null,
      }
    }),
  }
}

function mapCruiseContentToEnrichment(content: CruiseContentPayload): CatalogDetailEnrichment {
  return {
    name: content.cruise.name ?? null,
    description: content.cruise.description ?? null,
    highlights: content.cruise.highlights ?? [],
    heroImageUrl: content.cruise.hero_image_url ?? null,
    supplier: content.cruise.cruise_line ?? null,
    ship: content.ship
      ? {
          id: content.ship.id ?? null,
          name: content.ship.name,
          shipType: content.ship.ship_type ?? null,
          description: content.ship.description ?? null,
          deckPlanUrl: content.ship.deck_plan_url ?? null,
          deckPlans: (content.ship.deck_plans ?? []).map((deck) => ({
            name: deck.name,
            level: deck.level ?? null,
            imageUrl: deck.image_url ?? null,
          })),
          capacity: content.ship.capacity ?? null,
          decks: content.ship.decks ?? null,
          yearBuilt: content.ship.year_built ?? null,
          images: content.ship.gallery ?? [],
        }
      : null,
    // Cruise itinerary lives per-sailing in the content payload; the cruise-level
    // `itinerary_stops` is a representative copy an adapter may leave empty. Fall
    // back to the first sailing that has a route so the Itinerary tab shows it.
    itinerary: mapCruiseItineraryStops(
      content.itinerary_stops?.length
        ? content.itinerary_stops
        : firstSailingItineraryStops(content.sailings ?? []),
    ),
    media: [],
    options: (content.cabin_categories ?? []).map((c) => ({
      id: c.id,
      name: formatCruiseCabinCategoryName(c),
      description: c.description ? stripHtmlTags(c.description) : null,
      code: c.code ?? null,
      type: c.type ?? null,
      images: c.images ?? [],
      floorplanImages: c.floorplan_images ?? [],
      squareFeet: c.square_feet ?? null,
      gradeCodes: c.grade_codes ?? [],
      wheelchairAccessible: c.wheelchair_accessible ?? false,
      capacityMax: c.capacity_max ?? null,
      amenities: c.inclusions ?? [],
    })),
    policies: content.policies.map((p) => ({ kind: p.kind, body: p.body })),
    departures: (content.sailings ?? []).map((s) => ({
      id: s.id,
      sourceRef: s.source_ref ?? null,
      startsAt: s.start_date,
      endsAt: s.end_date,
      durationNights: s.duration_nights ?? null,
      status: s.status ?? null,
      embarkationPort: s.embarkation_port ?? null,
      disembarkationPort: s.disembarkation_port ?? null,
      lowestPriceCents: s.lowest_price_cents,
      currency: s.currency,
      itinerary: mapCruiseItineraryStops(s.itinerary_stops ?? []),
    })),
  }
}

function firstSailingItineraryStops(
  sailings: NonNullable<CruiseContentPayload["sailings"]>,
): CruiseItineraryStopPayload[] {
  for (const sailing of sailings) {
    if (sailing.itinerary_stops?.length) return sailing.itinerary_stops
  }
  return []
}

function mapCruiseItineraryStops(
  stops: ReadonlyArray<CruiseItineraryStopPayload>,
): NonNullable<CatalogDetailEnrichment["itinerary"]> {
  return stops.map((d) => ({
    dayNumber: d.day_number,
    title: d.port_name,
    description: d.description ?? null,
    location: d.port_name,
    date: d.date ?? null,
    arrivalTime: d.arrival_time ?? null,
    departureTime: d.departure_time ?? null,
    isAtSea: d.is_at_sea ?? null,
  }))
}

function formatCruiseCabinCategoryName(category: {
  code?: string | null
  name: string
  type?: string | null
}): string {
  // Upstream cabin names occasionally arrive wrapped in HTML (e.g. Viking sends
  // `<p>Deluxe Veranda Stateroom (DV)</p>`); strip it so it never renders raw.
  const name = stripHtmlTags(category.name).trim()
  const code = category.code?.trim()
  if (!name) return code ?? category.type ?? ""
  // Grade rows where the upstream has no distinct display name come through as
  // name === code; show just the code instead of "DV2 - DV2".
  if (code && code !== name) return `${code} - ${name}`
  return name
}

function stripHtmlTags(value: string): string {
  return value
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, " ")
    .trim()
}
