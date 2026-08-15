import type { DocumentRenderer } from "@voyant-travel/core/document-rendering"
import type { StorageProvider } from "@voyant-travel/storage"
import { hardenRenderedHtmlDocument } from "@voyant-travel/utils/template-renderer"

import {
  checksumInvoiceDocumentBytes,
  FINANCE_INVOICE_DOCUMENT_PROVIDER_PROTOCOL,
  type FinanceInvoiceDocumentProvider,
  type FinanceInvoiceDocumentRenderDescriptor,
} from "./contracts/invoice-document-provider.js"

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
}

function lexicalDocumentText(body: string) {
  try {
    const parsed: unknown = JSON.parse(body)
    const parts: string[] = []
    const visit = (value: unknown) => {
      if (!value || typeof value !== "object") return
      const node = value as {
        type?: unknown
        text?: unknown
        children?: unknown
        root?: unknown
      }
      if (node.root) visit(node.root)
      if (node.type === "linebreak") parts.push("\n")
      if (typeof node.text === "string") parts.push(node.text)
      if (Array.isArray(node.children)) {
        for (const child of node.children) visit(child)
      }
      if (
        node.type === "paragraph" ||
        node.type === "heading" ||
        node.type === "quote" ||
        node.type === "listitem"
      ) {
        parts.push("\n")
      }
    }
    visit(parsed)
    const text = parts
      .join("")
      .replace(/\n{3,}/g, "\n\n")
      .trim()
    return text || body
  } catch {
    return body
  }
}

function descriptorHtml(descriptor: FinanceInvoiceDocumentRenderDescriptor) {
  const body =
    descriptor.bodyFormat === "html"
      ? descriptor.body
      : `<pre>${escapeHtml(
          descriptor.bodyFormat === "lexical_json"
            ? lexicalDocumentText(descriptor.body)
            : descriptor.body,
        )}</pre>`
  return hardenRenderedHtmlDocument(body)
}

export function invoiceDocumentContentType(
  format: FinanceInvoiceDocumentRenderDescriptor["format"],
) {
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

/**
 * The provider version has to move when either backend moves, because a
 * rendition carries the bytes one renderer produced from one store. Two
 * deployments pointed at different renderers must not be able to claim the same
 * provider identity for artifacts that are not interchangeable.
 */
async function providerVersion(renderer: DocumentRenderer, storage: StorageProvider) {
  if (!renderer.resolveBackendIdentity || !storage.resolveBackendIdentity) {
    throw new Error(
      "The standard invoice document provider requires stable renderer and storage backend identities.",
    )
  }
  const [rendererIdentity, storageIdentity] = await Promise.all([
    renderer.resolveBackendIdentity(),
    storage.resolveBackendIdentity(),
  ])
  const fingerprint = await checksumInvoiceDocumentBytes(
    new TextEncoder().encode(
      JSON.stringify({ renderer: rendererIdentity, storage: storageIdentity }),
    ),
  )
  return `1:${fingerprint}`
}

/** Adapt the deployment's selected renderer and document store into the provider. */
export async function createStandardInvoiceDocumentProvider(input: {
  renderer: DocumentRenderer
  storage: StorageProvider
}): Promise<FinanceInvoiceDocumentProvider> {
  const { renderer, storage } = input
  const version = await providerVersion(renderer, storage)

  async function bytesAt(key: string) {
    const value = await storage.get(key)
    return value ? new Uint8Array(value) : null
  }

  return {
    identity: {
      id: "voyant.standard.invoice-document",
      version,
      protocol: FINANCE_INVOICE_DOCUMENT_PROVIDER_PROTOCOL,
    },
    async render(descriptor) {
      const contentType = invoiceDocumentContentType(descriptor.format)
      const bytes =
        descriptor.format === "pdf"
          ? await renderer.renderPdf({
              html: descriptorHtml(descriptor),
              page: { format: "a4", printBackground: true },
              navigation: { waitUntil: "networkidle0", timeoutMs: 30_000 },
              mediaType: "print",
            })
          : new TextEncoder().encode(
              descriptor.format === "json"
                ? JSON.stringify(descriptor.variables, null, 2)
                : descriptor.body,
            )

      return {
        bytes,
        checksumSha256: await checksumInvoiceDocumentBytes(bytes),
        name: `invoice-${descriptor.invoiceNumber || descriptor.invoiceId}.${descriptor.format}`,
        contentType,
        metadata: {
          renderer: renderer.name,
          renderedBodyFormat: descriptor.bodyFormat,
          ...(descriptor.language ? { language: descriptor.language } : {}),
        },
      }
    },
    async put({ renditionId, operationKey, artifact }) {
      const uploaded = await storage.upload(artifact.bytes, {
        key: operationKey,
        contentType: artifact.contentType,
        metadata: {
          renditionId,
          checksumSha256: artifact.checksumSha256,
        },
      })
      if (uploaded.key !== operationKey) {
        throw new Error("Invoice document storage did not honor the exact operation key.")
      }
      return {
        key: uploaded.key,
        checksumSha256: artifact.checksumSha256,
        byteLength: artifact.bytes.byteLength,
      }
    },
    async inspect(key) {
      const bytes = await bytesAt(key)
      return bytes
        ? {
            status: "present",
            key,
            checksumSha256: await checksumInvoiceDocumentBytes(bytes),
            byteLength: bytes.byteLength,
          }
        : { status: "absent" }
    },
    get: bytesAt,
    deleteIfPresent: (key) => storage.delete(key),
  }
}
