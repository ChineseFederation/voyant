"use client"

import { useCatalogSearch } from "@voyant-travel/catalog-react"
import { Card, CardContent, CardHeader, CardTitle } from "@voyant-travel/ui/components/card"
import { Input } from "@voyant-travel/ui/components/input"
import { Skeleton } from "@voyant-travel/ui/components/skeleton"
import { useState } from "react"
import type { z } from "zod"

import { getStorefrontCustomerProductDetailRoute } from "../routing.js"
import { StorefrontLink, useStorefrontUi } from "./context.js"
import type { shopSearchSchema } from "./shop-search.js"

export { shopSearchSchema } from "./shop-search.js"

/**
 * Storefront landing — real catalog browser backed by
 * `/v1/public/catalog/search` (an index slice scoped to `audience: "customer"`).
 *
 * When the deployment has no available search provider, the route 503s and we
 * render an instructions block instead — a usable experience either way.
 *
 * Search only offers verticals that have a working customer detail + booking
 * page. Charters and flights have no storefront `/content` endpoint or booking
 * flow yet (voyant#2640), so they remain outside
 * `storefrontCustomerBookableProductVerticals`. Deriving the accepted verticals
 * from that list keeps search in sync automatically as new verticals gain
 * detail pages, and `.catch(undefined)` gracefully drops any stale/crafted
 * unsupported vertical URL back to the default vertical instead of erroring.
 */
export function StorefrontBrowsePage({
  search,
}: {
  search: z.infer<typeof shopSearchSchema>
}): React.ReactElement {
  const { messages, navigate, scope } = useStorefrontUi()
  const t = messages.shop
  const vertical = search.vertical ?? "products"
  const [query, setQuery] = useState(search.q ?? "")

  const result = useCatalogSearch({
    surface: "public",
    vertical,
    query,
    mode: "keyword",
    pagination: { limit: 24 },
    // Thread the selected storefront scope (voyant#2643). `market` is the
    // catalog-search scope key; `locale` selects the served content language.
    // Both fall back to the runtime default scope when nothing is selected.
    market: scope.marketId,
    locale: scope.locale,
    enabled: true,
  })

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-semibold text-3xl tracking-tight">{t.heading}</h1>
        <p className="text-muted-foreground">{t.intro}</p>
      </div>

      <div className="flex">
        <StorefrontLink
          href="/shop/composer"
          to="/shop/composer"
          className="inline-flex items-center justify-center rounded-md bg-primary px-3 py-2 font-medium text-primary-foreground text-sm hover:bg-primary/90"
        >
          {t.buildTrip}
        </StorefrontLink>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <Input
          placeholder={t.searchPlaceholder}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="max-w-md"
        />
        <select
          className="rounded-md border bg-background px-3 py-2 text-sm"
          value={vertical}
          onChange={(e) =>
            navigate({
              to: "/shop",
              search: { ...search, vertical: e.target.value as typeof vertical },
            })
          }
        >
          <option value="products">{t.verticalProducts}</option>
          <option value="accommodations">{t.verticalAccommodations}</option>
        </select>
      </div>

      {result.isError ? (
        <SearchUnavailable />
      ) : result.isLoading ? (
        <SearchSkeleton />
      ) : result.data && result.data.hits.length > 0 ? (
        <SearchResults vertical={vertical} hits={result.data.hits} />
      ) : (
        <SearchEmpty vertical={vertical} query={query} />
      )}
    </div>
  )
}

function SearchUnavailable(): React.ReactElement {
  const t = useStorefrontUi().messages.shop
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t.unavailableTitle}</CardTitle>
      </CardHeader>
      <CardContent className="text-sm">
        <p>{t.unavailableBody}</p>
      </CardContent>
    </Card>
  )
}

function SearchSkeleton(): React.ReactElement {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 6 }, (_, i) => `skel-${i}`).map((key) => (
        <Card key={key}>
          <CardContent className="space-y-2">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-1/2" />
            <Skeleton className="h-3 w-2/3" />
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

interface SearchHit {
  id: string
  document: { fields: Record<string, unknown> }
}

function SearchResults({
  vertical,
  hits,
}: {
  vertical: string
  hits: ReadonlyArray<SearchHit>
}): React.ReactElement {
  const t = useStorefrontUi().messages.shop
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {hits.map((hit) => {
        const fields = hit.document.fields
        const name = readString(fields.name) ?? readString(fields.title) ?? hit.id
        const description = readString(fields.description) ?? readString(fields.summary)
        const listPrice = readNumber(fields.price_cents) ?? readNumber(fields.sell_amount_cents)
        const currency = readString(fields.currency) ?? readString(fields.sell_currency) ?? ""
        // Promotion annotations from `productPromotionsCatalogPolicy` (PR3
        // of #497). The catalog projection emits `bestOffer*` +
        // `originalPriceFromAmountCents` only for products with an
        // active auto-applied offer for the slice. Storefront consumers
        // compute the effective price client-side (per
        // promotions-architecture.md §3.7).
        const offerName = readString(fields.bestOfferName)
        const offerDiscountKind = readString(fields.bestOfferDiscountKind)
        const offerDiscountPercent = readNumber(fields.bestOfferDiscountPercent)
        const offerDiscountAmountCents = readNumber(fields.bestOfferDiscountAmountCents)
        const originalPriceCents = readNumber(fields.originalPriceFromAmountCents)
        const effectivePrice = computeEffectivePrice(listPrice, {
          kind: offerDiscountKind,
          percent: offerDiscountPercent,
          amountCents: offerDiscountAmountCents,
        })
        const showStrikethrough =
          originalPriceCents != null &&
          effectivePrice != null &&
          originalPriceCents > effectivePrice
        const offerBadgeText = describeOffer(
          offerDiscountKind,
          offerDiscountPercent,
          offerDiscountAmountCents,
          currency,
          { percentOff: t.percentOff, amountOff: t.amountOff },
        )
        return (
          <Card key={hit.id}>
            <CardHeader>
              <CardTitle className="text-base">{name}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {description ? (
                <p className="text-muted-foreground line-clamp-3">{description}</p>
              ) : null}
              {effectivePrice != null ? (
                <div className="space-y-0.5">
                  <p className="font-medium">
                    {(effectivePrice / 100).toLocaleString(undefined, {
                      style: currency ? "currency" : "decimal",
                      currency: currency || undefined,
                    })}
                    {showStrikethrough && originalPriceCents != null ? (
                      <span className="ml-2 text-muted-foreground text-xs line-through">
                        {(originalPriceCents / 100).toLocaleString(undefined, {
                          style: currency ? "currency" : "decimal",
                          currency: currency || undefined,
                        })}
                      </span>
                    ) : null}
                  </p>
                  {offerName && offerBadgeText ? (
                    <p className="text-xs">
                      <span className="rounded-sm bg-emerald-500/10 px-1.5 py-0.5 font-medium text-emerald-700 dark:text-emerald-400">
                        {offerBadgeText} — {offerName}
                      </span>
                    </p>
                  ) : null}
                </div>
              ) : null}
              {(() => {
                const route = getStorefrontCustomerProductDetailRoute(vertical, hit.id)
                return route ? (
                  <StorefrontLink
                    href={`/shop/products/${encodeURIComponent(vertical)}/${encodeURIComponent(hit.id)}`}
                    to={route.to}
                    params={route.params}
                    className="inline-flex items-center justify-center rounded-md bg-primary px-3 py-1.5 font-medium text-primary-foreground text-sm hover:bg-primary/90"
                  >
                    {t.viewAndBook}
                  </StorefrontLink>
                ) : null
              })()}
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}

function SearchEmpty({ vertical, query }: { vertical: string; query: string }): React.ReactElement {
  const t = useStorefrontUi().messages.shop
  return (
    <Card>
      <CardContent>
        <p className="text-muted-foreground text-sm">
          {t.emptyPrefix} {vertical} {t.emptyMatch} {query ? <q>{query}</q> : t.emptyYourFilters}.{" "}
          {t.emptySuffix}
        </p>
      </CardContent>
    </Card>
  )
}

function readString(v: unknown): string | undefined {
  return typeof v === "string" && v.length > 0 ? v : undefined
}

function readNumber(v: unknown): number | undefined {
  if (typeof v === "number" && Number.isFinite(v)) return v
  if (typeof v === "string") {
    const n = Number.parseFloat(v)
    return Number.isFinite(n) ? n : undefined
  }
  return undefined
}

/**
 * Apply the projected `bestOffer*` discount to the indexed list price.
 * Storefront consumers compute this client-side because the catalog
 * projection emits annotations only, never overwriting `priceFromAmountCents`
 * (per promotions-architecture.md §3.7).
 */
function computeEffectivePrice(
  listPriceCents: number | undefined,
  offer: { kind?: string; percent?: number; amountCents?: number },
): number | undefined {
  if (listPriceCents == null) return undefined
  if (!offer.kind) return listPriceCents
  if (offer.kind === "percentage" && offer.percent != null) {
    return Math.max(0, Math.round(listPriceCents * (1 - offer.percent / 100)))
  }
  if (offer.kind === "fixed_amount" && offer.amountCents != null) {
    return Math.max(0, listPriceCents - offer.amountCents)
  }
  return listPriceCents
}

function describeOffer(
  kind: string | undefined,
  percent: number | undefined,
  amountCents: number | undefined,
  currency: string,
  labels: { percentOff: string; amountOff: string },
): string | undefined {
  if (kind === "percentage" && percent != null) {
    return labels.percentOff.replace("{percent}", String(percent))
  }
  if (kind === "fixed_amount" && amountCents != null) {
    const amount = (amountCents / 100).toLocaleString(undefined, {
      style: currency ? "currency" : "decimal",
      currency: currency || undefined,
    })
    return labels.amountOff.replace("{amount}", amount)
  }
  return undefined
}
