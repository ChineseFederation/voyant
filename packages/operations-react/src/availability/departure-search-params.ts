import { z } from "zod"

/**
 * The departure workspace's URL search contract.
 *
 * The workspace's six sections are addressable: `?tab=financials` is a link a
 * reviewer can paste into a ticket and a reload keeps the operator where they
 * were. Lives in the data layer (no router imports) so the admin route
 * contribution can bind it to `validateSearch` while the page component parses
 * the same contract — the pattern `@voyant-travel/catalog-react`'s
 * `catalog-search-params.ts` already established.
 */

export const departureWorkspaceTabs = [
  /** What this departure *is* + the capacity headline and its identifiers. */
  "overview",
  /** Who is coming: the traveler roster and its completeness. */
  "travelers",
  /** Rooms, seats and cabins, and who sits where. */
  "allocation",
  /** Everything that has to be squared away before it runs. */
  "operations",
  /** Finance's own P&L for the departure. */
  "financials",
  /** What changed, and who changed it. */
  "activity",
] as const

export type DepartureWorkspaceTab = (typeof departureWorkspaceTabs)[number]

export const defaultDepartureWorkspaceTab: DepartureWorkspaceTab = "overview"

/**
 * `.catch` rather than a bare enum: a stale or hand-edited `?tab=` must land
 * the operator on the overview, never fail the route.
 */
export const departureWorkspaceSearchSchema = z.object({
  tab: z.enum(departureWorkspaceTabs).catch(defaultDepartureWorkspaceTab),
})

export type DepartureWorkspaceSearchParams = z.infer<typeof departureWorkspaceSearchSchema>

/** Narrow an unknown search value onto the tab union, defaulting on anything else. */
export function parseDepartureWorkspaceTab(value: unknown): DepartureWorkspaceTab {
  return departureWorkspaceSearchSchema.parse({ tab: value }).tab
}
