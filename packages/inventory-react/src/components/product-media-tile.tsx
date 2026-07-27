import { Badge } from "@voyant-travel/ui/components/badge"
import { Button } from "@voyant-travel/ui/components/button"
import { Image as MediaImage } from "@voyant-travel/ui/components/image"
import { cn } from "@voyant-travel/ui/lib/utils"
import { FileText, GripVertical, Pencil, Star, Trash2 } from "lucide-react"
import type * as React from "react"
import { useProductsUiMessagesOrDefault } from "../i18n/provider.js"
import type { ProductMediaRecord } from "../index.js"

export function MediaTile({
  item,
  index,
  compact,
  reorderMode,
  dragging,
  onOpen,
  onEdit,
  onSetCover,
  onDelete,
  onDragStart,
  onDragOver,
  onDrop,
}: {
  item: ProductMediaRecord
  index: number
  compact: boolean
  reorderMode: boolean
  dragging: boolean
  onOpen: () => void
  onEdit: () => void
  onSetCover: () => void
  onDelete: () => void
  onDragStart: () => void
  onDragOver: (event: React.DragEvent<HTMLLIElement>) => void
  onDrop: () => void
}) {
  const messages = useProductsUiMessagesOrDefault()
  const sectionMessages = messages.productMediaSection
  const mediaTypeLabel = messages.common.mediaTypeLabels[item.mediaType]
  const canBeCover = item.mediaType === "image"

  return (
    <li
      className={cn(
        "group relative overflow-hidden rounded-md border bg-background transition",
        dragging && "opacity-50 ring-2 ring-primary",
        reorderMode && "cursor-grab active:cursor-grabbing",
      )}
      draggable={reorderMode}
      onDragStart={(event) => {
        event.dataTransfer.effectAllowed = "move"
        event.dataTransfer.setData("text/plain", item.id)
        onDragStart()
      }}
      onDragOver={onDragOver}
      onDragEnd={onDrop}
      onDrop={onDrop}
    >
      <div className={cn("relative bg-muted", compact ? "aspect-[4/3]" : "aspect-video")}>
        {item.mediaType === "image" ? (
          <button
            type="button"
            className="h-full w-full"
            onClick={onOpen}
            disabled={reorderMode}
            aria-label={sectionMessages.actions.openPreview}
          >
            <MediaImage
              src={item.url}
              alt={item.altText ?? item.name}
              className="h-full w-full object-cover"
              draggable={false}
            />
          </button>
        ) : item.mediaType === "video" ? (
          <button
            type="button"
            className="flex h-full w-full items-center justify-center"
            onClick={onOpen}
            disabled={reorderMode}
            aria-label={sectionMessages.actions.openPreview}
          >
            <video src={item.url} className="h-full w-full object-cover" muted />
          </button>
        ) : (
          <button
            type="button"
            className="flex h-full w-full flex-col items-center justify-center gap-2 text-muted-foreground"
            onClick={onOpen}
            disabled={reorderMode}
            aria-label={sectionMessages.actions.openPreview}
          >
            <FileText className="size-6" aria-hidden="true" />
            <span className="text-xs font-medium uppercase">{mediaTypeLabel}</span>
          </button>
        )}

        {item.isCover && canBeCover ? (
          <Badge className="absolute left-2 top-2 gap-1 bg-black/70 text-white hover:bg-black/70">
            <Star className="size-3 fill-yellow-400 text-yellow-400" aria-hidden="true" />
            {sectionMessages.coverBadge}
          </Badge>
        ) : null}

        <Badge variant="secondary" className="absolute right-2 top-2 bg-background/90">
          {mediaTypeLabel}
        </Badge>

        {reorderMode ? (
          <div className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-1 bg-black/65 px-2 py-1 text-xs text-white">
            <GripVertical className="size-3" aria-hidden="true" />
            {sectionMessages.actions.drag}
          </div>
        ) : (
          <div className="pointer-events-none absolute inset-0 flex items-end justify-end gap-1.5 bg-gradient-to-t from-black/65 via-black/0 to-black/0 p-2 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
            {!item.isCover && canBeCover ? (
              <Button
                type="button"
                size="sm"
                variant="secondary"
                className="pointer-events-auto h-8 px-2 text-xs"
                onClick={onSetCover}
              >
                <Star className="mr-1 size-3" aria-hidden="true" />
                {sectionMessages.actions.markCover}
              </Button>
            ) : null}
            <Button
              type="button"
              size="icon-sm"
              variant="secondary"
              className="pointer-events-auto"
              onClick={onEdit}
              aria-label={sectionMessages.actions.edit}
            >
              <Pencil className="size-4" aria-hidden="true" />
            </Button>
            <Button
              type="button"
              size="icon-sm"
              variant="destructive"
              className="pointer-events-auto"
              onClick={onDelete}
              aria-label={sectionMessages.actions.delete}
            >
              <Trash2 className="size-4" aria-hidden="true" />
            </Button>
          </div>
        )}
      </div>

      <div className="space-y-1 p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="truncate text-sm font-medium">{item.name}</div>
            {item.altText ? (
              <div className="truncate text-xs text-muted-foreground">{item.altText}</div>
            ) : null}
          </div>
          <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{index + 1}</span>
        </div>
      </div>
    </li>
  )
}
