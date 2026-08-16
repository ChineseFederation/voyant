import { describe, expect, it } from "vitest"

import { mapContentToEnrichment } from "./catalog-enrichment-mappers.js"

/**
 * The supplier label on a vertical detail page is resolved twice, and both
 * times matter.
 *
 * `mapContentToEnrichment` resolves it once when the content lands. The page
 * then resolves it again at render, because the detail page's fetchers
 * deliberately do NOT depend on the supplier directory — depending on it made
 * one page load issue the content route three times. That means a directory
 * arriving after the content never triggers a refetch, so the snapshot taken
 * here can be a raw id forever unless the render re-resolves it.
 *
 * These pin the property the render step relies on: the resolver is a lookup
 * that returns its input on a miss, so applying it to an already-resolved name
 * is a no-op.
 */
const payload = (supplier: string | null) => ({
  data: {
    content: {
      product: { id: "prod_1", name: "Sunset Sail", supplier },
      days: [],
      media: [],
      options: [],
      policies: [],
      departures: [],
    },
    served_locale: "en-GB",
  },
})

const mapWith = (supplier: string | null, formatSupplier?: (id: string) => string) =>
  mapContentToEnrichment(payload(supplier) as never, new Map(), formatSupplier)

describe("supplier label on a mapped enrichment", () => {
  it("resolves the id through the directory when it is already loaded", () => {
    const directory = (id: string) => (id === "sup_1" ? "TUI" : id)
    expect(mapWith("sup_1", directory).supplier).toBe("TUI")
  })

  it("snapshots the raw id when the directory has not loaded yet", () => {
    // The race this whole arrangement exists for: content first, directory
    // second. Nothing refetches, so the page must re-resolve at render.
    const emptyDirectory = (id: string) => id
    expect(mapWith("sup_1", emptyDirectory).supplier).toBe("sup_1")
  })

  it("is idempotent over an already-resolved name, so re-resolving is safe", () => {
    const directory = (id: string) => (id === "sup_1" ? "TUI" : id)
    // What the render step does to the snapshot above, twice over.
    expect(directory(directory("sup_1"))).toBe("TUI")
    expect(directory("TUI")).toBe("TUI")
  })

  it("leaves a missing supplier missing rather than inventing a label", () => {
    expect(mapWith(null, (id) => id).supplier).toBeNull()
  })
})
