"use client"

import { Badge } from "@voyant-travel/ui/components/badge"
import { Check, Image as ImageIcon, MapPin, Star, Users } from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import { useCatalogUiI18nOrDefault, useCatalogUiMessagesOrDefault } from "../i18n/index.js"
import type { CatalogSurface } from "../index.js"
import { fetchPackageDetail, useVoyantCatalogContext } from "../index.js"
import {
  AvailabilityCalendar,
  compareMonth,
  type DayAvailability,
  type MonthCursor,
  monthOfIso,
  shiftMonth,
} from "./availability-calendar.js"
import { Gallery, GalleryLightbox } from "./catalog-gallery.js"
import {
  addDays,
  formatCountry,
  formatDay,
  formatMoney,
  formatStars,
  humanizeFeature,
  isoDate,
  type Offer,
  type OfferGroup,
  type ProductDetail,
  ReviewsCard,
  type RoomDetail,
  RoomRateCard,
  roomCodeOf,
  sectionIconFor,
} from "./product-detail-page-parts.js"

/**
 * Individual product page (Dynamic surface) — full-page, URL-addressable at
 * `/catalog/products/$productId` (opened in a new tab from the catalog).
 * Fetches the full record from the SOURCE (Connect `package-detail` →
 * accommodation detail + rich content: gallery, descriptions, rooms, reviews)
 * plus the live dated offers — NOT from the search index. Renders a gallery,
 * overview, inclusions, an availability calendar with a per-room rate table,
 * rooms, and reviews.
 *
 * Presentational: breadcrumbs (`onBreadcrumbs`) are injected by the host; the
 * base URL + fetcher come from `VoyantCatalogProvider`.
 */

/** The offer the user clicked Book on — enough for the journey to pre-fill the
 *  date and render a "what you're booking" preview. */
export interface ProductBookSelection {
  /** Check-in / departure date (ISO), seeds the journey's departure. */
  checkIn: string | null
  /** Product name for the journey side-panel preview. */
  name: string | null
  /** Hero image for the preview, if the content has one. */
  heroImageUrl: string | null
  /** Rate pin — the exact room + rate plan the operator clicked Book on, so the
   *  connect adapter re-resolves THAT offer (not just the first for the date).
   *  Pinned by stable keys; the per-search offer id can't be replayed. #1579. */
  roomTypeId: string | null
  ratePlanId: string | null
  board: string | null
}

export interface ProductDetailPageProps {
  productId: string
  adults?: number
  nights?: number
  locale?: string
  /** `/v1/admin/...` (default) vs `/v1/public/...`. */
  surface?: CatalogSurface
  /** Localized "Packages" label — breadcrumb root + header fallback. */
  productsLabel: string
  /** Href of the packages browse page, e.g. `/catalog/products`. */
  productsHref: string
  /** Optional booking handoff supplied only by deployments with an admitted UI command. */
  onBook?: (
    productId: string,
    source: { kind?: string | null; connectionId?: string; ref?: string | null },
    selection?: ProductBookSelection,
  ) => void
  /** Publish breadcrumbs as the resolved name changes. */
  onBreadcrumbs?: (crumbs: Array<{ label: string; href?: string }>) => void
}

export function ProductDetailPage({
  productId,
  adults = 2,
  nights = 7,
  locale = "ro",
  surface = "admin",
  productsLabel,
  productsHref,
  onBook,
  onBreadcrumbs,
}: ProductDetailPageProps) {
  const { baseUrl, fetcher } = useVoyantCatalogContext()
  const t = useCatalogUiMessagesOrDefault().catalogBrowser.detail
  const { locale: resolvedLocale } = useCatalogUiI18nOrDefault()
  const [state, setState] = useState<{
    status: "loading" | "ready" | "error"
    product: ProductDetail | null
    offers: Offer[]
    retryable: boolean
    /** Sourced-entry provenance for this package — pins the booking to the exact
     *  provider/connection so multi-connection deployments quote/book the right one. */
    source: { kind?: string | null; connectionId: string; ref: string | null } | null
  }>({ status: "loading", product: null, offers: [], retryable: false, source: null })
  const [monthCursor, setMonthCursor] = useState<MonthCursor | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  // null = lightbox closed; a number = open at that gallery index.
  const [lightbox, setLightbox] = useState<number | null>(null)

  useEffect(() => {
    let cancelled = false
    setState((p) => ({ ...p, status: "loading" }))
    void (async () => {
      try {
        const json = await fetchPackageDetail(
          { baseUrl, fetcher, surface },
          {
            productId,
            departureDateFrom: isoDate(addDays(new Date(), 7)),
            departureDateTo: isoDate(addDays(new Date(), 230)),
            adults,
            nights: { min: nights, max: nights },
            locale,
          },
        )
        if (cancelled) return
        const offers = json.offers ?? []
        setState({
          status: "ready",
          product: json.product ?? null,
          offers,
          retryable: Boolean(json.retryable),
          source: json.source ?? null,
        })
        const first = offers
          .map((o) => o.checkIn)
          .filter((d): d is string => Boolean(d))
          .sort()[0]
        if (first) {
          setMonthCursor(monthOfIso(first.slice(0, 10)))
          setSelected(first.slice(0, 10))
        }
      } catch {
        if (!cancelled)
          setState({ status: "error", product: null, offers: [], retryable: true, source: null })
      }
    })()
    return () => {
      cancelled = true
    }
  }, [productId, adults, nights, locale, baseUrl, fetcher, surface])

  // Per-day availability: how many offers depart each day + the cheapest.
  const byDate = useMemo(() => {
    const acc = new Map<string, { count: number; fromMinor: number }>()
    for (const o of state.offers) {
      if (!o.checkIn || !o.total) continue
      const day = o.checkIn.slice(0, 10)
      const cur = acc.get(day) ?? { count: 0, fromMinor: Number.POSITIVE_INFINITY }
      cur.count += 1
      cur.fromMinor = Math.min(cur.fromMinor, o.total.amountMinor)
      acc.set(day, cur)
    }
    const out = new Map<string, DayAvailability>()
    for (const [day, v] of acc) out.set(day, v)
    return out
  }, [state.offers])

  const availableMonths = useMemo(() => {
    const months = [...byDate.keys()].map(monthOfIso).filter((m): m is MonthCursor => m != null)
    months.sort(compareMonth)
    return months.filter((m, i) => i === 0 || compareMonth(m, months[i - 1] as MonthCursor) !== 0)
  }, [byDate])

  const currency = state.offers.find((o) => o.total)?.total?.currency ?? "EUR"
  const fromPrice = useMemo(() => {
    const vals = [...byDate.values()].map((v) => v.fromMinor)
    return vals.length ? Math.min(...vals) : null
  }, [byDate])

  const selectedOffers = useMemo(
    () =>
      state.offers
        .filter((o) => o.checkIn?.slice(0, 10) === selected)
        .sort((a, b) => (a.total?.amountMinor ?? 0) - (b.total?.amountMinor ?? 0)),
    [state.offers, selected],
  )

  const product = state.product

  // Join live offers to the accommodation's content rooms by code, so the
  // bookable rates can be grouped under each room with its details/amenities.
  const roomByCode = useMemo(() => {
    const m = new Map<string, RoomDetail>()
    for (const r of product?.rooms ?? []) {
      if (r.code) m.set(r.code.toUpperCase(), r)
    }
    return m
  }, [product])

  // The selected day's offers grouped by room type (TUI "configure room"
  // layout): one card per room, its board options listed beneath, cheapest
  // room first.
  const roomGroups = useMemo<OfferGroup[]>(() => {
    const groups = new Map<string, { code: string | null; offers: Offer[] }>()
    for (const o of selectedOffers) {
      // Offer room ids come prefixed with the accommodation code
      // (e.g. `LCA20072:DZL1`); the content room code is the bare suffix
      // (`DZL1`). Strip the prefix so the join + the badge stay clean.
      const code = roomCodeOf(o.roomTypeId)
      const key = (code ?? "__room__").toUpperCase()
      const g = groups.get(key) ?? { code, offers: [] }
      g.offers.push(o)
      groups.set(key, g)
    }
    return [...groups.values()]
      .map((g) => ({
        code: g.code,
        room: g.code ? (roomByCode.get(g.code.toUpperCase()) ?? null) : null,
        offers: g.offers
          .slice()
          .sort((a, b) => (a.total?.amountMinor ?? 0) - (b.total?.amountMinor ?? 0)),
      }))
      .sort(
        (a, b) => (a.offers[0]?.total?.amountMinor ?? 0) - (b.offers[0]?.total?.amountMinor ?? 0),
      )
  }, [selectedOffers, roomByCode])

  const bookOffer = (offer: Offer) =>
    onBook?.(
      productId,
      {
        kind: state.source?.kind,
        connectionId: state.source?.connectionId,
        ref: state.source?.ref,
      },
      {
        checkIn: offer.checkIn,
        name: state.product?.name ?? null,
        heroImageUrl: state.product?.media.find((m) => m.src)?.src ?? null,
        roomTypeId: offer.roomTypeId,
        ratePlanId: offer.ratePlanId ?? null,
        board: offer.board,
      },
    )

  const stars = formatStars(product?.stars)
  const location = [
    product?.city,
    product?.region,
    formatCountry(product?.countryCode, resolvedLocale),
  ]
    .filter((v): v is string => Boolean(v))
    .join(" · ")
  const gallery = product?.media ?? []
  // Room photos are an upstream gap for some hotels — only show the image area
  // when at least one room has a photo, else render clean text-only cards.
  const roomsHaveImages = (product?.rooms ?? []).some((r) => Boolean(r.image))
  // Split the content sections so the overview can lead with the marketing
  // highlights ("Top reasons") + a clean location panel; the rest stay as the
  // facilities list further down.
  const sections = product?.sections ?? []
  const highlights =
    sections.find((s) => s.kind === "TOP_REASONS" || s.type === "HIGHLIGHT") ?? null
  const locationSection = sections.find((s) => s.kind === "LOCALIZATION") ?? null
  const aboutSections = sections.filter((s) => s !== highlights && s !== locationSection)
  const monthIndex = monthCursor
    ? availableMonths.findIndex((m) => compareMonth(m, monthCursor) === 0)
    : -1

  // Header breadcrumbs (Packages › this product) — the product segment appears
  // once its name has loaded.
  useEffect(() => {
    if (!onBreadcrumbs) return
    onBreadcrumbs(
      product?.name
        ? [{ label: productsLabel, href: productsHref }, { label: product.name }]
        : [{ label: productsLabel, href: productsHref }],
    )
  }, [product?.name, productsLabel, productsHref, onBreadcrumbs])

  if (state.status === "loading") {
    return (
      <div className="mx-auto w-full max-w-screen-2xl">
        <div className="grid h-[340px] grid-cols-4 grid-rows-2 gap-2 sm:h-[440px]">
          <div className="col-span-2 row-span-2 animate-pulse rounded-xl bg-muted/40" />
          {Array.from({ length: 4 }).map((_, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: skeleton placeholder -- owner: catalog-react; existing suppression is intentional pending typed cleanup.
            <div key={i} className="animate-pulse rounded-lg bg-muted/30" />
          ))}
        </div>
        <div className="mt-5 h-7 w-1/3 animate-pulse rounded bg-muted/40" />
        <div className="mt-2 h-4 w-1/4 animate-pulse rounded bg-muted/20" />
        <div className="mt-6 h-64 w-full animate-pulse rounded-lg bg-muted/30" />
      </div>
    )
  }

  return (
    <div className="mx-auto w-full max-w-screen-2xl px-6 py-6 lg:px-8">
      {/* Gallery — click any image to open the lightbox. */}
      <Gallery images={gallery} photosLabel={t.photos} onOpen={(i) => setLightbox(i)} />
      {lightbox != null && gallery.length > 0 && (
        <GalleryLightbox
          images={gallery}
          index={lightbox}
          onIndex={setLightbox}
          onClose={() => setLightbox(null)}
          labels={{ close: t.close, prev: t.prevPhoto, next: t.nextPhoto }}
        />
      )}

      {/* Header */}
      <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="font-semibold text-2xl">{product?.name ?? t.room}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-muted-foreground text-sm">
            {stars && <span className="text-amber-500">{stars}</span>}
            {location && <span>{location}</span>}
            {product?.category && <span className="capitalize">· {product.category}</span>}
            {product?.reviews?.rating != null && (
              <span className="flex items-center gap-1 rounded bg-secondary px-1.5 py-0.5 font-medium text-secondary-foreground text-xs">
                <Star className="h-3 w-3 fill-current" />
                {product.reviews.rating.toFixed(1)}
                {product.reviews.reviewsCount != null && (
                  <span className="font-normal text-muted-foreground">
                    ({product.reviews.reviewsCount})
                  </span>
                )}
              </span>
            )}
          </div>
        </div>
        {fromPrice != null && (
          <div className="shrink-0 text-right">
            <span className="text-muted-foreground text-xs">{t.from} </span>
            <span className="font-semibold text-2xl">
              {formatMoney({ amountMinor: fromPrice, currency }, resolvedLocale)}
            </span>
            <div className="text-muted-foreground text-xs">
              {t.nightsFlightIncluded.replace("{nights}", String(nights))}
            </div>
          </div>
        )}
      </div>

      {/* Inclusions / features */}
      {product?.features && product.features.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-1.5">
          {product.features.map((f) => (
            <Badge key={f.code ?? f.label} variant="outline" className="gap-1 font-normal">
              <Check className="h-3 w-3 text-emerald-600 dark:text-emerald-400" />
              {humanizeFeature(f.label ?? f.code ?? "")}
            </Badge>
          ))}
        </div>
      )}

      {/* Overview — highlights, location & reviews surfaced up top. */}
      {(highlights || locationSection || product?.reviews?.rating != null) && (
        <div className="mt-6 space-y-4">
          {highlights && highlights.lines.length > 0 && (
            <div className="rounded-lg border bg-muted/30 p-4">
              <h2 className="mb-2 font-medium text-sm">{t.highlights}</h2>
              <div className="flex flex-wrap gap-x-6 gap-y-2">
                {highlights.lines.map((line) => (
                  <span key={line} className="flex items-center gap-2 text-sm">
                    <Check className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                    {line}
                  </span>
                ))}
              </div>
            </div>
          )}
          {(locationSection || product?.reviews?.rating != null) && (
            <div className="grid gap-4 md:grid-cols-2">
              {locationSection && locationSection.lines.length > 0 && (
                <div className="rounded-lg border p-4">
                  <h2 className="mb-2 flex items-center gap-1.5 font-medium text-sm">
                    <MapPin className="h-4 w-4 text-muted-foreground" />
                    {locationSection.title ?? t.location}
                  </h2>
                  <ul className="space-y-1.5 text-sm">
                    {locationSection.lines.map((line) => (
                      <li key={line} className="flex items-start gap-2">
                        <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                        <span>{line}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {product?.reviews?.rating != null && <ReviewsCard reviews={product.reviews} t={t} />}
            </div>
          )}
        </div>
      )}

      {/* Dates & prices */}
      <h2 className="mt-8 mb-2 font-medium text-lg">{t.datesAndPrices}</h2>
      {state.status === "error" && (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 p-6 text-center text-destructive text-sm">
          {t.datesError}
        </div>
      )}
      {state.status === "ready" && byDate.size === 0 && (
        <div className="rounded-md border border-dashed p-6 text-center text-muted-foreground text-sm">
          {state.retryable
            ? t.availabilityUnavailable
            : t.noDepartures.replace("{nights}", String(nights))}
        </div>
      )}
      {monthCursor && byDate.size > 0 && (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,360px)_1fr]">
          <AvailabilityCalendar
            cursor={monthCursor}
            byDate={byDate}
            currency={currency}
            selected={selected}
            onSelect={setSelected}
            onPrev={() => setMonthCursor((c) => (c ? shiftMonth(c, -1) : c))}
            onNext={() => setMonthCursor((c) => (c ? shiftMonth(c, 1) : c))}
            canPrev={monthIndex > 0}
            canNext={monthIndex >= 0 && monthIndex < availableMonths.length - 1}
          />
          <div>
            {selected && roomGroups.length > 0 ? (
              <div className="flex flex-col gap-3">
                <h3 className="font-medium">
                  {formatDay(selected, resolvedLocale)} ·{" "}
                  <span className="text-muted-foreground">
                    {roomGroups.length} {roomGroups.length === 1 ? t.roomType : t.roomTypes}
                  </span>
                </h3>
                {roomGroups.map((group) => (
                  <RoomRateCard
                    key={group.code ?? group.offers[0]?.id}
                    group={group}
                    showImage={roomsHaveImages}
                    {...(onBook ? { onBook: bookOffer } : {})}
                    t={t}
                    locale={resolvedLocale}
                  />
                ))}
              </div>
            ) : (
              <div className="flex h-full items-center justify-center rounded-md border border-dashed p-6 text-center text-muted-foreground text-sm">
                {t.selectDate}
              </div>
            )}
          </div>
        </div>
      )}

      {/* About / description sections (facilities — highlights & location
          already shown in the overview band above). */}
      {aboutSections.length > 0 && (
        <div className="mt-10">
          <h2 className="mb-3 font-medium text-lg">{t.about}</h2>
          {/* Masonry columns pack the variable-length facility cards tightly. */}
          <div className="columns-1 gap-4 sm:columns-2 lg:columns-3 [&>*]:mb-4 [&>*]:break-inside-avoid">
            {aboutSections.map((s) => {
              const Icon = sectionIconFor(s.kind)
              return (
                <div key={s.title ?? s.kind} className="rounded-lg border p-4">
                  <h3 className="mb-2 flex items-center gap-2 font-medium text-sm">
                    <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                    {s.title ?? s.kind}
                  </h3>
                  <ul className="space-y-1.5 text-muted-foreground text-sm">
                    {s.lines.map((line) => (
                      <li key={line} className="flex gap-2">
                        <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-muted-foreground/40" />
                        <span>{line}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Rooms */}
      {product?.rooms && product.rooms.length > 0 && (
        <div className="mt-10">
          <h2 className="mb-3 font-medium text-lg">{t.roomsTitle}</h2>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {product.rooms.map((room) => (
              <div
                key={room.name ?? room.specifications.join("|")}
                className="flex flex-col overflow-hidden rounded-lg border"
              >
                {roomsHaveImages && (
                  <div className="relative aspect-[4/3] w-full bg-muted">
                    {room.image ? (
                      <img
                        src={room.image}
                        alt={room.name ?? ""}
                        className="h-full w-full object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-muted-foreground/60">
                        <ImageIcon className="h-7 w-7" aria-hidden="true" />
                      </div>
                    )}
                  </div>
                )}
                <div className="flex flex-1 flex-col gap-1.5 p-3">
                  <div className="font-medium text-sm leading-tight">{room.name ?? t.room}</div>
                  <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-muted-foreground text-xs">
                    {room.area != null && <span>{room.area} m²</span>}
                    {room.maxGuests != null && (
                      <span className="flex items-center gap-1">
                        <Users className="h-3 w-3" /> {t.max} {room.maxGuests}
                      </span>
                    )}
                    {room.view && <span>{room.view}</span>}
                  </div>
                  {room.specifications.length > 0 && (
                    <ul className="mt-0.5 space-y-0.5 text-muted-foreground text-xs">
                      {room.specifications.slice(0, 4).map((spec) => (
                        <li key={spec}>· {spec}</li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
