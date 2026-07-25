"use client"

import type { MediaAsset } from "@voyant-travel/media-react"
import { MediaPicker } from "@voyant-travel/media-react/ui"
import { confirmDialog } from "@voyant-travel/ui/components"
import { Button } from "@voyant-travel/ui/components/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@voyant-travel/ui/components/card"
import { cn } from "@voyant-travel/ui/lib/utils"
import { GripVertical, ImageIcon, Loader2, Plus, Upload } from "lucide-react"
import * as React from "react"
import { useProductMediaUpload } from "../hooks/use-product-media-upload.js"
import { useProductsUiMessagesOrDefault } from "../i18n/provider.js"
import { type ProductMediaRecord, useProductMedia, useProductMediaMutation } from "../index.js"
import { useVoyantProductsContext } from "../provider.js"
import { ProductMediaDialog } from "./product-media-dialog.js"
import { MediaLightbox } from "./product-media-lightbox.js"
import { MediaTile } from "./product-media-tile.js"

export interface ProductMediaUploadResult {
  url: string
  name?: string
  mediaType?: ProductMediaRecord["mediaType"]
  storageKey?: string | null
  mimeType?: string | null
  fileSize?: number | null
  width?: number | null
  height?: number | null
  altText?: string | null
  sortOrder?: number
  isCover?: boolean
}

export type ProductMediaUploadHandler = (
  file: File,
  context: { productId: string; dayId?: string },
) => Promise<ProductMediaUploadResult> // i18n-literal-ok type signature

export interface ProductMediaSectionProps {
  productId: string
  dayId?: string
  title?: string
  description?: string
  compact?: boolean
  uploadMedia?: ProductMediaUploadHandler
  uploadAccept?: string
}

export function ProductMediaSection({
  productId,
  dayId,
  title,
  description,
  compact = false,
  uploadMedia,
  uploadAccept = "image/*,video/*,application/pdf",
}: ProductMediaSectionProps) {
  const messages = useProductsUiMessagesOrDefault()
  const sectionMessages = messages.productMediaSection
  const [dialogOpen, setDialogOpen] = React.useState(false)
  const [pickerOpen, setPickerOpen] = React.useState(false)
  const [editingMedia, setEditingMedia] = React.useState<ProductMediaRecord | undefined>()
  const [isUploading, setIsUploading] = React.useState(false)
  const [uploadError, setUploadError] = React.useState<string | null>(null)
  const { upload } = useProductMediaUpload()
  const [reorderMode, setReorderMode] = React.useState(false)
  const [localOrder, setLocalOrder] = React.useState<ProductMediaRecord[]>([])
  const [draggedId, setDraggedId] = React.useState<string | null>(null)
  const [lightboxIndex, setLightboxIndex] = React.useState<number | null>(null)
  const fileInputRef = React.useRef<HTMLInputElement>(null)
  const { baseUrl } = useVoyantProductsContext()
  const { data, isPending, isError } = useProductMedia(productId, { dayId, limit: 100 })
  const { create, remove, reorder, setCover } = useProductMediaMutation()

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

  React.useEffect(() => {
    if (!reorderMode) setLocalOrder(media)
  }, [media, reorderMode])

  const visibleMedia = reorderMode ? localOrder : media
  const resolvedTitle =
    title ?? (dayId ? sectionMessages.titles.dayMedia : sectionMessages.titles.media)
  const resolvedDescription =
    description ??
    (dayId ? sectionMessages.descriptions.dayMedia : sectionMessages.descriptions.media)

  const handleUpload = async (file: File) => {
    setUploadError(null)
    setIsUploading(true)

    try {
      await upload(
        file,
        {
          productId,
          dayId,
          sortOrder: media.length,
          isCover: !media.some((item) => item.isCover),
        },
        uploadMedia,
      )
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : sectionMessages.uploadFailed)
    } finally {
      setIsUploading(false)
    }
  }

  // Mirror `defaultAssetUrl` from media-react: raw asset bytes are served by
  // `@voyant-travel/storage` at `GET /v1/admin/media/{storageKey}`.
  const assetByteUrl = (asset: MediaAsset) => {
    if (asset.url) return asset.url
    const trimmed = baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl
    return `${trimmed}/v1/admin/media/${asset.storageKey}` // i18n-literal-ok byte-serving route
  }

  const handleSelectFromLibrary = async (assets: MediaAsset[]) => {
    if (assets.length === 0) return
    setUploadError(null)
    try {
      let coverAssigned = media.some((item) => item.isCover)
      for (const [offset, asset] of assets.entries()) {
        const isImage = asset.type === "image"
        const assignCover = isImage && !coverAssigned
        if (assignCover) coverAssigned = true
        await create.mutateAsync({
          productId,
          dayId,
          mediaType: asset.type,
          name: asset.name,
          url: assetByteUrl(asset),
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
      setUploadError(error instanceof Error ? error.message : sectionMessages.libraryAddFailed)
    }
  }

  const moveMedia = (sourceId: string, targetId: string) => {
    if (sourceId === targetId) return
    setLocalOrder((items) => {
      const sourceIndex = items.findIndex((item) => item.id === sourceId)
      const targetIndex = items.findIndex((item) => item.id === targetId)
      if (sourceIndex < 0 || targetIndex < 0) return items
      const next = items.slice()
      const [moved] = next.splice(sourceIndex, 1)
      if (!moved) return items
      next.splice(targetIndex, 0, moved)
      return next
    })
  }

  const commitReorder = async () => {
    await reorder.mutateAsync({
      productId,
      items: localOrder.map((item, index) => ({ id: item.id, sortOrder: index })),
    })
    setReorderMode(false)
  }

  const cancelReorder = () => {
    setLocalOrder(media)
    setReorderMode(false)
    setDraggedId(null)
  }

  const header = (
    <div className="space-y-1">
      <CardTitle className={compact ? "text-base" : undefined}>{resolvedTitle}</CardTitle>
      <CardDescription>{resolvedDescription}</CardDescription>
    </div>
  )

  const actions = (
    <div className="flex flex-wrap items-center gap-2">
      {media.length > 1 ? (
        reorderMode ? (
          <>
            <Button
              type="button"
              variant="outline"
              size={compact ? "sm" : "default"}
              onClick={cancelReorder}
              disabled={reorder.isPending}
            >
              {sectionMessages.actions.cancelReorder}
            </Button>
            <Button
              type="button"
              size={compact ? "sm" : "default"}
              onClick={() => void commitReorder()}
              disabled={reorder.isPending}
            >
              {reorder.isPending ? (
                <Loader2 className="mr-2 size-4 animate-spin" aria-hidden="true" />
              ) : null}
              {sectionMessages.actions.saveOrder}
            </Button>
          </>
        ) : (
          <Button
            type="button"
            variant="outline"
            size={compact ? "sm" : "default"}
            onClick={() => {
              setLocalOrder(media)
              setReorderMode(true)
            }}
          >
            <GripVertical className="mr-2 size-4" aria-hidden="true" />
            {sectionMessages.actions.reorder}
          </Button>
        )
      ) : null}
      <Button
        type="button"
        variant={compact ? "outline" : "secondary"}
        size={compact ? "sm" : "default"}
        disabled={isUploading || reorderMode}
        onClick={() => fileInputRef.current?.click()}
      >
        {isUploading ? (
          <Loader2 className="mr-2 size-4 animate-spin" aria-hidden="true" />
        ) : (
          <Upload className="mr-2 size-4" aria-hidden="true" />
        )}
        {sectionMessages.actions.upload}
      </Button>
      <input
        ref={fileInputRef}
        type="file"
        accept={uploadAccept}
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0]
          if (file) {
            void handleUpload(file)
            event.target.value = ""
          }
        }}
      />
      <Button
        type="button"
        variant="outline"
        size={compact ? "sm" : "default"}
        disabled={reorderMode}
        onClick={() => setPickerOpen(true)}
      >
        <ImageIcon className="mr-2 size-4" aria-hidden="true" />
        {sectionMessages.actions.chooseFromLibrary}
      </Button>
      <Button
        type="button"
        size={compact ? "sm" : "default"}
        disabled={reorderMode}
        onClick={() => {
          setEditingMedia(undefined)
          setDialogOpen(true)
        }}
      >
        <Plus className="mr-2 size-4" aria-hidden="true" />
        {sectionMessages.actions.addMedia}
      </Button>
    </div>
  )

  const body = (
    <>
      {uploadError ? <p className="text-sm text-destructive">{uploadError}</p> : null}
      {isPending ? (
        <div className="flex min-h-40 items-center justify-center rounded-md border border-dashed">
          <Loader2 className="size-4 animate-spin text-muted-foreground" aria-hidden="true" />
        </div>
      ) : isError ? (
        <p className="text-sm text-destructive">{sectionMessages.loadingError}</p>
      ) : media.length === 0 ? (
        <div className="flex min-h-40 items-center justify-center rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
          {sectionMessages.empty}
        </div>
      ) : (
        <>
          <div className="text-xs text-muted-foreground">
            {sectionMessages.itemCount.replace("{count}", String(media.length))}
          </div>
          <ul
            className={cn(
              "m-0 grid list-none gap-3 p-0",
              compact
                ? "grid-cols-2" /* i18n-literal-ok CSS class token */
                : "sm:grid-cols-2 2xl:grid-cols-3" /* i18n-literal-ok CSS class token */,
            )}
          >
            {visibleMedia.map((item, index) => (
              <MediaTile
                key={item.id}
                item={item}
                index={index}
                compact={compact}
                reorderMode={reorderMode}
                dragging={draggedId === item.id}
                onOpen={() => setLightboxIndex(index)}
                onEdit={() => {
                  setEditingMedia(item)
                  setDialogOpen(true)
                }}
                onSetCover={() => setCover.mutate(item.id)}
                onDelete={async () => {
                  if (
                    await confirmDialog({
                      description: sectionMessages.deleteConfirm,
                      destructive: true,
                    })
                  ) {
                    remove.mutate(item.id)
                  }
                }}
                onDragStart={() => setDraggedId(item.id)}
                onDragOver={(event) => {
                  event.preventDefault()
                  if (draggedId) moveMedia(draggedId, item.id)
                }}
                onDrop={() => setDraggedId(null)}
              />
            ))}
          </ul>
        </>
      )}
    </>
  )

  return (
    <>
      {compact ? (
        <div
          data-slot="product-media-section"
          className="flex flex-col gap-3 rounded-md border bg-background p-3"
        >
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            {header}
            {actions}
          </div>
          {body}
        </div>
      ) : (
        <Card data-slot="product-media-section">
          <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            {header}
            {actions}
          </CardHeader>
          <CardContent className="space-y-3">{body}</CardContent>
        </Card>
      )}

      <ProductMediaDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        productId={productId}
        dayId={dayId}
        media={editingMedia}
        onSuccess={() => setEditingMedia(undefined)}
      />
      <MediaLightbox
        media={visibleMedia}
        index={lightboxIndex}
        onClose={() => setLightboxIndex(null)}
      />
      <MediaPicker
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        multiple
        resolveAssetUrl={assetByteUrl}
        onSelect={(assets) => void handleSelectFromLibrary(assets)}
      />
    </>
  )
}
