import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import {
  type OperatorAdminMessages,
  operatorAdminMessageDefinitions,
  resolveLocaleMessages,
} from "@voyant-travel/i18n"
import type React from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import { type ProductDetailApi, ProductDetailHostProvider } from "./host.js"
import { ProductBrochureSection } from "./product-detail-media-sections.js"
import type { ProductMediaItem } from "./product-detail-shared.js"
import { ProductMediaGallery } from "./product-media-gallery.js"

const messages = resolveLocaleMessages<OperatorAdminMessages>({
  locale: "en",
  fallbackLocale: "en",
  definitions: operatorAdminMessageDefinitions,
})

const api: ProductDetailApi = {
  get: async <T,>() => ({ data: [] }) as T,
  post: async <T,>() => ({ data: {} }) as T,
  patch: async <T,>() => ({ data: {} }) as T,
  delete: async <T,>() => ({}) as T,
}

function renderWithProductDetailHost(children: React.ReactNode) {
  return renderToStaticMarkup(
    <QueryClientProvider client={new QueryClient()}>
      <ProductDetailHostProvider
        value={{
          messages,
          api,
          locale: "en",
          navigate: {
            toProducts: () => undefined,
            toProduct: () => undefined,
            toAvailability: () => undefined,
          },
        }}
      >
        {children}
      </ProductDetailHostProvider>
    </QueryClientProvider>,
  )
}

const documentMedia: ProductMediaItem = {
  id: "pmed_document",
  productId: "prod_1",
  dayId: null,
  mediaType: "document",
  name: "Terms PDF",
  url: "https://example.com/terms.pdf",
  storageKey: null,
  mimeType: "application/pdf",
  fileSize: 1024,
  width: null,
  height: null,
  altText: null,
  sortOrder: 0,
  isCover: true,
  isOpenGraph: false,
  isBrochure: false,
  isBrochureCurrent: false,
  brochureVersion: null,
  createdAt: "2026-06-01T00:00:00.000Z",
  updatedAt: "2026-06-01T00:00:00.000Z",
}

describe("product detail media sections", () => {
  it("renders brochure generation failures inline", () => {
    const html = renderWithProductDetailHost(
      <ProductBrochureSection
        brochure={null}
        isGenerating={false}
        generateError="Storage not configured"
        onGenerate={() => undefined}
      />,
    )

    expect(html).toContain("No brochure generated yet.")
    expect(html).toContain("Storage not configured")
  })

  it("does not render document media as a cover in the gallery", () => {
    const html = renderWithProductDetailHost(
      <ProductMediaGallery
        productId="prod_1"
        media={[documentMedia]}
        isUploading={false}
        onUpload={() => undefined}
        onSetCover={() => undefined}
        onDelete={() => undefined}
      />,
    )

    expect(html).toContain("document")
    expect(html).not.toContain("Set cover")
    expect(html).not.toContain(">Cover<")
  })
})
