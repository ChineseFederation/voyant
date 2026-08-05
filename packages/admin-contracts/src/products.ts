/**
 * Products admin operations: list/get + create/update/delete.
 *
 * Input schemas derive from `@voyant-travel/products-contracts` — the products
 * validation was extracted out of the runtime `@voyant-travel/inventory` package into
 * that pure, zero-runtime contract package, so this package can depend on it
 * (mirroring the bookings/finance/crm/legal split). Output schemas stay loose
 * client-facing projections (ADR-0003).
 */

import {
  insertProductSchema,
  productListQuerySchema,
  updateProductSchema,
} from "@voyant-travel/products-contracts/validation"
import { z } from "zod"

import { defineOperation } from "./core/operation.js"
import { paginated } from "./core/pagination.js"

const productClassificationSummarySchema = z.object({
  familyCode: z.string().nullable(),
  familyName: z.string().nullable(),
  subtypeCode: z.string().nullable(),
  durationMinutes: z.number().int().nullable(),
  durationDays: z.number().int().nullable(),
  durationProvenance: z.enum(["explicit", "itinerary-derived", "unresolved"]),
  scheduleTerm: z.enum(["session", "occurrence", "departure"]),
  reviewRequired: z.boolean(),
  reviewReasons: z.array(z.enum(["missing_family", "unresolved_duration"])),
})

export const productSummarySchema = z.object({
  id: z.string(),
  name: z.string().nullable().optional(),
  status: z.string().nullable().optional(),
  productTypeId: z.string().nullable().optional(),
  productTypeName: z.string().nullable().optional(),
  // Product family / subtype / duration — the merchandising classification,
  // independent of booking mode and supply model.
  productSubtypeCode: z.string().nullable().optional(),
  durationMinutes: z.number().int().nullable().optional(),
  bookingMode: z.string().nullable().optional(),
  classification: productClassificationSummarySchema.optional(),
  reference: z.string().nullable().optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
})
export type ProductSummary = z.infer<typeof productSummarySchema>

// Delete/ack response — kept loose (route may return `{ success }` or the row).
const ackSchema = z.object({ success: z.boolean().optional(), id: z.string().optional() })

// List input derives from the canonical route query schema, minus the filters
// the service doesn't actually implement — so the SDK never advertises a no-op
// filter. `productListQuerySchema` accepts `taxClassId`, but
// `productsService.listProducts` adds no predicate for it (Codex P2).
export const productsListInputSchema = productListQuerySchema.omit({ taxClassId: true })

const list = defineOperation({
  id: "products.list",
  method: "GET",
  path: () => "/v1/admin/products",
  pathTemplate: "/v1/admin/products",
  input: productsListInputSchema,
  output: paginated(productSummarySchema),
  classification: "read",
  scopes: ["products:read"],
  envelope: "raw",
  summary: "List products with filters and offset pagination.",
})

const get = defineOperation({
  id: "products.get",
  method: "GET",
  path: (p: { id: string }) => `/v1/admin/products/${p.id}`,
  pathTemplate: "/v1/admin/products/:id",
  input: z.object({}),
  output: productSummarySchema,
  classification: "read",
  scopes: ["products:read"],
  summary: "Get a single product by id.",
})

const create = defineOperation({
  id: "products.create",
  method: "POST",
  path: () => "/v1/admin/products",
  pathTemplate: "/v1/admin/products",
  input: insertProductSchema,
  output: productSummarySchema,
  classification: "routine_write",
  scopes: ["products:write"],
  summary: "Create a product.",
})

const update = defineOperation({
  id: "products.update",
  method: "PATCH",
  path: (p: { id: string }) => `/v1/admin/products/${p.id}`,
  pathTemplate: "/v1/admin/products/:id",
  input: updateProductSchema,
  output: productSummarySchema,
  classification: "routine_write",
  scopes: ["products:write"],
  summary: "Update a product.",
})

const del = defineOperation({
  id: "products.delete",
  method: "DELETE",
  path: (p: { id: string }) => `/v1/admin/products/${p.id}`,
  pathTemplate: "/v1/admin/products/:id",
  input: z.object({}),
  output: ackSchema,
  classification: "destructive",
  scopes: ["products:delete"],
  summary: "Delete a product.",
})

export const productsOperations = { list, get, create, update, delete: del } as const
