// agent-quality: file-size exception -- owner: catalog-react; existing cruise detail surface stays co-located until a dedicated split preserves behavior and tests.
"use client"

import { Badge } from "@voyant-travel/ui/components/badge"
import { Button } from "@voyant-travel/ui/components/button"
import { Anchor, Check, Ship, Users } from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import { useCatalogUiI18nOrDefault, useCatalogUiMessagesOrDefault } from "../i18n/index.js"
import type { CatalogSurface } from "../index.js"
import {
  fetchCruiseContent,
  fetchCruisePrice,
  fetchCruiseSailingPricing,
  useVoyantCatalogContext,
} from "../index.js"
import type { CatalogContentProvenance } from "../schemas-catalog-offers.js"
import {
  AvailabilityCalendar,
  compareMonth,
  type DayAvailability,
  type MonthCursor,
  monthOfIso,
  shiftMonth,
} from "./availability-calendar.js"
import { Gallery, type GalleryImage, GalleryLightbox } from "./catalog-gallery.js"
import {
  type CabinPrice,
  type CruiseDetail,
  type CruiseSailing,
  formatCruiseType,
  formatDay,
  formatMoney,
  mapCruiseContent,
} from "./cruise-detail-page-parts.js"

export interface CruiseDetailPageProps {
  id: string
  locale?: string
  surface?: CatalogSurface
  cruisesLabel: string
  cruisesHref: string
  /** Optional booking handoff supplied only by deployments with an admitted UI command. */
  onBook?: (
    cruiseId: string,
    opts: {
      departureId?: string
      optionId?: string
      departureDate?: string | null
      name?: string | null
      heroImageUrl?: string | null
      sourceKind?: string | null
      sourceConnectionId?: string | null
      sourceRef?: string | null
    },
  ) => void
  onBreadcrumbs?: (crumbs: Array<{ label: string; href?: string }>) => void
}

export function CruiseDetailPage({
  id,
  locale = "ro",
  surface = "admin",
  cruisesLabel,
  cruisesHref,
  onBook,
  onBreadcrumbs,
}: CruiseDetailPageProps) {
  const { baseUrl, fetcher } = useVoyantCatalogContext()
  const browser = useCatalogUiMessagesOrDefault().catalogBrowser
  const t = browser.detail
  const s = browser.search
  const { locale: resolvedLocale } = useCatalogUiI18nOrDefault()

  const [detail, setDetail] = useState<CruiseDetail | null>(null)
  const [provenance, setProvenance] = useState<CatalogContentProvenance | null>(null)
  // Cruise-level "from" price (from Connect; the content route carries none).
  const [cruisePrice, setCruisePrice] = useState<{
    fromAmountMinor: number | null
    currency: string | null
  } | null>(null)
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading")
  const [monthCursor, setMonthCursor] = useState<MonthCursor | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [lightbox, setLightbox] = useState<number | null>(null)
  const [cabinPricing, setCabinPricing] = useState<{
    sailingRef: string
    cabins: CabinPrice[]
    currency: string | null
  } | null>(null)
  const [pricingLoading, setPricingLoading] = useState(false)

  useEffect(() => {
    let cancelled = false
    setStatus("loading")
    setDetail(null)
    setProvenance(null)
    setCruisePrice(null)
    void (async () => {
      try {
        const [contentJson, priceJson] = await Promise.all([
          fetchCruiseContent({ baseUrl, fetcher, surface }, { cruiseId: id, locale }),
          fetchCruisePrice({ baseUrl, fetcher, surface }, { cruiseId: id }).catch(() => null),
        ])
        if (cancelled) return
        const mapped = mapCruiseContent(contentJson.data?.content)
        if (!mapped) {
          setStatus("error")
          return
        }
        setDetail(mapped)
        setProvenance(contentJson.data?.provenance ?? null)
        setStatus("ready")
        if (priceJson) {
          setCruisePrice({
            fromAmountMinor: priceJson.fromAmountMinor ?? null,
            currency: priceJson.currency ?? null,
          })
        }
        const first = mapped.sailings
          .map((sail) => sail.startDate)
          .filter((d): d is string => Boolean(d))
          .sort()[0]
        if (first) {
          setMonthCursor(monthOfIso(first.slice(0, 10)))
          setSelected(first.slice(0, 10))
        }
      } catch {
        if (!cancelled) setStatus("error")
      }
    })()
    return () => {
      cancelled = true
    }
  }, [id, locale, baseUrl, fetcher, surface])

  useEffect(() => {
    if (!onBreadcrumbs) return
    onBreadcrumbs(
      detail?.name
        ? [{ label: cruisesLabel, href: cruisesHref }, { label: detail.name }]
        : [{ label: cruisesLabel, href: cruisesHref }],
    )
  }, [detail?.name, cruisesLabel, cruisesHref, onBreadcrumbs])

  const gallery = useMemo<GalleryImage[]>(() => {
    if (!detail) return []
    const urls = [
      detail.heroImageUrl,
      ...(detail.ship?.gallery ?? []),
      ...detail.cabins.flatMap((c) => c.images.slice(0, 1)),
    ].filter((u): u is string => Boolean(u))
    return [...new Set(urls)].map((src) => ({ src }))
  }, [detail])

  // Per-day availability: sailings departing each day + from-price. Cruise
  // sailings rarely carry a per-sailing price, so fall back to the cruise-level
  // "from" price (Connect); the calendar omits the price line when there's none.
  const byDate = useMemo(() => {
    const fallback = cruisePrice?.fromAmountMinor ?? null
    const acc = new Map<string, { count: number; fromMinor: number }>()
    for (const sail of detail?.sailings ?? []) {
      if (!sail.startDate) continue
      const day = sail.startDate.slice(0, 10)
      const cur = acc.get(day) ?? { count: 0, fromMinor: Number.POSITIVE_INFINITY }
      cur.count += 1
      const price = sail.lowestPriceCents ?? fallback
      if (price != null) cur.fromMinor = Math.min(cur.fromMinor, price)
      acc.set(day, cur)
    }
    const out = new Map<string, DayAvailability>()
    for (const [day, v] of acc) out.set(day, v)
    return out
  }, [detail, cruisePrice])

  const availableMonths = useMemo(() => {
    const months = [...byDate.keys()].map(monthOfIso).filter((m): m is MonthCursor => m != null)
    months.sort(compareMonth)
    return months.filter((m, i) => i === 0 || compareMonth(m, months[i - 1] as MonthCursor) !== 0)
  }, [byDate])

  const currency =
    detail?.sailings.find((sail) => sail.currency)?.currency ?? cruisePrice?.currency ?? "USD"
  const fromPrice = useMemo(() => {
    const vals = [...byDate.values()]
      .map((v) => v.fromMinor)
      .filter((v) => Number.isFinite(v) && v > 0)
    return vals.length ? Math.min(...vals) : null
  }, [byDate])

  const selectedSailings = useMemo(
    () =>
      (detail?.sailings ?? [])
        .filter((sail) => sail.startDate?.slice(0, 10) === selected)
        .sort((a, b) => (a.lowestPriceCents ?? 0) - (b.lowestPriceCents ?? 0)),
    [detail, selected],
  )

  const monthIndex = monthCursor
    ? availableMonths.findIndex((m) => compareMonth(m, monthCursor) === 0)
    : -1

  // Live per-cabin pricing for the selected sailing (Connect listSailingPricing).
  const activeRef = selectedSailings[0]?.sourceRef ?? null
  useEffect(() => {
    if (!activeRef) {
      setCabinPricing(null)
      return
    }
    let cancelled = false
    setPricingLoading(true)
    setCabinPricing(null)
    void (async () => {
      try {
        const json = await fetchCruiseSailingPricing(
          { baseUrl, fetcher, surface },
          { cruiseId: id, sailingRef: activeRef },
        )
        if (!cancelled) {
          setCabinPricing({
            sailingRef: activeRef,
            cabins: json.cabins ?? [],
            currency: json.currency ?? null,
          })
        }
      } catch {
        if (!cancelled) setCabinPricing({ sailingRef: activeRef, cabins: [], currency: null })
      } finally {
        if (!cancelled) setPricingLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [activeRef, id, baseUrl, fetcher, surface])

  const book = (sail: CruiseSailing, cabinCode?: string) =>
    onBook?.(id, {
      ...(sail.sourceRef || sail.id ? { departureId: sail.sourceRef ?? sail.id ?? "" } : {}),
      ...(cabinCode ? { optionId: cabinCode } : {}),
      departureDate: sail.startDate,
      name: detail?.name ?? null,
      heroImageUrl: detail?.heroImageUrl ?? null,
      sourceKind: provenance?.source_kind ?? null,
      sourceConnectionId: provenance?.source_connection_id ?? null,
      sourceRef: provenance?.source_ref ?? null,
    })

  if (status === "loading") {
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
        <div className="mt-6 h-64 w-full animate-pulse rounded-lg bg-muted/30" />
      </div>
    )
  }

  if (status === "error" || !detail) {
    return (
      <div className="mx-auto w-full max-w-screen-2xl px-6 py-6 lg:px-8">
        <div className="rounded-md border border-dashed p-8 text-center text-muted-foreground text-sm">
          {t.loadError}
        </div>
      </div>
    )
  }

  const route = [detail.embarkationPort, detail.disembarkationPort]
    .filter((v): v is string => Boolean(v))
    .join(" → ")
  const subtitle = [
    formatCruiseType(detail.cruiseType, s),
    detail.nights != null ? `${detail.nights} ${s.nights}` : null,
    detail.cruiseLine,
  ]
    .filter((v): v is string => Boolean(v))
    .join(" · ")

  return (
    <div className="mx-auto w-full max-w-screen-2xl px-6 py-6 lg:px-8">
      {/* Gallery */}
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
          <h1 className="font-semibold text-2xl">{detail.name ?? cruisesLabel}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-muted-foreground text-sm">
            {subtitle && <span>{subtitle}</span>}
            {route && (
              <span className="flex items-center gap-1">
                <Anchor className="h-3.5 w-3.5" /> {route}
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
          </div>
        )}
      </div>

      {/* Highlights */}
      {detail.highlights.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-1.5">
          {detail.highlights.map((h) => (
            <Badge key={h} variant="outline" className="gap-1 font-normal">
              <Check className="h-3 w-3 text-emerald-600 dark:text-emerald-400" />
              {h}
            </Badge>
          ))}
        </div>
      )}

      {/* Sailings — dates & prices */}
      <h2 className="mt-8 mb-2 font-medium text-lg">{t.datesAndPrices}</h2>
      {byDate.size === 0 ? (
        <div className="rounded-md border border-dashed p-6 text-center text-muted-foreground text-sm">
          {s.noSailings}
        </div>
      ) : (
        monthCursor && (
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
              {selected && selectedSailings.length > 0 ? (
                <div className="flex flex-col gap-3">
                  {selectedSailings.map((sail) => {
                    const isActive = sail.sourceRef != null && sail.sourceRef === activeRef
                    const fallbackPrice = sail.lowestPriceCents ?? cruisePrice?.fromAmountMinor
                    return (
                      <div
                        key={sail.id ?? sail.sourceRef ?? sail.startDate}
                        className="overflow-hidden rounded-lg border"
                      >
                        {/* Sailing header */}
                        <div className="flex items-center justify-between gap-3 border-b bg-muted/20 px-3 py-2.5">
                          <div className="min-w-0">
                            <div className="font-medium text-sm">
                              {formatDay(sail.startDate, resolvedLocale)}
                              {sail.endDate ? ` – ${formatDay(sail.endDate, resolvedLocale)}` : ""}
                            </div>
                            <div className="flex flex-wrap items-center gap-x-2 text-muted-foreground text-xs">
                              {sail.nights != null && (
                                <span>
                                  {sail.nights} {s.nights}
                                </span>
                              )}
                              {(sail.embarkationPort || sail.disembarkationPort) && (
                                <span className="flex items-center gap-1">
                                  <Anchor className="h-3 w-3" />
                                  {[sail.embarkationPort, sail.disembarkationPort]
                                    .filter(Boolean)
                                    .join(" → ")}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                        {/* Per-cabin rate rows for the active sailing (live). */}
                        {isActive && pricingLoading ? (
                          <div className="divide-y">
                            {Array.from({ length: 4 }).map((_, i) => (
                              // biome-ignore lint/suspicious/noArrayIndexKey: skeleton placeholder -- owner: catalog-react; existing suppression is intentional pending typed cleanup.
                              <div key={i} className="flex items-center justify-between px-3 py-3">
                                <div className="h-4 w-40 animate-pulse rounded bg-muted/40" />
                                <div className="h-7 w-24 animate-pulse rounded bg-muted/30" />
                              </div>
                            ))}
                          </div>
                        ) : isActive && cabinPricing && cabinPricing.cabins.length > 0 ? (
                          <ul className="divide-y">
                            {cabinPricing.cabins.map((cab) => {
                              const cabin = detail.cabins.find((c) => c.externalId === cab.code)
                              return (
                                <li
                                  key={cab.code}
                                  className="flex items-center justify-between gap-3 px-3 py-2.5"
                                >
                                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                                    <span className="font-medium text-sm">
                                      {cabin?.name ?? cab.code}
                                    </span>
                                    {cabin?.view && (
                                      <span className="text-muted-foreground text-xs capitalize">
                                        {cabin.view}
                                      </span>
                                    )}
                                    {!cab.available && (
                                      <Badge variant="secondary" className="font-normal">
                                        {t.soldOut}
                                      </Badge>
                                    )}
                                  </div>
                                  <div className="flex shrink-0 items-center gap-3">
                                    <div className="text-right">
                                      <span className="text-muted-foreground text-xs">
                                        {t.from}{" "}
                                      </span>
                                      <span className="font-semibold text-sm tabular-nums">
                                        {formatMoney(
                                          {
                                            amountMinor: cab.fromAmountMinor,
                                            currency: cabinPricing.currency ?? currency,
                                          },
                                          resolvedLocale,
                                        )}{" "}
                                        {t.perPerson}
                                      </span>
                                    </div>
                                    {onBook ? (
                                      <Button
                                        size="sm"
                                        disabled={!cab.available}
                                        onClick={() => book(sail, cab.code)}
                                      >
                                        {t.book}
                                      </Button>
                                    ) : null}
                                  </div>
                                </li>
                              )
                            })}
                          </ul>
                        ) : (
                          // Fallback: no per-cabin pricing — cruise-level from-price + Book.
                          <div className="flex items-center justify-between gap-3 px-3 py-3">
                            {fallbackPrice != null ? (
                              <div className="text-right">
                                <span className="text-muted-foreground text-xs">{t.from} </span>
                                <span className="font-semibold text-sm tabular-nums">
                                  {formatMoney(
                                    {
                                      amountMinor: fallbackPrice,
                                      currency: sail.currency ?? currency,
                                    },
                                    resolvedLocale,
                                  )}
                                </span>
                              </div>
                            ) : (
                              <span />
                            )}
                            {onBook ? (
                              <Button size="sm" onClick={() => book(sail)}>
                                {t.book}
                              </Button>
                            ) : null}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              ) : (
                <div className="flex h-full items-center justify-center rounded-md border border-dashed p-6 text-center text-muted-foreground text-sm">
                  {t.selectDate}
                </div>
              )}
            </div>
          </div>
        )
      )}

      {/* Cabins */}
      {detail.cabins.length > 0 && (
        <div className="mt-10">
          <h2 className="mb-3 font-medium text-lg">{t.cabins}</h2>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {detail.cabins.map((cabin) => (
              <div key={cabin.id} className="flex flex-col overflow-hidden rounded-lg border">
                <div className="relative aspect-[4/3] w-full bg-muted">
                  {cabin.images[0] ? (
                    <img
                      src={cabin.images[0]}
                      alt={cabin.name}
                      className="h-full w-full object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-muted-foreground/60">
                      <Ship className="h-7 w-7" aria-hidden="true" />
                    </div>
                  )}
                </div>
                <div className="flex flex-1 flex-col gap-1.5 p-3">
                  <div className="font-medium text-sm leading-tight">{cabin.name}</div>
                  <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-muted-foreground text-xs">
                    {cabin.view && <span className="capitalize">{cabin.view}</span>}
                    {cabin.squareFeet && <span>{cabin.squareFeet} ft²</span>}
                    {cabin.capacityMax != null && (
                      <span className="flex items-center gap-1">
                        <Users className="h-3 w-3" /> {t.max} {cabin.capacityMax}
                      </span>
                    )}
                  </div>
                  {cabin.inclusions.length > 0 && (
                    <p className="mt-0.5 line-clamp-2 text-muted-foreground text-xs">
                      {cabin.inclusions.join(" · ")}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Itinerary */}
      {detail.itinerary.length > 0 && (
        <div className="mt-10">
          <h2 className="mb-3 font-medium text-lg">{t.itinerary}</h2>
          <ol className="space-y-2">
            {detail.itinerary.map((stop) => (
              <li
                key={`${stop.dayNumber}-${stop.portName ?? "sea"}`}
                className="flex gap-3 rounded-lg border p-3"
              >
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-secondary font-medium text-secondary-foreground text-xs">
                  {stop.dayNumber ?? "·"}
                </div>
                <div className="min-w-0">
                  <div className="font-medium text-sm">
                    {stop.isAtSea ? t.atSea : (stop.portName ?? t.atSea)}
                  </div>
                  <div className="flex flex-wrap gap-x-2 text-muted-foreground text-xs">
                    {stop.arrivalTime && <span>{stop.arrivalTime}</span>}
                    {stop.departureTime && <span>→ {stop.departureTime}</span>}
                  </div>
                  {stop.description && (
                    <p className="mt-0.5 text-muted-foreground text-xs">{stop.description}</p>
                  )}
                </div>
              </li>
            ))}
          </ol>
        </div>
      )}

      {/* Ship */}
      {detail.ship && (
        <div className="mt-10">
          <h2 className="mb-3 flex items-center gap-1.5 font-medium text-lg">
            <Ship className="h-4 w-4 text-muted-foreground" />
            {detail.ship.name ?? t.ship}
          </h2>
          <div className="rounded-lg border p-4">
            <div className="flex flex-wrap gap-x-6 gap-y-1 text-muted-foreground text-sm">
              {detail.ship.shipType && <span className="capitalize">{detail.ship.shipType}</span>}
              {detail.ship.capacity != null && (
                <span>
                  {t.capacity}: {detail.ship.capacity}
                </span>
              )}
              {detail.ship.decks != null && (
                <span>
                  {t.decks}: {detail.ship.decks}
                </span>
              )}
              {detail.ship.yearBuilt != null && <span>{detail.ship.yearBuilt}</span>}
            </div>
            {detail.ship.description && (
              <p className="mt-2 whitespace-pre-line text-muted-foreground text-sm">
                {detail.ship.description}
              </p>
            )}
          </div>
        </div>
      )}

      {/* About */}
      {detail.description && (
        <div className="mt-10">
          <h2 className="mb-3 font-medium text-lg">{t.about}</h2>
          <p className="whitespace-pre-line text-muted-foreground text-sm">{detail.description}</p>
        </div>
      )}
    </div>
  )
}
