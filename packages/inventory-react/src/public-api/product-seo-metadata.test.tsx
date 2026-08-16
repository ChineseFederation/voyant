// @vitest-environment jsdom

import type { ProductContent } from "@voyant-travel/inventory/content-shape"
import { act, type ReactNode } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { ProductSeoHead, resolveProductSeoMetadata } from "./product-seo-metadata.js"

;(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true

function content(product: ProductContent["product"]): ProductContent {
  return { product, options: [], days: [], media: [], policies: [], departures: [] }
}

function meta(attribute: "name" | "property", value: string): HTMLMetaElement | null {
  return document.head.querySelector(`meta[${attribute}="${value}"]`)
}

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  document.head.innerHTML = '<title>Storefront</title><meta name="description" content="Host">'
  container = document.createElement("div")
  document.body.append(container)
  root = createRoot(container)
})

afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
})

async function render(children: ReactNode) {
  await act(async () => root.render(children))
}

describe("product storefront SEO metadata", () => {
  it("resolves localized SEO, image metadata, and product-copy fallbacks", () => {
    expect(
      resolveProductSeoMetadata(
        content({
          id: "prod_1",
          name: "Fallback name",
          seo_title: "Search title",
          seo_description: "Search description",
          open_graph_image_url: "https://example.com/social.jpg",
          open_graph_image_width: 1200,
          open_graph_image_height: 630,
          open_graph_image_type: "image/jpeg",
          open_graph_image_alt: "Mountain railway",
        }),
      ),
    ).toEqual({
      title: "Search title",
      description: "Search description",
      openGraphImage: {
        url: "https://example.com/social.jpg",
        width: 1200,
        height: 630,
        type: "image/jpeg",
        alt: "Mountain railway",
      },
    })

    expect(
      resolveProductSeoMetadata(
        content({
          id: "prod_1",
          name: "Fallback name",
          description: "Fallback description",
          hero_image_url: "https://example.com/cover.jpg",
        }),
      ),
    ).toEqual({
      title: "Fallback name",
      description: "Fallback description",
      openGraphImage: {
        url: "https://example.com/cover.jpg",
        width: null,
        height: null,
        type: null,
        alt: "Fallback name",
      },
    })
  })

  it("emits standard search, Open Graph, and Twitter tags and restores host state", async () => {
    const productContent = content({
      id: "prod_1",
      name: "Fallback name",
      seo_title: "Search title",
      seo_description: "Search description",
      open_graph_image_url: "https://example.com/social.jpg",
      open_graph_image_width: 1200,
      open_graph_image_height: 630,
      open_graph_image_type: "image/jpeg",
      open_graph_image_alt: "Mountain railway",
    })

    await render(<ProductSeoHead content={productContent} />)

    expect(document.title).toBe("Search title")
    expect(meta("name", "description")?.content).toBe("Search description")
    expect(meta("property", "og:title")?.content).toBe("Search title")
    expect(meta("property", "og:description")?.content).toBe("Search description")
    expect(meta("property", "og:image")?.content).toBe("https://example.com/social.jpg")
    expect(meta("property", "og:image:width")?.content).toBe("1200")
    expect(meta("property", "og:image:height")?.content).toBe("630")
    expect(meta("property", "og:image:type")?.content).toBe("image/jpeg")
    expect(meta("property", "og:image:alt")?.content).toBe("Mountain railway")
    expect(meta("name", "twitter:card")?.content).toBe("summary_large_image")
    expect(meta("name", "twitter:title")?.content).toBe("Search title")
    expect(meta("name", "twitter:description")?.content).toBe("Search description")
    expect(meta("name", "twitter:image")?.content).toBe("https://example.com/social.jpg")

    await render(<ProductSeoHead content={null} />)

    expect(document.title).toBe("Storefront")
    expect(meta("name", "description")?.content).toBe("Host")
    expect(meta("property", "og:title")).toBeNull()
    expect(meta("name", "twitter:card")).toBeNull()
  })
})
