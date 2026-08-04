// agent-quality: file-size exception -- owner: inventory; the itinerary admin route groups (itineraries, days, day-services, translations, versions, notes) stay co-located until a dedicated split preserves the OpenAPI operation chain and tests.
/**
 * Admin product itinerary routes — itineraries, itinerary days, product days,
 * day services, day translations, version snapshots, and notes. Mounted by the
 * operator starter under `/v1/admin/products/...` on the (already `OpenAPIHono`)
 * parent `productRoutes` (staff-actor gated by the parent app's middleware
 * chain).
 *
 * Migrated to `@hono/zod-openapi` for the OpenAPI admin backfill (voyant#2114 —
 * inventory itinerary sub-batch). Request schemas reuse the existing
 * `@voyant-travel/products-contracts` validation schemas the handlers already
 * parse; response row schemas are authored from the Drizzle `$inferSelect`
 * shapes in `schema-itinerary.ts` (§17: `Date`/timestamp columns serialize to
 * strings over the wire; integer fields stay numbers; note `product_day_services`
 * has only `createdAt`). The day-translation list returns the paginated
 * `listResponse` envelope; the collection lists return a `{ data: [...] }`
 * envelope. The version-create body is optional (the handler parses it in-place
 * and tolerates an empty/invalid JSON body), so its route declares no request
 * body. Business logic, auth, action-ledger writes, and content-changed events
 * are unchanged; handlers read `c.req.valid(...)`.
 *
 * Each resource is its own child `OpenAPIHono` sub-chain mounted via
 * `.route("/", child)` so the parent stays shallow (avoids the O(n²) tsc blowup
 * of one long flat `.openapi(...)` chain).
 */

import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi"
import {
  openApiValidationHook,
  parseJsonBody,
  RequestValidationError,
  requireUserId,
} from "@voyant-travel/hono"
import { listResponseSchema } from "@voyant-travel/types"

import { appendProductMutationLedgerEntry, changedMutationFields } from "./action-ledger.js"
import { emitProductContentChanged } from "./events.js"
import { scheduleReadModelInvalidation } from "./read-model.js"
import type { Env } from "./route-env.js"
import { productsService } from "./service.js"
import * as validation from "./validation.js"

const errorResponseSchema = z.object({ error: z.string() })
const successSchema = z.object({ success: z.boolean() })

const idParamSchema = z.object({ id: z.string() })
const itineraryIdParamSchema = z.object({ itineraryId: z.string() })
const productItineraryParamSchema = z.object({ id: z.string(), itineraryId: z.string() })
const productDayParamSchema = z.object({ id: z.string(), dayId: z.string() })
const productServiceParamSchema = z.object({
  id: z.string(),
  dayId: z.string(),
  serviceId: z.string(),
})
const productDayTranslationParamSchema = z.object({
  id: z.string(),
  dayId: z.string(),
  translationId: z.string(),
})

/** §17: timestamp columns are ISO strings over the wire. */
const isoTimestamp = z.string()

const serviceTypeValues = [
  "accommodation",
  "transfer",
  "experience",
  "guide",
  "meal",
  "other",
] as const

// --- Response row schemas (authored from the Drizzle `$inferSelect` shapes) ---

const itinerarySchema = z.object({
  id: z.string(),
  productId: z.string(),
  name: z.string(),
  isDefault: z.boolean(),
  sortOrder: z.number(),
  createdAt: isoTimestamp,
  updatedAt: isoTimestamp,
})

const daySchema = z.object({
  id: z.string(),
  itineraryId: z.string(),
  dayNumber: z.number(),
  title: z.string().nullable(),
  description: z.string().nullable(),
  location: z.string().nullable(),
  createdAt: isoTimestamp,
  updatedAt: isoTimestamp,
})

/** `product_day_services` has only `createdAt` (no `updatedAt`). */
const dayServiceSchema = z.object({
  id: z.string(),
  dayId: z.string(),
  supplierServiceId: z.string().nullable(),
  supplierId: z.string().nullable(),
  facilityId: z.string().nullable(),
  serviceType: z.enum(serviceTypeValues),
  name: z.string(),
  description: z.string().nullable(),
  countryCode: z.string().nullable(),
  startTimeLocal: z.string().nullable(),
  endTimeLocal: z.string().nullable(),
  durationMinutes: z.number().nullable(),
  inclusionRole: z.enum(["included", "optional"]),
  travelerScope: z.enum(["all", "adults", "children"]),
  costCurrency: z.string(),
  costAmountCents: z.number(),
  quantity: z.number(),
  sortOrder: z.number().nullable(),
  notes: z.string().nullable(),
  createdAt: isoTimestamp,
})

const dayTranslationSchema = z.object({
  id: z.string(),
  dayId: z.string(),
  languageTag: z.string(),
  title: z.string().nullable(),
  description: z.string().nullable(),
  location: z.string().nullable(),
  createdAt: isoTimestamp,
  updatedAt: isoTimestamp,
})

const versionSchema = z.object({
  id: z.string(),
  productId: z.string(),
  versionNumber: z.number(),
  snapshot: z.unknown(),
  authorId: z.string(),
  notes: z.string().nullable(),
  createdAt: isoTimestamp,
})

const noteSchema = z.object({
  id: z.string(),
  productId: z.string(),
  authorId: z.string(),
  content: z.string(),
  createdAt: isoTimestamp,
})

// ==========================================================================
// Itineraries
// ==========================================================================

const listItinerariesRoute = createRoute({
  method: "get",
  path: "/{id}/itineraries",
  request: { params: idParamSchema },
  responses: {
    200: {
      description: "Itineraries for a product",
      content: { "application/json": { schema: z.object({ data: z.array(itinerarySchema) }) } },
    },
  },
})

const createItineraryRoute = createRoute({
  method: "post",
  path: "/{id}/itineraries",
  request: {
    params: idParamSchema,
    body: {
      required: true,
      content: { "application/json": { schema: validation.insertItinerarySchema } },
    },
  },
  responses: {
    201: {
      description: "The created itinerary",
      content: { "application/json": { schema: z.object({ data: itinerarySchema }) } },
    },
    400: {
      description: "invalid_request: request body failed validation",
      content: { "application/json": { schema: errorResponseSchema } },
    },
    404: {
      description: "Product not found",
      content: { "application/json": { schema: errorResponseSchema } },
    },
  },
})

const updateItineraryRoute = createRoute({
  method: "patch",
  path: "/itineraries/{itineraryId}",
  request: {
    params: itineraryIdParamSchema,
    body: {
      required: true,
      content: { "application/json": { schema: validation.updateItinerarySchema } },
    },
  },
  responses: {
    200: {
      description: "The updated itinerary",
      content: { "application/json": { schema: z.object({ data: itinerarySchema }) } },
    },
    400: {
      description: "invalid_request: request body failed validation",
      content: { "application/json": { schema: errorResponseSchema } },
    },
    404: {
      description: "Itinerary not found",
      content: { "application/json": { schema: errorResponseSchema } },
    },
  },
})

const deleteItineraryRoute = createRoute({
  method: "delete",
  path: "/itineraries/{itineraryId}",
  request: { params: itineraryIdParamSchema },
  responses: {
    200: {
      description: "Itinerary deleted",
      content: { "application/json": { schema: successSchema } },
    },
    404: {
      description: "Itinerary not found",
      content: { "application/json": { schema: errorResponseSchema } },
    },
  },
})

const duplicateItineraryRoute = createRoute({
  method: "post",
  path: "/itineraries/{itineraryId}/duplicate",
  request: {
    params: itineraryIdParamSchema,
    body: {
      required: true,
      content: { "application/json": { schema: validation.duplicateItinerarySchema } },
    },
  },
  responses: {
    201: {
      description: "The duplicated itinerary",
      content: { "application/json": { schema: z.object({ data: itinerarySchema }) } },
    },
    400: {
      description: "invalid_request: request body failed validation",
      content: { "application/json": { schema: errorResponseSchema } },
    },
    404: {
      description: "Itinerary not found",
      content: { "application/json": { schema: errorResponseSchema } },
    },
  },
})

const itineraryRoutes = new OpenAPIHono<Env>({ defaultHook: openApiValidationHook })
  .openapi(listItinerariesRoute, async (c) =>
    c.json(
      { data: await productsService.listItineraries(c.get("db"), c.req.valid("param").id) },
      200,
    ),
  )
  .openapi(createItineraryRoute, async (c) => {
    const productId = c.req.valid("param").id
    const body = c.req.valid("json")
    const row = await productsService.createItinerary(c.get("db"), productId, body)

    if (!row) {
      return c.json({ error: "Product not found" }, 404)
    }

    await appendProductMutationLedgerEntry(c, {
      action: "create",
      productId,
      changedFields: changedMutationFields(body, null, row),
      subject: "product itinerary",
      actionName: "product.itinerary.create",
      routeOrToolName: "products.itinerary.create",
    })
    await emitProductContentChanged(c.get("eventBus"), { id: productId, axis: "itinerary" })
    return c.json({ data: row }, 201)
  })
  .openapi(updateItineraryRoute, async (c) => {
    const itineraryId = c.req.valid("param").itineraryId
    const body = c.req.valid("json")
    const before = await productsService.getItineraryById(c.get("db"), itineraryId)
    if (!before) {
      return c.json({ error: "Itinerary not found" }, 404)
    }

    const row = await productsService.updateItinerary(c.get("db"), itineraryId, body)

    if (!row) {
      return c.json({ error: "Itinerary not found" }, 404)
    }

    await appendProductMutationLedgerEntry(c, {
      action: "update",
      productId: row.productId,
      changedFields: changedMutationFields(body, before, row),
      subject: "product itinerary",
      actionName: "product.itinerary.update",
      routeOrToolName: "products.itinerary.update",
    })
    await emitProductContentChanged(c.get("eventBus"), { id: row.productId, axis: "itinerary" })
    // This path is keyed on the itinerary id, so the product-id path regex in
    // the read-model middleware can't see the product — recompute explicitly so
    // the folded default itinerary stays fresh (issue voyant#2910).
    await scheduleReadModelInvalidation(c, row.productId)
    return c.json({ data: row }, 200)
  })
  .openapi(deleteItineraryRoute, async (c) => {
    const itineraryId = c.req.valid("param").itineraryId
    const before = await productsService.getItineraryById(c.get("db"), itineraryId)
    if (!before) {
      return c.json({ error: "Itinerary not found" }, 404)
    }

    const row = await productsService.deleteItinerary(c.get("db"), itineraryId)

    if (!row) {
      return c.json({ error: "Itinerary not found" }, 404)
    }

    await appendProductMutationLedgerEntry(c, {
      action: "delete",
      productId: before.productId,
      changedFields: [],
      subject: "product itinerary",
      actionName: "product.itinerary.delete",
      routeOrToolName: "products.itinerary.delete",
    })
    await emitProductContentChanged(c.get("eventBus"), { id: before.productId, axis: "itinerary" })
    // Itinerary-id-keyed path — recompute explicitly (issue voyant#2910).
    await scheduleReadModelInvalidation(c, before.productId)
    return c.json({ success: true }, 200)
  })
  .openapi(duplicateItineraryRoute, async (c) => {
    const itineraryId = c.req.valid("param").itineraryId
    const body = c.req.valid("json")
    const source = await productsService.getItineraryById(c.get("db"), itineraryId)
    if (!source) {
      return c.json({ error: "Itinerary not found" }, 404)
    }

    const row = await productsService.duplicateItinerary(c.get("db"), itineraryId, body)

    if (!row) {
      return c.json({ error: "Itinerary not found" }, 404)
    }

    await appendProductMutationLedgerEntry(c, {
      action: "duplicate",
      productId: source.productId,
      changedFields: changedMutationFields(body, null, row),
      subject: "product itinerary",
      actionName: "product.itinerary.duplicate",
      routeOrToolName: "products.itinerary.duplicate",
    })
    await emitProductContentChanged(c.get("eventBus"), {
      id: source.productId,
      axis: "itinerary",
    })
    // Itinerary-id-keyed path — recompute explicitly (issue voyant#2910).
    await scheduleReadModelInvalidation(c, source.productId)
    return c.json({ data: row }, 201)
  })

// ==========================================================================
// Itinerary days
// ==========================================================================

const listItineraryDaysRoute = createRoute({
  method: "get",
  path: "/{id}/itineraries/{itineraryId}/days",
  request: { params: productItineraryParamSchema },
  responses: {
    200: {
      description: "Days for an itinerary",
      content: { "application/json": { schema: z.object({ data: z.array(daySchema) }) } },
    },
  },
})

const createItineraryDayRoute = createRoute({
  method: "post",
  path: "/{id}/itineraries/{itineraryId}/days",
  request: {
    params: productItineraryParamSchema,
    body: {
      required: true,
      content: { "application/json": { schema: validation.insertDaySchema } },
    },
  },
  responses: {
    201: {
      description: "The created itinerary day",
      content: { "application/json": { schema: z.object({ data: daySchema }) } },
    },
    400: {
      description: "invalid_request: request body failed validation",
      content: { "application/json": { schema: errorResponseSchema } },
    },
    404: {
      description: "Itinerary not found",
      content: { "application/json": { schema: errorResponseSchema } },
    },
  },
})

const itineraryDayRoutes = new OpenAPIHono<Env>({ defaultHook: openApiValidationHook })
  .openapi(listItineraryDaysRoute, async (c) =>
    c.json(
      {
        data: await productsService.listItineraryDays(
          c.get("db"),
          c.req.valid("param").itineraryId,
        ),
      },
      200,
    ),
  )
  .openapi(createItineraryDayRoute, async (c) => {
    const { id: productId, itineraryId } = c.req.valid("param")
    const body = c.req.valid("json")
    const row = await productsService.createItineraryDay(c.get("db"), productId, itineraryId, body)

    if (!row) {
      return c.json({ error: "Itinerary not found" }, 404)
    }

    await appendProductMutationLedgerEntry(c, {
      action: "create",
      productId,
      changedFields: changedMutationFields(body, null, row),
      subject: "product itinerary day",
      actionName: "product.day.create",
      routeOrToolName: "products.day.create",
    })
    await emitProductContentChanged(c.get("eventBus"), { id: productId, axis: "day" })
    return c.json({ data: row }, 201)
  })

// ==========================================================================
// Product days
// ==========================================================================

const listDaysRoute = createRoute({
  method: "get",
  path: "/{id}/days",
  request: { params: idParamSchema },
  responses: {
    200: {
      description: "Days for a product",
      content: { "application/json": { schema: z.object({ data: z.array(daySchema) }) } },
    },
  },
})

const createDayRoute = createRoute({
  method: "post",
  path: "/{id}/days",
  request: {
    params: idParamSchema,
    body: {
      required: true,
      content: { "application/json": { schema: validation.insertDaySchema } },
    },
  },
  responses: {
    201: {
      description: "The created day",
      content: { "application/json": { schema: z.object({ data: daySchema }) } },
    },
    400: {
      description: "invalid_request: request body failed validation",
      content: { "application/json": { schema: errorResponseSchema } },
    },
    404: {
      description: "Product not found",
      content: { "application/json": { schema: errorResponseSchema } },
    },
  },
})

const updateDayRoute = createRoute({
  method: "patch",
  path: "/{id}/days/{dayId}",
  request: {
    params: productDayParamSchema,
    body: {
      required: true,
      content: { "application/json": { schema: validation.updateDaySchema } },
    },
  },
  responses: {
    200: {
      description: "The updated day",
      content: { "application/json": { schema: z.object({ data: daySchema }) } },
    },
    400: {
      description: "invalid_request: request body failed validation",
      content: { "application/json": { schema: errorResponseSchema } },
    },
    404: {
      description: "Day not found",
      content: { "application/json": { schema: errorResponseSchema } },
    },
  },
})

const deleteDayRoute = createRoute({
  method: "delete",
  path: "/{id}/days/{dayId}",
  request: { params: productDayParamSchema },
  responses: {
    200: {
      description: "Day deleted",
      content: { "application/json": { schema: successSchema } },
    },
    404: {
      description: "Day not found",
      content: { "application/json": { schema: errorResponseSchema } },
    },
  },
})

const dayRoutes = new OpenAPIHono<Env>({ defaultHook: openApiValidationHook })
  .openapi(listDaysRoute, async (c) =>
    c.json({ data: await productsService.listDays(c.get("db"), c.req.valid("param").id) }, 200),
  )
  .openapi(createDayRoute, async (c) => {
    const productId = c.req.valid("param").id
    const body = c.req.valid("json")
    const row = await productsService.createDay(c.get("db"), productId, body)

    if (!row) {
      return c.json({ error: "Product not found" }, 404)
    }

    await appendProductMutationLedgerEntry(c, {
      action: "create",
      productId,
      changedFields: changedMutationFields(body, null, row),
      subject: "product itinerary day",
      actionName: "product.day.create",
      routeOrToolName: "products.day.create",
    })
    await emitProductContentChanged(c.get("eventBus"), { id: productId, axis: "day" })
    return c.json({ data: row }, 201)
  })
  .openapi(updateDayRoute, async (c) => {
    const { id: productId, dayId } = c.req.valid("param")
    const body = c.req.valid("json")
    const before = await productsService.getDayForProductMutation(c.get("db"), dayId)
    if (!before || before.productId !== productId) {
      return c.json({ error: "Day not found" }, 404)
    }

    const row = await productsService.updateDay(c.get("db"), dayId, body)

    if (!row) {
      return c.json({ error: "Day not found" }, 404)
    }

    await appendProductMutationLedgerEntry(c, {
      action: "update",
      productId: before.productId,
      changedFields: changedMutationFields(body, before, row),
      subject: "product itinerary day",
      actionName: "product.day.update",
      routeOrToolName: "products.day.update",
    })
    await emitProductContentChanged(c.get("eventBus"), { id: before.productId, axis: "day" })
    return c.json({ data: row }, 200)
  })
  .openapi(deleteDayRoute, async (c) => {
    const { id: productId, dayId } = c.req.valid("param")
    const before = await productsService.getDayForProductMutation(c.get("db"), dayId)
    if (!before || before.productId !== productId) {
      return c.json({ error: "Day not found" }, 404)
    }

    const row = await productsService.deleteDay(c.get("db"), dayId)

    if (!row) {
      return c.json({ error: "Day not found" }, 404)
    }

    await appendProductMutationLedgerEntry(c, {
      action: "delete",
      productId: before.productId,
      changedFields: [],
      subject: "product itinerary day",
      actionName: "product.day.delete",
      routeOrToolName: "products.day.delete",
    })
    await emitProductContentChanged(c.get("eventBus"), { id: before.productId, axis: "day" })
    return c.json({ success: true }, 200)
  })

// ==========================================================================
// Day services
// ==========================================================================

const listDayServicesRoute = createRoute({
  method: "get",
  path: "/{id}/days/{dayId}/services",
  request: { params: productDayParamSchema },
  responses: {
    200: {
      description: "Services for a day",
      content: { "application/json": { schema: z.object({ data: z.array(dayServiceSchema) }) } },
    },
  },
})

const createDayServiceRoute = createRoute({
  method: "post",
  path: "/{id}/days/{dayId}/services",
  request: {
    params: productDayParamSchema,
    body: {
      required: true,
      content: { "application/json": { schema: validation.insertDayServiceSchema } },
    },
  },
  responses: {
    201: {
      description: "The created day service",
      content: { "application/json": { schema: z.object({ data: dayServiceSchema }) } },
    },
    400: {
      description: "invalid_request: request body failed validation",
      content: { "application/json": { schema: errorResponseSchema } },
    },
    404: {
      description: "Day not found",
      content: { "application/json": { schema: errorResponseSchema } },
    },
  },
})

const updateDayServiceRoute = createRoute({
  method: "patch",
  path: "/{id}/days/{dayId}/services/{serviceId}",
  request: {
    params: productServiceParamSchema,
    body: {
      required: true,
      content: { "application/json": { schema: validation.updateDayServiceSchema } },
    },
  },
  responses: {
    200: {
      description: "The updated day service",
      content: { "application/json": { schema: z.object({ data: dayServiceSchema }) } },
    },
    400: {
      description: "invalid_request: request body failed validation",
      content: { "application/json": { schema: errorResponseSchema } },
    },
    404: {
      description: "Service not found",
      content: { "application/json": { schema: errorResponseSchema } },
    },
  },
})

const deleteDayServiceRoute = createRoute({
  method: "delete",
  path: "/{id}/days/{dayId}/services/{serviceId}",
  request: { params: productServiceParamSchema },
  responses: {
    200: {
      description: "Service deleted",
      content: { "application/json": { schema: successSchema } },
    },
    404: {
      description: "Service not found",
      content: { "application/json": { schema: errorResponseSchema } },
    },
  },
})

const dayServiceRoutes = new OpenAPIHono<Env>({ defaultHook: openApiValidationHook })
  .openapi(listDayServicesRoute, async (c) =>
    c.json(
      { data: await productsService.listDayServices(c.get("db"), c.req.valid("param").dayId) },
      200,
    ),
  )
  .openapi(createDayServiceRoute, async (c) => {
    const { id: productId, dayId } = c.req.valid("param")
    const body = c.req.valid("json")
    const row = await productsService.createDayService(c.get("db"), productId, dayId, body)

    if (!row) {
      return c.json({ error: "Day not found" }, 404)
    }

    await appendProductMutationLedgerEntry(c, {
      action: "create",
      productId,
      changedFields: changedMutationFields(body, null, row),
      subject: "product day service",
      actionName: "product.day_service.create",
      routeOrToolName: "products.day_service.create",
    })
    await emitProductContentChanged(c.get("eventBus"), { id: productId, axis: "day" })
    return c.json({ data: row }, 201)
  })
  .openapi(updateDayServiceRoute, async (c) => {
    const { id: productId, serviceId } = c.req.valid("param")
    const body = c.req.valid("json")
    const before = await productsService.getDayServiceForProductMutation(c.get("db"), serviceId)
    if (!before || before.productId !== productId) {
      return c.json({ error: "Service not found" }, 404)
    }

    const row = await productsService.updateDayService(c.get("db"), productId, serviceId, body)

    if (!row) {
      return c.json({ error: "Service not found" }, 404)
    }

    await appendProductMutationLedgerEntry(c, {
      action: "update",
      productId: before.productId,
      changedFields: changedMutationFields(body, before, row),
      subject: "product day service",
      actionName: "product.day_service.update",
      routeOrToolName: "products.day_service.update",
    })
    await emitProductContentChanged(c.get("eventBus"), { id: before.productId, axis: "day" })
    return c.json({ data: row }, 200)
  })
  .openapi(deleteDayServiceRoute, async (c) => {
    const { id: productId, serviceId } = c.req.valid("param")
    const before = await productsService.getDayServiceForProductMutation(c.get("db"), serviceId)
    if (!before || before.productId !== productId) {
      return c.json({ error: "Service not found" }, 404)
    }

    const row = await productsService.deleteDayService(c.get("db"), productId, serviceId)

    if (!row) {
      return c.json({ error: "Service not found" }, 404)
    }

    await appendProductMutationLedgerEntry(c, {
      action: "delete",
      productId: before.productId,
      changedFields: [],
      subject: "product day service",
      actionName: "product.day_service.delete",
      routeOrToolName: "products.day_service.delete",
    })
    await emitProductContentChanged(c.get("eventBus"), { id: before.productId, axis: "day" })
    return c.json({ success: true }, 200)
  })

// ==========================================================================
// Day translations
// ==========================================================================

const listDayTranslationsRoute = createRoute({
  method: "get",
  path: "/{id}/days/{dayId}/translations",
  request: { params: productDayParamSchema },
  responses: {
    200: {
      description: "Paginated list of day translations",
      content: { "application/json": { schema: listResponseSchema(dayTranslationSchema) } },
    },
  },
})

const createDayTranslationRoute = createRoute({
  method: "post",
  path: "/{id}/days/{dayId}/translations",
  request: {
    params: productDayParamSchema,
    body: {
      required: true,
      content: { "application/json": { schema: validation.insertProductDayTranslationSchema } },
    },
  },
  responses: {
    201: {
      description: "The created day translation",
      content: { "application/json": { schema: z.object({ data: dayTranslationSchema }) } },
    },
    400: {
      description: "invalid_request: request body failed validation",
      content: { "application/json": { schema: errorResponseSchema } },
    },
    404: {
      description: "Day not found",
      content: { "application/json": { schema: errorResponseSchema } },
    },
  },
})

const updateDayTranslationRoute = createRoute({
  method: "patch",
  path: "/{id}/days/{dayId}/translations/{translationId}",
  request: {
    params: productDayTranslationParamSchema,
    body: {
      required: true,
      content: { "application/json": { schema: validation.updateProductDayTranslationSchema } },
    },
  },
  responses: {
    200: {
      description: "The updated day translation",
      content: { "application/json": { schema: z.object({ data: dayTranslationSchema }) } },
    },
    400: {
      description: "invalid_request: request body failed validation",
      content: { "application/json": { schema: errorResponseSchema } },
    },
    404: {
      description: "Day translation not found",
      content: { "application/json": { schema: errorResponseSchema } },
    },
  },
})

const deleteDayTranslationRoute = createRoute({
  method: "delete",
  path: "/{id}/days/{dayId}/translations/{translationId}",
  request: { params: productDayTranslationParamSchema },
  responses: {
    200: {
      description: "Day translation deleted",
      content: { "application/json": { schema: successSchema } },
    },
    404: {
      description: "Day translation not found",
      content: { "application/json": { schema: errorResponseSchema } },
    },
  },
})

const dayTranslationRoutes = new OpenAPIHono<Env>({ defaultHook: openApiValidationHook })
  .openapi(listDayTranslationsRoute, async (c) =>
    c.json(
      await productsService.listProductDayTranslations(c.get("db"), {
        dayId: c.req.valid("param").dayId,
        limit: 100,
        offset: 0,
      }),
      200,
    ),
  )
  .openapi(createDayTranslationRoute, async (c) => {
    const { id: productId, dayId } = c.req.valid("param")
    const body = c.req.valid("json")
    const row = await productsService.createProductDayTranslation(
      c.get("db"),
      productId,
      dayId,
      body,
    )

    if (!row) {
      return c.json({ error: "Day not found" }, 404)
    }

    await appendProductMutationLedgerEntry(c, {
      action: "create",
      productId,
      changedFields: changedMutationFields(body, null, row),
      subject: "product day translation",
      actionName: "product.day_translation.create",
      routeOrToolName: "products.day_translation.create",
    })
    await emitProductContentChanged(c.get("eventBus"), { id: productId, axis: "day" })
    return c.json({ data: row }, 201)
  })
  .openapi(updateDayTranslationRoute, async (c) => {
    const { id: productId, dayId, translationId } = c.req.valid("param")
    const before = await productsService.getDayTranslationForProductMutation(
      c.get("db"),
      translationId,
    )
    if (!before || before.productId !== productId || before.dayId !== dayId) {
      return c.json({ error: "Day translation not found" }, 404)
    }

    const body = c.req.valid("json")
    const row = await productsService.updateProductDayTranslation(c.get("db"), translationId, body)

    if (!row) {
      return c.json({ error: "Day translation not found" }, 404)
    }

    await appendProductMutationLedgerEntry(c, {
      action: "update",
      productId,
      changedFields: changedMutationFields(body, before, row),
      subject: "product day translation",
      actionName: "product.day_translation.update",
      routeOrToolName: "products.day_translation.update",
    })
    await emitProductContentChanged(c.get("eventBus"), { id: productId, axis: "day" })
    return c.json({ data: row }, 200)
  })
  .openapi(deleteDayTranslationRoute, async (c) => {
    const { id: productId, dayId, translationId } = c.req.valid("param")
    const before = await productsService.getDayTranslationForProductMutation(
      c.get("db"),
      translationId,
    )
    if (!before || before.productId !== productId || before.dayId !== dayId) {
      return c.json({ error: "Day translation not found" }, 404)
    }

    const row = await productsService.deleteProductDayTranslation(c.get("db"), translationId)

    if (!row) {
      return c.json({ error: "Day translation not found" }, 404)
    }

    await appendProductMutationLedgerEntry(c, {
      action: "delete",
      productId,
      changedFields: [],
      subject: "product day translation",
      actionName: "product.day_translation.delete",
      routeOrToolName: "products.day_translation.delete",
    })
    await emitProductContentChanged(c.get("eventBus"), { id: productId, axis: "day" })
    return c.json({ success: true }, 200)
  })

// ==========================================================================
// Versions
// ==========================================================================

const listVersionsRoute = createRoute({
  method: "get",
  path: "/{id}/versions",
  request: { params: idParamSchema },
  responses: {
    200: {
      description: "Version snapshots for a product",
      content: { "application/json": { schema: z.object({ data: z.array(versionSchema) }) } },
    },
  },
})

// The version-create body is optional: the handler parses it in-place and
// tolerates an empty/invalid JSON body (defaulting to `{}`), so this route
// declares no request body (rule 4: optional/empty bodies parse in-handler).
const createVersionRoute = createRoute({
  method: "post",
  path: "/{id}/versions",
  request: { params: idParamSchema },
  responses: {
    201: {
      description: "The created version snapshot",
      content: { "application/json": { schema: z.object({ data: versionSchema }) } },
    },
    404: {
      description: "Product not found",
      content: { "application/json": { schema: errorResponseSchema } },
    },
  },
})

const versionRoutes = new OpenAPIHono<Env>({ defaultHook: openApiValidationHook })
  .openapi(listVersionsRoute, async (c) =>
    c.json({ data: await productsService.listVersions(c.get("db"), c.req.valid("param").id) }, 200),
  )
  .openapi(createVersionRoute, async (c) => {
    const userId = requireUserId(c)
    const row = await productsService.createVersion(
      c.get("db"),
      c.req.valid("param").id,
      userId,
      await parseJsonBody(c, validation.insertVersionSchema, {
        invalidJsonMessage: "Invalid JSON body",
      }).catch((error) => {
        if (error instanceof RequestValidationError && error.message === "Invalid JSON body") {
          return {}
        }

        throw error
      }),
    )

    if (!row) {
      return c.json({ error: "Product not found" }, 404)
    }

    return c.json({ data: row }, 201)
  })

// ==========================================================================
// Notes
// ==========================================================================

const listNotesRoute = createRoute({
  method: "get",
  path: "/{id}/notes",
  request: { params: idParamSchema },
  responses: {
    200: {
      description: "Notes for a product",
      content: { "application/json": { schema: z.object({ data: z.array(noteSchema) }) } },
    },
  },
})

const createNoteRoute = createRoute({
  method: "post",
  path: "/{id}/notes",
  request: {
    params: idParamSchema,
    body: {
      required: true,
      content: { "application/json": { schema: validation.insertProductNoteSchema } },
    },
  },
  responses: {
    201: {
      description: "The created note",
      content: { "application/json": { schema: z.object({ data: noteSchema }) } },
    },
    400: {
      description: "invalid_request: request body failed validation",
      content: { "application/json": { schema: errorResponseSchema } },
    },
    404: {
      description: "Product not found",
      content: { "application/json": { schema: errorResponseSchema } },
    },
  },
})

const noteRoutes = new OpenAPIHono<Env>({ defaultHook: openApiValidationHook })
  .openapi(listNotesRoute, async (c) =>
    c.json({ data: await productsService.listNotes(c.get("db"), c.req.valid("param").id) }, 200),
  )
  .openapi(createNoteRoute, async (c) => {
    const userId = requireUserId(c)
    const row = await productsService.createNote(
      c.get("db"),
      c.req.valid("param").id,
      userId,
      c.req.valid("json"),
    )

    if (!row) {
      return c.json({ error: "Product not found" }, 404)
    }

    return c.json({ data: row }, 201)
  })

// Mount each per-resource child sub-chain on the itinerary parent. Each child
// registers its own collection legs before its dynamic `/{id}` legs; the
// shallow `.route("/", child)` mounts keep the parent flat.
export const productItineraryRoutes = new OpenAPIHono<Env>({
  defaultHook: openApiValidationHook,
})
  .route("/", itineraryRoutes)
  .route("/", itineraryDayRoutes)
  .route("/", dayRoutes)
  .route("/", dayServiceRoutes)
  .route("/", dayTranslationRoutes)
  .route("/", versionRoutes)
  .route("/", noteRoutes)
