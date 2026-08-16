"use client"

import { Button } from "@voyant-travel/ui/components/button"
import { DataTable } from "@voyant-travel/ui/components/data-table"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@voyant-travel/ui/components/select"
import { ToggleGroup, ToggleGroupItem } from "@voyant-travel/ui/components/toggle-group"
import { ChevronLeft, ChevronRight, LayoutGrid, List } from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import type { useCatalogUiMessagesOrDefault } from "../i18n/index.js"
import { type CatalogSearchHit, useCatalogSearch } from "../index.js"
import { CatalogCard } from "./catalog-card.js"
import {
  type CatalogDetailRenderSlot,
  CatalogDetailSheet,
  type CatalogDetailSheetProps,
} from "./catalog-detail-sheet.js"
import { CatalogFilterRail } from "./catalog-filter-rail.js"
import type { CatalogRangeFilterValue } from "./catalog-range-filter.js"
import type {
  CatalogFacetFilterField,
  CatalogSearchTab,
  CatalogSortOption,
} from "./catalog-search-page.js"

// Grid cards are bigger, so show fewer per page; the dense list view shows more.
const GRID_PAGE_SIZE = 15

interface CatalogTabPanelProps {
  tab: CatalogSearchTab
  query: string
  market?: string
  locale?: string
  pageSize: number
  /** Controlled page (1-indexed). Falls back to internal state when omitted. */
  page?: number
  onPageChange?: (page: number) => void
  /** Controlled view mode / sort / filters. Fall back to internal state when omitted. */
  view?: "grid" | "list"
  onViewChange?: (view: "grid" | "list") => void
  sort?: CatalogSortOption
  onSortChange?: (sort: CatalogSortOption) => void
  filters?: CatalogFilterSelections
  onFiltersChange?: (filters: CatalogFilterSelections) => void
  detailSheetWidth?: CatalogDetailSheetProps["width"]
  detailHeaderExtras?: CatalogDetailSheetProps["headerExtras"]
  renderDetailBrochure?: CatalogDetailRenderSlot
  renderDetailMedia?: CatalogDetailRenderSlot
  renderDetailItineraryDay?: CatalogDetailSheetProps["renderItineraryDay"]
  renderDetailExtraSections?: CatalogDetailRenderSlot
  renderSupplierLink?: CatalogDetailSheetProps["renderSupplierLink"]
  onTagsChange?: CatalogDetailSheetProps["onTagsChange"]
  messages: ReturnType<typeof useCatalogUiMessagesOrDefault>["catalogPage"]
}

/**
 * Filter selections for one tab.
 *  - `facets`: field → list of selected values (multi-select).
 *  - `ranges`: field → { gte?, lte? }.
 */
interface FilterSelections {
  facets: Record<string, Array<string | number>>
  ranges: Record<string, CatalogRangeFilterValue>
}

const EMPTY_SELECTIONS: FilterSelections = { facets: {}, ranges: {} }

/**
 * Public (controlled) filter-selection shape. Both maps are optional so
 * callers persisting to URL state can omit empties; the panel normalizes to
 * `FilterSelections` internally.
 */
export interface CatalogFilterSelections {
  facets?: Record<string, Array<string | number>>
  ranges?: Record<string, CatalogRangeFilterValue>
}

export function CatalogTabPanel({
  tab,
  query,
  market,
  locale,
  pageSize,
  page: pageProp,
  onPageChange,
  view: viewProp,
  onViewChange,
  sort: sortProp,
  onSortChange,
  filters: filtersProp,
  onFiltersChange,
  detailSheetWidth,
  detailHeaderExtras,
  renderDetailBrochure,
  renderDetailMedia,
  renderDetailItineraryDay,
  renderDetailExtraSections,
  renderSupplierLink,
  onTagsChange,
  messages,
}: CatalogTabPanelProps) {
  // Filter selections can be controlled (URL-persisted) by the page, else
  // internal. `setSelections` keeps the value-or-updater signature so the
  // existing call sites work for both modes.
  const [internalSelections, setInternalSelections] = useState<FilterSelections>(EMPTY_SELECTIONS)
  const selections = useMemo<FilterSelections>(
    () =>
      filtersProp
        ? { facets: filtersProp.facets ?? {}, ranges: filtersProp.ranges ?? {} }
        : internalSelections,
    [filtersProp, internalSelections],
  )
  const setSelections = (
    next: FilterSelections | ((prev: FilterSelections) => FilterSelections),
  ) => {
    const resolved = typeof next === "function" ? next(selections) : next
    onFiltersChange?.(resolved)
    if (filtersProp == null) setInternalSelections(resolved)
  }
  const [internalPage, setInternalPage] = useState(1)
  const page = pageProp ?? internalPage
  const setPage = (next: number) => {
    if (onPageChange) onPageChange(next)
    if (pageProp == null) setInternalPage(next)
  }
  const [openHit, setOpenHit] = useState<CatalogSearchHit | null>(null)
  // View + sort can be controlled (URL-persisted) by the page, else internal.
  const [internalView, setInternalView] = useState<"grid" | "list">(tab.card ? "grid" : "list")
  const viewMode = viewProp ?? internalView
  const setViewMode = (next: "grid" | "list") => {
    onViewChange?.(next)
    if (viewProp == null) setInternalView(next)
  }
  // Grid shows fewer (bigger cards), list shows more (dense rows).
  const effectivePageSize = viewMode === "grid" ? GRID_PAGE_SIZE : pageSize
  const [internalSort, setInternalSort] = useState<CatalogSortOption>("relevance")
  const sort = sortProp ?? internalSort
  const setSort = (next: CatalogSortOption) => {
    onSortChange?.(next)
    if (sortProp == null) setInternalSort(next)
  }

  // Reset page when query / filters / sort change. Keeps "Next" honest.
  // biome-ignore lint/correctness/useExhaustiveDependencies: tab.id / query / selections / sort / scope all reset page intentionally
  useEffect(() => {
    setPage(1)
  }, [tab.id, query, selections, sort, market, locale, viewMode])

  const filters = useMemo(() => buildFilters(selections), [selections])
  const facetRequests = useMemo(
    () =>
      (tab.filterFields ?? [])
        .filter((f): f is CatalogFacetFilterField => (f.kind ?? "facet") === "facet")
        .map((f) => ({ field: f.field })),
    [tab.filterFields],
  )

  // The deployment picks the actual mode at the route — `hybrid` here means
  // "use the best mode this deployment supports." Operators with embeddings
  // configured get vector + keyword fusion; those without silently get pure
  // keyword. The end user shouldn't have to think about it.
  const { data, isLoading, isFetching, isPlaceholderData, error } = useCatalogSearch({
    vertical: tab.vertical,
    query,
    mode: "hybrid",
    market,
    locale,
    filters,
    facets: facetRequests,
    sort,
    pagination: { limit: effectivePageSize, cursor: page > 1 ? String(page) : undefined },
  })

  const total = data?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / effectivePageSize))
  const facetGroups = data?.facets ?? {}
  const hits = data?.hits ?? []
  const scopeHint = formatTemplate(messages.search.resolvedScope, {
    locale: locale ?? "any",
    market: market ?? "any",
  })

  const sortOptions = useMemo<CatalogSortOption[]>(() => {
    const opts: CatalogSortOption[] = ["relevance"]
    if (tab.sorts) {
      opts.push(...tab.sorts)
    } else {
      if (tab.card?.priceAmountField) opts.push("price-asc", "price-desc")
      opts.push("newest")
    }
    return opts
  }, [tab.sorts, tab.card])
  const sortItems = sortOptions.map((value) => ({ value, label: sortLabel(value, messages) }))
  const cardConfig = tab.card

  if (error) {
    const message = error instanceof Error ? error.message : String(error)
    return (
      <div className="rounded-md border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
        <div>{message}</div>
        <div className="mt-2 text-destructive/75 text-xs">{scopeHint}</div>
      </div>
    )
  }

  // A facet the surface pins arrives merged into `selections` because it has to
  // travel with the search request — but it is not something the reader chose,
  // so it must not make the rail claim there is anything to clear.
  const hiddenFields = new Set(tab.hiddenFilterFields ?? [])
  const hasFacetSelections = Object.entries(selections.facets).some(
    ([field, values]) => !hiddenFields.has(field) && values.length > 0,
  )
  const hasRangeSelections = Object.values(selections.ranges).some(
    (v) => v.gte != null || v.lte != null,
  )
  const hasSelections = hasFacetSelections || hasRangeSelections

  const visibleFilterFields = (tab.filterFields ?? []).filter((f) => {
    if ((f.kind ?? "facet") === "range") return true
    return (facetGroups[f.field]?.length ?? 0) > 0 || (selections.facets[f.field]?.length ?? 0) > 0
  })

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
        {visibleFilterFields.length > 0 && (
          <aside className="lg:w-60 lg:shrink-0">
            <CatalogFilterRail
              fields={visibleFilterFields}
              facetGroups={facetGroups}
              selectedFacets={selections.facets}
              selectedRanges={selections.ranges}
              onToggleFacet={(field, value) =>
                setSelections((prev) => toggleFacet(prev, field, value))
              }
              onClearFacet={(field) => setSelections((prev) => clearFacet(prev, field))}
              onSetRange={(field, next) => setSelections((prev) => setRange(prev, field, next))}
              onClearAll={() => setSelections((prev) => clearAllExcept(prev, hiddenFields))}
              hasSelections={hasSelections}
            />
          </aside>
        )}
        <div className="flex min-w-0 flex-1 flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-muted-foreground text-sm">
              {isLoading
                ? null
                : `${total} ${total === 1 ? messages.search.resultSingular : messages.search.resultPlural}`}
            </span>
            <div className="flex items-center gap-2">
              <Select
                items={sortItems}
                value={sort}
                onValueChange={(value) => setSort(value as CatalogSortOption)}
              >
                <SelectTrigger
                  className="h-9 w-[190px] rounded-md data-[size=default]:h-9"
                  aria-label={messages.view.sort}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {sortItems.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {cardConfig && (
                <ToggleGroup
                  value={[viewMode]}
                  onValueChange={(values) => {
                    const next = values[values.length - 1]
                    if (next === "grid" || next === "list") setViewMode(next)
                  }}
                  variant="outline"
                  aria-label={messages.view.filters}
                >
                  <ToggleGroupItem value="grid" aria-label={messages.view.grid}>
                    <LayoutGrid className="size-4" />
                  </ToggleGroupItem>
                  <ToggleGroupItem value="list" aria-label={messages.view.list}>
                    <List className="size-4" />
                  </ToggleGroupItem>
                </ToggleGroup>
              )}
            </div>
          </div>

          {isLoading ? (
            <ResultsSkeleton
              grid={viewMode === "grid" && Boolean(cardConfig)}
              count={effectivePageSize}
            />
          ) : (
            <>
              {/* Keep results mounted while a new query loads (paging/filtering)
                  and just dim them — no skeleton flash, no layout shift. */}
              <div
                aria-busy={isFetching}
                className={`transition-opacity duration-150 ${
                  isFetching && isPlaceholderData ? "pointer-events-none opacity-60" : ""
                }`}
              >
                {hits.length === 0 ? (
                  (tab.emptyState ?? (
                    <div className="rounded-md border border-dashed p-6 text-center text-muted-foreground text-sm">
                      <div>
                        {formatTemplate(messages.search.noResults, {
                          query: query ? `"${query}"` : messages.search.yourFilters,
                          tab: tab.label.toLowerCase(),
                        })}
                      </div>
                      <div className="mt-2 text-xs">{scopeHint}</div>
                    </div>
                  ))
                ) : viewMode === "grid" && cardConfig ? (
                  <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                    {hits.map((hit) => (
                      <CatalogCard
                        key={hit.id}
                        hit={hit}
                        config={cardConfig}
                        imageFallbackField={tab.imageField}
                        fallbackTitle={messages.fallbacks.detailName}
                        onOpen={tab.onOpenDetail ?? setOpenHit}
                      />
                    ))}
                  </div>
                ) : (
                  <DataTable
                    columns={tab.columns}
                    data={hits}
                    getRowId={(row) => row.id}
                    onRowClick={(row) => (tab.onOpenDetail ?? setOpenHit)(row.original)}
                    showPagination={false}
                    pageSize={effectivePageSize}
                  />
                )}
              </div>
              {totalPages > 1 && (
                <div className="mt-1 flex items-center justify-between gap-2">
                  <span className="text-muted-foreground text-sm">
                    {formatTemplate(messages.search.showing, {
                      from: (page - 1) * effectivePageSize + 1,
                      to: Math.min(page * effectivePageSize, total),
                      total,
                    })}
                  </span>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage(Math.max(1, page - 1))}
                      disabled={page <= 1}
                    >
                      <ChevronLeft className="mr-1 h-4 w-4" /> {messages.search.previous}
                    </Button>
                    <span className="text-muted-foreground text-sm">
                      {formatTemplate(messages.search.page, { page, totalPages })}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage(Math.min(totalPages, page + 1))}
                      disabled={page >= totalPages}
                    >
                      {messages.search.next} <ChevronRight className="ml-1 h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
      <CatalogDetailSheet
        hit={openHit}
        onOpenChange={(open) => {
          if (!open) setOpenHit(null)
        }}
        formatters={tab.detailFormatters}
        actions={tab.detailActions}
        imageField={tab.imageField ?? "thumbnailUrl"}
        vertical={tab.vertical}
        width={tab.detailSheetWidth ?? detailSheetWidth}
        headerExtras={tab.detailHeaderExtras ?? detailHeaderExtras}
        onLoadDetail={tab.onLoadDetail}
        onLoadDeparturePricing={tab.onLoadDeparturePricing}
        onBookDeparture={tab.onBookDeparture}
        onBookOption={tab.onBookOption}
        renderBrochure={tab.renderDetailBrochure ?? renderDetailBrochure}
        renderMedia={tab.renderDetailMedia ?? renderDetailMedia}
        renderItineraryDay={tab.renderDetailItineraryDay ?? renderDetailItineraryDay}
        renderExtraSections={tab.renderDetailExtraSections ?? renderDetailExtraSections}
        renderSupplierLink={renderSupplierLink}
        onTagsChange={onTagsChange}
      />
    </div>
  )
}

function buildFilters(selections: FilterSelections) {
  const filters = []
  for (const [field, values] of Object.entries(selections.facets)) {
    if (values.length === 0) continue
    if (values.length === 1) {
      filters.push({ kind: "eq", field, value: values[0] as string | number | boolean })
    } else {
      filters.push({ kind: "in", field, values })
    }
  }
  for (const [field, range] of Object.entries(selections.ranges)) {
    if (range.gte == null && range.lte == null) continue
    filters.push({
      kind: "range",
      field,
      ...(range.gte != null ? { gte: range.gte } : {}),
      ...(range.lte != null ? { lte: range.lte } : {}),
    })
  }
  return filters.length > 0 ? filters : undefined
}

function toggleFacet(
  prev: FilterSelections,
  field: string,
  value: string | number,
): FilterSelections {
  const current = prev.facets[field] ?? []
  const next = current.includes(value) ? current.filter((v) => v !== value) : [...current, value]
  return { ...prev, facets: { ...prev.facets, [field]: next } }
}

function clearFacet(prev: FilterSelections, field: string): FilterSelections {
  const facets = { ...prev.facets }
  delete facets[field]
  return { ...prev, facets }
}

/**
 * Clear everything the reader chose, keeping the facets the surface pins.
 *
 * Dropping the pinned ones too would be undone on the next render anyway — the
 * surface re-merges them — but it would write a filter-less URL first and make
 * the grid flash the unscoped result set on the way back.
 */
export function clearAllExcept(
  prev: FilterSelections,
  hiddenFields: ReadonlySet<string>,
): FilterSelections {
  const facets: FilterSelections["facets"] = {}
  for (const [field, values] of Object.entries(prev.facets)) {
    if (hiddenFields.has(field) && values.length > 0) facets[field] = values
  }
  return { facets, ranges: {} }
}

function setRange(
  prev: FilterSelections,
  field: string,
  next: CatalogRangeFilterValue | undefined,
): FilterSelections {
  const ranges = { ...prev.ranges }
  if (!next || (next.gte == null && next.lte == null)) {
    delete ranges[field]
  } else {
    ranges[field] = next
  }
  return { ...prev, ranges }
}

function formatTemplate(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => {
    const value = values[key]
    return value === undefined ? "" : String(value)
  })
}

function sortLabel(option: CatalogSortOption, messages: CatalogTabPanelProps["messages"]): string {
  switch (option) {
    case "price-asc":
      return messages.view.sortPriceAsc
    case "price-desc":
      return messages.view.sortPriceDesc
    case "departure-asc":
      return messages.view.sortSoonest
    case "newest":
      return messages.view.sortNewest
    default:
      return messages.view.sortRelevance
  }
}

function ResultsSkeleton({ grid, count = 12 }: { grid: boolean; count?: number }) {
  // Match the real layout + roughly the page size so the first load doesn't
  // jump when results arrive. Cap grid cards so the skeleton isn't absurdly tall.
  if (grid) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: Math.min(count, 15) }).map((_, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: skeleton placeholder -- owner: catalog-react; existing suppression is intentional pending typed cleanup.
          <div key={i} className="overflow-hidden rounded-lg border">
            <div className="aspect-[4/3] w-full animate-pulse bg-muted/40" />
            <div className="flex flex-col gap-2 p-3">
              <div className="h-4 w-3/4 animate-pulse rounded bg-muted/40" />
              <div className="h-3 w-1/2 animate-pulse rounded bg-muted/20" />
              <div className="h-3 w-1/3 animate-pulse rounded bg-muted/20" />
            </div>
          </div>
        ))}
      </div>
    )
  }
  return (
    <div className="overflow-hidden rounded-md border">
      <div className="h-12 animate-pulse border-b bg-muted/40" />
      {Array.from({ length: Math.min(count, 40) }).map((_, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: skeleton placeholder -- owner: catalog-react; existing suppression is intentional pending typed cleanup.
        <div key={i} className="h-14 animate-pulse border-b bg-muted/20 last:border-b-0" />
      ))}
    </div>
  )
}
