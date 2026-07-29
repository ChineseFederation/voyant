// agent-quality: file-size exception -- owner: storefront; existing route module stays co-located until a dedicated split preserves behavior and tests.
import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi"
import {
  openApiValidationHook,
  parseJsonBody,
  parseQuery,
  type VoyantBindings,
  type VoyantVariables,
} from "@voyant-travel/hono"
import type { Context } from "hono"

import {
  departuresDocKey,
  readThroughDepartures,
} from "./departures-read-model.js"
import {
  createStorefrontService,
  type StorefrontRequestContext,
  type StorefrontServiceOptions,
} from "./service.js"
import {
  type StorefrontLeadIntakeInput,
  type StorefrontNewsletterSubscribeInput,
  storefrontDepartureItineraryQuerySchema,
  storefrontDepartureItinerarySchema,
  storefrontDepartureListQuerySchema,
  storefrontDepartureListResponseSchema,
  storefrontDeparturePricePreviewInputSchema,
  storefrontDepartureSchema,
  type storefrontExtensionPricingModeSchema,
  storefrontLeadIntakeEnvelopeSchema,
  storefrontLeadIntakeInputSchema,
  storefrontNewsletterSubscribeEnvelopeSchema,
  storefrontNewsletterSubscribeInputSchema,
  storefrontOfferApplyInputSchema,
  storefrontOfferMutationResponseSchema,
  storefrontOfferRedeemInputSchema,
  storefrontProductAvailabilitySummaryQuerySchema,
  storefrontProductAvailabilitySummaryResponseSchema,
  storefrontProductExtensionsQuerySchema,
  storefrontProductExtensionsResponseSchema,
  storefrontPromotionalOfferListQuerySchema,
  storefrontPromotionalOfferListResponseSchema,
  storefrontPromotionalOfferResponseSchema,
  storefrontSettingsSchema,
} from "./validation.js"
import { storefrontTransportEligibilityInputSchema } from "./validation-transport-eligibility.js"

/**
 * Shared-cache marker for non-personalized catalog reads (departure
 * detail/list, itineraries). Same data for every visitor; the framework
 * cache layer (`publicResponseCache` in @voyant-travel/hono) and the platform
 * dispatcher only cache responses explicitly marked like this. Applied
 * to success responses only.
 */
const PUBLIC_CACHE_CONTROL = "public, s-maxage=60, stale-while-revalidate=300"

function setPublicCacheHeaders(c: Context) {
  c.header("Cache-Control", PUBLIC_CACHE_CONTROL)
}

type Env = {
  Bindings: VoyantBindings
  Variables: {
    userId?: string
  } & VoyantVariables
}

const errorResponseSchema = z.object({ error: z.string() })

/**
 * The departure-list and availability-summary queries coerce `limit`/`offset`
 * from the query string (`z.coerce.number()`), and zod-to-openapi cannot
 * introspect a coercion pipe — it would document them as `number`. Re-pin the
 * documented param type to `integer` (voyant#2114) while keeping the existing
 * `[1, 250]` / `>= 0` bounds intact. The annotated schema is a drop-in for the
 * service's query type, so the handlers keep calling the same service methods.
 */
const departureListQueryRouteSchema = storefrontDepartureListQuerySchema.extend({
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(250)
    .default(100)
    .openapi({ type: "integer", example: 100 }),
  offset: z.coerce.number().int().min(0).default(0).openapi({ type: "integer", example: 0 }),
})

const productAvailabilitySummaryQueryRouteSchema =
  storefrontProductAvailabilitySummaryQuerySchema.extend({
    limit: z.coerce
      .number()
      .int()
      .min(1)
      .max(250)
      .default(100)
      .openapi({ type: "integer", example: 100 }),
    offset: z.coerce.number().int().min(0).default(0).openapi({ type: "integer", example: 0 }),
  })

const settingsRoute = createRoute({
  method: "get",
  path: "/settings",
  responses: {
    200: {
      description: "The deployment's public storefront settings",
      content: { "application/json": { schema: z.object({ data: storefrontSettingsSchema }) } },
    },
  },
})

const departureByIdRoute = createRoute({
  method: "get",
  path: "/departures/{departureId}",
  request: {
    params: z.object({ departureId: z.string() }),
  },
  responses: {
    200: {
      description: "A storefront departure (availability slot) by id",
      content: { "application/json": { schema: z.object({ data: storefrontDepartureSchema }) } },
    },
    404: {
      description: "Storefront departure not found",
      content: { "application/json": { schema: errorResponseSchema } },
    },
  },
})

const listProductDeparturesRoute = createRoute({
  method: "get",
  path: "/products/{productId}/departures",
  request: {
    params: z.object({ productId: z.string() }),
    query: departureListQueryRouteSchema,
  },
  responses: {
    200: {
      description: "Departures (availability slots) for a product",
      content: { "application/json": { schema: storefrontDepartureListResponseSchema } },
    },
  },
})

const productAvailabilityRoute = createRoute({
  method: "get",
  path: "/products/{productId}/availability",
  request: {
    params: z.object({ productId: z.string() }),
    query: productAvailabilitySummaryQueryRouteSchema,
  },
  responses: {
    200: {
      description: "Availability summary (counts + per-slot states) for a product",
      content: {
        "application/json": { schema: storefrontProductAvailabilitySummaryResponseSchema },
      },
    },
  },
})

const departureItineraryRoute = createRoute({
  method: "get",
  path: "/products/{productId}/departures/{departureId}/itinerary",
  request: {
    params: z.object({ productId: z.string(), departureId: z.string() }),
    query: storefrontDepartureItineraryQuerySchema,
  },
  responses: {
    200: {
      description: "Day-by-day itinerary for a product departure",
      content: {
        "application/json": { schema: z.object({ data: storefrontDepartureItinerarySchema }) },
      },
    },
    404: {
      description: "Storefront itinerary not found",
      content: { "application/json": { schema: errorResponseSchema } },
    },
  },
})

const productExtensionsRoute = createRoute({
  method: "get",
  path: "/products/{productId}/extensions",
  request: {
    params: z.object({ productId: z.string() }),
    query: storefrontProductExtensionsQuerySchema,
  },
  responses: {
    200: {
      description: "Bookable extensions (extras/add-ons) for a product",
      content: {
        "application/json": {
          schema: z.object({ data: storefrontProductExtensionsResponseSchema }),
        },
      },
    },
  },
})

/**
 * Narrow a product-extension item's loosely-typed (`string`) `pricingMode` onto
 * the `storefrontExtensionPricingModeSchema` enum that the wire contract
 * declares (the commerce `addon_pricing_mode` domain, which includes
 * `unavailable`). The price rules that feed the service widen the column enum to
 * `string`, so this is a type-level coercion at the serialization boundary — a
 * cast rather than a `.parse()`, so a valid runtime value can never turn this
 * catalog read into a 400 (voyant#2114, §17).
 */
type StorefrontProductExtensions = Awaited<
  ReturnType<ReturnType<typeof createStorefrontService>["getProductExtensions"]>
>

function narrowExtensionPricingMode<T extends { pricingMode: string }>(
  item: T,
): Omit<T, "pricingMode"> & { pricingMode: z.infer<typeof storefrontExtensionPricingModeSchema> } {
  return {
    ...item,
    pricingMode: item.pricingMode as z.infer<typeof storefrontExtensionPricingModeSchema>,
  }
}

function serializeProductExtensions(extensions: StorefrontProductExtensions) {
  return {
    ...extensions,
    extensions: extensions.extensions.map(narrowExtensionPricingMode),
    items: extensions.items.map(narrowExtensionPricingMode),
  }
}

const listProductOffersRoute = createRoute({
  method: "get",
  path: "/products/{productId}/offers",
  request: {
    params: z.object({ productId: z.string() }),
    query: storefrontPromotionalOfferListQuerySchema,
  },
  responses: {
    200: {
      description: "Promotional offers applicable to a product (and optional departure)",
      content: {
        "application/json": { schema: storefrontPromotionalOfferListResponseSchema },
      },
    },
  },
})

const offerBySlugRoute = createRoute({
  method: "get",
  path: "/offers/{slug}",
  request: {
    params: z.object({ slug: z.string() }),
    query: storefrontPromotionalOfferListQuerySchema,
  },
  responses: {
    200: {
      description: "A promotional offer by slug",
      content: {
        "application/json": { schema: storefrontPromotionalOfferResponseSchema },
      },
    },
    404: {
      description: "Storefront offer not found",
      content: { "application/json": { schema: errorResponseSchema } },
    },
  },
})

const applyOfferRoute = createRoute({
  method: "post",
  path: "/offers/{slug}/apply",
  request: {
    params: z.object({ slug: z.string() }),
    body: {
      required: true,
      content: { "application/json": { schema: storefrontOfferApplyInputSchema } },
    },
  },
  responses: {
    200: {
      description: "Result of applying a promotional offer",
      content: {
        "application/json": { schema: storefrontOfferMutationResponseSchema },
      },
    },
    501: {
      description: "Storefront offer application is not configured",
      content: { "application/json": { schema: errorResponseSchema } },
    },
  },
})

const redeemOfferRoute = createRoute({
  method: "post",
  path: "/offers/redeem",
  request: {
    body: {
      required: true,
      content: { "application/json": { schema: storefrontOfferRedeemInputSchema } },
    },
  },
  responses: {
    200: {
      description: "Result of redeeming a promotional offer code",
      content: {
        "application/json": { schema: storefrontOfferMutationResponseSchema },
      },
    },
    501: {
      description: "Storefront offer redemption is not configured",
      content: { "application/json": { schema: errorResponseSchema } },
    },
  },
})

const createLeadRoute = createRoute({
  method: "post",
  path: "/leads",
  request: {
    // `required: true` keeps the JSON validator running even when the caller
    // omits `Content-Type: application/json` (§16); first-party callers send
    // it via the shared fetch client.
    body: {
      required: true,
      content: { "application/json": { schema: storefrontLeadIntakeInputSchema } },
    },
  },
  responses: {
    201: {
      description: "The captured storefront lead/inquiry signal",
      content: { "application/json": { schema: storefrontLeadIntakeEnvelopeSchema } },
    },
    400: {
      description: "Rejected by intake guard (invalid request)",
      content: { "application/json": { schema: errorResponseSchema } },
    },
    403: {
      description: "Rejected by the deployment intake guard (e.g. spam/abuse)",
      content: { "application/json": { schema: errorResponseSchema } },
    },
    429: {
      description: "Rejected by intake guard (rate limited)",
      content: { "application/json": { schema: errorResponseSchema } },
    },
  },
})

const subscribeNewsletterRoute = createRoute({
  method: "post",
  path: "/newsletter/subscribe",
  request: {
    body: {
      required: true,
      content: { "application/json": { schema: storefrontNewsletterSubscribeInputSchema } },
    },
  },
  responses: {
    202: {
      description: "The captured newsletter subscription signal",
      content: { "application/json": { schema: storefrontNewsletterSubscribeEnvelopeSchema } },
    },
    400: {
      description: "Rejected by intake guard (invalid request)",
      content: { "application/json": { schema: errorResponseSchema } },
    },
    403: {
      description: "Rejected by the deployment intake guard (e.g. spam/abuse)",
      content: { "application/json": { schema: errorResponseSchema } },
    },
    429: {
      description: "Rejected by intake guard (rate limited)",
      content: { "application/json": { schema: errorResponseSchema } },
    },
  },
})

export function createStorefrontPublicRoutes(options?: StorefrontServiceOptions) {
  const storefrontService = createStorefrontService(options)

  function getRequestContext(c: Context<Env>): StorefrontRequestContext {
    return {
      db: c.get("db" as never) as StorefrontRequestContext["db"],
      eventBus: c.get("eventBus" as never) as StorefrontRequestContext["eventBus"],
      env: c.env,
      context: c,
    } satisfies StorefrontRequestContext
  }

  async function runIntakeGuard(
    input:
      | {
          kind: "lead"
          body: StorefrontLeadIntakeInput
          context: StorefrontRequestContext
        }
      | {
          kind: "newsletter"
          body: StorefrontNewsletterSubscribeInput
          context: StorefrontRequestContext
        },
  ) {
    const decision = await storefrontService.checkIntakeGuard(input)
    if (!decision || decision.allowed) return null
    return {
      status: decision.status ?? 403,
      error: decision.error ?? "Storefront intake rejected",
    }
  }

  // `.openapi()` legs are declared first: `OpenAPIHono#get`/`#post` return the
  // base `Hono` type (honojs/middleware#637), so any plain `.get()`/`.post()`
  // leg cannot precede an `.openapi()` in the chain. The migrated offer routes
  // carry distinct literal final segments (`/offers`, `/offers/{slug}`,
  // `/offers/{slug}/apply`, `/offers/redeem`), so hoisting them ahead of the
  // remaining plain catalog/booking legs preserves route-match order — and
  // `/offers/redeem` (a POST) never collides with `/offers/{slug}` (a GET).
  return new OpenAPIHono<Env>({ defaultHook: openApiValidationHook })
    .openapi(listProductOffersRoute, async (c) => {
      const query = c.req.valid("query")
      const offers = await storefrontService.listApplicableOffers({
        productId: c.req.valid("param").productId,
        departureId: query.departureId,
        locale: query.locale,
        context: getRequestContext(c),
      })

      setPublicCacheHeaders(c)
      return c.json({ data: offers }, 200)
    })
    .openapi(offerBySlugRoute, async (c) => {
      const query = c.req.valid("query")
      const offer = await storefrontService.getOfferBySlug({
        slug: c.req.valid("param").slug,
        locale: query.locale,
        context: getRequestContext(c),
      })

      if (!offer) return c.json({ error: "Storefront offer not found" }, 404)
      setPublicCacheHeaders(c)
      return c.json({ data: offer }, 200)
    })
    .openapi(applyOfferRoute, async (c) => {
      const result = await storefrontService.applyOffer({
        slug: c.req.valid("param").slug,
        body: c.req.valid("json"),
        context: getRequestContext(c),
      })

      return result
        ? c.json({ data: result }, 200)
        : c.json({ error: "Storefront offer application is not configured" }, 501)
    })
    .openapi(redeemOfferRoute, async (c) => {
      const result = await storefrontService.redeemOffer({
        body: c.req.valid("json"),
        context: getRequestContext(c),
      })

      return result
        ? c.json({ data: result }, 200)
        : c.json({ error: "Storefront offer redemption is not configured" }, 501)
    })
    .openapi(createLeadRoute, async (c) => {
      const context = getRequestContext(c)
      const body = c.req.valid("json")
      const rejected = await runIntakeGuard({ kind: "lead", body, context })
      // The intake guard is a deployment-injected hook; its rejection status is
      // dynamic (400/403/429, all declared in this route's responses, with 403
      // as the default).
      if (rejected) return c.json({ error: rejected.error }, rejected.status)

      return c.json(
        {
          data: await storefrontService.createLead({
            body,
            context,
          }),
        },
        201,
      )
    })
    .openapi(subscribeNewsletterRoute, async (c) => {
      const context = getRequestContext(c)
      const body = c.req.valid("json")
      const rejected = await runIntakeGuard({ kind: "newsletter", body, context })
      if (rejected) return c.json({ error: rejected.error }, rejected.status)

      return c.json(
        {
          data: await storefrontService.subscribeNewsletter({
            body,
            context,
          }),
        },
        202,
      )
    })
    .openapi(settingsRoute, async (c) => {
      return c.json({ data: await storefrontService.resolveSettings(getRequestContext(c)) }, 200)
    })
    .openapi(departureByIdRoute, async (c) => {
      const departure = await storefrontService.getDeparture(
        c.get("db" as never),
        c.req.valid("param").departureId,
      )

      if (!departure) return c.json({ error: "Storefront departure not found" }, 404)
      setPublicCacheHeaders(c)
      return c.json({ data: departure }, 200)
    })
    .openapi(listProductDeparturesRoute, async (c) => {
      const { productId } = c.req.valid("param")
      const query = c.req.valid("query")
      const result = await readThroughDepartures(
        c,
        departuresDocKey(productId, query as Record<string, unknown>),
        () => storefrontService.listProductDepartures(c.get("db" as never), productId, query),
      )
      setPublicCacheHeaders(c)
      return c.json(result, 200)
    })
    .openapi(productAvailabilityRoute, async (c) => {
      const { productId } = c.req.valid("param")
      const availability = await storefrontService.getProductAvailabilitySummary(
        c.get("db" as never),
        productId,
        c.req.valid("query"),
      )

      setPublicCacheHeaders(c)
      return c.json({ data: availability }, 200)
    })
    .openapi(departureItineraryRoute, async (c) => {
      const { productId, departureId } = c.req.valid("param")
      const query = parseQuery(c, storefrontDepartureItineraryQuerySchema)
      const itinerary = await storefrontService.getDepartureItinerary(c.get("db" as never), {
        departureId,
        languageTag: query.languageTag ?? query.lang,
        productId,
      })

      if (!itinerary) return c.json({ error: "Storefront itinerary not found" }, 404)
      setPublicCacheHeaders(c)
      return c.json({ data: itinerary }, 200)
    })
    .openapi(productExtensionsRoute, async (c) => {
      const { productId } = c.req.valid("param")
      const query = c.req.valid("query")
      const extensions = await storefrontService.getProductExtensions(
        c.get("db" as never),
        productId,
        query.optionId,
      )

      setPublicCacheHeaders(c)
      // The service types `pricingMode` as a loose `string` (its price-rule
      // source widens the column enum); the wire contract is the
      // `storefrontExtensionPricingModeSchema` enum (commerce `addon_pricing_mode`,
      // including `unavailable`). Narrow at the boundary so the handler's return
      // type unifies with the declared response (voyant#2114, §17) — the runtime
      // values are always valid enum members.
      return c.json({ data: serializeProductExtensions(extensions) }, 200)
    })
    .post("/departures/:departureId/price", async (c) => {
      const preview = await storefrontService.previewDeparturePrice(
        c.get("db" as never),
        c.req.param("departureId"),
        await parseJsonBody(c, storefrontDeparturePricePreviewInputSchema),
        getRequestContext(c),
      )

      return preview
        ? c.json({ data: preview })
        : c.json({ error: "Storefront departure not found" }, 404)
    })
    .post("/departures/:departureId/eligibility", async (c) => {
      return c.json({
        data: await storefrontService.checkDepartureTransportEligibility({
          departureId: c.req.param("departureId"),
          body: await parseJsonBody(c, storefrontTransportEligibilityInputSchema),
          context: getRequestContext(c),
        }),
      })
    })
    .post("/products/:productId/departures/:departureId/eligibility", async (c) => {
      return c.json({
        data: await storefrontService.checkDepartureTransportEligibility({
          departureId: c.req.param("departureId"),
          productId: c.req.param("productId"),
          body: await parseJsonBody(c, storefrontTransportEligibilityInputSchema),
          context: getRequestContext(c),
        }),
      })
    })
}

export type StorefrontPublicRoutes = ReturnType<typeof createStorefrontPublicRoutes>
