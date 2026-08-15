/**
 * Admin invoice CRUD + nested-resource routes — mounted by the operator starter
 * under `/v1/admin/finance/...`. Covers the single-invoice read/update/delete,
 * the void + payment-session actions, and the nested line-items, payments,
 * credit-notes, credit-note line-items, and finance-notes collections.
 *
 * Migrated to `@hono/zod-openapi` for the OpenAPI admin backfill (voyant#2114 /
 * voyant#2208 — finance sub-batch 9B). Request schemas reuse the existing
 * `@voyant-travel/finance-contracts` schemas the handlers already parse;
 * response schemas come from the shared `routes-invoice-schemas.ts` row shapes
 * (authored from the Drizzle `$inferSelect` shapes; §17 dates → strings). Each
 * nested resource is its own small `OpenAPIHono` sub-chain composed onto
 * `financeInvoiceCoreRoutes` via `.route("/")` so the `.openapi()` operations
 * propagate up through the parent `financeRoutes` registry while keeping
 * type-inference cost bounded (one flat chain has O(n²) inference cost).
 *
 * agent-quality: file-size exception — intentional: a mechanically-repetitive
 * CRUD bundle over six nested invoice resources (16 legs), each with a
 * `createRoute` def + handler co-located per the established admin route
 * pattern (mirrors the sibling `routes-reference-data.ts`). Splitting per
 * resource would fragment the single mounted instance without aiding review.
 * See voyant#2114 / voyant#2208.
 */

import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi"
import { ActionLedgerIdempotencyConflictError } from "@voyant-travel/action-ledger"
import { openApiValidationHook, parseOptionalJsonBody, requireUserId } from "@voyant-travel/hono"
import {
  creditNoteLineItemSchema,
  creditNoteSchema,
  errorResponseSchema,
  financeNoteSchema,
  invoiceDetailSchema,
  invoiceLineItemSchema,
  invoiceSchema,
  paymentSchema,
  paymentSessionSchema,
  successResponseSchema,
} from "./routes-invoice-schemas.js"
import { getActionLedgerRequestContext, getFinanceRouteRuntime } from "./routes-runtime.js"
import type { Env } from "./routes-shared.js"
import {
  financeService,
  InvoiceNumberConflictError,
  InvoiceValidationError,
  PaymentValidationError,
} from "./service.js"
import {
  createPaymentSessionFromInvoiceSchema,
  insertCreditNoteLineItemSchema,
  insertCreditNoteSchema,
  insertFinanceNoteSchema,
  insertInvoiceLineItemSchema,
  insertPaymentSchema,
  updateCreditNoteSchema,
  updateInvoiceLineItemSchema,
  updateInvoiceSchema,
  voidInvoiceSchema,
} from "./validation.js"

const idParamSchema = z.object({ id: z.string() })
const lineParamSchema = z.object({ id: z.string(), lineId: z.string() })
const creditNoteParamSchema = z.object({ id: z.string(), creditNoteId: z.string() })

// --- invoice read / update / delete / actions -----------------------------

const getInvoiceRoute = createRoute({
  method: "get",
  path: "/invoices/{id}",
  request: { params: idParamSchema },
  responses: {
    200: {
      description: "An invoice by id (with the proforma→final-invoice link, if any)",
      content: { "application/json": { schema: z.object({ data: invoiceDetailSchema }) } },
    },
    404: {
      description: "Invoice not found",
      content: { "application/json": { schema: errorResponseSchema } },
    },
  },
})

const updateInvoiceRoute = createRoute({
  method: "patch",
  path: "/invoices/{id}",
  request: {
    params: idParamSchema,
    body: {
      required: true,
      content: { "application/json": { schema: updateInvoiceSchema } },
    },
  },
  responses: {
    200: {
      description: "The updated invoice",
      content: { "application/json": { schema: z.object({ data: invoiceSchema }) } },
    },
    400: {
      description: "invalid_request: request body failed validation",
      content: { "application/json": { schema: errorResponseSchema } },
    },
    404: {
      description: "Invoice not found",
      content: { "application/json": { schema: errorResponseSchema } },
    },
    409: {
      description: "Invoice number already exists",
      content: { "application/json": { schema: errorResponseSchema } },
    },
  },
})

const deleteInvoiceRoute = createRoute({
  method: "delete",
  path: "/invoices/{id}",
  request: { params: idParamSchema },
  responses: {
    200: {
      description: "Invoice deleted",
      content: { "application/json": { schema: successResponseSchema } },
    },
    400: {
      description: "Only draft invoices can be deleted",
      content: { "application/json": { schema: errorResponseSchema } },
    },
    404: {
      description: "Invoice not found",
      content: { "application/json": { schema: errorResponseSchema } },
    },
  },
})

const voidInvoiceRoute = createRoute({
  method: "post",
  path: "/invoices/{id}/void",
  description:
    "Void an invoice. Accepts an optional `voidReason` JSON body; an empty or " +
    "absent body is accepted. The body is parsed in the handler (not as a " +
    "declared OpenAPI request body) because Hono's JSON validator would reject a " +
    "zero-length `application/json` request before the handler runs.",
  request: {
    params: idParamSchema,
  },
  responses: {
    200: {
      description: "The voided invoice",
      content: { "application/json": { schema: z.object({ data: invoiceSchema }) } },
    },
    400: {
      description: "invalid_request, or the invoice is a draft (delete it instead)",
      content: { "application/json": { schema: errorResponseSchema } },
    },
    404: {
      description: "Invoice not found",
      content: { "application/json": { schema: errorResponseSchema } },
    },
    409: {
      description:
        "Invoice cannot be voided: already void, invalid status, or it has payments / credit notes",
      content: { "application/json": { schema: errorResponseSchema } },
    },
  },
})

const createPaymentSessionRoute = createRoute({
  method: "post",
  path: "/invoices/{id}/payment-session",
  request: {
    params: idParamSchema,
    body: {
      required: true,
      content: { "application/json": { schema: createPaymentSessionFromInvoiceSchema } },
    },
  },
  responses: {
    201: {
      description: "The created payment session for the invoice balance",
      content: { "application/json": { schema: z.object({ data: paymentSessionSchema }) } },
    },
    400: {
      description: "invalid_request: request body failed validation",
      content: { "application/json": { schema: errorResponseSchema } },
    },
    404: {
      description: "Invoice not found",
      content: { "application/json": { schema: errorResponseSchema } },
    },
    409: {
      description: "The invoice is paid/void or has no outstanding balance",
      content: { "application/json": { schema: errorResponseSchema } },
    },
  },
})

const invoiceActionRoutes = new OpenAPIHono<Env>({ defaultHook: openApiValidationHook })
  .openapi(getInvoiceRoute, async (c) => {
    const row = await financeService.getInvoiceById(c.get("db"), c.req.valid("param").id)
    return row ? c.json({ data: row }, 200) : c.json({ error: "Invoice not found" }, 404)
  })
  .openapi(updateInvoiceRoute, async (c) => {
    try {
      const runtime = getFinanceRouteRuntime(c)
      const row = await financeService.updateInvoice(
        c.get("db"),
        c.req.valid("param").id,
        c.req.valid("json"),
        {
          eventBus: runtime?.eventBus,
          actionLedgerContext: getActionLedgerRequestContext(c),
          actionLedgerAuthorizationSource: "finance.invoice.route",
        },
      )
      return row ? c.json({ data: row }, 200) : c.json({ error: "Invoice not found" }, 404)
    } catch (error) {
      if (error instanceof InvoiceNumberConflictError) {
        return c.json(
          {
            error: "Invoice number already exists",
            code: error.code,
            invoiceNumber: error.invoiceNumber,
          },
          409,
        )
      }
      if (error instanceof InvoiceValidationError) {
        return c.json(
          { error: error.message, code: error.code, details: error.details },
          error.status,
        )
      }
      throw error
    }
  })
  .openapi(deleteInvoiceRoute, async (c) => {
    const runtime = getFinanceRouteRuntime(c)
    const result = await financeService.deleteInvoice(c.get("db"), c.req.valid("param").id, {
      eventBus: runtime?.eventBus,
      actionLedgerContext: getActionLedgerRequestContext(c),
      actionLedgerAuthorizationSource: "finance.invoice.route",
    })
    if (result.status === "not_found") {
      return c.json({ error: "Invoice not found" }, 404)
    }
    if (result.status === "not_draft") {
      return c.json({ error: "Only draft invoices can be deleted" }, 400)
    }
    return c.json({ success: true }, 200)
  })
  .openapi(voidInvoiceRoute, async (c) => {
    const runtime = getFinanceRouteRuntime(c)
    const result = await financeService.voidInvoice(
      c.get("db"),
      c.req.valid("param").id,
      (await parseOptionalJsonBody(c, voidInvoiceSchema)) ?? {},
      {
        eventBus: runtime?.eventBus,
        actionLedgerContext: getActionLedgerRequestContext(c),
        actionLedgerAuthorizationSource: "finance.invoice.route",
      },
    )
    if (result.status === "not_found") {
      return c.json({ error: "Invoice not found" }, 404)
    }
    if (result.status === "already_void") {
      return c.json({ error: "Invoice is already void" }, 409)
    }
    if (result.status === "draft") {
      return c.json({ error: "Draft invoices can be deleted instead" }, 400)
    }
    if (result.status === "invalid_status") {
      return c.json({ error: "Invoice cannot be voided from its current status" }, 409)
    }
    if (result.status === "has_payments") {
      return c.json({ error: "Invoices with payments cannot be voided" }, 409)
    }
    if (result.status === "has_credit_notes") {
      return c.json({ error: "Invoices with credit notes cannot be voided" }, 409)
    }
    return c.json({ data: result.invoice }, 200)
  })
  .openapi(createPaymentSessionRoute, async (c) => {
    try {
      const runtime = getFinanceRouteRuntime(c)
      const row = await financeService.createPaymentSessionFromInvoice(
        c.get("db"),
        c.req.valid("param").id,
        c.req.valid("json"),
        {
          eventBus: runtime?.eventBus,
          actionLedgerContext: getActionLedgerRequestContext(c),
          actionLedgerAuthorizationSource: "finance.payment_session.route",
        },
      )
      if (!row) {
        return c.json({ error: "Invoice not found" }, 404)
      }
      return c.json({ data: row }, 201)
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to create payment session"
      return c.json({ error: message }, 409)
    }
  })

// --- invoice line items ----------------------------------------------------

const listInvoiceLineItemsRoute = createRoute({
  method: "get",
  path: "/invoices/{id}/line-items",
  request: { params: idParamSchema },
  responses: {
    200: {
      description: "The invoice's line items",
      content: {
        "application/json": { schema: z.object({ data: z.array(invoiceLineItemSchema) }) },
      },
    },
  },
})

const createInvoiceLineItemRoute = createRoute({
  method: "post",
  path: "/invoices/{id}/line-items",
  request: {
    params: idParamSchema,
    body: {
      required: true,
      content: { "application/json": { schema: insertInvoiceLineItemSchema } },
    },
  },
  responses: {
    201: {
      description: "The created line item",
      content: { "application/json": { schema: z.object({ data: invoiceLineItemSchema }) } },
    },
    400: {
      description: "invalid_request: request body failed validation",
      content: { "application/json": { schema: errorResponseSchema } },
    },
    404: {
      description: "Invoice not found",
      content: { "application/json": { schema: errorResponseSchema } },
    },
  },
})

const updateInvoiceLineItemRoute = createRoute({
  method: "patch",
  path: "/invoices/{id}/line-items/{lineId}",
  request: {
    params: lineParamSchema,
    body: {
      required: true,
      content: { "application/json": { schema: updateInvoiceLineItemSchema } },
    },
  },
  responses: {
    200: {
      description: "The updated line item",
      content: { "application/json": { schema: z.object({ data: invoiceLineItemSchema }) } },
    },
    400: {
      description: "invalid_request: request body failed validation",
      content: { "application/json": { schema: errorResponseSchema } },
    },
    404: {
      description: "Line item not found",
      content: { "application/json": { schema: errorResponseSchema } },
    },
  },
})

const deleteInvoiceLineItemRoute = createRoute({
  method: "delete",
  path: "/invoices/{id}/line-items/{lineId}",
  request: { params: lineParamSchema },
  responses: {
    200: {
      description: "Line item deleted",
      content: { "application/json": { schema: successResponseSchema } },
    },
    404: {
      description: "Line item not found",
      content: { "application/json": { schema: errorResponseSchema } },
    },
  },
})

const invoiceLineItemRoutes = new OpenAPIHono<Env>({ defaultHook: openApiValidationHook })
  .openapi(listInvoiceLineItemsRoute, async (c) =>
    c.json(
      { data: await financeService.listInvoiceLineItems(c.get("db"), c.req.valid("param").id) },
      200,
    ),
  )
  .openapi(createInvoiceLineItemRoute, async (c) => {
    try {
      const runtime = getFinanceRouteRuntime(c)
      const row = await financeService.createInvoiceLineItem(
        c.get("db"),
        c.req.valid("param").id,
        c.req.valid("json"),
        {
          eventBus: runtime?.eventBus,
          actionLedgerContext: getActionLedgerRequestContext(c),
          actionLedgerAuthorizationSource: "finance.invoice_line_item.route",
        },
      )
      return row ? c.json({ data: row }, 201) : c.json({ error: "Invoice not found" }, 404)
    } catch (error) {
      if (error instanceof InvoiceValidationError) {
        if (error.status === 404) {
          return c.json({ error: error.message, code: error.code, details: error.details }, 404)
        }
        if (error.status === 409) throw error
        return c.json({ error: error.message, code: error.code, details: error.details }, 400)
      }
      throw error
    }
  })
  .openapi(updateInvoiceLineItemRoute, async (c) => {
    try {
      const runtime = getFinanceRouteRuntime(c)
      const row = await financeService.updateInvoiceLineItem(
        c.get("db"),
        c.req.valid("param").lineId,
        c.req.valid("json"),
        {
          eventBus: runtime?.eventBus,
          actionLedgerContext: getActionLedgerRequestContext(c),
          actionLedgerAuthorizationSource: "finance.invoice_line_item.route",
        },
      )
      return row ? c.json({ data: row }, 200) : c.json({ error: "Line item not found" }, 404)
    } catch (error) {
      if (error instanceof InvoiceValidationError) {
        if (error.status === 404) {
          return c.json({ error: error.message, code: error.code, details: error.details }, 404)
        }
        if (error.status === 409) throw error
        return c.json({ error: error.message, code: error.code, details: error.details }, 400)
      }
      throw error
    }
  })
  .openapi(deleteInvoiceLineItemRoute, async (c) => {
    const runtime = getFinanceRouteRuntime(c)
    const row = await financeService.deleteInvoiceLineItem(
      c.get("db"),
      c.req.valid("param").lineId,
      {
        eventBus: runtime?.eventBus,
        actionLedgerContext: getActionLedgerRequestContext(c),
        actionLedgerAuthorizationSource: "finance.invoice_line_item.route",
      },
    )
    return row ? c.json({ success: true }, 200) : c.json({ error: "Line item not found" }, 404)
  })

// --- payments --------------------------------------------------------------

const listPaymentsRoute = createRoute({
  method: "get",
  path: "/invoices/{id}/payments",
  request: { params: idParamSchema },
  responses: {
    200: {
      description: "The invoice's payments",
      content: { "application/json": { schema: z.object({ data: z.array(paymentSchema) }) } },
    },
  },
})

const createPaymentRoute = createRoute({
  method: "post",
  path: "/invoices/{id}/payments",
  request: {
    params: idParamSchema,
    body: {
      required: true,
      content: { "application/json": { schema: insertPaymentSchema } },
    },
  },
  responses: {
    201: {
      description: "The recorded payment",
      content: { "application/json": { schema: z.object({ data: paymentSchema }) } },
    },
    400: {
      description: "invalid_request, or the payment failed business-rule validation",
      content: { "application/json": { schema: errorResponseSchema } },
    },
    404: {
      description: "Invoice not found",
      content: { "application/json": { schema: errorResponseSchema } },
    },
    409: {
      description: "The payment conflicts with the invoice state (e.g. overpayment)",
      content: { "application/json": { schema: errorResponseSchema } },
    },
  },
})

const paymentRoutes = new OpenAPIHono<Env>({ defaultHook: openApiValidationHook })
  .openapi(listPaymentsRoute, async (c) =>
    c.json({ data: await financeService.listPayments(c.get("db"), c.req.valid("param").id) }, 200),
  )
  .openapi(createPaymentRoute, async (c) => {
    try {
      const runtime = getFinanceRouteRuntime(c)
      const row = await financeService.createPayment(
        c.get("db"),
        c.req.valid("param").id,
        c.req.valid("json"),
        {
          ...(runtime ?? {}),
          actionLedgerContext: getActionLedgerRequestContext(c),
          actionLedgerAuthorizationSource: "finance.payment.route",
        },
      )
      if (!row) {
        return c.json({ error: "Invoice not found" }, 404)
      }
      return c.json({ data: row }, 201)
    } catch (error) {
      if (error instanceof PaymentValidationError) {
        return c.json(
          { error: error.message, code: error.code, details: error.details },
          error.status,
        )
      }
      // Reusing an idempotency key with a different payload is a conflict, and
      // the HTTP idempotency middleware already answers 409 for exactly this.
      // Left unhandled the ledger's own version of it reached the boundary as
      // an unrecognized error and became a 500 — an infrastructure fault for
      // what is a client mistake.
      if (error instanceof ActionLedgerIdempotencyConflictError) {
        return c.json(
          {
            error: error.message,
            code: "idempotency_key_reused",
            existingActionId: error.existingActionId,
          },
          409,
        )
      }
      throw error
    }
  })

// --- credit notes ----------------------------------------------------------

const listCreditNotesRoute = createRoute({
  method: "get",
  path: "/invoices/{id}/credit-notes",
  request: { params: idParamSchema },
  responses: {
    200: {
      description: "The invoice's credit notes",
      content: { "application/json": { schema: z.object({ data: z.array(creditNoteSchema) }) } },
    },
  },
})

const createCreditNoteRoute = createRoute({
  method: "post",
  path: "/invoices/{id}/credit-notes",
  request: {
    params: idParamSchema,
    body: {
      required: true,
      content: { "application/json": { schema: insertCreditNoteSchema } },
    },
  },
  responses: {
    201: {
      description: "The created credit note",
      content: { "application/json": { schema: z.object({ data: creditNoteSchema }) } },
    },
    400: {
      description: "invalid_request: request body failed validation",
      content: { "application/json": { schema: errorResponseSchema } },
    },
    404: {
      description: "Invoice not found",
      content: { "application/json": { schema: errorResponseSchema } },
    },
    409: {
      description: "Credit note would exceed the invoice balance due",
      content: { "application/json": { schema: errorResponseSchema } },
    },
  },
})

const updateCreditNoteRoute = createRoute({
  method: "patch",
  path: "/invoices/{id}/credit-notes/{creditNoteId}",
  request: {
    params: creditNoteParamSchema,
    body: {
      required: true,
      content: { "application/json": { schema: updateCreditNoteSchema } },
    },
  },
  responses: {
    200: {
      description: "The updated credit note",
      content: { "application/json": { schema: z.object({ data: creditNoteSchema }) } },
    },
    400: {
      description: "invalid_request: request body failed validation",
      content: { "application/json": { schema: errorResponseSchema } },
    },
    404: {
      description: "Credit note not found",
      content: { "application/json": { schema: errorResponseSchema } },
    },
    409: {
      description: "Credit note would exceed the invoice balance due",
      content: { "application/json": { schema: errorResponseSchema } },
    },
  },
})

const creditNoteRoutes = new OpenAPIHono<Env>({ defaultHook: openApiValidationHook })
  .openapi(listCreditNotesRoute, async (c) =>
    c.json(
      { data: await financeService.listCreditNotes(c.get("db"), c.req.valid("param").id) },
      200,
    ),
  )
  .openapi(createCreditNoteRoute, async (c) => {
    try {
      const runtime = getFinanceRouteRuntime(c)
      const row = await financeService.createCreditNote(
        c.get("db"),
        c.req.valid("param").id,
        c.req.valid("json"),
        {
          ...(runtime ?? {}),
          actionLedgerContext: getActionLedgerRequestContext(c),
          actionLedgerAuthorizationSource: "finance.credit_note.route",
        },
      )
      return row ? c.json({ data: row }, 201) : c.json({ error: "Invoice not found" }, 404)
    } catch (error) {
      if (error instanceof InvoiceValidationError) {
        if (error.status === 404) {
          return c.json({ error: error.message, code: error.code, details: error.details }, 404)
        }
        if (error.status === 409) {
          return c.json({ error: error.message, code: error.code, details: error.details }, 409)
        }
        return c.json({ error: error.message, code: error.code, details: error.details }, 400)
      }
      throw error
    }
  })
  .openapi(updateCreditNoteRoute, async (c) => {
    try {
      const runtime = getFinanceRouteRuntime(c)
      const row = await financeService.updateCreditNote(
        c.get("db"),
        c.req.valid("param").creditNoteId,
        c.req.valid("json"),
        {
          ...(runtime ?? {}),
          actionLedgerContext: getActionLedgerRequestContext(c),
          actionLedgerAuthorizationSource: "finance.credit_note.route",
        },
      )
      return row ? c.json({ data: row }, 200) : c.json({ error: "Credit note not found" }, 404)
    } catch (error) {
      if (error instanceof InvoiceValidationError) {
        if (error.status === 404) {
          return c.json({ error: error.message, code: error.code, details: error.details }, 404)
        }
        if (error.status === 409) {
          return c.json({ error: error.message, code: error.code, details: error.details }, 409)
        }
        return c.json({ error: error.message, code: error.code, details: error.details }, 400)
      }
      throw error
    }
  })

// --- credit note line items ------------------------------------------------

const listCreditNoteLineItemsRoute = createRoute({
  method: "get",
  path: "/invoices/{id}/credit-notes/{creditNoteId}/line-items",
  request: { params: creditNoteParamSchema },
  responses: {
    200: {
      description: "The credit note's line items",
      content: {
        "application/json": { schema: z.object({ data: z.array(creditNoteLineItemSchema) }) },
      },
    },
  },
})

const createCreditNoteLineItemRoute = createRoute({
  method: "post",
  path: "/invoices/{id}/credit-notes/{creditNoteId}/line-items",
  request: {
    params: creditNoteParamSchema,
    body: {
      required: true,
      content: { "application/json": { schema: insertCreditNoteLineItemSchema } },
    },
  },
  responses: {
    201: {
      description: "The created credit note line item",
      content: { "application/json": { schema: z.object({ data: creditNoteLineItemSchema }) } },
    },
    400: {
      description: "invalid_request: request body failed validation",
      content: { "application/json": { schema: errorResponseSchema } },
    },
    404: {
      description: "Credit note not found",
      content: { "application/json": { schema: errorResponseSchema } },
    },
  },
})

const creditNoteLineItemRoutes = new OpenAPIHono<Env>({ defaultHook: openApiValidationHook })
  .openapi(listCreditNoteLineItemsRoute, async (c) =>
    c.json(
      {
        data: await financeService.listCreditNoteLineItems(
          c.get("db"),
          c.req.valid("param").creditNoteId,
        ),
      },
      200,
    ),
  )
  .openapi(createCreditNoteLineItemRoute, async (c) => {
    try {
      const runtime = getFinanceRouteRuntime(c)
      const row = await financeService.createCreditNoteLineItem(
        c.get("db"),
        c.req.valid("param").creditNoteId,
        c.req.valid("json"),
        {
          eventBus: runtime?.eventBus,
          actionLedgerContext: getActionLedgerRequestContext(c),
          actionLedgerAuthorizationSource: "finance.credit_note_line_item.route",
        },
      )
      return row ? c.json({ data: row }, 201) : c.json({ error: "Credit note not found" }, 404)
    } catch (error) {
      if (error instanceof InvoiceValidationError) {
        if (error.status === 404) {
          return c.json({ error: error.message, code: error.code, details: error.details }, 404)
        }
        if (error.status === 409) throw error
        return c.json({ error: error.message, code: error.code, details: error.details }, 400)
      }
      throw error
    }
  })

// --- finance notes ---------------------------------------------------------

const listNotesRoute = createRoute({
  method: "get",
  path: "/invoices/{id}/notes",
  request: { params: idParamSchema },
  responses: {
    200: {
      description: "The invoice's finance notes",
      content: { "application/json": { schema: z.object({ data: z.array(financeNoteSchema) }) } },
    },
  },
})

const createNoteRoute = createRoute({
  method: "post",
  path: "/invoices/{id}/notes",
  request: {
    params: idParamSchema,
    body: {
      required: true,
      content: { "application/json": { schema: insertFinanceNoteSchema } },
    },
  },
  responses: {
    201: {
      description: "The created finance note",
      content: { "application/json": { schema: z.object({ data: financeNoteSchema }) } },
    },
    400: {
      description: "invalid_request: request body failed validation",
      content: { "application/json": { schema: errorResponseSchema } },
    },
    404: {
      description: "Invoice not found",
      content: { "application/json": { schema: errorResponseSchema } },
    },
  },
})

const noteRoutes = new OpenAPIHono<Env>({ defaultHook: openApiValidationHook })
  .openapi(listNotesRoute, async (c) =>
    c.json({ data: await financeService.listNotes(c.get("db"), c.req.valid("param").id) }, 200),
  )
  .openapi(createNoteRoute, async (c) => {
    const userId = requireUserId(c)
    const row = await financeService.createNote(
      c.get("db"),
      c.req.valid("param").id,
      userId,
      c.req.valid("json"),
    )
    return row ? c.json({ data: row }, 201) : c.json({ error: "Invoice not found" }, 404)
  })

// Compose the per-resource sub-chains onto a single OpenAPIHono so the
// `.openapi()` operations propagate up through the parent `financeRoutes`
// registry (OpenAPIHono.route copies the sub-app's registered routes).
export const financeInvoiceCoreRoutes = new OpenAPIHono<Env>({
  defaultHook: openApiValidationHook,
})
  .route("/", invoiceActionRoutes)
  .route("/", invoiceLineItemRoutes)
  .route("/", paymentRoutes)
  .route("/", creditNoteRoutes)
  .route("/", creditNoteLineItemRoutes)
  .route("/", noteRoutes)
