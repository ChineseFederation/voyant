"use client"

import { cn } from "@voyant-travel/ui/lib/utils"
import { FileText, Film, ImageOff } from "lucide-react"
import * as React from "react"

import { type MediaAsset, resolveMediaAltText } from "../schemas.js"

export interface MediaAssetThumbnailProps {
  asset: MediaAsset
  url: string
  languageTag?: string
  className?: string
}

/**
 * Renders a preview appropriate to the asset kind: an `<img>` for images, a
 * muted `<video>` for videos, and a document glyph for everything else. Images
 * that fail to load (missing bytes, an undecodable file, or a security-downgraded
 * content type such as inline SVG) fall back to a muted icon instead of the
 * browser's broken-image glyph. Purely presentational — no user-facing copy (the
 * alt text comes from the asset).
 */
export function MediaAssetThumbnail({
  asset,
  url,
  languageTag,
  className,
}: MediaAssetThumbnailProps) {
  // Tiles are keyed by asset id, so a new asset remounts this component and
  // clears the error state — no reset effect needed.
  const [errored, setErrored] = React.useState(false)

  if (asset.type === "image" && !errored) {
    return (
      <img
        src={url}
        alt={resolveMediaAltText(asset, languageTag) ?? asset.name}
        className={cn("h-full w-full object-cover", className)}
        draggable={false}
        loading="lazy"
        onError={() => setErrored(true)}
      />
    )
  }

  const FallbackIcon = asset.type === "video" ? Film : asset.type === "image" ? ImageOff : FileText

  return (
    <div
      className={cn(
        "flex h-full w-full items-center justify-center bg-muted text-muted-foreground",
        className,
      )}
    >
      <FallbackIcon className="size-6" aria-hidden="true" />
    </div>
  )
}
