"use client"

import type { ReactNode } from "react"

/**
 * Product-family catalog surface. Family and subtype views intentionally do
 * not lock booking/supply mechanics: those concepts are orthogonal to how a
 * product is merchandised. The legacy Excursions context remains the only
 * scheduled-only scope.
 *
 * The scope is defined by the **Product family / subtype stable codes**, NOT by
 * duration. The old `durationDays ≤ 1` / `≥ 2` split is retired: a product's
 * duration is display/range information, never its identity, so a 60-minute Boat
 * Tour appears under the Tour view (family `tour`) and the Boat Tour view
 * (subtype `boat-tour`) exactly like a multi-day tour, and it is never shunted
 * into a short/`excursions` bucket because it is brief. "Excursion" is
 * contextual vocabulary, not a `≤ 1-day` family.
 *   - family views — lock exactly one standard family code
 *   - `boat-tours` — locks family `tour` + subtype `boat-tour`
 *   - `excursions` — contextual scheduled browse (no duration lock)
 *
 * Presentational: the localized `title`/`subtitle` and the browse grid itself
 * (`renderBrowseGrid`, the host's `CatalogBrowsePage` wired to its data) are
 * injected. This surface only owns the header layout + the supply-model /
 * family-code locks that define the scope.
 */
export type ScheduledScope =
  | "excursions"
  | "tours"
  | "boat-tours"
  | "activities"
  | "attractions"
  | "events"
  | "transportation"

export interface ScheduledCatalogLocks {
  lockedFacets: Record<string, Array<string | number>>
  lockedRanges: Record<string, { gte?: number; lte?: number }>
}

/** Resolve the family/subtype facet locks for a scope. Duration never locks. */
export function resolveScheduledScopeLocks(scope: ScheduledScope): ScheduledCatalogLocks {
  switch (scope) {
    case "tours":
      return {
        lockedFacets: { familyCode: ["tour"] },
        lockedRanges: {},
      }
    case "boat-tours":
      return {
        lockedFacets: {
          familyCode: ["tour"],
          subtypeCode: ["boat-tour"],
        },
        lockedRanges: {},
      }
    case "excursions":
      // Contextual scheduled browse — no duration identity.
      return { lockedFacets: { supplyModel: ["scheduled"] }, lockedRanges: {} }
    case "activities":
      return { lockedFacets: { familyCode: ["activity"] }, lockedRanges: {} }
    case "attractions":
      return { lockedFacets: { familyCode: ["attraction"] }, lockedRanges: {} }
    case "events":
      return { lockedFacets: { familyCode: ["event"] }, lockedRanges: {} }
    case "transportation":
      return { lockedFacets: { familyCode: ["transportation"] }, lockedRanges: {} }
  }
}

export interface ScheduledCatalogPageProps {
  scope: ScheduledScope
  /** Localized surface title (e.g. "Excursions" / "Tours"). */
  title: string
  /** Localized surface tagline. */
  subtitle: string
  /** Render the embedded browse grid with the surface's locked filters applied. */
  renderBrowseGrid: (locks: ScheduledCatalogLocks) => ReactNode
}

export function ScheduledCatalogPage({
  scope,
  title,
  subtitle,
  renderBrowseGrid,
}: ScheduledCatalogPageProps) {
  const locks = resolveScheduledScopeLocks(scope)

  return (
    <div className="mx-auto w-full max-w-screen-2xl">
      {/* Page header — on top, surface-specific copy. */}
      <div className="mb-4">
        <h1 className="font-semibold text-2xl">{title}</h1>
        <p className="text-muted-foreground text-sm">{subtitle}</p>
      </div>
      {renderBrowseGrid(locks)}
    </div>
  )
}
