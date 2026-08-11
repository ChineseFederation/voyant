import { definePort } from "@voyant-travel/core/project"

export const LEGAL_DOCUMENT_ARTIFACT_PROVIDER_PROTOCOL = "legal-document-artifact.v1" as const

export interface LegalDocumentRenderDescriptor {
  readonly contractId: string
  readonly bookingId: string
  readonly templateVersionId: string | null
  readonly contractNumber: string | null
  readonly body: string
  readonly bodyFormat: "markdown" | "html" | "lexical_json"
  readonly variables: Readonly<Record<string, unknown>>
}

export interface LegalDocumentRenderedArtifact {
  readonly bytes: Uint8Array
  readonly checksumSha256: string
  readonly name: string
  readonly contentType: string
  readonly metadata?: Readonly<Record<string, string>>
}

export interface LegalDocumentArtifactIdentity {
  readonly id: string
  readonly version: string
  readonly protocol: typeof LEGAL_DOCUMENT_ARTIFACT_PROVIDER_PROTOCOL
}

export interface LegalDocumentArtifactReference {
  readonly key: string
  readonly checksumSha256: string
  readonly byteLength: number
}

export type LegalDocumentArtifactInspection =
  | { readonly status: "absent" }
  | ({ readonly status: "present" } & LegalDocumentArtifactReference)

export interface LegalDocumentArtifactProvider {
  readonly identity: LegalDocumentArtifactIdentity
  /**
   * Rendering is a pure transformation of the immutable descriptor. It must
   * not read from the database, select templates, allocate numbers, or upload.
   */
  render(descriptor: LegalDocumentRenderDescriptor): Promise<LegalDocumentRenderedArtifact>
  /**
   * Persist at the exact operation key. Repeating the same operation and
   * fingerprint must return the same object. Existing mismatched bytes must be
   * rejected, never overwritten.
   */
  put(input: {
    readonly operationId: string
    readonly operationKey: string
    readonly requestFingerprint: string
    readonly artifact: LegalDocumentRenderedArtifact
  }): Promise<LegalDocumentArtifactReference>
  inspect(operationKey: string): Promise<LegalDocumentArtifactInspection>
  get(operationKey: string): Promise<Uint8Array | null>
  deleteIfPresent(operationKey: string): Promise<void>
}

function assertLegalDocumentArtifactProvider(provider: LegalDocumentArtifactProvider): void {
  if (!provider || typeof provider !== "object") {
    throw new Error("legal document artifact provider must be an object.")
  }
  const identity = provider.identity
  if (
    !identity?.id?.trim() ||
    !identity.version?.trim() ||
    identity.protocol !== LEGAL_DOCUMENT_ARTIFACT_PROVIDER_PROTOCOL
  ) {
    throw new Error(
      `legal document artifact provider must declare a stable id/version and ${LEGAL_DOCUMENT_ARTIFACT_PROVIDER_PROTOCOL} protocol.`,
    )
  }
  for (const method of ["render", "put", "inspect", "get", "deleteIfPresent"] as const) {
    if (typeof provider[method] !== "function") {
      throw new Error(`legal document artifact provider ${method} must be a function.`)
    }
  }
}

export const legalDocumentArtifactProviderPort = definePort<LegalDocumentArtifactProvider>({
  id: "legal.document-artifact-provider",
  conformance: {
    entry: "@voyant-travel/legal",
    export: "legalDocumentArtifactProviderPort",
  },
  test: assertLegalDocumentArtifactProvider,
  async verify(provider) {
    await assertLegalDocumentArtifactProviderConformance({
      provider,
      namespace: "legal/contract-documents/provider-conformance",
    })
  },
})

export async function checksumLegalDocumentBytes(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", Uint8Array.from(bytes))
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("")
}

export class LegalDocumentArtifactMismatchError extends Error {
  constructor(readonly operationKey: string) {
    super(`Legal document artifact at "${operationKey}" does not match the operation fingerprint.`)
    this.name = "LegalDocumentArtifactMismatchError"
  }
}

/**
 * Executable behavioral preflight. Deployments must run this against an
 * isolated provider namespace before exposing either mutation action.
 */
export async function assertLegalDocumentArtifactProviderConformance(input: {
  provider: LegalDocumentArtifactProvider
  namespace: string
}): Promise<void> {
  assertLegalDocumentArtifactProvider(input.provider)
  const operationId = `conformance-${crypto.randomUUID()}`
  const operationKey = `${input.namespace.replace(/\/$/, "")}/${operationId}`
  const ambiguousOperationId = `${operationId}-ambiguous`
  const ambiguousOperationKey = `${operationKey}-ambiguous`
  const artifact = await input.provider.render({
    contractId: operationId,
    bookingId: operationId,
    templateVersionId: null,
    contractNumber: null,
    body: `<p>Voyant provider conformance ${operationId}</p>`,
    bodyFormat: "html",
    variables: {},
  })
  if (
    !(artifact.bytes instanceof Uint8Array) ||
    artifact.bytes.byteLength === 0 ||
    artifact.checksumSha256 !== (await checksumLegalDocumentBytes(artifact.bytes)) ||
    !artifact.name.trim() ||
    !artifact.contentType.trim()
  ) {
    throw new Error("render did not return a valid checksummed document artifact")
  }
  const put = {
    operationId,
    operationKey,
    requestFingerprint: artifact.checksumSha256,
    artifact,
  } as const

  try {
    const first = await input.provider.put(put)
    const duplicate = await input.provider.put(put)
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
      (await checksumLegalDocumentBytes(fetched)) !== artifact.checksumSha256
    ) {
      throw new Error("put/checkpoint reconciliation could not prove the persisted checksum")
    }

    const mismatchBytes = new TextEncoder().encode("mismatch")
    let rejectedMismatch = false
    try {
      await input.provider.put({
        ...put,
        artifact: {
          ...artifact,
          bytes: mismatchBytes,
          checksumSha256: await checksumLegalDocumentBytes(mismatchBytes),
        },
      })
    } catch {
      rejectedMismatch = true
    }
    if (!rejectedMismatch) {
      throw new Error("mismatched duplicate put was not rejected")
    }
    const afterMismatch = await input.provider.inspect(operationKey)
    if (
      afterMismatch.status !== "present" ||
      afterMismatch.checksumSha256 !== artifact.checksumSha256
    ) {
      throw new Error("mismatched duplicate put changed the original operation artifact")
    }

    // Model the provider-side success / transport-side failure boundary: the
    // object is persisted, then the caller observes an exception before it can
    // checkpoint the returned reference. inspect/get must make that outcome
    // provable without issuing a destructive overwrite.
    try {
      await input.provider.put({
        ...put,
        operationId: ambiguousOperationId,
        operationKey: ambiguousOperationKey,
      })
      throw new Error("simulated persisted-then-threw transport failure")
    } catch (error) {
      if (
        !(error instanceof Error) ||
        error.message !== "simulated persisted-then-threw transport failure"
      ) {
        throw error
      }
    }
    const ambiguousInspection = await input.provider.inspect(ambiguousOperationKey)
    const ambiguousBytes = await input.provider.get(ambiguousOperationKey)
    if (
      ambiguousInspection.status !== "present" ||
      ambiguousInspection.key !== ambiguousOperationKey ||
      ambiguousInspection.checksumSha256 !== artifact.checksumSha256 ||
      !ambiguousBytes ||
      (await checksumLegalDocumentBytes(ambiguousBytes)) !== artifact.checksumSha256
    ) {
      throw new Error("persisted-then-threw put could not be reconciled")
    }
  } finally {
    await input.provider.deleteIfPresent(operationKey)
    await input.provider.deleteIfPresent(operationKey)
    await input.provider.deleteIfPresent(ambiguousOperationKey)
    await input.provider.deleteIfPresent(ambiguousOperationKey)
  }

  if (
    (await input.provider.inspect(operationKey)).status !== "absent" ||
    (await input.provider.inspect(ambiguousOperationKey)).status !== "absent"
  ) {
    throw new Error("deleteIfPresent did not remove the conformance artifact")
  }
}
