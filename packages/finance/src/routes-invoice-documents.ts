/**
 * Admin invoice-document routes — mounted by the operator starter under
 * `/v1/admin/finance/...`. Covers invoice renditions (list + render), invoice
 * attachments (list/create/update/delete + signed download redirect), and
 * invoice external refs (list/register/supersede/delete).
 *
 * Migrated to `@hono/zod-openapi` for the OpenAPI admin backfill (voyant#2114 /
 * voyant#2208 — finance sub-batch 9B). Request schemas reuse the existing
 * `@voyant-travel/finance-contracts` schemas the handlers already parse;
 * response schemas come from the shared `routes-invoice-schemas.ts` row shapes
 * (authored from the Drizzle `$inferSelect` shapes; §17 dates → strings). Each
 * resource is its own small `OpenAPIHono` sub-chain composed onto
 * `financeInvoiceDocumentRoutes` via `.route("/")` so the `.openapi()`
 * operations propagate up through the parent `financeRoutes` registry while
 * keeping type-inference cost bounded.
 */

import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi"
import { openApiValidationHook } from "@voyant-travel/hono"
import { fulfilInvoiceRendition } from "./invoice-document-fulfilment.js"
import {
  errorResponseSchema,
  invoiceAttachmentSchema,
  invoiceExternalRefSchema,
  invoiceRenditionSchema,
  successResponseSchema,
} from "./routes-invoice-schemas.js"
import {
  buildInlineDownload,
  getFinanceRouteRuntime,
  resolveWaitRequest,
} from "./routes-runtime.js"
import type { Env } from "./routes-shared.js"
import { financeService } from "./service.js"
import { waitForInvoiceRendition, waitFormatForMode } from "./service-rendition-wait.js"
import {
  insertInvoiceAttachmentSchema,
  insertInvoiceExternalRefSchema,
  invoiceDocumentWaitQuerySchema,
  renderInvoiceInputSchema,
  supersedeInvoiceExternalRefSchema,
  updateInvoiceAttachmentSchema,
} from "./validation.js"

const idParamSchema = z.object({ id: z.string() })
const attachmentParamSchema = z.object({ id: z.string(), attachmentId: z.string() })
const refParamSchema = z.object({ id: z.string(), refId: z.string() })

/**
 * The signed-download response from `buildInlineDownload` — present on the 201
 * render response when a wait resolved to a ready rendition with a resolvable
 * file. `expiresAt` is an ISO string over the wire (§17); other fields are
 * resolver-dependent and modeled opaquely.
 */
const downloadSchema = z.object({
  url: z.string(),
  expiresAt: z.string().nullable(),
  filename: z.string().nullable(),
})

// --- renditions ------------------------------------------------------------

const listRenditionsRoute = createRoute({
  method: "get",
  path: "/invoices/{id}/renditions",
  request: { params: idParamSchema },
  responses: {
    200: {
      description: "The invoice's renditions",
      content: {
        "application/json": { schema: z.object({ data: z.array(invoiceRenditionSchema) }) },
      },
    },
  },
})

const renderInvoiceRoute = createRoute({
  method: "post",
  path: "/invoices/{id}/render",
  request: {
    params: idParamSchema,
    query: invoiceDocumentWaitQuerySchema,
    body: {
      required: true,
      description:
        "Rendition request (`format`, `templateId`, etc.). `wait` (query or body) makes the request block for a ready rendition up to `waitTimeoutMs`; when set, a still-pending rendition returns 202.",
      content: { "application/json": { schema: renderInvoiceInputSchema } },
    },
  },
  responses: {
    201: {
      description:
        "The rendition (with a signed `download` when a wait resolved to a ready, downloadable file)",
      content: {
        "application/json": {
          schema: z.object({
            data: z.union([
              invoiceRenditionSchema.nullable(),
              z.object({
                rendition: invoiceRenditionSchema,
                download: downloadSchema.optional(),
              }),
            ]),
          }),
        },
      },
    },
    202: {
      description: "The wait timed out before the rendition was ready",
      content: {
        "application/json": {
          schema: z.object({ data: z.object({ rendition: invoiceRenditionSchema }) }),
        },
      },
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

const renditionRoutes = new OpenAPIHono<Env>({ defaultHook: openApiValidationHook })
  .openapi(listRenditionsRoute, async (c) =>
    c.json(
      { data: await financeService.listInvoiceRenditions(c.get("db"), c.req.valid("param").id) },
      200,
    ),
  )
  .openapi(renderInvoiceRoute, async (c) => {
    const invoiceId = c.req.valid("param").id
    const input = c.req.valid("json")
    const waitRequest = resolveWaitRequest(input, c.req.valid("query"))
    const result = await financeService.renderInvoice(c.get("db"), invoiceId, input)
    if (result.status === "not_found") {
      return c.json({ error: "Invoice not found" }, 404)
    }

    // Fulfil inline only for a caller that asked to wait. `docs/architecture/
    // invoice-rendition-wait.md` makes the wait additive — "omitted or `wait:
    // "none"` preserves the historical response shape" — and rendering can hold
    // the request for the renderer's full 30s navigation timeout, so doing it
    // unconditionally would turn every fire-and-forget request into a blocking
    // one. Without a wait the row is still durable and the subscriber and the
    // recovery job produce the document; that is what they are for.
    const runtime = getFinanceRouteRuntime(c)
    let rendition = result.rendition
    if (rendition && waitRequest.mode !== "none") {
      await fulfilInvoiceRendition(c.get("db"), rendition.id, {
        ...(runtime?.invoiceDocumentProvider ? { provider: runtime.invoiceDocumentProvider } : {}),
        ...(runtime?.eventBus ? { eventBus: runtime.eventBus } : {}),
        ...(runtime?.resolveCustomFields
          ? { resolveCustomFields: runtime.resolveCustomFields }
          : {}),
      })
      // Report what the row *is*, not what it was a moment ago.
      rendition =
        (await financeService.getInvoiceRenditionById(c.get("db"), rendition.id)) ?? rendition
    }

    if (waitRequest.mode !== "none" && rendition) {
      const waitResult = await waitForInvoiceRendition(c.get("db"), invoiceId, {
        renditionId: rendition.id,
        format: waitFormatForMode(waitRequest.mode),
        timeoutMs: waitRequest.timeoutMs,
      })
      const payload = { rendition: waitResult.rendition ?? rendition }
      if (waitResult.status !== "ready") {
        return c.json({ data: payload }, 202)
      }
      const download = await buildInlineDownload(c, waitResult.rendition)
      if (download.status !== "ready") {
        return c.json({ data: payload }, 202)
      }
      return c.json({ data: { ...payload, download: download.download } }, 201)
    }
    return c.json({ data: rendition }, 201)
  })

// --- attachments -----------------------------------------------------------

const listAttachmentsRoute = createRoute({
  method: "get",
  path: "/invoices/{id}/attachments",
  request: { params: idParamSchema },
  responses: {
    200: {
      description: "The invoice's attachments",
      content: {
        "application/json": { schema: z.object({ data: z.array(invoiceAttachmentSchema) }) },
      },
    },
  },
})

const createAttachmentRoute = createRoute({
  method: "post",
  path: "/invoices/{id}/attachments",
  request: {
    params: idParamSchema,
    body: {
      required: true,
      content: { "application/json": { schema: insertInvoiceAttachmentSchema } },
    },
  },
  responses: {
    201: {
      description: "The created attachment",
      content: { "application/json": { schema: z.object({ data: invoiceAttachmentSchema }) } },
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

const updateAttachmentRoute = createRoute({
  method: "patch",
  path: "/invoices/{id}/attachments/{attachmentId}",
  request: {
    params: attachmentParamSchema,
    body: {
      required: true,
      content: { "application/json": { schema: updateInvoiceAttachmentSchema } },
    },
  },
  responses: {
    200: {
      description: "The updated attachment",
      content: { "application/json": { schema: z.object({ data: invoiceAttachmentSchema }) } },
    },
    400: {
      description: "invalid_request: request body failed validation",
      content: { "application/json": { schema: errorResponseSchema } },
    },
    404: {
      description: "Attachment not found",
      content: { "application/json": { schema: errorResponseSchema } },
    },
  },
})

const deleteAttachmentRoute = createRoute({
  method: "delete",
  path: "/invoices/{id}/attachments/{attachmentId}",
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

const downloadAttachmentRoute = createRoute({
  method: "get",
  path: "/invoice-attachments/{id}/download",
  request: { params: idParamSchema },
  responses: {
    302: { description: "Redirect to the signed inline download URL" },
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

const attachmentRoutes = new OpenAPIHono<Env>({ defaultHook: openApiValidationHook })
  .openapi(listAttachmentsRoute, async (c) =>
    c.json(
      { data: await financeService.listInvoiceAttachments(c.get("db"), c.req.valid("param").id) },
      200,
    ),
  )
  .openapi(createAttachmentRoute, async (c) => {
    const row = await financeService.createInvoiceAttachment(
      c.get("db"),
      c.req.valid("param").id,
      c.req.valid("json"),
    )
    return row ? c.json({ data: row }, 201) : c.json({ error: "Invoice not found" }, 404)
  })
  .openapi(updateAttachmentRoute, async (c) => {
    const params = c.req.valid("param")
    const row = await financeService.updateInvoiceAttachment(
      c.get("db"),
      params.id,
      params.attachmentId,
      c.req.valid("json"),
    )
    return row ? c.json({ data: row }, 200) : c.json({ error: "Attachment not found" }, 404)
  })
  .openapi(deleteAttachmentRoute, async (c) => {
    const params = c.req.valid("param")
    const row = await financeService.deleteInvoiceAttachment(
      c.get("db"),
      params.id,
      params.attachmentId,
    )
    return row ? c.json({ success: true }, 200) : c.json({ error: "Attachment not found" }, 404)
  })
  .openapi(downloadAttachmentRoute, async (c) => {
    const attachment = await financeService.getInvoiceAttachmentById(
      c.get("db"),
      c.req.valid("param").id,
    )
    if (!attachment) {
      return c.json({ error: "Attachment not found" }, 404)
    }
    const download = await buildInlineDownload(c, attachment)
    if (download.status === "resolver_not_configured") {
      return c.json({ error: "Document download resolver is not configured" }, 501)
    }
    if (download.status !== "ready") {
      return c.json({ error: "Attachment file is not available" }, 404)
    }
    return c.redirect(download.download.url, 302)
  })

// --- external refs ---------------------------------------------------------

const listExternalRefsRoute = createRoute({
  method: "get",
  path: "/invoices/{id}/external-refs",
  request: { params: idParamSchema },
  responses: {
    200: {
      description: "The invoice's external refs",
      content: {
        "application/json": { schema: z.object({ data: z.array(invoiceExternalRefSchema) }) },
      },
    },
  },
})

const registerExternalRefRoute = createRoute({
  method: "post",
  path: "/invoices/{id}/external-refs",
  request: {
    params: idParamSchema,
    body: {
      required: true,
      content: { "application/json": { schema: insertInvoiceExternalRefSchema } },
    },
  },
  responses: {
    201: {
      description: "The registered external ref",
      content: { "application/json": { schema: z.object({ data: invoiceExternalRefSchema }) } },
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

const supersedeExternalRefRoute = createRoute({
  method: "post",
  path: "/invoices/{id}/external-refs/{refId}/supersede",
  description:
    "Record that the provider document this reference points at was cancelled " +
    "in the provider's own UI, and optionally repoint the reference at its " +
    "replacement. The superseded identity is kept in the reference's metadata; " +
    "with no replacement the reference is marked `cancelled`, which is what " +
    "lets the booking be invoiced again (voyant#4688).",
  request: {
    params: refParamSchema,
    body: {
      required: true,
      content: { "application/json": { schema: supersedeInvoiceExternalRefSchema } },
    },
  },
  responses: {
    200: {
      description: "The superseded external ref",
      content: { "application/json": { schema: z.object({ data: invoiceExternalRefSchema }) } },
    },
    400: {
      description: "invalid_request: request body failed validation",
      content: { "application/json": { schema: errorResponseSchema } },
    },
    404: {
      description: "External ref not found",
      content: { "application/json": { schema: errorResponseSchema } },
    },
  },
})

const deleteExternalRefRoute = createRoute({
  method: "delete",
  path: "/invoices/{id}/external-refs/{refId}",
  request: { params: refParamSchema },
  responses: {
    200: {
      description: "External ref deleted",
      content: { "application/json": { schema: successResponseSchema } },
    },
    404: {
      description: "External ref not found",
      content: { "application/json": { schema: errorResponseSchema } },
    },
  },
})

const externalRefRoutes = new OpenAPIHono<Env>({ defaultHook: openApiValidationHook })
  .openapi(listExternalRefsRoute, async (c) =>
    c.json(
      { data: await financeService.listInvoiceExternalRefs(c.get("db"), c.req.valid("param").id) },
      200,
    ),
  )
  .openapi(registerExternalRefRoute, async (c) => {
    const row = await financeService.registerInvoiceExternalRef(
      c.get("db"),
      c.req.valid("param").id,
      c.req.valid("json"),
    )
    return row ? c.json({ data: row }, 201) : c.json({ error: "Invoice not found" }, 404)
  })
  .openapi(supersedeExternalRefRoute, async (c) => {
    const { id, refId } = c.req.valid("param")
    const row = await financeService.supersedeInvoiceExternalRef(
      c.get("db"),
      refId,
      c.req.valid("json"),
      { invoiceId: id },
    )
    return row ? c.json({ data: row }, 200) : c.json({ error: "External ref not found" }, 404)
  })
  .openapi(deleteExternalRefRoute, async (c) => {
    const row = await financeService.deleteInvoiceExternalRef(
      c.get("db"),
      c.req.valid("param").refId,
    )
    return row ? c.json({ success: true }, 200) : c.json({ error: "External ref not found" }, 404)
  })

// Compose the per-resource sub-chains onto a single OpenAPIHono so the
// `.openapi()` operations propagate up through the parent `financeRoutes`
// registry (OpenAPIHono.route copies the sub-app's registered routes).
export const financeInvoiceDocumentRoutes = new OpenAPIHono<Env>({
  defaultHook: openApiValidationHook,
})
  .route("/", renditionRoutes)
  .route("/", attachmentRoutes)
  .route("/", externalRefRoutes)
