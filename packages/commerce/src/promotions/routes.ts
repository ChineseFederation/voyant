/**
 * Admin routes for promotions — mounted by the operator starter at
 * `/v1/admin/promotions/*` (staff-actor-gated by the parent app's
 * middleware chain).
 *
 * PR1 ships CRUD only. Public storefront routes are exposed via the
 * existing `/v1/public/products/:productId/offers` endpoints in
 * `@voyant-travel/public-api` once the storefront resolver is wired in PR4.
 */

import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi"
import { openApiValidationHook } from "@voyant-travel/hono"
import { apiErrorSchema, listResponseSchema } from "@voyant-travel/types"

import { type Env, notFound } from "./routes-shared.js"
import { type OfferMutationRuntime, promotionsService } from "./service.js"
import {
  insertPromotionalOfferSchema,
  promotionalOfferListQuerySchema,
  promotionalOfferSchema,
  updatePromotionalOfferSchema,
} from "./validation.js"

const errorResponseSchema = z.object({ error: z.string() })
const offerResponseSchema = z.object({ data: promotionalOfferSchema })
const idParamSchema = z.object({ id: z.string() })

export type PromotionsMutationRuntimeOptions = Omit<OfferMutationRuntime, "eventBus" | "source">

export interface PromotionsRoutesOptions {
  mutationRuntime?: PromotionsMutationRuntimeOptions
}

const listPromotionsRoute = createRoute({
  method: "get",
  path: "/",
  request: { query: promotionalOfferListQuerySchema },
  responses: {
    200: {
      description: "Paginated list of promotional offers",
      content: {
        "application/json": { schema: listResponseSchema(promotionalOfferSchema) },
      },
    },
  },
})

const createPromotionRoute = createRoute({
  method: "post",
  path: "/",
  request: {
    body: {
      required: true,
      description:
        "Discount fields are conditional on `discountType` (enforced server-side; " +
        "violations return a 400 `invalid_request`): `percentage` requires " +
        "`discountPercent` and must omit `discountAmountCents`/`currency`; " +
        "`fixed_amount` requires `discountAmountCents` + `currency` and must omit " +
        "`discountPercent`. These cross-field rules can't be expressed structurally " +
        "in JSON Schema, so the body schema is a permissive superset.",
      content: { "application/json": { schema: insertPromotionalOfferSchema } },
    },
  },
  responses: {
    201: {
      description: "The created promotional offer",
      content: { "application/json": { schema: offerResponseSchema } },
    },
    400: {
      description: "invalid_reference: product-scoped offer references unknown product ids",
      content: { "application/json": { schema: apiErrorSchema } },
    },
    409: {
      description: "Active promotional offer slug or code already exists",
      content: { "application/json": { schema: apiErrorSchema } },
    },
  },
})

const getPromotionRoute = createRoute({
  method: "get",
  path: "/{id}",
  request: { params: idParamSchema },
  responses: {
    200: {
      description: "A promotional offer by id",
      content: { "application/json": { schema: offerResponseSchema } },
    },
    404: {
      description: "Promotional offer not found",
      content: { "application/json": { schema: errorResponseSchema } },
    },
  },
})

const updatePromotionRoute = createRoute({
  method: "patch",
  path: "/{id}",
  request: {
    params: idParamSchema,
    body: {
      required: true,
      description:
        "Partial update. When `discountType` is supplied, the same conditional " +
        "rules as create apply (enforced server-side, 400 `invalid_request` on " +
        "violation): `percentage` requires `discountPercent` and omits " +
        "`discountAmountCents`/`currency`; `fixed_amount` requires " +
        "`discountAmountCents` + `currency` and omits `discountPercent`. These " +
        "cross-field rules aren't structurally representable in JSON Schema.",
      content: { "application/json": { schema: updatePromotionalOfferSchema } },
    },
  },
  responses: {
    200: {
      description: "The updated promotional offer",
      content: { "application/json": { schema: offerResponseSchema } },
    },
    404: {
      description: "Promotional offer not found",
      content: { "application/json": { schema: errorResponseSchema } },
    },
    400: {
      description: "invalid_reference: product-scoped offer references unknown product ids",
      content: { "application/json": { schema: apiErrorSchema } },
    },
    409: {
      description: "Active promotional offer slug or code already exists",
      content: { "application/json": { schema: apiErrorSchema } },
    },
  },
})

const archivePromotionRoute = createRoute({
  method: "post",
  path: "/{id}/archive",
  request: { params: idParamSchema },
  responses: {
    200: {
      description: "The archived promotional offer",
      content: { "application/json": { schema: offerResponseSchema } },
    },
    404: {
      description: "Promotional offer not found",
      content: { "application/json": { schema: errorResponseSchema } },
    },
  },
})

const deletePromotionRoute = createRoute({
  method: "delete",
  path: "/{id}",
  request: { params: idParamSchema },
  responses: {
    200: {
      description: "The id of the deleted promotional offer",
      content: { "application/json": { schema: z.object({ data: idParamSchema }) } },
    },
    404: {
      description: "Promotional offer not found",
      content: { "application/json": { schema: errorResponseSchema } },
    },
    409: {
      description: "Offer has redemptions and cannot be deleted",
      content: { "application/json": { schema: errorResponseSchema } },
    },
  },
})

export function createPromotionsRoutes(options: PromotionsRoutesOptions = {}) {
  const mutationRuntime = options.mutationRuntime ?? {}

  return new OpenAPIHono<Env>({ defaultHook: openApiValidationHook })
    .openapi(listPromotionsRoute, async (c) =>
      c.json(await promotionsService.listOffers(c.get("db"), c.req.valid("query"))),
    )
    .openapi(createPromotionRoute, async (c) =>
      c.json(
        {
          data: await promotionsService.createOffer(c.get("db"), c.req.valid("json"), {
            ...mutationRuntime,
            eventBus: c.get("eventBus"),
          }),
        },
        201,
      ),
    )
    .openapi(getPromotionRoute, async (c) => {
      const offer = await promotionsService.getOfferById(c.get("db"), c.req.valid("param").id)
      return offer ? c.json({ data: offer }, 200) : notFound(c, "Promotional offer not found")
    })
    .openapi(updatePromotionRoute, async (c) => {
      const offer = await promotionsService.updateOffer(
        c.get("db"),
        c.req.valid("param").id,
        c.req.valid("json"),
        { ...mutationRuntime, eventBus: c.get("eventBus") },
      )
      return offer ? c.json({ data: offer }, 200) : notFound(c, "Promotional offer not found")
    })
    .openapi(archivePromotionRoute, async (c) => {
      const offer = await promotionsService.archiveOffer(c.get("db"), c.req.valid("param").id, {
        ...mutationRuntime,
        eventBus: c.get("eventBus"),
      })
      return offer ? c.json({ data: offer }, 200) : notFound(c, "Promotional offer not found")
    })
    .openapi(deletePromotionRoute, async (c) => {
      try {
        const result = await promotionsService.deleteOffer(c.get("db"), c.req.valid("param").id, {
          ...mutationRuntime,
          eventBus: c.get("eventBus"),
        })
        return result ? c.json({ data: result }, 200) : notFound(c, "Promotional offer not found")
      } catch (err) {
        // `deleteOffer` throws when redemptions exist (the FK RESTRICT
        // would otherwise surface a less helpful error). Translate to 409.
        if (err instanceof Error && err.message.includes("redemption(s) exist")) {
          return c.json({ error: err.message }, 409)
        }
        throw err
      }
    })
}

export const promotionsRoutes = createPromotionsRoutes()

export type PromotionsRoutes = typeof promotionsRoutes
