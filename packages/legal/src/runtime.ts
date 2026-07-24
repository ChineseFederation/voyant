import type { VoyantRuntimeHostPrimitives } from "@voyant-travel/core"
import type { StorageProvider } from "@voyant-travel/storage"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"
import type { ContractDocumentRoutesOptions } from "./contract-document-routes.js"
import { contractsService } from "./contracts/service.js"
import type { CreateLegalApiModuleOptions } from "./index.js"

export interface LegalRuntime {
  legal: CreateLegalApiModuleOptions
  contractDocument: ContractDocumentRoutesOptions
}

/** Build all Legal providers for the standard Node product. */
export function createLegalRuntime(primitives: VoyantRuntimeHostPrimitives): LegalRuntime {
  return {
    legal: {
      resolveDocumentDownloadUrl: primitives.storage.downloadUrl,
      resolveDocumentStorage: (bindings) => resolveStorage(primitives, bindings),
    },
    contractDocument: createContractDocumentRoutesOptions(primitives),
  }
}

function createContractDocumentRoutesOptions(
  primitives: VoyantRuntimeHostPrimitives,
): ContractDocumentRoutesOptions {
  return {
    resolveGeneratedDocument: async (bindings, db, attachmentId) => {
      const attachment = await contractsService.getAttachmentById(
        db as PostgresJsDatabase,
        attachmentId,
      )
      if (!attachment?.storageKey) return null
      const url = await primitives.storage.downloadUrl(bindings, attachment.storageKey)
      if (!url) return null
      return {
        url,
        filename: attachment.name,
        contentType: attachment.mimeType,
      }
    },
    resolveStorage: (bindings) => resolveStorage(primitives, bindings),
    guessMimeType,
  }
}

function resolveStorage(
  primitives: VoyantRuntimeHostPrimitives,
  bindings: unknown,
): StorageProvider | null {
  return (
    (primitives.storage.resolve(bindings, "documents") as StorageProvider | null | undefined) ??
    null
  )
}

const MIME_BY_EXT: Readonly<Record<string, string>> = {
  pdf: "application/pdf",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
  txt: "text/plain",
  csv: "text/csv",
  json: "application/json",
  xml: "application/xml",
  zip: "application/zip",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
}

function guessMimeType(key: string): string {
  const extension = key.split(".").pop()?.toLowerCase() ?? ""
  return MIME_BY_EXT[extension] ?? "application/octet-stream"
}
