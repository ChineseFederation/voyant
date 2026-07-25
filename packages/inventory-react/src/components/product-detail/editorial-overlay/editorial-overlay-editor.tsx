"use client"

import type { MediaAsset } from "@voyant-travel/media-react"
import { MediaPicker } from "@voyant-travel/media-react/ui"
import { Button } from "@voyant-travel/ui/components/button"
import { Input } from "@voyant-travel/ui/components/input"
import { Textarea } from "@voyant-travel/ui/components/textarea"
import { Trash2 } from "lucide-react"
import * as React from "react"

import { useVoyantProductsContext } from "../../../provider.js"
import { mediaUrls } from "./editorial-overlay-panes.js"
import type { EditorialMessages, EditorialOverlayFieldKind } from "./types.js"

export interface OverlayEditorProps {
  kind: EditorialOverlayFieldKind
  value: unknown
  onChange: (value: unknown) => void
  messages: EditorialMessages
  label: string
  /** True for gallery-style media fields that hold a list of assets. */
  multiple?: boolean
}

/**
 * The overlay authoring control. Media fields reuse the shared media-library
 * picker so overlay assets are operator-owned library references, never ad-hoc
 * uploads or pasted provider URLs (RFC #3666, media semantics).
 */
export function OverlayEditor({
  kind,
  value,
  onChange,
  messages,
  label,
  multiple = false,
}: OverlayEditorProps) {
  if (kind === "media") {
    return (
      <MediaOverlayEditor
        value={value}
        onChange={onChange}
        messages={messages}
        multiple={multiple}
      />
    )
  }

  if (kind === "string-list") {
    return <StringListEditor value={value} onChange={onChange} messages={messages} label={label} />
  }

  if (kind === "text") {
    return (
      <Input
        aria-label={label}
        value={typeof value === "string" ? value : ""}
        onChange={(event) => onChange(event.target.value)}
      />
    )
  }

  return (
    <Textarea
      aria-label={label}
      rows={kind === "html" ? 8 : 5}
      value={typeof value === "string" ? value : ""}
      onChange={(event) => onChange(event.target.value)}
    />
  )
}

function MediaOverlayEditor({
  value,
  onChange,
  messages,
  multiple,
}: {
  value: unknown
  onChange: (value: unknown) => void
  messages: EditorialMessages
  multiple: boolean
}) {
  const [open, setOpen] = React.useState(false)
  const { baseUrl } = useVoyantProductsContext()
  const urls = mediaUrls(value)

  // Mirrors `defaultAssetUrl` in media-react: library bytes are served by
  // `@voyant-travel/storage` at `GET /v1/admin/media/{storageKey}`.
  const assetByteUrl = (asset: MediaAsset) => {
    if (asset.url) return asset.url
    const trimmed = baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl
    return `${trimmed}/v1/admin/media/${asset.storageKey}` // i18n-literal-ok byte-serving route
  }

  const handleSelect = (assets: MediaAsset[]) => {
    if (assets.length === 0) return
    if (multiple) {
      onChange(
        assets.map((asset) => ({
          url: assetByteUrl(asset),
          type: asset.type === "video" ? "video" : "image",
          alt: asset.altText ?? null,
        })),
      )
    } else {
      onChange(assetByteUrl(assets[0] as MediaAsset))
    }
    setOpen(false)
  }

  return (
    <div className="flex flex-col gap-2">
      {urls.length > 0 ? (
        <ul className="flex flex-wrap gap-2">
          {urls.map((url) => (
            <li key={url}>
              <img
                src={url}
                alt={messages.mediaPreviewAlt}
                className="h-16 w-24 rounded border object-cover"
                loading="lazy"
              />
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground italic">{messages.mediaNone}</p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
          {urls.length > 0 ? messages.mediaReplace : messages.mediaSelect}
        </Button>
        {urls.length > 0 ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onChange(multiple ? [] : "")}
          >
            {messages.mediaRemoveOverlay}
          </Button>
        ) : null}
      </div>
      <MediaPicker
        open={open}
        onOpenChange={setOpen}
        multiple={multiple}
        type="image"
        onSelect={handleSelect}
      />
    </div>
  )
}

function StringListEditor({
  value,
  onChange,
  messages,
  label,
}: {
  value: unknown
  onChange: (value: unknown) => void
  messages: EditorialMessages
  label: string
}) {
  const entries = Array.isArray(value) ? value.map((entry) => String(entry)) : []

  const update = (index: number, next: string) => {
    const copy = [...entries]
    copy[index] = next
    onChange(copy)
  }

  return (
    <div className="flex flex-col gap-2">
      {entries.map((entry, index) => (
        <div
          // biome-ignore lint/suspicious/noArrayIndexKey: rows are positional free text without ids. -- owner: products
          key={`entry-${index}`}
          className="flex items-center gap-2"
        >
          <Input
            aria-label={`${label} — ${messages.listItemLabel.replace("{index}", String(index + 1))}`}
            value={entry}
            onChange={(event) => update(index, event.target.value)}
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={messages.listRemoveItem}
            onClick={() => onChange(entries.filter((_, position) => position !== index))}
          >
            <Trash2 className="h-4 w-4" aria-hidden="true" />
          </Button>
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="self-start"
        onClick={() => onChange([...entries, ""])}
      >
        {messages.listAddItem}
      </Button>
    </div>
  )
}
