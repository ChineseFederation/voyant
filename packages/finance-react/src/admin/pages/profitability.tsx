"use client"

import { useAdminBreadcrumbs, useAdminNavigate } from "@voyant-travel/admin"

import {
  type ProfitabilityExportFilters,
  ProfitabilityPage,
} from "../../components/profitability-page.js"
import { useFinanceUiMessagesOrDefault } from "../../i18n/index.js"
import { useVoyantFinanceContext } from "../../provider.js"

function exportUrl(
  baseUrl: string,
  kind: "departures" | "products",
  filters: ProfitabilityExportFilters,
): string {
  const params = new URLSearchParams()
  if (filters.from) params.set("from", filters.from)
  if (filters.to) params.set("to", filters.to)
  const qs = params.toString()
  return `${baseUrl}/v1/admin/finance/reports/profitability/${kind}/export${qs ? `?${qs}` : ""}`
}

/**
 * Packaged route page for the profitability report (route contribution
 * `finance-profitability`). CSV export links resolve their API origin from
 * the shared finance provider context (`useVoyantFinanceContext`) — the same
 * `baseUrl` every data hook in this package reads — so the page needs no
 * app-supplied URL prop. Exports open in a new tab (browser-only; guarded
 * for SSR render passes).
 */
// fallow-ignore-next-line unused-export
export default function FinanceProfitabilityRoutePage() {
  const messages = useFinanceUiMessagesOrDefault()
  useAdminBreadcrumbs([{ label: messages.profitability.title }])
  const { baseUrl } = useVoyantFinanceContext()
  const navigateTo = useAdminNavigate()

  const openExport = (kind: "departures" | "products", filters: ProfitabilityExportFilters) => {
    if (typeof window === "undefined") return
    window.open(exportUrl(baseUrl, kind, filters), "_blank", "noopener,noreferrer")
  }

  return (
    <ProfitabilityPage
      onExportDepartures={(filters) => openExport("departures", filters)}
      onExportProducts={(filters) => openExport("products", filters)}
      // Deep-link report rows to the operator workspaces. `departureId` is the
      // availability-slot id the Departure workspace keys on; `productId` maps
      // straight to the Product workspace.
      onOpenDeparture={(departureId) =>
        navigateTo("availabilitySlot.detail", { slotId: departureId })
      }
      onOpenProduct={(productId) => navigateTo("product.detail", { productId })}
    />
  )
}
