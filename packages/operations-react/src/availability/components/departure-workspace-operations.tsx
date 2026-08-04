"use client"

import {
  Button,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@voyant-travel/ui/components"
import { CalendarDays, CalendarX, Package, ShoppingBag, Truck } from "lucide-react"
import type { ReactNode } from "react"
import type { AvailabilityUiMessages } from "../i18n/index.js"
import type {
  AvailabilityCloseoutRow,
  AvailabilityPickupPointRow,
  AvailabilitySlotPickupRow,
  DepartureSummary,
} from "../index.js"
import { DepartureSection } from "./departure-stat.js"

/**
 * Operations: everything that has to be squared away before the departure
 * runs.
 *
 * Pickup, Closeouts and Extras used to be three top-level tabs, two of which
 * VANISHED when they were empty — so "no pickup point has been set" and "this
 * product has no pickups at all" looked identical, and neither offered a way
 * to fix it. They are sections here instead, always rendered, each with the
 * next authorized action attached to its empty state (AC7).
 *
 * They belong together because they are the same job: the day-of-departure
 * logistics an operator owns. Pickup is where the driver collects, Closeouts
 * is whether the date may still sell, and Extras is what the guide has to
 * carry and collect.
 */
export function DepartureOperationsSection({
  summary,
  pickupRows,
  pickupPointById,
  closeoutRows,
  messages,
  renderExtras,
  extrasTitle,
  onAddPickupPoint,
  onAddCloseout,
  onOpenProduct,
  productId,
}: {
  summary: DepartureSummary | null
  pickupRows: ReadonlyArray<AvailabilitySlotPickupRow>
  pickupPointById: ReadonlyMap<string, AvailabilityPickupPointRow>
  closeoutRows: ReadonlyArray<AvailabilityCloseoutRow>
  messages: AvailabilityUiMessages
  renderExtras?: () => ReactNode
  /** Host override for the Extras heading — Bookings owns that vocabulary. */
  extrasTitle?: ReactNode
  onAddPickupPoint?: () => void
  onAddCloseout?: () => void
  onOpenProduct?: (productId: string) => void
  productId: string | null
}) {
  const details = messages.details
  const copy = details.departure.operations
  const noValue = details.noValue
  const extras = summary?.extras ?? null

  return (
    <div className="flex flex-col gap-8">
      <DepartureSection slot="departure-pickup" title={copy.pickupTitle}>
        {pickupRows.length === 0 ? (
          <SectionEmpty
            slot="departure-pickup-empty"
            icon={<Truck aria-hidden="true" />}
            title={copy.pickupEmptyTitle}
            description={copy.pickupEmptyDescription}
            actionLabel={copy.pickupEmptyAction}
            onAction={onAddPickupPoint}
          />
        ) : (
          <div className="flex flex-col gap-3 text-sm">
            {pickupRows.map((pickup) => {
              const point = pickupPointById.get(pickup.pickupPointId)
              return (
                <div key={pickup.id} className="rounded-md border p-3">
                  <div className="flex items-center gap-2 font-medium">
                    <Truck className="size-4" aria-hidden="true" />
                    {/* Never the raw pickup-point id: a row's visible label is
                        a name, not an identifier. */}
                    {point?.name ?? copy.pickupPointUnknown}
                  </div>
                  <div className="mt-1 text-muted-foreground">
                    {point?.locationText ?? details.slot.noLocationText}
                  </div>
                  <div className="mt-2">
                    {`${details.slot.initialLabel}: ${pickup.initialCapacity ?? noValue} · ${details.slot.remainingLabel}: ${pickup.remainingCapacity ?? noValue}`}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </DepartureSection>

      <DepartureSection slot="departure-closeouts" title={copy.closeoutsTitle}>
        {closeoutRows.length === 0 ? (
          <SectionEmpty
            slot="departure-closeouts-empty"
            icon={<CalendarX aria-hidden="true" />}
            title={copy.closeoutsEmptyTitle}
            description={copy.closeoutsEmptyDescription}
            actionLabel={copy.closeoutsEmptyAction}
            onAction={onAddCloseout}
          />
        ) : (
          <div className="flex flex-col gap-3 text-sm">
            {closeoutRows.map((closeout) => (
              <div key={closeout.id} className="rounded-md border p-3">
                <div className="flex items-center gap-2 font-medium">
                  <CalendarDays className="size-4" aria-hidden="true" />
                  {closeout.dateLocal}
                </div>
                <div className="mt-1 text-muted-foreground">
                  {`${details.slot.createdByLabel}: ${closeout.createdBy ?? noValue}`}
                </div>
                {closeout.reason ? (
                  <div className="mt-2 whitespace-pre-wrap">{closeout.reason}</div>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </DepartureSection>

      <DepartureSection slot="departure-extras" title={extrasTitle ?? copy.extrasTitle}>
        {/* The extras manifest is Bookings' panel; availability only decides
            whether there is anything for it to show. `extras === null` means
            the module is not deployed, which reads the same to the operator as
            "nothing is offered" — both need the product configured. */}
        {renderExtras && extras && extras.offered > 0 ? (
          renderExtras()
        ) : (
          <SectionEmpty
            slot="departure-extras-empty"
            icon={<ShoppingBag aria-hidden="true" />}
            title={copy.extrasEmptyTitle}
            description={copy.extrasEmptyDescription}
            actionLabel={copy.extrasEmptyAction}
            actionIcon={<Package data-icon="inline-start" aria-hidden="true" />}
            onAction={productId && onOpenProduct ? () => onOpenProduct(productId) : undefined}
          />
        )}
      </DepartureSection>
    </div>
  )
}

function SectionEmpty({
  slot,
  icon,
  title,
  description,
  actionLabel,
  actionIcon,
  onAction,
}: {
  slot: string
  icon: ReactNode
  title: string
  description: string
  actionLabel: string
  actionIcon?: ReactNode
  onAction?: () => void
}) {
  return (
    <Empty data-slot={slot} className="border">
      <EmptyHeader>
        <EmptyMedia variant="icon">{icon}</EmptyMedia>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>{description}</EmptyDescription>
      </EmptyHeader>
      {onAction ? (
        <Button variant="outline" onClick={onAction}>
          {actionIcon}
          {actionLabel}
        </Button>
      ) : null}
    </Empty>
  )
}
