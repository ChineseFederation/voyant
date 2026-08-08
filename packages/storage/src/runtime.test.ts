import { describe, expect, it, vi } from "vitest"

import { createLocalStorageProvider } from "./providers/local.js"
import { resolveDocumentDownloadUrl, type StorageRuntimeEnv } from "./runtime.js"

const storage = createLocalStorageProvider()

function env(overrides: StorageRuntimeEnv = {}): StorageRuntimeEnv {
  return {
    ...overrides,
  }
}

describe("resolveDocumentDownloadUrl", () => {
  it("prefers a time-limited HTTPS URL for private object storage", async () => {
    const signedUrl = vi.fn(
      async () => "https://storage.example.test/contracts/example.pdf?signature=private",
    )

    await expect(
      resolveDocumentDownloadUrl(
        env({ API_BASE_URL: "https://operator.example.test/api" }),
        { ...storage, signedUrl },
        "contracts/example.pdf",
        120,
      ),
    ).resolves.toBe("https://storage.example.test/contracts/example.pdf?signature=private")
    expect(signedUrl).toHaveBeenCalledWith("contracts/example.pdf", 120)
  })

  it("falls back to the authenticated stream for non-HTTP local URLs", async () => {
    await expect(
      resolveDocumentDownloadUrl(
        env({ API_BASE_URL: "http://localhost:3300/api" }),
        storage,
        "contracts/example.pdf",
      ),
    ).resolves.toBe("http://localhost:3300/api/v1/admin/documents/files/contracts/example.pdf")
  })

  it("uses API_BASE_URL so local admin redirects keep the /api mount prefix", async () => {
    await expect(
      resolveDocumentDownloadUrl(
        env({
          APP_URL: "http://localhost:3300",
          API_BASE_URL: "http://localhost:3300/api",
        }),
        storage,
        "contracts/customer agreement.pdf",
      ),
    ).resolves.toBe(
      "http://localhost:3300/api/v1/admin/documents/files/contracts/customer%20agreement.pdf",
    )
  })

  it("derives the mounted API prefix from an origin-only APP_URL", async () => {
    await expect(
      resolveDocumentDownloadUrl(
        env({
          APP_URL: "http://localhost:3300",
        }),
        storage,
        "contracts/example.pdf",
      ),
    ).resolves.toBe("http://localhost:3300/api/v1/admin/documents/files/contracts/example.pdf")
  })

  it("preserves an APP_URL that already includes the API mount prefix", async () => {
    await expect(
      resolveDocumentDownloadUrl(
        env({
          APP_URL: "http://localhost:3300/api/",
        }),
        storage,
        "contracts/example.pdf",
      ),
    ).resolves.toBe("http://localhost:3300/api/v1/admin/documents/files/contracts/example.pdf")
  })
})
