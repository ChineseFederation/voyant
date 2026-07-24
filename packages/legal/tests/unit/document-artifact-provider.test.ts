import { describe, expect, it } from "vitest"
import {
  assertLegalDocumentArtifactProviderConformance,
  checksumLegalDocumentBytes,
  LEGAL_DOCUMENT_ARTIFACT_PROVIDER_PROTOCOL,
  LegalDocumentArtifactMismatchError,
  type LegalDocumentArtifactProvider,
  legalDocumentArtifactProviderPort,
} from "../../src/contracts/document-artifact-provider.js"

function memoryProvider(): LegalDocumentArtifactProvider & {
  puts: number
  deletes: number
} {
  const objects = new Map<string, Uint8Array>()
  return {
    identity: {
      id: "test.legal-artifacts",
      version: "1.0.0",
      protocol: LEGAL_DOCUMENT_ARTIFACT_PROVIDER_PROTOCOL,
    },
    puts: 0,
    deletes: 0,
    async render(descriptor) {
      const bytes = new TextEncoder().encode(`voyant:${descriptor.contractId}`)
      return {
        bytes,
        checksumSha256: await checksumLegalDocumentBytes(bytes),
        name: "conformance.pdf",
        contentType: "application/pdf",
      }
    },
    async put(input) {
      this.puts += 1
      const existing = objects.get(input.operationKey)
      if (existing) {
        if ((await checksumLegalDocumentBytes(existing)) !== input.artifact.checksumSha256) {
          throw new LegalDocumentArtifactMismatchError(input.operationKey)
        }
      } else {
        objects.set(input.operationKey, input.artifact.bytes.slice())
      }
      return {
        key: input.operationKey,
        checksumSha256: input.artifact.checksumSha256,
        byteLength: input.artifact.bytes.byteLength,
      }
    },
    async inspect(key) {
      const bytes = objects.get(key)
      return bytes
        ? {
            status: "present" as const,
            key,
            checksumSha256: await checksumLegalDocumentBytes(bytes),
            byteLength: bytes.byteLength,
          }
        : { status: "absent" as const }
    },
    async get(key) {
      return objects.get(key)?.slice() ?? null
    },
    async deleteIfPresent(key) {
      this.deletes += 1
      objects.delete(key)
    },
  }
}

describe("legal document artifact provider conformance", () => {
  it("proves duplicate, mismatch, reconcile, and absent-delete behavior", async () => {
    const provider = memoryProvider()
    await expect(
      assertLegalDocumentArtifactProviderConformance({
        provider,
        namespace: "legal-test",
      }),
    ).resolves.toBeUndefined()
    expect(provider.puts).toBe(4)
    expect(provider.deletes).toBe(4)
  })

  it("rejects providers without stable protocol identity", async () => {
    const provider = memoryProvider()
    Object.assign(provider.identity, { version: "" })
    await expect(
      assertLegalDocumentArtifactProviderConformance({ provider, namespace: "legal-test" }),
    ).rejects.toThrow(/stable id\/version/)
  })

  it("rejects a provider whose renderer fails before any storage mutation", async () => {
    const provider = memoryProvider()
    provider.render = async () => {
      throw new Error("renderer unavailable")
    }

    await expect(
      assertLegalDocumentArtifactProviderConformance({ provider, namespace: "legal-test" }),
    ).rejects.toThrow(/renderer unavailable/)
    expect(provider.puts).toBe(0)
    expect(provider.deletes).toBe(0)
  })

  it("behaviorally preflights the exact selected provider", async () => {
    const provider = memoryProvider()
    const alternate = memoryProvider()

    await legalDocumentArtifactProviderPort.test(provider)

    expect(provider.puts).toBe(4)
    expect(provider.deletes).toBe(4)
    expect(alternate.puts).toBe(0)
    expect(alternate.deletes).toBe(0)
  })
})
