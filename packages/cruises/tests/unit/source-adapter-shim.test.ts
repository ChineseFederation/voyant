import { buildIndexerDocument, createFieldPolicyRegistry } from "@voyant-travel/catalog"
import { describe, expect, it } from "vitest"
import type {
  CruiseAdapter,
  CruiseSearchProjectionEntry,
  ExternalCruise,
  ExternalSailing,
  ExternalShip,
} from "../../src/adapters/index.js"
import { cruiseAdapterToSourceAdapter } from "../../src/adapters/source-adapter-shim.js"
import { cruiseCatalogPolicy } from "../../src/catalog-policy.js"
import { CRUISES_CONTENT_SCHEMA_VERSION } from "../../src/content-shape.js"
import { encodeSourceRef } from "../../src/lib/key.js"

function makeProjectionEntries(count: number): CruiseSearchProjectionEntry[] {
  const out: CruiseSearchProjectionEntry[] = []
  for (let i = 0; i < count; i += 1) {
    out.push({
      sourceRef: { externalId: `cruise-${i}`, connectionId: "conn-x" },
      slug: `cruise-${i}`,
      name: `Cruise ${i}`,
      cruiseType: "ocean",
      lineName: "Sample Line",
      shipName: "MS Sample",
      lineExternalId: "sample-line",
      shipExternalId: "ms-sample",
      nights: 7,
      embarkPortName: "Athens",
      embarkPortFacilityId: "port-facility:GRATH",
      disembarkPortName: "Athens",
      disembarkPortFacilityId: "port-facility:GRATH",
      regionIds: ["region:mediterranean"],
      waterwayIds: ["sea:aegean"],
      portIds: ["port:GRATH"],
      countryIso: ["GR"],
      regions: ["Aegean"],
      waterways: ["Aegean Sea"],
      ports: ["Athens"],
      countries: ["Greece"],
      themes: ["Cultural"],
      departureCount: 1,
      lowestPriceCents: 349900,
      lowestPriceCurrency: "EUR",
      heroImageUrl: `https://cdn/c${i}.jpg`,
      salesStatus: "open",
    })
  }
  return out
}

function makeStubAdapter(overrides: Partial<CruiseAdapter> = {}): CruiseAdapter {
  const cruise: ExternalCruise = {
    sourceRef: { externalId: "cruise-1", connectionId: "conn-x" },
    name: "Greek Isles",
    slug: "greek-isles",
    cruiseType: "ocean",
    lineName: "Sample Line",
    defaultShipRef: { externalId: "ship-1", connectionId: "conn-x" },
    nights: 7,
    embarkPortName: "Athens",
    disembarkPortName: "Athens",
    description: "Seven-night Greek Isles cruise.",
    inclusionsHtml: "<ul><li>All meals</li></ul>",
    exclusionsHtml: "<ul><li>Gratuities</li></ul>",
    heroImageUrl: "https://cdn/hero.jpg",
    status: "live",
  }
  const ship: ExternalShip = {
    sourceRef: { externalId: "ship-1", connectionId: "conn-x" },
    name: "MS Sample",
    slug: "ms-sample",
    shipType: "ocean",
    capacityGuests: 1200,
    deckCount: 12,
    yearBuilt: 2020,
    description: "A sample ship.",
    deckPlanUrl: "https://cdn/ship-deck-plan.pdf",
    gallery: ["https://cdn/ship.jpg"],
    decks: [{ name: "Upper Deck", level: 3, planImageUrl: "https://cdn/deck-3.jpg" }],
    categories: [
      {
        sourceRef: { externalId: "cab-inside", connectionId: "conn-x" },
        code: "IN",
        name: "Inside",
        roomType: "inside",
        minOccupancy: 1,
        maxOccupancy: 2,
        squareFeet: "170",
        wheelchairAccessible: true,
        amenities: ["Wi-Fi"],
        images: ["https://cdn/cabin.jpg"],
        floorplanImages: ["https://cdn/cabin-plan.jpg"],
        gradeCodes: ["IN1", "IN2"],
      },
    ],
  }
  const sailings: ExternalSailing[] = [
    {
      sourceRef: { externalId: "sailing-1", connectionId: "conn-x" },
      cruiseRef: cruise.sourceRef,
      shipRef: ship.sourceRef,
      departureDate: "2026-06-01",
      returnDate: "2026-06-08",
      embarkPortName: "Athens",
      disembarkPortName: "Athens",
      salesStatus: "open",
      lowestPriceCents: 349900,
      currency: "EUR",
    },
  ]

  return {
    name: "stub",
    version: "1.0.0",
    async listEntries() {
      return { entries: [], total: 0 }
    },
    async *searchProjection() {
      // No projections by default — overrides supply them.
    },
    async fetchCruise(sourceRef) {
      if (sourceRef.externalId === cruise.sourceRef.externalId) return cruise
      return null
    },
    async fetchSailing() {
      return null
    },
    async fetchSailingPricing() {
      return []
    },
    async fetchSailingItinerary(sourceRef) {
      if (sourceRef.externalId !== "sailing-1") return []
      return [
        {
          dayNumber: 1,
          portName: "Athens",
          departureTime: "17:00",
        },
        {
          dayNumber: 2,
          portName: "Mykonos",
          arrivalTime: "08:00",
          departureTime: "18:00",
        },
      ]
    },
    async fetchShip(sourceRef) {
      if (sourceRef.externalId === ship.sourceRef.externalId) return ship
      return null
    },
    async listSailingsForCruise() {
      return sailings
    },
    async createBooking() {
      throw new Error("not used")
    },
    ...overrides,
  }
}

describe("cruiseAdapterToSourceAdapter — capabilities", () => {
  it("declares cruises vertical + content fetch by default", () => {
    const adapter = makeStubAdapter()
    const shim = cruiseAdapterToSourceAdapter(adapter)
    expect(shim.kind).toBe("cruise:stub")
    expect(shim.capabilities.verticals).toEqual(["cruises"])
    expect(shim.capabilities.supportsContentFetch).toBe(true)
    expect(shim.capabilities.supportedContentLocales).toBeUndefined()
  })

  it("respects supportsContentFetch override (thin shim mode)", () => {
    const shim = cruiseAdapterToSourceAdapter(makeStubAdapter(), {
      supportsContentFetch: false,
    })
    expect(shim.capabilities.supportsContentFetch).toBe(false)
  })

  it("uses custom sourceKind when provided", () => {
    const shim = cruiseAdapterToSourceAdapter(makeStubAdapter(), {
      sourceKind: "voyant-connect",
    })
    expect(shim.kind).toBe("voyant-connect")
  })

  it("forwards supportedContentLocales to capabilities", () => {
    const shim = cruiseAdapterToSourceAdapter(makeStubAdapter(), {
      supportedContentLocales: ["en-GB", "ro-RO", "de-DE"],
    })
    expect(shim.capabilities.supportedContentLocales).toEqual(["en-GB", "ro-RO", "de-DE"])
  })
})

describe("cruiseAdapterToSourceAdapter.discover", () => {
  it("paginates a search-projection iterable into a catalog DiscoveryPage", async () => {
    const entries = makeProjectionEntries(3)
    const adapter = makeStubAdapter({
      async *searchProjection() {
        for (const e of entries) yield e
      },
    })
    const shim = cruiseAdapterToSourceAdapter(adapter, { pageSize: 100 })

    const page = await shim.discover({ connection_id: "conn-x" })
    expect(page.projections).toHaveLength(3)
    expect(page.projections[0]?.entity_module).toBe("cruises")
    expect(page.projections[0]?.entity_id).toBe(`crus_${encodeSourceRef(entries[0]!.sourceRef)}`)
    expect(page.projections[0]?.provenance.source_kind).toBe("cruise:stub")
    expect(page.projections[0]?.provenance.source_ref).toBe(encodeSourceRef(entries[0]!.sourceRef))
    expect(page.projections[0]?.provenance.source_freshness).toBe("sync")
    // Scalars use the camelCase field-policy keys (issue #1466) so the indexer
    // keeps them instead of dropping unrecognized snake_case keys.
    expect(page.projections[0]?.fields.cruiseType).toBe("ocean")
    expect(page.projections[0]?.fields.nights).toBe(7)
    expect(page.projections[0]?.fields.lineSupplierId).toBe("sample-line")
    expect(page.projections[0]?.fields.defaultShipId).toBe("ms-sample")
    expect(page.projections[0]?.fields.embarkPortFacilityId).toBe("port-facility:GRATH")
    expect(page.projections[0]?.fields.disembarkPortFacilityId).toBe("port-facility:GRATH")
    expect(page.projections[0]?.fields.heroImageUrl).toBe("https://cdn/c0.jpg")
    expect(page.projections[0]?.fields.thumbnailUrl).toBe("https://cdn/c0.jpg")
    expect(page.projections[0]?.fields.status).toBe("open")
    expect(page.projections[0]?.fields.lowestPriceCached).toBe(349900)
    expect(page.projections[0]?.fields.lowestPriceCurrencyCached).toBe("EUR")
    expect(page.projections[0]?.fields.lowestPriceUnit).toBe("minor")
    expect(page.projections[0]?.fields.departureCount).toBe(1)
    expect(page.projections[0]?.fields["source.kind"]).toBe("cruise:stub")
    expect(page.projections[0]?.fields.region_ids).toEqual(["region:mediterranean"])
    expect(page.projections[0]?.fields.waterway_ids).toEqual(["sea:aegean"])
    expect(page.projections[0]?.fields.port_ids).toEqual(["port:GRATH"])
    expect(page.projections[0]?.fields.country_iso).toEqual(["GR"])
    expect(page.projections[0]?.fields.waterways).toEqual(["Aegean Sea"])
    expect(page.projections[0]?.fields.ports).toEqual(["Athens"])
    expect(page.projections[0]?.fields.countries).toEqual(["Greece"])
    // No more pages.
    expect(page.next_cursor).toBeUndefined()
  })

  it("indexes natural canonical geography projection keys through list policies", async () => {
    const entries = makeProjectionEntries(1)
    const adapter = makeStubAdapter({
      async *searchProjection() {
        for (const e of entries) yield e
      },
    })
    const shim = cruiseAdapterToSourceAdapter(adapter, { pageSize: 100 })
    const page = await shim.discover({ connection_id: "conn-x" })
    const projection = new Map(Object.entries(page.projections[0]!.fields))
    const doc = buildIndexerDocument(
      createFieldPolicyRegistry(cruiseCatalogPolicy),
      projection,
      { vertical: "cruises", locale: "en-GB", audience: "customer", market: "default" },
      page.projections[0]!.entity_id,
    )

    expect(doc.fields.waterway_ids).toEqual(["sea:aegean"])
    expect(doc.fields.waterways).toEqual(["Aegean Sea"])
    expect(doc.fields.country_iso).toEqual(["GR"])
    expect(doc.fields.countries).toEqual(["Greece"])
    // CamelCase scalars now survive the field policy too (issue #1466) — these
    // were silently dropped when the shim emitted snake_case keys.
    expect(doc.fields.cruiseType).toBe("ocean")
    expect(doc.fields.nights).toBe(7)
    expect(doc.fields.thumbnailUrl).toBe("https://cdn/c0.jpg")
    expect(doc.fields.lineSupplierId).toBe("sample-line")
    expect(doc.fields.defaultShipId).toBe("ms-sample")
    expect(doc.fields.embarkPortFacilityId).toBe("port-facility:GRATH")
    expect(doc.fields.disembarkPortFacilityId).toBe("port-facility:GRATH")
  })

  it("emits a cursor when more pages exist", async () => {
    const entries = makeProjectionEntries(3)
    const adapter = makeStubAdapter({
      async *searchProjection() {
        for (const e of entries) yield e
      },
    })
    const shim = cruiseAdapterToSourceAdapter(adapter, { pageSize: 2 })

    const page1 = await shim.discover({ connection_id: "conn-x" })
    expect(page1.projections).toHaveLength(2)
    expect(page1.next_cursor).toBeDefined()

    const page2 = await shim.discover({ connection_id: "conn-x" }, page1.next_cursor)
    expect(page2.projections).toHaveLength(1)
    expect(page2.next_cursor).toBeUndefined()
  })

  it("returns an empty page when the cursor advances past the iterable", async () => {
    const entries = makeProjectionEntries(2)
    const adapter = makeStubAdapter({
      async *searchProjection() {
        for (const e of entries) yield e
      },
    })
    const shim = cruiseAdapterToSourceAdapter(adapter, { pageSize: 10 })
    // Forge a cursor that points past the end.
    const stalePage = await shim.discover(
      { connection_id: "conn-x" },
      JSON.stringify({ offset: 10 }),
    )
    expect(stalePage.projections).toHaveLength(0)
    expect(stalePage.next_cursor).toBeUndefined()
  })

  it("passes through custom buildEntityId", async () => {
    const entries = makeProjectionEntries(1)
    const adapter = makeStubAdapter({
      async *searchProjection() {
        for (const e of entries) yield e
      },
    })
    const shim = cruiseAdapterToSourceAdapter(adapter, {
      buildEntityId: (ref) => `custom_${ref.externalId}`,
    })
    const page = await shim.discover({ connection_id: "conn-x" })
    expect(page.projections[0]?.entity_id).toBe("custom_cruise-0")
  })
})

describe("cruiseAdapterToSourceAdapter.getContent", () => {
  it("composes fetchCruise + fetchShip + listSailingsForCruise into a CruiseContent payload", async () => {
    const adapter = makeStubAdapter()
    const shim = cruiseAdapterToSourceAdapter(adapter)
    const entityId = `crus_${encodeSourceRef({ externalId: "cruise-1", connectionId: "conn-x" })}`
    const result = await shim.getContent!(
      { connection_id: "conn-x" },
      { entity_module: "cruises", entity_id: entityId, locale: "en-GB" },
    )

    expect(result.entity_module).toBe("cruises")
    expect(result.entity_id).toBe(entityId)
    expect(result.source_ref).toBe(
      encodeSourceRef({ externalId: "cruise-1", connectionId: "conn-x" }),
    )
    expect(result.returned_locale).toBe("en-GB")
    expect(result.content_schema_version).toBe(CRUISES_CONTENT_SCHEMA_VERSION)

    // biome-ignore lint/suspicious/noExplicitAny: result.content is unknown -- owner: cruises; existing suppression is intentional pending typed cleanup.
    const content = result.content as any
    expect(content.cruise.name).toBe("Greek Isles")
    expect(content.cruise.cruise_line).toBe("Sample Line")
    expect(content.cruise.duration_nights).toBe(7)
    expect(content.ship?.name).toBe("MS Sample")
    expect(content.ship?.capacity).toBe(1200)
    expect(content.ship?.deck_plan_url).toBe("https://cdn/ship-deck-plan.pdf")
    expect(content.ship?.deck_plans).toEqual([
      { name: "Upper Deck", level: 3, image_url: "https://cdn/deck-3.jpg" },
    ])
    expect(content.ship?.gallery).toEqual(["https://cdn/ship.jpg"])
    expect(content.sailings).toHaveLength(1)
    expect(content.sailings[0].duration_nights).toBe(7)
    expect(content.sailings[0].lowest_price_cents).toBe(349900)
    expect(content.sailings[0].currency).toBe("EUR")
    expect(content.sailings[0].itinerary_stops).toMatchObject([
      { day_number: 1, port_name: "Athens", departure_time: "17:00" },
      { day_number: 2, port_name: "Mykonos", arrival_time: "08:00", departure_time: "18:00" },
    ])
    expect(content.cabin_categories).toHaveLength(1)
    expect(content.cabin_categories[0].type).toBe("inside")
    expect(content.cabin_categories[0].images).toEqual(["https://cdn/cabin.jpg"])
    expect(content.cabin_categories[0].floorplan_images).toEqual(["https://cdn/cabin-plan.jpg"])
    expect(content.cabin_categories[0].square_feet).toBe("170")
    expect(content.cabin_categories[0].grade_codes).toEqual(["IN1", "IN2"])
    expect(content.cabin_categories[0].wheelchair_accessible).toBe(true)
    expect(content.itinerary_stops).toEqual([])
    // Inclusions / exclusions HTML lands in supplier_notes.
    expect(
      content.policies.filter((p: { kind: string }) => p.kind === "supplier_notes"),
    ).toHaveLength(2)
  })

  it("throws when the cruise adapter returns null for the entity_id", async () => {
    const adapter = makeStubAdapter({
      async fetchCruise() {
        return null
      },
    })
    const shim = cruiseAdapterToSourceAdapter(adapter)
    await expect(
      shim.getContent!(
        { connection_id: "conn-x" },
        { entity_module: "cruises", entity_id: "crus_unknown", locale: "en-GB" },
      ),
    ).rejects.toThrow(/unavailable/i)
  })

  it("returns ship: null when the cruise has no defaultShipRef", async () => {
    const adapter = makeStubAdapter({
      async fetchCruise() {
        return {
          sourceRef: { externalId: "cruise-1" },
          name: "Charter",
          slug: "charter",
          cruiseType: "ocean" as const,
          lineName: "Sample Line",
          // defaultShipRef intentionally missing
          nights: 7,
          status: "live" as const,
        }
      },
    })
    const shim = cruiseAdapterToSourceAdapter(adapter)
    const result = await shim.getContent!(
      { connection_id: "conn-x" },
      { entity_module: "cruises", entity_id: "crus_cruise-1", locale: "en-GB" },
    )
    // biome-ignore lint/suspicious/noExplicitAny: shim returns unknown -- owner: cruises; existing suppression is intentional pending typed cleanup.
    expect((result.content as any).ship).toBeNull()
  })
})

describe("cruiseAdapterToSourceAdapter.reserve / cancel", () => {
  it("reserve rejects an incomplete sourced booking selection", async () => {
    const shim = cruiseAdapterToSourceAdapter(makeStubAdapter())
    await expect(
      shim.reserve!(
        { connection_id: "conn-x" },
        { entity_module: "cruises", entity_id: "crus_x", parameters: {} },
      ),
    ).rejects.toMatchObject({
      message: expect.stringMatching(/requires sailingId/i),
      certainty: "not_sent",
      errorClass: "cruise_reservation_preflight_failed",
    })
  })

  it("cancel throws to keep cruise cancellation on the vertical's commit path in v1", async () => {
    const shim = cruiseAdapterToSourceAdapter(makeStubAdapter())
    await expect(
      shim.cancel!({ connection_id: "conn-x" }, { upstream_ref: "ref-1" }),
    ).rejects.toThrow(/not supported/i)
  })
})
