"use client"

import { Badge } from "@voyant-travel/ui/components/badge"
import { Button } from "@voyant-travel/ui/components/button"
import { Card } from "@voyant-travel/ui/components/card"
import { Tooltip, TooltipContent, TooltipTrigger } from "@voyant-travel/ui/components/tooltip"
import { Image as ImageIcon } from "lucide-react"
import { useCatalogUiI18nOrDefault } from "../i18n/index.js"
import type { CatalogSearchHit } from "../index.js"
import {
  asString,
  formatHitPrice,
  type PriceUnit,
  resolveHitPriceUnit,
  stringField,
} from "./catalog-hit.js"

export interface CatalogCardBadge {
  label: string
  variant?: "default" | "secondary" | "outline"
}

/**
 * Declarative card mapping for one vertical. The grid view renders a
 * `CatalogCard` per hit using these accessors so per-vertical packages own
 * their merchandising language without the shell knowing field names.
 *
 * Accessors receive the indexer document's `fields` map and return ready-to-
 * render strings; the shell formats price from the `*AmountField`/`*CurrencyField`
 * pair (integer cents + ISO currency).
 */
export interface CatalogCardConfig {
  /** Field carrying the hero/thumbnail url. Falls back to the tab `imageField` then `thumbnailUrl`. */
  imageField?: string
  /** Title field (default `name`). */
  titleField?: string
  /**
   * Integer-cents amount field(s) for the "from" price, tried in order — so a
   * card can prefer the computed lowest price (`priceFromAmountCents`) and fall
   * back to the headline (`sellAmountCents`).
   */
  priceAmountField?: string | string[]
  /** ISO currency field(s) paired with the amount, tried in order. */
  priceCurrencyField?: string | string[]
  /**
   * Whether the amount field holds integer minor units (cents, the default) or
   * major currency units.
   */
  priceUnit?: PriceUnit
  /**
   * Optional field carrying `minor` or `major`. When present it overrides
   * `priceUnit`, which keeps legacy index documents display-compatible while
   * letting newly indexed rows declare their units.
   */
  priceUnitField?: string
  /** Secondary line under the title — typically location (e.g. "Spain · Palma"). */
  subtitle?: (fields: Record<string, unknown>) => string | null
  /** Compact overlay chip on the image — typically duration (e.g. "8d / 7n"). */
  meta?: (fields: Record<string, unknown>) => string | null
  /** Muted footer line — typically next departure + count (e.g. "Next: 15 Aug · 12 departures"). */
  footerNote?: (fields: Record<string, unknown>) => string | null
  /**
   * Optional hover text for the footer line, newline-separated. Used to show a
   * timed departure in both the departure's zone and the reader's — the card
   * itself has room for only one of them.
   */
  footerNoteTooltip?: (fields: Record<string, unknown>) => string | null
  /** Theme/category chips (rendered as outline badges; capped at 3). */
  chips?: (fields: Record<string, unknown>) => string[]
  /** Image-overlay badges — typically source/status. */
  badges?: (fields: Record<string, unknown>) => CatalogCardBadge[]
}

export interface CatalogCardProps {
  hit: CatalogSearchHit
  config: CatalogCardConfig
  /** Tab-level image field used when the card config omits its own. */
  imageFallbackField?: string
  /** Title shown when the hit has no name. */
  fallbackTitle: string
  /** Opens the detail sheet for this hit. */
  onOpen: (hit: CatalogSearchHit) => void
}

/**
 * Booking.com-style merchandising card for one search hit. Pure projection
 * of the indexed document via the tab's `CatalogCardConfig` — no extra fetch.
 * The whole card is a button that opens the detail sheet (which carries the
 * departures + Book actions).
 */
export function CatalogCard({
  hit,
  config,
  imageFallbackField,
  fallbackTitle,
  onOpen,
}: CatalogCardProps) {
  const { locale, messages } = useCatalogUiI18nOrDefault()
  const card = messages.catalogPage.card
  const fields = hit.document.fields
  const imageField = config.imageField ?? imageFallbackField ?? "thumbnailUrl"
  const imageUrl = asString(fields[imageField])
  const title = stringField(hit, config.titleField ?? "name", fallbackTitle)
  const subtitle = config.subtitle?.(fields) ?? null
  const meta = config.meta?.(fields) ?? null
  const footerNote = config.footerNote?.(fields) ?? null
  const footerNoteTooltip = config.footerNoteTooltip?.(fields) ?? null
  const chips = config.chips?.(fields) ?? []
  const badges = config.badges?.(fields) ?? []
  const price = resolveCardPrice(
    hit,
    config.priceAmountField,
    config.priceCurrencyField,
    locale,
    config.priceUnit,
    config.priceUnitField,
  )

  const open = () => onOpen(hit)

  return (
    <Card
      role="button"
      tabIndex={0}
      onClick={open}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault()
          open()
        }
      }}
      className="group flex cursor-pointer flex-col gap-0 overflow-hidden p-0 transition hover:border-primary/40 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div className="relative aspect-[4/3] w-full overflow-hidden bg-muted">
        {imageUrl ? (
          <img
            src={imageUrl}
            alt={title}
            loading="lazy"
            className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-muted-foreground">
            <ImageIcon className="h-8 w-8" aria-hidden="true" />
          </div>
        )}
        {badges.length > 0 && (
          <div className="absolute top-2 left-2 flex flex-wrap gap-1">
            {badges.map((b) => (
              <Badge key={b.label} variant={b.variant ?? "secondary"} className="shadow-sm">
                {b.label}
              </Badge>
            ))}
          </div>
        )}
        {meta && (
          <span className="absolute top-2 right-2 rounded-md bg-background/90 px-2 py-0.5 font-medium text-xs shadow-sm backdrop-blur">
            {meta}
          </span>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-2 p-3">
        <div className="min-w-0">
          <div className="truncate font-medium leading-tight">{title}</div>
          {subtitle && <div className="truncate text-muted-foreground text-sm">{subtitle}</div>}
        </div>
        {chips.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {chips.slice(0, 3).map((c) => (
              <Badge key={c} variant="outline" className="font-normal capitalize">
                {c}
              </Badge>
            ))}
          </div>
        )}
        {footerNote &&
          (footerNoteTooltip ? (
            <Tooltip>
              <TooltipTrigger
                render={
                  // A real button so the times are reachable by keyboard too —
                  // a hover-only affordance would hide the reader's own
                  // timezone from anyone not using a mouse. The click is
                  // swallowed rather than opening the detail sheet out from
                  // under someone who just wanted to read it.
                  <button
                    type="button"
                    aria-label={footerNote}
                    className="w-fit cursor-help text-left text-muted-foreground text-xs underline decoration-dotted underline-offset-2"
                    onClick={(e) => e.stopPropagation()}
                  />
                }
              >
                {footerNote}
              </TooltipTrigger>
              <TooltipContent className="whitespace-pre-line">{footerNoteTooltip}</TooltipContent>
            </Tooltip>
          ) : (
            <div className="text-muted-foreground text-xs">{footerNote}</div>
          ))}
        <div className="mt-auto flex items-end justify-between gap-2 pt-1">
          <div className="min-w-0">
            {price ? (
              <div className="flex items-baseline gap-1">
                <span className="text-muted-foreground text-xs">{card.from}</span>
                <span className="font-semibold text-base">{price}</span>
              </div>
            ) : null}
          </div>
          <Button
            size="sm"
            variant="secondary"
            className="shrink-0"
            onClick={(e) => {
              e.stopPropagation()
              open()
            }}
          >
            {card.viewDetails}
          </Button>
        </div>
      </div>
    </Card>
  )
}

function resolveCardPrice(
  hit: CatalogSearchHit,
  amountField: string | string[] | undefined,
  currencyField: string | string[] | undefined,
  locale: string,
  unit: PriceUnit = "minor",
  unitField?: string,
): string | null {
  if (!amountField || !currencyField) return null
  const resolvedUnit = resolveHitPriceUnit(hit, unit, unitField)
  const amounts = Array.isArray(amountField) ? amountField : [amountField]
  const currencies = Array.isArray(currencyField) ? currencyField : [currencyField]
  for (const amount of amounts) {
    for (const currency of currencies) {
      const formatted = formatHitPrice(hit, amount, currency, locale, resolvedUnit)
      if (formatted) return formatted
    }
  }
  return null
}
