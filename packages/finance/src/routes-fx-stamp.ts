/**
 * Admin FX-stamp routes — mounted under `/v1/admin/finance/...`.
 *
 * Documents issued from now on stamp themselves with the rate of their own
 * date. These routes exist for the ones that came before: an operator can hand
 * back the rate printed on the paperwork their accounting provider issued, or
 * let the configured source answer for that date, and repair the record in
 * place instead of keeping a spreadsheet beside the platform (voyant#4703).
 */

import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi"
import { openApiValidationHook } from "@voyant-travel/hono"

import { errorResponseSchema } from "./routes-invoice-schemas.js"
import { getFinanceRouteRuntime } from "./routes-runtime.js"
import type { Env } from "./routes-shared.js"
import { FxStampError, stampInvoiceFx, stampPaymentFx } from "./service-fx-stamp.js"

const idParamSchema = z.object({ id: z.string() })

const fxStampRequestSchema = z.object({
  /**
   * The published rate for the document's date — reporting-currency units per
   * one unit of the document's currency, BEFORE the operator's margin. Omit to
   * ask the configured reference source.
   */
  rate: z.number().positive().optional(),
  /** The source that published `rate`. */
  source: z.string().min(1).max(32).optional(),
  /** Replace an existing stamp. Off by default: a stamp is meant to hold. */
  force: z.boolean().optional(),
})

const fxStampResultSchema = z.object({
  documentId: z.string(),
  currency: z.string(),
  reportingCurrency: z.string(),
  rate: z.number(),
  effectiveRate: z.number(),
  commissionBps: z.number().int(),
  fxRateSetId: z.string().nullable(),
  reportingAmountCents: z.number().int(),
})

const stampResponses = {
  200: {
    description: "The FX stamp written onto the document",
    content: { "application/json": { schema: z.object({ data: fxStampResultSchema }) } },
  },
  400: {
    description: "invalid_request, or the document cannot carry an FX stamp",
    content: { "application/json": { schema: errorResponseSchema } },
  },
  404: {
    description: "Document not found",
    content: { "application/json": { schema: errorResponseSchema } },
  },
  409: {
    description: "The document already carries an FX stamp",
    content: { "application/json": { schema: errorResponseSchema } },
  },
  422: {
    description: "No rate is available for the document's date",
    content: { "application/json": { schema: errorResponseSchema } },
  },
} as const

const stampInvoiceFxRoute = createRoute({
  method: "post",
  path: "/invoices/{id}/fx-stamp",
  request: {
    params: idParamSchema,
    body: { required: false, content: { "application/json": { schema: fxStampRequestSchema } } },
  },
  responses: stampResponses,
})

const stampPaymentFxRoute = createRoute({
  method: "post",
  path: "/payments/{id}/fx-stamp",
  request: {
    params: idParamSchema,
    body: { required: false, content: { "application/json": { schema: fxStampRequestSchema } } },
  },
  responses: stampResponses,
})

export const financeFxStampRoutes = new OpenAPIHono<Env>({ defaultHook: openApiValidationHook })
  .openapi(stampInvoiceFxRoute, async (c) => {
    try {
      const result = await stampInvoiceFx(
        c.get("db"),
        c.req.valid("param").id,
        c.req.valid("json") ?? {},
        getFinanceRouteRuntime(c) ?? {},
      )
      return result ? c.json({ data: result }, 200) : c.json({ error: "Invoice not found" }, 404)
    } catch (error) {
      if (error instanceof FxStampError) {
        return c.json({ error: error.message, code: error.code }, error.status as 400 | 409 | 422)
      }
      throw error
    }
  })
  .openapi(stampPaymentFxRoute, async (c) => {
    try {
      const result = await stampPaymentFx(
        c.get("db"),
        c.req.valid("param").id,
        c.req.valid("json") ?? {},
        getFinanceRouteRuntime(c) ?? {},
      )
      return result ? c.json({ data: result }, 200) : c.json({ error: "Payment not found" }, 404)
    } catch (error) {
      if (error instanceof FxStampError) {
        return c.json({ error: error.message, code: error.code }, error.status as 400 | 409 | 422)
      }
      throw error
    }
  })
