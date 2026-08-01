import type { StorageProvider } from "@voyant-travel/storage"
import { describe, expect, it } from "vitest"

import { resolvePublicBrandingUrl } from "../../src/routes.js"

function storageWithPublicUrl(publicUrl: (key: string) => string | null): StorageProvider {
  return { publicUrl } as StorageProvider
}

describe("public operator branding URLs", () => {
  it("uses the storage provider's public origin when configured", () => {
    const storage = storageWithPublicUrl(
      (key) => `https://cdn.example.test/operator/${encodeURIComponent(key)}`,
    )

    expect(resolvePublicBrandingUrl(storage, "uploads/logo.png", "logo-light")).toBe(
      "https://cdn.example.test/operator/uploads%2Flogo.png",
    )
  })

  it("falls back to a slot-scoped public route instead of the admin media route", () => {
    const storage = storageWithPublicUrl((key) => `https://api.example.test/v1/admin/media/${key}`)

    expect(resolvePublicBrandingUrl(storage, "uploads/logo.png", "logo-light")).toBe(
      "/v1/public/operator-branding/logo-light",
    )
  })

  it("does not advertise an asset URL without both a key and storage", () => {
    const storage = storageWithPublicUrl(() => "https://cdn.example.test/logo.png")

    expect(resolvePublicBrandingUrl(storage, null, "logo-light")).toBeNull()
    expect(resolvePublicBrandingUrl(null, "uploads/logo.png", "logo-light")).toBeNull()
  })
})
