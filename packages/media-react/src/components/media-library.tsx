"use client"

import { Button } from "@voyant-travel/ui/components/button"
import { Card, CardContent } from "@voyant-travel/ui/components/card"
import { Empty, EmptyHeader, EmptyTitle } from "@voyant-travel/ui/components/empty"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@voyant-travel/ui/components/sheet"
import { Skeleton } from "@voyant-travel/ui/components/skeleton"
import { cn } from "@voyant-travel/ui/lib/utils"
import { LayoutGrid, List } from "lucide-react"
import * as React from "react"

import { useAssetUpload } from "../hooks/use-asset-upload.js"
import { useMediaAssets } from "../hooks/use-media-assets.js"
import { useMediaUiI18nOrDefault } from "../i18n/provider.js"
import { useVoyantMediaContext } from "../provider.js"
import type { MediaAssetsListFilters } from "../query-keys.js"
import type { MediaAsset, MediaAssetType } from "../schemas.js"
import { MediaAssetDetailPanel } from "./media-asset-detail-panel.js"
import { MediaAssetThumbnail } from "./media-asset-thumbnail.js"
import { MediaAssetTile } from "./media-asset-tile.js"
import { MediaFiltersBar } from "./media-filters-bar.js"
import { MediaFolderSidebar } from "./media-folder-sidebar.js"
import { MediaUploadDropzone } from "./media-upload-dropzone.js"
import { ACCEPT_BY_TYPE, defaultAssetUrl, inferAssetType } from "./shared.js"

export interface MediaLibraryProps {
  /**
   * Resolve an asset's byte URL. Defaults to the storage byte-serving route
   * (`{baseUrl}/v1/admin/media/{storageKey}`); override for a CDN/origin.
   */
  resolveAssetUrl?: (asset: MediaAsset) => string
  /** Restrict the whole surface to a single asset type. */
  type?: MediaAssetType
  /** Assets fetched per page (default 60). */
  pageSize?: number
  className?: string
}

type ViewMode = "grid" | "list"

/**
 * The full media-library browse surface: folder rail, filters, upload dropzone,
 * an asset grid/list, and a detail panel for the selected asset.
 */
export function MediaLibrary({
  resolveAssetUrl,
  type,
  pageSize = 60,
  className,
}: MediaLibraryProps) {
  const { messages, locale } = useMediaUiI18nOrDefault()
  const library = messages.library
  const { baseUrl } = useVoyantMediaContext()

  const [filters, setFilters] = React.useState<MediaAssetsListFilters>({})
  const [folderId, setFolderId] = React.useState<string | undefined>()
  const [selectedId, setSelectedId] = React.useState<string | undefined>()
  const [view, setView] = React.useState<ViewMode>("grid")

  const upload = useAssetUpload()
  const query = useMediaAssets({
    ...filters,
    type: type ?? filters.type,
    folderId,
    limit: pageSize,
  })

  const assets = query.data?.data ?? []
  const selected = assets.find((asset) => asset.id === selectedId)
  const urlFor = React.useCallback(
    (asset: MediaAsset) => resolveAssetUrl?.(asset) ?? defaultAssetUrl(asset, baseUrl),
    [resolveAssetUrl, baseUrl],
  )

  const handleFiles = (files: File[]) => {
    for (const file of files) {
      upload.mutate({
        file,
        type: type ?? inferAssetType(file.type),
        name: file.name,
        defaultLanguageTag: locale,
        mimeType: file.type || undefined,
        folderIds: folderId ? [folderId] : undefined,
      })
    }
  }

  return (
    <div className={cn("flex flex-col gap-6", className)} data-slot="media-library">
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold">{library.title}</h2>
        <p className="text-sm text-muted-foreground">{library.description}</p>
      </div>

      <div className="flex gap-4">
        <MediaFolderSidebar selectedFolderId={folderId} onSelectFolder={setFolderId} />

        <div className="flex min-w-0 flex-1 flex-col gap-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <MediaFiltersBar value={filters} onChange={setFilters} hideType={Boolean(type)} />
            <div className="flex items-center gap-1">
              <Button
                type="button"
                variant={view === "grid" ? "secondary" : "ghost"}
                size="icon-sm"
                aria-label={library.view.grid}
                aria-pressed={view === "grid"}
                onClick={() => setView("grid")}
              >
                <LayoutGrid className="size-4" aria-hidden="true" />
              </Button>
              <Button
                type="button"
                variant={view === "list" ? "secondary" : "ghost"}
                size="icon-sm"
                aria-label={library.view.list}
                aria-pressed={view === "list"}
                onClick={() => setView("list")}
              >
                <List className="size-4" aria-hidden="true" />
              </Button>
            </div>
          </div>

          <MediaUploadDropzone
            onFiles={handleFiles}
            uploading={upload.isPending}
            accept={type ? ACCEPT_BY_TYPE[type] : undefined}
          />

          {query.isPending ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
              {Array.from({ length: 8 }).map((_, index) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: fixed-length skeleton placeholder (voyant#3555)
                <Skeleton key={index} className="aspect-video rounded-md" />
              ))}
            </div>
          ) : query.isError ? (
            <Card>
              <CardContent className="flex flex-col items-center gap-3 py-8 text-center">
                <p className="text-sm text-destructive">{library.loadingError}</p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => void query.refetch()}
                >
                  {messages.common.retry}
                </Button>
              </CardContent>
            </Card>
          ) : assets.length === 0 ? (
            <Empty>
              <EmptyHeader>
                <EmptyTitle>{library.empty}</EmptyTitle>
              </EmptyHeader>
            </Empty>
          ) : (
            <div className="flex flex-col gap-2">
              <p className="text-xs text-muted-foreground">
                {library.itemCount.replace("{count}", String(query.data?.total ?? assets.length))}
              </p>
              {view === "grid" ? (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
                  {assets.map((asset) => (
                    <MediaAssetTile
                      key={asset.id}
                      asset={asset}
                      url={urlFor(asset)}
                      selected={asset.id === selectedId}
                      languageTag={locale}
                      onSelect={() => setSelectedId(asset.id)}
                    />
                  ))}
                </div>
              ) : (
                <ul className="flex flex-col divide-y rounded-md border">
                  {assets.map((asset) => (
                    <li key={asset.id}>
                      <button
                        type="button"
                        onClick={() => setSelectedId(asset.id)}
                        aria-pressed={asset.id === selectedId}
                        className={cn(
                          "flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-muted",
                          asset.id === selectedId && "bg-muted",
                        )}
                      >
                        <span className="size-10 shrink-0 overflow-hidden rounded-sm border">
                          <MediaAssetThumbnail
                            asset={asset}
                            url={urlFor(asset)}
                            languageTag={locale}
                          />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium">{asset.name}</span>
                          <span className="block truncate text-xs text-muted-foreground">
                            {messages.common.mediaTypeLabels[asset.type]}
                          </span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      </div>

      <Sheet
        open={Boolean(selected)}
        onOpenChange={(open) => {
          if (!open) setSelectedId(undefined)
        }}
      >
        <SheetContent side="right" className="w-full gap-0 p-0 sm:max-w-md">
          {selected ? (
            <>
              <SheetHeader className="border-b">
                <SheetTitle className="truncate">{selected.name}</SheetTitle>
                <SheetDescription>{library.detail.title}</SheetDescription>
              </SheetHeader>
              <div className="min-h-0 flex-1 overflow-y-auto p-4">
                <MediaAssetDetailPanel
                  asset={selected}
                  currentFolderId={folderId}
                  onDeleted={() => setSelectedId(undefined)}
                />
              </div>
            </>
          ) : null}
        </SheetContent>
      </Sheet>
    </div>
  )
}
