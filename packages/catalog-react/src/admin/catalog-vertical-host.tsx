"use client"

import { useAdminHref, useAdminNavigate, useOperatorAdminMessages } from "@voyant-travel/admin"
import { useMarketLocales, useMarkets } from "@voyant-travel/commerce-react/markets"
import { useSuppliers } from "@voyant-travel/distribution-react/suppliers"
import { useProductMutation } from "@voyant-travel/inventory-react"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@voyant-travel/ui/components/select"
import { useMemo } from "react"
import { toast } from "sonner"
import type { CatalogVerticalPageId } from "../catalog-surfaces.js"
import { CatalogPage as CatalogUiPage } from "../components/catalog-page.js"
import { useCatalogUiMessagesOrDefault } from "../i18n/index.js"
import type { CatalogSearchHit, CatalogSearchParams } from "../index.js"
import {
  type CatalogSlotAvailability,
  createCatalogEnrichmentFetchers,
  fetchCatalogSlots,
  useVoyantCatalogContext,
  type VoyantFetcher,
} from "../index.js"

type CatalogBrowserMessages = ReturnType<
  typeof useOperatorAdminMessages
>["products"]["operations"]["catalogBrowser"]

const DEFAULT_MARKET_VALUE = "__default__"
const DEFAULT_CATALOG_LOCALE = "en-GB"

interface CatalogMarket {
  id: string
  name: string
  code: string
  defaultLanguageTag: string
}

export type CatalogAdminScopeStrategy = "commerce-market" | "deployment-default"

export interface CatalogAdminScopeOptions {
  /**
   * Deployment-level locale fallback for catalog index slices. Used when no
   * URL locale is selected, or when the selected market has no locale rows.
   */
  defaultLocale?: string
  /**
   * Deployment-level market/scope fallback for catalog index slices. This can
   * be a commerce market id/code or a synthetic indexed slice such as
   * `"default"`.
   */
  defaultMarket?: string
  /**
   * Pick the default scope from commerce markets (legacy behavior) or from the
   * deployment defaults above. URL-selected scope still wins when controls are
   * visible.
   */
  scopeStrategy?: CatalogAdminScopeStrategy
  /** Hide the market/locale toolbar controls for fixed-scope deployments. */
  hideScopeControls?: boolean
}

export function resolveCatalogDefaultMarket(
  markets: ReadonlyArray<CatalogMarket>,
  selectedMarketId?: string,
  options: Pick<CatalogAdminScopeOptions, "defaultLocale" | "defaultMarket" | "scopeStrategy"> = {},
): CatalogMarket | undefined {
  const selectedMarket = selectedMarketId
    ? markets.find((market) => market.id === selectedMarketId || market.code === selectedMarketId)
    : undefined
  if (selectedMarket) return selectedMarket

  const configuredMarket = options.defaultMarket
    ? markets.find(
        (market) => market.id === options.defaultMarket || market.code === options.defaultMarket,
      )
    : undefined
  if (configuredMarket) return configuredMarket

  if (options.scopeStrategy === "deployment-default" && options.defaultMarket) {
    return {
      id: options.defaultMarket,
      name: options.defaultMarket,
      code: options.defaultMarket,
      defaultLanguageTag: options.defaultLocale ?? DEFAULT_CATALOG_LOCALE,
    }
  }

  return markets.find((market) => market.code === "default") ?? markets[0]
}

export function resolveCatalogLocaleOptions(
  market: CatalogMarket | undefined,
  locales: ReadonlyArray<{ languageTag: string }>,
  defaultLocale = DEFAULT_CATALOG_LOCALE,
): string[] {
  const tags = new Set<string>()
  if (market) {
    tags.add(market.defaultLanguageTag)
    for (const locale of locales) tags.add(locale.languageTag)
  } else {
    tags.add(defaultLocale)
  }
  return Array.from(tags).sort((left, right) => left.localeCompare(right))
}

export function resolveCatalogSelectedLocale(
  requestedLocale: string | undefined,
  localeOptions: ReadonlyArray<string>,
  market: CatalogMarket | undefined,
  defaultLocale = DEFAULT_CATALOG_LOCALE,
): string {
  const fallbackLocale = market?.defaultLanguageTag ?? defaultLocale
  return requestedLocale && localeOptions.includes(requestedLocale)
    ? requestedLocale
    : fallbackLocale
}

export function resolveCatalogScope(
  search: Pick<CatalogSearchParams, "locale" | "market">,
  localeOptions: ReadonlyArray<string>,
  market: CatalogMarket | undefined,
  options: Pick<CatalogAdminScopeOptions, "defaultLocale" | "defaultMarket"> = {},
) {
  return {
    locale: resolveCatalogSelectedLocale(
      search.locale,
      localeOptions,
      market,
      options.defaultLocale,
    ),
    market: search.market ?? market?.id ?? options.defaultMarket,
  }
}

export function resolveCatalogScopeSearch(
  search: CatalogSearchParams,
  options: Pick<CatalogAdminScopeOptions, "hideScopeControls"> = {},
): CatalogSearchParams {
  return options.hideScopeControls ? { ...search, locale: undefined, market: undefined } : search
}

export interface CatalogVerticalHostProps {
  vertical: CatalogVerticalPageId
  search: CatalogSearchParams
  onSearchChange: (
    updater: (prev: CatalogSearchParams) => CatalogSearchParams,
    replace?: boolean,
  ) => void
  /**
   * Embedded under another surface's unified search bar (the Dynamic page).
   * Hides this page's own search box, title and market/locale chrome so there
   * is a single search experience; `search.q` is driven externally.
   */
  embedded?: boolean
  /**
   * Facet filters always applied to this surface, on top of the user's
   * URL-driven filters and never erased by them (e.g. a Scheduled page pins
   * `supplyModel: ["scheduled"]`). Kept out of URL state.
   */
  lockedFacets?: Record<string, Array<string | number>>
  /**
   * Range filters always applied to this surface (e.g. an Excursions page pins
   * `durationDays: { lte: 1 }`). Like {@link CatalogVerticalHostProps.lockedFacets},
   * kept out of URL.
   */
  lockedRanges?: Record<string, { gte?: number; lte?: number }>
  /**
   * Open a result's dedicated detail page (in a new tab) instead of the in-page
   * detail sheet. Each surface passes its own opener so the right detail route
   * is used (packages → its bespoke page; cruises/accommodations/excursions/
   * tours → the generic vertical detail). When omitted, the sheet is used.
   */
  onOpenDetail?: (hit: CatalogSearchHit) => void
  scopeOptions?: CatalogAdminScopeOptions
}

/**
 * The indexed catalog browse grid bound to its data wiring (markets, locales,
 * suppliers, product tag mutations, slot availability) — the packaged admin
 * host that turns the presentational `CatalogPage` into a working operator
 * surface. API access comes from the shell's catalog provider context
 * (`useVoyantCatalogContext`); cross-route links resolve through the semantic
 * destination keys declared in `./index.tsx` (packaged-admin RFC §4.7).
 */
export function CatalogVerticalHost({
  vertical,
  search,
  onSearchChange,
  embedded = false,
  lockedFacets,
  lockedRanges,
  onOpenDetail,
  scopeOptions = {},
}: CatalogVerticalHostProps) {
  const resolveHref = useAdminHref()
  const navigateTo = useAdminNavigate()
  const { baseUrl, fetcher } = useVoyantCatalogContext()
  const browserMessages = useOperatorAdminMessages().products.operations.catalogBrowser
  const catalogMessages = useCatalogUiMessagesOrDefault().catalogPage
  const suppliersQuery = useSuppliers({ limit: 100 })
  const marketsQuery = useMarkets({ status: "active", limit: 100 })
  const markets = marketsQuery.data?.data ?? []
  const scopeSearch = resolveCatalogScopeSearch(search, scopeOptions)
  const selectedMarketId = scopeSearch.market
  const defaultMarket = resolveCatalogDefaultMarket(markets, selectedMarketId, scopeOptions)
  const selectedMarket = selectedMarketId
    ? markets.find((market) => market.id === selectedMarketId || market.code === selectedMarketId)
    : undefined
  const localeMarket = selectedMarket ?? defaultMarket
  const localesQuery = useMarketLocales({
    marketId: localeMarket?.id,
    active: true,
    limit: 100,
    enabled: Boolean(localeMarket?.id && markets.some((market) => market.id === localeMarket.id)),
  })
  const localeOptions = useMemo(
    () =>
      resolveCatalogLocaleOptions(
        localeMarket,
        localesQuery.data?.data ?? [],
        scopeOptions.defaultLocale,
      ),
    [localesQuery.data, localeMarket, scopeOptions.defaultLocale],
  )
  const catalogScope = resolveCatalogScope(scopeSearch, localeOptions, localeMarket, scopeOptions)
  const selectedLocale = catalogScope.locale
  const selectedMarketScope = catalogScope.market
  const supplierMap = useMemo(() => {
    const m = new Map<string, string>()
    for (const s of suppliersQuery.data?.data ?? []) m.set(s.id, s.name)
    return m
  }, [suppliersQuery.data])
  const formatSupplier = (id: string | number) => supplierMap.get(String(id)) ?? String(id)
  const productMutation = useProductMutation()

  const enrichmentFetchers = useMemo(
    () =>
      createCatalogEnrichmentFetchers({
        baseUrl,
        // Route the detail-sheet content fetch to each vertical's content
        // mount (the host API's createProductContentRoutes mounts). Verticals
        // omitted here have no content route mounted, so their sheet renders
        // the projection only.
        contentBasePathByVertical: {
          products: "/v1/admin/products",
          cruises: "/v1/admin/cruises",
          accommodations: "/v1/admin/accommodations",
        },
        formatSupplier: (id) => supplierMap.get(String(id)) ?? String(id),
        locale: selectedLocale,
        market: selectedMarketScope,
        loadSlotAvailability: (productId) =>
          loadProductSlotAvailability(baseUrl, fetcher, productId),
      }),
    [baseUrl, fetcher, supplierMap, selectedLocale, selectedMarketScope],
  )

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
            locale: selectedLocale,
            market: selectedMarketScope,
            filters: {
              ...search.filters,
              facets: { ...(search.filters?.facets ?? {}), ...(lockedFacets ?? {}) },
              ranges: { ...(search.filters?.ranges ?? {}), ...(lockedRanges ?? {}) },
            },
          }
        : { ...search, locale: selectedLocale, market: selectedMarketScope },
    [search, selectedLocale, selectedMarketScope, lockedFacetsKey, lockedRangesKey],
  )

  return (
    <CatalogUiPage
      vertical={vertical}
      search={effectiveSearch}
      formatSupplier={formatSupplier}
      hideSearchInput={embedded}
      className={embedded ? "px-0 py-0 lg:px-0" : undefined}
      title={
        // `false` (not `undefined`) so catalog-ui's `title ?? default` does NOT
        // fall back to its generic "Catalog" header — the embedding surface
        // (Dynamic/Scheduled page) renders its own header on top instead.
        embedded ? (
          false
        ) : (
          <div>
            <h1 className="font-semibold text-2xl">{catalogMessages.tabs[vertical]}</h1>
          </div>
        )
      }
      toolbarEnd={
        embedded || scopeOptions.hideScopeControls ? undefined : (
          <CatalogScopeControls
            messages={browserMessages}
            markets={marketsQuery.data?.data ?? []}
            localeOptions={localeOptions}
            market={selectedMarketId}
            locale={selectedLocale}
            onMarketChange={(marketId) => {
              const nextMarket = (marketsQuery.data?.data ?? []).find(
                (market) => market.id === marketId,
              )
              onSearchChange(
                (prev): CatalogSearchParams => ({
                  ...prev,
                  market: marketId,
                  locale: nextMarket?.defaultLanguageTag,
                  page: 1,
                }),
                true,
              )
            }}
            onDefaultMarket={() => {
              onSearchChange(
                (prev): CatalogSearchParams => ({
                  ...prev,
                  market: undefined,
                  locale: undefined,
                  page: 1,
                }),
                true,
              )
            }}
            onLocaleChange={(locale) => {
              onSearchChange((prev): CatalogSearchParams => ({ ...prev, locale, page: 1 }), true)
            }}
          />
        )
      }
      onQueryChange={(q) =>
        onSearchChange(
          (prev): CatalogSearchParams => ({
            ...prev,
            q: q.length > 0 ? q : undefined,
            page: 1,
          }),
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
      onOpenProductEditor={(hit) => navigateTo("product.detail", { productId: hit.id })}
      // When the surface provides a detail-page opener, results open it (new
      // tab) instead of the in-page sheet. Surface-specific so each vertical
      // routes to the right detail page.
      onOpenProductDetail={onOpenDetail ? (hit) => onOpenDetail(hit) : undefined}
      enrichmentFetchers={enrichmentFetchers}
      renderSupplierLink={(supplierId, displayName) => (
        <a
          href={resolveHref("supplier.detail", { supplierId })}
          onClick={(event) => {
            // Keep modified/middle clicks native (new tab etc.); plain clicks
            // navigate through the host router so the workspace doesn't reload.
            if (
              event.defaultPrevented ||
              event.button !== 0 ||
              event.metaKey ||
              event.ctrlKey ||
              event.shiftKey ||
              event.altKey
            ) {
              return
            }
            event.preventDefault()
            navigateTo("supplier.detail", { supplierId })
          }}
          className="font-medium text-primary hover:underline"
        >
          {displayName}
        </a>
      )}
      onTagsChange={async (hit, nextTags) => {
        // Owned products only — sourced rows are read-only mirrors of
        // the upstream so we can't write tags through to them.
        const sourceKind = stringField(hit, "source.kind", null)
        if (sourceKind && sourceKind !== "owned") {
          toast.info(browserMessages.tagsReadOnly)
          throw new Error("read-only source kind")
        }
        try {
          await productMutation.update.mutateAsync({
            id: hit.id,
            input: { tags: nextTags },
          })
          // Intentionally don't invalidate the catalog search query —
          // search reindexing is async, so a refetch right after the
          // PATCH would return the pre-mutation tags and clobber the
          // local optimistic state. The editor keeps its own working
          // set keyed on hit.id; the next time the user opens this
          // product the index has caught up.
        } catch (err) {
          toast.error(err instanceof Error ? err.message : browserMessages.tagsUpdateFailed)
          throw err
        }
      }}
    />
  )
}

interface CatalogScopeControlsProps {
  messages: CatalogBrowserMessages
  markets: Array<{ id: string; name: string; code: string; defaultLanguageTag: string }>
  localeOptions: string[]
  market?: string
  locale: string
  onMarketChange: (marketId: string) => void
  onDefaultMarket: () => void
  onLocaleChange: (locale: string) => void
}

function CatalogScopeControls({
  messages,
  markets,
  localeOptions,
  market,
  locale,
  onMarketChange,
  onDefaultMarket,
  onLocaleChange,
}: CatalogScopeControlsProps) {
  return (
    <>
      <Select
        value={market ?? DEFAULT_MARKET_VALUE}
        onValueChange={(value) => {
          if (!value) return
          value === DEFAULT_MARKET_VALUE ? onDefaultMarket() : onMarketChange(value)
        }}
      >
        <SelectTrigger className="w-[220px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={DEFAULT_MARKET_VALUE}>{messages.defaultMarket}</SelectItem>
          {markets.map((item) => (
            <SelectItem key={item.id} value={item.id}>
              {item.name} · {item.code}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select value={locale} onValueChange={(value) => value && onLocaleChange(value)}>
        <SelectTrigger className="w-[150px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {localeOptions.map((item) => (
            <SelectItem key={item} value={item}>
              {item}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </>
  )
}

async function loadProductSlotAvailability(
  baseUrl: string,
  fetcher: VoyantFetcher,
  productId: string,
): Promise<Map<string, CatalogSlotAvailability>> {
  try {
    const response = await fetchCatalogSlots(
      { baseUrl, fetcher },
      { entityModule: "products", entityId: productId },
    )
    return new Map(response.rows.map((slot) => [slot.id, slot]))
  } catch {
    return new Map()
  }
}

function stringField<T>(hit: CatalogSearchHit, key: string, fallback: T): string | T {
  const v = hit.document.fields[key]
  return typeof v === "string" && v.length > 0 ? v : fallback
}
