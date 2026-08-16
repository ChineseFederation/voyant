"use client"

import { Badge } from "@voyant-travel/ui/components/badge"
import { Button } from "@voyant-travel/ui/components/button"
import { Card } from "@voyant-travel/ui/components/card"
import { Input } from "@voyant-travel/ui/components/input"
import { Search, Ship as ShipIcon } from "lucide-react"
import { useEffect, useState } from "react"

import { useCruisesUiMessagesOrDefault } from "../i18n/index.js"
import type { ShipRecord } from "../schemas.js"
import { shipCoverImage, shipSummary } from "./ship-presentation.js"

export interface ShipsIndexPageProps {
  ships: ShipRecord[]
  total: number
  isLoading: boolean
  isError: boolean
  /** Current free-text query, owned by the route's URL state. */
  query: string
  onQueryChange: (query: string) => void
  onOpenShip: (ship: ShipRecord) => void
  /** Rows one request can return, so a longer fleet can say so rather than look complete. */
  pageSize?: number
}

/**
 * Ships browse surface.
 *
 * Ships are reference data, not sellable inventory: a cruise references one,
 * and an operator comes here to check a vessel's specification or deck plan
 * rather than to merchandise it. So this is a plain paginated list off the
 * admin ships route, not an indexed catalog vertical — there is no ships
 * collection in the search index to facet against, and inventing one to power
 * a reference list would be a lot of machinery for a few hundred rows.
 */
export function ShipsIndexPage({
  ships,
  total,
  isLoading,
  isError,
  query,
  onQueryChange,
  onOpenShip,
  pageSize,
}: ShipsIndexPageProps) {
  const messages = useCruisesUiMessagesOrDefault().shipsAdmin
  const [buffer, setBuffer] = useState(query)

  // Same contract as the catalog search box: publish after a quiet period so
  // typing does not write a history entry per character.
  useEffect(() => setBuffer(query), [query])
  useEffect(() => {
    if (buffer === query) return
    const timer = setTimeout(() => onQueryChange(buffer), 200)
    return () => clearTimeout(timer)
  }, [buffer, query, onQueryChange])

  return (
    <div className="mx-auto w-full max-w-screen-2xl">
      <div className="mb-4">
        <h1 className="font-semibold text-2xl">{messages.title}</h1>
        <p className="text-muted-foreground text-sm">{messages.subtitle}</p>
      </div>

      <div className="relative mb-4 max-w-xl">
        <Search
          className="-translate-y-1/2 absolute top-1/2 left-3 h-4 w-4 text-muted-foreground"
          aria-hidden="true"
        />
        <Input
          type="search"
          value={buffer}
          onChange={(event) => setBuffer(event.target.value)}
          placeholder={messages.searchPlaceholder}
          aria-label={messages.searchLabel}
          className="pl-9"
        />
      </div>

      {isError ? (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 p-4 text-destructive text-sm">
          {messages.loadError}
        </div>
      ) : isLoading ? (
        <ShipsSkeleton />
      ) : ships.length === 0 ? (
        <div className="rounded-md border border-dashed p-8 text-center text-muted-foreground text-sm">
          {query ? messages.emptyFiltered : messages.empty}
        </div>
      ) : (
        <>
          <div className="mb-3 text-muted-foreground text-sm">
            {/* A fleet longer than one request says so. Printing the total over
                a truncated grid would read as "this is all of them". */}
            {pageSize != null && total > ships.length
              ? messages.resultCountTruncated
                  .replace("{shown}", String(ships.length))
                  .replace("{count}", String(total))
              : total === 1
                ? messages.resultCountOne
                : messages.resultCount.replace("{count}", String(total))}
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {ships.map((ship) => (
              <ShipCard key={ship.id} ship={ship} onOpen={() => onOpenShip(ship)} />
            ))}
          </div>
        </>
      )}
    </div>
  )
}

function ShipCard({ ship, onOpen }: { ship: ShipRecord; onOpen: () => void }) {
  const messages = useCruisesUiMessagesOrDefault().shipsAdmin
  const cover = shipCoverImage(ship)
  const summary = shipSummary(ship, {
    types: messages.types,
    guestsShort: messages.guestsShort,
    decksShort: messages.decksShort,
  })

  return (
    <Card
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault()
          onOpen()
        }
      }}
      className="group flex cursor-pointer flex-col gap-0 overflow-hidden p-0 transition hover:border-primary/40 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div className="relative aspect-[4/3] w-full overflow-hidden bg-muted">
        {cover ? (
          <img
            src={cover}
            alt={ship.name}
            loading="lazy"
            className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-muted-foreground">
            <ShipIcon className="h-8 w-8" aria-hidden="true" />
          </div>
        )}
        {!ship.isActive && (
          <Badge variant="secondary" className="absolute top-2 left-2 shadow-sm">
            {messages.inactive}
          </Badge>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-2 p-3">
        <div className="min-w-0">
          <div className="truncate font-medium leading-tight">{ship.name || messages.unnamed}</div>
          <div className="truncate text-muted-foreground text-sm">{summary}</div>
        </div>
        <div className="mt-auto flex items-end justify-end pt-1">
          <Button
            size="sm"
            variant="secondary"
            onClick={(event) => {
              event.stopPropagation()
              onOpen()
            }}
          >
            {messages.view}
          </Button>
        </div>
      </div>
    </Card>
  )
}

function ShipsSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {Array.from({ length: 8 }, (_, index) => index).map((index) => (
        <div key={index} className="overflow-hidden rounded-lg border">
          <div className="aspect-[4/3] w-full animate-pulse bg-muted/40" />
          <div className="space-y-2 p-3">
            <div className="h-4 w-2/3 animate-pulse rounded bg-muted/40" />
            <div className="h-3 w-1/2 animate-pulse rounded bg-muted/20" />
          </div>
        </div>
      ))}
    </div>
  )
}
