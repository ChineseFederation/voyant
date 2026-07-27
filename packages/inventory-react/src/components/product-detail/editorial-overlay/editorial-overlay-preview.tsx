"use client"

import { formatMessage } from "@voyant-travel/i18n"
import { Image as MediaImage } from "@voyant-travel/ui/components/image"
import * as React from "react"

import type { EditorialEffectiveContent, EditorialMessages } from "./types.js"

/**
 * Read-only preview of the effective, locale-resolved content a customer
 * receives. It renders the same `effective` payload the public resolver
 * produces — no separate merge order lives in the UI.
 */
export function EditorialOverlayPreview({
  effective,
  locale,
  messages,
}: {
  effective: EditorialEffectiveContent
  locale: string
  messages: EditorialMessages
}) {
  const product = effective.product ?? {}
  const days = effective.days ?? []
  const headingId = React.useId()

  return (
    <section
      aria-labelledby={headingId}
      data-testid="editorial-overlay-preview"
      className="flex flex-col gap-3 rounded-md border bg-muted/30 p-4"
    >
      <div>
        <h4 id={headingId} className="text-sm font-medium">
          {messages.previewTitle}
        </h4>
        <p className="text-xs text-muted-foreground">
          {formatMessage(messages.previewNote, { locale })}
        </p>
      </div>
      {product.hero_image_url ? (
        <MediaImage
          src={product.hero_image_url}
          alt=""
          className="h-40 w-full rounded object-cover sm:w-80"
          loading="lazy"
        />
      ) : null}
      <h5 className="text-base font-semibold">{product.name ?? messages.noEffectiveValue}</h5>
      {product.description ? (
        <p className="whitespace-pre-wrap text-sm">{product.description}</p>
      ) : null}
      {product.highlights && product.highlights.length > 0 ? (
        <ul className="list-disc pl-5 text-sm">
          {product.highlights.map((highlight) => (
            <li key={highlight}>{highlight}</li>
          ))}
        </ul>
      ) : null}
      {days.length > 0 ? (
        <ol className="flex flex-col gap-2">
          {days.map((day, index) => (
            <li key={day.id ?? `day-${index}`} className="text-sm">
              <span className="font-medium">
                {formatMessage(messages.nodeDay, { dayNumber: day.day_number ?? index + 1 })}
                {day.title ? ` — ${day.title}` : ""}
              </span>
              {day.description ? (
                <p className="whitespace-pre-wrap text-muted-foreground">{day.description}</p>
              ) : null}
            </li>
          ))}
        </ol>
      ) : null}
    </section>
  )
}
