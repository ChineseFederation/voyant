import { createHttpDocumentRendererFromEnv } from "@voyant-travel/core/document-rendering"
import { createGatewayStorageProvider } from "@voyant-travel/storage"
import { describe, expect, it, vi } from "vitest"

import { assertFinanceInvoiceDocumentProviderConformance } from "../../src/contracts/invoice-document-provider.js"
import { createStandardInvoiceDocumentProvider } from "../../src/invoice-document-runtime.js"
import { createFinanceInvoiceDocumentGraphProvider } from "../../src/runtime-contributor.js"

describe("Finance invoice document graph provider", () => {
  it("constructs the standard provider from selected deployment resources", async () => {
    const resources = {
      "@voyant-travel/finance#resource.document-storage": {
        name: "documents",
        resolveBackendIdentity: async () => "storage-primary",
      },
      "@voyant-travel/finance#resource.document-renderer": {
        name: "renderer",
        resolveBackendIdentity: async () => "renderer-primary",
      },
    }
    const getResource = vi.fn((id: keyof typeof resources) => resources[id])

    const provider = await createFinanceInvoiceDocumentGraphProvider({ getResource } as never)

    expect(provider.identity).toMatchObject({
      id: "voyant.standard.invoice-document",
      protocol: "finance-invoice-document.v1",
    })
    expect(provider.identity.version).toMatch(/^1:[a-f0-9]{64}$/)
    expect(getResource).toHaveBeenCalledTimes(2)
  })

  it("changes provider identity for the same endpoints with different credentials", async () => {
    const build = (credential: string) =>
      createFinanceInvoiceDocumentGraphProvider({
        getResource: (id: string) => {
          if (id.endsWith("document-storage")) {
            return createGatewayStorageProvider({
              endpoint: "https://storage.example",
              tier: "documents",
              token: credential,
            })
          }
          return createHttpDocumentRendererFromEnv({
            VOYANT_DOCUMENT_RENDERER_URL: "https://renderer.example/pdf",
            VOYANT_DOCUMENT_RENDERER_TOKEN: credential,
          })
        },
      } as never)

    const primary = await build("account-a-token")
    const swapped = await build("account-b-token")

    expect(swapped.identity.version).not.toBe(primary.identity.version)
  })

  it("fails startup instead of substituting a provider", async () => {
    await expect(
      createFinanceInvoiceDocumentGraphProvider({ getResource: () => undefined } as never),
    ).rejects.toThrow(/document storage and document renderer resources/)
  })
})

/** An in-memory document store that honours exact keys, like the real ones do. */
function memoryDocumentStorage() {
  const objects = new Map<string, Uint8Array>()
  return {
    objects,
    provider: {
      name: "memory:documents",
      resolveBackendIdentity: async () => "memory",
      upload: async (body: Uint8Array, options?: { key?: string }) => {
        const key = options?.key ?? "unnamed"
        objects.set(key, body)
        return { key }
      },
      get: async (key: string) => {
        const value = objects.get(key)
        return value ? (value.buffer.slice(0) as ArrayBuffer) : null
      },
      delete: async (key: string) => {
        objects.delete(key)
      },
    },
  }
}

describe("standard invoice document provider", () => {
  it("passes the port's own conformance harness", async () => {
    const storage = memoryDocumentStorage()
    const provider = await createStandardInvoiceDocumentProvider({
      storage: storage.provider as never,
      renderer: {
        name: "renderer",
        resolveBackendIdentity: async () => "renderer",
        renderPdf: async ({ html }: { html: string }) => new TextEncoder().encode(`pdf:${html}`),
      } as never,
    })

    await expect(
      assertFinanceInvoiceDocumentProviderConformance({
        provider,
        namespace: "finance/invoice-documents/test",
      }),
    ).resolves.toBeUndefined()
    // The harness cleans up after itself; a leftover object would mean a later
    // rendition could read another operation's bytes.
    expect(storage.objects.size).toBe(0)
  })

  it("refuses a store that does not honour the exact key", async () => {
    const provider = await createStandardInvoiceDocumentProvider({
      storage: {
        name: "renaming",
        resolveBackendIdentity: async () => "renaming",
        upload: async () => ({ key: "somewhere/else.pdf" }),
        get: async () => null,
        delete: async () => {},
      } as never,
      renderer: {
        name: "renderer",
        resolveBackendIdentity: async () => "renderer",
        renderPdf: async () => new TextEncoder().encode("pdf"),
      } as never,
    })

    await expect(
      provider.put({
        renditionId: "rendition-1",
        operationKey: "invoices/inv-1/renditions/rendition-1.pdf",
        artifact: {
          bytes: new TextEncoder().encode("pdf"),
          checksumSha256: "checksum",
          name: "invoice.pdf",
          contentType: "application/pdf",
        },
      }),
    ).rejects.toThrow(/did not honor the exact operation key/)
  })
})
