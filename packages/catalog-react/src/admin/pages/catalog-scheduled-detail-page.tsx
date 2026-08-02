"use client"

import type { CatalogDetailSurface } from "../../catalog-surfaces.js"
import type { CatalogAdminRoutePageProps } from "../index.js"
import { VerticalDetailHost } from "../vertical-detail-host.js"

export interface CatalogScheduledDetailPageProps extends CatalogAdminRoutePageProps {
  surface: CatalogDetailSurface
}

/** Shared packaged detail page for family/subtype catalog views. */
export default function CatalogScheduledDetailPage({
  surface,
  params,
  scopeOptions,
}: CatalogScheduledDetailPageProps) {
  return (
    <VerticalDetailHost
      surface={surface}
      id={params.id ?? ""}
      locale={scopeOptions?.defaultLocale}
    />
  )
}
