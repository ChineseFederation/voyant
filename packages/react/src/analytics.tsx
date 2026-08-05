"use client"

import {
  type AnalyticsEmitter,
  type AnalyticsPort,
  createSafeAnalytics,
  noopAnalytics,
} from "@voyant-travel/core/analytics"
import { createContext, type ReactNode, useContext, useMemo } from "react"

/**
 * The browser half of the analytics port.
 *
 * Deliberately a context of its own rather than a field on
 * `VoyantReactContextValue`, for two reasons:
 *
 *  - **It is optional in a way the base URL is not.** `useVoyantReactContext`
 *    throws outside its provider, because a hook that does not know where the
 *    API is cannot do its job. {@link useVoyantAnalytics} must never throw: an
 *    unbound host is a supported state, and a component that emits an event
 *    still renders perfectly well without one.
 *  - **Not every surface uses `VoyantReactProvider`.** The admin shell has its
 *    own provider, so binding analytics has to be possible without adopting a
 *    second one.
 */
const VoyantAnalyticsContext = createContext<AnalyticsEmitter>(noopAnalytics)

export interface VoyantAnalyticsProviderProps {
  /**
   * The host's implementation. Omit it — or pass `undefined` — for a
   * deployment that measures nothing; every hook below then emits into the
   * no-op and no network call is made.
   */
  analytics?: AnalyticsPort
  children: ReactNode
}

export function VoyantAnalyticsProvider({ analytics, children }: VoyantAnalyticsProviderProps) {
  // Wrapped here rather than at each call site so a host may bind a naive
  // client: `createSafeAnalytics` is what makes a throwing provider harmless.
  const value = useMemo(() => createSafeAnalytics(analytics), [analytics])
  return <VoyantAnalyticsContext.Provider value={value}>{children}</VoyantAnalyticsContext.Provider>
}

/** The bound emitter, or the no-op. Never throws, never returns null. */
export function useVoyantAnalytics(): AnalyticsEmitter {
  return useContext(VoyantAnalyticsContext)
}
