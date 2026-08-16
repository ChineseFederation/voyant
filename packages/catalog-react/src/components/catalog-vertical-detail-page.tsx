"use client"

import { Image as ImageIcon } from "lucide-react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useCatalogUiI18nOrDefault, useCatalogUiMessagesOrDefault } from "../i18n/index.js"
import type { CatalogSearchHit } from "../index.js"
import { fetchCatalogIndexDocument, fetchCatalogSlots, useVoyantCatalogContext } from "../index.js"
import { type CatalogDetailEnrichment, CatalogDetailView } from "./catalog-detail-sheet.js"
import {
  type CatalogSlotAvailability,
  createCatalogEnrichmentFetchers,
} from "./catalog-enrichment-fetchers.js"

/**
 * Generic, full-page, URL-addressable detail page for the non-package catalog
 * surfaces (cruises, accommodations, excursions, tours). Reads the rich content
 * **directly from the content route by id** (the same source the detail sheet
 * uses — keyed by the catalog id, so it does not depend on indexed id-filter
 * support) and renders the shared `CatalogDetailView`. Opened in a new tab from
 * the surface's results. Packages keep their own bespoke detail page.
 *
 * Presentational: breadcrumbs (`onBreadcrumbs`) and supplier-name resolution
 * (`formatSupplier`) are injected by the host; the
 * content base URL + fetcher come from `VoyantCatalogProvider`.
 */

const DEFAULT_CONTENT_BASE_BY_VERTICAL: Record<string, string> = {
  products: "/v1/admin/products",
  cruises: "/v1/admin/cruises",
  accommodations: "/v1/admin/accommodations",
}

type Status = "loading" | "ready" | "notfound" | "error"

export type CatalogVerticalDetailVertical = "products" | "cruises" | "accommodations"

export interface CatalogVerticalDetailBreadcrumb {
  label: string
  href?: string
}

export interface CatalogVerticalDetailPageProps {
  id: string
  /** Content vertical backing the surface (excursions/tours → products). */
  vertical: CatalogVerticalDetailVertical
  /** Localized surface name — header fallback + breadcrumb root. */
  surfaceLabel: string
  /** Href of the surface's browse page, e.g. `/catalog/cruises`. */
  surfaceHref: string
  /** BCP-47 locale forwarded to the content route. Defaults to the i18n locale. */
  locale?: string
  /** Per-vertical content mount paths. Defaults to the operator admin routes. */
  contentBasePathByVertical?: Record<string, string>
  /** Resolve a supplier id to a display name (host's supplier directory). */
  formatSupplier?: (id: string) => string
  /** Optional booking handoff supplied only by deployments with an admitted UI command. */
  onBook?: (
    vertical: string,
    id: string,
    opts: {
      departureId?: string
      optionId?: string
      departureDate?: string | null
      name?: string | null
      heroImageUrl?: string | null
      sourceKind?: string | null
      sourceProvider?: string | null
      sourceConnectionId?: string | null
      sourceRef?: string | null
    },
  ) => void
  /** Publish breadcrumbs as the resolved name changes (host feeds its breadcrumb sink). */
  onBreadcrumbs?: (crumbs: CatalogVerticalDetailBreadcrumb[]) => void
}

export function CatalogVerticalDetailPage({
  id,
  vertical,
  surfaceLabel,
  surfaceHref,
  locale,
  contentBasePathByVertical = DEFAULT_CONTENT_BASE_BY_VERTICAL,
  formatSupplier,
  onBook,
  onBreadcrumbs,
}: CatalogVerticalDetailPageProps) {
  const { baseUrl, fetcher } = useVoyantCatalogContext()
  const messages = useCatalogUiMessagesOrDefault().catalogBrowser
  const { locale: resolvedLocale } = useCatalogUiI18nOrDefault()
  const contentLocale = locale ?? resolvedLocale

  // `formatSupplier` is backed by the host's supplier directory, so its identity
  // changes when that query settles or refetches. Depending on it directly
  // rebuilt `fetchers` and re-ran the content + slots effect each time — one
  // page load issued the content route three times. Read it through a ref so
  // the directory can land without re-fetching the record.
  const formatSupplierRef = useRef(formatSupplier)
  formatSupplierRef.current = formatSupplier
  const stableFormatSupplier = useCallback(
    (supplierId: string) => formatSupplierRef.current?.(supplierId) ?? supplierId,
    [],
  )

  const fetchers = useMemo(
    () =>
      createCatalogEnrichmentFetchers({
        baseUrl,
        contentBasePathByVertical,
        credentials: "include",
        locale: contentLocale,
        formatSupplier: stableFormatSupplier,
        loadSlotAvailability: (productId) =>
          fetchCatalogSlots({ baseUrl, fetcher }, { entityModule: "products", entityId: productId })
            .then(
              (res) => new Map(res.rows.map((slot) => [slot.id, slot as CatalogSlotAvailability])),
            )
            .catch(() => new Map<string, CatalogSlotAvailability>()),
      }),
    [baseUrl, fetcher, contentBasePathByVertical, contentLocale, stableFormatSupplier],
  )

  // The index projection carries everything the detail body renders off
  // `hit.document.fields` — price, offers, status, categories, destinations and
  // the whole Attributes tab. Entered by id there is no result row to carry it,
  // so read the document by id; the rich prose/itinerary/departures still come
  // from the content route via the enrichment. `indexFields` stays empty when
  // the id isn't indexed, which degrades to the previous behaviour rather than
  // failing the page.
  const [indexFields, setIndexFields] = useState<Record<string, unknown>>({})
  const hit = useMemo<CatalogSearchHit>(
    () => ({ id, score: 0, document: { id, fields: indexFields } }),
    [id, indexFields],
  )

  const [enrichment, setEnrichment] = useState<CatalogDetailEnrichment | null>(null)
  const [status, setStatus] = useState<Status>("loading")

  useEffect(() => {
    let cancelled = false
    setStatus("loading")
    setEnrichment(null)
    setIndexFields({})
    void (async () => {
      // The index read is best-effort and must not gate the page: a failure
      // costs the attributes, not the record.
      const indexed = fetchCatalogIndexDocument({ baseUrl, fetcher }, { vertical, id }).catch(
        () => null,
      )
      try {
        const enr = await fetchers.loadProductDetail(
          { id, score: 0, document: { id, fields: {} } },
          vertical,
        )
        if (cancelled) return
        if (!enr) {
          setStatus("notfound")
          return
        }
        setEnrichment(enr)
        setStatus("ready")
      } catch {
        if (!cancelled) setStatus("error")
        return
      }
      const doc = await indexed
      if (!cancelled && doc) setIndexFields(doc.document.fields)
    })()
    return () => {
      cancelled = true
    }
  }, [id, vertical, fetchers, baseUrl, fetcher])

  const name = enrichment?.name ?? null
  useEffect(() => {
    if (!onBreadcrumbs) return
    onBreadcrumbs(
      name
        ? [{ label: surfaceLabel, href: surfaceHref }, { label: name }]
        : [{ label: surfaceLabel, href: surfaceHref }],
    )
  }, [name, surfaceLabel, surfaceHref, onBreadcrumbs])

  const book = (departureId?: string, optionId?: string, departureDate?: string | null) => {
    onBook?.(vertical, id, {
      ...(departureId ? { departureId } : {}),
      ...(optionId ? { optionId } : {}),
      departureDate: departureDate ?? null,
      name: enrichment?.name ?? null,
      heroImageUrl: enrichment?.heroImageUrl ?? null,
      sourceKind: enrichment?.sourceKind ?? null,
      sourceProvider: enrichment?.sourceProvider ?? null,
      sourceConnectionId: enrichment?.sourceConnectionId ?? null,
      sourceRef: enrichment?.sourceRef ?? null,
    })
  }

  if (status === "loading") {
    return (
      <div className="mx-auto w-full max-w-screen-2xl">
        <div className="h-7 w-1/3 animate-pulse rounded bg-muted/40" />
        <div className="mt-2 h-4 w-1/4 animate-pulse rounded bg-muted/20" />
        <div className="mt-6 h-72 w-full animate-pulse rounded-lg bg-muted/30" />
      </div>
    )
  }

  if (status === "notfound" || status === "error" || !enrichment) {
    return (
      <div className="mx-auto w-full max-w-screen-2xl px-6 py-6 lg:px-8">
        <div className="rounded-md border border-dashed p-8 text-center text-muted-foreground text-sm">
          {status === "notfound" ? messages.detail.notFound : messages.detail.loadError}
        </div>
      </div>
    )
  }

  const heroUrl = enrichment.heroImageUrl
  // `enrichment.supplier` was resolved once, when the content was mapped. If
  // the content request won the race against the supplier directory, that
  // snapshot is the raw id — and nothing refetches to correct it, because the
  // fetchers deliberately do not depend on the directory. So resolve again
  // here, where the directory is whatever it is now. The lookup returns its
  // input on a miss, which makes it idempotent over an already-resolved name.
  const subtitle = enrichment.supplier
    ? (formatSupplier?.(enrichment.supplier) ?? enrichment.supplier)
    : null

  return (
    <div className="mx-auto w-full max-w-screen-2xl px-6 py-6 lg:px-8">
      {/* Header */}
      <div className="flex items-start gap-4">
        {heroUrl ? (
          <img
            src={heroUrl}
            alt={name ?? ""}
            className="h-20 w-28 shrink-0 rounded-lg object-cover ring-1 ring-border"
            loading="lazy"
          />
        ) : (
          <div className="flex h-20 w-28 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
            <ImageIcon className="h-7 w-7" aria-hidden="true" />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <h1 className="font-semibold text-2xl">{name ?? surfaceLabel}</h1>
          {subtitle && <p className="mt-1 text-muted-foreground text-sm">{subtitle}</p>}
        </div>
      </div>

      {/* Shared tabbed detail body */}
      <div className="mt-6">
        <CatalogDetailView
          hit={hit}
          enrichment={enrichment}
          vertical={vertical}
          onLoadDeparturePricing={(h, sailingRef) =>
            fetchers.loadDeparturePricing(h, sailingRef, vertical)
          }
          {...(onBook
            ? {
                onBookDeparture: (_h, departure) =>
                  book(departure.sourceRef ?? departure.id, undefined, departure.startsAt),
                onBookOption: (_h, departure, option) =>
                  book(departure.sourceRef ?? departure.id, option.id, departure.startsAt),
              }
            : {})}
        />
      </div>
    </div>
  )
}
