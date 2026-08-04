"use client"

import { createContext, type ReactNode, useCallback, useContext, useMemo, useState } from "react"
import type { StorefrontMarketRecord } from "../schemas.js"

/**
 * Customer-facing storefront scope (voyant#2643).
 *
 * Holds the anonymous shopper's selected market / locale / currency and
 * persists it in `localStorage` so the choice survives reloads and navigation.
 * Persistence can be namespaced by the application while market data comes
 * from the packaged `useStorefrontMarkets` hook.
 *
 * `marketId` is the catalog-search scope key — the shop page threads it into
 * `useCatalogSearch({ market })` and detail pages into `useOfferPreview({
 * scope })`. When nothing is selected the fields are `undefined` and the
 * backend's default scope applies, so the default experience is unchanged.
 */

export interface StorefrontScope {
  marketId?: string
  locale?: string
  currency?: string
}

interface StorefrontScopeContextValue extends StorefrontScope {
  /** Select a market and reset locale/currency to that market's defaults. */
  selectMarket: (market: StorefrontMarketRecord) => void
  setLocale: (locale: string) => void
  setCurrency: (currency: string) => void
}

const DEFAULT_STORAGE_KEY = "voyant.storefront.scope"

const StorefrontScopeContext = createContext<StorefrontScopeContextValue | null>(null)

function readPersistedScope(storageKey: string): StorefrontScope {
  if (typeof window === "undefined") return {}
  try {
    const raw = window.localStorage.getItem(storageKey)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as Record<string, unknown>
    return {
      marketId: typeof parsed.marketId === "string" ? parsed.marketId : undefined,
      locale: typeof parsed.locale === "string" ? parsed.locale : undefined,
      currency: typeof parsed.currency === "string" ? parsed.currency : undefined,
    }
  } catch {
    return {}
  }
}

function persistScope(storageKey: string, scope: StorefrontScope): void {
  if (typeof window === "undefined") return
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(scope))
  } catch {
    // Ignore quota / disabled-storage errors — scope simply won't persist.
  }
}

export function StorefrontScopeProvider({
  children,
  storageKey = DEFAULT_STORAGE_KEY,
}: {
  children: ReactNode
  storageKey?: string
}) {
  const [scope, setScope] = useState<StorefrontScope>(() => readPersistedScope(storageKey))

  const update = useCallback(
    (next: StorefrontScope) => {
      setScope(next)
      persistScope(storageKey, next)
    },
    [storageKey],
  )

  const value = useMemo<StorefrontScopeContextValue>(
    () => ({
      ...scope,
      selectMarket: (market) =>
        update({
          marketId: market.id,
          locale: market.defaultLocale,
          currency: market.defaultCurrency,
        }),
      setLocale: (locale) => update({ ...scope, locale }),
      setCurrency: (currency) => update({ ...scope, currency }),
    }),
    [scope, update],
  )

  return <StorefrontScopeContext.Provider value={value}>{children}</StorefrontScopeContext.Provider>
}

export function useStorefrontScope(): StorefrontScopeContextValue {
  const ctx = useContext(StorefrontScopeContext)
  if (!ctx) {
    throw new Error("useStorefrontScope must be used within a StorefrontScopeProvider")
  }
  return ctx
}
