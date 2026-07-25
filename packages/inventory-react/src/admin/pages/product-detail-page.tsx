"use client"

import {
  AdminWidgetSlotRenderer,
  useAdminBreadcrumbs,
  useAdminNavigate,
  useLocale,
  useOperatorAdminMessages,
} from "@voyant-travel/admin"
import { useMemo, useState } from "react"

import {
  type ProductDetailBreadcrumb,
  ProductDetailHostProvider,
  type ProductDetailHostValue,
} from "../../components/product-detail/host.js"
import { ProductDetailPage } from "../../components/product-detail/product-detail-page.js"
import type { ProductMediaUploadHandler } from "../../components/product-media-section.js"
import { useVoyantProductsContext } from "../../provider.js"
import { createProductDetailRestApi } from "../product-detail-api.js"
import { productDetailOptionExtrasSlot } from "../slots.js"

/**
 * Packaged default for the `products-detail` contribution: binds the
 * canonical {@link ProductDetailPage} to its host wiring without any app
 * code — REST transport from the shared products provider context,
 * messages/locale/breadcrumbs from `@voyant-travel/admin`, navigation through
 * semantic destinations (RFC §4.7), and a media upload handler that posts
 * to the starter-level `/v1/admin/uploads` storage route.
 *
 * Cross-domain option content is supplied through the package-owned option
 * extras widget slot, so hosts do not replace this route page.
 */
export interface ProductDetailPageComponentProps {
  id: string
}

export default function ProductDetailDefaultPage({ id }: ProductDetailPageComponentProps) {
  const messages = useOperatorAdminMessages()
  const { resolvedLocale, supportedLocales } = useLocale()
  const navigateTo = useAdminNavigate()
  const { baseUrl, fetcher } = useVoyantProductsContext()
  const [breadcrumbs, setBreadcrumbs] = useState<ProductDetailBreadcrumb[]>([])
  useAdminBreadcrumbs(breadcrumbs)

  const api = useMemo(() => createProductDetailRestApi({ baseUrl, fetcher }), [baseUrl, fetcher])

  const navigation = useMemo<ProductDetailHostValue["navigate"]>(
    () => ({
      toProducts: () => navigateTo("product.list", {}),
      toProduct: (productId) => navigateTo("product.detail", { productId }),
      toAvailability: (slotId) => navigateTo("availabilitySlot.detail", { slotId }),
    }),
    [navigateTo],
  )

  const uploadMedia = useMemo<ProductMediaUploadHandler>(
    () => async (file) => {
      const dimensions = file.type.startsWith("image/") ? await readImageDimensions(file) : null
      const formData = new FormData()
      formData.append("file", file)
      const response = await fetcher(joinUrl(baseUrl, "/v1/admin/uploads"), {
        method: "POST",
        body: formData,
      })
      if (!response.ok) throw new Error(`Upload failed (${response.status})`)
      const upload = (await response.json()) as {
        key: string
        url: string
        mimeType: string
        size: number
      }
      const mediaType: "image" | "video" | "document" = upload.mimeType.startsWith("video/")
        ? "video"
        : upload.mimeType.startsWith("image/")
          ? "image"
          : "document"
      return {
        url: upload.url,
        name: file.name,
        storageKey: upload.key,
        mimeType: upload.mimeType,
        fileSize: upload.size,
        mediaType,
        width: dimensions?.width ?? null,
        height: dimensions?.height ?? null,
      }
    },
    [baseUrl, fetcher],
  )

  const host = useMemo<ProductDetailHostValue>(
    () => ({
      messages,
      api,
      locale: resolvedLocale,
      configuredLocales: supportedLocales,
      navigate: navigation,
      uploadMedia,
      setBreadcrumbs,
      renderOptionExtras: (productId, optionId) => (
        <AdminWidgetSlotRenderer
          slot={productDetailOptionExtrasSlot}
          props={{ productId, optionId }}
        />
      ),
    }),
    [messages, api, resolvedLocale, supportedLocales, navigation, uploadMedia],
  )

  return (
    <ProductDetailHostProvider value={host}>
      <ProductDetailPage id={id} />
    </ProductDetailHostProvider>
  )
}

async function readImageDimensions(file: File): Promise<{ width: number; height: number } | null> {
  try {
    const bitmap = await createImageBitmap(file)
    const dimensions = { width: bitmap.width, height: bitmap.height }
    bitmap.close()
    return dimensions
  } catch {
    return null
  }
}

function joinUrl(baseUrl: string, path: string): string {
  const trimmed = baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl
  return `${trimmed}${path}`
}
