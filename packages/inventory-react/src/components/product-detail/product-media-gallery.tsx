"use client"

import { useMutation } from "@tanstack/react-query"
import { formatMessage } from "@voyant-travel/i18n"
import type { MediaAsset } from "@voyant-travel/media-react"
import { MediaPicker } from "@voyant-travel/media-react/ui"
import { Button, confirmDialog } from "@voyant-travel/ui/components"
import {
  Carousel,
  type CarouselApi,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@voyant-travel/ui/components/carousel"
import { Dialog, DialogContent, DialogTitle } from "@voyant-travel/ui/components/dialog"
import { Image as MediaImage } from "@voyant-travel/ui/components/image"
import { cn } from "@voyant-travel/ui/lib/utils"
import {
  ChevronLeft,
  ChevronRight,
  GripVertical,
  Loader2,
  Star,
  Trash2,
  Upload,
  X,
} from "lucide-react"
import { Reorder } from "motion/react"
import { useEffect, useRef, useState } from "react"
import { type ProductDetailApi, useProductDetailApi, useProductDetailMessages } from "./host.js"
import type { ProductMediaItem } from "./product-detail-shared.js"

interface ProductMediaGalleryProps {
  productId: string
  media: ProductMediaItem[]
  isUploading: boolean
  onUpload: (file: File) => void
  /**
   * When provided, the "Upload" action opens the media library picker (select
   * existing assets or upload new ones) instead of a bare file input.
   */
  onSelectFromLibrary?: (assets: MediaAsset[]) => void
  onSetCover: (mediaId: string) => void
  onDelete: (mediaId: string) => void
  onReorderLocal?: (items: ProductMediaItem[]) => void
}

/**
 * Media block for product + itinerary-day photos.
 * - Featured carousel with prev/next, click-to-lightbox
 * - Reorder-mode toggle exposes draggable thumbnail row (motion Reorder)
 * - Per-tile actions: set cover, delete
 */
export function ProductMediaGallery({
  productId,
  media,
  isUploading,
  onUpload,
  onSelectFromLibrary,
  onSetCover,
  onDelete,
  onReorderLocal,
}: ProductMediaGalleryProps) {
  const messages = useProductDetailMessages()
  const api = useProductDetailApi()
  const mediaMessages = messages.products.operations.media
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [carouselApi, setCarouselApi] = useState<CarouselApi>()
  const [active, setActive] = useState(0)
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)
  const [reorderMode, setReorderMode] = useState(false)
  const [localOrder, setLocalOrder] = useState<ProductMediaItem[]>(media)

  // Keep local order in sync with props unless we're actively reordering.
  useEffect(() => {
    if (!reorderMode) setLocalOrder(media)
  }, [media, reorderMode])

  useEffect(() => {
    if (!carouselApi) return
    const onSelect = () => setActive(carouselApi.selectedScrollSnap())
    onSelect()
    carouselApi.on("select", onSelect)
    return () => {
      carouselApi.off("select", onSelect)
    }
  }, [carouselApi])

  const reorderMutation = useMutation({
    mutationFn: (items: { id: string; sortOrder: number }[]) =>
      api_post_reorder(api, productId, items),
  })

  const commitReorder = () => {
    const items = localOrder.map((m, i) => ({ id: m.id, sortOrder: i }))
    reorderMutation.mutate(items, {
      onSuccess: () => {
        setReorderMode(false)
        onReorderLocal?.(localOrder)
      },
    })
  }

  const cancelReorder = () => {
    setLocalOrder(media)
    setReorderMode(false)
  }

  return (
    <>
      <div className="flex items-center justify-between">
        <div className="text-xs text-muted-foreground">
          {media.length === 0
            ? mediaMessages.emptySummary
            : formatMessage(mediaMessages.itemCount, {
                count: media.length,
                suffix: media.length === 1 ? "" : "s",
              })}
        </div>
        <div className="flex items-center gap-2">
          {media.length > 1 ? (
            reorderMode ? (
              <>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 text-xs"
                  onClick={cancelReorder}
                  disabled={reorderMutation.isPending}
                >
                  {mediaMessages.cancelReorder}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  className="h-8 text-xs"
                  onClick={commitReorder}
                  disabled={reorderMutation.isPending}
                >
                  {reorderMutation.isPending ? (
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  ) : null}
                  {mediaMessages.saveOrder}
                </Button>
              </>
            ) : (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 text-xs"
                onClick={() => setReorderMode(true)}
              >
                <GripVertical className="mr-1.5 h-3.5 w-3.5" />
                {mediaMessages.reorder}
              </Button>
            )
          ) : null}
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 text-xs"
            disabled={isUploading || reorderMode}
            onClick={() =>
              onSelectFromLibrary ? setPickerOpen(true) : fileInputRef.current?.click()
            }
          >
            {isUploading ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Upload className="mr-1.5 h-3.5 w-3.5" />
            )}
            {mediaMessages.upload}
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,video/*"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0]
              if (file) {
                onUpload(file)
                event.target.value = ""
              }
            }}
          />
        </div>
      </div>

      {media.length === 0 ? (
        <div className="flex h-40 items-center justify-center rounded-lg border border-dashed text-sm text-muted-foreground">
          {mediaMessages.emptyState}
        </div>
      ) : reorderMode ? (
        <ReorderGrid items={localOrder} onReorder={setLocalOrder} mediaMessages={mediaMessages} />
      ) : (
        <div className="flex flex-col gap-3">
          <Carousel setApi={setCarouselApi} opts={{ align: "start" }} className="w-full">
            <CarouselContent>
              {media.map((item, idx) => (
                <CarouselItem key={item.id}>
                  <MediaPreview
                    item={item}
                    onOpen={() => setLightboxIndex(idx)}
                    onSetCover={onSetCover}
                    onDelete={onDelete}
                    mediaMessages={mediaMessages}
                  />
                </CarouselItem>
              ))}
            </CarouselContent>
            {media.length > 1 ? (
              <>
                <CarouselPrevious className="left-2 size-8" />
                <CarouselNext className="right-2 size-8" />
              </>
            ) : null}
          </Carousel>

          {media.length > 1 ? (
            <div className="flex gap-2 overflow-x-auto pb-1">
              {media.map((item, idx) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => carouselApi?.scrollTo(idx)}
                  className={cn(
                    "relative size-16 flex-shrink-0 overflow-hidden rounded border transition-all",
                    idx === active
                      ? "border-primary ring-2 ring-primary/30"
                      : "border-border opacity-60 hover:opacity-100",
                  )}
                >
                  {item.mediaType === "image" ? (
                    <MediaImage
                      src={item.url}
                      alt={item.altText ?? item.name}
                      className="h-full w-full object-cover"
                      iconClassName="size-4"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center bg-muted text-[9px] uppercase text-muted-foreground">
                      {item.mediaType}
                    </div>
                  )}
                  {item.isCover && item.mediaType === "image" ? (
                    <Star className="absolute left-0.5 top-0.5 h-3 w-3 fill-yellow-400 text-yellow-400" />
                  ) : null}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      )}

      <Lightbox
        media={media}
        index={lightboxIndex}
        onClose={() => setLightboxIndex(null)}
        mediaMessages={mediaMessages}
      />

      {onSelectFromLibrary ? (
        <MediaPicker
          open={pickerOpen}
          onOpenChange={setPickerOpen}
          multiple
          resolveAssetUrl={(asset) => `/api/v1/admin/media/${asset.storageKey}`}
          onSelect={(assets) => {
            setPickerOpen(false)
            if (assets.length > 0) onSelectFromLibrary(assets)
          }}
        />
      ) : null}
    </>
  )
}

function MediaPreview({
  item,
  onOpen,
  onSetCover,
  onDelete,
  mediaMessages,
}: {
  item: ProductMediaItem
  onOpen: () => void
  onSetCover: (id: string) => void
  onDelete: (id: string) => void
  mediaMessages: ReturnType<typeof useProductDetailMessages>["products"]["operations"]["media"]
}) {
  const isImageCover = item.mediaType === "image" && item.isCover

  return (
    <div className="group relative aspect-[16/9] w-full overflow-hidden rounded-lg border bg-muted">
      {item.mediaType === "image" ? (
        <button type="button" onClick={onOpen} className="h-full w-full">
          <MediaImage
            src={item.url}
            alt={item.altText ?? item.name}
            className="h-full w-full cursor-zoom-in object-cover"
          />
        </button>
      ) : item.mediaType === "video" ? (
        // biome-ignore lint/a11y/useMediaCaption: Admin preview renders uploaded product media and the current model does not provide caption tracks. -- owner: inventory-react; existing suppression is intentional pending typed cleanup.
        <video src={item.url} controls className="h-full w-full object-cover" />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-xs uppercase text-muted-foreground">
          {item.mediaType}
        </div>
      )}
      {isImageCover ? (
        <div className="pointer-events-none absolute left-3 top-3 flex items-center gap-1 rounded-full bg-black/70 px-2.5 py-1 text-[11px] font-medium text-white">
          <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
          {mediaMessages.cover}
        </div>
      ) : null}
      <div className="pointer-events-none absolute inset-0 flex items-end justify-end gap-1.5 bg-gradient-to-t from-black/60 via-black/0 to-black/0 p-3 opacity-0 transition-opacity group-hover:opacity-100">
        {!isImageCover && item.mediaType === "image" ? (
          <Button
            type="button"
            size="sm"
            variant="secondary"
            className="pointer-events-auto h-8 text-xs"
            onClick={(e) => {
              e.stopPropagation()
              onSetCover(item.id)
            }}
          >
            <Star className="mr-1 h-3 w-3" />
            {mediaMessages.setCover}
          </Button>
        ) : null}
        <Button
          type="button"
          size="sm"
          variant="destructive"
          className="pointer-events-auto h-8 text-xs"
          onClick={async (e) => {
            e.stopPropagation()
            if (
              await confirmDialog({ description: mediaMessages.deleteConfirm, destructive: true })
            )
              onDelete(item.id)
          }}
        >
          <Trash2 className="mr-1 h-3 w-3" />
          {mediaMessages.delete}
        </Button>
      </div>
    </div>
  )
}

function ReorderGrid({
  items,
  onReorder,
  mediaMessages,
}: {
  items: ProductMediaItem[]
  onReorder: (items: ProductMediaItem[]) => void
  mediaMessages: ReturnType<typeof useProductDetailMessages>["products"]["operations"]["media"]
}) {
  return (
    <Reorder.Group
      axis="x"
      values={items}
      onReorder={onReorder}
      as="ul"
      className="flex flex-wrap gap-3"
    >
      {items.map((item) => (
        <Reorder.Item
          key={item.id}
          value={item}
          as="li"
          className="relative size-28 cursor-grab overflow-hidden rounded-lg border bg-muted active:cursor-grabbing"
          whileDrag={{ scale: 1.05, zIndex: 10 }}
        >
          {item.mediaType === "image" ? (
            <MediaImage
              src={item.url}
              alt={item.altText ?? item.name}
              draggable={false}
              className="pointer-events-none h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-muted text-[10px] uppercase text-muted-foreground">
              {item.mediaType}
            </div>
          )}
          {item.isCover && item.mediaType === "image" ? (
            <div className="pointer-events-none absolute left-1 top-1 rounded-full bg-black/70 p-1">
              <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
            </div>
          ) : null}
          <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center justify-center gap-1 bg-black/60 py-1 text-[10px] text-white">
            <GripVertical className="h-3 w-3" />
            {mediaMessages.drag}
          </div>
        </Reorder.Item>
      ))}
    </Reorder.Group>
  )
}

function Lightbox({
  media,
  index,
  onClose,
  mediaMessages,
}: {
  media: ProductMediaItem[]
  index: number | null
  onClose: () => void
  mediaMessages: ReturnType<typeof useProductDetailMessages>["products"]["operations"]["media"]
}) {
  const [current, setCurrent] = useState(index ?? 0)
  useEffect(() => {
    if (index != null) setCurrent(index)
  }, [index])

  const item = media[current]
  const open = index != null && item != null
  const canPrev = current > 0
  const canNext = current < media.length - 1

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft" && canPrev) setCurrent((c) => c - 1)
      if (e.key === "ArrowRight" && canNext) setCurrent((c) => c + 1)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open, canPrev, canNext])

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        className="h-screen w-screen max-w-none translate-x-0 translate-y-0 top-0 left-0 gap-0 rounded-none border-0 bg-black/90 p-0 shadow-none ring-0 sm:max-w-none"
        showCloseButton={false}
      >
        <DialogTitle className="sr-only">{mediaMessages.viewerTitle}</DialogTitle>
        {item ? (
          <div className="relative flex h-full w-full items-center justify-center">
            <button
              type="button"
              onClick={onClose}
              className="absolute right-2 top-2 z-10 rounded-full bg-black/60 p-2 text-white hover:bg-black/80"
              aria-label={mediaMessages.close}
            >
              <X className="h-5 w-5" />
            </button>
            {canPrev ? (
              <button
                type="button"
                onClick={() => setCurrent((c) => c - 1)}
                className="absolute left-2 z-10 rounded-full bg-black/60 p-2 text-white hover:bg-black/80"
                aria-label={mediaMessages.previous}
              >
                <ChevronLeft className="h-6 w-6" />
              </button>
            ) : null}
            {canNext ? (
              <button
                type="button"
                onClick={() => setCurrent((c) => c + 1)}
                className="absolute right-2 z-10 rounded-full bg-black/60 p-2 text-white hover:bg-black/80"
                aria-label={mediaMessages.next}
              >
                <ChevronRight className="h-6 w-6" />
              </button>
            ) : null}
            {item.mediaType === "image" ? (
              <MediaImage
                src={item.url}
                alt={item.altText ?? item.name}
                className="max-h-[95vh] max-w-[95vw] object-contain"
                fallbackClassName="size-64 rounded-lg"
                iconClassName="size-10"
              />
            ) : item.mediaType === "video" ? (
              // biome-ignore lint/a11y/useMediaCaption: Admin preview renders uploaded product media and the current model does not provide caption tracks. -- owner: inventory-react; existing suppression is intentional pending typed cleanup.
              <video src={item.url} controls autoPlay className="max-h-[95vh] max-w-[95vw]" />
            ) : (
              <div className="rounded-lg bg-background p-8 text-sm text-muted-foreground">
                {item.name}
              </div>
            )}
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

async function api_post_reorder(
  api: ProductDetailApi,
  productId: string,
  items: { id: string; sortOrder: number }[],
) {
  return api.post(`/v1/admin/products/${productId}/media/reorder`, { items })
}
