"use client"

import type { MediaAsset } from "@voyant-travel/media-react"
import { useAssetUpload } from "@voyant-travel/media-react/hooks"
import * as React from "react"
import type { ProductMediaUploadHandler } from "../components/product-media-section.js"
import { useVoyantProductsContext } from "../provider.js"
import type { ProductMediaRecord } from "../schemas.js"
import { useProductMediaMutation } from "./use-product-media-mutation.js"

/**
 * Mirror `defaultAssetUrl` from media-react: raw asset bytes are served by
 * `@voyant-travel/storage` at `GET /v1/admin/media/{storageKey}`. Slice A uses
 * the same convention for library-picked assets, so inline uploads that land in
 * the library must mirror it too.
 */
function assetByteUrl(baseUrl: string, asset: MediaAsset): string {
  if (asset.url) return asset.url
  const trimmed = baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl
  return `${trimmed}/v1/admin/media/${asset.storageKey}` // i18n-literal-ok byte-serving route
}

function inferMediaType(mimeType: string | null): ProductMediaRecord["mediaType"] {
  if (mimeType?.startsWith("video/")) return "video"
  if (mimeType?.startsWith("image/")) return "image"
  return "document"
}

export interface UploadProductMediaOptions {
  /** Product the media is attached to. */
  productId: string
  /** Optional day scope (null/undefined = product-level media). */
  dayId?: string
  /** Position of the new row within the current list. */
  sortOrder: number
  /** Assign the created row as the product/day cover. */
  isCover?: boolean
}

/**
 * Route an inline product-media upload through the Media Library.
 *
 * The file is uploaded via `useAssetUpload` (media-library admin API) so it
 * becomes a `media_asset` and shows up in the library, then attached to the
 * product as a `product_media` row that references the asset via `assetId`.
 *
 * When the media-react context is unavailable (or a host prefers its own
 * storage), the returned `upload` accepts an optional legacy `uploadMedia`
 * handler as a fallback; the library path is always preferred when possible.
 */
export function useProductMediaUpload() {
  const { baseUrl } = useVoyantProductsContext()
  const assetUpload = useAssetUpload()
  const { create } = useProductMediaMutation()

  const upload = React.useCallback(
    async (
      file: File,
      options: UploadProductMediaOptions,
      /** Legacy host storage handler; used only when provided as a fallback. */
      uploadMedia?: ProductMediaUploadHandler,
    ): Promise<ProductMediaRecord> => {
      const { productId, dayId, sortOrder, isCover } = options

      // Primary path: upload into the Media Library, then attach the asset.
      if (!uploadMedia) {
        const mimeType = file.type || undefined
        const type = inferMediaType(file.type || null)
        const { data: asset } = await assetUpload.mutateAsync({
          file,
          type,
          name: file.name,
          mimeType,
        })
        const resolvedType = inferMediaType(asset.mimeType)
        return create.mutateAsync({
          productId,
          dayId,
          mediaType: resolvedType,
          name: asset.name,
          url: assetByteUrl(baseUrl, asset),
          storageKey: asset.storageKey,
          mimeType: asset.mimeType,
          fileSize: asset.fileSize,
          width: asset.width,
          height: asset.height,
          altText: asset.altText,
          assetId: asset.id,
          sortOrder,
          isCover: resolvedType === "image" ? (isCover ?? false) : false,
        })
      }

      // Legacy fallback: host-provided storage handler that returns only a URL.
      const uploaded = await uploadMedia(file, { productId, dayId })
      const mimeType = uploaded.mimeType?.trim() || file.type || null
      const mediaType = uploaded.mediaType ?? inferMediaType(mimeType)
      return create.mutateAsync({
        productId,
        dayId,
        mediaType,
        name: uploaded.name?.trim() || file.name,
        url: uploaded.url,
        storageKey: uploaded.storageKey ?? null,
        mimeType,
        fileSize: uploaded.fileSize ?? (file.size || null),
        width: uploaded.width ?? null,
        height: uploaded.height ?? null,
        altText: uploaded.altText ?? null,
        assetId: null,
        sortOrder: uploaded.sortOrder ?? sortOrder,
        isCover: mediaType === "image" ? (uploaded.isCover ?? isCover ?? false) : false,
      })
    },
    [assetUpload, baseUrl, create],
  )

  return { upload, isUploading: assetUpload.isPending || create.isPending }
}
