"use client"

import { Badge } from "@voyant-travel/ui/components/badge"
import { cn } from "@voyant-travel/ui/lib/utils"
import { Check } from "lucide-react"

import { useMediaUiMessagesOrDefault } from "../i18n/provider.js"
import { type MediaAsset, resolveMediaAltText } from "../schemas.js"
import { MediaAssetThumbnail } from "./media-asset-thumbnail.js"

export interface MediaAssetTileProps {
  asset: MediaAsset
  url: string
  selected?: boolean
  onSelect: () => void
  languageTag?: string
  /** Show a selection check affordance (picker / multi-select surfaces). */
  selectable?: boolean
}

/** A single asset card in the grid — the shared tile for the library and picker. */
export function MediaAssetTile({
  asset,
  url,
  selected,
  onSelect,
  languageTag,
  selectable,
}: MediaAssetTileProps) {
  const messages = useMediaUiMessagesOrDefault()
  const typeLabel = messages.common.mediaTypeLabels[asset.type]
  const altText = resolveMediaAltText(asset, languageTag)

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      data-slot="media-asset-tile"
      className={cn(
        "group relative flex flex-col overflow-hidden rounded-md border bg-background text-left transition hover:border-ring focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
        selected && "border-primary ring-2 ring-primary",
      )}
    >
      <div className="relative aspect-video bg-muted">
        <MediaAssetThumbnail asset={asset} url={url} languageTag={languageTag} />
        <Badge variant="secondary" className="absolute top-2 right-2 bg-background/90">
          {typeLabel}
        </Badge>
        {selectable && selected ? (
          <span className="absolute top-2 left-2 flex size-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
            <Check className="size-3" aria-hidden="true" />
          </span>
        ) : null}
      </div>
      <div className="min-w-0 space-y-0.5 p-2.5">
        <div className="truncate text-sm font-medium">{asset.name}</div>
        {altText ? <div className="truncate text-xs text-muted-foreground">{altText}</div> : null}
      </div>
    </button>
  )
}
