"use client"

import { Badge } from "@voyant-travel/ui/components/badge"
import { ExternalLink, Ship as ShipIcon } from "lucide-react"

import { useCruisesUiMessagesOrDefault } from "../i18n/index.js"
import type { ShipRecord } from "../schemas.js"
import { shipCoverImage, shipSpecs, shipSummary } from "./ship-presentation.js"

export interface ShipDetailPageProps {
  ship: ShipRecord | null
  isLoading: boolean
  isError: boolean
  /** Resolve a cruise line id to its display name. */
  formatSupplier?: (id: string) => string
}

/**
 * Ship detail.
 *
 * Deliberately its own page rather than a tab inside a cruise: a ship outlives
 * any one sailing and is referenced by many, so its specification, gallery and
 * deck plan belong to the vessel and not to whichever cruise happened to be
 * open. The copy is the ship's own throughout — this is the page that says
 * "About this ship", which is what a cruise detail page has no business
 * claiming about a hotel.
 */
export function ShipDetailPage({ ship, isLoading, isError, formatSupplier }: ShipDetailPageProps) {
  const messages = useCruisesUiMessagesOrDefault().shipsAdmin

  if (isLoading) {
    return (
      <div className="mx-auto w-full max-w-screen-2xl px-6 py-6 lg:px-8">
        <div className="h-7 w-1/3 animate-pulse rounded bg-muted/40" />
        <div className="mt-2 h-4 w-1/4 animate-pulse rounded bg-muted/20" />
        <div className="mt-6 h-72 w-full animate-pulse rounded-lg bg-muted/30" />
      </div>
    )
  }

  if (isError || !ship) {
    return (
      <div className="mx-auto w-full max-w-screen-2xl px-6 py-6 lg:px-8">
        <div className="rounded-md border border-dashed p-8 text-center text-muted-foreground text-sm">
          {isError ? messages.loadError : messages.notFound}
        </div>
      </div>
    )
  }

  const cover = shipCoverImage(ship)
  const specs = shipSpecs(ship, messages.specLabels)
  const summary = shipSummary(ship, {
    types: messages.types,
    guestsShort: messages.guestsShort,
    decksShort: messages.decksShort,
  })
  const line = ship.lineSupplierId
    ? (formatSupplier?.(ship.lineSupplierId) ?? ship.lineSupplierId)
    : null
  // The cover is already the hero; the rest is the gallery proper.
  const galleryRest = (ship.gallery ?? []).filter((url) => url && url !== cover)

  return (
    <div className="mx-auto w-full max-w-screen-2xl px-6 py-6 lg:px-8">
      <div className="flex items-start gap-4">
        {cover ? (
          <img
            src={cover}
            alt={ship.name}
            className="h-20 w-28 shrink-0 rounded-lg object-cover ring-1 ring-border"
            loading="lazy"
          />
        ) : (
          <div className="flex h-20 w-28 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
            <ShipIcon className="h-7 w-7" aria-hidden="true" />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-semibold text-2xl">{ship.name || messages.unnamed}</h1>
            {!ship.isActive && <Badge variant="secondary">{messages.inactive}</Badge>}
          </div>
          <p className="mt-1 text-muted-foreground text-sm">{summary}</p>
          {line && (
            <p className="mt-0.5 text-muted-foreground text-sm">
              {messages.supplier}: {line}
            </p>
          )}
        </div>
        {ship.deckPlanUrl && (
          <a
            href={ship.deckPlanUrl}
            target="_blank"
            rel="noreferrer noopener"
            className="inline-flex shrink-0 items-center rounded-md border bg-secondary px-3 py-1.5 font-medium text-secondary-foreground text-sm transition hover:bg-secondary/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <ExternalLink className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
            {messages.openDeckPlan}
          </a>
        )}
      </div>

      {ship.description && (
        <section className="mt-8">
          <h2 className="mb-3 font-medium text-lg">{messages.about}</h2>
          <p className="whitespace-pre-line text-muted-foreground text-sm leading-relaxed">
            {ship.description}
          </p>
        </section>
      )}

      {specs.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-3 font-medium text-lg">{messages.specs}</h2>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3 lg:grid-cols-4">
            {specs.map((spec) => (
              <div key={spec.key}>
                <dt className="text-muted-foreground text-xs uppercase tracking-wide">
                  {spec.label}
                </dt>
                <dd className="font-medium text-sm tabular-nums">{spec.value}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      {galleryRest.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-3 font-medium text-lg">{messages.gallery}</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {galleryRest.map((url) => (
              <img
                key={url}
                src={url}
                alt=""
                loading="lazy"
                className="aspect-[4/3] w-full rounded-lg object-cover ring-1 ring-border"
              />
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
