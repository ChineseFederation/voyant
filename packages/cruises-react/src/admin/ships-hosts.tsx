"use client"

import { useAdminBreadcrumbs, useAdminHref } from "@voyant-travel/admin"
import { useSuppliers } from "@voyant-travel/distribution-react/suppliers"
import { useMemo } from "react"

import { useShip, useShips } from "../hooks/use-ships.js"
import { useCruisesUiMessagesOrDefault } from "../i18n/index.js"
import { openHrefInNewTab } from "./open-in-new-tab.js"
import { ShipDetailPage } from "./ship-detail-page.js"
import { ShipsIndexPage } from "./ships-index-page.js"

/**
 * How many ships one page of the browse list asks for.
 *
 * `shipListQuerySchema` caps `limit` at 100 — the cruises route has its own
 * bound, narrower than the shared `paginationSchema`. Asking for more does not
 * degrade to the cap: query validation rejects the request outright, so the
 * whole surface renders its error state.
 */
const SHIPS_PAGE_SIZE = 100

export interface ShipsIndexHostProps {
  /** Current query from the route's URL state. */
  query?: string
  onQueryChange?: (query: string) => void
  /** Navigate to a ship's detail page. */
  onOpenShip?: (id: string) => void
}

/** Packaged host for the ships browse page — binds the ships list query. */
export function ShipsIndexHost({ query = "", onQueryChange, onOpenShip }: ShipsIndexHostProps) {
  const messages = useCruisesUiMessagesOrDefault().shipsAdmin
  const resolveHref = useAdminHref()
  useAdminBreadcrumbs(useMemo(() => [{ label: messages.title }], [messages.title]))

  const trimmed = query.trim()
  const shipsQuery = useShips({
    limit: SHIPS_PAGE_SIZE,
    search: trimmed ? trimmed : undefined,
  })

  return (
    <ShipsIndexPage
      ships={shipsQuery.data?.data ?? []}
      total={shipsQuery.data?.total ?? 0}
      pageSize={SHIPS_PAGE_SIZE}
      isLoading={shipsQuery.isLoading}
      isError={shipsQuery.isError}
      query={query}
      onQueryChange={(next) => onQueryChange?.(next)}
      onOpenShip={(ship) => {
        if (onOpenShip) {
          onOpenShip(ship.id)
          return
        }
        // Same contract the catalog list uses: keep the browse page in place
        // and open the record beside it. `useAdminHref` yields "#" when the
        // host has not registered a resolver, which the helper declines to
        // open rather than cloning the current page.
        openHrefInNewTab(resolveHref("cruiseShip.detail", { shipId: ship.id }))
      }}
    />
  )
}

export interface ShipDetailHostProps {
  id: string
  /** Href of the ships browse page, for the breadcrumb root. */
  shipsHref?: string
}

/** Packaged host for the ship detail page — binds the ship + supplier directory. */
export function ShipDetailHost({ id, shipsHref }: ShipDetailHostProps) {
  const messages = useCruisesUiMessagesOrDefault().shipsAdmin
  const resolveHref = useAdminHref()
  const shipQuery = useShip(id)
  const suppliersQuery = useSuppliers({ limit: 100 })

  const formatSupplier = useMemo(() => {
    const names = new Map<string, string>()
    for (const supplier of suppliersQuery.data?.data ?? []) names.set(supplier.id, supplier.name)
    return (supplierId: string) => names.get(supplierId) ?? supplierId
  }, [suppliersQuery.data])

  const name = shipQuery.data?.name
  const shipsListHref = shipsHref ?? resolveHref("cruiseShip.list", {})
  useAdminBreadcrumbs(
    useMemo(() => {
      const root = {
        label: messages.backToShips,
        ...(shipsListHref && shipsListHref !== "#" ? { href: shipsListHref } : {}),
      }
      return name ? [root, { label: name }] : [root]
    }, [messages.backToShips, shipsListHref, name]),
  )

  return (
    <ShipDetailPage
      ship={shipQuery.data ?? null}
      isLoading={shipQuery.isLoading}
      isError={shipQuery.isError}
      formatSupplier={formatSupplier}
    />
  )
}
