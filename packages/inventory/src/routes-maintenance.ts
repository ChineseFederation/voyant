/**
 * Admin product maintenance routes (recalculate cost + margin) — mounted by the
 * operator starter under `/v1/admin/products/...` (staff-actor gated by the
 * parent app's middleware chain).
 *
 * Migrated to `@hono/zod-openapi` for the OpenAPI admin backfill (voyant#2114 —
 * inventory core sub-batch). Its `.openapi()` operation propagates up through
 * the parent `productRoutes` registry.
 *
 * The response reports the roll-up in the product's sell `currency` (integer
 * cents/percent — §17) alongside the per-source-currency subtotals it was built
 * from. `costAmountCents` and `marginPercent` are null when a source currency
 * had no resolvable FX rate; the currencies concerned are named in
 * `unconvertibleCurrencies` rather than folded in at a guessed rate (#4162).
 */

import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi"
import { openApiValidationHook } from "@voyant-travel/hono"

import type { Env } from "./route-env.js"
import { productsService } from "./service.js"

const errorResponseSchema = z.object({ error: z.string() })

const recalculateResultSchema = z.object({
  currency: z.string(),
  costAmountCents: z.number().int().nullable(),
  marginPercent: z.number().int().nullable(),
  byCurrency: z.array(z.object({ currency: z.string(), amountCents: z.number().int() })),
  unconvertibleCurrencies: z.array(z.string()),
})

const recalculateProductRoute = createRoute({
  method: "post",
  path: "/{id}/recalculate",
  request: { params: z.object({ id: z.string() }) },
  responses: {
    200: {
      description: "The recalculated product cost and margin",
      content: { "application/json": { schema: z.object({ data: recalculateResultSchema }) } },
    },
    404: {
      description: "Product not found",
      content: { "application/json": { schema: errorResponseSchema } },
    },
  },
})

export const productMaintenanceRoutes = new OpenAPIHono<Env>({ defaultHook: openApiValidationHook })
  // POST /{id}/recalculate — Recalculate product cost and margin
  .openapi(recalculateProductRoute, async (c) => {
    const result = await productsService.recalculate(c.get("db"), c.req.valid("param").id)

    if (!result) {
      return c.json({ error: "Product not found" }, 404)
    }

    return c.json({ data: result }, 200)
  })
