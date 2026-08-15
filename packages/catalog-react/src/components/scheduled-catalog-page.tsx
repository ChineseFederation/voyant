"use client"

import type { ReactNode } from "react"

/**
 * Product-family catalog surface. Family views intentionally do not lock
 * booking/supply mechanics: those concepts are orthogonal to how a product is
 * merchandised. The legacy Excursions context remains the only scheduled-only
 * scope.
 *
 * A scope is exactly one **Product family stable code** — never a duration and
 * never a subtype. The old `durationDays ≤ 1` / `≥ 2` split is retired: a
 * product's duration is display/range information, never its identity, so a
 * 60-minute Boat Tour appears under the Tour view (family `tour`) exactly like a
 * multi-day tour, and it is never shunted into a short/`excursions` bucket
 * because it is brief. "Excursion" is contextual vocabulary, not a `≤ 1-day`
 * family.
 *   - family views — lock exactly one standard family code
 *   - `excursions` — contextual scheduled browse (no duration lock)
 *
 * Subtypes (`subtypeCode`, e.g. `boat-tour`) are deliberately NOT scopes. They
 * are free-form per deployment, so no single subtype can earn a hardcoded
 * surface here without arbitrarily privileging one operator's vocabulary; they
 * browse as the ordinary subtype facet inside their family's view.
 *
 * Presentational: the localized `title`/`subtitle` and the browse grid itself
 * (`renderBrowseGrid`, the host's `CatalogBrowsePage` wired to its data) are
 * injected. This surface only owns the header layout + the supply-model /
 * family-code locks that define the scope.
 */
export type ScheduledScope =
  | "excursions"
  | "tours"
  | "activities"
  | "attractions"
  | "events"
  | "transportation"

export interface ScheduledCatalogLocks {
  lockedFacets: Record<string, Array<string | number>>
  lockedRanges: Record<string, { gte?: number; lte?: number }>
}

/** Resolve the family facet lock for a scope. Duration and subtype never lock. */
export function resolveScheduledScopeLocks(scope: ScheduledScope): ScheduledCatalogLocks {
  switch (scope) {
    case "tours":
      return {
        lockedFacets: { familyCode: ["tour"] },
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
