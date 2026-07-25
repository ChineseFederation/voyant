"use client"

import type { MediaAsset } from "@voyant-travel/media-react"
import { MediaPicker } from "@voyant-travel/media-react/ui"
import { confirmDialog } from "@voyant-travel/ui/components"
import { Badge } from "@voyant-travel/ui/components/badge"
import { Button } from "@voyant-travel/ui/components/button"
import { ImageIcon, Loader2, Pencil, Plus, Star, Trash2, Upload } from "lucide-react"
import * as React from "react"
import { useProductsUiMessagesOrDefault } from "../i18n/provider.js"
import { type ProductMediaRecord, useProductMedia, useProductMediaMutation } from "../index.js"
import { ProductMediaDialog } from "./product-media-dialog.js"
import type { ProductMediaUploadHandler } from "./product-media-section.js"

export interface ProductDayMediaTrayProps {
  productId: string
  dayId: string
  uploadMedia?: ProductMediaUploadHandler
  uploadAccept?: string
  emptyState?: React.ReactNode
}

export function ProductDayMediaTray({ productId, dayId, emptyState }: ProductDayMediaTrayProps) {
  const messages = useProductsUiMessagesOrDefault()
  const [dialogOpen, setDialogOpen] = React.useState(false)
  const [pickerOpen, setPickerOpen] = React.useState(false)
  const [editingMedia, setEditingMedia] = React.useState<ProductMediaRecord | undefined>()
  const [uploadError, setUploadError] = React.useState<string | null>(null)
  const { data, isPending, isError } = useProductMedia(productId, { dayId, limit: 50 })
  const { create, remove, setCover } = useProductMediaMutation()

  const media = React.useMemo(
    () =>
      (data?.data ?? [])
        .slice()
        .sort(
          (left, right) =>
            Number(right.isCover) - Number(left.isCover) || left.sortOrder - right.sortOrder,
        ),
    [data?.data],
  )

  const handleSelectFromLibrary = async (assets: MediaAsset[]) => {
    if (assets.length === 0) return
    setUploadError(null)
    try {
      let coverAssigned = media.some((item) => item.isCover)
      for (const [offset, asset] of assets.entries()) {
        const assignCover = asset.type === "image" && !coverAssigned
        if (assignCover) coverAssigned = true
        await create.mutateAsync({
          productId,
          dayId,
          mediaType: asset.type,
          name: asset.name,
          url: asset.url ?? `/api/v1/admin/media/${asset.storageKey}`,
          storageKey: asset.storageKey,
          mimeType: asset.mimeType,
          fileSize: asset.fileSize,
          width: asset.width,
          height: asset.height,
          altText: asset.altText,
          assetId: asset.id,
          sortOrder: media.length + offset,
          isCover: assignCover,
        })
      }
    } catch (error) {
      setUploadError(
        error instanceof Error ? error.message : messages.productMediaSection.libraryAddFailed,
      )
    }
  }

  return (
    <div data-slot="product-day-media-tray" className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <div className="text-sm font-medium">{messages.productMediaSection.titles.dayMedia}</div>
        <div className="flex items-center gap-1">
          <Button type="button" variant="outline" size="sm" onClick={() => setPickerOpen(true)}>
            <Upload className="mr-2 size-4" aria-hidden="true" />
            {messages.productMediaSection.actions.upload}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              setEditingMedia(undefined)
              setDialogOpen(true)
            }}
          >
            <Plus className="mr-2 size-4" aria-hidden="true" />
            {messages.productMediaSection.actions.addMedia}
          </Button>
        </div>
      </div>

      {uploadError ? <p className="text-sm text-destructive">{uploadError}</p> : null}
      {isPending ? (
        <div className="flex min-h-20 items-center justify-center rounded-md border border-dashed">
          <Loader2 className="size-4 animate-spin text-muted-foreground" />
        </div>
      ) : isError ? (
        <p className="text-sm text-destructive">{messages.productMediaSection.loadingError}</p>
      ) : media.length === 0 ? (
        <div className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
          {emptyState ?? messages.productMediaSection.empty}
        </div>
      ) : (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {media.map((item) => (
            <div key={item.id} className="w-36 shrink-0 rounded-md border bg-background">
              {item.mediaType === "image" ? (
                <img
                  src={item.url}
                  alt={item.altText ?? item.name}
                  className="h-20 w-full rounded-t-md object-cover"
                />
              ) : (
                <div className="flex h-20 w-full items-center justify-center rounded-t-md bg-muted text-muted-foreground">
                  <ImageIcon className="size-5" aria-hidden="true" />
                </div>
              )}
              <div className="space-y-2 p-2">
                <div className="truncate text-xs font-medium">{item.name}</div>
                <div className="flex items-center justify-between gap-1">
                  {item.isCover && item.mediaType === "image" ? (
                    <Badge className="text-[10px]">{messages.productMediaSection.coverBadge}</Badge>
                  ) : item.mediaType === "image" ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => setCover.mutate(item.id)}
                      aria-label={messages.productMediaSection.actions.markCover}
                    >
                      <Star className="size-4" aria-hidden="true" />
                    </Button>
                  ) : null}
                  <div className="flex items-center gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => {
                        setEditingMedia(item)
                        setDialogOpen(true)
                      }}
                      aria-label={messages.productMediaSection.actions.edit}
                    >
                      <Pencil className="size-4" aria-hidden="true" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      onClick={async () => {
                        if (
                          await confirmDialog({
                            description: messages.productMediaSection.deleteConfirm,
                            destructive: true,
                          })
                        ) {
                          remove.mutate(item.id)
                        }
                      }}
                      aria-label={messages.productMediaSection.actions.delete}
                    >
                      <Trash2 className="size-4" aria-hidden="true" />
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <ProductMediaDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        productId={productId}
        dayId={dayId}
        media={editingMedia}
        onSuccess={() => setEditingMedia(undefined)}
      />

      <MediaPicker
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        multiple
        resolveAssetUrl={(asset) => `/api/v1/admin/media/${asset.storageKey}`}
        onSelect={(assets) => {
          setPickerOpen(false)
          void handleSelectFromLibrary(assets)
        }}
      />
    </div>
  )
}
