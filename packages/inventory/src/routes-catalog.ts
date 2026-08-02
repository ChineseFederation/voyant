/**
 * Admin product catalog taxonomy routes — product types, product categories,
 * and product tags. Mounted by the operator starter under
 * `/v1/admin/products/...` on the (already `OpenAPIHono`) parent `productRoutes`
 * (staff-actor gated by the parent app's middleware chain).
 *
 * Migrated to `@hono/zod-openapi` for the OpenAPI admin backfill (voyant#2114 —
 * inventory catalog sub-batch). Request schemas reuse the existing
 * `@voyant-travel/products-contracts` validation schemas the handlers already
 * parse; response row schemas are authored from the Drizzle `$inferSelect`
 * shapes in `schema-taxonomy.ts` (§17: `Date`/timestamp columns serialize to
 * strings over the wire; integer fields stay numbers, jsonb columns stay
 * objects). Business logic, auth, and serialization are unchanged; handlers
 * read `c.req.valid(...)`.
 *
 * Each resource is its own child `OpenAPIHono` sub-chain mounted via
 * `.route("/", child)` so the parent stays shallow (avoids the O(n²) tsc blowup
 * of one long flat `.openapi(...)` chain). Within each child the static
 * collection paths are registered before the dynamic `/{id}` legs.
 */

import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi"
import { openApiValidationHook } from "@voyant-travel/hono"
import { listResponseSchema } from "@voyant-travel/types"

import type { Env } from "./route-env.js"
import { productsService } from "./service.js"
import * as validation from "./validation.js"

const errorResponseSchema = z.object({ error: z.string() })
const successSchema = z.object({ success: z.boolean() })

/** §17: timestamp columns are ISO strings over the wire. */
const isoTimestamp = z.string()

// --- Response row schemas (authored from the Drizzle `$inferSelect` shapes) ---

const productTypeSchema = z.object({
  id: z.string(),
  name: z.string(),
  code: z.string(),
  description: z.string().nullable(),
  sortOrder: z.number(),
  active: z.boolean(),
  metadata: z.record(z.string(), z.unknown()).nullable(),
  createdAt: isoTimestamp,
  updatedAt: isoTimestamp,
})

const productCategorySchema = z.object({
  id: z.string(),
  parentId: z.string().nullable(),
  name: z.string(),
  slug: z.string(),
  description: z.string().nullable(),
  sortOrder: z.number(),
  active: z.boolean(),
  customerPaymentPolicy: z.unknown().nullable(),
  metadata: z.record(z.string(), z.unknown()).nullable(),
  createdAt: isoTimestamp,
  updatedAt: isoTimestamp,
})

const productTagSchema = z.object({
  id: z.string(),
  name: z.string(),
  createdAt: isoTimestamp,
  updatedAt: isoTimestamp,
})

// ==========================================================================
// Product Types
// ==========================================================================

const typeIdParamSchema = z.object({ typeId: z.string() })

const listProductTypesRoute = createRoute({
  method: "get",
  path: "/product-types",
  request: { query: validation.productTypeListQuerySchema },
  responses: {
    200: {
      description: "Paginated list of product families",
      content: { "application/json": { schema: listResponseSchema(productTypeSchema) } },
    },
  },
})

const getProductTypeRoute = createRoute({
  method: "get",
  path: "/product-types/{typeId}",
  request: { params: typeIdParamSchema },
  responses: {
    200: {
      description: "A product family by id",
      content: { "application/json": { schema: z.object({ data: productTypeSchema }) } },
    },
    404: {
      description: "Product family not found",
      content: { "application/json": { schema: errorResponseSchema } },
    },
  },
})

const createProductTypeRoute = createRoute({
  method: "post",
  path: "/product-types",
  request: {
    body: {
      required: true,
      content: { "application/json": { schema: validation.insertProductTypeSchema } },
    },
  },
  responses: {
    201: {
      description: "The created product family",
      content: { "application/json": { schema: z.object({ data: productTypeSchema }) } },
    },
    400: {
      description: "invalid_request: request body failed validation",
      content: { "application/json": { schema: errorResponseSchema } },
    },
  },
})

const updateProductTypeRoute = createRoute({
  method: "patch",
  path: "/product-types/{typeId}",
  request: {
    params: typeIdParamSchema,
    body: {
      required: true,
      content: { "application/json": { schema: validation.updateProductTypeSchema } },
    },
  },
  responses: {
    200: {
      description: "The updated product family",
      content: { "application/json": { schema: z.object({ data: productTypeSchema }) } },
    },
    400: {
      description: "invalid_request: request body failed validation",
      content: { "application/json": { schema: errorResponseSchema } },
    },
    404: {
      description: "Product family not found",
      content: { "application/json": { schema: errorResponseSchema } },
    },
  },
})

const deleteProductTypeRoute = createRoute({
  method: "delete",
  path: "/product-types/{typeId}",
  request: { params: typeIdParamSchema },
  responses: {
    200: {
      description: "Product family deleted",
      content: { "application/json": { schema: successSchema } },
    },
    404: {
      description: "Product family not found",
      content: { "application/json": { schema: errorResponseSchema } },
    },
    409: {
      description: "Product family is standard or still assigned to products",
      content: { "application/json": { schema: errorResponseSchema } },
    },
  },
})

const productTypeRoutes = new OpenAPIHono<Env>({ defaultHook: openApiValidationHook })
  .openapi(listProductTypesRoute, async (c) =>
    c.json(await productsService.listProductTypes(c.get("db"), c.req.valid("query")), 200),
  )
  .openapi(getProductTypeRoute, async (c) => {
    const row = await productsService.getProductTypeById(c.get("db"), c.req.valid("param").typeId)
    if (!row) {
      return c.json({ error: "Product family not found" }, 404)
    }
    return c.json({ data: row }, 200)
  })
  .openapi(createProductTypeRoute, async (c) => {
    const row = await productsService.createProductType(c.get("db"), c.req.valid("json"))
    if (!row) {
      // Defensive: the insert always returns the new row. Narrow the
      // service's `[row]` (`Row | undefined`) without polluting the contract.
      throw new Error("Failed to create product family")
    }
    return c.json({ data: row }, 201)
  })
  .openapi(updateProductTypeRoute, async (c) => {
    const row = await productsService.updateProductType(
      c.get("db"),
      c.req.valid("param").typeId,
      c.req.valid("json"),
    )
    if (!row) {
      return c.json({ error: "Product family not found" }, 404)
    }
    return c.json({ data: row }, 200)
  })
  .openapi(deleteProductTypeRoute, async (c) => {
    const row = await productsService.deleteProductType(c.get("db"), c.req.valid("param").typeId)
    if (!row) {
      return c.json({ error: "Product family not found" }, 404)
    }
    return c.json({ success: true }, 200)
  })

// ==========================================================================
// Product Categories
// ==========================================================================

const categoryIdParamSchema = z.object({ categoryId: z.string() })

const listProductCategoriesRoute = createRoute({
  method: "get",
  path: "/product-categories",
  request: { query: validation.productCategoryListQuerySchema },
  responses: {
    200: {
      description: "Paginated list of product categories",
      content: { "application/json": { schema: listResponseSchema(productCategorySchema) } },
    },
  },
})

const getProductCategoryRoute = createRoute({
  method: "get",
  path: "/product-categories/{categoryId}",
  request: { params: categoryIdParamSchema },
  responses: {
    200: {
      description: "A product category by id",
      content: { "application/json": { schema: z.object({ data: productCategorySchema }) } },
    },
    404: {
      description: "Product category not found",
      content: { "application/json": { schema: errorResponseSchema } },
    },
  },
})

const createProductCategoryRoute = createRoute({
  method: "post",
  path: "/product-categories",
  request: {
    body: {
      required: true,
      content: { "application/json": { schema: validation.insertProductCategorySchema } },
    },
  },
  responses: {
    201: {
      description: "The created product category",
      content: { "application/json": { schema: z.object({ data: productCategorySchema }) } },
    },
    400: {
      description: "invalid_request: request body failed validation",
      content: { "application/json": { schema: errorResponseSchema } },
    },
  },
})

const updateProductCategoryRoute = createRoute({
  method: "patch",
  path: "/product-categories/{categoryId}",
  request: {
    params: categoryIdParamSchema,
    body: {
      required: true,
      content: { "application/json": { schema: validation.updateProductCategorySchema } },
    },
  },
  responses: {
    200: {
      description: "The updated product category",
      content: { "application/json": { schema: z.object({ data: productCategorySchema }) } },
    },
    400: {
      description: "invalid_request: request body failed validation",
      content: { "application/json": { schema: errorResponseSchema } },
    },
    404: {
      description: "Product category not found",
      content: { "application/json": { schema: errorResponseSchema } },
    },
  },
})

const deleteProductCategoryRoute = createRoute({
  method: "delete",
  path: "/product-categories/{categoryId}",
  request: { params: categoryIdParamSchema },
  responses: {
    200: {
      description: "Product category deleted",
      content: { "application/json": { schema: successSchema } },
    },
    404: {
      description: "Product category not found",
      content: { "application/json": { schema: errorResponseSchema } },
    },
  },
})

const productCategoryRoutes = new OpenAPIHono<Env>({ defaultHook: openApiValidationHook })
  .openapi(listProductCategoriesRoute, async (c) =>
    c.json(await productsService.listProductCategories(c.get("db"), c.req.valid("query")), 200),
  )
  .openapi(getProductCategoryRoute, async (c) => {
    const row = await productsService.getProductCategoryById(
      c.get("db"),
      c.req.valid("param").categoryId,
    )
    if (!row) {
      return c.json({ error: "Product category not found" }, 404)
    }
    return c.json({ data: row }, 200)
  })
  .openapi(createProductCategoryRoute, async (c) => {
    const row = await productsService.createProductCategory(c.get("db"), c.req.valid("json"))
    if (!row) {
      // Defensive: the insert always returns the new row.
      throw new Error("Failed to create product category")
    }
    return c.json({ data: row }, 201)
  })
  .openapi(updateProductCategoryRoute, async (c) => {
    const row = await productsService.updateProductCategory(
      c.get("db"),
      c.req.valid("param").categoryId,
      c.req.valid("json"),
    )
    if (!row) {
      return c.json({ error: "Product category not found" }, 404)
    }
    return c.json({ data: row }, 200)
  })
  .openapi(deleteProductCategoryRoute, async (c) => {
    const row = await productsService.deleteProductCategory(
      c.get("db"),
      c.req.valid("param").categoryId,
    )
    if (!row) {
      return c.json({ error: "Product category not found" }, 404)
    }
    return c.json({ success: true }, 200)
  })

// ==========================================================================
// Product Tags
// ==========================================================================

const tagIdParamSchema = z.object({ tagId: z.string() })

const listProductTagsRoute = createRoute({
  method: "get",
  path: "/product-tags",
  request: { query: validation.productTagListQuerySchema },
  responses: {
    200: {
      description: "Paginated list of product tags",
      content: { "application/json": { schema: listResponseSchema(productTagSchema) } },
    },
  },
})

const getProductTagRoute = createRoute({
  method: "get",
  path: "/product-tags/{tagId}",
  request: { params: tagIdParamSchema },
  responses: {
    200: {
      description: "A product tag by id",
      content: { "application/json": { schema: z.object({ data: productTagSchema }) } },
    },
    404: {
      description: "Product tag not found",
      content: { "application/json": { schema: errorResponseSchema } },
    },
  },
})

const createProductTagRoute = createRoute({
  method: "post",
  path: "/product-tags",
  request: {
    body: {
      required: true,
      content: { "application/json": { schema: validation.insertProductTagSchema } },
    },
  },
  responses: {
    201: {
      description: "The created product tag",
      content: { "application/json": { schema: z.object({ data: productTagSchema }) } },
    },
    400: {
      description: "invalid_request: request body failed validation",
      content: { "application/json": { schema: errorResponseSchema } },
    },
  },
})

const updateProductTagRoute = createRoute({
  method: "patch",
  path: "/product-tags/{tagId}",
  request: {
    params: tagIdParamSchema,
    body: {
      required: true,
      content: { "application/json": { schema: validation.updateProductTagSchema } },
    },
  },
  responses: {
    200: {
      description: "The updated product tag",
      content: { "application/json": { schema: z.object({ data: productTagSchema }) } },
    },
    400: {
      description: "invalid_request: request body failed validation",
      content: { "application/json": { schema: errorResponseSchema } },
    },
    404: {
      description: "Product tag not found",
      content: { "application/json": { schema: errorResponseSchema } },
    },
  },
})

const deleteProductTagRoute = createRoute({
  method: "delete",
  path: "/product-tags/{tagId}",
  request: { params: tagIdParamSchema },
  responses: {
    200: {
      description: "Product tag deleted",
      content: { "application/json": { schema: successSchema } },
    },
    404: {
      description: "Product tag not found",
      content: { "application/json": { schema: errorResponseSchema } },
    },
  },
})

const productTagRoutes = new OpenAPIHono<Env>({ defaultHook: openApiValidationHook })
  .openapi(listProductTagsRoute, async (c) =>
    c.json(await productsService.listProductTags(c.get("db"), c.req.valid("query")), 200),
  )
  .openapi(getProductTagRoute, async (c) => {
    const row = await productsService.getProductTagById(c.get("db"), c.req.valid("param").tagId)
    if (!row) {
      return c.json({ error: "Product tag not found" }, 404)
    }
    return c.json({ data: row }, 200)
  })
  .openapi(createProductTagRoute, async (c) => {
    const row = await productsService.createProductTag(c.get("db"), c.req.valid("json"))
    if (!row) {
      // Defensive: the insert always returns the new row.
      throw new Error("Failed to create product tag")
    }
    return c.json({ data: row }, 201)
  })
  .openapi(updateProductTagRoute, async (c) => {
    const row = await productsService.updateProductTag(
      c.get("db"),
      c.req.valid("param").tagId,
      c.req.valid("json"),
    )
    if (!row) {
      return c.json({ error: "Product tag not found" }, 404)
    }
    return c.json({ data: row }, 200)
  })
  .openapi(deleteProductTagRoute, async (c) => {
    const row = await productsService.deleteProductTag(c.get("db"), c.req.valid("param").tagId)
    if (!row) {
      return c.json({ error: "Product tag not found" }, 404)
    }
    return c.json({ success: true }, 200)
  })

// Mount each per-resource child sub-chain on the catalog parent. The three
// taxonomy resources live under disjoint path prefixes, so mount order between
// them is immaterial; within each child the static collection paths are
// registered before the dynamic `/{id}` legs.
export const productCatalogRoutes = new OpenAPIHono<Env>({ defaultHook: openApiValidationHook })
  .route("/", productTypeRoutes)
  .route("/", productCategoryRoutes)
  .route("/", productTagRoutes)
