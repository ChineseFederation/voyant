"use client"

import type { FlightOffer, Itinerary } from "@voyant-travel/flights/contract/types"
import { formatMessage } from "@voyant-travel/i18n"
import { Badge } from "@voyant-travel/ui/components/badge"
import { cn } from "@voyant-travel/ui/lib/utils"
import { Plane } from "lucide-react"
import { useFlightsUiI18nOrDefault } from "../i18n/index.js"
import { AirlineLogo } from "./airline-logo.js"

export interface FlightOfferRowProps {
  offer: FlightOffer
  /** Click handler — typically opens the detail sheet. */
  onClick?: (offer: FlightOffer) => void
  /** "Select" CTA — when set, renders a primary button alongside the price. */
  onSelect?: (offer: FlightOffer) => void
  /** Customize the select CTA label. Defaults to "Select". */
  selectLabel?: string
  /** Optional carrier name resolver — used for the logo `alt` text. */
  carrierName?: (iataCode: string) => string | undefined
  /** Highlight ring (e.g. when this offer is currently picked). */
  selected?: boolean
  className?: string
}

/**
 * One row in the search-results list. Lays out each itinerary on its own
 * line: carriers · departure time · journey · arrival time · stops ·
 * duration. Total price sits on the right with an optional "Select" CTA.
 *
 * For per-leg searches, each offer carries one itinerary; for combined
 * round-trip searches it carries two. The renderer handles both shapes.
 */
export function FlightOfferRow({
  offer,
  onClick,
  onSelect,
  selectLabel,
  carrierName,
  selected,
  className,
}: FlightOfferRowProps) {
  const i18n = useFlightsUiI18nOrDefault()
  const messages = i18n.messages
  const interactive = !!onClick
  const open = onClick ? () => onClick(offer) : undefined
  const rowId = `flight-offer-${offer.offerId}`
  const itineraries = offer.itineraries.map((itin, i) => (
    // biome-ignore lint/suspicious/noArrayIndexKey: itineraries are positional (outbound/return) -- owner: flights-react; existing suppression is intentional pending typed cleanup.
    <ItineraryRow key={i} itinerary={itin} carrierName={carrierName} messages={messages} />
  ))
  return (
    <div
      className={cn(
        "relative flex w-full items-stretch gap-4 rounded-md border bg-card p-4 text-left shadow-sm transition-colors",
        selected && "border-primary ring-1 ring-primary/40",
        className,
      )}
    >
      {/* Full-card overlay button keeps the whole row clickable to open the
          detail sheet. It sits behind the content (which is pointer-events-none
          so clicks fall through to it); the Select CTA below re-enables pointer
          events, so the two controls are siblings — never nested interactive
          elements, and no invalid <button>-in-<button>. */}
      {interactive && (
        <>
          {/* Visually hidden action hint; combined with the itinerary + price
              ids below so the overlay button's accessible name is unique per
              row (e.g. "View flight details, <route…>, <price>"). */}
          <span id={`${rowId}-action`} className="sr-only">
            {messages.flightOfferRow.viewDetails}
          </span>
          <button
            type="button"
            onClick={open}
            aria-labelledby={`${rowId}-action ${rowId}-itineraries ${rowId}-price`}
            className="absolute inset-0 rounded-md transition-colors hover:bg-accent/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </>
      )}
      <div
        id={`${rowId}-itineraries`}
        className={cn(
          "flex min-w-0 flex-1 flex-col gap-3",
          interactive && "pointer-events-none relative",
        )}
      >
        {itineraries}
      </div>
      <div
        className={cn(
          "flex shrink-0 flex-col items-end justify-center gap-2 border-l pl-4",
          interactive && "pointer-events-none relative",
        )}
      >
        <div id={`${rowId}-price`} className="font-semibold text-2xl tabular-nums">
          {formatMoney(offer.totalPrice.amount, offer.totalPrice.currency, i18n)}
        </div>
        <PriceFootnote offer={offer} i18n={i18n} />
        {onSelect && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onSelect(offer)
            }}
            className="pointer-events-auto relative mt-1 inline-flex h-8 items-center justify-center rounded-md bg-primary px-3 font-medium text-primary-foreground text-xs hover:bg-primary/90"
          >
            {selectLabel ?? messages.flightOfferRow.select}
          </button>
        )}
      </div>
    </div>
  )
}

function PriceFootnote({
  offer,
  i18n,
}: {
  offer: FlightOffer
  i18n: ReturnType<typeof useFlightsUiI18nOrDefault>
}) {
  const messages = i18n.messages
  const totalPax = offer.fareBreakdowns.reduce((n, b) => n + b.passengerCount, 0)
  const adult = offer.fareBreakdowns.find((b) => b.passengerType === "adult")
  if (totalPax <= 1) {
    return <div className="text-muted-foreground text-xs">{messages.common.total}</div>
  }
  return (
    <div className="flex flex-col items-end gap-0.5 text-muted-foreground text-xs">
      <span>
        {messages.common.total} · {totalPax} {messages.common.pax}
      </span>
      {adult && (
        <span>
          {formatMoney(adult.total.amount, adult.total.currency, i18n)}
          <span className="ml-0.5 text-muted-foreground/70">
            {messages.common.adultPerPassenger}
          </span>
        </span>
      )}
    </div>
  )
}

function ItineraryRow({
  itinerary,
  carrierName,
  messages,
}: {
  itinerary: Itinerary
  carrierName?: (iataCode: string) => string | undefined
  messages: ReturnType<typeof useFlightsUiI18nOrDefault>["messages"]
}) {
  const segs = itinerary.segments
  const first = segs[0]
  const last = segs[segs.length - 1]
  if (!first || !last) return null

  const carriers = Array.from(new Set(segs.map((s) => s.carrierCode)))
  const stops = segs.length - 1
  const hasCodeshare = segs.some(
    (s) => s.operatingCarrierCode != null && s.operatingCarrierCode !== s.carrierCode,
  )
  const hasInterline = carriers.length > 1

  return (
    <div className="flex items-center gap-3">
      {/* Who is flying this, in words. The logo alone identifies a carrier
          only to someone who already knows the livery. */}
      <div className="flex w-40 shrink-0 items-center gap-2">
        <div className="flex shrink-0 items-center -space-x-1.5">
          {carriers.map((code) => (
            <AirlineLogo key={code} iataCode={code} name={carrierName?.(code)} size={28} />
          ))}
        </div>
        <div className="flex min-w-0 flex-col leading-tight">
          <span className="truncate font-medium text-xs">
            {carrierLabel(carriers, carrierName, messages)}
          </span>
          <span className="truncate font-mono text-[10px] text-muted-foreground">
            {flightNumbers(segs)}
          </span>
        </div>
      </div>
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <Endpoint at={first.departure.at} iata={first.departure.iataCode} />
        <div className="flex min-w-0 flex-1 flex-col items-center gap-1">
          <div className="text-[11px] text-muted-foreground">
            {formatDuration(itinerary.duration)}
          </div>
          <div className="flex w-full items-center gap-1.5">
            <div className="h-px flex-1 bg-border" />
            <Plane className="h-3 w-3 text-muted-foreground" />
            <div className="h-px flex-1 bg-border" />
          </div>
          <div className="flex flex-wrap items-center justify-center gap-1.5 text-[11px] text-muted-foreground">
            {stops === 0 ? (
              <span className="font-medium text-emerald-600">{messages.common.stops.nonstop}</span>
            ) : (
              <span>
                {formatMessage(messages.common.stops.via, {
                  stops: formatMessage(
                    stops === 1 ? messages.common.stops.oneStop : messages.common.stops.manyStops,
                    { count: stops },
                  ),
                  airports: segs
                    .slice(0, -1)
                    .map((s) => s.arrival.iataCode)
                    .join(", "),
                })}
              </span>
            )}
            {hasInterline && (
              <Badge variant="secondary" className="px-1.5 py-0 text-[9px]">
                {messages.flightOfferRow.interline}
              </Badge>
            )}
            {hasCodeshare && (
              <Badge variant="secondary" className="px-1.5 py-0 text-[9px]">
                {messages.flightOfferRow.codeshare}
              </Badge>
            )}
          </div>
        </div>
        <Endpoint at={last.arrival.at} iata={last.arrival.iataCode} align="end" />
      </div>
      <Badge variant="outline" className="shrink-0 capitalize">
        {messages.common.cabinLabels[first.cabin]}
      </Badge>
    </div>
  )
}

/**
 * The airline as a traveller would name it. Falls back to the IATA code when
 * reference data doesn't know the carrier, which is never wrong — just terser.
 * Interline itineraries name the first carrier and count the rest, because the
 * full list doesn't fit and the operating carriers are on the detail sheet.
 */
function carrierLabel(
  carriers: string[],
  carrierName: ((iataCode: string) => string | undefined) | undefined,
  messages: ReturnType<typeof useFlightsUiI18nOrDefault>["messages"],
): string {
  const [first, ...rest] = carriers
  if (!first) return ""
  const name = carrierName?.(first) ?? first
  if (rest.length === 0) return name
  return formatMessage(messages.flightOfferRow.plusCarriers, {
    carrier: name,
    count: String(rest.length),
  })
}

/** Marketing flight numbers in order, capped so a 3-leg trip stays on one line. */
function flightNumbers(segs: Itinerary["segments"]): string {
  const numbers = segs.map((segment) => `${segment.carrierCode} ${segment.flightNumber}`)
  if (numbers.length <= 2) return numbers.join(" · ")
  return `${numbers.slice(0, 2).join(" · ")} +${numbers.length - 2}`
}

function Endpoint({
  at,
  iata,
  align = "start",
}: {
  at: string
  iata: string
  align?: "start" | "end"
}) {
  const { locale } = useFlightsUiI18nOrDefault()
  return (
    <div
      className={cn(
        "flex shrink-0 flex-col leading-tight",
        align === "end" ? "items-end" : "items-start",
      )}
    >
      <span className="font-semibold text-base tabular-nums">{formatTime(at, locale)}</span>
      <span className="font-mono text-muted-foreground text-xs">{iata}</span>
    </div>
  )
}

function formatMoney(
  amount: string,
  currency: string,
  i18n: ReturnType<typeof useFlightsUiI18nOrDefault>,
): string {
  const n = Number(amount)
  if (!Number.isFinite(n)) return `${amount} ${currency}`
  return i18n.formatCurrency(n, currency, { maximumFractionDigits: 0 })
}

function formatTime(iso: string, locale: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit" }).format(d)
}

function formatDuration(iso: string | undefined): string {
  if (!iso) return ""
  const m = /^PT(?:(\d+)H)?(?:(\d+)M)?$/.exec(iso)
  if (!m) return iso
  const h = m[1] ? `${m[1]}h` : ""
  const min = m[2] ? `${m[2]}m` : ""
  return [h, min].filter(Boolean).join(" ") || iso
}
