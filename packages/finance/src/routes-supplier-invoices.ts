/**
 * Admin supplier-invoice (accounts-payable) routes — mounted by the operator
 * starter under `/v1/admin/finance/...` (staff-actor-gated by the parent app's
 * middleware chain). Covers the AP invoice CRUD, its line items + cost
 * allocations, supplier payments, attachments, and the signed document/file
 * download redirects.
 *
 * Migrated to `@hono/zod-openapi` for the OpenAPI admin backfill (voyant#2114 /
 * voyant#2208 — finance sub-batch 9E). Request schemas reuse the existing
 * `@voyant-travel/finance-contracts` schemas the handlers already parse;
 * response row schemas are authored from the Drizzle `$inferSelect` shapes of
 * `supplier_invoices` / `supplier_invoice_lines` / `supplier_cost_allocations`
 * / `supplier_payments` / `supplier_invoice_attachments` (§17: `date`/timestamp
 * columns serialize to strings over the wire; integer money / sort columns stay
 * numbers; untyped jsonb → `z.unknown().nullable()`).
 *
 * Each resource is its own small `OpenAPIHono` sub-chain composed onto
 * `supplierInvoiceRoutes` via `.route("/")` — keeping per-resource chains small
 * bounds the type-inference cost (one flat 14-leg chain has O(n²) inference
 * cost and OOMs the framework build). `OpenAPIHono.route` copies each sub-app's
 * registered `.openapi()` operations up through the parent registry.
 *
 * agent-quality: file-size exception — intentional: a mechanically-repetitive
 * AP bundle over three supplier-invoice resources (14 legs), each with a
 * `createRoute` def + handler co-located per the established admin route
 * pattern (owner: finance). Splitting per resource would fragment the single
 * mounted instance without aiding review. See voyant#2114 / voyant#2208.
 */

import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi"
import { openApiValidationHook } from "@voyant-travel/hono"
import type { Context } from "hono"

import { resolveStoredDocumentDownload } from "./document-download.js"
import { getActionLedgerRequestContext, getFinanceRouteRuntime } from "./routes-runtime.js"
import type { Env } from "./routes-shared.js"
import { financeService } from "./service.js"
import {
  SupplierInvoiceServiceError,
  supplierInvoicesService,
} from "./service-supplier-invoices.js"
import {
  insertSupplierInvoiceAttachmentSchema,
  insertSupplierInvoicePaymentBodySchema,
  insertSupplierInvoiceSchema,
  setSupplierCostAllocationsSchema,
  setSupplierInvoiceLinesSchema,
  supplierInvoiceListQuerySchema,
  supplierPaymentListQuerySchema,
  updateSupplierInvoiceSchema,
} from "./validation.js"

const errorResponseSchema = z.object({ error: z.string() })
const successResponseSchema = z.object({ success: z.boolean() })

/**
 * `SupplierInvoiceServiceError` serializes its message + code; the plain
 * not-found paths serialize just `error`, so `code` is optional here.
 */
const supplierInvoiceErrorSchema = z.object({ error: z.string(), code: z.string().optional() })

/** `date`/timestamp columns serialize to strings (§17). */
const isoString = z.string()
/** Untyped jsonb columns. */
const unknownJsonb = z.unknown().nullable()

const idParamSchema = z.object({ id: z.string() })

// --- Response row schemas (authored from the Drizzle $inferSelect shapes;
//     §17: `date`/timestamp columns are strings on the wire; integer money /
//     sort columns stay numbers) ---------------------------------------------

const supplierInvoiceStatusValues = [
  "draft",
  "received",
  "approved",
  "partially_paid",
  "paid",
  "disputed",
  "void",
] as const

const apServiceTypeValues = [
  "transport",
  "flight",
  "accommodation",
  "guide",
  "meal",
  "experience",
  "insurance",
  "other",
] as const

const costAllocationTargetTypeValues = [
  "departure",
  "product",
  "booking",
  "traveler",
  "unattributed",
] as const

const costAllocationSplitMethodValues = ["manual", "per_pax", "equal", "weighted"] as const

const paymentMethodValues = [
  "bank_transfer",
  "credit_card",
  "debit_card",
  "cash",
  "cheque",
  "wallet",
  "direct_bill",
  "travel_credit",
  "other",
] as const

const paymentStatusValues = ["pending", "completed", "failed", "refunded"] as const

const supplierInvoiceSchema = z.object({
  id: z.string(),
  supplierId: z.string(),
  /**
   * Joined in on read from the suppliers module. `null` when the id resolves to
   * nothing — a supplier deleted since, or a deployment without the suppliers
   * module — so the caller can fall back to the id rather than render an empty
   * cell.
   */
  supplierName: z.string().nullable(),
  supplierInvoiceNo: z.string(),
  internalRef: z.string().nullable(),
  status: z.enum(supplierInvoiceStatusValues),
  currency: z.string(),
  baseCurrency: z.string().nullable(),
  fxRateSetId: z.string().nullable(),
  subtotalCents: z.number().int(),
  taxCents: z.number().int(),
  totalCents: z.number().int(),
  baseSubtotalCents: z.number().int().nullable(),
  baseTaxCents: z.number().int().nullable(),
  baseTotalCents: z.number().int().nullable(),
  paidCents: z.number().int(),
  balanceDueCents: z.number().int(),
  taxRegimeId: z.string().nullable(),
  issueDate: isoString,
  dueDate: isoString.nullable(),
  receivedAt: isoString.nullable(),
  approvedAt: isoString.nullable(),
  approvedBy: z.string().nullable(),
  storageKey: z.string().nullable(),
  extractionId: z.string().nullable(),
  notes: z.string().nullable(),
  voidedAt: isoString.nullable(),
  voidReason: z.string().nullable(),
  createdAt: isoString,
  updatedAt: isoString,
  deletedAt: isoString.nullable(),
})

const supplierInvoiceLineSchema = z.object({
  id: z.string(),
  supplierInvoiceId: z.string(),
  description: z.string(),
  serviceType: z.enum(apServiceTypeValues),
  costCategoryId: z.string().nullable(),
  supplierServiceId: z.string().nullable(),
  quantity: z.number().int(),
  unitAmountCents: z.number().int(),
  taxRateBps: z.number().int().nullable(),
  taxAmountCents: z.number().int(),
  totalAmountCents: z.number().int(),
  sortOrder: z.number().int(),
  createdAt: isoString,
  updatedAt: isoString,
})

const supplierCostAllocationSchema = z.object({
  id: z.string(),
  supplierInvoiceId: z.string(),
  supplierInvoiceLineId: z.string().nullable(),
  targetType: z.enum(costAllocationTargetTypeValues),
  departureId: z.string().nullable(),
  productId: z.string().nullable(),
  bookingId: z.string().nullable(),
  bookingItemId: z.string().nullable(),
  travelerId: z.string().nullable(),
  amountCents: z.number().int(),
  baseAmountCents: z.number().int().nullable(),
  splitMethod: z.enum(costAllocationSplitMethodValues),
  createdAt: isoString,
  updatedAt: isoString,
  // Joined in by `loadSupplierInvoice` (resolved target display label).
  targetLabel: z.string().nullable(),
})

/** The detail shape returned by `loadSupplierInvoice` (header + lines + allocations). */
const supplierInvoiceDetailSchema = supplierInvoiceSchema.extend({
  lines: z.array(supplierInvoiceLineSchema),
  allocations: z.array(supplierCostAllocationSchema),
})

const supplierPaymentSchema = z.object({
  id: z.string(),
  bookingId: z.string().nullable(),
  supplierId: z.string().nullable(),
  bookingSupplierStatusId: z.string().nullable(),
  supplierInvoiceId: z.string().nullable(),
  amountCents: z.number().int(),
  currency: z.string(),
  baseCurrency: z.string().nullable(),
  baseAmountCents: z.number().int().nullable(),
  fxRateSetId: z.string().nullable(),
  paymentMethod: z.enum(paymentMethodValues),
  paymentInstrumentId: z.string().nullable(),
  status: z.enum(paymentStatusValues),
  referenceNumber: z.string().nullable(),
  paymentDate: isoString,
  notes: z.string().nullable(),
  createdAt: isoString,
  updatedAt: isoString,
})

const supplierInvoiceAttachmentSchema = z.object({
  id: z.string(),
  supplierInvoiceId: z.string(),
  kind: z.string(),
  name: z.string(),
  mimeType: z.string().nullable(),
  fileSize: z.number().int().nullable(),
  storageKey: z.string().nullable(),
  checksum: z.string().nullable(),
  metadata: unknownJsonb,
  createdAt: isoString,
})

const listEnvelopeSchema = <T extends z.ZodTypeAny>(item: T) =>
  z.object({
    data: z.array(item),
    total: z.number().int(),
    limit: z.number().int(),
    offset: z.number().int(),
  })

/**
 * Map a SupplierInvoiceServiceError to HTTP. `not_found` → 404; the allocation
 * invariant violations (§6.1) → 422. Anything else re-throws to the boundary.
 */
function handleSupplierInvoiceError(c: Context<Env>, error: unknown) {
  if (error instanceof SupplierInvoiceServiceError) {
    const status = error.code === "supplier_invoice_not_found" ? 404 : 422
    return c.json({ error: error.message, code: error.code }, status)
  }
  throw error
}

/**
 * Action-ledger + FX runtime for the AP (supplier-invoice) service. The FX
 * options (settings + exchange-rate resolver) let create/update/setLines snapshot
 * each invoice's accounting-base value at the rate effective on its issue date.
 */
function apRuntime(c: Context<Env>) {
  const fx = getFinanceRouteRuntime(c)
  return {
    actionLedgerContext: getActionLedgerRequestContext(c),
    actionLedgerAuthorizationSource: "finance.supplier_invoice.route" as const,
    ...(fx?.invoiceFxSettings !== undefined ? { invoiceFxSettings: fx.invoiceFxSettings } : {}),
    ...(fx?.resolveInvoiceFxSettings
      ? { resolveInvoiceFxSettings: fx.resolveInvoiceFxSettings }
      : {}),
    ...(fx?.resolveInvoiceExchangeRate
      ? { resolveInvoiceExchangeRate: fx.resolveInvoiceExchangeRate }
      : {}),
    ...(fx?.onInvoiceFxResolutionError
      ? { onInvoiceFxResolutionError: fx.onInvoiceFxResolutionError }
      : {}),
  }
}

// ===========================================================================
// Supplier invoices (header CRUD + lines + allocations + document download)
// ===========================================================================

const listSupplierInvoicesRoute = createRoute({
  method: "get",
  path: "/supplier-invoices",
  request: { query: supplierInvoiceListQuerySchema },
  responses: {
    200: {
      description: "A page of supplier invoices matching the filters",
      content: { "application/json": { schema: listEnvelopeSchema(supplierInvoiceSchema) } },
    },
  },
})

const createSupplierInvoiceRoute = createRoute({
  method: "post",
  path: "/supplier-invoices",
  request: {
    body: {
      required: true,
      content: { "application/json": { schema: insertSupplierInvoiceSchema } },
    },
  },
  responses: {
    201: {
      description: "The created supplier invoice (with its lines + allocations)",
      content: { "application/json": { schema: z.object({ data: supplierInvoiceDetailSchema }) } },
    },
    400: {
      description: "invalid_request: request body failed validation",
      content: { "application/json": { schema: errorResponseSchema } },
    },
    404: {
      description: "Supplier invoice not found",
      content: { "application/json": { schema: supplierInvoiceErrorSchema } },
    },
    422: {
      description: "Cost-allocation invariant violation (§6.1)",
      content: { "application/json": { schema: supplierInvoiceErrorSchema } },
    },
  },
})

const getSupplierInvoiceRoute = createRoute({
  method: "get",
  path: "/supplier-invoices/{id}",
  request: { params: idParamSchema },
  responses: {
    200: {
      description: "The supplier invoice (with its lines + allocations)",
      content: { "application/json": { schema: z.object({ data: supplierInvoiceDetailSchema }) } },
    },
    404: {
      description: "Supplier invoice not found",
      content: { "application/json": { schema: errorResponseSchema } },
    },
    422: {
      description: "Supplier invoice payable invariant failed",
      content: { "application/json": { schema: supplierInvoiceErrorSchema } },
    },
  },
})

const updateSupplierInvoiceRoute = createRoute({
  method: "patch",
  path: "/supplier-invoices/{id}",
  request: {
    params: idParamSchema,
    body: {
      required: true,
      content: { "application/json": { schema: updateSupplierInvoiceSchema } },
    },
  },
  responses: {
    200: {
      description: "The updated supplier invoice (with its lines + allocations)",
      content: { "application/json": { schema: z.object({ data: supplierInvoiceDetailSchema }) } },
    },
    400: {
      description: "invalid_request: request body failed validation",
      content: { "application/json": { schema: errorResponseSchema } },
    },
    404: {
      description: "Supplier invoice not found",
      content: { "application/json": { schema: errorResponseSchema } },
    },
    422: {
      description: "Supplier invoice payable invariant failed",
      content: { "application/json": { schema: supplierInvoiceErrorSchema } },
    },
  },
})

const deleteSupplierInvoiceRoute = createRoute({
  method: "delete",
  path: "/supplier-invoices/{id}",
  request: { params: idParamSchema },
  responses: {
    200: {
      description: "The id of the soft-deleted supplier invoice",
      content: {
        "application/json": { schema: z.object({ data: z.object({ id: z.string() }) }) },
      },
    },
    404: {
      description: "Supplier invoice not found",
      content: { "application/json": { schema: errorResponseSchema } },
    },
  },
})

const setSupplierInvoiceLinesRoute = createRoute({
  method: "put",
  path: "/supplier-invoices/{id}/lines",
  request: {
    params: idParamSchema,
    body: {
      required: true,
      content: { "application/json": { schema: setSupplierInvoiceLinesSchema } },
    },
  },
  responses: {
    200: {
      description: "The supplier invoice with its replaced lines (totals recomputed)",
      content: { "application/json": { schema: z.object({ data: supplierInvoiceDetailSchema }) } },
    },
    400: {
      description: "invalid_request: request body failed validation",
      content: { "application/json": { schema: errorResponseSchema } },
    },
    404: {
      description: "Supplier invoice not found",
      content: { "application/json": { schema: supplierInvoiceErrorSchema } },
    },
    422: {
      description: "Supplier invoice payable or allocation invariant failed",
      content: { "application/json": { schema: supplierInvoiceErrorSchema } },
    },
  },
})

const setSupplierAllocationsRoute = createRoute({
  method: "put",
  path: "/supplier-invoices/{id}/allocations",
  request: {
    params: idParamSchema,
    body: {
      required: true,
      content: { "application/json": { schema: setSupplierCostAllocationsSchema } },
    },
  },
  responses: {
    200: {
      description: "The supplier invoice with its replaced cost allocations",
      content: { "application/json": { schema: z.object({ data: supplierInvoiceDetailSchema }) } },
    },
    400: {
      description: "invalid_request: request body failed validation",
      content: { "application/json": { schema: errorResponseSchema } },
    },
    404: {
      description: "Supplier invoice not found",
      content: { "application/json": { schema: supplierInvoiceErrorSchema } },
    },
    422: {
      description: "Cost-allocation invariant violation (§6.1)",
      content: { "application/json": { schema: supplierInvoiceErrorSchema } },
    },
  },
})

const downloadSupplierInvoiceDocumentRoute = createRoute({
  method: "get",
  path: "/supplier-invoices/{id}/document/download",
  request: { params: idParamSchema },
  responses: {
    302: { description: "Redirect to the signed document download URL" },
    404: {
      description: "Supplier invoice not found, has no document, or the file is not available",
      content: { "application/json": { schema: errorResponseSchema } },
    },
    501: {
      description: "The document download resolver is not configured",
      content: { "application/json": { schema: errorResponseSchema } },
    },
  },
})

const supplierInvoiceCrudRoutes = new OpenAPIHono<Env>({ defaultHook: openApiValidationHook })
  .openapi(listSupplierInvoicesRoute, async (c) =>
    c.json(await supplierInvoicesService.list(c.get("db"), c.req.valid("query")), 200),
  )
  .openapi(createSupplierInvoiceRoute, async (c) => {
    try {
      const row = await supplierInvoicesService.create(
        c.get("db"),
        c.req.valid("json"),
        apRuntime(c),
      )
      if (!row) return c.json({ error: "Supplier invoice not found" }, 404)
      return c.json({ data: row }, 201)
    } catch (error) {
      if (error instanceof SupplierInvoiceServiceError) {
        return c.json({ error: error.message, code: error.code }, 422)
      }
      throw error
    }
  })
  .openapi(getSupplierInvoiceRoute, async (c) => {
    const row = await supplierInvoicesService.getById(c.get("db"), c.req.valid("param").id)
    if (!row) return c.json({ error: "Supplier invoice not found" }, 404)
    return c.json({ data: row }, 200)
  })
  .openapi(updateSupplierInvoiceRoute, async (c) => {
    try {
      const row = await supplierInvoicesService.update(
        c.get("db"),
        c.req.valid("param").id,
        c.req.valid("json"),
        apRuntime(c),
      )
      if (!row) return c.json({ error: "Supplier invoice not found" }, 404)
      return c.json({ data: row }, 200)
    } catch (error) {
      if (error instanceof SupplierInvoiceServiceError) {
        return c.json({ error: error.message, code: error.code }, 422)
      }
      throw error
    }
  })
  .openapi(deleteSupplierInvoiceRoute, async (c) => {
    const result = await supplierInvoicesService.softDelete(
      c.get("db"),
      c.req.valid("param").id,
      apRuntime(c),
    )
    if (!result) return c.json({ error: "Supplier invoice not found" }, 404)
    return c.json({ data: result }, 200)
  })
  .openapi(setSupplierInvoiceLinesRoute, async (c) => {
    try {
      const row = await supplierInvoicesService.setLines(
        c.get("db"),
        c.req.valid("param").id,
        c.req.valid("json"),
        apRuntime(c),
      )
      if (!row) return c.json({ error: "Supplier invoice not found" }, 404)
      return c.json({ data: row }, 200)
    } catch (error) {
      // setLines now rejects edits that would over-allocate surviving
      // whole-invoice allocations (§6.1) → 422 via the shared mapper.
      return handleSupplierInvoiceError(c, error)
    }
  })
  .openapi(setSupplierAllocationsRoute, async (c) => {
    try {
      const row = await supplierInvoicesService.setAllocations(
        c.get("db"),
        c.req.valid("param").id,
        c.req.valid("json"),
        apRuntime(c),
      )
      if (!row) return c.json({ error: "Supplier invoice not found" }, 404)
      return c.json({ data: row }, 200)
    } catch (error) {
      if (error instanceof SupplierInvoiceServiceError) {
        return c.json({ error: error.message, code: error.code }, 422)
      }
      throw error
    }
  })
  .openapi(downloadSupplierInvoiceDocumentRoute, async (c) => {
    const invoice = await supplierInvoicesService.getById(c.get("db"), c.req.valid("param").id)
    if (!invoice) return c.json({ error: "Supplier invoice not found" }, 404)
    if (!invoice.storageKey) return c.json({ error: "No document attached" }, 404)

    const runtime = getFinanceRouteRuntime(c)
    const download = await resolveStoredDocumentDownload(
      { storageKey: invoice.storageKey },
      { bindings: c.env, resolveDocumentDownloadUrl: runtime?.resolveDocumentDownloadUrl },
    )
    if (download.status === "resolver_not_configured") {
      return c.json({ error: "Document download resolver is not configured" }, 501)
    }
    if (download.status !== "ready") {
      return c.json({ error: "Supplier invoice document is not available" }, 404)
    }
    return c.redirect(download.download.url, 302)
  })

// ===========================================================================
// Supplier payments (scoped to a supplier invoice)
// ===========================================================================

const listSupplierInvoicePaymentsRoute = createRoute({
  method: "get",
  path: "/supplier-invoices/{id}/payments",
  request: { params: idParamSchema, query: supplierPaymentListQuerySchema },
  responses: {
    200: {
      description: "A page of the supplier invoice's payments",
      content: { "application/json": { schema: listEnvelopeSchema(supplierPaymentSchema) } },
    },
  },
})

const createSupplierInvoicePaymentRoute = createRoute({
  method: "post",
  path: "/supplier-invoices/{id}/payments",
  request: {
    params: idParamSchema,
    body: {
      required: true,
      content: { "application/json": { schema: insertSupplierInvoicePaymentBodySchema } },
    },
  },
  responses: {
    201: {
      description: "The created supplier payment",
      content: {
        "application/json": { schema: z.object({ data: supplierPaymentSchema.nullable() }) },
      },
    },
    400: {
      description: "invalid_request: request body failed validation",
      content: { "application/json": { schema: errorResponseSchema } },
    },
    422: {
      description: "supplier invoice payable invariant failed",
      content: { "application/json": { schema: supplierInvoiceErrorSchema } },
    },
  },
})

const supplierPaymentRoutes = new OpenAPIHono<Env>({ defaultHook: openApiValidationHook })
  .openapi(listSupplierInvoicePaymentsRoute, async (c) =>
    c.json(
      await financeService.listSupplierPayments(c.get("db"), {
        ...c.req.valid("query"),
        supplierInvoiceId: c.req.valid("param").id,
      }),
      200,
    ),
  )
  .openapi(createSupplierInvoicePaymentRoute, async (c) => {
    try {
      const row = await financeService.createSupplierPayment(
        c.get("db"),
        { ...c.req.valid("json"), supplierInvoiceId: c.req.valid("param").id },
        {
          ...getFinanceRouteRuntime(c),
          actionLedgerContext: getActionLedgerRequestContext(c),
          actionLedgerAuthorizationSource: "finance.supplier_payment.route",
        },
      )
      return c.json({ data: row }, 201)
    } catch (error) {
      if (error instanceof SupplierInvoiceServiceError) {
        return c.json({ error: error.message, code: error.code }, 422)
      }
      throw error
    }
  })

// ===========================================================================
// Supplier-invoice attachments (metadata + signed file download)
// ===========================================================================

const attachmentParamSchema = z.object({ id: z.string(), attachmentId: z.string() })

const listSupplierInvoiceAttachmentsRoute = createRoute({
  method: "get",
  path: "/supplier-invoices/{id}/attachments",
  request: { params: idParamSchema },
  responses: {
    200: {
      description: "The supplier invoice's attachments",
      content: {
        "application/json": {
          schema: z.object({ data: z.array(supplierInvoiceAttachmentSchema) }),
        },
      },
    },
  },
})

const createSupplierInvoiceAttachmentRoute = createRoute({
  method: "post",
  path: "/supplier-invoices/{id}/attachments",
  request: {
    params: idParamSchema,
    body: {
      required: true,
      content: { "application/json": { schema: insertSupplierInvoiceAttachmentSchema } },
    },
  },
  responses: {
    201: {
      description: "The created attachment",
      content: {
        "application/json": { schema: z.object({ data: supplierInvoiceAttachmentSchema }) },
      },
    },
    400: {
      description: "invalid_request: request body failed validation",
      content: { "application/json": { schema: errorResponseSchema } },
    },
    404: {
      description: "Supplier invoice not found",
      content: { "application/json": { schema: errorResponseSchema } },
    },
  },
})

const deleteSupplierInvoiceAttachmentRoute = createRoute({
  method: "delete",
  path: "/supplier-invoices/{id}/attachments/{attachmentId}",
  request: { params: attachmentParamSchema },
  responses: {
    200: {
      description: "Attachment deleted",
      content: { "application/json": { schema: successResponseSchema } },
    },
    404: {
      description: "Attachment not found",
      content: { "application/json": { schema: errorResponseSchema } },
    },
  },
})

const downloadSupplierInvoiceAttachmentRoute = createRoute({
  method: "get",
  path: "/supplier-invoice-attachments/{id}/download",
  request: { params: idParamSchema },
  responses: {
    302: { description: "Redirect to the signed attachment download URL" },
    404: {
      description: "Attachment not found, or its file is not available",
      content: { "application/json": { schema: errorResponseSchema } },
    },
    501: {
      description: "The document download resolver is not configured",
      content: { "application/json": { schema: errorResponseSchema } },
    },
  },
})

const supplierInvoiceAttachmentRoutes = new OpenAPIHono<Env>({
  defaultHook: openApiValidationHook,
})
  .openapi(listSupplierInvoiceAttachmentsRoute, async (c) =>
    c.json(
      {
        data: await supplierInvoicesService.listAttachments(c.get("db"), c.req.valid("param").id),
      },
      200,
    ),
  )
  .openapi(createSupplierInvoiceAttachmentRoute, async (c) => {
    const row = await supplierInvoicesService.createAttachment(
      c.get("db"),
      c.req.valid("param").id,
      c.req.valid("json"),
    )
    if (!row) return c.json({ error: "Supplier invoice not found" }, 404)
    return c.json({ data: row }, 201)
  })
  .openapi(deleteSupplierInvoiceAttachmentRoute, async (c) => {
    const params = c.req.valid("param")
    const row = await supplierInvoicesService.deleteAttachment(
      c.get("db"),
      params.id,
      params.attachmentId,
    )
    if (!row) return c.json({ error: "Attachment not found" }, 404)
    return c.json({ success: true }, 200)
  })
  .openapi(downloadSupplierInvoiceAttachmentRoute, async (c) => {
    const attachment = await supplierInvoicesService.getAttachmentById(
      c.get("db"),
      c.req.valid("param").id,
    )
    if (!attachment?.storageKey) return c.json({ error: "Attachment not found" }, 404)

    const runtime = getFinanceRouteRuntime(c)
    const download = await resolveStoredDocumentDownload(
      { storageKey: attachment.storageKey },
      { bindings: c.env, resolveDocumentDownloadUrl: runtime?.resolveDocumentDownloadUrl },
    )
    if (download.status === "resolver_not_configured") {
      return c.json({ error: "Document download resolver is not configured" }, 501)
    }
    if (download.status !== "ready") {
      return c.json({ error: "Attachment file is not available" }, 404)
    }
    return c.redirect(download.download.url, 302)
  })

// Compose the per-resource sub-chains onto a single OpenAPIHono so the
// `.openapi()` operations propagate up through the parent admin registry
// (OpenAPIHono.route copies the sub-app's registered routes).
export const supplierInvoiceRoutes = new OpenAPIHono<Env>({ defaultHook: openApiValidationHook })
  .route("/", supplierInvoiceCrudRoutes)
  .route("/", supplierPaymentRoutes)
  .route("/", supplierInvoiceAttachmentRoutes)

export type SupplierInvoiceRoutes = typeof supplierInvoiceRoutes
