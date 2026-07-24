import type { DocumentRenderer } from "@voyant-travel/core/document-rendering"
import type { StorageProvider } from "@voyant-travel/storage"
import { hardenRenderedHtmlDocument } from "@voyant-travel/utils/template-renderer"
import { sql } from "drizzle-orm"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"
import {
  checksumLegalDocumentBytes,
  LEGAL_DOCUMENT_ARTIFACT_PROVIDER_PROTOCOL,
  LegalDocumentArtifactMismatchError,
  type LegalDocumentArtifactProvider,
  type LegalDocumentRenderDescriptor,
} from "./contracts/document-artifact-provider.js"

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
}

function descriptorHtml(descriptor: LegalDocumentRenderDescriptor) {
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

async function providerVersion(renderer: DocumentRenderer, storage: StorageProvider) {
  if (!renderer.resolveBackendIdentity || !storage.resolveBackendIdentity) {
    throw new Error(
      "The standard Legal document provider requires stable renderer and storage backend identities.",
    )
  }
  const [rendererIdentity, storageIdentity] = await Promise.all([
    renderer.resolveBackendIdentity(),
    storage.resolveBackendIdentity(),
  ])
  const fingerprint = await checksumLegalDocumentBytes(
    new TextEncoder().encode(
      JSON.stringify({
        renderer: rendererIdentity,
        storage: storageIdentity,
      }),
    ),
  )
  return `1:${fingerprint}`
}

/** Adapt the selected renderer, exact-key storage, and database lock into the durable provider. */
export async function createStandardLegalDocumentArtifactProvider(input: {
  renderer: DocumentRenderer
  storage: StorageProvider
  db: PostgresJsDatabase
}): Promise<LegalDocumentArtifactProvider> {
  const { renderer, storage, db } = input
  const version = await providerVersion(renderer, storage)

  async function bytesAt(key: string) {
    const value = await storage.get(key)
    return value ? new Uint8Array(value) : null
  }

  return {
    identity: {
      id: "voyant.standard.legal-document",
      version,
      protocol: LEGAL_DOCUMENT_ARTIFACT_PROVIDER_PROTOCOL,
    },
    async render(descriptor) {
      const bytes = await renderer.renderPdf({
        html: descriptorHtml(descriptor),
        page: { format: "a4", printBackground: true },
        navigation: { waitUntil: "networkidle0", timeoutMs: 30_000 },
        mediaType: "print",
      })
      return {
        bytes,
        checksumSha256: await checksumLegalDocumentBytes(bytes),
        name: `contract-${descriptor.contractId}.pdf`,
        contentType: "application/pdf",
        metadata: {
          renderer: renderer.name,
          renderedBodyFormat: descriptor.bodyFormat,
        },
      }
    },
    async put(operation) {
      return db.transaction(async (tx) => {
        await tx.execute(
          sql`select pg_advisory_xact_lock(hashtext(${`legal-document:${operation.operationKey}`}))`,
        )
        const existing = await bytesAt(operation.operationKey)
        if (existing) {
          const checksumSha256 = await checksumLegalDocumentBytes(existing)
          if (checksumSha256 !== operation.artifact.checksumSha256) {
            throw new LegalDocumentArtifactMismatchError(operation.operationKey)
          }
          return {
            key: operation.operationKey,
            checksumSha256,
            byteLength: existing.byteLength,
          }
        }
        const uploaded = await storage.upload(operation.artifact.bytes, {
          key: operation.operationKey,
          contentType: operation.artifact.contentType,
          metadata: {
            operationId: operation.operationId,
            requestFingerprint: operation.requestFingerprint,
            checksumSha256: operation.artifact.checksumSha256,
          },
        })
        if (uploaded.key !== operation.operationKey) {
          throw new Error("Legal document storage did not honor the exact operation key.")
        }
        return {
          key: uploaded.key,
          checksumSha256: operation.artifact.checksumSha256,
          byteLength: operation.artifact.bytes.byteLength,
        }
      })
    },
    async inspect(key) {
      const bytes = await bytesAt(key)
      return bytes
        ? {
            status: "present",
            key,
            checksumSha256: await checksumLegalDocumentBytes(bytes),
            byteLength: bytes.byteLength,
          }
        : { status: "absent" }
    },
    get: bytesAt,
    deleteIfPresent: (key) => storage.delete(key),
  }
}
