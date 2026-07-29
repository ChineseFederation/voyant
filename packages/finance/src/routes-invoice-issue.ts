/**
 * Admin invoice issue/lifecycle routes — mounted by the operator starter under
 * `/v1/admin/finance/...`. Covers the invoice list + create endpoints plus the
 * two issuance actions (issue-from-booking, convert-proforma-to-invoice).
 *
 * Migrated to `@hono/zod-openapi` for the OpenAPI admin backfill (voyant#2114 /
 * voyant#2208 — finance sub-batch 9B). Request schemas reuse the existing
 * `@voyant-travel/finance-contracts` schemas the handlers already parse;
 * response schemas come from the shared `routes-invoice-schemas.ts` row shapes
 * (authored from the Drizzle `$inferSelect` shapes; §17 dates → strings). The
 * single resource (`invoices`) is its own `OpenAPIHono` sub-chain composed onto
 * `financeInvoiceIssueRoutes` via `.route("/")` so the `.openapi()` operations
 * propagate up through the parent `financeRoutes` registry while keeping
 * type-inference cost bounded.
 */

import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi"
import { openApiValidationHook, parseJsonBody } from "@voyant-travel/hono"
import { listResponseSchema } from "@voyant-travel/types"
import type { MiddlewareHandler } from "hono"
import {
  errorResponseSchema,
  invoiceListItemSchema,
  invoiceSchema,
} from "./routes-invoice-schemas.js"
import {
  getActionLedgerRequestContext,
  getFinanceRouteRuntime,
  routeIdempotencyKey,
} from "./routes-runtime.js"
import type { Env } from "./routes-shared.js"
import {
  financeService,
  InvoiceFromBookingValidationError,
  InvoiceNumberAllocationError,
  InvoiceNumberConflictError,
  InvoiceValidationError,
} from "./service.js"
import {
  insertInvoiceSchema,
  invoiceFromBookingSchema,
  invoiceListQuerySchema,
} from "./validation.js"

const idParamSchema = z.object({ id: z.string() })

const listInvoicesRoute = createRoute({
  method: "get",
  path: "/invoices",
  request: { query: invoiceListQuerySchema },
  responses: {
    200: {
      description: "Paginated list of invoices (each row carries its linked payment-schedule ids)",
      content: { "application/json": { schema: listResponseSchema(invoiceListItemSchema) } },
    },
  },
})

const createInvoiceRoute = createRoute({
  method: "post",
  path: "/invoices",
  request: {
    body: {
      required: true,
      content: { "application/json": { schema: insertInvoiceSchema } },
    },
  },
  responses: {
    201: {
      description: "The created invoice",
      content: { "application/json": { schema: z.object({ data: invoiceSchema.nullable() }) } },
    },
    400: {
      description: "invalid_request: request body failed validation",
      content: { "application/json": { schema: errorResponseSchema } },
    },
    404: {
      description: "Booking, person, or organization reference not found",
      content: { "application/json": { schema: errorResponseSchema } },
    },
    409: {
      description: "Invoice number already exists",
      content: { "application/json": { schema: errorResponseSchema } },
    },
  },
})

const issueInvoiceFromBookingRoute = createRoute({
  method: "post",
  path: "/invoices/from-booking",
  request: {
    body: {
      required: true,
      description:
        "Create + issue an invoice or proforma from a booking (and optionally a payment schedule). `invoiceType` selects invoice vs proforma; `bookingPaymentScheduleId`, when present, must belong to the booking.",
      content: { "application/json": { schema: invoiceFromBookingSchema } },
    },
  },
  responses: {
    201: {
      description: "The issued invoice/proforma",
      content: { "application/json": { schema: z.object({ data: invoiceSchema.nullable() }) } },
    },
    400: {
      description: "invalid_request: request body failed validation",
      content: { "application/json": { schema: errorResponseSchema } },
    },
    404: {
      description: "Booking or booking payment schedule not found",
      content: { "application/json": { schema: errorResponseSchema } },
    },
    409: {
      description:
        "Invoice number allocation failed, the invoice number already exists, or the booking failed issuance validation",
      content: { "application/json": { schema: errorResponseSchema } },
    },
  },
})

const convertProformaToInvoiceRoute = createRoute({
  method: "post",
  path: "/invoices/{id}/convert-to-invoice",
  description:
    "Convert a proforma to a final invoice. Accepts optional overrides " +
    "(`invoiceNumber`, `issueDate`, `dueDate`) as a JSON body; an empty or " +
    "absent body is accepted. The body is parsed in the handler (not as a " +
    "declared OpenAPI request body) because Hono's JSON validator would reject a " +
    "zero-length `application/json` request before the handler runs.",
  request: {
    params: idParamSchema,
  },
  responses: {
    201: {
      description: "The converted final invoice",
      content: { "application/json": { schema: z.object({ data: invoiceSchema }) } },
    },
    404: {
      description: "Invoice not found",
      content: { "application/json": { schema: errorResponseSchema } },
    },
    409: {
      description:
        "The invoice is not a proforma, has already been converted, or a duplicate fiscal invoice already exists",
      content: { "application/json": { schema: errorResponseSchema } },
    },
  },
})

export const financeInvoiceIssueRoutes = new OpenAPIHono<Env>({
  defaultHook: openApiValidationHook,
})

// Idempotency-key middleware for the two POST endpoints. Registered ahead of
// the `.openapi()` route handlers so it wraps them; it no-ops for requests
// without an `Idempotency-Key` header (so the GET list route is unaffected).
// Kept as statements (not in the fluent chain) because `.use()` narrows the
// return type away from `OpenAPIHono`, which would strip the `.openapi()`
// method from the rest of the chain.
// `.use(path, ...)` matches every method on `path`, so guard to POST — the
// create endpoints — otherwise an `Idempotency-Key` on `GET /invoices` would be
// read/stored under the POST create scope (cached-create replay / key conflict).
const postOnly =
  (mw: MiddlewareHandler): MiddlewareHandler =>
  (c, next) =>
    c.req.method === "POST" ? mw(c, next) : next()

financeInvoiceIssueRoutes.use(
  "/invoices",
  postOnly(routeIdempotencyKey("POST /v1/admin/finance/invoices")),
)
financeInvoiceIssueRoutes.use(
  "/invoices/from-booking",
  postOnly(
    routeIdempotencyKey("POST /v1/admin/finance/invoices/from-booking", {
      fingerprintSearchParams: ["wait", "waitTimeoutMs"],
    }),
  ),
)

financeInvoiceIssueRoutes
  .openapi(listInvoicesRoute, async (c) =>
    c.json(await financeService.listInvoices(c.get("db"), c.req.valid("query")), 200),
  )
  .openapi(createInvoiceRoute, async (c) => {
    try {
      return c.json(
        { data: (await financeService.createInvoice(c.get("db"), c.req.valid("json"))) ?? null },
        201,
      )
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
  .openapi(issueInvoiceFromBookingRoute, async (c) => {
    const input = c.req.valid("json")
    const db = c.get("db")
    const runtime = getFinanceRouteRuntime(c)
    const { issueInvoiceFromBookingCommand } = await import("./service-issue.js")
    let outcome: Awaited<ReturnType<typeof issueInvoiceFromBookingCommand>>
    try {
      outcome = await issueInvoiceFromBookingCommand(db, input, {
        ...(runtime ?? {}),
        actionLedgerContext: getActionLedgerRequestContext(c),
        actionLedgerAuthorizationSource: "finance.invoice.from_booking.route",
      })
    } catch (error) {
      if (error instanceof InvoiceNumberAllocationError) {
        return c.json(
          { error: error.code, scope: error.scope, seriesId: error.seriesId ?? null },
          409,
        )
      }
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
      if (error instanceof InvoiceFromBookingValidationError) {
        return c.json(
          { error: error.message, code: error.code, details: error.details },
          error.status,
        )
      }
      throw error
    }
    if (outcome.status === "booking_not_found") {
      return c.json({ error: "Booking not found" }, 404)
    }
    if (outcome.status === "payment_schedule_not_found") {
      return c.json({ error: "Booking payment schedule not found" }, 404)
    }
    if (outcome.status === "booking_changed" || outcome.status === "approval_snapshot_changed") {
      return c.json({ error: "Booking changed after review" }, 409)
    }
    return c.json({ data: outcome.invoice }, 201)
  })
  .openapi(convertProformaToInvoiceRoute, async (c) => {
    const { convertProformaToInvoice } = await import("./service-issue.js")
    const input = await parseJsonBody(
      c,
      z.object({
        invoiceNumber: z.string().optional(),
        issueDate: z.string().optional(),
        dueDate: z.string().optional(),
      }),
    ).catch(() => ({}))

    const runtime = getFinanceRouteRuntime(c)

    let result: Awaited<ReturnType<typeof convertProformaToInvoice>>
    try {
      result = await convertProformaToInvoice(c.get("db"), c.req.valid("param").id, input, {
        eventBus: runtime?.eventBus,
      })
    } catch (error) {
      if (error instanceof InvoiceNumberConflictError) {
        return c.json({ error: "Invoice number already exists" }, 409)
      }
      throw error
    }

    if (result.status === "not_found") {
      return c.json({ error: "Invoice not found" }, 404)
    }
    if (result.status === "not_proforma") {
      return c.json({ error: "Only proforma invoices can be converted" }, 409)
    }
    if (result.status === "already_converted") {
      return c.json({ error: "This proforma has already been converted" }, 409)
    }
    if (result.status === "duplicate_fiscal_invoice") {
      return c.json({ error: "A fiscal invoice already exists for this booking amount" }, 409)
    }

    return c.json({ data: result.invoice }, 201)
  })
