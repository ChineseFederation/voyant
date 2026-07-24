import { describe, expect, it } from "vitest"

import {
  createMemoryGraphStorageProvider,
  createS3CompatibleGraphStorageProvider,
} from "../../src/providers/graph.js"

function context(values: Record<string, unknown>) {
  return {
    getConfig: (id: string) => values[id],
    getSecret: (id: string) => values[id],
  }
}

describe("graph-selected storage providers", () => {
  it("builds the local logical stores from declared graph config", async () => {
    const resolver = createMemoryGraphStorageProvider(
      context({ "@voyant-travel/storage#config.app-url": "http://localhost:4400" }),
    )
    const media = resolver.resolve("media")

    await expect(media?.upload(new Uint8Array([1]), { key: "uploads/a.jpg" })).resolves.toEqual({
      key: "uploads/a.jpg",
      url: "http://localhost:4400/api/v1/admin/media/uploads/a.jpg",
    })
    expect(resolver.resolve("unknown")).toBeNull()
  })

  it("builds S3-compatible logical stores from declared graph values", () => {
    const resolver = createS3CompatibleGraphStorageProvider(
      context({
        "@voyant-travel/storage#config.s3-region": "auto",
        "@voyant-travel/storage#config.s3-endpoint": "https://objects.example.test",
        "@voyant-travel/storage#config.documents-bucket": "documents",
        "@voyant-travel/storage#config.media-bucket": "media",
        "@voyant-travel/storage#secret.s3-access-key-id": "key",
        "@voyant-travel/storage#secret.s3-secret-access-key": "secret",
      }),
    )

    expect(resolver.resolve("documents")?.name).toBe("s3-compatible:documents")
    expect(resolver.resolve("media")?.name).toBe("s3-compatible:media")
  })

  it("fails closed when required S3 graph config is absent", () => {
    expect(() => createS3CompatibleGraphStorageProvider(context({}))).toThrow(/S3_REGION/)
  })

  it("requires deployment identity for the default S3 credential chain", () => {
    const values = {
      "@voyant-travel/storage#config.s3-region": "auto",
      "@voyant-travel/storage#config.documents-bucket": "documents",
      "@voyant-travel/storage#config.media-bucket": "media",
    }
    expect(() => createS3CompatibleGraphStorageProvider(context(values))).toThrow(/backendIdentity/)
    expect(() =>
      createS3CompatibleGraphStorageProvider(
        context({
          ...values,
          "@voyant-travel/storage#config.s3-backend-identity": "aws-account-123",
        }),
      ),
    ).not.toThrow()
  })
})
