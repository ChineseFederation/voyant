// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import type { ReactNode } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { VoyantMediaProvider } from "../provider.js"
import type { MediaAsset } from "../schemas.js"
import { MediaPicker } from "./media-picker.js"

const imageAsset: MediaAsset = {
  id: "media_asset_img",
  type: "image",
  name: "Sunset photo",
  altText: "A sunset over the sea",
  defaultLanguageTag: "en",
  altTranslations: [
    {
      assetId: "media_asset_img",
      languageTag: "ro",
      altText: "Apus peste mare",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    },
  ],
  storageKey: "uploads/sunset.jpg",
  url: "https://cdn.example.test/uploads/sunset.jpg",
  mimeType: "image/jpeg",
  fileSize: 12_345,
  checksum: "sum-img",
  width: 800,
  height: 600,
  durationMs: null,
  tags: ["nature"],
  providerMeta: null,
  createdBy: "user_1",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
}

const videoAsset: MediaAsset = {
  ...imageAsset,
  id: "media_asset_vid",
  type: "video",
  name: "Launch clip",
  altText: null,
  altTranslations: [],
  storageKey: "uploads/launch.mp4",
  mimeType: "video/mp4",
  checksum: "sum-vid",
}

function listResponse(data: MediaAsset[]) {
  return { data, total: data.length, limit: 40, offset: 0 }
}

afterEach(() => {
  cleanup()
})

describe("MediaPicker", () => {
  it("renders assets returned by the library", async () => {
    const fetcher = fetcherFor([imageAsset, videoAsset])
    renderPicker({ fetcher, onSelect: vi.fn() })

    expect(await screen.findByText("Sunset photo")).toBeInstanceOf(HTMLElement)
    expect(screen.getByText("Launch clip")).toBeInstanceOf(HTMLElement)
  })

  it("filters by asset type through the type control", async () => {
    const fetcher = fetcherFor([imageAsset, videoAsset])
    renderPicker({ fetcher, onSelect: vi.fn() })

    await waitFor(() => expect(fetcher).toHaveBeenCalled())
    fireEvent.change(screen.getByLabelText("Type"), { target: { value: "image" } })

    await waitFor(() =>
      expect(fetcher).toHaveBeenCalledWith(
        expect.stringContaining("/v1/admin/media-library/assets?type=image"),
        expect.anything(),
      ),
    )
  })

  it("fires onSelect with the chosen asset in single-select mode", async () => {
    const fetcher = fetcherFor([imageAsset, videoAsset])
    const onSelect = vi.fn()
    renderPicker({ fetcher, onSelect })

    fireEvent.click(await screen.findByText("Sunset photo"))

    expect(onSelect).toHaveBeenCalledTimes(1)
    expect(onSelect).toHaveBeenCalledWith([expect.objectContaining({ id: "media_asset_img" })])
  })
})

function fetcherFor(assets: MediaAsset[]) {
  return vi.fn(async (url: string) => {
    const parsed = new URL(url, "http://localhost")
    const type = parsed.searchParams.get("type")
    if (parsed.pathname.endsWith("/media-library/assets")) {
      const filtered = type ? assets.filter((asset) => asset.type === type) : assets
      return Response.json(listResponse(filtered))
    }
    return Response.json(listResponse([]))
  })
}

function renderPicker({
  fetcher,
  onSelect,
  children,
}: {
  fetcher: (url: string, init?: RequestInit) => Promise<Response>
  onSelect: (assets: MediaAsset[]) => void
  children?: ReactNode
}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <VoyantMediaProvider baseUrl="/api" fetcher={fetcher}>
        <MediaPicker inline onSelect={onSelect} />
        {children}
      </VoyantMediaProvider>
    </QueryClientProvider>,
  )
}
