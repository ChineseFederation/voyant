"use client"

import type { ColumnDef } from "@tanstack/react-table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@voyant-travel/ui/components/tabs"
import { type ReactNode, useCallback, useState } from "react"
import { useCatalogUiMessagesOrDefault } from "../i18n/index.js"
import type { CatalogSearchHit } from "../index.js"
import type { CatalogCardConfig } from "./catalog-card.js"
import type {
  CatalogDetailAction,
  CatalogDetailEnrichment,
  CatalogDetailRenderSlot,
  CatalogDetailSheetProps,
} from "./catalog-detail-sheet.js"
import { CatalogSearchInput } from "./catalog-search-input.js"
import { type CatalogFilterSelections, CatalogTabPanel } from "./catalog-search-tab-panel.js"

/**
 * Result sort options. Mirrors `CatalogSearchSort` from `@voyant-travel/catalog-react`
 * (not re-exported there, so kept as a literal union here). The shell maps the
 * selection straight onto the search request's `sort`.
 */
export type CatalogSortOption =
  | "relevance"
  | "price-asc"
  | "price-desc"
  | "departure-asc"
  | "newest"

/**
 * Declares a filter on a tab. Two kinds:
 *   - `facet`  (default) — multi-select against live facet buckets. Hidden
 *                          when the search response yields no buckets and
 *                          nothing is currently selected.
 *   - `range`  — numeric min/max range. Always visible (no facet response
 *                  needed). Use `format: "currency"` for money fields
 *                  stored as integer cents (e.g. `sellAmountCents`).
 */
export type CatalogFilterField = CatalogFacetFilterField | CatalogRangeFilterField

export interface CatalogFacetFilterField {
  kind?: "facet"
  /** Field name on the indexer document (e.g. "status", "bookingMode"). */
  field: string
  /** Human-readable group label (already localized). */
  label: string
  /**
   * Optional value formatter. Use it when the underlying field is an ID and
   * you want the dropdown to show the human-readable label instead — e.g.
   * resolving `lineSupplierId` against a `Map<id, name>`. Returns the raw
   * value as a string by default.
   */
  formatValue?: (value: string | number) => string
  /**
   * How to order the facet buckets. Default `"count"` keeps the index's
   * descending-by-count order. `"value-desc"`/`"value-asc"` sort by the bucket
   * value numerically when possible (e.g. star ratings 5 → 0), else
   * lexicographically.
   */
  sortValues?: "count" | "value-desc" | "value-asc"
}

export interface CatalogRangeFilterField {
  kind: "range"
  field: string
  label: string
  step?: number
  minPlaceholder?: string
  maxPlaceholder?: string
  /** When the field stores cents, set `"currency"` + `currency`. */
  format?: "number" | "currency"
  currency?: string
}

/**
 * One tab in the catalog search page. Each tab maps to a single vertical
 * (`products`, `cruises`, `accommodations`, etc.) and supplies its own column
 * definitions so per-vertical UI packages own their own visual language.
 */
export interface CatalogSearchTab {
  /** Stable id used as the TabsTrigger value + queryKey segment. */
  id: string
  /** Human-readable tab label (already localized). */
  label: string
  /** The catalog vertical to query — mapped to the slice's `vertical`. */
  vertical: string
  /**
   * Optional row/card open override. When set, clicking a result calls this
   * instead of opening the in-page detail sheet — use it to route to a
   * full, URL-addressable detail page (e.g. open in a new tab). Verticals
   * without a dedicated detail page omit it and keep the sheet.
   */
  onOpenDetail?: (hit: CatalogSearchHit) => void
  /**
   * Per-tab column definitions for the results data table. Each column
   * receives the full `CatalogSearchHit` and projects whatever fields the
   * vertical's indexer document carries.
   */
  columns: ColumnDef<CatalogSearchHit, unknown>[]
  /**
   * Optional facet declarations. When set, the page requests these as
   * `facets` in the search request and renders a chip group per field
   * above the results. Click-to-toggle multi-select; selections are
   * passed back as `filters[]`.
   */
  filterFields?: CatalogFilterField[]
  /**
   * Facet fields the surface pins for everyone. They are already absent from
   * `filterFields`, but they are still present in `filters` — the surface has
   * to send them with the search — so selection accounting has to be told to
   * ignore them. Otherwise a pristine family page reports "Clear all" for a
   * choice the reader never made and could not undo.
   */
  hiddenFilterFields?: string[]
  /**
   * Optional empty-state ReactNode — shown when the tab has no hits for
   * the current query. Defaults to a simple "no results" message.
   */
  emptyState?: ReactNode
  /**
   * Indexer field that carries the entity's primary image URL. Defaults
   * to `thumbnailUrl`. Cruises / charters use `heroImageUrl`.
   */
  imageField?: string
  /**
   * Optional merchandising-card mapping. When set, the tab gains a grid
   * (card) view alongside the table, and the grid/list toggle appears. The
   * card projects indexed fields only (no extra fetch) — see `CatalogCard`.
   */
  card?: CatalogCardConfig
  /**
   * Non-relevance sort options to offer for this tab. `relevance` is always
   * first. Defaults to `["price-asc","price-desc","newest"]` when the card
   * declares a price field, else `["newest"]`.
   */
  sorts?: CatalogSortOption[]
  /**
   * Optional per-field formatters used by the detail sheet to render
   * human-readable values (e.g. resolve `lineSupplierId` → supplier name).
   * The same `formatValue` you pass on a `CatalogFacetFilterField` should
   * usually appear here too.
   */
  detailFormatters?: Record<string, (value: unknown) => ReactNode>
  /**
   * Optional footer actions shown at the bottom of the detail sheet
   * (e.g. "Open in editor" → router push). Use them when you want a row
   * click to do more than just "view details."
   */
  detailActions?: CatalogDetailAction[]
  /** Optional sheet width override for this tab's detail surface. */
  detailSheetWidth?: CatalogDetailSheetProps["width"]
  /** Optional header action area for this tab's detail sheet. */
  detailHeaderExtras?: CatalogDetailSheetProps["headerExtras"]
  /** Optional dedicated brochure section for this tab's detail sheet. */
  renderDetailBrochure?: CatalogDetailRenderSlot
  /** Optional media renderer for this tab's detail sheet. */
  renderDetailMedia?: CatalogDetailRenderSlot
  /** Optional richer itinerary day renderer for this tab's detail sheet. */
  renderDetailItineraryDay?: CatalogDetailSheetProps["renderItineraryDay"]
  /** Optional extra sections rendered above this tab's detail footer actions. */
  renderDetailExtraSections?: CatalogDetailRenderSlot
  /**
   * Optional enrichment loader. Called when the detail sheet opens for
   * a hit. Returns the rich content shape (description, itinerary,
   * media, options, policies, supplier) so the sheet can render full
   * detail without expanding the search-time projection — keeps the
   * search index lean and lets every entity carry rich content via
   * the catalog content service.
   *
   * Templates wire this per-vertical to call `/v1/admin/<vertical>/:id/content`
   * (which `getProductContent` / `getCruiseContent` / etc back).
   * Returns null when the entity has no content (rare — surfaces as a
   * subtle "no extra detail" hint in the sheet).
   */
  onLoadDetail?: (hit: CatalogSearchHit) => Promise<CatalogDetailEnrichment | null>
  /** Lazy per-cabin pricing loader for cruise departures (see detail sheet). */
  onLoadDeparturePricing?: CatalogDetailSheetProps["onLoadDeparturePricing"]
  /**
   * Called when the operator clicks a per-departure Book button on a
   * catalog row. Templates typically navigate to the catalog booking
   * journey with the departure id pinned.
   */
  onBookDeparture?: (
    hit: CatalogSearchHit,
    departure: NonNullable<CatalogDetailEnrichment["departures"]>[number],
  ) => void
  /** Per-option Book button inside the expanded departure panel. */
  onBookOption?: (
    hit: CatalogSearchHit,
    departure: NonNullable<CatalogDetailEnrichment["departures"]>[number],
    option: NonNullable<CatalogDetailEnrichment["options"]>[number],
  ) => void
}

// Grid cards are bigger, so show fewer per page; the dense list view shows more
// (the `pageSize` prop is the list size).
export interface CatalogSearchPageProps {
  tabs: CatalogSearchTab[]
  /** Default tab id; falls back to the first tab. */
  defaultTab?: string
  /** Items per page in the list view (grid view uses a smaller fixed size). Default `40`. */
  pageSize?: number
  /**
   * Optional title above the search bar. Templates that use TanStack
   * Start's page-level title elements should pass null and render their
   * own.
   */
  title?: ReactNode
  /** Placeholder text for the search input. */
  searchPlaceholder?: string
  /**
   * Hide the built-in search input. Use when an embedding surface provides its
   * own unified search box and drives `query`/`onQueryChange` externally.
   */
  hideSearchInput?: boolean
  /** Debounce on keystrokes, milliseconds. Default 200. */
  queryDebounceMs?: number
  /**
   * Controlled active-tab id. When provided, callers must also pass
   * `onActiveTabChange` and the tab state is owned by the parent (e.g. a
   * router-driven URL state). Omit for uncontrolled internal state.
   */
  activeTab?: string
  onActiveTabChange?: (tabId: string) => void
  /** Hide the tab switcher when the parent route already selects one vertical. */
  showTabs?: boolean
  /** Controlled query string (already debounced if you want to skip the debounce here). */
  query?: string
  onQueryChange?: (q: string) => void
  /** Controlled current page (1-indexed) for the active tab. */
  page?: number
  onPageChange?: (page: number) => void
  /** Controlled grid/list view mode (e.g. URL-persisted). Uncontrolled when omitted. */
  view?: "grid" | "list"
  onViewChange?: (view: "grid" | "list") => void
  /** Controlled sort option (e.g. URL-persisted). Uncontrolled when omitted. */
  sort?: CatalogSortOption
  onSortChange?: (sort: CatalogSortOption) => void
  /** Controlled filter selections (e.g. URL-persisted). Uncontrolled when omitted. */
  filters?: CatalogFilterSelections
  onFiltersChange?: (filters: CatalogFilterSelections) => void
  /** Catalog slice market override. */
  market?: string
  /** Catalog slice locale override. */
  locale?: string
  /** Optional controls rendered next to the search input. */
  toolbarEnd?: ReactNode
  /** Optional default detail sheet width for all tabs. Tabs may override it. */
  detailSheetWidth?: CatalogDetailSheetProps["width"]
  /** Optional default header action area for all tab detail sheets. */
  detailHeaderExtras?: CatalogDetailSheetProps["headerExtras"]
  /** Optional default brochure section for all tab detail sheets. */
  renderDetailBrochure?: CatalogDetailRenderSlot
  /** Optional default media renderer for all tab detail sheets. */
  renderDetailMedia?: CatalogDetailRenderSlot
  /** Optional default richer itinerary day renderer for all tab detail sheets. */
  renderDetailItineraryDay?: CatalogDetailSheetProps["renderItineraryDay"]
  /** Optional default extra sections rendered above detail footer actions. */
  renderDetailExtraSections?: CatalogDetailRenderSlot
  /** Optional supplier-link renderer for the detail sheet's Attributes tab. */
  renderSupplierLink?: CatalogDetailSheetProps["renderSupplierLink"]
  /**
   * Optional inline tags editor handler for the detail sheet. When set,
   * the sheet's Tags row becomes editable; the callback persists the
   * next tag list (typically a PATCH to the entity).
   */
  onTagsChange?: CatalogDetailSheetProps["onTagsChange"]
}

/**
 * Generic tabbed search shell. Owns the search input, mode toggle,
 * tab state, and per-tab data fetching (search + facets + pagination).
 * Per-vertical visuals come from the tab's column definitions so this
 * shell stays vertical-agnostic.
 */
export function CatalogSearchPage({
  tabs,
  defaultTab,
  pageSize = 40,
  title,
  searchPlaceholder,
  hideSearchInput = false,
  queryDebounceMs = 200,
  activeTab: activeTabProp,
  onActiveTabChange,
  showTabs = true,
  query: queryProp,
  onQueryChange,
  page: pageProp,
  onPageChange,
  view,
  onViewChange,
  sort,
  onSortChange,
  filters,
  onFiltersChange,
  market,
  locale,
  toolbarEnd,
  detailSheetWidth,
  detailHeaderExtras,
  renderDetailBrochure,
  renderDetailMedia,
  renderDetailItineraryDay,
  renderDetailExtraSections,
  renderSupplierLink,
  onTagsChange,
}: CatalogSearchPageProps) {
  const messages = useCatalogUiMessagesOrDefault().catalogPage
  const resolvedSearchPlaceholder = searchPlaceholder ?? messages.searchPlaceholder
  const [internalActiveTab, setInternalActiveTab] = useState<string>(
    defaultTab ?? tabs[0]?.id ?? "",
  )
  const activeTab = activeTabProp ?? internalActiveTab
  const setActiveTab = (next: string) => {
    if (onActiveTabChange) onActiveTabChange(next)
    if (activeTabProp == null) setInternalActiveTab(next)
  }

  // Typing buffer + debounce live in `CatalogSearchInput`, which every catalog
  // search box shares; this page only owns where the settled query goes —
  // out to the caller when controlled, into local state when not.
  const [internalQuery, setInternalQuery] = useState(queryProp ?? "")
  const debouncedQuery = queryProp ?? internalQuery
  const emitQuery = useCallback(
    (next: string) => {
      if (onQueryChange) onQueryChange(next)
      else setInternalQuery(next)
    },
    [onQueryChange],
  )

  if (tabs.length === 0) {
    return (
      <div className="rounded-md border border-dashed p-6 text-sm text-muted-foreground">
        {messages.search.noTabsConfigured}
      </div>
    )
  }

  const activeTabConfig = tabs.find((tab) => tab.id === activeTab) ?? (tabs[0] as CatalogSearchTab)
  const shouldRenderTabs = showTabs && tabs.length > 1
  const renderTabBody = (tab: CatalogSearchTab) => (
    <>
      {/* The search box lives inside each vertical body — it queries that
          vertical index, so it belongs with the vertical, not the page. An
          embedding surface can hide it and drive `query` externally. */}
      {!hideSearchInput && (
        <CatalogSearchInput
          value={debouncedQuery}
          onChange={emitQuery}
          placeholder={resolvedSearchPlaceholder}
          debounceMs={queryDebounceMs}
          className="max-w-xl"
        />
      )}
      <CatalogTabPanel
        tab={tab}
        query={debouncedQuery}
        market={market}
        locale={locale}
        pageSize={pageSize}
        page={tab.id === activeTab ? pageProp : undefined}
        onPageChange={tab.id === activeTab ? onPageChange : undefined}
        view={view}
        onViewChange={onViewChange}
        sort={sort}
        onSortChange={onSortChange}
        filters={filters}
        onFiltersChange={onFiltersChange}
        detailSheetWidth={detailSheetWidth}
        detailHeaderExtras={detailHeaderExtras}
        renderDetailBrochure={renderDetailBrochure}
        renderDetailMedia={renderDetailMedia}
        renderDetailItineraryDay={renderDetailItineraryDay}
        renderDetailExtraSections={renderDetailExtraSections}
        renderSupplierLink={renderSupplierLink}
        onTagsChange={onTagsChange}
        messages={messages}
      />
    </>
  )

  return (
    <div className="flex flex-col gap-4">
      {title}
      {toolbarEnd ? (
        <div className="flex flex-wrap items-center justify-end gap-2">{toolbarEnd}</div>
      ) : null}
      {shouldRenderTabs ? (
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            {tabs.map((tab) => (
              <TabsTrigger key={tab.id} value={tab.id}>
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>
          {tabs.map((tab) => (
            <TabsContent key={tab.id} value={tab.id} className="mt-4 flex flex-col gap-4">
              {renderTabBody(tab)}
            </TabsContent>
          ))}
        </Tabs>
      ) : (
        <div className="flex flex-col gap-4">{renderTabBody(activeTabConfig)}</div>
      )}
    </div>
  )
}

export type { CatalogFilterSelections } from "./catalog-search-tab-panel.js"
