"use client"

import { useAdminBreadcrumbs, useAdminHref, useOperatorAdminMessages } from "@voyant-travel/admin"
import { useState } from "react"

import { CruiseDetailPage } from "../components/cruise-detail-page.js"

export interface CruiseDetailHostProps {
  id: string
  locale?: string
}

/**
 * Packaged admin host for `CruiseDetailPage` — injects the localized
 * "Cruises" label and breadcrumbs.
 */
export function CruiseDetailHost({ id, locale }: CruiseDetailHostProps) {
  const resolveHref = useAdminHref()
  const cruisesLabel = useOperatorAdminMessages().nav.catalogCruises
  const cruisesHref = resolveHref("catalog.browse", { surface: "cruises" })
  const [crumbs, setCrumbs] = useState<Array<{ label: string; href?: string }>>([
    { label: cruisesLabel, href: cruisesHref },
  ])
  useAdminBreadcrumbs(crumbs)

  return (
    <CruiseDetailPage
      id={id}
      locale={locale}
      cruisesLabel={cruisesLabel}
      cruisesHref={cruisesHref}
      onBreadcrumbs={setCrumbs}
    />
  )
}
