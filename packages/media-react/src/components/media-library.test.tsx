// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { VoyantMediaProvider } from "../provider.js"
import type { MediaAsset } from "../schemas.js"
import { MediaLibrary } from "./media-library.js"

const asset: MediaAsset = {
  id: "media_asset_doc",
  type: "document",
  name: "Trip brochure",
  altText: null,
  defaultLanguageTag: "en",
  altTranslations: [],
  storageKey: "uploads/brochure.pdf",
  url: null,
  mimeType: "application/pdf",
  fileSize: 98_765,
  checksum: "sum-doc",
  width: null,
  height: null,
  durationMs: null,
  tags: [],
  providerMeta: null,
  createdBy: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
}

function listResponse<T>(data: T[]) {
  return { data, total: data.length, limit: 60, offset: 0 }
}

afterEach(() => {
  cleanup()
})

describe("MediaLibrary", () => {
  it("renders the mocked asset list", async () => {
    const fetcher = vi.fn(async (url: string) => {
      const parsed = new URL(url, "http://localhost")
      if (parsed.pathname.endsWith("/media-library/assets")) {
        return Response.json(listResponse([asset]))
      }
      // folders + usage endpoints
      return Response.json(listResponse([]))
    })

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    })

    render(
      <QueryClientProvider client={queryClient}>
        <VoyantMediaProvider baseUrl="/api" fetcher={fetcher}>
          <MediaLibrary />
        </VoyantMediaProvider>
      </QueryClientProvider>,
    )

    expect(await screen.findByText("Trip brochure")).toBeInstanceOf(HTMLElement)
    expect(screen.getByText("Media library")).toBeInstanceOf(HTMLElement)
  })
})
