"use client"

import type { ScheduledScope } from "../../components/scheduled-catalog-page.js"
import type { CatalogAdminRoutePageProps, CatalogSearchParams } from "../index.js"
import { ScheduledCatalogHost } from "../scheduled-catalog-host.js"

export interface CatalogScheduledIndexPageProps extends CatalogAdminRoutePageProps {
  scope: ScheduledScope
}

/** Shared packaged page for family/subtype catalog views. */
export default function CatalogScheduledIndexPage({
  scope,
  search,
  updateSearch,
  scopeOptions,
}: CatalogScheduledIndexPageProps) {
  return (
    <ScheduledCatalogHost
      scope={scope}
      search={search as CatalogSearchParams}
      onSearchChange={(updater, replace = true) => updateSearch(updater as never, { replace })}
      scopeOptions={scopeOptions}
    />
  )
}
