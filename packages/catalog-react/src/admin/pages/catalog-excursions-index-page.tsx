"use client"

import type { CatalogAdminRoutePageProps, CatalogSearchParams } from "../index.js"
import { ScheduledCatalogHost } from "../scheduled-catalog-host.js"

/**
 * Packaged route page for the scheduled catalog browse surface scoped to
 * excursions. The contribution's `validateSearch` (catalogSearchSchema)
 * already validated `search`, so the cast onto the host contract is sound.
 */
export default function CatalogExcursionsIndexPage({
  search,
  updateSearch,
  scopeOptions,
}: CatalogAdminRoutePageProps) {
  // Excursions = contextual scheduled browse. "Excursion" is contextual
  // vocabulary, not a `≤ 1-day` family, so no duration lock is applied.
  return (
    <ScheduledCatalogHost
      scope="excursions"
      search={search as CatalogSearchParams}
      onSearchChange={(updater, replace = true) => updateSearch(updater as never, { replace })}
      scopeOptions={scopeOptions}
    />
  )
}
