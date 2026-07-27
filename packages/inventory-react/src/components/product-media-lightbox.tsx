import { Dialog, DialogContent, DialogTitle } from "@voyant-travel/ui/components/dialog"
import { Image as MediaImage } from "@voyant-travel/ui/components/image"
import { ChevronLeft, ChevronRight, FileText, X } from "lucide-react"
import * as React from "react"
import { useProductsUiMessagesOrDefault } from "../i18n/provider.js"
import type { ProductMediaRecord } from "../index.js"

export function MediaLightbox({
  media,
  index,
  onClose,
}: {
  media: ProductMediaRecord[]
  index: number | null
  onClose: () => void
}) {
  const messages = useProductsUiMessagesOrDefault()
  const sectionMessages = messages.productMediaSection
  const [current, setCurrent] = React.useState(index ?? 0)

  React.useEffect(() => {
    if (index != null) setCurrent(index)
  }, [index])

  const item = media[current]
  const open = index != null && item != null
  const canPrevious = current > 0
  const canNext = current < media.length - 1

  React.useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "ArrowLeft" && canPrevious) setCurrent((value) => value - 1)
      if (event.key === "ArrowRight" && canNext) setCurrent((value) => value + 1)
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [canNext, canPrevious, open])

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && onClose()}>
      <DialogContent
        className="left-0 top-0 h-screen max-h-none w-screen max-w-none translate-x-0 translate-y-0 gap-0 rounded-none border-0 bg-black/90 p-0 text-white ring-0 sm:max-w-none"
        showCloseButton={false}
      >
        <DialogTitle className="sr-only">{sectionMessages.viewerTitle}</DialogTitle>
        {item ? (
          <div className="relative flex h-full w-full items-center justify-center p-4">
            <button
              type="button"
              onClick={onClose}
              className="absolute right-3 top-3 z-10 rounded-full bg-black/60 p-2 text-white hover:bg-black/80"
              aria-label={sectionMessages.actions.closePreview}
            >
              <X className="size-5" aria-hidden="true" />
            </button>
            {canPrevious ? (
              <button
                type="button"
                onClick={() => setCurrent((value) => value - 1)}
                className="absolute left-3 z-10 rounded-full bg-black/60 p-2 text-white hover:bg-black/80"
                aria-label={sectionMessages.actions.previousMedia}
              >
                <ChevronLeft className="size-6" aria-hidden="true" />
              </button>
            ) : null}
            {canNext ? (
              <button
                type="button"
                onClick={() => setCurrent((value) => value + 1)}
                className="absolute right-3 z-10 rounded-full bg-black/60 p-2 text-white hover:bg-black/80"
                aria-label={sectionMessages.actions.nextMedia}
              >
                <ChevronRight className="size-6" aria-hidden="true" />
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
              <a
                href={item.url}
                target="_blank"
                rel="noreferrer"
                className="flex max-w-md flex-col items-center gap-3 rounded-lg bg-background p-8 text-center text-foreground"
              >
                <FileText className="size-8 text-muted-foreground" aria-hidden="true" />
                <span className="font-medium">{item.name}</span>
                <span className="text-sm text-muted-foreground">
                  {sectionMessages.actions.openFile}
                </span>
              </a>
            )}
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
