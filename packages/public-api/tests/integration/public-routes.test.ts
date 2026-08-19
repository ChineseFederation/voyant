// agent-quality: file-size exception -- owner: storefront; existing coverage file stays co-located until a dedicated split preserves behavior and tests.

import {
  departurePriceOverrides,
  exchangeRates,
  extraPriceRules,
  fxRateSets,
  optionPriceRules,
  optionUnitPriceRules,
  priceCatalogs,
} from "@voyant-travel/commerce"
import { createEventBus } from "@voyant-travel/core"
import { cleanupTestDb, createTestDb } from "@voyant-travel/db/test-utils"
import { productExtras } from "@voyant-travel/inventory/extras"
import {
  optionUnits,
  productDayServices,
  productDayServiceTranslations,
  productDays,
  productDayTranslations,
  productItineraries,
  productLocations,
  productMedia,
  productOptions,
  products,
} from "@voyant-travel/inventory/schema"
import { availabilitySlots, availabilityStartTimes } from "@voyant-travel/operations"
import { relationshipsService } from "@voyant-travel/relationships"
import { customerSignals, inquiries } from "@voyant-travel/relationships/schema"
import { and, eq } from "drizzle-orm"
import { Hono } from "hono"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { createPublicApiRoutes } from "../../src/routes-public.js"
import type { PublicApiIntakePersistence, PublicApiRequestContext } from "../../src/service.js"

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL
const DB_AVAILABLE = !!TEST_DATABASE_URL

const db = DB_AVAILABLE ? createTestDb() : (null as never)

const allowPublishedProducts = {
  publication: { isProductPublished: async () => true },
} as const

function createActivePublicApiApp() {
  return new Hono().use("*", async (c, next) => {
    c.set(
      "publicChannel" as never,
      {
        channelId: "chan_bound",
        channelStatus: "active",
      } as never,
    )
    await next()
  })
}

const app = createActivePublicApiApp()
  .use("*", async (c, next) => {
    c.set("db" as never, db)
    await next()
  })
  .route("/", createPublicApiRoutes(allowPublishedProducts))

function requireIntakeDb(context: PublicApiRequestContext) {
  if (!context.db) {
    throw new Error("Storefront intake test requires a request database")
  }
  return context.db
}

const relationshipsIntakePersistence: PublicApiIntakePersistence = {
  async createInquiry({ context, data }) {
    if (!context.channelId) throw new Error("channel required")
    const targets = [
      ...(data.productId
        ? [{ kind: "product" as const, targetId: data.productId, snapshot: { title: "Product" } }]
        : []),
      ...(data.optionUnitId
        ? [
            {
              kind: "option_unit" as const,
              targetId: data.optionUnitId,
              snapshot: { title: "Departure" },
            },
          ]
        : []),
    ]
    const result = await relationshipsService.createPublicInquiry(
      requireIntakeDb(context),
      {
        subject: "Compatibility inquiry",
        kind: data.productId ? "product" : "general",
        sourceRef: data.sourceRef,
        contactSnapshot: data.contact,
        customerMessage: data.message,
        sourceUrl: data.sourceUrl,
        locale: data.locale,
        tags: data.tags,
        customFields: { relationships: { compatibilityPayload: data.payload } },
        consentSnapshot: data.consent,
        targets,
      },
      {
        actorId: `storefront:${context.channelId}`,
        channelId: context.channelId,
        targetValidation: { validateTarget: async () => "valid" },
      },
    )
    return {
      id: result.inquiry.id,
      personId: result.inquiry.personId,
      duplicate: result.replayed,
      createdAt: result.inquiry.createdAt,
    }
  },
  async findSignal({ context, kind, sourceSubmissionId }) {
    const [row] = await requireIntakeDb(context)
      .select()
      .from(customerSignals)
      .where(
        and(
          eq(customerSignals.kind, kind),
          eq(customerSignals.sourceSubmissionId, sourceSubmissionId),
        ),
      )
      .limit(1)
    return row ?? null
  },
  createPerson({ context, data }) {
    return relationshipsService.createPerson(requireIntakeDb(context), data)
  },
  createCustomerSignal({ context, data }) {
    return relationshipsService.createCustomerSignal(requireIntakeDb(context), data)
  },
  updateCustomerSignal({ context, id, data }) {
    return relationshipsService.updateCustomerSignal(requireIntakeDb(context), id, data)
  },
  deleteCustomerSignal({ context, id }) {
    return relationshipsService.deleteCustomerSignal(requireIntakeDb(context), id)
  },
  deletePerson({ context, id }) {
    return relationshipsService.deletePerson(requireIntakeDb(context), id)
  },
}

describe.skipIf(!DB_AVAILABLE)("Storefront public routes", () => {
  beforeEach(async () => {
    await cleanupTestDb(db)
  })

  it("keeps the lead route as a canonical Inquiry compatibility adapter", async () => {
    const eventBus = createEventBus()
    const events: unknown[] = []
    eventBus.subscribe("customer.signal.created", (event) => {
      events.push(event)
    })
    const intakeApp = createActivePublicApiApp()
      .use("*", async (c, next) => {
        c.set("db" as never, db)
        c.set("eventBus" as never, eventBus)
        await next()
      })
      .route(
        "/",
        createPublicApiRoutes({
          ...allowPublishedProducts,
          intake: { persistence: relationshipsIntakePersistence },
        }),
      )

    const res = await intakeApp.request("/leads", {
      method: "POST",
      body: JSON.stringify({
        kind: "request_offer",
        source: "form",
        contact: {
          name: "Ana Popescu",
          email: "ana@example.com",
          phone: "+40723123456",
        },
        productId: "prod_public_intake",
        optionUnitId: "ount_public_intake",
        notes: "Interested in a private trip.",
        sourceSubmissionId: "lead_form_123",
        payload: {
          travelers: 4,
          month: "August",
        },
        consent: {
          gdpr: true,
          marketing: true,
          scope: "lead-follow-up",
          acceptedAt: "2026-05-14T10:00:00.000Z",
        },
      }),
      headers: {
        "content-type": "application/json",
      },
    })

    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.data).toMatchObject({
      kind: "request_offer",
      source: "form",
      status: "new",
      duplicate: false,
    })

    const [inquiry] = await db
      .select()
      .from(inquiries)
      .where(eq(inquiries.id, body.data.id))
      .limit(1)

    expect(inquiry).toMatchObject({
      kind: "product",
      source: "storefront",
      sourceRef: "chan_bound:lead_form_123",
    })
    expect(inquiry.customFields).toMatchObject({
      relationships: { compatibilityPayload: { travelers: 4, month: "August" } },
    })
    const legacyLeadSignals = await db
      .select()
      .from(customerSignals)
      .where(eq(customerSignals.sourceSubmissionId, "lead_form_123"))
    expect(legacyLeadSignals).toHaveLength(0)
    expect(events).toHaveLength(0)
  })

  it("deduplicates public lead intake without trusting a client submission id", async () => {
    const intakeApp = createActivePublicApiApp()
      .use("*", async (c, next) => {
        c.set("db" as never, db)
        await next()
      })
      .route(
        "/",
        createPublicApiRoutes({
          ...allowPublishedProducts,
          intake: { persistence: relationshipsIntakePersistence },
        }),
      )

    const payload = {
      kind: "request_offer",
      source: "form",
      contact: {
        email: "DUPLICATE@example.com",
      },
      productId: "prod_duplicate_intake",
      consent: {
        gdpr: true,
      },
    }

    const first = await intakeApp.request("/leads", {
      method: "POST",
      body: JSON.stringify(payload),
      headers: { "content-type": "application/json" },
    })
    const second = await intakeApp.request("/leads", {
      method: "POST",
      body: JSON.stringify(payload),
      headers: { "content-type": "application/json" },
    })

    expect(first.status).toBe(201)
    expect(second.status).toBe(201)
    const firstBody = await first.json()
    const secondBody = await second.json()
    expect(firstBody.data.duplicate).toBe(false)
    expect(secondBody.data).toMatchObject({
      id: firstBody.data.id,
      duplicate: true,
    })

    const rows = await db
      .select()
      .from(inquiries)
      .where(
        eq(
          inquiries.sourceRef,
          "chan_bound:lead:request_offer:form:prod_duplicate_intake:-:email:duplicate@example.com",
        ),
      )

    expect(rows).toHaveLength(1)
  })

  it("records newsletter subscriptions idempotently and requests double opt-in once", async () => {
    const requestNewsletterDoubleOptIn = vi.fn()
    const eventBus = createEventBus()
    const events: unknown[] = []
    eventBus.subscribe("customer.signal.created", (event) => {
      events.push(event)
    })
    const intakeApp = createActivePublicApiApp()
      .use("*", async (c, next) => {
        c.set("db" as never, db)
        c.set("eventBus" as never, eventBus)
        await next()
      })
      .route(
        "/",
        createPublicApiRoutes({
          ...allowPublishedProducts,
          intake: {
            persistence: relationshipsIntakePersistence,
            requestNewsletterDoubleOptIn,
          },
        }),
      )

    const payload = {
      email: "NEWS@example.com",
      name: "Newsletter Reader",
      sourceSubmissionId: "newsletter_homepage_news@example.com",
      payload: {
        campaign: "homepage",
      },
      consent: {
        newsletter: true,
        gdpr: true,
        scope: "newsletter",
      },
    }

    const first = await intakeApp.request("/newsletter/subscribe", {
      method: "POST",
      body: JSON.stringify(payload),
      headers: { "content-type": "application/json" },
    })
    const second = await intakeApp.request("/newsletter/subscribe", {
      method: "POST",
      body: JSON.stringify(payload),
      headers: { "content-type": "application/json" },
    })

    expect(first.status).toBe(202)
    expect(second.status).toBe(202)
    const firstBody = await first.json()
    const secondBody = await second.json()
    expect(firstBody.data).toMatchObject({
      kind: "notify",
      duplicate: false,
      doubleOptIn: "requested",
    })
    expect(secondBody.data).toMatchObject({
      id: firstBody.data.id,
      duplicate: true,
      doubleOptIn: "requested",
    })
    expect(requestNewsletterDoubleOptIn).toHaveBeenCalledTimes(1)
    expect(requestNewsletterDoubleOptIn).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "news@example.com",
        signalId: firstBody.data.id,
        sourceSubmissionId: "newsletter_homepage_news@example.com",
      }),
    )

    const rows = await db
      .select()
      .from(customerSignals)
      .where(
        and(
          eq(customerSignals.kind, "notify"),
          eq(customerSignals.sourceSubmissionId, "newsletter_homepage_news@example.com"),
        ),
      )

    expect(rows).toHaveLength(1)
    expect(rows[0]?.metadata).toMatchObject({
      intake: { surface: "storefront", type: "newsletter" },
      newsletter: { email: "news@example.com", doubleOptIn: "requested" },
      payload: { campaign: "homepage" },
      consent: { newsletter: true, gdpr: true, scope: "newsletter" },
    })
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({
      data: {
        id: firstBody.data.id,
        intake: { surface: "storefront", type: "newsletter", doubleOptIn: "requested" },
      },
    })
  })

  it("returns public departures for a product", async () => {
    const [product] = await db
      .insert(products)
      .values({
        name: "Delta Danube Cruise",
        status: "active",
        activated: true,
        visibility: "public",
        sellCurrency: "EUR",
      })
      .returning()

    const [option] = await db
      .insert(productOptions)
      .values({
        productId: product.id,
        name: "Standard Cabin",
        status: "active",
        isDefault: true,
      })
      .returning()

    const [defaultItinerary] = await db
      .insert(productItineraries)
      .values({
        productId: product.id,
        name: "Main itinerary",
        isDefault: true,
      })
      .returning()

    const [unit] = await db
      .insert(optionUnits)
      .values({
        optionId: option.id,
        name: "Double Cabin",
        unitType: "room",
        occupancyMin: 2,
        occupancyMax: 2,
        isHidden: false,
      })
      .returning()

    await db.insert(productLocations).values({
      productId: product.id,
      locationType: "meeting_point",
      title: "Bucharest Airport",
    })

    const [catalog] = await db
      .insert(priceCatalogs)
      .values({
        code: "PUBLIC-EUR",
        name: "Public EUR",
        currencyCode: "EUR",
        catalogType: "public",
        isDefault: true,
        active: true,
      })
      .returning()

    const [rule] = await db
      .insert(optionPriceRules)
      .values({
        productId: product.id,
        optionId: option.id,
        priceCatalogId: catalog.id,
        name: "Cruise public rate",
        pricingMode: "per_person",
        isDefault: true,
        active: true,
      })
      .returning()

    await db.insert(optionUnitPriceRules).values({
      optionPriceRuleId: rule.id,
      optionId: option.id,
      unitId: unit.id,
      pricingMode: "per_booking",
      sellAmountCents: 120000,
      active: true,
    })

    const [startTime] = await db
      .insert(availabilityStartTimes)
      .values({
        productId: product.id,
        optionId: option.id,
        label: "Departure day",
        startTimeLocal: "08:30",
        durationMinutes: 480,
        active: true,
      })
      .returning()

    const [slot] = await db
      .insert(availabilitySlots)
      .values({
        productId: product.id,
        itineraryId: defaultItinerary.id,
        optionId: option.id,
        startTimeId: startTime.id,
        dateLocal: "2026-08-01",
        startsAt: new Date("2026-08-01T05:30:00.000Z"),
        endsAt: new Date("2026-08-01T13:30:00.000Z"),
        timezone: "Europe/Bucharest",
        status: "open",
        remainingPax: 12,
        initialPax: 24,
        nights: 7,
        days: 8,
      })
      .returning()

    await db.insert(departurePriceOverrides).values({
      departureId: slot.id,
      optionId: option.id,
      optionUnitId: unit.id,
      priceCatalogId: catalog.id,
      sellAmountCents: 150000,
      active: true,
    })

    const listRes = await app.request(`/products/${product.id}/departures`)
    expect(listRes.status).toBe(200)
    expect(await listRes.json()).toEqual({
      data: [
        {
          id: slot.id,
          productId: product.id,
          itineraryId: defaultItinerary.id,
          optionId: option.id,
          dateLocal: "2026-08-01",
          startAt: "2026-08-01T05:30:00.000Z",
          endAt: "2026-08-01T13:30:00.000Z",
          timezone: "Europe/Bucharest",
          startTime: {
            id: startTime.id,
            label: "Departure day",
            startTimeLocal: "08:30",
            durationMinutes: 480,
          },
          meetingPoint: "Bucharest Airport",
          capacity: 24,
          remaining: 12,
          departureStatus: "open",
          nights: 7,
          days: 8,
          resourceManifest: null,
          ratePlans: [
            {
              id: rule.id,
              active: true,
              name: "Cruise public rate",
              pricingModel: "per_room_person",
              basePrices: [],
              roomPrices: [
                {
                  amount: 1500,
                  currencyCode: "EUR",
                  roomType: {
                    id: unit.id,
                    name: "Double Cabin",
                    occupancy: {
                      adultsMin: 2,
                      adultsMax: 2,
                      childrenMax: 0,
                    },
                  },
                },
              ],
            },
          ],
        },
      ],
      total: 1,
      limit: 100,
      offset: 0,
    })

    const detailRes = await app.request(`/departures/${slot.id}`)
    expect(detailRes.status).toBe(200)
    expect((await detailRes.json()).data.id).toBe(slot.id)

    const availabilityRes = await app.request(
      `/products/${product.id}/availability?dateFrom=2026-08-01`,
    )
    expect(availabilityRes.status).toBe(200)
    expect(await availabilityRes.json()).toEqual({
      data: {
        productId: product.id,
        availabilityState: "available",
        counts: {
          total: 1,
          open: 1,
          closed: 0,
          soldOut: 0,
          cancelled: 0,
          onRequest: 0,
          pastCutoff: 0,
          tooEarly: 0,
          available: 1,
        },
        departures: [
          {
            id: slot.id,
            productId: product.id,
            optionId: option.id,
            dateLocal: "2026-08-01",
            startAt: "2026-08-01T05:30:00.000Z",
            endAt: "2026-08-01T13:30:00.000Z",
            timezone: "Europe/Bucharest",
            status: "open",
            availabilityState: "available",
            capacity: 24,
            remaining: 12,
            pastCutoff: false,
            tooEarly: false,
          },
        ],
        total: 1,
        limit: 100,
        offset: 0,
      },
    })
  })

  it("returns a departure price preview with extras", async () => {
    const [product] = await db
      .insert(products)
      .values({
        name: "City break",
        status: "active",
        activated: true,
        visibility: "public",
        sellCurrency: "EUR",
      })
      .returning()

    const [option] = await db
      .insert(productOptions)
      .values({
        productId: product.id,
        name: "Standard",
        status: "active",
        isDefault: true,
      })
      .returning()

    const [_defaultItinerary] = await db
      .insert(productItineraries)
      .values({
        productId: product.id,
        name: "Main itinerary",
        isDefault: true,
      })
      .returning()

    const [adultUnit] = await db
      .insert(optionUnits)
      .values({
        optionId: option.id,
        name: "Adult",
        unitType: "person",
        isHidden: false,
      })
      .returning()

    const [catalog] = await db
      .insert(priceCatalogs)
      .values({
        code: "PUBLIC-EUR",
        name: "Public EUR",
        currencyCode: "EUR",
        catalogType: "public",
        isDefault: true,
        active: true,
      })
      .returning()

    const [rule] = await db
      .insert(optionPriceRules)
      .values({
        productId: product.id,
        optionId: option.id,
        priceCatalogId: catalog.id,
        name: "Standard rate",
        pricingMode: "per_person",
        isDefault: true,
        active: true,
      })
      .returning()

    await db.insert(optionUnitPriceRules).values({
      optionPriceRuleId: rule.id,
      optionId: option.id,
      unitId: adultUnit.id,
      pricingMode: "per_unit",
      sellAmountCents: 30000,
      active: true,
    })

    const [extra] = await db
      .insert(productExtras)
      .values({
        productId: product.id,
        name: "Airport transfer",
        pricingMode: "per_booking",
        active: true,
      })
      .returning()

    await db.insert(extraPriceRules).values({
      optionPriceRuleId: rule.id,
      optionId: option.id,
      productExtraId: extra.id,
      pricingMode: "per_booking",
      sellAmountCents: 1500,
      active: true,
    })

    const [fxRateSet] = await db
      .insert(fxRateSets)
      .values({
        baseCurrency: "EUR",
        effectiveAt: new Date("2026-04-01T00:00:00.000Z"),
      })
      .returning()

    await db.insert(exchangeRates).values({
      fxRateSetId: fxRateSet.id,
      baseCurrency: "EUR",
      quoteCurrency: "USD",
      rateDecimal: "2",
    })

    const [slot] = await db
      .insert(availabilitySlots)
      .values({
        productId: product.id,
        optionId: option.id,
        dateLocal: "2026-06-15",
        startsAt: new Date("2026-06-15T08:00:00.000Z"),
        endsAt: new Date("2026-06-15T10:00:00.000Z"),
        timezone: "Europe/Bucharest",
        status: "open",
        remainingPax: 10,
      })
      .returning()

    await db.insert(departurePriceOverrides).values({
      departureId: slot.id,
      optionId: option.id,
      optionUnitId: adultUnit.id,
      priceCatalogId: catalog.id,
      sellAmountCents: 40000,
      active: true,
    })

    const previewApp = createActivePublicApiApp()
      .use("*", async (c, next) => {
        c.set("db" as never, db)
        await next()
      })
      .route(
        "/",
        createPublicApiRoutes({
          ...allowPublishedProducts,
          offers: {
            listApplicableOffers({ productId, departureId }) {
              expect(productId).toBe(product.id)
              expect(departureId).toBe(slot.id)

              return [
                {
                  id: "offer_early_10",
                  name: "Early booking",
                  slug: "early-booking",
                  description: "Save on early bookings.",
                  discountType: "percentage",
                  discountValue: "10",
                  currency: null,
                  applicableProductIds: [product.id],
                  applicableDepartureIds: [slot.id],
                  validFrom: null,
                  validTo: null,
                  minTravelers: 2,
                  imageMobileUrl: null,
                  imageDesktopUrl: null,
                  stackable: false,
                  createdAt: "2026-04-01T00:00:00.000Z",
                  updatedAt: "2026-04-01T00:00:00.000Z",
                },
              ]
            },
          },
        }),
      )

    const res = await previewApp.request(`/departures/${slot.id}/price`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        currencyCode: "USD",
        pax: { adults: 2, children: 0, infants: 0 },
        extras: [{ extraId: extra.id, quantity: 1 }],
      }),
    })

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toMatchObject({
      data: {
        departureId: slot.id,
        productId: product.id,
        optionId: option.id,
        currencyCode: "USD",
        basePrice: 1600,
        taxAmount: 0,
        total: 1467,
        notes: null,
        lineItems: [
          {
            name: "Standard · Adult",
            total: 1600,
            quantity: 2,
            unitPrice: 800,
          },
          {
            name: "Airport transfer",
            total: 30,
            quantity: 1,
            unitPrice: 30,
          },
        ],
        allocation: {
          slot: {
            id: slot.id,
            productId: product.id,
            optionId: option.id,
            dateLocal: "2026-06-15",
            startAt: "2026-06-15T08:00:00.000Z",
            endAt: "2026-06-15T10:00:00.000Z",
            timezone: "Europe/Bucharest",
            status: "open",
            availabilityState: "available",
            capacity: 10,
            remaining: 10,
            pastCutoff: false,
            tooEarly: false,
          },
          pax: {
            adults: 2,
            children: 0,
            infants: 0,
            total: 2,
          },
          requestedUnits: [
            {
              unitId: adultUnit.id,
              requestRef: adultUnit.id,
              name: "Adult",
              unitType: "person",
              quantity: 2,
              pricingMode: "per_unit",
              unitPrice: 800,
              total: 1600,
              currencyCode: "USD",
              tierId: null,
            },
          ],
          rooms: [],
        },
        units: [
          {
            unitId: adultUnit.id,
            requestRef: adultUnit.id,
            name: "Adult",
            unitType: "person",
            quantity: 2,
            pricingMode: "per_unit",
            unitPrice: 800,
            total: 1600,
            currencyCode: "USD",
            tierId: null,
          },
        ],
        rooms: [],
        extras: [
          {
            extraId: extra.id,
            name: "Airport transfer",
            required: false,
            selectable: true,
            selected: true,
            pricingMode: "per_booking",
            quantity: 1,
            unitPrice: 30,
            total: 30,
            currencyCode: "USD",
          },
        ],
        offers: {
          available: [
            {
              offer: {
                id: "offer_early_10",
                name: "Early booking",
                slug: "early-booking",
              },
              status: "applied",
              reason: null,
              selected: true,
              discountAppliedCents: 16300,
              discountedPriceCents: 146700,
            },
          ],
          requested: [],
          applied: [
            {
              offerId: "offer_early_10",
              offerName: "Early booking",
              discountAppliedCents: 16300,
              discountedPriceCents: 146700,
              currency: "USD",
              discountKind: "percentage",
              discountPercent: 10,
              discountAmountCents: null,
              appliedCode: null,
              stackable: false,
            },
          ],
          conflict: null,
          discountTotal: 163,
          discountTotalCents: 16300,
          totalAfterDiscount: 1467,
          currencyCode: "USD",
        },
        totals: {
          currencyCode: "USD",
          base: 1600,
          extras: 30,
          subtotal: 1630,
          discount: 163,
          tax: 0,
          total: 1467,
          perPerson: 733.5,
          perBooking: 1467,
        },
      },
    })
  })

  it("uses room occupancy for price-preview offer pax and per-person totals", async () => {
    const [product] = await db
      .insert(products)
      .values({
        name: "Room package",
        status: "active",
        activated: true,
        visibility: "public",
        sellCurrency: "EUR",
      })
      .returning()

    const [option] = await db
      .insert(productOptions)
      .values({
        productId: product.id,
        name: "Double room",
        status: "active",
        isDefault: true,
      })
      .returning()

    await db.insert(productItineraries).values({
      productId: product.id,
      name: "Main itinerary",
      isDefault: true,
    })

    const [roomUnit] = await db
      .insert(optionUnits)
      .values({
        optionId: option.id,
        name: "Double",
        unitType: "room",
        occupancyMin: 1,
        occupancyMax: 2,
        isHidden: false,
      })
      .returning()

    const [catalog] = await db
      .insert(priceCatalogs)
      .values({
        code: "PUBLIC-ROOM-EUR",
        name: "Public Room EUR",
        currencyCode: "EUR",
        catalogType: "public",
        isDefault: true,
        active: true,
      })
      .returning()

    const [rule] = await db
      .insert(optionPriceRules)
      .values({
        productId: product.id,
        optionId: option.id,
        priceCatalogId: catalog.id,
        name: "Room rate",
        pricingMode: "per_person",
        isDefault: true,
        active: true,
      })
      .returning()

    await db.insert(optionUnitPriceRules).values({
      optionPriceRuleId: rule.id,
      optionId: option.id,
      unitId: roomUnit.id,
      pricingMode: "per_person",
      sellAmountCents: 10000,
      active: true,
    })

    const [slot] = await db
      .insert(availabilitySlots)
      .values({
        productId: product.id,
        optionId: option.id,
        dateLocal: "2026-07-20",
        startsAt: new Date("2026-07-20T10:00:00.000Z"),
        endsAt: new Date("2026-07-20T12:00:00.000Z"),
        timezone: "Europe/Bucharest",
        status: "open",
        remainingPax: 4,
      })
      .returning()

    const previewApp = createActivePublicApiApp()
      .use("*", async (c, next) => {
        c.set("db" as never, db)
        await next()
      })
      .route(
        "/",
        createPublicApiRoutes({
          ...allowPublishedProducts,
          offers: {
            listApplicableOffers({ productId, departureId }) {
              expect(productId).toBe(product.id)
              expect(departureId).toBe(slot.id)

              return [
                {
                  id: "offer_room_10",
                  name: "Room offer",
                  slug: "room-offer",
                  description: null,
                  discountType: "percentage",
                  discountValue: "10",
                  currency: null,
                  applicableProductIds: [product.id],
                  applicableDepartureIds: [slot.id],
                  validFrom: null,
                  validTo: null,
                  minTravelers: 2,
                  imageMobileUrl: null,
                  imageDesktopUrl: null,
                  stackable: false,
                  createdAt: "2026-04-01T00:00:00.000Z",
                  updatedAt: "2026-04-01T00:00:00.000Z",
                },
              ]
            },
          },
        }),
      )

    const res = await previewApp.request(`/departures/${slot.id}/price`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        rooms: [{ unitId: roomUnit.id, occupancy: 2, quantity: 1 }],
      }),
    })

    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({
      data: {
        basePrice: 200,
        total: 180,
        allocation: {
          pax: {
            total: 2,
          },
          rooms: [
            {
              unitId: roomUnit.id,
              pax: 2,
              unitPrice: 100,
              total: 200,
              currencyCode: "EUR",
            },
          ],
        },
        rooms: [
          {
            unitId: roomUnit.id,
            pax: 2,
            unitPrice: 100,
            total: 200,
            currencyCode: "EUR",
          },
        ],
        offers: {
          available: [
            {
              status: "applied",
              reason: null,
              discountAppliedCents: 2000,
              discountedPriceCents: 18000,
            },
          ],
          discountTotal: 20,
          totalAfterDiscount: 180,
        },
        totals: {
          subtotal: 200,
          discount: 20,
          total: 180,
          perPerson: 90,
          perBooking: 180,
        },
      },
    })
  })

  it("returns storefront extensions and itinerary content", async () => {
    const [product] = await db
      .insert(products)
      .values({
        name: "Island hopping",
        status: "active",
        activated: true,
        visibility: "public",
        sellCurrency: "EUR",
      })
      .returning()

    const [option] = await db
      .insert(productOptions)
      .values({
        productId: product.id,
        name: "Explorer",
        status: "active",
        isDefault: true,
      })
      .returning()

    const [catalog] = await db
      .insert(priceCatalogs)
      .values({
        code: "PUBLIC-EUR",
        name: "Public EUR",
        currencyCode: "EUR",
        catalogType: "public",
        isDefault: true,
        active: true,
      })
      .returning()

    const [rule] = await db
      .insert(optionPriceRules)
      .values({
        productId: product.id,
        optionId: option.id,
        priceCatalogId: catalog.id,
        name: "Explorer rate",
        pricingMode: "per_person",
        isDefault: true,
        active: true,
      })
      .returning()

    const [extra] = await db
      .insert(productExtras)
      .values({
        productId: product.id,
        name: "Snorkeling pack",
        description: "Mask, fins, and guided reef stop.",
        selectionType: "optional",
        pricingMode: "per_person",
        pricedPerPerson: true,
        metadata: {
          refProductId: "prod_related_123",
          thumbUrl: "https://cdn.example.com/snorkel-thumb.jpg",
          media: [
            {
              url: "https://cdn.example.com/snorkel-1.jpg",
              alt: "Snorkeling gear",
            },
          ],
        },
      })
      .returning()

    await db.insert(extraPriceRules).values({
      optionPriceRuleId: rule.id,
      optionId: option.id,
      productExtraId: extra.id,
      pricingMode: "per_person",
      sellAmountCents: 4500,
      active: true,
    })

    const [defaultItinerary] = await db
      .insert(productItineraries)
      .values({
        productId: product.id,
        name: "Main itinerary",
        isDefault: true,
      })
      .returning()

    const [variantItinerary] = await db
      .insert(productItineraries)
      .values({
        productId: product.id,
        name: "Island variant",
        isDefault: false,
        sortOrder: 1,
      })
      .returning()

    const [dayOne] = await db
      .insert(productDays)
      .values({
        itineraryId: defaultItinerary.id,
        dayNumber: 1,
        title: "Arrival",
        description: "Transfer and welcome dinner.",
      })
      .returning()

    const [variantDay] = await db
      .insert(productDays)
      .values({
        itineraryId: variantItinerary.id,
        dayNumber: 1,
        title: "Island loop",
        description: "Variant day content.",
      })
      .returning()

    const [service] = await db
      .insert(productDayServices)
      .values({
        dayId: dayOne.id,
        serviceType: "experience",
        name: "Sunset cruise",
        description: "Harbor sail at golden hour.",
        costCurrency: "EUR",
        costAmountCents: 0,
        quantity: 1,
        sortOrder: 1,
      })
      .returning()

    await db.insert(productDayTranslations).values({
      dayId: dayOne.id,
      languageTag: "ro",
      title: "Sosire",
      description: "Transfer si cina de bun venit.",
    })

    await db.insert(productDayServiceTranslations).values({
      serviceId: service.id,
      languageTag: "ro",
      name: "Croaziera la apus",
      description: "Navigare prin port la ora de aur.",
    })

    await db.insert(productMedia).values({
      productId: product.id,
      dayId: dayOne.id,
      mediaType: "image",
      name: "Arrival day cover",
      url: "https://cdn.example.com/day-1.jpg",
      isCover: true,
    })

    const [variantSlot] = await db
      .insert(availabilitySlots)
      .values({
        productId: product.id,
        itineraryId: variantItinerary.id,
        optionId: option.id,
        dateLocal: "2026-09-01",
        startsAt: new Date("2026-09-01T08:00:00.000Z"),
        timezone: "Europe/Bucharest",
        status: "open",
        remainingPax: 8,
      })
      .returning()

    const extensionsRes = await app.request(
      `/products/${product.id}/extensions?optionId=${option.id}`,
    )
    expect(extensionsRes.status).toBe(200)
    expect(await extensionsRes.json()).toEqual({
      data: {
        extensions: [
          {
            id: extra.id,
            name: "Snorkeling pack",
            label: "Snorkeling pack",
            required: false,
            selectable: true,
            hasOptions: false,
            refProductId: "prod_related_123",
            thumb: "https://cdn.example.com/snorkel-thumb.jpg",
            pricePerPerson: 45,
            currencyCode: "EUR",
            pricingMode: "per_person",
            defaultQuantity: null,
            minQuantity: null,
            maxQuantity: null,
          },
        ],
        items: [
          {
            id: extra.id,
            name: "Snorkeling pack",
            label: "Snorkeling pack",
            required: false,
            selectable: true,
            hasOptions: false,
            refProductId: "prod_related_123",
            thumb: "https://cdn.example.com/snorkel-thumb.jpg",
            pricePerPerson: 45,
            currencyCode: "EUR",
            pricingMode: "per_person",
            defaultQuantity: null,
            minQuantity: null,
            maxQuantity: null,
          },
        ],
        details: {
          [extra.id]: {
            description: "Mask, fins, and guided reef stop.",
            media: [
              {
                url: "https://cdn.example.com/snorkel-1.jpg",
                alt: "Snorkeling gear",
              },
            ],
          },
        },
        currencyCode: "EUR",
      },
    })

    const itineraryRes = await app.request(
      `/products/${product.id}/departures/dep_compat_123/itinerary`,
    )
    expect(itineraryRes.status).toBe(200)
    expect(await itineraryRes.json()).toEqual({
      data: {
        id: "dep_compat_123",
        itineraryId: defaultItinerary.id,
        days: [
          {
            id: dayOne.id,
            title: "Arrival",
            description: "Transfer and welcome dinner.",
            thumbnail: {
              url: "https://cdn.example.com/day-1.jpg",
            },
            segments: [
              {
                id: service.id,
                title: "Sunset cruise",
                description: "Harbor sail at golden hour.",
              },
            ],
          },
        ],
      },
    })

    const localizedItineraryRes = await app.request(
      `/products/${product.id}/departures/dep_compat_123/itinerary?lang=ro`,
    )
    expect(localizedItineraryRes.status).toBe(200)
    expect(await localizedItineraryRes.json()).toEqual({
      data: {
        id: "dep_compat_123",
        itineraryId: defaultItinerary.id,
        days: [
          {
            id: dayOne.id,
            title: "Sosire",
            description: "Transfer si cina de bun venit.",
            thumbnail: {
              url: "https://cdn.example.com/day-1.jpg",
            },
            segments: [
              {
                id: service.id,
                title: "Croaziera la apus",
                description: "Navigare prin port la ora de aur.",
              },
            ],
          },
        ],
      },
    })

    const variantItineraryRes = await app.request(
      `/products/${product.id}/departures/${variantSlot.id}/itinerary`,
    )
    expect(variantItineraryRes.status).toBe(200)
    expect(await variantItineraryRes.json()).toEqual({
      data: {
        id: variantSlot.id,
        itineraryId: variantItinerary.id,
        days: [
          {
            id: variantDay.id,
            title: "Island loop",
            description: "Variant day content.",
            thumbnail: null,
            segments: [],
          },
        ],
      },
    })
  })
})
