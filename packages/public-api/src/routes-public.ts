// agent-quality: file-size exception -- owner: storefront; existing route module stays co-located until a dedicated split preserves behavior and tests.
import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi"
import {
  openApiValidationHook,
  parseJsonBody,
  parseQuery,
  type VoyantBindings,
  type VoyantVariables,
} from "@voyant-travel/hono"
import type { Context, Next } from "hono"

import { departuresDocKey, readThroughDepartures } from "./departures-read-model.js"
import {
  createPublicApiShoppingPublicRoutes,
  type PublicApiShoppingPublicRoutesOptions,
} from "./shopping/routes-public.js"

export { departuresDocKey, readThroughDepartures }

import { transportEligibilityInputSchema } from "@voyant-travel/flights/transport-eligibility"
import {
  createPublicApiService,
  type PublicApiRequestContext,
  type PublicApiServiceOptions,
} from "./service.js"
import {
  type PublicApiLeadIntakeInput,
  type PublicApiNewsletterSubscribeInput,
  publicApiDepartureItineraryQuerySchema,
  publicApiDepartureItinerarySchema,
  publicApiDepartureListQuerySchema,
  publicApiDepartureListResponseSchema,
  publicApiDeparturePricePreviewInputSchema,
  publicApiDepartureSchema,
  type publicApiExtensionPricingModeSchema,
  publicApiLeadIntakeEnvelopeSchema,
  publicApiLeadIntakeInputSchema,
  publicApiNewsletterSubscribeEnvelopeSchema,
  publicApiNewsletterSubscribeInputSchema,
  publicApiOfferApplyInputSchema,
  publicApiOfferMutationResponseSchema,
  publicApiOfferRedeemInputSchema,
  publicApiProductAvailabilitySummaryQuerySchema,
  publicApiProductAvailabilitySummaryResponseSchema,
  publicApiProductExtensionsQuerySchema,
  publicApiProductExtensionsResponseSchema,
  publicApiPromotionalOfferListQuerySchema,
  publicApiPromotionalOfferListResponseSchema,
  publicApiPromotionalOfferResponseSchema,
  publicApiPublicSettingsSchema,
  toPublicPublicApiSettings,
} from "./validation.js"

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
const departureListQueryRouteSchema = publicApiDepartureListQuerySchema.extend({
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
  publicApiProductAvailabilitySummaryQuerySchema.extend({
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
      content: {
        "application/json": {
          schema: z.object({ data: publicApiPublicSettingsSchema }),
        },
      },
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
      content: { "application/json": { schema: z.object({ data: publicApiDepartureSchema }) } },
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
      content: { "application/json": { schema: publicApiDepartureListResponseSchema } },
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
        "application/json": { schema: publicApiProductAvailabilitySummaryResponseSchema },
      },
    },
  },
})

const departureItineraryRoute = createRoute({
  method: "get",
  path: "/products/{productId}/departures/{departureId}/itinerary",
  request: {
    params: z.object({ productId: z.string(), departureId: z.string() }),
    query: publicApiDepartureItineraryQuerySchema,
  },
  responses: {
    200: {
      description: "Day-by-day itinerary for a product departure",
      content: {
        "application/json": { schema: z.object({ data: publicApiDepartureItinerarySchema }) },
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
    query: publicApiProductExtensionsQuerySchema,
  },
  responses: {
    200: {
      description: "Bookable extensions (extras/add-ons) for a product",
      content: {
        "application/json": {
          schema: z.object({ data: publicApiProductExtensionsResponseSchema }),
        },
      },
    },
  },
})

/**
 * Narrow a product-extension item's loosely-typed (`string`) `pricingMode` onto
 * the `publicApiExtensionPricingModeSchema` enum that the wire contract
 * declares (the commerce `addon_pricing_mode` domain, which includes
 * `unavailable`). The price rules that feed the service widen the column enum to
 * `string`, so this is a type-level coercion at the serialization boundary — a
 * cast rather than a `.parse()`, so a valid runtime value can never turn this
 * catalog read into a 400 (voyant#2114, §17).
 */
type PublicApiProductExtensions = Awaited<
  ReturnType<ReturnType<typeof createPublicApiService>["getProductExtensions"]>
>

function narrowExtensionPricingMode<T extends { pricingMode: string }>(
  item: T,
): Omit<T, "pricingMode"> & { pricingMode: z.infer<typeof publicApiExtensionPricingModeSchema> } {
  return {
    ...item,
    pricingMode: item.pricingMode as z.infer<typeof publicApiExtensionPricingModeSchema>,
  }
}

function serializeProductExtensions(extensions: PublicApiProductExtensions) {
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
    query: publicApiPromotionalOfferListQuerySchema,
  },
  responses: {
    200: {
      description: "Promotional offers applicable to a product (and optional departure)",
      content: {
        "application/json": { schema: publicApiPromotionalOfferListResponseSchema },
      },
    },
  },
})

const offerBySlugRoute = createRoute({
  method: "get",
  path: "/offers/{slug}",
  request: {
    params: z.object({ slug: z.string() }),
    query: publicApiPromotionalOfferListQuerySchema,
  },
  responses: {
    200: {
      description: "A promotional offer by slug",
      content: {
        "application/json": { schema: publicApiPromotionalOfferResponseSchema },
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
      content: { "application/json": { schema: publicApiOfferApplyInputSchema } },
    },
  },
  responses: {
    200: {
      description: "Result of applying a promotional offer",
      content: {
        "application/json": { schema: publicApiOfferMutationResponseSchema },
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
      content: { "application/json": { schema: publicApiOfferRedeemInputSchema } },
    },
  },
  responses: {
    200: {
      description: "Result of redeeming a promotional offer code",
      content: {
        "application/json": { schema: publicApiOfferMutationResponseSchema },
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
      content: { "application/json": { schema: publicApiLeadIntakeInputSchema } },
    },
  },
  responses: {
    201: {
      description: "The captured storefront lead/inquiry signal",
      content: { "application/json": { schema: publicApiLeadIntakeEnvelopeSchema } },
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
      content: { "application/json": { schema: publicApiNewsletterSubscribeInputSchema } },
    },
  },
  responses: {
    202: {
      description: "The captured newsletter subscription signal",
      content: { "application/json": { schema: publicApiNewsletterSubscribeEnvelopeSchema } },
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

export type PublicApiRoutesOptions = PublicApiServiceOptions & {
  shoppingGateway?: PublicApiShoppingPublicRoutesOptions
}

export function createPublicApiRoutes(options?: PublicApiRoutesOptions) {
  const publicApiService = createPublicApiService(options)

  function getRequestContext(c: Context<Env>): PublicApiRequestContext {
    const publicChannel = c.get("publicChannel")
    return {
      db: c.get("db" as never) as PublicApiRequestContext["db"],
      eventBus: c.get("eventBus" as never) as PublicApiRequestContext["eventBus"],
      env: c.env,
      context: c,
      channelId: publicChannel?.channelId ?? null,
      channelStatus: publicChannel?.channelStatus ?? null,
    } satisfies PublicApiRequestContext
  }

  function requireActivePublicApiChannel(c: Context<Env>): Response | null {
    const publicChannel = c.get("publicChannel")
    if (!publicChannel?.channelId || publicChannel.channelStatus !== "active") {
      return c.json({ error: "Active channel context is required." }, 403)
    }
    return null
  }

  async function isProductPublished(productId: string, context: PublicApiRequestContext) {
    if (!options?.publication) return false
    return options.publication.isProductPublished({ productId, context })
  }

  function unavailableSummary(
    productId: string,
    query: z.infer<typeof productAvailabilitySummaryQueryRouteSchema>,
  ) {
    return {
      productId,
      availabilityState: "unavailable" as const,
      counts: {
        total: 0,
        open: 0,
        closed: 0,
        soldOut: 0,
        cancelled: 0,
        onRequest: 0,
        pastCutoff: 0,
        tooEarly: 0,
        available: 0,
      },
      departures: [],
      total: 0,
      limit: query.limit,
      offset: query.offset,
    }
  }

  async function runIntakeGuard(
    input:
      | {
          kind: "lead"
          body: PublicApiLeadIntakeInput
          context: PublicApiRequestContext
        }
      | {
          kind: "newsletter"
          body: PublicApiNewsletterSubscribeInput
          context: PublicApiRequestContext
        },
  ) {
    const decision = await publicApiService.checkIntakeGuard(input)
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
  const app = new OpenAPIHono<Env>({ defaultHook: openApiValidationHook })
  const requireActiveChannel = async (c: Context<Env>, next: Next) => {
    const denied = requireActivePublicApiChannel(c)
    if (denied) return denied
    return next()
  }
  app.use("/settings", requireActiveChannel)
  app.use("/departures/*", requireActiveChannel)
  app.use("/products/*", requireActiveChannel)
  app.use("/offers/*", requireActiveChannel)
  app.use("/leads", requireActiveChannel)
  app.use("/newsletter/*", requireActiveChannel)

  const routes = app
    .openapi(listProductOffersRoute, async (c) => {
      const query = c.req.valid("query")
      const offers = await publicApiService.listApplicableOffers({
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
      const offer = await publicApiService.getOfferBySlug({
        slug: c.req.valid("param").slug,
        locale: query.locale,
        context: getRequestContext(c),
      })

      if (!offer) return c.json({ error: "Storefront offer not found" }, 404)
      setPublicCacheHeaders(c)
      return c.json({ data: offer }, 200)
    })
    .openapi(applyOfferRoute, async (c) => {
      const result = await publicApiService.applyOffer({
        slug: c.req.valid("param").slug,
        body: c.req.valid("json"),
        context: getRequestContext(c),
      })

      return result
        ? c.json({ data: result }, 200)
        : c.json({ error: "Storefront offer application is not configured" }, 501)
    })
    .openapi(redeemOfferRoute, async (c) => {
      const result = await publicApiService.redeemOffer({
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
          data: await publicApiService.createLead({
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
          data: await publicApiService.subscribeNewsletter({
            body,
            context,
          }),
        },
        202,
      )
    })
    .openapi(settingsRoute, async (c) => {
      return c.json(
        {
          data: toPublicPublicApiSettings(
            await publicApiService.resolveSettings(getRequestContext(c)),
          ),
        },
        200,
      )
    })
    .openapi(departureByIdRoute, async (c) => {
      const context = getRequestContext(c)
      const departure = await publicApiService.getDeparture(
        c.get("db" as never),
        c.req.valid("param").departureId,
      )

      if (!departure) return c.json({ error: "Storefront departure not found" }, 404)
      if (!(await isProductPublished(departure.productId, context))) {
        return c.json({ error: "Storefront departure not found" }, 404)
      }
      setPublicCacheHeaders(c)
      return c.json({ data: departure }, 200)
    })
    .openapi(listProductDeparturesRoute, async (c) => {
      const { productId } = c.req.valid("param")
      const query = c.req.valid("query")
      const context = getRequestContext(c)
      if (!(await isProductPublished(productId, context))) {
        setPublicCacheHeaders(c)
        return c.json({ data: [], total: 0, limit: query.limit, offset: query.offset }, 200)
      }
      const result = await readThroughDepartures(
        c,
        departuresDocKey(productId, query as Record<string, unknown>),
        () => publicApiService.listProductDepartures(c.get("db" as never), productId, query),
      )
      setPublicCacheHeaders(c)
      return c.json(result, 200)
    })
    .openapi(productAvailabilityRoute, async (c) => {
      const { productId } = c.req.valid("param")
      const query = c.req.valid("query")
      const context = getRequestContext(c)
      if (!(await isProductPublished(productId, context))) {
        setPublicCacheHeaders(c)
        return c.json({ data: unavailableSummary(productId, query) }, 200)
      }
      const availability = await publicApiService.getProductAvailabilitySummary(
        c.get("db" as never),
        productId,
        query,
      )

      setPublicCacheHeaders(c)
      return c.json({ data: availability }, 200)
    })
    .openapi(departureItineraryRoute, async (c) => {
      const { productId, departureId } = c.req.valid("param")
      const context = getRequestContext(c)
      if (!(await isProductPublished(productId, context))) {
        return c.json({ error: "Storefront itinerary not found" }, 404)
      }
      const query = parseQuery(c, publicApiDepartureItineraryQuerySchema)
      const itinerary = await publicApiService.getDepartureItinerary(c.get("db" as never), {
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
      const context = getRequestContext(c)
      if (!(await isProductPublished(productId, context))) {
        setPublicCacheHeaders(c)
        return c.json(
          { data: { extensions: [], items: [], details: {}, currencyCode: "EUR" } },
          200,
        )
      }
      const extensions = await publicApiService.getProductExtensions(
        c.get("db" as never),
        productId,
        query.optionId,
      )

      setPublicCacheHeaders(c)
      // The service types `pricingMode` as a loose `string` (its price-rule
      // source widens the column enum); the wire contract is the
      // `publicApiExtensionPricingModeSchema` enum (commerce `addon_pricing_mode`,
      // including `unavailable`). Narrow at the boundary so the handler's return
      // type unifies with the declared response (voyant#2114, §17) — the runtime
      // values are always valid enum members.
      return c.json({ data: serializeProductExtensions(extensions) }, 200)
    })
    .post("/departures/:departureId/price", async (c) => {
      const context = getRequestContext(c)
      const preview = await publicApiService.previewDeparturePrice(
        c.get("db" as never),
        c.req.param("departureId"),
        await parseJsonBody(c, publicApiDeparturePricePreviewInputSchema),
        context,
      )

      if (preview && !(await isProductPublished(preview.productId, context))) {
        return c.json({ error: "Storefront departure not found" }, 404)
      }
      return preview
        ? c.json({ data: preview })
        : c.json({ error: "Storefront departure not found" }, 404)
    })
    .post("/departures/:departureId/eligibility", async (c) => {
      return c.json({
        data: await publicApiService.checkDepartureTransportEligibility({
          departureId: c.req.param("departureId"),
          body: await parseJsonBody(c, transportEligibilityInputSchema),
          context: getRequestContext(c),
        }),
      })
    })
    .post("/products/:productId/departures/:departureId/eligibility", async (c) => {
      return c.json({
        data: await publicApiService.checkDepartureTransportEligibility({
          departureId: c.req.param("departureId"),
          productId: c.req.param("productId"),
          body: await parseJsonBody(c, transportEligibilityInputSchema),
          context: getRequestContext(c),
        }),
      })
    })

  routes.route("/shopping", createPublicApiShoppingPublicRoutes(options?.shoppingGateway))
  return routes
}

export type PublicApiRoutes = ReturnType<typeof createPublicApiRoutes>
