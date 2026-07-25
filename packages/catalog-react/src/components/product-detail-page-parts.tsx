"use client"

import { Badge } from "@voyant-travel/ui/components/badge"
import { Button } from "@voyant-travel/ui/components/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@voyant-travel/ui/components/select"
import {
  Accessibility,
  Baby,
  Building2,
  Dumbbell,
  Info,
  Plane,
  Umbrella,
  Users,
  UtensilsCrossed,
  Waves,
} from "lucide-react"
import { useEffect, useMemo, useState } from "react"

import type { CatalogUiMessages } from "../i18n/messages.js"

export interface Offer {
  id: string
  title: string | null
  checkIn: string | null
  checkOut: string | null
  nights: number | null
  board: string | null
  roomTypeId: string | null
  ratePlanId?: string | null
  perPerson: { amountMinor: number; currency: string } | null
  total: { amountMinor: number; currency: string } | null
  flights: Array<{
    origin: string | null
    destination: string | null
    departureAt: string | null
    carrier: string | null
    flightNumber: string | null
  }>
  freeCancellationUntil: string | null
}

export interface ProductMedia {
  src: string
  rel: string | null
  caption: string | null
}
export interface ProductDetail {
  name: string | null
  stars: number | null
  city: string | null
  region: string | null
  countryCode: string | null
  category: string | null
  media: ProductMedia[]
  sections: Array<{
    title: string | null
    kind: string | null
    type: string | null
    lines: string[]
  }>
  features: Array<{ code: string | null; label: string | null; type: string | null }>
  rooms: Array<{
    code: string | null
    name: string | null
    area: number | null
    maxGuests: number | null
    view: string | null
    specifications: string[]
    image: string | null
  }>
  reviews: {
    source: string | null
    rating: number | null
    reviewsCount: number | null
    subratings: Array<{ name: string | null; value: number | null }>
  } | null
}

export type RoomDetail = ProductDetail["rooms"][number]
export type DetailMessages = CatalogUiMessages["catalogBrowser"]["detail"]

export interface OfferGroup {
  /** Room code (offer.roomTypeId / room.code); null when the offer has none. */
  code: string | null
  /** Matched content room (details, amenities, photo) — null if unmatched. */
  room: RoomDetail | null
  /** Board/rate options for this room on the selected day, cheapest first. */
  offers: Offer[]
}

// Per-section icon by supplier `kind`, so the facilities read as scannable
// cards rather than a wall of text. Falls back to a neutral info glyph.
const SECTION_ICONS: Record<string, typeof Info> = {
  BEACH: Umbrella,
  FOR_KIDS: Baby,
  FOOD: UtensilsCrossed,
  HOTEL: Building2,
  POOL: Waves,
  SPORT_AND_WELLNESS: Dumbbell,
  DISABILITY: Accessibility,
}

export function sectionIconFor(kind: string | null | undefined) {
  return (kind ? SECTION_ICONS[kind] : undefined) ?? Info
}

// Aggregate guest-review card (rating + per-category subratings). Connect only
// exposes the aggregate — individual review texts aren't in the feed.
export function ReviewsCard({
  reviews,
  t,
}: {
  reviews: NonNullable<ProductDetail["reviews"]>
  t: DetailMessages
}) {
  return (
    <div className="rounded-lg border p-4">
      <div className="flex items-center gap-3">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md bg-secondary font-semibold text-lg text-secondary-foreground">
          {reviews.rating?.toFixed(1)}
        </div>
        <div>
          <div className="font-medium text-sm">{t.guestReviews}</div>
          <div className="text-muted-foreground text-xs">
            {reviews.reviewsCount ?? 0} {t.reviewsWord}
            {reviews.source ? ` · ${reviews.source}` : ""}
          </div>
        </div>
      </div>
      {reviews.subratings.length > 0 && (
        <div className="mt-3 grid gap-x-6 gap-y-1 sm:grid-cols-2">
          {reviews.subratings.map((sr) => (
            <div key={sr.name} className="flex items-center justify-between gap-2 text-sm">
              <span className="text-muted-foreground capitalize">{sr.name}</span>
              <span className="font-medium tabular-nums">{sr.value?.toFixed(1)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// One room type for the selected day: the room's details/amenities + a single
// rate row whose **meal (board) is selectable** — TUI's "Servicii de masă"
// dropdown — where the room is offered on more than one board. Switching the
// meal updates the price, flight and Book target. The cheapest meal is the
// default selection (the room's headline price).
export function RoomRateCard({
  group,
  showImage,
  onBook,
  t,
  locale,
}: {
  group: OfferGroup
  showImage: boolean
  onBook?: (offer: Offer) => void
  t: DetailMessages
  locale: string
}) {
  const { room, code, offers } = group
  const title = room?.name ?? code ?? t.room
  const hasImage = showImage && Boolean(room?.image)
  const details = [room?.area != null ? `${room.area} m²` : null, room?.view ?? null].filter(
    (v): v is string => Boolean(v),
  )

  // One entry per meal (board), keeping the cheapest offer for that meal;
  // cheapest meal first so the default selection is the headline price.
  const mealOptions = useMemo(() => {
    const byBoard = new Map<string, Offer>()
    for (const o of offers) {
      const key = boardKeyOf(o)
      const cur = byBoard.get(key)
      if (!cur || (o.total?.amountMinor ?? 0) < (cur.total?.amountMinor ?? 0)) byBoard.set(key, o)
    }
    return [...byBoard.values()].sort(
      (a, b) => (a.total?.amountMinor ?? 0) - (b.total?.amountMinor ?? 0),
    )
  }, [offers])

  const [meal, setMeal] = useState(() => boardKeyOf(mealOptions[0] ?? offers[0]))
  // Keep the selection valid if the underlying offers change (date switch).
  useEffect(() => {
    if (!mealOptions.some((o) => boardKeyOf(o) === meal)) {
      setMeal(boardKeyOf(mealOptions[0] ?? offers[0]))
    }
  }, [mealOptions, offers, meal])

  const selected = mealOptions.find((o) => boardKeyOf(o) === meal) ?? mealOptions[0] ?? offers[0]
  if (!selected) return null
  const canChangeMeal = mealOptions.length > 1
  const flight = selected.flights[0]

  return (
    <div className="overflow-hidden rounded-lg border">
      <div className="flex gap-3 p-3">
        {hasImage && room?.image && (
          <img
            src={room.image}
            alt={title}
            className="h-20 w-28 shrink-0 rounded-md object-cover"
            loading="lazy"
          />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <h4 className="font-medium text-sm leading-tight">{title}</h4>
            {code && (
              <Badge variant="outline" className="shrink-0 font-normal text-xs">
                {code}
              </Badge>
            )}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-muted-foreground text-xs">
            {details.map((d) => (
              <span key={d}>{d}</span>
            ))}
            {room?.maxGuests != null && (
              <span className="flex items-center gap-1">
                <Users className="h-3 w-3" /> {t.max} {room.maxGuests}
              </span>
            )}
          </div>
          {room?.specifications && room.specifications.length > 0 && (
            <p className="mt-1 line-clamp-2 text-muted-foreground text-xs">
              {room.specifications.join(" · ")}
            </p>
          )}
        </div>
      </div>
      <div className="flex items-center justify-between gap-3 border-t px-3 py-2.5">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          {/* Meal (board): a dropdown when the room offers more than one. */}
          {canChangeMeal ? (
            <Select value={meal} onValueChange={(v) => setMeal(v as string)}>
              <SelectTrigger
                className="h-8 w-[180px] rounded-md data-[size=default]:h-8"
                aria-label={t.mealPlan}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {mealOptions.map((o) => (
                  <SelectItem key={boardKeyOf(o)} value={boardKeyOf(o)}>
                    {boardLabel(o.board, t)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            selected.board && (
              <Badge variant="secondary" className="font-normal">
                {boardLabel(selected.board, t)}
              </Badge>
            )
          )}
          {flight && (
            <span className="flex items-center gap-1 text-muted-foreground text-xs">
              <Plane className="h-3.5 w-3.5" />
              {[flight.carrier, `${flight.origin ?? ""}→${flight.destination ?? ""}`]
                .filter((v) => v && v !== "→")
                .join(" ")}
            </span>
          )}
          {selected.freeCancellationUntil && (
            <span className="text-emerald-600 text-xs dark:text-emerald-400">
              {t.freeCancellation}
            </span>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <div className="text-right">
            {selected.total && (
              <div className="font-semibold text-sm tabular-nums">
                {formatMoney(selected.total, locale)}
              </div>
            )}
            {selected.perPerson && (
              <div className="text-muted-foreground text-xs tabular-nums">
                {formatMoney(selected.perPerson, locale)} {t.perPerson}
              </div>
            )}
          </div>
          {onBook ? (
            <Button size="sm" onClick={() => onBook(selected)}>
              {t.book}
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  )
}

// Stable key for a meal/board (case-folded; offers without a board share one).
export function boardKeyOf(o: Offer | undefined): string {
  return (o?.board ?? "").toUpperCase() || "__none__"
}

// Readable, localized meal label (AI/HB/BB/…) → "All-inclusive"/"Half board"/…
export function boardLabel(board: string | null, t: DetailMessages): string {
  if (!board) return t.boards.standard
  return (t.boards as Record<string, string>)[board.toUpperCase()] ?? board
}

// Live offer room ids are namespaced by accommodation (`LCA20072:DZL1`); the
// content room code is the bare suffix. Take the part after the last colon.
export function roomCodeOf(roomTypeId: string | null): string | null {
  if (!roomTypeId) return null
  const idx = roomTypeId.lastIndexOf(":")
  return idx >= 0 ? roomTypeId.slice(idx + 1) || roomTypeId : roomTypeId
}

// Turn supplier codes like `free_wifi` into "Free wifi"; leave human labels as-is.
export function humanizeFeature(value: string): string {
  if (!/^[a-z0-9]+(_[a-z0-9]+)+$/.test(value)) return value
  const spaced = value.replace(/_/g, " ")
  return spaced.charAt(0).toUpperCase() + spaced.slice(1)
}

export function formatMoney(m: { amountMinor: number; currency: string }, locale?: string): string {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: m.currency,
    maximumFractionDigits: 0,
  }).format(m.amountMinor / 100)
}

export function formatStars(value: number | null | undefined): string | null {
  if (value == null || !Number.isFinite(value) || value <= 0) return null
  return `${Number.isInteger(value) ? value : value.toFixed(1)}★`
}

export function formatCountry(code: string | null | undefined, locale?: string): string | null {
  if (!code || !/^[A-Za-z]{2}$/.test(code)) return code ?? null
  try {
    return new Intl.DisplayNames(locale, { type: "region" }).of(code.toUpperCase()) ?? code
  } catch {
    return code
  }
}

export function formatDay(iso: string, locale?: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return new Intl.DateTimeFormat(locale, {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(d)
}

export function addDays(date: Date, days: number): Date {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next
}

export function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10)
}
