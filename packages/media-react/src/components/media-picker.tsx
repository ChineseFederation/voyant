"use client"

import { Button } from "@voyant-travel/ui/components/button"
import { Dialog, DialogContent, DialogTrigger } from "@voyant-travel/ui/components/dialog"
import { Empty, EmptyHeader, EmptyTitle } from "@voyant-travel/ui/components/empty"
import { Skeleton } from "@voyant-travel/ui/components/skeleton"
import { cn } from "@voyant-travel/ui/lib/utils"
import type { ReactNode } from "react"
import * as React from "react"

import { useAssetUpload } from "../hooks/use-asset-upload.js"
import { useMediaAssets } from "../hooks/use-media-assets.js"
import { useMediaUiI18nOrDefault } from "../i18n/provider.js"
import { useVoyantMediaContext } from "../provider.js"
import type { MediaAssetsListFilters } from "../query-keys.js"
import type { MediaAsset, MediaAssetType } from "../schemas.js"
import { MediaAssetTile } from "./media-asset-tile.js"
import { MediaFiltersBar } from "./media-filters-bar.js"
import { MediaUploadDropzone } from "./media-upload-dropzone.js"
import { ACCEPT_BY_TYPE, defaultAssetUrl, inferAssetType } from "./shared.js"

export interface MediaPickerProps {
  /** Called with the chosen assets when the user confirms a selection. */
  onSelect: (assets: MediaAsset[]) => void
  /** Allow selecting more than one asset. Default single-select. */
  multiple?: boolean
  /** Restrict the picker to a single asset type. */
  type?: MediaAssetType
  /** Render the picker body inline instead of inside a modal dialog. */
  inline?: boolean
  /** Controlled open state (modal variant). */
  open?: boolean
  onOpenChange?: (open: boolean) => void
  /** Element that opens the modal (uncontrolled modal variant). */
  trigger?: ReactNode
  /** Resolve an asset's byte URL (defaults to the storage byte-serving route). */
  resolveAssetUrl?: (asset: MediaAsset) => string
  pageSize?: number
  className?: string
}

/**
 * Host-agnostic asset picker other surfaces embed. Supports single/multi
 * select, a locked or user-driven type filter, search, and inline upload that
 * lands in the library and auto-selects. Emits the chosen assets via
 * `onSelect`.
 */
export function MediaPicker({
  onSelect,
  multiple = false,
  type,
  inline = false,
  open,
  onOpenChange,
  trigger,
  resolveAssetUrl,
  pageSize = 40,
  className,
}: MediaPickerProps) {
  const body = (
    <MediaPickerBody
      onSelect={onSelect}
      multiple={multiple}
      type={type}
      resolveAssetUrl={resolveAssetUrl}
      pageSize={pageSize}
      onDone={() => onOpenChange?.(false)}
      className={className}
    />
  )

  if (inline) return body

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {trigger ? <DialogTrigger render={trigger as React.ReactElement} /> : null}
      <DialogContent className="sm:max-w-5xl">{body}</DialogContent>
    </Dialog>
  )
}

interface MediaPickerBodyProps {
  onSelect: (assets: MediaAsset[]) => void
  multiple: boolean
  type?: MediaAssetType
  resolveAssetUrl?: (asset: MediaAsset) => string
  pageSize: number
  onDone: () => void
  className?: string
}

function MediaPickerBody({
  onSelect,
  multiple,
  type,
  resolveAssetUrl,
  pageSize,
  onDone,
  className,
}: MediaPickerBodyProps) {
  const { messages, locale } = useMediaUiI18nOrDefault()
  const picker = messages.picker
  const { baseUrl } = useVoyantMediaContext()

  const [filters, setFilters] = React.useState<MediaAssetsListFilters>({})
  const [selected, setSelected] = React.useState<Map<string, MediaAsset>>(new Map())

  const upload = useAssetUpload()
  const query = useMediaAssets({
    ...filters,
    type: type ?? filters.type,
    limit: pageSize,
  })

  const assets = query.data?.data ?? []
  const urlFor = (asset: MediaAsset) => resolveAssetUrl?.(asset) ?? defaultAssetUrl(asset, baseUrl)

  const confirm = (chosen: MediaAsset[]) => {
    if (chosen.length === 0) return
    onSelect(chosen)
    onDone()
  }

  const pick = (asset: MediaAsset) => {
    if (!multiple) {
      confirm([asset])
      return
    }
    setSelected((prev) => {
      const next = new Map(prev)
      if (next.has(asset.id)) next.delete(asset.id)
      else next.set(asset.id, asset)
      return next
    })
  }

  const handleFiles = async (files: File[]) => {
    const uploaded: MediaAsset[] = []
    for (const file of files) {
      const result = await upload.mutateAsync({
        file,
        type: type ?? inferAssetType(file.type),
        name: file.name,
        defaultLanguageTag: locale,
        mimeType: file.type || undefined,
      })
      uploaded.push(result.data)
    }
    if (uploaded.length === 0) return
    if (!multiple) {
      confirm([uploaded[uploaded.length - 1] as MediaAsset])
      return
    }
    setSelected((prev) => {
      const next = new Map(prev)
      for (const asset of uploaded) next.set(asset.id, asset)
      return next
    })
  }

  return (
    <div className={cn("flex flex-col gap-4", className)} data-slot="media-picker">
      <h2 className="text-base font-semibold">{picker.title}</h2>

      <MediaFiltersBar value={filters} onChange={setFilters} hideType={Boolean(type)} compact />

      <MediaUploadDropzone
        onFiles={(files) => void handleFiles(files)}
        uploading={upload.isPending}
        accept={type ? ACCEPT_BY_TYPE[type] : undefined}
        multiple={multiple}
        compact
      />

      {query.isPending ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: fixed-length skeleton placeholder (voyant#3555)
            <Skeleton key={index} className="aspect-video rounded-md" />
          ))}
        </div>
      ) : query.isError ? (
        <p className="py-6 text-center text-sm text-destructive">{picker.loadingError}</p>
      ) : assets.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyTitle>{picker.empty}</EmptyTitle>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="grid max-h-[45vh] grid-cols-2 gap-3 overflow-y-auto sm:grid-cols-3 lg:grid-cols-4">
          {assets.map((asset) => (
            <MediaAssetTile
              key={asset.id}
              asset={asset}
              url={urlFor(asset)}
              selectable={multiple}
              selected={selected.has(asset.id)}
              languageTag={locale}
              onSelect={() => pick(asset)}
            />
          ))}
        </div>
      )}

      {multiple ? (
        <div className="flex items-center justify-between gap-2 border-t pt-3">
          <span className="text-sm text-muted-foreground">
            {picker.selectedCount.replace("{count}", String(selected.size))}
          </span>
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={onDone}>
              {picker.cancel}
            </Button>
            <Button
              type="button"
              disabled={selected.size === 0}
              onClick={() => confirm([...selected.values()])}
            >
              {picker.confirm}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
