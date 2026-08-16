"use client"

import { type ReactNode, useMemo } from "react"
import type { CatalogSearchParams } from "../index.js"

import { type CatalogPageProps, CatalogPage as CatalogUiPage } from "./catalog-page.js"

/**
 * Browse surface — the catalog results grid (cards + filter rail + sort/view +
 * detail sheet) wired to a `CatalogSearchParams` URL state. Owns the reusable
 * bits: merging always-on `lockedFacets`/`lockedRanges` into the user's filters
 * (kept out of URL state) and adapting `onSearchChange` into the grid's
 * query/page/view/sort/filter callbacks.
 *
 * Host-specific concerns stay injected: `scopeControls` (market/locale selects),
 * `enrichmentFetchers`, `formatSupplier`, `renderSupplierLink`, booking + editor
 * callbacks, and `onTagsChange`. The Dynamic/Scheduled surfaces embed this via
 * `embedded` to drop its own search box/header/padding under their unified bar.
 */
export interface CatalogBrowsePageProps
  extends Pick<
    CatalogPageProps,
    | "formatSupplier"
    | "enrichmentFetchers"
    | "renderSupplierLink"
    | "onTagsChange"
    | "onBookHit"
    | "onBookDeparture"
    | "onBookOption"
    | "onOpenProductEditor"
    | "onOpenProductDetail"
  > {
  vertical: string
  search: CatalogSearchParams
  onSearchChange: (
    updater: (prev: CatalogSearchParams) => CatalogSearchParams,
    replace?: boolean,
  ) => void
  /** Resolved display locale — the host resolves it from its markets. */
  locale: string
  /**
   * Embedded under another surface's unified search bar (the Dynamic/Scheduled
   * page). Hides the built-in search box, header and outer padding so there is
   * a single search experience; `search.q` is driven externally.
   */
  embedded?: boolean
  /** Facet filters always applied on this surface, never erased by the user. */
  lockedFacets?: Record<string, Array<string | number>>
  /** Range filters always applied on this surface, never erased by the user. */
  lockedRanges?: Record<string, { gte?: number; lte?: number }>
  /** Toolbar-end controls (market/locale selects). Hidden when embedded. */
  scopeControls?: ReactNode
  /** Header. `false` suppresses catalog-ui's default. Ignored when embedded. */
  title?: ReactNode | false
}

export function CatalogBrowsePage({
  vertical,
  search,
  onSearchChange,
  locale,
  embedded = false,
  lockedFacets,
  lockedRanges,
  scopeControls,
  title,
  ...forward
}: CatalogBrowsePageProps) {
  // Merge the always-on locked facets/ranges with the user's URL-driven filters.
  // Memoized so locked surfaces hand a STABLE `filters` object to the tab panel:
  // a fresh object every render reads as "selections changed" and resets back to
  // page 1, breaking pagination. Key on the locked values' content (callers pass
  // inline literals), not their identity. `search` is already stable (router).
  const lockedFacetsKey = JSON.stringify(lockedFacets ?? null)
  const lockedRangesKey = JSON.stringify(lockedRanges ?? null)
  // biome-ignore lint/correctness/useExhaustiveDependencies: keyed on serialized locked filters, not their object identity -- owner: catalog-react; existing suppression is intentional pending typed cleanup.
  const effectiveSearch = useMemo<CatalogSearchParams>(
    () =>
      lockedFacets || lockedRanges
        ? {
            ...search,
            locale,
            filters: {
              ...search.filters,
              facets: { ...(search.filters?.facets ?? {}), ...(lockedFacets ?? {}) },
              ranges: { ...(search.filters?.ranges ?? {}), ...(lockedRanges ?? {}) },
            },
          }
        : { ...search, locale },
    [search, locale, lockedFacetsKey, lockedRangesKey],
  )

  return (
    <CatalogUiPage
      {...forward}
      vertical={vertical}
      search={effectiveSearch}
      hideSearchInput={embedded}
      // A locked facet is the surface's definition, not the reader's filter —
      // the Tours page IS `familyCode = tour`. Offering it in the rail restates
      // the page title and dangles a Clear that cannot clear anything.
      hiddenFilterFields={Object.keys(lockedFacets ?? {})}
      className={embedded ? "px-0 py-0 lg:px-0" : undefined}
      // `false` (not `undefined`) so catalog-ui's `title ?? default` does NOT
      // fall back to its generic header when an embedding surface renders its own.
      title={embedded ? false : title}
      toolbarEnd={embedded ? undefined : scopeControls}
      onQueryChange={(q) =>
        onSearchChange(
          (prev): CatalogSearchParams => ({ ...prev, q: q.length > 0 ? q : undefined, page: 1 }),
          true,
        )
      }
      onPageChange={(p) =>
        onSearchChange((prev): CatalogSearchParams => ({ ...prev, page: p }), true)
      }
      onViewChange={(view) =>
        onSearchChange((prev): CatalogSearchParams => ({ ...prev, view }), true)
      }
      onSortChange={(sort) =>
        onSearchChange((prev): CatalogSearchParams => ({ ...prev, sort }), true)
      }
      onFiltersChange={(next) => {
        // Prune empty selections so the URL stays clean; reset to page 1.
        const facets: Record<string, Array<string | number>> = {}
        for (const [field, values] of Object.entries(next.facets ?? {})) {
          if (values.length > 0) facets[field] = values
        }
        const ranges: Record<string, { gte?: number; lte?: number }> = {}
        for (const [field, range] of Object.entries(next.ranges ?? {})) {
          if (range && (range.gte != null || range.lte != null)) ranges[field] = range
        }
        const hasAny = Object.keys(facets).length > 0 || Object.keys(ranges).length > 0
        onSearchChange(
          (prev): CatalogSearchParams => ({
            ...prev,
            filters: hasAny ? { facets, ranges } : undefined,
            page: 1,
          }),
          true,
        )
      }}
    />
  )
}
