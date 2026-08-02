"use client"

import { useAdminBreadcrumbs, useAdminHref, useOperatorAdminMessages } from "@voyant-travel/admin"
import { useSuppliers } from "@voyant-travel/distribution-react/suppliers"
import { useMemo, useState } from "react"

import { type CatalogDetailSurface, catalogSurfaceVertical } from "../catalog-surfaces.js"
import {
  type CatalogVerticalDetailBreadcrumb,
  CatalogVerticalDetailPage,
} from "../components/catalog-vertical-detail-page.js"

export interface VerticalDetailHostProps {
  surface: CatalogDetailSurface
  id: string
  locale?: string
}

/**
 * Packaged admin host for `CatalogVerticalDetailPage` — binds the supplier
 * directory, the localized surface label, and breadcrumbs, so
 * host route files stay trivial.
 */
export function VerticalDetailHost({ surface, id, locale }: VerticalDetailHostProps) {
  const resolveHref = useAdminHref()
  const nav = useOperatorAdminMessages().nav
  const vertical = catalogSurfaceVertical(surface)
  const surfaceLabel = surfaceTitle(surface, nav)
  const surfaceHref = resolveHref("catalog.browse", { surface })

  const suppliersQuery = useSuppliers({ limit: 100 })
  const formatSupplier = useMemo(() => {
    const m = new Map<string, string>()
    for (const sup of suppliersQuery.data?.data ?? []) m.set(sup.id, sup.name)
    return (sid: string) => m.get(String(sid)) ?? String(sid)
  }, [suppliersQuery.data])

  // The packaged page resolves the title from content; mirror its breadcrumbs
  // into the admin breadcrumb bar.
  const [crumbs, setCrumbs] = useState<CatalogVerticalDetailBreadcrumb[]>([
    { label: surfaceLabel, href: surfaceHref },
  ])
  useAdminBreadcrumbs(crumbs)

  return (
    <CatalogVerticalDetailPage
      id={id}
      vertical={vertical}
      surfaceLabel={surfaceLabel}
      surfaceHref={surfaceHref}
      locale={locale}
      formatSupplier={formatSupplier}
      onBreadcrumbs={setCrumbs}
    />
  )
}

function surfaceTitle(
  surface: CatalogDetailSurface,
  nav: ReturnType<typeof useOperatorAdminMessages>["nav"],
): string {
  switch (surface) {
    case "cruises":
      return nav.catalogCruises
    case "accommodations":
      return nav.catalogAccommodations
    case "excursions":
      return nav.catalogExcursions
    case "tours":
      return nav.catalogTours
    case "boat-tours":
      return nav.catalogBoatTours
    case "activities":
      return nav.catalogActivities
    case "attractions":
      return nav.catalogAttractions
    case "events":
      return nav.catalogEvents
    case "transportation":
      return nav.catalogTransportation
    default:
      return nav.catalogProducts
  }
}
