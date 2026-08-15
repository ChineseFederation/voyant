import type { EventBus } from "@voyant-travel/core"
import type { StorageProvider, StorageUploadBody } from "@voyant-travel/storage"
import { renderPdfDocument } from "@voyant-travel/utils/pdf-renderer"
import { and, desc, eq } from "drizzle-orm"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"

import {
  type FinanceInvoiceDocumentProvider,
  invoiceDocumentOperationKey,
} from "./contracts/invoice-document-provider.js"
import {
  type invoiceLineItems,
  type invoiceRenditions,
  type invoices,
  invoiceTemplates,
  type payments,
} from "./schema.js"
import { financeService, renderInvoiceBody } from "./service.js"
import type { GenerateInvoiceDocumentInput } from "./validation.js"

export interface GeneratedInvoiceRenditionArtifact {
  format?: "html" | "pdf" | "xml" | "json"
  storageKey?: string | null
  contentType?: string | null
  fileSize?: number | null
  checksum?: string | null
  language?: string | null
  metadata?: Record<string, unknown> | null
}

export interface InvoiceDocumentGeneratorContext {
  db: PostgresJsDatabase
  invoice: typeof invoices.$inferSelect
  template: typeof invoiceTemplates.$inferSelect | null
  lineItems: Array<typeof invoiceLineItems.$inferSelect>
  payments: Array<typeof payments.$inferSelect>
  renderedBody: string
  renderedBodyFormat: "html" | "markdown" | "lexical_json"
  variables: Record<string, unknown>
  bindings: Record<string, unknown>
  targetFormat: "html" | "pdf" | "xml" | "json"
  language: string | null
}

export type InvoiceDocumentGenerator = (
  context: InvoiceDocumentGeneratorContext,
) => Promise<GeneratedInvoiceRenditionArtifact>

export interface InvoiceDocumentRuntimeOptions {
  bindings?: Record<string, unknown>
  generator: InvoiceDocumentGenerator
  eventBus?: EventBus
  /**
   * Resolve invoice-visible custom fields for this invoice's customer, exposed
   * to the template as `customFields`. Selected graph runtimes receive this
   * from the database-backed `custom-fields.runtime` port; optionality remains
   * only for direct low-level service callers.
   */
  resolveCustomFields?: (
    db: PostgresJsDatabase,
    invoice: typeof invoices.$inferSelect,
  ) => Promise<Record<string, unknown>> | Record<string, unknown>
}

export interface StorageBackedInvoiceDocumentUpload {
  body: StorageUploadBody
  format?: "html" | "pdf" | "xml" | "json"
  key?: string | null
  metadata?: Record<string, unknown> | null
  language?: string | null
}

export type StorageBackedInvoiceDocumentSerializer = (
  context: InvoiceDocumentGeneratorContext,
) => Promise<StorageBackedInvoiceDocumentUpload> | StorageBackedInvoiceDocumentUpload

export interface StorageBackedInvoiceDocumentGeneratorOptions {
  storage: StorageProvider
  keyPrefix?: string | ((context: InvoiceDocumentGeneratorContext) => Promise<string> | string)
  serializer?: StorageBackedInvoiceDocumentSerializer
}

export interface GeneratedInvoiceDocumentRecord {
  invoiceId: string
  renderedBodyFormat: "html" | "markdown" | "lexical_json"
  renderedBody: string
  rendition: typeof invoiceRenditions.$inferSelect
}

export interface InvoiceDocumentGeneratedEvent {
  invoiceId: string
  invoiceStatus: (typeof invoices.$inferSelect)["status"]
  invoiceType: (typeof invoices.$inferSelect)["invoiceType"]
  renditionId: string
  format: (typeof invoiceRenditions.$inferSelect)["format"]
  renderedBodyFormat: "html" | "markdown" | "lexical_json"
  regenerated: boolean
}

export type PreparedInvoiceDocument =
  | { status: "not_found" }
  | {
      status: "ready"
      invoice: typeof invoices.$inferSelect
      template: typeof invoiceTemplates.$inferSelect | null
      lineItems: Array<typeof invoiceLineItems.$inferSelect>
      payments: Array<typeof payments.$inferSelect>
      renderedBody: string
      renderedBodyFormat: "html" | "markdown" | "lexical_json"
      variables: Record<string, unknown>
      targetFormat: "html" | "pdf" | "xml" | "json"
      language: string | null
    }

function defaultInvoiceDocumentMimeType(format: InvoiceDocumentGeneratorContext["targetFormat"]) {
  switch (format) {
    case "html":
      return "text/html; charset=utf-8"
    case "json":
      return "application/json; charset=utf-8"
    case "xml":
      return "application/xml; charset=utf-8"
    default:
      return "application/pdf"
  }
}

function encodeStringBody(value: string): Uint8Array {
  return new TextEncoder().encode(value)
}

function getBodySize(body: StorageUploadBody) {
  if (body instanceof Uint8Array) return body.byteLength
  if (body instanceof ArrayBuffer) return body.byteLength
  return body.size
}

function toUploadMetadata(metadata: Record<string, unknown> | null | undefined) {
  const entries = Object.entries(metadata ?? {}).filter(([, value]) =>
    ["string", "number", "boolean"].includes(typeof value),
  )

  return entries.length > 0
    ? Object.fromEntries(entries.map(([key, value]) => [key, String(value)]))
    : undefined
}

export function defaultStorageBackedInvoiceDocumentSerializer(
  context: InvoiceDocumentGeneratorContext,
): Promise<StorageBackedInvoiceDocumentUpload> | StorageBackedInvoiceDocumentUpload {
  switch (context.targetFormat) {
    case "html":
      return {
        body: encodeStringBody(context.renderedBody),
        format: "html",
        language: context.language,
        metadata: { renderedBodyFormat: context.renderedBodyFormat },
      }
    case "json":
      return {
        body: encodeStringBody(JSON.stringify(context.variables, null, 2)),
        format: "json",
        language: context.language,
        metadata: { renderedBodyFormat: context.renderedBodyFormat },
      }
    case "xml":
      return {
        body: encodeStringBody(context.renderedBody),
        format: "xml",
        language: context.language,
        metadata: { renderedBodyFormat: context.renderedBodyFormat },
      }
    default:
      return defaultPdfInvoiceDocumentSerializer(context)
  }
}

export async function defaultPdfInvoiceDocumentSerializer(
  context: InvoiceDocumentGeneratorContext,
): Promise<StorageBackedInvoiceDocumentUpload> {
  const body = await renderPdfDocument({
    title: `Invoice ${context.invoice.id}`,
    content: context.renderedBody,
    format:
      context.renderedBodyFormat === "lexical_json"
        ? "lexical_json"
        : context.renderedBodyFormat === "html"
          ? "html"
          : "markdown",
    metadataLines: [
      `Invoice ID: ${context.invoice.id}`,
      ...(context.language ? [`Language: ${context.language}`] : []),
    ],
  })

  return {
    body,
    format: "pdf",
    language: context.language,
    metadata: {
      renderedBodyFormat: context.renderedBodyFormat,
      renderer: "voyant-basic-pdf",
    },
  }
}

export function createStorageBackedInvoiceDocumentGenerator(
  options: StorageBackedInvoiceDocumentGeneratorOptions,
): InvoiceDocumentGenerator {
  const serializer = options.serializer ?? defaultStorageBackedInvoiceDocumentSerializer

  return async (context) => {
    const upload = await serializer(context)
    const format = upload.format ?? context.targetFormat
    const keyPrefix =
      typeof options.keyPrefix === "function"
        ? await options.keyPrefix(context)
        : (options.keyPrefix ?? `invoices/${context.invoice.id}`)
    const key = upload.key?.trim() || `${keyPrefix.replace(/\/$/, "")}/rendition.${format}`
    const uploaded = await options.storage.upload(upload.body, {
      key,
      contentType: defaultInvoiceDocumentMimeType(format),
      metadata: toUploadMetadata(upload.metadata),
    })

    return {
      format,
      storageKey: uploaded.key,
      contentType: defaultInvoiceDocumentMimeType(format),
      fileSize: getBodySize(upload.body),
      language: upload.language ?? context.language,
      metadata: {
        ...(upload.metadata ?? {}),
        storageProvider: options.storage.name,
        ...(uploaded.url ? { url: uploaded.url } : {}),
      },
    }
  }
}

export function createPdfInvoiceDocumentGenerator(
  options: Omit<StorageBackedInvoiceDocumentGeneratorOptions, "serializer">,
): InvoiceDocumentGenerator {
  return createStorageBackedInvoiceDocumentGenerator({
    ...options,
    serializer: defaultPdfInvoiceDocumentSerializer,
  })
}

/**
 * Serve the on-demand generate/regenerate routes from the graph-selected
 * provider, so a deployment configures a renderer once and both paths — the
 * requested rendition the engine drains and the document an operator asks for
 * from the invoice screen — go through the same conformance-tested seam.
 *
 * The key is derived from the invoice rather than a rendition id: this path
 * inserts its rendition through `bindInvoiceRendition` *after* the artifact
 * exists, so there is no row to key on yet.
 */
/**
 * The one definition of "which custom fields does this invoice's template see".
 *
 * Shared by every path that renders a document, because `prepareInvoiceDocument`
 * only populates `variables.customFields` when a resolver is supplied: when the
 * HTTP route had one and the subscriber and recovery job did not, the same
 * template rendered with the customer's fields interactively and without them
 * in the background.
 */
export function createInvoiceCustomFieldsResolver(customFields: {
  resolveVisibleValues(
    db: PostgresJsDatabase,
    subjectType: string,
    subjectId: string,
    surface: string,
  ): Promise<Record<string, unknown>> | Record<string, unknown>
}): NonNullable<InvoiceDocumentRuntimeOptions["resolveCustomFields"]> {
  return async (db, invoice) => {
    if (invoice.organizationId) {
      return customFields.resolveVisibleValues(
        db,
        "organization",
        invoice.organizationId,
        "invoice",
      )
    }
    if (invoice.personId) {
      return customFields.resolveVisibleValues(db, "person", invoice.personId, "invoice")
    }
    return {}
  }
}

export function createProviderBackedInvoiceDocumentGenerator(
  provider: FinanceInvoiceDocumentProvider,
): InvoiceDocumentGenerator {
  return async (context) => {
    const operationId = crypto.randomUUID()
    const artifact = await provider.render({
      renditionId: operationId,
      invoiceId: context.invoice.id,
      invoiceNumber: context.invoice.invoiceNumber ?? "",
      templateId: context.template?.id ?? null,
      body: context.renderedBody,
      bodyFormat: context.renderedBodyFormat,
      format: context.targetFormat,
      language: context.language,
      variables: context.variables,
    })
    const reference = await provider.put({
      renditionId: operationId,
      operationKey: invoiceDocumentOperationKey({
        invoiceId: context.invoice.id,
        renditionId: operationId,
        format: context.targetFormat,
      }),
      artifact,
    })

    return {
      format: context.targetFormat,
      storageKey: reference.key,
      contentType: artifact.contentType,
      fileSize: reference.byteLength,
      checksum: reference.checksumSha256,
      language: context.language,
      metadata: {
        ...(artifact.metadata ?? {}),
        provider: provider.identity.id,
        providerVersion: provider.identity.version,
      },
    }
  }
}

/**
 * Resolve everything a renderer needs and nothing it may decide: the template,
 * the line items, the payments, the custom fields, and the body rendered from
 * them. Shared by the generator path and by the fulfilment engine that drains
 * requested renditions, so both produce a document from the same inputs.
 *
 * Takes the narrow shape rather than `GenerateInvoiceDocumentInput` because the
 * engine's input is a persisted `invoice_renditions` row, not a request body.
 */
export async function prepareInvoiceDocument(
  db: PostgresJsDatabase,
  invoiceId: string,
  input: {
    format: GenerateInvoiceDocumentInput["format"]
    templateId?: string | null
    language?: string | null
  },
  resolveCustomFields?: InvoiceDocumentRuntimeOptions["resolveCustomFields"],
): Promise<PreparedInvoiceDocument> {
  const invoice = await financeService.getInvoiceById(db, invoiceId)
  if (!invoice) {
    return { status: "not_found" }
  }

  let templateId = input.templateId ?? invoice.templateId ?? null
  if (!templateId) {
    const [defaultTemplate] = await db
      .select()
      .from(invoiceTemplates)
      .where(and(eq(invoiceTemplates.isDefault, true), eq(invoiceTemplates.active, true)))
      .orderBy(desc(invoiceTemplates.updatedAt))
      .limit(1)

    templateId = defaultTemplate?.id ?? null
  }

  const [template, lineItems, paymentRows] = await Promise.all([
    templateId ? financeService.getInvoiceTemplateById(db, templateId) : Promise.resolve(null),
    financeService.listInvoiceLineItems(db, invoiceId),
    financeService.listPayments(db, invoiceId),
  ])

  const renderedBodyFormat = template?.bodyFormat ?? "html"
  const variables: Record<string, unknown> = {
    invoice,
    lineItems,
    payments: paymentRows,
  }
  if (resolveCustomFields) {
    // Invoice-visible custom fields for the customer, available to templates as
    // `{{customFields.<key>}}` (unified custom-fields system).
    variables.customFields = await resolveCustomFields(db, invoice)
  }
  const renderedBody = template
    ? renderInvoiceBody(template.body, template.bodyFormat, variables)
    : JSON.stringify(variables)

  return {
    status: "ready",
    invoice,
    template,
    lineItems,
    payments: paymentRows,
    renderedBody,
    renderedBodyFormat,
    variables,
    targetFormat: input.format,
    language: input.language ?? invoice.language ?? template?.language ?? null,
  }
}

export const financeDocumentsService = {
  async generateInvoiceDocument(
    db: PostgresJsDatabase,
    invoiceId: string,
    input: GenerateInvoiceDocumentInput,
    runtime: InvoiceDocumentRuntimeOptions,
    options: { regenerated?: boolean } = {},
  ): Promise<
    | { status: "not_found" | "generator_failed" }
    | ({ status: "generated" } & GeneratedInvoiceDocumentRecord)
  > {
    const prepared = await prepareInvoiceDocument(db, invoiceId, input, runtime.resolveCustomFields)
    if (prepared.status === "not_found") {
      return { status: "not_found" }
    }

    let artifact: GeneratedInvoiceRenditionArtifact
    try {
      artifact = await runtime.generator({
        db,
        invoice: prepared.invoice,
        template: prepared.template,
        lineItems: prepared.lineItems,
        payments: prepared.payments,
        renderedBody: prepared.renderedBody,
        renderedBodyFormat: prepared.renderedBodyFormat,
        variables: prepared.variables,
        bindings: runtime.bindings ?? {},
        targetFormat: prepared.targetFormat,
        language: prepared.language,
      })
    } catch {
      return { status: "generator_failed" }
    }

    const format = artifact.format ?? prepared.targetFormat
    const bindResult = await financeService.bindInvoiceRendition(
      db,
      invoiceId,
      {
        templateId: prepared.template?.id ?? null,
        format,
        storageKey: artifact.storageKey?.trim() || null,
        contentType: artifact.contentType ?? defaultInvoiceDocumentMimeType(format),
        fileSize: artifact.fileSize ?? null,
        checksum: artifact.checksum ?? null,
        language: artifact.language ?? prepared.language ?? null,
        generatedAt: new Date().toISOString(),
        metadata: {
          ...(artifact.metadata ?? {}),
          renderedBodyFormat: prepared.renderedBodyFormat,
        },
        replaceExisting: input.replaceExisting,
      },
      { eventBus: runtime.eventBus },
    )

    if (bindResult.status !== "bound") {
      return { status: "not_found" }
    }
    const { rendition } = bindResult

    await runtime.eventBus?.emit(
      "invoice.document.generated",
      {
        invoiceId: prepared.invoice.id,
        invoiceStatus: prepared.invoice.status,
        invoiceType: prepared.invoice.invoiceType,
        renditionId: rendition.id,
        format: rendition.format,
        renderedBodyFormat: prepared.renderedBodyFormat,
        regenerated: options.regenerated ?? false,
      } satisfies InvoiceDocumentGeneratedEvent,
      {
        category: "internal",
        source: "service",
      },
    )

    return {
      status: "generated",
      invoiceId: prepared.invoice.id,
      renderedBodyFormat: prepared.renderedBodyFormat,
      renderedBody: prepared.renderedBody,
      rendition,
    }
  },

  async regenerateInvoiceDocument(
    db: PostgresJsDatabase,
    invoiceId: string,
    input: GenerateInvoiceDocumentInput,
    runtime: InvoiceDocumentRuntimeOptions,
  ) {
    return this.generateInvoiceDocument(db, invoiceId, input, runtime, { regenerated: true })
  },
}
