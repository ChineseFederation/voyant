/**
 * Admin CRUD routes for the pricing rule resources — mounted by the operator
 * starter under `/v1/admin/pricing/...` (staff-actor-gated by the parent app's
 * middleware chain). Covers eight resources: option-price-rules,
 * option-unit-price-rules, option-start-time-rules, option-unit-tiers,
 * pickup-price-rules, dropoff-price-rules, extra-price-rules,
 * departure-price-overrides.
 *
 * Migrated to `@hono/zod-openapi` for the OpenAPI admin backfill (voyant#2114 /
 * voyant#2208 — Admin Batch 2b). Request schemas reuse the existing
 * `validation.ts` schemas the handlers already parse; response schemas are
 * authored from the Drizzle row shapes (§17: `Date`/timestamp columns serialize
 * to strings over the wire). Each resource is its own small `OpenAPIHono`
 * sub-chain (5 legs) composed onto `pricingRuleRoutes` via `.route("/")` —
 * eight chains of five keeps type-inference cost bounded (one 40-leg chain has
 * O(n²) inference cost and previously OOMed the framework build).
 *
 * agent-quality: file-size exception — intentional: a mechanically-repetitive
 * 5-verb CRUD bundle over eight pricing rule resources (40 legs), each with a
 * `createRoute` def + handler co-located per the established admin route
 * pattern (mirrors the sibling `routes-core.ts`). Splitting per resource would
 * fragment the single mounted instance without aiding review. See voyant#2114 /
 * voyant#2208.
 */

import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi"
import { openApiValidationHook } from "@voyant-travel/hono"
import { listResponseSchema } from "@voyant-travel/types"

import { type Env, notFound } from "./routes-shared.js"
import { pricingService } from "./service.js"
import {
  departurePriceOverrideListQuerySchema,
  dropoffPriceRuleListQuerySchema,
  extraPriceRuleListQuerySchema,
  insertDeparturePriceOverrideSchema,
  insertDropoffPriceRuleSchema,
  insertExtraPriceRuleSchema,
  insertOptionPriceRuleSchema,
  insertOptionStartTimeRuleSchema,
  insertOptionUnitPriceRuleSchema,
  insertOptionUnitTierSchema,
  insertPickupPriceRuleSchema,
  optionPriceRuleListQuerySchema,
  optionStartTimeRuleListQuerySchema,
  optionUnitPriceRuleListQuerySchema,
  optionUnitTierListQuerySchema,
  pickupPriceRuleListQuerySchema,
  updateDeparturePriceOverrideSchema,
  updateDropoffPriceRuleSchema,
  updateExtraPriceRuleSchema,
  updateOptionPriceRuleSchema,
  updateOptionStartTimeRuleSchema,
  updateOptionUnitPriceRuleSchema,
  updateOptionUnitTierSchema,
  updatePickupPriceRuleSchema,
} from "./validation.js"
import {
  addonPricingModeSchema,
  occupancyPriceBasisSchema,
  optionPricingModeSchema,
  optionStartTimeRuleModeSchema,
  optionUnitPricingModeSchema,
  priceAdjustmentTypeSchema,
} from "./validation-shared.js"

const errorResponseSchema = z.object({ error: z.string() })
const deleteResponseSchema = z.object({ success: z.boolean() })
const idParamSchema = z.object({ id: z.string() })

/**
 * Insert helpers return `row ?? null`, but a successful `INSERT ... RETURNING`
 * always yields exactly one row. Narrow the type for the 201 response (a
 * missing row is an unexpected DB fault and surfaces as a 500).
 */
function created<T>(row: T | null): T {
  if (row === null) throw new Error("Insert returned no row")
  return row
}

const isoTimestamp = z.string()
const metadataSchema = z.record(z.string(), z.unknown()).nullable()

// --- Response row schemas (authored from the Drizzle $inferSelect shapes;
//     §17: timestamp columns are strings on the wire) ----------------------

const optionPriceRuleSchema = z.object({
  id: z.string(),
  productId: z.string(),
  optionId: z.string(),
  priceCatalogId: z.string(),
  priceScheduleId: z.string().nullable(),
  cancellationPolicyId: z.string().nullable(),
  code: z.string().nullable(),
  name: z.string(),
  description: z.string().nullable(),
  pricingMode: optionPricingModeSchema,
  occupancyPriceBasis: occupancyPriceBasisSchema.nullable(),
  baseSellAmountCents: z.number().int().nullable(),
  baseCostAmountCents: z.number().int().nullable(),
  minPerBooking: z.number().int().nullable(),
  maxPerBooking: z.number().int().nullable(),
  allPricingCategories: z.boolean(),
  isDefault: z.boolean(),
  active: z.boolean(),
  notes: z.string().nullable(),
  metadata: metadataSchema,
  createdAt: isoTimestamp,
  updatedAt: isoTimestamp,
})

const optionUnitPriceRuleSchema = z.object({
  id: z.string(),
  optionPriceRuleId: z.string(),
  optionId: z.string(),
  unitId: z.string(),
  pricingCategoryId: z.string().nullable(),
  pricingMode: optionUnitPricingModeSchema,
  sellAmountCents: z.number().int().nullable(),
  costAmountCents: z.number().int().nullable(),
  minQuantity: z.number().int().nullable(),
  maxQuantity: z.number().int().nullable(),
  active: z.boolean(),
  sortOrder: z.number().int(),
  notes: z.string().nullable(),
  metadata: metadataSchema,
  createdAt: isoTimestamp,
  updatedAt: isoTimestamp,
})

const optionStartTimeRuleSchema = z.object({
  id: z.string(),
  optionPriceRuleId: z.string(),
  optionId: z.string(),
  startTimeId: z.string(),
  ruleMode: optionStartTimeRuleModeSchema,
  adjustmentType: priceAdjustmentTypeSchema.nullable(),
  sellAdjustmentCents: z.number().int().nullable(),
  costAdjustmentCents: z.number().int().nullable(),
  adjustmentBasisPoints: z.number().int().nullable(),
  active: z.boolean(),
  notes: z.string().nullable(),
  createdAt: isoTimestamp,
  updatedAt: isoTimestamp,
})

const optionUnitTierSchema = z.object({
  id: z.string(),
  optionUnitPriceRuleId: z.string(),
  minQuantity: z.number().int(),
  maxQuantity: z.number().int().nullable(),
  sellAmountCents: z.number().int().nullable(),
  costAmountCents: z.number().int().nullable(),
  active: z.boolean(),
  sortOrder: z.number().int(),
  createdAt: isoTimestamp,
  updatedAt: isoTimestamp,
})

const pickupPriceRuleSchema = z.object({
  id: z.string(),
  optionPriceRuleId: z.string(),
  optionId: z.string(),
  pickupPointId: z.string(),
  pricingMode: addonPricingModeSchema,
  sellAmountCents: z.number().int().nullable(),
  costAmountCents: z.number().int().nullable(),
  active: z.boolean(),
  sortOrder: z.number().int(),
  notes: z.string().nullable(),
  createdAt: isoTimestamp,
  updatedAt: isoTimestamp,
})

const dropoffPriceRuleSchema = z.object({
  id: z.string(),
  optionPriceRuleId: z.string(),
  optionId: z.string(),
  facilityId: z.string().nullable(),
  dropoffCode: z.string().nullable(),
  dropoffName: z.string(),
  pricingMode: addonPricingModeSchema,
  sellAmountCents: z.number().int().nullable(),
  costAmountCents: z.number().int().nullable(),
  active: z.boolean(),
  sortOrder: z.number().int(),
  notes: z.string().nullable(),
  createdAt: isoTimestamp,
  updatedAt: isoTimestamp,
})

const extraPriceRuleSchema = z.object({
  id: z.string(),
  optionPriceRuleId: z.string(),
  optionId: z.string(),
  productExtraId: z.string().nullable(),
  optionExtraConfigId: z.string().nullable(),
  // `addon_pricing_mode` domain — includes `unavailable` (§3)
  pricingMode: addonPricingModeSchema,
  sellAmountCents: z.number().int().nullable(),
  costAmountCents: z.number().int().nullable(),
  active: z.boolean(),
  sortOrder: z.number().int(),
  notes: z.string().nullable(),
  metadata: metadataSchema,
  createdAt: isoTimestamp,
  updatedAt: isoTimestamp,
})

const departurePriceOverrideSchema = z.object({
  id: z.string(),
  departureId: z.string(),
  optionId: z.string(),
  optionUnitId: z.string(),
  priceCatalogId: z.string(),
  sellAmountCents: z.number().int(),
  costAmountCents: z.number().int().nullable(),
  notes: z.string().nullable(),
  active: z.boolean(),
  metadata: metadataSchema,
  createdAt: isoTimestamp,
  updatedAt: isoTimestamp,
})

// --- option-price-rules ---------------------------------------------------

const listOptionPriceRulesRoute = createRoute({
  method: "get",
  path: "/option-price-rules",
  request: { query: optionPriceRuleListQuerySchema },
  responses: {
    200: {
      description: "Paginated list of option price rules",
      content: { "application/json": { schema: listResponseSchema(optionPriceRuleSchema) } },
    },
  },
})

const createOptionPriceRuleRoute = createRoute({
  method: "post",
  path: "/option-price-rules",
  request: {
    body: {
      required: true,
      content: { "application/json": { schema: insertOptionPriceRuleSchema } },
    },
  },
  responses: {
    201: {
      description: "The created option price rule",
      content: { "application/json": { schema: z.object({ data: optionPriceRuleSchema }) } },
    },
  },
})

const getOptionPriceRuleRoute = createRoute({
  method: "get",
  path: "/option-price-rules/{id}",
  request: { params: idParamSchema },
  responses: {
    200: {
      description: "An option price rule by id",
      content: { "application/json": { schema: z.object({ data: optionPriceRuleSchema }) } },
    },
    404: {
      description: "Option price rule not found",
      content: { "application/json": { schema: errorResponseSchema } },
    },
  },
})

const updateOptionPriceRuleRoute = createRoute({
  method: "patch",
  path: "/option-price-rules/{id}",
  request: {
    params: idParamSchema,
    body: {
      required: true,
      content: { "application/json": { schema: updateOptionPriceRuleSchema } },
    },
  },
  responses: {
    200: {
      description: "The updated option price rule",
      content: { "application/json": { schema: z.object({ data: optionPriceRuleSchema }) } },
    },
    404: {
      description: "Option price rule not found",
      content: { "application/json": { schema: errorResponseSchema } },
    },
  },
})

const deleteOptionPriceRuleRoute = createRoute({
  method: "delete",
  path: "/option-price-rules/{id}",
  request: { params: idParamSchema },
  responses: {
    200: {
      description: "Option price rule deleted",
      content: { "application/json": { schema: deleteResponseSchema } },
    },
    404: {
      description: "Option price rule not found",
      content: { "application/json": { schema: errorResponseSchema } },
    },
  },
})

const optionPriceRuleRoutes = new OpenAPIHono<Env>({ defaultHook: openApiValidationHook })
  .openapi(listOptionPriceRulesRoute, async (c) =>
    c.json(await pricingService.listOptionPriceRules(c.get("db"), c.req.valid("query")), 200),
  )
  .openapi(createOptionPriceRuleRoute, async (c) =>
    c.json(
      {
        data: created(
          await pricingService.createOptionPriceRule(c.get("db"), c.req.valid("json"), {
            eventBus: c.get("eventBus"),
          }),
        ),
      },
      201,
    ),
  )
  .openapi(getOptionPriceRuleRoute, async (c) => {
    const row = await pricingService.getOptionPriceRuleById(c.get("db"), c.req.valid("param").id)
    return row ? c.json({ data: row }, 200) : notFound(c, "Option price rule not found")
  })
  .openapi(updateOptionPriceRuleRoute, async (c) => {
    const row = await pricingService.updateOptionPriceRule(
      c.get("db"),
      c.req.valid("param").id,
      c.req.valid("json"),
      { eventBus: c.get("eventBus") },
    )
    return row ? c.json({ data: row }, 200) : notFound(c, "Option price rule not found")
  })
  .openapi(deleteOptionPriceRuleRoute, async (c) => {
    const row = await pricingService.deleteOptionPriceRule(c.get("db"), c.req.valid("param").id, {
      eventBus: c.get("eventBus"),
    })
    return row ? c.json({ success: true }, 200) : notFound(c, "Option price rule not found")
  })

// --- option-unit-price-rules ----------------------------------------------

const listOptionUnitPriceRulesRoute = createRoute({
  method: "get",
  path: "/option-unit-price-rules",
  request: { query: optionUnitPriceRuleListQuerySchema },
  responses: {
    200: {
      description: "Paginated list of option unit price rules",
      content: { "application/json": { schema: listResponseSchema(optionUnitPriceRuleSchema) } },
    },
  },
})

const createOptionUnitPriceRuleRoute = createRoute({
  method: "post",
  path: "/option-unit-price-rules",
  request: {
    body: {
      required: true,
      content: { "application/json": { schema: insertOptionUnitPriceRuleSchema } },
    },
  },
  responses: {
    201: {
      description: "The created option unit price rule",
      content: { "application/json": { schema: z.object({ data: optionUnitPriceRuleSchema }) } },
    },
  },
})

const getOptionUnitPriceRuleRoute = createRoute({
  method: "get",
  path: "/option-unit-price-rules/{id}",
  request: { params: idParamSchema },
  responses: {
    200: {
      description: "An option unit price rule by id",
      content: { "application/json": { schema: z.object({ data: optionUnitPriceRuleSchema }) } },
    },
    404: {
      description: "Option unit price rule not found",
      content: { "application/json": { schema: errorResponseSchema } },
    },
  },
})

const updateOptionUnitPriceRuleRoute = createRoute({
  method: "patch",
  path: "/option-unit-price-rules/{id}",
  request: {
    params: idParamSchema,
    body: {
      required: true,
      content: { "application/json": { schema: updateOptionUnitPriceRuleSchema } },
    },
  },
  responses: {
    200: {
      description: "The updated option unit price rule",
      content: { "application/json": { schema: z.object({ data: optionUnitPriceRuleSchema }) } },
    },
    404: {
      description: "Option unit price rule not found",
      content: { "application/json": { schema: errorResponseSchema } },
    },
  },
})

const deleteOptionUnitPriceRuleRoute = createRoute({
  method: "delete",
  path: "/option-unit-price-rules/{id}",
  request: { params: idParamSchema },
  responses: {
    200: {
      description: "Option unit price rule deleted",
      content: { "application/json": { schema: deleteResponseSchema } },
    },
    404: {
      description: "Option unit price rule not found",
      content: { "application/json": { schema: errorResponseSchema } },
    },
  },
})

const optionUnitPriceRuleRoutes = new OpenAPIHono<Env>({ defaultHook: openApiValidationHook })
  .openapi(listOptionUnitPriceRulesRoute, async (c) =>
    c.json(await pricingService.listOptionUnitPriceRules(c.get("db"), c.req.valid("query")), 200),
  )
  .openapi(createOptionUnitPriceRuleRoute, async (c) =>
    c.json(
      {
        data: created(
          await pricingService.createOptionUnitPriceRule(c.get("db"), c.req.valid("json"), {
            eventBus: c.get("eventBus"),
          }),
        ),
      },
      201,
    ),
  )
  .openapi(getOptionUnitPriceRuleRoute, async (c) => {
    const row = await pricingService.getOptionUnitPriceRuleById(
      c.get("db"),
      c.req.valid("param").id,
    )
    return row ? c.json({ data: row }, 200) : notFound(c, "Option unit price rule not found")
  })
  .openapi(updateOptionUnitPriceRuleRoute, async (c) => {
    const row = await pricingService.updateOptionUnitPriceRule(
      c.get("db"),
      c.req.valid("param").id,
      c.req.valid("json"),
      { eventBus: c.get("eventBus") },
    )
    return row ? c.json({ data: row }, 200) : notFound(c, "Option unit price rule not found")
  })
  .openapi(deleteOptionUnitPriceRuleRoute, async (c) => {
    const row = await pricingService.deleteOptionUnitPriceRule(
      c.get("db"),
      c.req.valid("param").id,
      { eventBus: c.get("eventBus") },
    )
    return row ? c.json({ success: true }, 200) : notFound(c, "Option unit price rule not found")
  })

// --- option-start-time-rules ----------------------------------------------

const listOptionStartTimeRulesRoute = createRoute({
  method: "get",
  path: "/option-start-time-rules",
  request: { query: optionStartTimeRuleListQuerySchema },
  responses: {
    200: {
      description: "Paginated list of option start time rules",
      content: { "application/json": { schema: listResponseSchema(optionStartTimeRuleSchema) } },
    },
  },
})

const createOptionStartTimeRuleRoute = createRoute({
  method: "post",
  path: "/option-start-time-rules",
  request: {
    body: {
      required: true,
      content: { "application/json": { schema: insertOptionStartTimeRuleSchema } },
    },
  },
  responses: {
    201: {
      description: "The created option start time rule",
      content: { "application/json": { schema: z.object({ data: optionStartTimeRuleSchema }) } },
    },
  },
})

const getOptionStartTimeRuleRoute = createRoute({
  method: "get",
  path: "/option-start-time-rules/{id}",
  request: { params: idParamSchema },
  responses: {
    200: {
      description: "An option start time rule by id",
      content: { "application/json": { schema: z.object({ data: optionStartTimeRuleSchema }) } },
    },
    404: {
      description: "Option start time rule not found",
      content: { "application/json": { schema: errorResponseSchema } },
    },
  },
})

const updateOptionStartTimeRuleRoute = createRoute({
  method: "patch",
  path: "/option-start-time-rules/{id}",
  request: {
    params: idParamSchema,
    body: {
      required: true,
      content: { "application/json": { schema: updateOptionStartTimeRuleSchema } },
    },
  },
  responses: {
    200: {
      description: "The updated option start time rule",
      content: { "application/json": { schema: z.object({ data: optionStartTimeRuleSchema }) } },
    },
    404: {
      description: "Option start time rule not found",
      content: { "application/json": { schema: errorResponseSchema } },
    },
  },
})

const deleteOptionStartTimeRuleRoute = createRoute({
  method: "delete",
  path: "/option-start-time-rules/{id}",
  request: { params: idParamSchema },
  responses: {
    200: {
      description: "Option start time rule deleted",
      content: { "application/json": { schema: deleteResponseSchema } },
    },
    404: {
      description: "Option start time rule not found",
      content: { "application/json": { schema: errorResponseSchema } },
    },
  },
})

const optionStartTimeRuleRoutes = new OpenAPIHono<Env>({ defaultHook: openApiValidationHook })
  .openapi(listOptionStartTimeRulesRoute, async (c) =>
    c.json(await pricingService.listOptionStartTimeRules(c.get("db"), c.req.valid("query")), 200),
  )
  .openapi(createOptionStartTimeRuleRoute, async (c) =>
    c.json(
      {
        data: created(
          await pricingService.createOptionStartTimeRule(c.get("db"), c.req.valid("json")),
        ),
      },
      201,
    ),
  )
  .openapi(getOptionStartTimeRuleRoute, async (c) => {
    const row = await pricingService.getOptionStartTimeRuleById(
      c.get("db"),
      c.req.valid("param").id,
    )
    return row ? c.json({ data: row }, 200) : notFound(c, "Option start time rule not found")
  })
  .openapi(updateOptionStartTimeRuleRoute, async (c) => {
    const row = await pricingService.updateOptionStartTimeRule(
      c.get("db"),
      c.req.valid("param").id,
      c.req.valid("json"),
    )
    return row ? c.json({ data: row }, 200) : notFound(c, "Option start time rule not found")
  })
  .openapi(deleteOptionStartTimeRuleRoute, async (c) => {
    const row = await pricingService.deleteOptionStartTimeRule(c.get("db"), c.req.valid("param").id)
    return row ? c.json({ success: true }, 200) : notFound(c, "Option start time rule not found")
  })

// --- option-unit-tiers ----------------------------------------------------

const listOptionUnitTiersRoute = createRoute({
  method: "get",
  path: "/option-unit-tiers",
  request: { query: optionUnitTierListQuerySchema },
  responses: {
    200: {
      description: "Paginated list of option unit tiers",
      content: { "application/json": { schema: listResponseSchema(optionUnitTierSchema) } },
    },
  },
})

const createOptionUnitTierRoute = createRoute({
  method: "post",
  path: "/option-unit-tiers",
  request: {
    body: {
      required: true,
      content: { "application/json": { schema: insertOptionUnitTierSchema } },
    },
  },
  responses: {
    201: {
      description: "The created option unit tier",
      content: { "application/json": { schema: z.object({ data: optionUnitTierSchema }) } },
    },
  },
})

const getOptionUnitTierRoute = createRoute({
  method: "get",
  path: "/option-unit-tiers/{id}",
  request: { params: idParamSchema },
  responses: {
    200: {
      description: "An option unit tier by id",
      content: { "application/json": { schema: z.object({ data: optionUnitTierSchema }) } },
    },
    404: {
      description: "Option unit tier not found",
      content: { "application/json": { schema: errorResponseSchema } },
    },
  },
})

const updateOptionUnitTierRoute = createRoute({
  method: "patch",
  path: "/option-unit-tiers/{id}",
  request: {
    params: idParamSchema,
    body: {
      required: true,
      content: { "application/json": { schema: updateOptionUnitTierSchema } },
    },
  },
  responses: {
    200: {
      description: "The updated option unit tier",
      content: { "application/json": { schema: z.object({ data: optionUnitTierSchema }) } },
    },
    404: {
      description: "Option unit tier not found",
      content: { "application/json": { schema: errorResponseSchema } },
    },
  },
})

const deleteOptionUnitTierRoute = createRoute({
  method: "delete",
  path: "/option-unit-tiers/{id}",
  request: { params: idParamSchema },
  responses: {
    200: {
      description: "Option unit tier deleted",
      content: { "application/json": { schema: deleteResponseSchema } },
    },
    404: {
      description: "Option unit tier not found",
      content: { "application/json": { schema: errorResponseSchema } },
    },
  },
})

const optionUnitTierRoutes = new OpenAPIHono<Env>({ defaultHook: openApiValidationHook })
  .openapi(listOptionUnitTiersRoute, async (c) =>
    c.json(await pricingService.listOptionUnitTiers(c.get("db"), c.req.valid("query")), 200),
  )
  .openapi(createOptionUnitTierRoute, async (c) =>
    c.json(
      {
        data: created(await pricingService.createOptionUnitTier(c.get("db"), c.req.valid("json"))),
      },
      201,
    ),
  )
  .openapi(getOptionUnitTierRoute, async (c) => {
    const row = await pricingService.getOptionUnitTierById(c.get("db"), c.req.valid("param").id)
    return row ? c.json({ data: row }, 200) : notFound(c, "Option unit tier not found")
  })
  .openapi(updateOptionUnitTierRoute, async (c) => {
    const row = await pricingService.updateOptionUnitTier(
      c.get("db"),
      c.req.valid("param").id,
      c.req.valid("json"),
    )
    return row ? c.json({ data: row }, 200) : notFound(c, "Option unit tier not found")
  })
  .openapi(deleteOptionUnitTierRoute, async (c) => {
    const row = await pricingService.deleteOptionUnitTier(c.get("db"), c.req.valid("param").id)
    return row ? c.json({ success: true }, 200) : notFound(c, "Option unit tier not found")
  })

// --- pickup-price-rules ---------------------------------------------------

const listPickupPriceRulesRoute = createRoute({
  method: "get",
  path: "/pickup-price-rules",
  request: { query: pickupPriceRuleListQuerySchema },
  responses: {
    200: {
      description: "Paginated list of pickup price rules",
      content: { "application/json": { schema: listResponseSchema(pickupPriceRuleSchema) } },
    },
  },
})

const createPickupPriceRuleRoute = createRoute({
  method: "post",
  path: "/pickup-price-rules",
  request: {
    body: {
      required: true,
      content: { "application/json": { schema: insertPickupPriceRuleSchema } },
    },
  },
  responses: {
    201: {
      description: "The created pickup price rule",
      content: { "application/json": { schema: z.object({ data: pickupPriceRuleSchema }) } },
    },
  },
})

const getPickupPriceRuleRoute = createRoute({
  method: "get",
  path: "/pickup-price-rules/{id}",
  request: { params: idParamSchema },
  responses: {
    200: {
      description: "A pickup price rule by id",
      content: { "application/json": { schema: z.object({ data: pickupPriceRuleSchema }) } },
    },
    404: {
      description: "Pickup price rule not found",
      content: { "application/json": { schema: errorResponseSchema } },
    },
  },
})

const updatePickupPriceRuleRoute = createRoute({
  method: "patch",
  path: "/pickup-price-rules/{id}",
  request: {
    params: idParamSchema,
    body: {
      required: true,
      content: { "application/json": { schema: updatePickupPriceRuleSchema } },
    },
  },
  responses: {
    200: {
      description: "The updated pickup price rule",
      content: { "application/json": { schema: z.object({ data: pickupPriceRuleSchema }) } },
    },
    404: {
      description: "Pickup price rule not found",
      content: { "application/json": { schema: errorResponseSchema } },
    },
  },
})

const deletePickupPriceRuleRoute = createRoute({
  method: "delete",
  path: "/pickup-price-rules/{id}",
  request: { params: idParamSchema },
  responses: {
    200: {
      description: "Pickup price rule deleted",
      content: { "application/json": { schema: deleteResponseSchema } },
    },
    404: {
      description: "Pickup price rule not found",
      content: { "application/json": { schema: errorResponseSchema } },
    },
  },
})

const pickupPriceRuleRoutes = new OpenAPIHono<Env>({ defaultHook: openApiValidationHook })
  .openapi(listPickupPriceRulesRoute, async (c) =>
    c.json(await pricingService.listPickupPriceRules(c.get("db"), c.req.valid("query")), 200),
  )
  .openapi(createPickupPriceRuleRoute, async (c) =>
    c.json(
      {
        data: created(await pricingService.createPickupPriceRule(c.get("db"), c.req.valid("json"))),
      },
      201,
    ),
  )
  .openapi(getPickupPriceRuleRoute, async (c) => {
    const row = await pricingService.getPickupPriceRuleById(c.get("db"), c.req.valid("param").id)
    return row ? c.json({ data: row }, 200) : notFound(c, "Pickup price rule not found")
  })
  .openapi(updatePickupPriceRuleRoute, async (c) => {
    const row = await pricingService.updatePickupPriceRule(
      c.get("db"),
      c.req.valid("param").id,
      c.req.valid("json"),
    )
    return row ? c.json({ data: row }, 200) : notFound(c, "Pickup price rule not found")
  })
  .openapi(deletePickupPriceRuleRoute, async (c) => {
    const row = await pricingService.deletePickupPriceRule(c.get("db"), c.req.valid("param").id)
    return row ? c.json({ success: true }, 200) : notFound(c, "Pickup price rule not found")
  })

// --- dropoff-price-rules --------------------------------------------------

const listDropoffPriceRulesRoute = createRoute({
  method: "get",
  path: "/dropoff-price-rules",
  request: { query: dropoffPriceRuleListQuerySchema },
  responses: {
    200: {
      description: "Paginated list of dropoff price rules",
      content: { "application/json": { schema: listResponseSchema(dropoffPriceRuleSchema) } },
    },
  },
})

const createDropoffPriceRuleRoute = createRoute({
  method: "post",
  path: "/dropoff-price-rules",
  request: {
    body: {
      required: true,
      content: { "application/json": { schema: insertDropoffPriceRuleSchema } },
    },
  },
  responses: {
    201: {
      description: "The created dropoff price rule",
      content: { "application/json": { schema: z.object({ data: dropoffPriceRuleSchema }) } },
    },
  },
})

const getDropoffPriceRuleRoute = createRoute({
  method: "get",
  path: "/dropoff-price-rules/{id}",
  request: { params: idParamSchema },
  responses: {
    200: {
      description: "A dropoff price rule by id",
      content: { "application/json": { schema: z.object({ data: dropoffPriceRuleSchema }) } },
    },
    404: {
      description: "Dropoff price rule not found",
      content: { "application/json": { schema: errorResponseSchema } },
    },
  },
})

const updateDropoffPriceRuleRoute = createRoute({
  method: "patch",
  path: "/dropoff-price-rules/{id}",
  request: {
    params: idParamSchema,
    body: {
      required: true,
      content: { "application/json": { schema: updateDropoffPriceRuleSchema } },
    },
  },
  responses: {
    200: {
      description: "The updated dropoff price rule",
      content: { "application/json": { schema: z.object({ data: dropoffPriceRuleSchema }) } },
    },
    404: {
      description: "Dropoff price rule not found",
      content: { "application/json": { schema: errorResponseSchema } },
    },
  },
})

const deleteDropoffPriceRuleRoute = createRoute({
  method: "delete",
  path: "/dropoff-price-rules/{id}",
  request: { params: idParamSchema },
  responses: {
    200: {
      description: "Dropoff price rule deleted",
      content: { "application/json": { schema: deleteResponseSchema } },
    },
    404: {
      description: "Dropoff price rule not found",
      content: { "application/json": { schema: errorResponseSchema } },
    },
  },
})

const dropoffPriceRuleRoutes = new OpenAPIHono<Env>({ defaultHook: openApiValidationHook })
  .openapi(listDropoffPriceRulesRoute, async (c) =>
    c.json(await pricingService.listDropoffPriceRules(c.get("db"), c.req.valid("query")), 200),
  )
  .openapi(createDropoffPriceRuleRoute, async (c) =>
    c.json(
      {
        data: created(
          await pricingService.createDropoffPriceRule(c.get("db"), c.req.valid("json")),
        ),
      },
      201,
    ),
  )
  .openapi(getDropoffPriceRuleRoute, async (c) => {
    const row = await pricingService.getDropoffPriceRuleById(c.get("db"), c.req.valid("param").id)
    return row ? c.json({ data: row }, 200) : notFound(c, "Dropoff price rule not found")
  })
  .openapi(updateDropoffPriceRuleRoute, async (c) => {
    const row = await pricingService.updateDropoffPriceRule(
      c.get("db"),
      c.req.valid("param").id,
      c.req.valid("json"),
    )
    return row ? c.json({ data: row }, 200) : notFound(c, "Dropoff price rule not found")
  })
  .openapi(deleteDropoffPriceRuleRoute, async (c) => {
    const row = await pricingService.deleteDropoffPriceRule(c.get("db"), c.req.valid("param").id)
    return row ? c.json({ success: true }, 200) : notFound(c, "Dropoff price rule not found")
  })

// --- extra-price-rules ----------------------------------------------------

const listExtraPriceRulesRoute = createRoute({
  method: "get",
  path: "/extra-price-rules",
  request: { query: extraPriceRuleListQuerySchema },
  responses: {
    200: {
      description: "Paginated list of extra price rules",
      content: { "application/json": { schema: listResponseSchema(extraPriceRuleSchema) } },
    },
  },
})

const createExtraPriceRuleRoute = createRoute({
  method: "post",
  path: "/extra-price-rules",
  request: {
    body: {
      required: true,
      description:
        "Extra price rule. `pricingMode` uses the addon pricing-mode domain (incl. `unavailable`). Sell/cost amount semantics depend on `pricingMode`; the server enforces the conditional rule and returns a clean 400 on violation.",
      content: { "application/json": { schema: insertExtraPriceRuleSchema } },
    },
  },
  responses: {
    201: {
      description: "The created extra price rule",
      content: { "application/json": { schema: z.object({ data: extraPriceRuleSchema }) } },
    },
  },
})

const getExtraPriceRuleRoute = createRoute({
  method: "get",
  path: "/extra-price-rules/{id}",
  request: { params: idParamSchema },
  responses: {
    200: {
      description: "An extra price rule by id",
      content: { "application/json": { schema: z.object({ data: extraPriceRuleSchema }) } },
    },
    404: {
      description: "Extra price rule not found",
      content: { "application/json": { schema: errorResponseSchema } },
    },
  },
})

const updateExtraPriceRuleRoute = createRoute({
  method: "patch",
  path: "/extra-price-rules/{id}",
  request: {
    params: idParamSchema,
    body: {
      required: true,
      description:
        "Extra price rule patch. `pricingMode` uses the addon pricing-mode domain (incl. `unavailable`). Sell/cost amount semantics depend on `pricingMode`; the server enforces the conditional rule and returns a clean 400 on violation.",
      content: { "application/json": { schema: updateExtraPriceRuleSchema } },
    },
  },
  responses: {
    200: {
      description: "The updated extra price rule",
      content: { "application/json": { schema: z.object({ data: extraPriceRuleSchema }) } },
    },
    404: {
      description: "Extra price rule not found",
      content: { "application/json": { schema: errorResponseSchema } },
    },
  },
})

const deleteExtraPriceRuleRoute = createRoute({
  method: "delete",
  path: "/extra-price-rules/{id}",
  request: { params: idParamSchema },
  responses: {
    200: {
      description: "Extra price rule deleted",
      content: { "application/json": { schema: deleteResponseSchema } },
    },
    404: {
      description: "Extra price rule not found",
      content: { "application/json": { schema: errorResponseSchema } },
    },
  },
})

const extraPriceRuleRoutes = new OpenAPIHono<Env>({ defaultHook: openApiValidationHook })
  .openapi(listExtraPriceRulesRoute, async (c) =>
    c.json(await pricingService.listExtraPriceRules(c.get("db"), c.req.valid("query")), 200),
  )
  .openapi(createExtraPriceRuleRoute, async (c) =>
    c.json(
      {
        data: created(await pricingService.createExtraPriceRule(c.get("db"), c.req.valid("json"))),
      },
      201,
    ),
  )
  .openapi(getExtraPriceRuleRoute, async (c) => {
    const row = await pricingService.getExtraPriceRuleById(c.get("db"), c.req.valid("param").id)
    return row ? c.json({ data: row }, 200) : notFound(c, "Extra price rule not found")
  })
  .openapi(updateExtraPriceRuleRoute, async (c) => {
    const row = await pricingService.updateExtraPriceRule(
      c.get("db"),
      c.req.valid("param").id,
      c.req.valid("json"),
    )
    return row ? c.json({ data: row }, 200) : notFound(c, "Extra price rule not found")
  })
  .openapi(deleteExtraPriceRuleRoute, async (c) => {
    const row = await pricingService.deleteExtraPriceRule(c.get("db"), c.req.valid("param").id)
    return row ? c.json({ success: true }, 200) : notFound(c, "Extra price rule not found")
  })

// --- departure-price-overrides --------------------------------------------

const listDeparturePriceOverridesRoute = createRoute({
  method: "get",
  path: "/departure-price-overrides",
  request: { query: departurePriceOverrideListQuerySchema },
  responses: {
    200: {
      description: "Paginated list of departure price overrides",
      content: { "application/json": { schema: listResponseSchema(departurePriceOverrideSchema) } },
    },
  },
})

const createDeparturePriceOverrideRoute = createRoute({
  method: "post",
  path: "/departure-price-overrides",
  request: {
    body: {
      required: true,
      content: { "application/json": { schema: insertDeparturePriceOverrideSchema } },
    },
  },
  responses: {
    201: {
      description: "The created departure price override",
      content: { "application/json": { schema: z.object({ data: departurePriceOverrideSchema }) } },
    },
  },
})

const getDeparturePriceOverrideRoute = createRoute({
  method: "get",
  path: "/departure-price-overrides/{id}",
  request: { params: idParamSchema },
  responses: {
    200: {
      description: "A departure price override by id",
      content: { "application/json": { schema: z.object({ data: departurePriceOverrideSchema }) } },
    },
    404: {
      description: "Departure price override not found",
      content: { "application/json": { schema: errorResponseSchema } },
    },
  },
})

const updateDeparturePriceOverrideRoute = createRoute({
  method: "patch",
  path: "/departure-price-overrides/{id}",
  request: {
    params: idParamSchema,
    body: {
      required: true,
      content: { "application/json": { schema: updateDeparturePriceOverrideSchema } },
    },
  },
  responses: {
    200: {
      description: "The updated departure price override",
      content: { "application/json": { schema: z.object({ data: departurePriceOverrideSchema }) } },
    },
    404: {
      description: "Departure price override not found",
      content: { "application/json": { schema: errorResponseSchema } },
    },
  },
})

const deleteDeparturePriceOverrideRoute = createRoute({
  method: "delete",
  path: "/departure-price-overrides/{id}",
  request: { params: idParamSchema },
  responses: {
    200: {
      description: "Departure price override deleted",
      content: { "application/json": { schema: deleteResponseSchema } },
    },
    404: {
      description: "Departure price override not found",
      content: { "application/json": { schema: errorResponseSchema } },
    },
  },
})

const departurePriceOverrideRoutes = new OpenAPIHono<Env>({ defaultHook: openApiValidationHook })
  .openapi(listDeparturePriceOverridesRoute, async (c) =>
    c.json(
      await pricingService.listDeparturePriceOverrides(c.get("db"), c.req.valid("query")),
      200,
    ),
  )
  .openapi(createDeparturePriceOverrideRoute, async (c) =>
    c.json(
      {
        data: created(
          await pricingService.createDeparturePriceOverride(c.get("db"), c.req.valid("json")),
        ),
      },
      201,
    ),
  )
  .openapi(getDeparturePriceOverrideRoute, async (c) => {
    const row = await pricingService.getDeparturePriceOverrideById(
      c.get("db"),
      c.req.valid("param").id,
    )
    return row ? c.json({ data: row }, 200) : notFound(c, "Departure price override not found")
  })
  .openapi(updateDeparturePriceOverrideRoute, async (c) => {
    const row = await pricingService.updateDeparturePriceOverride(
      c.get("db"),
      c.req.valid("param").id,
      c.req.valid("json"),
    )
    return row ? c.json({ data: row }, 200) : notFound(c, "Departure price override not found")
  })
  .openapi(deleteDeparturePriceOverrideRoute, async (c) => {
    const row = await pricingService.deleteDeparturePriceOverride(
      c.get("db"),
      c.req.valid("param").id,
    )
    return row ? c.json({ success: true }, 200) : notFound(c, "Departure price override not found")
  })

// Compose the eight per-resource sub-chains onto a single OpenAPIHono so the
// `.openapi()` operations propagate up through the parent `pricingRoutes`
// registry (OpenAPIHono.route copies the sub-app's registered routes).
export const pricingRuleRoutes = new OpenAPIHono<Env>({ defaultHook: openApiValidationHook })
  .route("/", optionPriceRuleRoutes)
  .route("/", optionUnitPriceRuleRoutes)
  .route("/", optionStartTimeRuleRoutes)
  .route("/", optionUnitTierRoutes)
  .route("/", pickupPriceRuleRoutes)
  .route("/", dropoffPriceRuleRoutes)
  .route("/", extraPriceRuleRoutes)
  .route("/", departurePriceOverrideRoutes)
