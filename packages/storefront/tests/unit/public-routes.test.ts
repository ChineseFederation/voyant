// agent-quality: file-size exception -- owner: storefront; existing coverage file stays co-located until a dedicated split preserves behavior and tests.
import { handleApiError } from "@voyant-travel/hono"
import { Hono } from "hono"
import { describe, expect, it, vi } from "vitest"

import { createStorefrontPublicRoutes } from "../../src/routes-public.js"

function createActiveStorefrontApp() {
  return new Hono().use("*", async (c, next) => {
    c.set(
      "storefrontChannel" as never,
      {
        storefrontId: "sf_bound",
        channelId: "chan_bound",
        channelStatus: "active",
      } as never,
    )
    await next()
  })
}

describe("createStorefrontPublicRoutes", () => {
  it("passes server-derived storefront channel context to publication guards", async () => {
    const isProductPublished = vi.fn(async () => false)
    const app = createActiveStorefrontApp()
    app.route(
      "/",
      createStorefrontPublicRoutes({
        publication: { isProductPublished },
      }),
    )

    const res = await app.request("/products/prod_1/departures?channelId=chan_public_param")

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ data: [], total: 0, limit: 100, offset: 0 })
    expect(isProductPublished).toHaveBeenCalledWith({
      productId: "prod_1",
      context: expect.objectContaining({
        storefrontId: "sf_bound",
        channelId: "chan_bound",
        channelStatus: "active",
      }),
    })
  })

  it("fails closed when the publication provider is unavailable", async () => {
    const app = createActiveStorefrontApp()
    app.route("/", createStorefrontPublicRoutes())

    const res = await app.request("/products/prod_1/departures")

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ data: [], total: 0, limit: 100, offset: 0 })
  })

  it("serves a storefront whose channel context came from the implicit Direct default", async () => {
    // The guard asks whether the request has an active channel, not whether an
    // operator configured one. Nothing binds this storefront explicitly; the
    // binding provider resolved it to the deployment's system Direct channel,
    // and from here that is indistinguishable from a chosen one (#4624).
    const isProductPublished = vi.fn(async () => false)
    const app = new Hono().use("*", async (c, next) => {
      c.set(
        "storefrontChannel" as never,
        {
          storefrontId: "sf_unbound",
          channelId: "chan_system_direct",
          channelStatus: "active",
        } as never,
      )
      await next()
    })
    app.route("/", createStorefrontPublicRoutes({ publication: { isProductPublished } }))

    const res = await app.request("/products/prod_1/departures")

    expect(res.status).toBe(200)
    expect(isProductPublished).toHaveBeenCalledWith({
      productId: "prod_1",
      context: expect.objectContaining({ channelId: "chan_system_direct" }),
    })
  })

  it("rejects public requests without an active storefront channel context", async () => {
    const app = new Hono().route("/", createStorefrontPublicRoutes())

    const res = await app.request("/settings")

    expect(res.status).toBe(403)
    expect(await res.json()).toEqual({
      error: "Active storefront channel context is required.",
    })
  })

  it("rejects malformed composite price-preview selections with public-route errors", async () => {
    const app = createActiveStorefrontApp()
    app.onError(handleApiError)
    app.route("/", createStorefrontPublicRoutes())

    const res = await app.request("/departures/dep_123/price", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        rooms: [{ unitId: "", occupancy: 1, quantity: 1 }],
        extras: [{ extraId: "", quantity: 1 }],
        offers: [{ slug: "" }],
      }),
    })

    expect(res.status).toBe(400)
    expect(await res.json()).toMatchObject({ code: "invalid_request" })
  })

  it("returns normalized storefront settings", async () => {
    const app = createActiveStorefrontApp().route(
      "/",
      createStorefrontPublicRoutes({
        settings: {
          support: {
            email: "help@example.com",
            phone: "+40 723 123 456",
          },
          legal: {
            termsUrl: "https://example.com/terms",
            privacyUrl: "https://example.com/privacy",
            defaultContractTemplateId: "tmpl_123",
          },
          forms: {
            billing: {
              fields: [
                {
                  key: "email",
                  label: "Email",
                  type: "email",
                  required: true,
                  autocomplete: "email",
                },
              ],
            },
            travelers: {
              fields: [
                {
                  key: "passportNumber",
                  label: "Passport number",
                  placeholder: "AB123456",
                },
              ],
            },
          },
          payment: {
            defaultMethod: "card",
            methods: [
              { code: "card" },
              {
                code: "bank_transfer",
                label: "Wire transfer",
                description: "Use manual settlement for larger balances.",
              },
            ],
          },
        },
      }),
    )

    const res = await app.request("/settings")

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      data: {
        support: {
          email: "help@example.com",
          phone: "+40 723 123 456",
          links: [],
        },
        legal: {
          termsUrl: "https://example.com/terms",
          privacyUrl: "https://example.com/privacy",
          cancellationUrl: null,
          defaultContractTemplateId: "tmpl_123",
        },
        localization: {
          defaultLocale: null,
          currencyDisplay: "code",
        },
        forms: {
          billing: {
            fields: [
              {
                key: "email",
                label: "Email",
                type: "email",
                required: true,
                placeholder: null,
                description: null,
                autocomplete: "email",
                options: [],
              },
            ],
          },
          travelers: {
            fields: [
              {
                key: "passportNumber",
                label: "Passport number",
                type: "text",
                required: false,
                placeholder: "AB123456",
                description: null,
                autocomplete: null,
                options: [],
              },
            ],
          },
        },
        payment: {
          defaultMethod: "card",
          structure: "full",
          schedule: [],
          defaultSchedule: null,
          bankTransfer: null,
          methods: [
            {
              code: "card",
              label: "Card",
              description: null,
              enabled: true,
            },
            {
              code: "bank_transfer",
              label: "Wire transfer",
              description: "Use manual settlement for larger balances.",
              enabled: true,
            },
          ],
        },
      },
    })
  })

  it("fills missing storefront settings with stable defaults", async () => {
    const app = createActiveStorefrontApp().route("/", createStorefrontPublicRoutes())

    const res = await app.request("/settings")

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      data: {
        support: {
          email: null,
          phone: null,
          links: [],
        },
        legal: {
          termsUrl: null,
          privacyUrl: null,
          cancellationUrl: null,
          defaultContractTemplateId: null,
        },
        localization: {
          defaultLocale: null,
          currencyDisplay: "code",
        },
        forms: {
          billing: { fields: [] },
          travelers: { fields: [] },
        },
        payment: {
          defaultMethod: null,
          methods: [],
          structure: "full",
          schedule: [],
          defaultSchedule: null,
          bankTransfer: null,
        },
      },
    })
  })

  it("lets host apps reject public intake through the guard hook", async () => {
    const guard = vi.fn(() => ({
      allowed: false,
      status: 429 as const,
      error: "Captcha required",
    }))
    const app = createActiveStorefrontApp().route(
      "/",
      createStorefrontPublicRoutes({
        intake: { guard },
      }),
    )

    const res = await app.request("/leads", {
      method: "POST",
      body: JSON.stringify({
        contact: {
          email: "ana@example.com",
        },
        consent: {
          gdpr: true,
        },
      }),
      headers: {
        "content-type": "application/json",
      },
    })

    expect(res.status).toBe(429)
    expect(await res.json()).toEqual({ error: "Captcha required" })
    expect(guard).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "lead",
        body: expect.objectContaining({
          contact: expect.objectContaining({ email: "ana@example.com" }),
        }),
      }),
    )
  })

  it("resolves storefront settings from request context", async () => {
    const requestDb = { tenant: "tenant_123" }
    const app = createActiveStorefrontApp()
      .use("*", async (c, next) => {
        c.set("db" as never, requestDb)
        await next()
      })
      .route(
        "/",
        createStorefrontPublicRoutes({
          resolveSettings({ db, context }) {
            expect(db).toBe(requestDb)
            const honoContext = context as { req: { header: (name: string) => string | undefined } }

            return {
              support: {
                email: `${honoContext.req.header("x-storefront") ?? "default"}@example.com`,
              },
            }
          },
        }),
      )

    const res = await app.request("/settings", {
      headers: {
        "x-storefront": "bucharest",
      },
    })

    expect(res.status).toBe(200)
    expect((await res.json()).data.support.email).toBe("bucharest@example.com")
  })

  it("returns applicable promotional offers from the injected resolver", async () => {
    const app = createActiveStorefrontApp().route(
      "/",
      createStorefrontPublicRoutes({
        offers: {
          async listApplicableOffers({ productId, departureId, locale }) {
            expect(productId).toBe("prod_123")
            expect(departureId).toBe("dep_456")
            expect(locale).toBe("ro")

            return [
              {
                id: "offer_1",
                name: "Early booking",
                slug: "early-booking",
                description: "Save on early bookings.",
                discountType: "percentage",
                discountValue: "15",
                currency: null,
                applicableProductIds: ["prod_123"],
                applicableDepartureIds: ["dep_456"],
                validFrom: "2026-04-01T00:00:00.000Z",
                validTo: "2026-04-30T23:59:59.000Z",
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

    const res = await app.request("/products/prod_123/offers?departureId=dep_456&locale=ro")

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      data: [
        {
          id: "offer_1",
          name: "Early booking",
          slug: "early-booking",
          description: "Save on early bookings.",
          discountType: "percentage",
          discountValue: "15",
          currency: null,
          applicableProductIds: ["prod_123"],
          applicableDepartureIds: ["dep_456"],
          validFrom: "2026-04-01T00:00:00.000Z",
          validTo: "2026-04-30T23:59:59.000Z",
          minTravelers: 2,
          imageMobileUrl: null,
          imageDesktopUrl: null,
          stackable: false,
          createdAt: "2026-04-01T00:00:00.000Z",
          updatedAt: "2026-04-01T00:00:00.000Z",
        },
      ],
    })
  })

  it("returns an offer by slug from the injected resolver", async () => {
    const app = createActiveStorefrontApp().route(
      "/",
      createStorefrontPublicRoutes({
        offers: {
          async getOfferBySlug({ slug, locale }) {
            expect(slug).toBe("early-booking")
            expect(locale).toBe("en")

            return {
              id: "offer_1",
              name: "Early booking",
              slug: "early-booking",
              description: "Save on early bookings.",
              discountType: "percentage",
              discountValue: "15",
              currency: null,
              applicableProductIds: ["prod_123"],
              applicableDepartureIds: [],
              validFrom: "2026-04-01T00:00:00.000Z",
              validTo: "2026-04-30T23:59:59.000Z",
              minTravelers: null,
              imageMobileUrl: null,
              imageDesktopUrl: null,
              stackable: false,
              createdAt: "2026-04-01T00:00:00.000Z",
              updatedAt: "2026-04-01T00:00:00.000Z",
            }
          },
        },
      }),
    )

    const res = await app.request("/offers/early-booking?locale=en")

    expect(res.status).toBe(200)
    expect((await res.json()).data.slug).toBe("early-booking")
  })

  it("resolves promotional offers from request context", async () => {
    const requestDb = { tenant: "tenant_123" }
    const app = createActiveStorefrontApp()
      .use("*", async (c, next) => {
        c.set("db" as never, requestDb)
        await next()
      })
      .route(
        "/",
        createStorefrontPublicRoutes({
          resolveOffers({ db }) {
            expect(db).toBe(requestDb)

            return {
              listApplicableOffers({ productId, db: callbackDb }) {
                expect(productId).toBe("prod_123")
                expect(callbackDb).toBe(requestDb)

                return [
                  {
                    id: "offer_context",
                    name: "Context offer",
                    slug: "context-offer",
                    description: null,
                    discountType: "percentage",
                    discountValue: "10",
                    currency: null,
                    applicableProductIds: ["prod_123"],
                    applicableDepartureIds: [],
                    validFrom: null,
                    validTo: null,
                    minTravelers: null,
                    imageMobileUrl: null,
                    imageDesktopUrl: null,
                    stackable: false,
                    createdAt: "2026-04-01T00:00:00.000Z",
                    updatedAt: "2026-04-01T00:00:00.000Z",
                  },
                ]
              },
            }
          },
        }),
      )

    const res = await app.request("/products/prod_123/offers")

    expect(res.status).toBe(200)
    expect((await res.json()).data[0].id).toBe("offer_context")
  })

  it("applies a storefront offer through the injected resolver", async () => {
    const app = createActiveStorefrontApp().route(
      "/",
      createStorefrontPublicRoutes({
        offers: {
          applyOffer({ slug, body }) {
            expect(slug).toBe("early-booking")
            expect(body).toMatchObject({
              productId: "prod_123",
              basePriceCents: 10000,
              currency: "USD",
              pax: 2,
              audience: "customer",
              market: "default",
            })

            return {
              status: "applied",
              reason: null,
              offer: {
                id: "offer_1",
                name: "Early booking",
                slug: "early-booking",
                description: null,
                discountType: "percentage",
                discountValue: "15",
                currency: null,
                applicableProductIds: ["prod_123"],
                applicableDepartureIds: [],
                validFrom: null,
                validTo: null,
                minTravelers: null,
                imageMobileUrl: null,
                imageDesktopUrl: null,
                stackable: false,
                createdAt: "2026-04-01T00:00:00.000Z",
                updatedAt: "2026-04-01T00:00:00.000Z",
              },
              target: {
                bookingId: "book_123",
                sessionId: null,
                productId: "prod_123",
                departureId: null,
              },
              pricing: {
                basePriceCents: 10000,
                currency: "USD",
                discountAppliedCents: 1500,
                discountedPriceCents: 8500,
              },
              appliedOffers: [
                {
                  offerId: "offer_1",
                  offerName: "Early booking",
                  discountAppliedCents: 1500,
                  discountedPriceCents: 8500,
                  currency: "USD",
                  discountKind: "percentage",
                  discountPercent: 15,
                  discountAmountCents: null,
                  appliedCode: null,
                  stackable: false,
                },
              ],
              conflict: null,
            }
          },
        },
      }),
    )

    const res = await app.request("/offers/early-booking/apply", {
      method: "POST",
      body: JSON.stringify({
        productId: "prod_123",
        bookingId: "book_123",
        basePriceCents: 10000,
        currency: "usd",
        pax: 2,
      }),
      headers: { "content-type": "application/json" },
    })

    expect(res.status).toBe(200)
    expect((await res.json()).data.pricing.discountedPriceCents).toBe(8500)
  })

  it("redeems a code-based storefront offer through the injected resolver", async () => {
    const app = createActiveStorefrontApp().route(
      "/",
      createStorefrontPublicRoutes({
        offers: {
          redeemOffer({ body }) {
            expect(body.code).toBe("SPRING25")
            return {
              status: "invalid",
              reason: "code_expired",
              offer: null,
              target: {
                bookingId: null,
                sessionId: "sess_123",
                productId: "prod_123",
                departureId: null,
              },
              pricing: {
                basePriceCents: 10000,
                currency: "EUR",
                discountAppliedCents: 0,
                discountedPriceCents: 10000,
              },
              appliedOffers: [],
              conflict: null,
            }
          },
        },
      }),
    )

    const res = await app.request("/offers/redeem", {
      method: "POST",
      body: JSON.stringify({
        code: "SPRING25",
        productId: "prod_123",
        sessionId: "sess_123",
        basePriceCents: 10000,
        currency: "EUR",
        pax: 2,
      }),
      headers: { "content-type": "application/json" },
    })

    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({
      data: {
        status: "invalid",
        reason: "code_expired",
      },
    })
  })

  it("returns 501 when offer mutation resolvers are not configured", async () => {
    const app = createActiveStorefrontApp().route("/", createStorefrontPublicRoutes())

    const res = await app.request("/offers/redeem", {
      method: "POST",
      body: JSON.stringify({
        code: "SPRING25",
        productId: "prod_123",
        basePriceCents: 10000,
        currency: "USD",
        pax: 2,
      }),
      headers: { "content-type": "application/json" },
    })

    expect(res.status).toBe(501)
  })
})
