"use client"

import { owningVerticalFor } from "@voyant-travel/catalog-contracts/indexer/contract"
import { cn } from "@voyant-travel/ui/lib/utils"
import type { ReactNode } from "react"
import { useMemo } from "react"
import { useCatalogUiI18nOrDefault } from "../i18n/index.js"
import type { CatalogSearchHit } from "../index.js"
import type {
  CatalogDetailEnrichment,
  CatalogDetailRenderSlot,
  CatalogDetailSheetProps,
} from "./catalog-detail-sheet.js"
import type { CatalogEnrichmentFetchers } from "./catalog-enrichment-fetchers.js"
import { stringField } from "./catalog-hit.js"
import {
  makeAccommodationCard,
  makeCharterCard,
  makeCruiseCard,
  makeProductCard,
} from "./catalog-page-cards.js"
import {
  formatSourceKind,
  makeAccommodationColumns,
  makeAccommodationFilters,
  makeCharterColumns,
  makeCharterFilters,
  makeCruiseColumns,
  makeCruiseFilters,
  makeProductColumns,
  makeProductFilters,
} from "./catalog-page-config.js"
import {
  type CatalogFilterSelections,
  CatalogSearchPage,
  type CatalogSearchTab,
  type CatalogSortOption,
} from "./catalog-search-page.js"
import { RetiredVerticalNotice } from "./retired-vertical-notice.js"

export interface CatalogPageSearchState {
  tab?: string
  q?: string
  page?: number
  market?: string
  locale?: string
  view?: "grid" | "list"
  sort?: CatalogSortOption
  filters?: CatalogFilterSelections
}

export interface CatalogPageProps {
  search?: CatalogPageSearchState
  onTabChange?: (tabId: string) => void
  onQueryChange?: (query: string) => void
  onPageChange?: (page: number) => void
  onViewChange?: (view: "grid" | "list") => void
  onSortChange?: (sort: CatalogSortOption) => void
  onFiltersChange?: (filters: CatalogFilterSelections) => void
  toolbarEnd?: ReactNode
  formatSupplier?: (id: string | number) => string
  onBookHit?: (hit: CatalogSearchHit, entityModule: string) => void
  onBookDeparture?: (
    hit: CatalogSearchHit,
    entityModule: string,
    departure: NonNullable<CatalogDetailEnrichment["departures"]>[number],
  ) => void
  onBookOption?: (
    hit: CatalogSearchHit,
    entityModule: string,
    departure: NonNullable<CatalogDetailEnrichment["departures"]>[number],
    option: NonNullable<CatalogDetailEnrichment["options"]>[number],
  ) => void
  onOpenProductEditor?: (hit: CatalogSearchHit) => void
  /**
   * Open the full, URL-addressable detail page for a result (e.g. in a new
   * tab) instead of the in-page detail sheet. Bound per vertical and passed
   * the clicked hit + its vertical; return nothing. Provide it only for
   * verticals that have a dedicated detail page — others keep the sheet.
   */
  onOpenProductDetail?: (hit: CatalogSearchHit, vertical: string) => void
  /**
   * Explicit detail-enrichment callback. When set, takes precedence over
   * `enrichmentFetchers` — pass this when you need full control over the
   * request (auth headers, locale resolution, side-channel data). The
   * default integration uses `enrichmentFetchers` for the common case.
   */
  onLoadProductDetail?: (
    hit: CatalogSearchHit,
    vertical?: string,
  ) => Promise<CatalogDetailEnrichment | null>
  /**
   * Declarative detail-enrichment fetchers. Build with
   * `createCatalogEnrichmentFetchers({ baseUrl, … })`. When provided
   * (and `onLoadProductDetail` is not), the detail sheet calls
   * `fetchers.loadProductDetail` on open. This is the recommended way
   * to wire up the sheet — it pins the route contract with
   * `createProductContentRoutes` so a missing server-side mount is
   * caught immediately instead of rendering an empty sheet.
   */
  enrichmentFetchers?: CatalogEnrichmentFetchers
  detailSheetWidth?: CatalogDetailSheetProps["width"]
  detailHeaderExtras?: CatalogDetailSheetProps["headerExtras"]
  renderDetailBrochure?: CatalogDetailRenderSlot
  renderDetailMedia?: CatalogDetailRenderSlot
  renderDetailItineraryDay?: CatalogDetailSheetProps["renderItineraryDay"]
  renderDetailExtraSections?: CatalogDetailRenderSlot
  /**
   * Renders the supplier value in the detail sheet's Attributes tab as
   * a clickable link to the supplier record. Templates wire this with
   * their router's `Link` component. When omitted, the supplier shows
   * as plain text (the resolved supplier name via `formatSupplier`).
   */
  renderSupplierLink?: CatalogDetailSheetProps["renderSupplierLink"]
  /**
   * Inline tags editor for the detail sheet. When set, the Tags row in
   * the Overview tab becomes editable; the callback persists the next
   * tag list (e.g. a product PATCH). Owned products only on the
   * operator side — sourced rows pass through without an editor.
   */
  onTagsChange?: CatalogDetailSheetProps["onTagsChange"]
  /**
   * Restrict the page to one catalog vertical and hide the vertical tab
   * switcher. Use this when routing owns the vertical selection.
   */
  vertical?: string
  title?: ReactNode
  className?: string
  /**
   * Hide the built-in search input. Use when an embedding surface provides its
   * own unified search box and drives `search.q`/`onQueryChange` externally.
   */
  hideSearchInput?: boolean
}

export function CatalogPage({
  search = {},
  onTabChange,
  onQueryChange,
  onPageChange,
  onViewChange,
  onSortChange,
  onFiltersChange,
  toolbarEnd,
  hideSearchInput,
  formatSupplier = (id) => String(id),
  onBookHit,
  onBookDeparture,
  onBookOption,
  onOpenProductEditor,
  onOpenProductDetail,
  onLoadProductDetail,
  enrichmentFetchers,
  detailSheetWidth,
  detailHeaderExtras,
  renderDetailBrochure,
  renderDetailMedia,
  renderDetailItineraryDay,
  renderDetailExtraSections,
  renderSupplierLink,
  onTagsChange,
  vertical,
  title,
  className,
}: CatalogPageProps) {
  const { locale, messages: rootMessages } = useCatalogUiI18nOrDefault()
  const messages = rootMessages.catalogPage
  const resolvedLoadProductDetail = useMemo(
    () => onLoadProductDetail ?? enrichmentFetchers?.loadProductDetail,
    [onLoadProductDetail, enrichmentFetchers],
  )
  // Each tab binds the loader to its vertical so the detail sheet fetches
  // from the right content route (e.g. cruises → /v1/admin/cruises). Without
  // this, only the products tab loaded enrichment and every other vertical's
  // sheet rendered the bare projection.
  const detailLoaderFor = (vertical: string) =>
    resolvedLoadProductDetail
      ? (hit: CatalogSearchHit) => resolvedLoadProductDetail(hit, vertical)
      : undefined
  // Open the dedicated detail page (e.g. new tab), bound per vertical. Only
  // verticals with a real detail page get it; the rest fall back to the sheet.
  const detailOpenerFor = (vertical: string) =>
    onOpenProductDetail ? (hit: CatalogSearchHit) => onOpenProductDetail(hit, vertical) : undefined
  // Lazy per-cabin pricing loader, bound per vertical (cruises only today).
  const loadDeparturePricing = enrichmentFetchers?.loadDeparturePricing
  const departurePricingLoaderFor = (vertical: string) =>
    loadDeparturePricing
      ? (hit: CatalogSearchHit, sailingRef: string) =>
          loadDeparturePricing(hit, sailingRef, vertical)
      : undefined
  const supplierFormatter = (value: unknown) =>
    typeof value === "string" ? formatSupplier(value) : String(value ?? "")
  const sourceKindFormatter = (value: unknown) =>
    typeof value === "string" || typeof value === "number"
      ? formatSourceKind(value, messages)
      : String(value ?? "")

  const tabs: CatalogSearchTab[] = [
    {
      id: "products",
      label: messages.tabs.products,
      vertical: "products",
      columns: makeProductColumns(formatSupplier, messages, locale),
      filterFields: makeProductFilters(formatSupplier, messages, locale),
      card: makeProductCard(formatSupplier, messages, locale),
      sorts: ["price-asc", "price-desc", "departure-asc", "newest"],
      detailFormatters: {
        supplierId: supplierFormatter,
        "source.kind": sourceKindFormatter,
      },
      detailActions: [
        ...(onBookHit
          ? [
              {
                label: messages.actions.bookThis,
                onClick: (hit: CatalogSearchHit) => onBookHit(hit, "products"),
              },
            ]
          : []),
        ...(onOpenProductEditor
          ? [
              {
                label: messages.actions.openEditor,
                onClick: onOpenProductEditor,
                visible: (hit: CatalogSearchHit) => {
                  const kind = stringField(hit, "source.kind", null)
                  // Owned products are the only ones that have an editor —
                  // sourced rows are read-only mirrors of the upstream.
                  return kind === "owned" || kind == null
                },
              },
            ]
          : []),
      ],
      onLoadDetail: detailLoaderFor("products"),
      onBookDeparture: onBookDeparture
        ? (hit, departure) => onBookDeparture(hit, "products", departure)
        : undefined,
      onBookOption: onBookOption
        ? (hit, departure, option) => onBookOption(hit, "products", departure, option)
        : undefined,
    },
    {
      id: "cruises",
      label: messages.tabs.cruises,
      vertical: "cruises",
      columns: makeCruiseColumns(formatSupplier, messages, locale),
      filterFields: makeCruiseFilters(formatSupplier, messages, locale),
      imageField: "thumbnailUrl",
      card: makeCruiseCard(formatSupplier, messages, locale),
      detailFormatters: {
        lineSupplierId: supplierFormatter,
        "source.kind": sourceKindFormatter,
      },
      onLoadDetail: detailLoaderFor("cruises"),
      onLoadDeparturePricing: departurePricingLoaderFor("cruises"),
    },
    {
      id: "charters",
      label: messages.tabs.charters,
      vertical: "charters",
      columns: makeCharterColumns(formatSupplier, messages, locale),
      filterFields: makeCharterFilters(formatSupplier, messages),
      imageField: "heroImageUrl",
      card: makeCharterCard(formatSupplier, locale),
      sorts: ["price-asc", "price-desc", "newest"],
      detailFormatters: {
        lineSupplierId: supplierFormatter,
        "source.kind": sourceKindFormatter,
      },
      onLoadDetail: detailLoaderFor("charters"),
    },
    {
      id: "accommodations",
      label: messages.tabs.accommodations,
      vertical: "accommodations",
      columns: makeAccommodationColumns(formatSupplier, messages, locale),
      filterFields: makeAccommodationFilters(formatSupplier, messages),
      card: makeAccommodationCard(formatSupplier, locale),
      detailFormatters: {
        supplierId: supplierFormatter,
        "source.kind": sourceKindFormatter,
      },
      onLoadDetail: detailLoaderFor("accommodations"),
    },
  ]
  // Bind the new-tab detail opener per vertical on every tab — when the host
  // provides `onOpenProductDetail`, results open the dedicated detail page
  // (new tab) instead of the in-page sheet, for whichever vertical is shown.
  const tabsWithDetail = tabs.map((tab) => ({
    ...tab,
    onOpenDetail: detailOpenerFor(tab.vertical),
  }))
  const visibleTabs = vertical
    ? tabsWithDetail.filter((tab) => tab.id === vertical || tab.vertical === vertical)
    : tabsWithDetail
  const activeTab = vertical ? visibleTabs[0]?.id : (search.tab ?? tabs[0]?.id)

  // Old standalone deep links (`?tab=extras`, or a host routing `vertical="extras"`)
  // must not silently fall back to Products — they get an explanation of where
  // the Extra now lives instead.
  const requestedVertical = vertical ?? search.tab
  const retiredOwner = requestedVertical ? owningVerticalFor(requestedVertical) : undefined
  if (requestedVertical && retiredOwner) {
    return (
      <div className={cn("mx-auto w-full max-w-screen-2xl", className)}>
        <RetiredVerticalNotice
          vertical={requestedVertical}
          onGoToOwner={
            vertical || !onTabChange ? undefined : () => onTabChange(retiredOwner ?? "products")
          }
        />
      </div>
    )
  }

  return (
    <div className={cn("mx-auto w-full max-w-screen-2xl", className)}>
      <CatalogSearchPage
        tabs={visibleTabs}
        activeTab={activeTab}
        onActiveTabChange={(id) => {
          if (!vertical) onTabChange?.(id)
        }}
        showTabs={!vertical}
        hideSearchInput={hideSearchInput}
        query={search.q ?? ""}
        onQueryChange={(q) => onQueryChange?.(q)}
        page={search.page ?? 1}
        onPageChange={(p) => onPageChange?.(p)}
        view={search.view}
        onViewChange={onViewChange}
        sort={search.sort}
        onSortChange={onSortChange}
        filters={search.filters}
        onFiltersChange={onFiltersChange}
        market={search.market}
        locale={search.locale}
        toolbarEnd={toolbarEnd}
        detailSheetWidth={detailSheetWidth}
        detailHeaderExtras={detailHeaderExtras}
        renderDetailBrochure={renderDetailBrochure}
        renderDetailMedia={renderDetailMedia}
        renderDetailItineraryDay={renderDetailItineraryDay}
        renderDetailExtraSections={renderDetailExtraSections}
        renderSupplierLink={renderSupplierLink}
        onTagsChange={onTagsChange}
        title={
          title ?? (
            <div>
              <h1 className="font-semibold text-2xl">{messages.title}</h1>
              <p className="text-muted-foreground text-sm">{messages.description}</p>
            </div>
          )
        }
        searchPlaceholder={messages.searchPlaceholder}
      />
    </div>
  )
}
