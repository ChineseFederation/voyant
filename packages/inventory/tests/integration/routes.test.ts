import { type SQL, sql } from "drizzle-orm"
import { Hono } from "hono"
import { beforeAll, beforeEach, describe, expect, it } from "vitest"

import { productRoutes } from "../../src/routes.js"

const DB_AVAILABLE = !!process.env.TEST_DATABASE_URL

describe.skipIf(!DB_AVAILABLE)("Product routes", () => {
  let app: Hono

  async function ensureDestinationTables(db: { execute: (statement: SQL) => Promise<unknown> }) {
    const statements: SQL[] = [
      sql`CREATE TABLE IF NOT EXISTS destinations (
        id text PRIMARY KEY NOT NULL,
        parent_id text,
        slug text NOT NULL,
        code text,
        canonical_place_id text,
        destination_type text DEFAULT 'destination' NOT NULL,
        latitude double precision,
        longitude double precision,
        sort_order integer DEFAULT 0 NOT NULL,
        active boolean DEFAULT true NOT NULL,
        metadata jsonb,
        created_at timestamp with time zone DEFAULT now() NOT NULL,
        updated_at timestamp with time zone DEFAULT now() NOT NULL
      )`,
      sql`ALTER TABLE destinations ADD COLUMN IF NOT EXISTS canonical_place_id text`,
      sql`ALTER TABLE destinations ADD COLUMN IF NOT EXISTS latitude double precision`,
      sql`ALTER TABLE destinations ADD COLUMN IF NOT EXISTS longitude double precision`,
      sql`CREATE UNIQUE INDEX IF NOT EXISTS uidx_destinations_slug ON destinations (slug)`,
      sql`CREATE TABLE IF NOT EXISTS destination_translations (
        id text PRIMARY KEY NOT NULL,
        destination_id text NOT NULL,
        language_tag text NOT NULL,
        name text NOT NULL,
        description text,
        seo_title text,
        seo_description text,
        created_at timestamp with time zone DEFAULT now() NOT NULL,
        updated_at timestamp with time zone DEFAULT now() NOT NULL
      )`,
      sql`CREATE UNIQUE INDEX IF NOT EXISTS uidx_destination_translations_locale
        ON destination_translations (destination_id, language_tag)`,
      sql`CREATE TABLE IF NOT EXISTS product_destinations (
        product_id text NOT NULL,
        destination_id text NOT NULL,
        sort_order integer DEFAULT 0 NOT NULL,
        created_at timestamp with time zone DEFAULT now() NOT NULL,
        updated_at timestamp with time zone DEFAULT now() NOT NULL,
        PRIMARY KEY (product_id, destination_id)
      )`,
    ]

    for (const statement of statements) {
      await db.execute(statement)
    }
  }

  async function ensureItineraryTables(db: { execute: (statement: SQL) => Promise<unknown> }) {
    const statements: SQL[] = [
      sql`CREATE TABLE IF NOT EXISTS product_itineraries (
        id text PRIMARY KEY NOT NULL,
        product_id text NOT NULL REFERENCES products(id) ON DELETE cascade,
        name text NOT NULL,
        is_default boolean DEFAULT false NOT NULL,
        sort_order integer DEFAULT 0 NOT NULL,
        created_at timestamp with time zone DEFAULT now() NOT NULL,
        updated_at timestamp with time zone DEFAULT now() NOT NULL
      )`,
      sql`CREATE INDEX IF NOT EXISTS idx_product_itineraries_product
        ON product_itineraries (product_id)`,
      sql`CREATE INDEX IF NOT EXISTS idx_product_itineraries_product_sort
        ON product_itineraries (product_id, sort_order, created_at)`,
      sql`CREATE INDEX IF NOT EXISTS idx_product_itineraries_product_default
        ON product_itineraries (product_id, is_default)`,
      sql`CREATE UNIQUE INDEX IF NOT EXISTS uidx_product_itineraries_default
        ON product_itineraries (product_id)
        WHERE is_default = true`,
      sql`ALTER TABLE product_days ADD COLUMN IF NOT EXISTS itinerary_id text`,
      sql`CREATE INDEX IF NOT EXISTS idx_product_days_itinerary
        ON product_days (itinerary_id)`,
      sql`CREATE INDEX IF NOT EXISTS idx_product_days_itinerary_day_number
        ON product_days (itinerary_id, day_number)`,
    ]

    for (const statement of statements) {
      await db.execute(statement)
    }

    await db.execute(sql`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_name = 'product_days' AND column_name = 'product_id'
        ) THEN
          ALTER TABLE product_days ALTER COLUMN product_id DROP NOT NULL;
        END IF;
      END $$;
    `)
  }

  async function createProduct() {
    const res = await app.request("/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Croatia Tour 7 Days",
        sellCurrency: "EUR",
      }),
    })

    return (await res.json()).data
  }

  beforeAll(async () => {
    const { createTestDb, cleanupTestDb } = await import("@voyant-travel/db/test-utils")
    const db = createTestDb()
    await ensureDestinationTables(db)
    await ensureItineraryTables(db)
    await cleanupTestDb(db)

    app = new Hono()
    app.use("*", async (c, next) => {
      c.set("db" as never, db)
      c.set("userId" as never, "test-user-id")
      await next()
    })
    app.route("/", productRoutes)
  })

  beforeEach(async () => {
    const { createTestDb, cleanupTestDb } = await import("@voyant-travel/db/test-utils")
    const db = createTestDb()
    await ensureDestinationTables(db)
    await ensureItineraryTables(db)
    await cleanupTestDb(db)
  })

  it("creates a product", async () => {
    const res = await app.request("/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Croatia Tour 7 Days",
        sellCurrency: "EUR",
      }),
    })

    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.data.name).toBe("Croatia Tour 7 Days")
  })

  it("lists products", async () => {
    const res = await app.request("/", { method: "GET" })

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data).toBeInstanceOf(Array)
  })

  it("creates a new default itinerary without violating the unique default constraint", async () => {
    const product = await createProduct()

    const createRes = await app.request(`/${product.id}/itineraries`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Weather fallback",
        isDefault: true,
      }),
    })

    expect(createRes.status).toBe(201)
    expect((await createRes.json()).data.isDefault).toBe(true)

    const listRes = await app.request(`/${product.id}/itineraries`, { method: "GET" })
    expect(listRes.status).toBe(200)
    const { data } = await listRes.json()
    expect(data).toHaveLength(2)
    expect(data.filter((row: { isDefault: boolean }) => row.isDefault)).toHaveLength(1)
    expect(data[0]?.name).toBe("Weather fallback")
  })

  it("promotes an existing itinerary to default", async () => {
    const product = await createProduct()

    const createRes = await app.request(`/${product.id}/itineraries`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Late season variation",
      }),
    })

    expect(createRes.status).toBe(201)
    const { data: itinerary } = await createRes.json()

    const updateRes = await app.request(`/itineraries/${itinerary.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        isDefault: true,
      }),
    })

    expect(updateRes.status).toBe(200)
    expect((await updateRes.json()).data.isDefault).toBe(true)

    const listRes = await app.request(`/${product.id}/itineraries`, { method: "GET" })
    const { data } = await listRes.json()
    expect(data).toHaveLength(2)
    expect(data.filter((row: { isDefault: boolean }) => row.isDefault)).toHaveLength(1)
    expect(data[0]?.id).toBe(itinerary.id)
  })

  it("duplicates an itinerary with its days and services", async () => {
    const product = await createProduct()

    const createRes = await app.request(`/${product.id}/itineraries`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Main" }),
    })
    const { data: source } = await createRes.json()

    const dayRes = await app.request(`/${product.id}/itineraries/${source.id}/days`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dayNumber: 1, title: "Arrival", location: "Split" }),
    })
    const { data: day } = await dayRes.json()

    await app.request(`/${product.id}/days/${day.id}/services`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        serviceType: "accommodation",
        name: "Seaside hotel",
        costCurrency: "EUR",
        costAmountCents: 15000,
        quantity: 1,
      }),
    })

    await app.request(`/${product.id}/days/${day.id}/media`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mediaType: "image",
        name: "Arrival photo",
        url: "https://cdn.example.com/arrival.jpg",
        storageKey: "products/arrival.jpg",
        mimeType: "image/jpeg",
        sortOrder: 0,
        isCover: true,
      }),
    })

    const duplicateRes = await app.request(`/itineraries/${source.id}/duplicate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    })

    expect(duplicateRes.status).toBe(201)
    const { data: copy } = await duplicateRes.json()
    expect(copy.id).not.toBe(source.id)
    expect(copy.name).toBe("Main (Copy)")
    expect(copy.isDefault).toBe(false)

    const copiedDaysRes = await app.request(`/${product.id}/itineraries/${copy.id}/days`, {
      method: "GET",
    })
    const { data: copiedDays } = await copiedDaysRes.json()
    expect(copiedDays).toHaveLength(1)
    expect(copiedDays[0]?.title).toBe("Arrival")
    expect(copiedDays[0]?.id).not.toBe(day.id)

    const copiedServicesRes = await app.request(
      `/${product.id}/days/${copiedDays[0]?.id}/services`,
      { method: "GET" },
    )
    const { data: copiedServices } = await copiedServicesRes.json()
    expect(copiedServices).toHaveLength(1)
    expect(copiedServices[0]?.name).toBe("Seaside hotel")

    const copiedMediaRes = await app.request(`/${product.id}/days/${copiedDays[0]?.id}/media`, {
      method: "GET",
    })
    const { data: copiedMedia } = await copiedMediaRes.json()
    expect(copiedMedia).toHaveLength(1)
    expect(copiedMedia[0]?.url).toBe("https://cdn.example.com/arrival.jpg")
    expect(copiedMedia[0]?.storageKey).toBe("products/arrival.jpg")
    expect(copiedMedia[0]?.isCover).toBe(true)
  })

  it("recalculates product cost", async () => {
    const createRes = await app.request("/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Test Product",
        sellCurrency: "EUR",
        sellAmountCents: 10000,
      }),
    })
    const { data: product } = await createRes.json()

    // Recalculate (no services yet, cost should be 0)
    const recalcRes = await app.request(`/${product.id}/recalculate`, {
      method: "POST",
    })

    expect(recalcRes.status).toBe(200)
    const { data } = await recalcRes.json()
    expect(data.costAmountCents).toBe(0)
    expect(data.marginPercent).toBe(100)
    expect(data.currency).toBe("EUR")
    expect(data.byCurrency).toEqual([])
    expect(data.unconvertibleCurrencies).toEqual([])
  })

  it("totals a mixed-currency itinerary per currency instead of adding minor units", async () => {
    const createRes = await app.request("/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Turkey Grand Tour",
        sellCurrency: "EUR",
        sellAmountCents: 200000,
      }),
    })
    const { data: product } = await createRes.json()

    const itineraryRes = await app.request(`/${product.id}/itineraries`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Main" }),
    })
    const { data: itinerary } = await itineraryRes.json()

    const dayRes = await app.request(`/${product.id}/itineraries/${itinerary.id}/days`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dayNumber: 1, title: "Istanbul", location: "Istanbul" }),
    })
    const { data: day } = await dayRes.json()

    // EUR coach hire (2 × 150.00) alongside TRY hotel nights (3 × 5,000.00).
    for (const service of [
      { serviceType: "transfer", name: "Coach", costCurrency: "EUR", cost: 15000, quantity: 2 },
      {
        serviceType: "accommodation",
        name: "Hotel",
        costCurrency: "TRY",
        cost: 500000,
        quantity: 3,
      },
    ]) {
      await app.request(`/${product.id}/days/${day.id}/services`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          serviceType: service.serviceType,
          name: service.name,
          costCurrency: service.costCurrency,
          costAmountCents: service.cost,
          quantity: service.quantity,
        }),
      })
    }

    const recalcRes = await app.request(`/${product.id}/recalculate`, { method: "POST" })
    expect(recalcRes.status).toBe(200)
    const { data } = await recalcRes.json()

    // Grouped by source currency by the database, not flattened into one integer.
    expect(data.currency).toBe("EUR")
    expect(data.byCurrency).toEqual([
      { currency: "EUR", amountCents: 30000 },
      { currency: "TRY", amountCents: 1500000 },
    ])
    // Whatever the deployment's FX data allows, the answer is never the naive
    // sum of euro cents and kuruş.
    expect(data.costAmountCents).not.toBe(1530000)
    if (data.unconvertibleCurrencies.includes("TRY")) {
      expect(data.costAmountCents).toBeNull()
      expect(data.marginPercent).toBeNull()
    } else {
      expect(data.costAmountCents).toBeGreaterThan(30000)
    }
  })

  it("creates and lists structured product features", async () => {
    const product = await createProduct()

    const createRes = await app.request(`/${product.id}/features`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        featureType: "inclusion",
        title: "Hotel pickup",
        description: "Pickup from central hotels",
      }),
    })

    expect(createRes.status).toBe(201)
    expect((await createRes.json()).data.featureType).toBe("inclusion")

    const listRes = await app.request(`/features?productId=${product.id}`, { method: "GET" })
    expect(listRes.status).toBe(200)
    expect((await listRes.json()).data).toHaveLength(1)
  })

  it("creates and updates product FAQs", async () => {
    const product = await createProduct()

    const createRes = await app.request(`/${product.id}/faqs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        question: "Is lunch included?",
        answer: "No, lunch is not included.",
      }),
    })

    expect(createRes.status).toBe(201)
    const { data: faq } = await createRes.json()

    const updateRes = await app.request(`/faqs/${faq.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        answer: "Yes, lunch is included on premium departures.",
      }),
    })

    expect(updateRes.status).toBe(200)
    expect((await updateRes.json()).data.answer).toContain("premium departures")
  })

  it("creates and lists structured product locations", async () => {
    const product = await createProduct()

    const createRes = await app.request(`/${product.id}/locations`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        locationType: "meeting_point",
        title: "Main Square",
        city: "Split",
        countryCode: "HR",
        latitude: 43.5081,
        longitude: 16.4402,
        googlePlaceId: "test-place-id",
      }),
    })

    expect(createRes.status).toBe(201)
    expect((await createRes.json()).data.locationType).toBe("meeting_point")

    const listRes = await app.request(`/locations?productId=${product.id}`, { method: "GET" })
    expect(listRes.status).toBe(200)
    const body = await listRes.json()
    expect(body.data).toHaveLength(1)
    expect(body.data[0]?.googlePlaceId).toBe("test-place-id")
  })

  it("creates destinations, translations, and product destination links", async () => {
    const product = await createProduct()

    const createDestinationRes = await app.request("/destinations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        slug: "romania",
        canonicalPlaceId: "ROBUH",
        destinationType: "country",
        latitude: 44.4268,
        longitude: 26.1025,
      }),
    })

    expect(createDestinationRes.status).toBe(201)
    const { data: destination } = await createDestinationRes.json()
    expect(destination.canonicalPlaceId).toBe("ROBUH")
    expect(destination.latitude).toBe(44.4268)

    const createTranslationRes = await app.request(`/destinations/${destination.id}/translations`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        languageTag: "ro",
        name: "Romania",
        description: "Destinatie europeana",
      }),
    })

    expect(createTranslationRes.status).toBe(201)

    const createLinkRes = await app.request(`/${product.id}/destinations`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        destinationId: destination.id,
      }),
    })

    expect(createLinkRes.status).toBe(201)

    const listDestinationsRes = await app.request("/destinations?languageTag=ro", { method: "GET" })
    expect(listDestinationsRes.status).toBe(200)
    const listDestinationsBody = await listDestinationsRes.json()
    expect(listDestinationsBody.data[0]?.translation?.name).toBe("Romania")

    const listLinksRes = await app.request(`/destination-links?productId=${product.id}`, {
      method: "GET",
    })
    expect(listLinksRes.status).toBe(200)
    const listLinksBody = await listLinksRes.json()
    expect(listLinksBody.data[0]?.destinationId).toBe(destination.id)
  })
})
