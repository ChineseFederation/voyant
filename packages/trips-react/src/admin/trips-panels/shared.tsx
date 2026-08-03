"use client"

import { useOperatorAdminMessages as useAdminMessages } from "@voyant-travel/admin"
import type { Draft } from "@voyant-travel/bookings-react/journey"
import type { CatalogSearchHit } from "@voyant-travel/catalog-react"
import type {
  AncillaryCatalog,
  AncillarySelection,
  CabinClass,
  FlightOffer,
} from "@voyant-travel/flights/contract/types"
import { Alert, AlertDescription, AlertTitle } from "@voyant-travel/ui/components/alert"
import { Button } from "@voyant-travel/ui/components/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@voyant-travel/ui/components/dropdown-menu"
import { Label } from "@voyant-travel/ui/components/label"
import {
  BedDouble,
  Check,
  CircleAlert,
  Plane,
  Plus,
  Route as RouteIcon,
  Sailboat,
  Wrench,
} from "lucide-react"
import type { ComponentType, ReactNode } from "react"

/**
 * Verticals a Trip component can be composed from. `extras` is deliberately
 * absent — an Extra is Product-owned and selected inside a Product Booking, so
 * it is never a component the composer can pick on its own.
 */
export type CatalogVertical = "products" | "accommodations" | "cruises" | "flights"
export type PendingVerticalKind = "product" | "stay" | "flight" | "cruise" | "manual"

export type PanelsMessages = ReturnType<typeof useAdminMessages>["trips"]["adminComposer"]["panels"]

export interface AvailabilitySlot {
  id: string
  dateLocal: string
  startsAt: string
  endsAt?: string | null
  timezone: string
  status: string
  unlimited: boolean
  remainingPax?: number | null
  initialPax?: number | null
  nights?: number | null
  days?: number | null
}

// Shared shape for the catalog-backed kinds. The vertical isn't stored on
// the pending component itself — it's implied by `kind` (`product` →
// products, `stay` → accommodations). That keeps the menu single-step (no
// secondary picker) and the per-kind catalog query well-scoped.
type CatalogPendingFields = {
  localId: string
  catalogEntityId: string | null
  catalogEntityName: string | null
  catalogSourceKind: string | null
  catalogSourceConnectionId: string | null
  catalogSourceRef: string | null
  catalogThumbnailUrl: string | null
  bookingDraft: Draft | null
  startsAt: string
  endsAt: string
  commitError: string | null
}

export type PendingComponent =
  | ({ kind: "product" } & CatalogPendingFields)
  | ({ kind: "stay" } & CatalogPendingFields)
  | {
      kind: "flight"
      localId: string
      tripType: "one_way" | "round_trip"
      origin: string | null
      destination: string | null
      departDate: string
      returnDate: string
      cabin: CabinClass
      selectedOffer: FlightOffer | null
      ancillaryCatalog: AncillaryCatalog | null
      fareBundlePicks: NonNullable<AncillarySelection["fareBundle"]>
      baggagePicks: NonNullable<AncillarySelection["baggage"]>
      assistancePicks: NonNullable<AncillarySelection["assistance"]>
      extrasPicks: NonNullable<AncillarySelection["extras"]>
      sameFareForAllPassengers: boolean
      sameBaggageBothDirections: boolean
      commitError: string | null
    }
  | {
      kind: "cruise"
      localId: string
      description: string
      cabin: string
      embarkationDate: string
      estimatedAmount: string
      commitError: string | null
    }
  | {
      kind: "manual"
      localId: string
      name: string
      description: string
      currency: string
      subtotalCents: number | null
      taxRatePct: string
      startsAt: string
      endsAt: string
      commitError: string | null
    }

function verticalsFor(messages: PanelsMessages): Array<{
  kind: PendingVerticalKind
  label: string
  description: string
}> {
  const v = messages.verticals
  return [
    { kind: "product", label: v.productLabel, description: v.productDescription },
    { kind: "stay", label: v.stayLabel, description: v.stayDescription },
    { kind: "flight", label: v.flightLabel, description: v.flightDescription },
    { kind: "cruise", label: v.cruiseLabel, description: v.cruiseDescription },
    { kind: "manual", label: v.manualLabel, description: v.manualDescription },
  ]
}

export function verticalForKind(kind: "product" | "stay"): CatalogVertical {
  return kind === "stay" ? "accommodations" : "products"
}

function genLocalId() {
  return `pc_${Math.random().toString(36).slice(2, 10)}`
}

export function catalogHitLabel(hit: CatalogSearchHit): string {
  return (
    catalogHitStringField(hit, "name") ??
    catalogHitStringField(hit, "title") ??
    catalogHitStringField(hit, "hotel.name") ??
    hit.id
  )
}

export function catalogHitSourceKind(hit: CatalogSearchHit): string | null {
  return catalogHitStringField(hit, "source.kind")
}

export function catalogHitThumbnailUrl(hit: CatalogSearchHit): string | null {
  return (
    catalogHitStringField(hit, "thumbnailUrl") ??
    catalogHitStringField(hit, "hero_image_url") ??
    catalogHitStringField(hit, "imageUrl")
  )
}

export function catalogHitSourceConnectionId(hit: CatalogSearchHit): string | null {
  return (
    catalogHitStringField(hit, "source.connectionId") ??
    catalogHitStringField(hit, "source_connection_id")
  )
}

export function catalogHitSourceRef(hit: CatalogSearchHit): string | null {
  return catalogHitStringField(hit, "source.ref") ?? catalogHitStringField(hit, "source_ref")
}

export function catalogHitStringField(hit: CatalogSearchHit, field: string): string | null {
  const value = hit.document.fields[field]
  return typeof value === "string" && value.trim().length > 0 ? value : null
}

export function newPendingComponent(kind: PendingVerticalKind): PendingComponent {
  const localId = genLocalId()
  switch (kind) {
    case "product":
    case "stay":
      return {
        kind,
        localId,
        catalogEntityId: null,
        catalogEntityName: null,
        catalogSourceKind: null,
        catalogSourceConnectionId: null,
        catalogSourceRef: null,
        catalogThumbnailUrl: null,
        bookingDraft: null,
        startsAt: "",
        endsAt: "",
        commitError: null,
      }
    case "flight":
      return {
        kind,
        localId,
        tripType: "one_way",
        origin: null,
        destination: null,
        departDate: "",
        returnDate: "",
        cabin: "economy",
        selectedOffer: null,
        ancillaryCatalog: null,
        fareBundlePicks: [],
        baggagePicks: [],
        assistancePicks: [],
        extrasPicks: [],
        sameFareForAllPassengers: true,
        sameBaggageBothDirections: true,
        commitError: null,
      }
    case "cruise":
      return {
        kind,
        localId,
        description: "",
        cabin: "",
        embarkationDate: "",
        estimatedAmount: "",
        commitError: null,
      }
    default:
      return {
        kind,
        localId,
        name: "",
        description: "",
        currency: "EUR",
        subtotalCents: null,
        taxRatePct: "",
        startsAt: "",
        endsAt: "",
        commitError: null,
      }
  }
}

export function computePlaceholderTotals(
  subtotalCents: number | null,
  taxRatePct: string,
): { subtotal: number; tax: number; total: number } {
  const subtotal = subtotalCents ?? 0
  const rate = Number.parseFloat(taxRatePct || "0") / 100
  const validRate = Number.isFinite(rate) && rate >= 0 ? rate : 0
  const tax = Math.round(subtotal * validRate)
  return { subtotal, tax, total: subtotal + tax }
}

export function Section({
  title,
  description,
  action,
  children,
  className,
}: {
  title?: string
  description?: string
  action?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <section className={`flex flex-col gap-4 rounded-md border bg-card p-6 ${className ?? ""}`}>
      {title || description || action ? (
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            {title ? <h2 className="font-medium text-base">{title}</h2> : null}
            {description ? <p className="text-muted-foreground text-sm">{description}</p> : null}
          </div>
          {action}
        </div>
      ) : null}
      {children}
    </section>
  )
}

export function Field({
  label,
  className,
  children,
}: {
  label: string
  className?: string
  children: ReactNode
}) {
  return (
    <div className={className ? `flex flex-col gap-1.5 ${className}` : "flex flex-col gap-1.5"}>
      <Label className="text-muted-foreground text-xs">{label}</Label>
      {children}
    </div>
  )
}

export function verticalIconFor(kind: PendingVerticalKind): ComponentType<{ className?: string }> {
  if (kind === "product") return RouteIcon
  if (kind === "stay") return BedDouble
  if (kind === "flight") return Plane
  if (kind === "cruise") return Sailboat
  return Wrench
}

export function verticalLabelFor(kind: PendingVerticalKind, messages: PanelsMessages) {
  const found = verticalsFor(messages).find((vertical) => vertical.kind === kind)
  return found?.label ?? kind
}

export function StatusAlert({
  title,
  message,
  tone,
}: {
  title: string
  message: string
  tone?: "error"
}) {
  return (
    <Alert variant={tone === "error" ? "destructive" : "default"}>
      {tone === "error" ? <CircleAlert className="size-4" /> : <Check className="size-4" />}
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  )
}

export function AddComponentMenu({
  onAdd,
  disabled,
}: {
  onAdd(kind: PendingVerticalKind): void
  disabled?: boolean
}) {
  const t = useAdminMessages().trips.adminComposer.panels
  const verticals = verticalsFor(t)
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="outline" disabled={disabled} className="w-full">
            <Plus className="size-4" />
            {t.addComponentMenu}
          </Button>
        }
      />
      <DropdownMenuContent align="end" className="w-72">
        {verticals.map((vertical) => {
          const Icon = verticalIconFor(vertical.kind)
          return (
            <DropdownMenuItem
              key={vertical.kind}
              onClick={() => onAdd(vertical.kind)}
              className="flex items-start gap-3 py-2"
            >
              <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-muted">
                <Icon className="size-4" />
              </span>
              <span className="flex min-w-0 flex-col">
                <span className="font-medium text-sm">{vertical.label}</span>
                <span className="text-muted-foreground text-xs">{vertical.description}</span>
              </span>
            </DropdownMenuItem>
          )
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
