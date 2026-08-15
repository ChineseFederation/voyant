import { definePort } from "@voyant-travel/core/project"

export const FINANCE_INVOICE_DOCUMENT_PROVIDER_PROTOCOL = "finance-invoice-document.v1" as const

export interface FinanceInvoiceDocumentRenderDescriptor {
  /** The rendition row being fulfilled. It is also the operation key (see `put`). */
  readonly renditionId: string
  readonly invoiceId: string
  readonly invoiceNumber: string
  readonly templateId: string | null
  readonly body: string
  readonly bodyFormat: "html" | "markdown" | "lexical_json"
  readonly format: "html" | "pdf" | "xml" | "json"
  readonly language: string | null
  readonly variables: Readonly<Record<string, unknown>>
}

export interface FinanceInvoiceDocumentArtifact {
  readonly bytes: Uint8Array
  readonly checksumSha256: string
  readonly name: string
  readonly contentType: string
  readonly metadata?: Readonly<Record<string, string>>
}

export interface FinanceInvoiceDocumentReference {
  readonly key: string
  readonly checksumSha256: string
  readonly byteLength: number
}

export type FinanceInvoiceDocumentInspection =
  | { readonly status: "absent" }
  | ({ readonly status: "present" } & FinanceInvoiceDocumentReference)

export interface FinanceInvoiceDocumentProviderIdentity {
  readonly id: string
  readonly version: string
  readonly protocol: typeof FINANCE_INVOICE_DOCUMENT_PROVIDER_PROTOCOL
}

export interface FinanceInvoiceDocumentProvider {
  readonly identity: FinanceInvoiceDocumentProviderIdentity
  /**
   * Rendering is a pure transformation of the immutable descriptor. It must not
   * read from the database, resolve templates, allocate invoice numbers, or
   * upload — the fulfilment engine has already done all four.
   */
  render(
    descriptor: FinanceInvoiceDocumentRenderDescriptor,
  ): Promise<FinanceInvoiceDocumentArtifact>
  /**
   * Persist at the exact operation key.
   *
   * Unlike the Legal document provider, a repeated `put` with *different* bytes
   * is legitimate here and must replace: the operation key is one
   * `invoice_renditions` row, one row is one document, and a re-render of that
   * row (a retried attempt, a regenerated document) is the deployment asking for
   * exactly that. Rejecting the mismatch instead would strand the row forever
   * behind any renderer whose output is not byte-identical run to run.
   */
  put(input: {
    readonly renditionId: string
    readonly operationKey: string
    readonly artifact: FinanceInvoiceDocumentArtifact
  }): Promise<FinanceInvoiceDocumentReference>
  inspect(operationKey: string): Promise<FinanceInvoiceDocumentInspection>
  get(operationKey: string): Promise<Uint8Array | null>
  deleteIfPresent(operationKey: string): Promise<void>
}

function assertFinanceInvoiceDocumentProvider(provider: FinanceInvoiceDocumentProvider): void {
  if (!provider || typeof provider !== "object") {
    throw new Error("finance invoice document provider must be an object.")
  }
  const identity = provider.identity
  if (
    !identity?.id?.trim() ||
    !identity.version?.trim() ||
    identity.protocol !== FINANCE_INVOICE_DOCUMENT_PROVIDER_PROTOCOL
  ) {
    throw new Error(
      `finance invoice document provider must declare a stable id/version and ${FINANCE_INVOICE_DOCUMENT_PROVIDER_PROTOCOL} protocol.`,
    )
  }
  for (const method of ["render", "put", "inspect", "get", "deleteIfPresent"] as const) {
    if (typeof provider[method] !== "function") {
      throw new Error(`finance invoice document provider ${method} must be a function.`)
    }
  }
}

export const financeInvoiceDocumentProviderPort = definePort<FinanceInvoiceDocumentProvider>({
  id: "finance.invoice-document-provider",
  conformance: {
    entry: "@voyant-travel/finance",
    export: "financeInvoiceDocumentProviderPort",
  },
  test: assertFinanceInvoiceDocumentProvider,
  async verify(provider) {
    await assertFinanceInvoiceDocumentProviderConformance({
      provider,
      namespace: "finance/invoice-documents/provider-conformance",
    })
  },
})

export async function checksumInvoiceDocumentBytes(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", Uint8Array.from(bytes))
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("")
}

/** Build the one storage key a rendition row owns. */
export function invoiceDocumentOperationKey(input: {
  invoiceId: string
  renditionId: string
  format: string
}): string {
  return `invoices/${input.invoiceId}/renditions/${input.renditionId}.${input.format}`
}

/**
 * Executable behavioral preflight. A deployment must run this against an
 * isolated provider namespace before the fulfilment engine is allowed to write
 * a `ready` rendition, because a `ready` row is what every downstream consumer
 * — the notification bundle, `?wait=true`, the operator's download — reads as
 * "this invoice has a document".
 */
export async function assertFinanceInvoiceDocumentProviderConformance(input: {
  provider: FinanceInvoiceDocumentProvider
  namespace: string
}): Promise<void> {
  assertFinanceInvoiceDocumentProvider(input.provider)
  const renditionId = `conformance-${crypto.randomUUID()}`
  const operationKey = `${input.namespace.replace(/\/$/, "")}/${renditionId}.pdf`

  const artifact = await input.provider.render({
    renditionId,
    invoiceId: renditionId,
    invoiceNumber: `CONFORMANCE-${renditionId}`,
    templateId: null,
    body: `<p>Voyant provider conformance ${renditionId}</p>`,
    bodyFormat: "html",
    format: "pdf",
    language: null,
    variables: {},
  })
  if (
    !(artifact.bytes instanceof Uint8Array) ||
    artifact.bytes.byteLength === 0 ||
    artifact.checksumSha256 !== (await checksumInvoiceDocumentBytes(artifact.bytes)) ||
    !artifact.name.trim() ||
    !artifact.contentType.trim()
  ) {
    throw new Error("render did not return a valid checksummed invoice document artifact")
  }

  try {
    const first = await input.provider.put({ renditionId, operationKey, artifact })
    const duplicate = await input.provider.put({ renditionId, operationKey, artifact })
    if (
      first.key !== operationKey ||
      duplicate.key !== first.key ||
      duplicate.checksumSha256 !== artifact.checksumSha256
    ) {
      throw new Error("duplicate same-operation put was not stable")
    }

    const inspected = await input.provider.inspect(operationKey)
    const fetched = await input.provider.get(operationKey)
    if (
      inspected.status !== "present" ||
      inspected.checksumSha256 !== artifact.checksumSha256 ||
      !fetched ||
      (await checksumInvoiceDocumentBytes(fetched)) !== artifact.checksumSha256
    ) {
      throw new Error("put could not be reconciled against the persisted checksum")
    }

    // A retried attempt re-renders. The provider must land the new bytes at the
    // same key rather than preserving the first attempt's, or a row that failed
    // mid-flight would serve a stale document for the rest of its life.
    const replacementBytes = new TextEncoder().encode(`replacement ${renditionId}`)
    const replacement = {
      ...artifact,
      bytes: replacementBytes,
      checksumSha256: await checksumInvoiceDocumentBytes(replacementBytes),
    }
    const replaced = await input.provider.put({ renditionId, operationKey, artifact: replacement })
    const afterReplace = await input.provider.inspect(operationKey)
    if (
      replaced.key !== operationKey ||
      replaced.checksumSha256 !== replacement.checksumSha256 ||
      afterReplace.status !== "present" ||
      afterReplace.checksumSha256 !== replacement.checksumSha256
    ) {
      throw new Error("re-put at the same operation key did not replace the artifact")
    }
  } finally {
    await input.provider.deleteIfPresent(operationKey)
    await input.provider.deleteIfPresent(operationKey)
  }

  if ((await input.provider.inspect(operationKey)).status !== "absent") {
    throw new Error("deleteIfPresent did not remove the conformance artifact")
  }
}
