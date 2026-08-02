"use client"

import { useAdminHref, useOperatorAdminMessages } from "@voyant-travel/admin"
import {
  ScheduledCatalogPage as ScheduledCatalogPageUi,
  type ScheduledScope,
} from "../components/scheduled-catalog-page.js"
import type { CatalogSearchParams } from "../index.js"
import { type CatalogAdminScopeOptions, CatalogVerticalHost } from "./catalog-vertical-host.js"
import { openHrefInNewTab } from "./open-in-new-tab.js"

export interface ScheduledCatalogHostProps {
  scope: ScheduledScope
  search: CatalogSearchParams
  onSearchChange: (
    updater: (prev: CatalogSearchParams) => CatalogSearchParams,
    replace?: boolean,
  ) => void
  scopeOptions?: CatalogAdminScopeOptions
}

/**
 * Packaged admin host for `ScheduledCatalogPage` — supplies the localized
 * title/tagline and renders `CatalogVerticalHost` (markets/suppliers/products
 * wiring) as the embedded browse grid, opening each result's vertical detail
 * page (the `catalog.detail` destination) in a new tab on click.
 */
export function ScheduledCatalogHost({
  scope,
  search,
  onSearchChange,
  scopeOptions,
}: ScheduledCatalogHostProps) {
  const resolveHref = useAdminHref()
  const nav = useOperatorAdminMessages().nav
  const [title, subtitle] = scheduledScopeCopy(scope, nav)

  return (
    <ScheduledCatalogPageUi
      scope={scope}
      title={title}
      subtitle={subtitle}
      renderBrowseGrid={({ lockedFacets, lockedRanges }) => (
        <CatalogVerticalHost
          vertical="products"
          search={search}
          onSearchChange={onSearchChange}
          embedded
          lockedFacets={lockedFacets}
          lockedRanges={lockedRanges}
          scopeOptions={scopeOptions}
          onOpenDetail={(hit) =>
            openHrefInNewTab(resolveHref("catalog.detail", { surface: scope, id: hit.id }))
          }
        />
      )}
    />
  )
}

function scheduledScopeCopy(
  scope: ScheduledScope,
  nav: ReturnType<typeof useOperatorAdminMessages>["nav"],
): readonly [string, string] {
  switch (scope) {
    case "excursions":
      return [nav.catalogExcursions, nav.catalogExcursionsTagline]
    case "tours":
      return [nav.catalogTours, nav.catalogToursTagline]
    case "boat-tours":
      return [nav.catalogBoatTours, nav.catalogBoatToursTagline]
    case "activities":
      return [nav.catalogActivities, nav.catalogActivitiesTagline]
    case "attractions":
      return [nav.catalogAttractions, nav.catalogAttractionsTagline]
    case "events":
      return [nav.catalogEvents, nav.catalogEventsTagline]
    case "transportation":
      return [nav.catalogTransportation, nav.catalogTransportationTagline]
  }
}
