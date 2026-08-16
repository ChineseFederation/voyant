"use client"

import { usePublicApiMarkets } from "../hooks/use-public-api-markets.js"
import { usePublicApiMessagesOrDefault } from "./messages.js"
import { usePublicApiScope } from "./scope.js"

/**
 * Anonymous market / currency / language selector (voyant#2643).
 *
 * Rendered in the storefront chrome. Picking a market resets currency/locale to
 * that market's defaults and constrains the currency/language options to what
 * the market supports. The selection persists via `PublicApiScopeProvider` and
 * threads into catalog search + booking quotes.
 */
export function PublicApiMarketSelector(): React.ReactElement | null {
  const t = usePublicApiMessagesOrDefault().scope
  const { data } = usePublicApiMarkets()
  const scope = usePublicApiScope()

  const markets = data?.data ?? []
  if (markets.length === 0) return null

  const activeMarket = markets.find((m) => m.id === scope.marketId) ?? null

  const selectClass =
    "rounded-md border bg-background px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-ring"

  return (
    <div className="flex items-center gap-2">
      <label className="sr-only" htmlFor="storefront-market">
        {t.market}
      </label>
      <select
        id="storefront-market"
        className={selectClass}
        value={scope.marketId ?? ""}
        onChange={(e) => {
          const next = markets.find((m) => m.id === e.target.value)
          if (next) scope.selectMarket(next)
        }}
      >
        <option value="" disabled>
          {t.selectMarket}
        </option>
        {markets.map((market) => (
          <option key={market.id} value={market.id}>
            {market.name} ({market.code})
          </option>
        ))}
      </select>

      {activeMarket && activeMarket.currencies.length > 0 ? (
        <>
          <label className="sr-only" htmlFor="storefront-currency">
            {t.currency}
          </label>
          <select
            id="storefront-currency"
            className={selectClass}
            value={scope.currency ?? activeMarket.defaultCurrency}
            onChange={(e) => scope.setCurrency(e.target.value)}
          >
            {activeMarket.currencies.map((c) => (
              <option key={c.currencyCode} value={c.currencyCode}>
                {c.currencyCode}
              </option>
            ))}
          </select>
        </>
      ) : null}

      {activeMarket && activeMarket.locales.length > 1 ? (
        <>
          <label className="sr-only" htmlFor="storefront-language">
            {t.language}
          </label>
          <select
            id="storefront-language"
            className={selectClass}
            value={scope.locale ?? activeMarket.defaultLocale}
            onChange={(e) => scope.setLocale(e.target.value)}
          >
            {activeMarket.locales.map((l) => (
              <option key={l.languageTag} value={l.languageTag}>
                {l.languageTag}
              </option>
            ))}
          </select>
        </>
      ) : null}
    </div>
  )
}
