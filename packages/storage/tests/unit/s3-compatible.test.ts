import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  type S3Client,
} from "@aws-sdk/client-s3"
import { describe, expect, it, vi } from "vitest"

import { createS3CompatibleStorageProvider } from "../../src/providers/s3-compatible.js"

const baseOptions = {
  accessKeyId: "AKIA-TEST",
  secretAccessKey: "secret-test",
  region: "us-east-1",
  bucket: "my-bucket",
}

describe("createS3CompatibleStorageProvider", () => {
  it("binds opaque backend identity to the complete credential-scoped backend", async () => {
    const create = (accessKeyId: string, secretAccessKey: string) =>
      createS3CompatibleStorageProvider({
        bucket: "documents",
        region: "auto",
        endpoint: "https://s3.example",
        accessKeyId,
        secretAccessKey,
        backendIdentity: `${accessKeyId}:${secretAccessKey}`,
        client: { send: vi.fn() } as never,
      })
    const first = create("account-a", "secret-a")
    const second = create("account-b", "secret-b")

    const firstIdentity = await first.resolveBackendIdentity?.()
    expect(firstIdentity).toMatch(/^[a-f0-9]{64}$/)
    expect(await second.resolveBackendIdentity?.()).not.toBe(firstIdentity)
    expect(firstIdentity).not.toContain("secret-a")
  })

  it("uses AWS SDK commands for the common storage contract", async () => {
    const send = vi.fn(async (command: unknown) => {
      if (command instanceof GetObjectCommand) {
        return {
          Body: { transformToByteArray: async () => new Uint8Array([9, 8, 7]) },
        }
      }
      return {}
    })
    const provider = createS3CompatibleStorageProvider({
      ...baseOptions,
      backendIdentity: "test-client",
      client: { send } as unknown as S3Client,
      generateKey: () => "docs/file.txt",
      publicBaseUrl: "https://cdn.example.com/",
    })

    await expect(
      provider.upload(new Uint8Array([1, 2, 3]), {
        contentType: "text/plain",
        metadata: { owner: "voyant" },
      }),
    ).resolves.toEqual({
      key: "docs/file.txt",
      url: "https://cdn.example.com/docs/file.txt",
    })
    await provider.delete("docs/file.txt")
    await expect(provider.get("docs/file.txt")).resolves.toEqual(new Uint8Array([9, 8, 7]).buffer)

    expect(send.mock.calls[0]?.[0]).toBeInstanceOf(PutObjectCommand)
    expect((send.mock.calls[0]?.[0] as PutObjectCommand).input).toMatchObject({
      Bucket: "my-bucket",
      Key: "docs/file.txt",
      ContentType: "text/plain",
      Metadata: { owner: "voyant" },
    })
    expect(send.mock.calls[1]?.[0]).toBeInstanceOf(DeleteObjectCommand)
    expect(send.mock.calls[2]?.[0]).toBeInstanceOf(GetObjectCommand)
  })

  it("returns null when the compatible service reports a missing object", async () => {
    const send = vi.fn(async () => {
      throw Object.assign(new Error("missing"), { $metadata: { httpStatusCode: 404 } })
    })
    const provider = createS3CompatibleStorageProvider({
      ...baseOptions,
      backendIdentity: "test-client",
      client: { send } as unknown as S3Client,
    })
    await expect(provider.get("missing")).resolves.toBeNull()
  })

  it("uses AWS SDK signing for time-limited downloads", async () => {
    const provider = createS3CompatibleStorageProvider(baseOptions)
    const url = await provider.signedUrl("docs/file.txt", 3600)
    const parsed = new URL(url)
    expect(parsed.searchParams.get("X-Amz-Algorithm")).toBe("AWS4-HMAC-SHA256")
    expect(parsed.searchParams.get("X-Amz-Expires")).toBe("3600")
    expect(parsed.pathname).toContain("/docs/file.txt")
  })

  it("defaults custom endpoints to path-style addressing", async () => {
    const provider = createS3CompatibleStorageProvider({
      ...baseOptions,
      endpoint: "https://objects.example.test",
    })

    const parsed = new URL(await provider.signedUrl("docs/file.txt", 3600))
    expect(parsed.hostname).toBe("objects.example.test")
    expect(parsed.pathname).toBe("/my-bucket/docs/file.txt")
  })

  it("allows virtual-host addressing to be selected explicitly", async () => {
    const provider = createS3CompatibleStorageProvider({
      ...baseOptions,
      endpoint: "https://objects.example.test",
      forcePathStyle: false,
    })

    const parsed = new URL(await provider.signedUrl("docs/file.txt", 3600))
    expect(parsed.hostname).toBe("my-bucket.objects.example.test")
    expect(parsed.pathname).toBe("/docs/file.txt")
  })

  it("rejects partial explicit credentials", () => {
    expect(() =>
      createS3CompatibleStorageProvider({
        bucket: "bucket",
        region: "auto",
        accessKeyId: "only-one-half",
      }),
    ).toThrow(/both accessKeyId and secretAccessKey/)
  })

  it("rejects opaque clients and ambient credential chains without identity", () => {
    expect(() =>
      createS3CompatibleStorageProvider({
        bucket: "bucket",
        region: "auto",
        client: { send: vi.fn() } as never,
      }),
    ).toThrow(/backendIdentity/)
    expect(() =>
      createS3CompatibleStorageProvider({
        bucket: "bucket",
        region: "auto",
      }),
    ).toThrow(/backendIdentity/)
  })

  it("accepts an explicit identity for opaque clients and ambient credentials", async () => {
    const injected = createS3CompatibleStorageProvider({
      bucket: "bucket",
      region: "auto",
      backendIdentity: "account-a",
      client: { send: vi.fn() } as never,
    })
    const ambient = createS3CompatibleStorageProvider({
      bucket: "bucket",
      region: "auto",
      backendIdentity: "account-a",
    })
    await expect(injected.resolveBackendIdentity?.()).resolves.toMatch(/^[a-f0-9]{64}$/)
    await expect(ambient.resolveBackendIdentity?.()).resolves.toBe(
      await injected.resolveBackendIdentity?.(),
    )
  })
})
