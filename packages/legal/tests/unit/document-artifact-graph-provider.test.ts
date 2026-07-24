import { createHttpDocumentRendererFromEnv } from "@voyant-travel/core/document-rendering"
import { createGatewayStorageProvider } from "@voyant-travel/storage"
import { describe, expect, it, vi } from "vitest"
import { createLegalDocumentArtifactGraphProvider } from "../../src/runtime-contributor.js"

describe("Legal document artifact graph provider", () => {
  it("constructs the standard provider from selected deployment resources", async () => {
    const resources = {
      "@voyant-travel/legal#resource.database": { transaction: vi.fn() },
      "@voyant-travel/legal#resource.document-storage": {
        name: "documents",
        resolveBackendIdentity: async () => "storage-primary",
      },
      "@voyant-travel/legal#resource.document-renderer": {
        name: "renderer",
        resolveBackendIdentity: async () => "renderer-primary",
      },
    }
    const getResource = vi.fn((id: keyof typeof resources) => resources[id])

    const provider = await createLegalDocumentArtifactGraphProvider({ getResource } as never)

    expect(provider.identity).toMatchObject({
      id: "voyant.standard.legal-document",
      protocol: "legal-document-artifact.v1",
    })
    expect(provider.identity.version).toMatch(/^1:[a-f0-9]{64}$/)
    expect(getResource).toHaveBeenCalledTimes(3)
  })

  it("changes provider identity for same endpoints with different credentials", async () => {
    const build = (credential: string) =>
      createLegalDocumentArtifactGraphProvider({
        getResource: (id: string) => {
          if (id.endsWith("database")) return { transaction: vi.fn() }
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
      createLegalDocumentArtifactGraphProvider({
        getResource: () => undefined,
      } as never),
    ).rejects.toThrow(/database, document storage, and document renderer resources/)
  })
})
