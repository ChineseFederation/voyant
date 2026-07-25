import { describe, expect, it } from "vitest"

import { resolveMediaAltText } from "./schemas.js"

const localizedAsset = {
  altText: "Plaja la apus",
  defaultLanguageTag: "ro",
  altTranslations: [
    {
      assetId: "media_1",
      languageTag: "en",
      altText: "Beach at sunset",
      createdAt: "2026-07-25T00:00:00.000Z",
      updatedAt: "2026-07-25T00:00:00.000Z",
    },
    {
      assetId: "media_1",
      languageTag: "de",
      altText: "Strand bei Sonnenuntergang",
      createdAt: "2026-07-25T00:00:00.000Z",
      updatedAt: "2026-07-25T00:00:00.000Z",
    },
  ],
}

describe("resolveMediaAltText", () => {
  it("uses the requested translation and its base-language fallback", () => {
    expect(resolveMediaAltText(localizedAsset, "en-GB")).toBe("Beach at sunset")
    expect(resolveMediaAltText(localizedAsset, "de")).toBe("Strand bei Sonnenuntergang")
  })

  it("falls back to the asset default alt text", () => {
    expect(resolveMediaAltText(localizedAsset, "fr")).toBe("Plaja la apus")
    expect(resolveMediaAltText(localizedAsset, "ro-RO")).toBe("Plaja la apus")
  })

  it("uses the first translation when no default alt text exists", () => {
    expect(resolveMediaAltText({ ...localizedAsset, altText: null }, "fr")).toBe("Beach at sunset")
  })
})
