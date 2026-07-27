/**
 * Box sizes shared by {@link DashboardPage} and {@link DashboardSkeleton}.
 *
 * The dashboard renders behind a route-loader pending boundary, so the
 * skeleton is swapped for the real page in one paint. Any size the two
 * disagree on becomes a layout shift at that swap — these constants exist so
 * the two files cannot drift apart silently.
 */

/** Revenue trend and booking-status chart bodies. */
export const DASHBOARD_CHART_TALL = "h-[300px]"

/** Monthly bookings chart body. */
export const DASHBOARD_CHART_SHORT = "h-[250px]"

/** Upcoming-departures and outstanding-invoices list bodies. */
export const DASHBOARD_LIST_MIN = "min-h-[276px]"

/**
 * Height of a `dashboard.header` strip widget. Its placeholder, its resolved
 * state, and the skeleton's reservation all use this, so the slot occupies one
 * box from first paint.
 */
export const DASHBOARD_HEADER_STRIP_HEIGHT = "h-14"

/**
 * Where a `dashboard.header` widget records whether it currently occupies
 * space, so the pending boundary can reserve the slot only when the resolved
 * page will actually fill it.
 *
 * Without this the skeleton reserves the strip unconditionally, and every
 * workspace that renders no strip — no setup extension installed, setup
 * dismissed, or every step terminal — loses that box on the skeleton-to-page
 * swap and shifts the whole dashboard up. That is the same class of shift this
 * layout module exists to prevent.
 */
export const DASHBOARD_HEADER_SLOT_HINT_KEY = "voyant.dashboard.header-slot"

/**
 * Conservative default: reserve the slot. A workspace that has never resolved
 * the widget pays at most one shift, and only on its first ever dashboard load.
 */
export function readDashboardHeaderSlotHint(): boolean {
  if (typeof window === "undefined") return true
  try {
    return window.localStorage.getItem(DASHBOARD_HEADER_SLOT_HINT_KEY) !== "hidden"
  } catch {
    // Private-mode / storage-disabled browsers: fall back to reserving.
    return true
  }
}

export function writeDashboardHeaderSlotHint(occupiesSpace: boolean): void {
  if (typeof window === "undefined") return
  try {
    window.localStorage.setItem(
      DASHBOARD_HEADER_SLOT_HINT_KEY,
      occupiesSpace ? "visible" : "hidden",
    )
  } catch {
    // Best-effort hint only — never break rendering over it.
  }
}
