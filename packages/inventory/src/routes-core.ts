/**
 * Admin product core CRUD + dashboard aggregates + action-ledger timeline —
 * mounted by the operator starter under `/v1/admin/products/...` (staff-actor
 * gated by the parent app's middleware chain).
 *
 * Migrated to `@hono/zod-openapi` for the OpenAPI admin backfill (voyant#2114 —
 * inventory core sub-batch). Request schemas reuse the existing
 * `@voyant-travel/products-contracts` validation schemas the handlers already
 * parse; response row schemas are authored from the Drizzle `products`
 * `$inferSelect` shape (§17: `Date`/timestamp columns serialize to strings over
 * the wire; integer money/pax fields stay numbers). `GET /{id}` returns the
 * product with its hydrated `productType` relation, so its response schema
 * `.extend(...)`s the base row. The action-ledger timeline leg keeps its
 * existing `Context`-typed handler (passed straight to `.openapi()`).
 */

import { createRoute, OpenAPIHono, type RouteHandler, z } from "@hono/zod-openapi"
import {
  aggregateSnapshotKey,
  readThroughAggregateSnapshot,
} from "@voyant-travel/db/aggregate-snapshots"
import { openApiValidationHook } from "@voyant-travel/hono"
import { listResponseSchema } from "@voyant-travel/types"

import {
  appendProductMutationLedgerEntry,
  changedProductFields,
  listProductActionLedger,
  productActionLedgerQuerySchema,
} from "./action-ledger.js"
import { emitProductContentChanged } from "./events.js"
import type { Env } from "./route-env.js"
import { productsService } from "./service.js"
import { ProductPublishReadinessError } from "./service-core.js"
import * as validation from "./validation.js"

const DASHBOARD_AGGREGATES_CACHE_CONTROL = "private, max-age=30"

/** Server-side snapshot TTL — see readThroughAggregateSnapshot (#1629). */
const DASHBOARD_AGGREGATES_TTL_SECONDS = 60

function cacheDashboardAggregates(c: {
  header: (name: string, value: string, options?: { append?: boolean }) => void
}) {
  c.header("Cache-Control", DASHBOARD_AGGREGATES_CACHE_CONTROL)
  c.header("Vary", "Authorization", { append: true })
  c.header("Vary", "Cookie", { append: true })
}

const errorResponseSchema = z.object({ error: z.string() })
const readinessIssueSchema = z.object({
  code: z.string(),
  field: z.string(),
  message: z.string(),
  fix: z.string(),
})
const readinessErrorResponseSchema = z.object({
  error: z.literal("product_not_ready_to_publish"),
  issues: z.array(readinessIssueSchema),
})
const idParamSchema = z.object({ id: z.string() })

/** §17: timestamp columns are ISO strings over the wire; money/pax stay numbers. */
const isoTimestamp = z.string()

const productStatusValues = ["draft", "active", "archived"] as const
const productBookingModeValues = [
  "date",
  "date_time",
  "open",
  "stay",
  "transfer",
  "itinerary",
  "other",
] as const
const productCapacityModeValues = ["free_sale", "limited", "on_request"] as const
const productVisibilityValues = ["public", "private", "hidden"] as const

// --- Response row schema (authored from the Drizzle `products` $inferSelect) --
const classificationSchema = z.object({
  familyCode: z.string().nullable(),
  familyName: z.string().nullable(),
  subtypeCode: z.string().nullable(),
  durationMinutes: z.number().int().nullable(),
  durationDays: z.number().int().nullable(),
  durationProvenance: z.enum(["explicit", "itinerary-derived", "unresolved"]),
  reviewRequired: z.boolean(),
  reviewReasons: z.array(z.enum(["missing_family", "unresolved_duration"])),
})

const productSchema = z.object({
  id: z.string(),
  name: z.string(),
  status: z.enum(productStatusValues),
  description: z.string().nullable(),
  inclusionsHtml: z.string().nullable(),
  exclusionsHtml: z.string().nullable(),
  termsHtml: z.string().nullable(),
  termsShowOnContract: z.boolean(),
  bookingMode: z.enum(productBookingModeValues),
  supplyModel: z.enum(["dynamic", "scheduled"]).optional(),
  capacityMode: z.enum(productCapacityModeValues),
  timezone: z.string().nullable(),
  defaultLanguageTag: z.string().nullable(),
  visibility: z.enum(productVisibilityValues),
  activated: z.boolean(),
  reservationTimeoutMinutes: z.number().int().nullable(),
  sellCurrency: z.string(),
  sellAmountCents: z.number().int().nullable(),
  costAmountCents: z.number().int().nullable(),
  marginPercent: z.number().int().nullable(),
  facilityId: z.string().nullable(),
  supplierId: z.string().nullable(),
  startDate: z.string().nullable(),
  endDate: z.string().nullable(),
  pax: z.number().int().nullable(),
  productTypeId: z.string().nullable(),
  // Product family / subtype / explicit duration — merchandising classification
  // independent of bookingMode.
  productSubtypeCode: z.string().nullable(),
  durationMinutes: z.number().int().nullable(),
  // List view only — detail/create/update responses omit these.
  productTypeName: z.string().nullable().optional(),
  familyCode: z.string().nullable().optional(),
  itineraryDurationDays: z.number().int().nullable().optional(),
  nextDeparture: isoTimestamp.nullable().optional(),
  // Resolved classification, attached by the list + detail read paths.
  classification: classificationSchema.optional(),
  contractTemplateId: z.string().nullable(),
  taxClassId: z.string().nullable(),
  customerPaymentPolicy: z.unknown().nullable(),
  tags: z.array(z.string()).nullable(),
  createdAt: isoTimestamp,
  updatedAt: isoTimestamp,
})

/** `GET /{id}` hydrates the `productType` relation onto the base product row. */
const productWithTypeSchema = productSchema.extend({
  productType: z.object({ id: z.string(), name: z.string(), code: z.string() }).nullable(),
})

const productAggregatesSchema = z.object({
  total: z.number().int(),
  countsByStatus: z.array(
    z.object({ status: z.enum(productStatusValues), count: z.number().int() }),
  ),
  active: z.number().int(),
  publicActive: z.number().int(),
  monthlyCreatedCounts: z.array(z.object({ yearMonth: z.string(), count: z.number().int() })),
})

const actionLedgerPageSchema = z.object({
  data: z.array(z.record(z.string(), z.unknown())),
  pageInfo: z.object({
    nextCursor: z.object({ occurredAt: z.string(), id: z.string() }).nullable(),
  }),
})

// --- routes ---------------------------------------------------------------

const getAggregatesRoute = createRoute({
  method: "get",
  path: "/aggregates",
  request: { query: validation.productAggregatesQuerySchema },
  responses: {
    200: {
      description: "Dashboard product KPI aggregates",
      content: { "application/json": { schema: z.object({ data: productAggregatesSchema }) } },
    },
  },
})

const listProductsRoute = createRoute({
  method: "get",
  path: "/",
  request: { query: validation.productListQuerySchema },
  responses: {
    200: {
      description: "Paginated list of products",
      content: { "application/json": { schema: listResponseSchema(productSchema) } },
    },
  },
})

const createProductRoute = createRoute({
  method: "post",
  path: "/",
  request: {
    body: {
      required: true,
      content: { "application/json": { schema: validation.insertProductSchema } },
    },
  },
  responses: {
    201: {
      description: "The created product",
      content: { "application/json": { schema: z.object({ data: productSchema }) } },
    },
    400: {
      description: "invalid_request: request body failed validation",
      content: { "application/json": { schema: errorResponseSchema } },
    },
    422: {
      description: "product_not_ready_to_publish: scheduled product lacks publish readiness",
      content: { "application/json": { schema: readinessErrorResponseSchema } },
    },
  },
})

const getProductRoute = createRoute({
  method: "get",
  path: "/{id}",
  request: { params: idParamSchema },
  responses: {
    200: {
      description: "A product (with its hydrated product type) by id",
      content: { "application/json": { schema: z.object({ data: productWithTypeSchema }) } },
    },
    404: {
      description: "Product not found",
      content: { "application/json": { schema: errorResponseSchema } },
    },
  },
})

const getProductActionLedgerRoute = createRoute({
  method: "get",
  path: "/{id}/action-ledger",
  request: { params: idParamSchema, query: productActionLedgerQuerySchema },
  responses: {
    200: {
      description: "The product's action-ledger timeline page",
      content: { "application/json": { schema: actionLedgerPageSchema } },
    },
    404: {
      description: "Product not found",
      content: { "application/json": { schema: errorResponseSchema } },
    },
  },
})

const getProductActionLedgerHandler: RouteHandler<typeof getProductActionLedgerRoute, Env> = (c) =>
  listProductActionLedger(c)

const updateProductRoute = createRoute({
  method: "patch",
  path: "/{id}",
  request: {
    params: idParamSchema,
    body: {
      required: true,
      content: { "application/json": { schema: validation.updateProductSchema } },
    },
  },
  responses: {
    200: {
      description: "The updated product",
      content: { "application/json": { schema: z.object({ data: productSchema }) } },
    },
    400: {
      description: "invalid_request: request body failed validation",
      content: { "application/json": { schema: errorResponseSchema } },
    },
    404: {
      description: "Product not found",
      content: { "application/json": { schema: errorResponseSchema } },
    },
    422: {
      description: "product_not_ready_to_publish: scheduled product lacks publish readiness",
      content: { "application/json": { schema: readinessErrorResponseSchema } },
    },
  },
})

const deleteProductRoute = createRoute({
  method: "delete",
  path: "/{id}",
  request: { params: idParamSchema },
  responses: {
    200: {
      description: "Product deleted",
      content: { "application/json": { schema: z.object({ success: z.boolean() }) } },
    },
    404: {
      description: "Product not found",
      content: { "application/json": { schema: errorResponseSchema } },
    },
  },
})

export const productCoreRoutes = new OpenAPIHono<Env>({ defaultHook: openApiValidationHook })
  // GET /aggregates — dashboard KPIs (registered before /{id} so the matcher
  // doesn't swallow it). Served from a read-through TTL snapshot (#1629).
  .openapi(getAggregatesRoute, async (c) => {
    const query = c.req.valid("query")
    cacheDashboardAggregates(c)
    const snapshot = await readThroughAggregateSnapshot(c.get("db"), {
      key: aggregateSnapshotKey("products", "aggregates", query),
      ttlSeconds: DASHBOARD_AGGREGATES_TTL_SECONDS,
      compute: () => productsService.getProductAggregates(c.get("db"), query),
    })
    return c.json({ data: snapshot.data }, 200)
  })
  // GET / — List products
  .openapi(listProductsRoute, async (c) =>
    c.json(await productsService.listProducts(c.get("db"), c.req.valid("query")), 200),
  )
  // POST / — Create product
  .openapi(createProductRoute, async (c) => {
    const input = c.req.valid("json")
    let row: Awaited<ReturnType<typeof productsService.createProduct>>
    try {
      row = await productsService.createProduct(c.get("db"), input)
    } catch (error) {
      if (error instanceof ProductPublishReadinessError) {
        return c.json({ error: "product_not_ready_to_publish" as const, issues: error.issues }, 422)
      }
      throw error
    }
    await appendProductMutationLedgerEntry(c, {
      action: "create",
      productId: row.id,
      changedFields: changedProductFields(input, null, row),
    })
    await c.get("eventBus")?.emit("product.created", { id: row.id })
    return c.json({ data: row }, 201)
  })
  // GET /{id} — Get single product
  .openapi(getProductRoute, async (c) => {
    const row = await productsService.getProductByIdWithType(c.get("db"), c.req.valid("param").id)
    if (!row) {
      return c.json({ error: "Product not found" }, 404)
    }
    return c.json({ data: row }, 200)
  })
  // GET /{id}/action-ledger — Product-scoped action timeline. The shared
  // `listProductActionLedger` serializes via the package-wide `c.json(page)`
  // helper (no explicit status literal), so the typed-response contract is
  // relaxed for this one leg (Hard rule 3: bare-Response escape hatch). The
  // runtime shape matches the declared `actionLedgerPageSchema`.
  .openapi(getProductActionLedgerRoute, getProductActionLedgerHandler)
  // PATCH /{id} — Update product
  .openapi(updateProductRoute, async (c) => {
    const productId = c.req.valid("param").id
    const before = await productsService.getProductById(c.get("db"), productId)
    if (!before) {
      return c.json({ error: "Product not found" }, 404)
    }

    const input = c.req.valid("json")
    let row: Awaited<ReturnType<typeof productsService.updateProduct>>
    try {
      row = await productsService.updateProduct(c.get("db"), productId, input)
    } catch (error) {
      if (error instanceof ProductPublishReadinessError) {
        return c.json({ error: "product_not_ready_to_publish" as const, issues: error.issues }, 422)
      }
      throw error
    }

    if (!row) {
      return c.json({ error: "Product not found" }, 404)
    }

    await appendProductMutationLedgerEntry(c, {
      action: "update",
      productId: row.id,
      changedFields: changedProductFields(input, before, row),
    })
    await c.get("eventBus")?.emit("product.updated", { id: row.id })
    await emitProductContentChanged(c.get("eventBus"), { id: row.id, axis: "product" })
    return c.json({ data: row }, 200)
  })
  // DELETE /{id} — Delete product
  .openapi(deleteProductRoute, async (c) => {
    const productId = c.req.valid("param").id
    const before = await productsService.getProductById(c.get("db"), productId)
    if (!before) {
      return c.json({ error: "Product not found" }, 404)
    }

    const row = await productsService.deleteProduct(c.get("db"), productId)

    if (!row) {
      return c.json({ error: "Product not found" }, 404)
    }

    await appendProductMutationLedgerEntry(c, {
      action: "delete",
      productId: row.id,
      changedFields: [],
    })
    await c.get("eventBus")?.emit("product.deleted", { id: row.id })
    return c.json({ success: true }, 200)
  })
