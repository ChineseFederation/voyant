import type { AdminRoutePageProps } from "@voyant-travel/admin"

import { parseDepartureWorkspaceTab } from "../../departure-search-params.js"
import { AvailabilitySlotDetailHost } from "../slot-detail-host.js"

/**
 * Param-taking page for the `availability-slot-detail` contribution: reads
 * the slot id off {@link AdminRoutePageProps} and binds it onto the packaged
 * host. Resolved lazily through the contribution's `page` loader so the
 * detail page lands in its own chunk.
 *
 * `search.tab` was already validated by the contribution's `validateSearch`
 * (`departureWorkspaceSearchSchema`); it is re-narrowed here rather than cast,
 * so a host that binds the page without that contract still lands on a real
 * section instead of on `undefined`. Selecting a section patches the URL in
 * place through `updateSearch`, which replaces rather than pushes — moving
 * between sections is not history.
 */
// fallow-ignore-next-line unused-export
export default function AvailabilitySlotDetailRoutePage({
  params,
  search,
  updateSearch,
}: AdminRoutePageProps) {
  return (
    <AvailabilitySlotDetailHost
      slotId={params.id ?? ""}
      tab={parseDepartureWorkspaceTab(search.tab)}
      onTabChange={(tab) => updateSearch((previous) => ({ ...previous, tab }))}
    />
  )
}
