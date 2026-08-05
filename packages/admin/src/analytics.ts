"use client"

import { useRouterState } from "@tanstack/react-router"
import { useVoyantAnalytics } from "@voyant-travel/react"
import { useEffect, useRef } from "react"

/**
 * Admin shell analytics.
 *
 * The write and search events come from `@voyant-travel/admin-react`, because
 * every admin read and write already goes through one operation descriptor.
 * The two here have no such choke point — they are properties of the shell:
 * where staff navigated, and which embedded extension they opened.
 *
 * Both are bound through `useVoyantAnalytics`, which returns a no-op when the
 * host binds nothing, so an admin app that wants no analytics needs to do
 * nothing at all.
 */

/**
 * `admin.nav.viewed` on every route change.
 *
 * `route` is the router's **matched route pattern**, not the resolved URL:
 * `/bookings/$bookingId` rather than `/bookings/bkg_01J…`. A resolved URL
 * would put a customer's booking id into an analytics property and shatter
 * the page dimension into one bucket per record — useless as a breakdown and
 * a PII leak besides.
 */
export function useAdminNavigationAnalytics(): void {
  const analytics = useVoyantAnalytics()
  const route = useRouterState({
    select: (state) => state.matches.at(-1)?.routeId ?? state.location.pathname,
  })
  const lastReported = useRef<string | null>(null)

  useEffect(() => {
    const pattern = typeof route === "string" ? route : String(route)
    // A route change that resolves to the same pattern — a filter or a sort —
    // is not a new page view. Reporting it would inflate every list route.
    if (lastReported.current === pattern) return
    lastReported.current = pattern
    analytics.track("admin.nav.viewed", { route: pattern, module: adminModuleOf(pattern) })
  }, [analytics, route])
}

/**
 * The owning module of a route pattern: its first non-empty segment.
 *
 * `/bookings/$bookingId` → `bookings`. The root route has no segment and
 * reports `dashboard`, which is what it renders.
 */
export function adminModuleOf(route: string): string {
  const segment = route.split("/").find((part) => part.length > 0 && !part.startsWith("$"))
  return segment ?? "dashboard"
}

/** Report an embedded UI extension becoming visible, once per mounted frame. */
export function useAdminExtensionAnalytics(extensionId: string, opened: boolean): void {
  const analytics = useVoyantAnalytics()
  const reported = useRef(false)

  useEffect(() => {
    if (!opened || reported.current) return
    reported.current = true
    analytics.track("admin.extension.opened", { extension_id: extensionId })
  }, [analytics, extensionId, opened])
}
