// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { act, type ReactNode, useEffect, useRef } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

;(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true

const uploadAssetMock = vi.fn()
const createMediaMock = vi.fn()

vi.mock("@voyant-travel/media-react/hooks", () => ({
  useAssetUpload: () => ({ mutateAsync: uploadAssetMock, isPending: false }),
}))

vi.mock("../hooks/use-product-media-mutation.js", () => ({
  useProductMediaMutation: () => ({
    create: { mutateAsync: createMediaMock, isPending: false },
  }),
}))

import { useProductMediaUpload } from "../hooks/use-product-media-upload.js"
import { VoyantProductsProvider } from "../provider.js"

/** Drive the hook once on mount and surface its `upload` fn to the test. */
function UploadHarness({
  run,
}: {
  run: (upload: ReturnType<typeof useProductMediaUpload>) => void
}) {
  const api = useProductMediaUpload()
  const ran = useRef(false)
  useEffect(() => {
    if (ran.current) return
    ran.current = true
    run(api)
  }, [api, run])
  return null
}

function wrap(children: ReactNode) {
  return (
    <QueryClientProvider client={new QueryClient()}>
      <VoyantProductsProvider baseUrl="/api" fetcher={async () => new Response("{}")}>
        {children}
      </VoyantProductsProvider>
    </QueryClientProvider>
  )
}

const asset = {
  id: "masset_1",
  type: "image" as const,
  name: "photo.png",
  altText: null,
  defaultLanguageTag: "en",
  altTranslations: [],
  url: null,
  storageKey: "abc/photo.png",
  mimeType: "image/png",
  fileSize: 2048,
  checksum: "sum",
  width: null,
  height: null,
  durationMs: null,
  tags: [] as string[],
  providerMeta: null,
  createdBy: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
}

describe("useProductMediaUpload", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    uploadAssetMock.mockReset()
    createMediaMock.mockReset()
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  it("uploads to the media library then attaches the returned asset", async () => {
    uploadAssetMock.mockResolvedValue({ data: asset })
    createMediaMock.mockResolvedValue({ id: "pmed_1", productId: "prod_1" })

    let upload!: ReturnType<typeof useProductMediaUpload>["upload"]
    await act(async () => {
      root.render(wrap(<UploadHarness run={(api) => (upload = api.upload)} />))
    })

    const file = new File(["bytes"], "photo.png", { type: "image/png" })
    await act(async () => {
      await upload(file, { productId: "prod_1", sortOrder: 0, isCover: true })
    })

    expect(uploadAssetMock).toHaveBeenCalledWith(
      expect.objectContaining({ file, type: "image", name: "photo.png", mimeType: "image/png" }),
    )
    expect(createMediaMock).toHaveBeenCalledWith(
      expect.objectContaining({
        productId: "prod_1",
        assetId: "masset_1",
        storageKey: "abc/photo.png",
        url: "/api/v1/admin/media/abc/photo.png",
        mediaType: "image",
        mimeType: "image/png",
        fileSize: 2048,
        isCover: true,
      }),
    )
  })

  it("prefers the legacy uploadMedia handler when provided", async () => {
    const uploadMedia = vi.fn().mockResolvedValue({ url: "https://cdn/x.png", mediaType: "image" })
    createMediaMock.mockResolvedValue({ id: "pmed_2", productId: "prod_1" })

    let upload!: ReturnType<typeof useProductMediaUpload>["upload"]
    await act(async () => {
      root.render(wrap(<UploadHarness run={(api) => (upload = api.upload)} />))
    })

    const file = new File(["bytes"], "x.png", { type: "image/png" })
    await act(async () => {
      await upload(file, { productId: "prod_1", sortOrder: 0 }, uploadMedia)
    })

    expect(uploadMedia).toHaveBeenCalledWith(file, { productId: "prod_1", dayId: undefined })
    expect(uploadAssetMock).not.toHaveBeenCalled()
    expect(createMediaMock).toHaveBeenCalledWith(
      expect.objectContaining({ url: "https://cdn/x.png", assetId: null }),
    )
  })
})
