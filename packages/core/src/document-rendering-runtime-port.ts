import { definePort } from "./project.js"

export type PdfPageFormat =
  | "letter"
  | "legal"
  | "tabloid"
  | "ledger"
  | "a0"
  | "a1"
  | "a2"
  | "a3"
  | "a4"
  | "a5"
  | "a6"

export interface PdfRenderRequest {
  html: string
  page?: {
    format?: PdfPageFormat
    landscape?: boolean
    printBackground?: boolean
    scale?: number
    margin?: {
      top?: number | string
      bottom?: number | string
      left?: number | string
      right?: number | string
    }
    displayHeaderFooter?: boolean
    headerTemplate?: string
    footerTemplate?: string
  }
  navigation?: {
    waitUntil?: "load" | "domcontentloaded" | "networkidle0" | "networkidle2"
    timeoutMs?: number
    referer?: string
  }
  mediaType?: "screen" | "print"
  waitForTimeoutMs?: number
}

/** Cross-cutting HTML-to-document capability supplied by a deployment. */
export interface DocumentRenderer {
  readonly name: string
  /** Resolve an opaque fingerprint of the complete backend routing/auth binding. */
  resolveBackendIdentity?(): Promise<string>
  renderPdf(request: PdfRenderRequest): Promise<Uint8Array>
}

export const documentRendererPort = definePort<DocumentRenderer>({
  id: "documents.renderer",
  test(provider) {
    if (
      provider === null ||
      typeof provider !== "object" ||
      typeof provider.name !== "string" ||
      provider.name.trim().length === 0 ||
      typeof provider.renderPdf !== "function"
    ) {
      throw new Error("documents.renderer provider must define name and implement renderPdf().")
    }
  },
})
