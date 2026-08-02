"use client"

import type {
  AllocationManifestTraveler,
  AllocationResource,
} from "@voyant-travel/operations-react/availability"
import { Table, TableBody, TableHead, TableHeader, TableRow } from "@voyant-travel/ui/components"
import { Users } from "lucide-react"
import { type ReactNode, useState } from "react"

import { useAllocationUiMessagesOrDefault } from "../i18n/index.js"
import { type AllocationOccupants, groupResourcesBySubType } from "./slot-allocation-model.js"
import { ResourceRow, UnallocatedTravelersTable } from "./slot-allocation-resource-view-rows.js"
import { AllocationColumn } from "./slot-allocation-shared.js"

export interface EditResourceInput {
  label: string | null
  capacity: number
}

export function ResourceColumnsView({
  kind,
  assignable = true,
  resources,
  travelers,
  occupants,
  sharingGroupLabels,
  optionNamesById,
  onAssignTraveler,
  onUnassignTraveler,
  onRemoveResource,
  onEditResource,
  onBookingOpen,
  renderTravelerActions,
}: {
  kind: string
  /** Parent resources such as vehicles are managed here but never receive travelers directly. */
  assignable?: boolean
  resources: AllocationResource[]
  travelers: AllocationManifestTraveler[]
  occupants: AllocationOccupants
  sharingGroupLabels: Record<string, string>
  /**
   * Map from product_option_id → option name, used to badge each resource
   * row with the option it's tied to (when refType === "option"). Lets
   * operators distinguish "Standard double" rooms from "Junior suite"
   * rooms at a glance. Omit when the host doesn't have option data.
   */
  optionNamesById?: ReadonlyMap<string, string>
  /** Assign a single unallocated traveler to a specific resource. */
  onAssignTraveler: (travelerId: string, resourceId: string) => void
  /** Remove a single traveler from their current resource. */
  onUnassignTraveler: (travelerId: string) => void
  onRemoveResource: (resourceId: string) => void
  onEditResource?: (resourceId: string, input: EditResourceInput) => Promise<void> | void
  /**
   * Fired when the operator clicks a booking number on a chip. The
   * host decides whether to open a side panel, navigate, etc.
   */
  onBookingOpen?: (bookingId: string) => void
  renderTravelerActions?: (traveler: AllocationManifestTraveler) => ReactNode
}) {
  const messages = useAllocationUiMessagesOrDefault()
  return (
    <div
      className={assignable ? "grid gap-4 lg:grid-cols-[minmax(16rem,20rem)_1fr]" : "grid gap-4"}
    >
      {assignable ? (
        <AllocationColumn
          id="unallocated"
          icon={<Users className="size-4" aria-hidden="true" />}
          title={messages.unallocated}
          description={messages.unallocatedDescription}
          count={occupants.unallocated.length}
          capacity={travelers.length}
        >
          {occupants.unallocated.length === 0 ? (
            <p className="text-xs text-muted-foreground">{messages.unallocatedEmpty}</p>
          ) : (
            <UnallocatedTravelersTable
              travelers={occupants.unallocated}
              sharingGroupLabels={sharingGroupLabels}
              onBookingOpen={onBookingOpen}
              renderActions={renderTravelerActions}
            />
          )}
        </AllocationColumn>
      ) : null}

      <div className="flex min-w-0 flex-col gap-6">
        {resources.length === 0 ? (
          <div className="rounded-md border border-dashed p-6 text-sm text-muted-foreground">
            {messages.noResources}
          </div>
        ) : (
          groupResourcesBySubType(resources).map((group) => {
            // The grouping function uses the raw `refId` as the label fallback.
            // Resolve product-option ids back to human names so the section
            // header reads "Standard double" instead of "POPT_01KRS8…".
            const resolvedLabel =
              (group.label ? optionNamesById?.get(group.label) : null) ?? group.label
            const groupLabel = resolvedLabel ?? messages.resourceOtherGroup
            return (
              <section key={group.key} aria-label={groupLabel} className="flex flex-col gap-2">
                <header className="flex items-baseline gap-2 border-b pb-1">
                  <h2 className="text-sm font-semibold tracking-wide uppercase text-muted-foreground">
                    {groupLabel}
                  </h2>
                </header>
                <ResourceGroupTable
                  kind={kind}
                  assignable={assignable}
                  resources={group.resources}
                  occupants={occupants}
                  unallocated={occupants.unallocated}
                  sharingGroupLabels={sharingGroupLabels}
                  optionNamesById={optionNamesById}
                  onAssignTraveler={onAssignTraveler}
                  onUnassignTraveler={onUnassignTraveler}
                  onRemoveResource={onRemoveResource}
                  onEditResource={onEditResource}
                  onBookingOpen={onBookingOpen}
                />
              </section>
            )
          })
        )}
      </div>
    </div>
  )
}

function ResourceGroupTable({
  kind,
  assignable,
  resources,
  occupants,
  unallocated,
  sharingGroupLabels,
  optionNamesById,
  onAssignTraveler,
  onUnassignTraveler,
  onRemoveResource,
  onEditResource,
  onBookingOpen,
}: {
  kind: string
  assignable: boolean
  resources: AllocationResource[]
  occupants: AllocationOccupants
  unallocated: AllocationManifestTraveler[]
  sharingGroupLabels: Record<string, string>
  optionNamesById?: ReadonlyMap<string, string>
  onAssignTraveler: (travelerId: string, resourceId: string) => void
  onUnassignTraveler: (travelerId: string) => void
  onRemoveResource: (resourceId: string) => void
  onEditResource?: (resourceId: string, input: EditResourceInput) => Promise<void> | void
  onBookingOpen?: (bookingId: string) => void
}) {
  const messages = useAllocationUiMessagesOrDefault()
  const [editingId, setEditingId] = useState<string | null>(null)

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/40">
            <TableHead className="w-48">{messages.resourceLabel}</TableHead>
            <TableHead className="w-20 text-center">{messages.capacity}</TableHead>
            {assignable ? <TableHead>{messages.travelers}</TableHead> : null}
            <TableHead className="w-40 text-right">&nbsp;</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {resources.map((resource) => {
            const seated = occupants.byResource.get(resource.id) ?? []
            const isEditing = editingId === resource.id
            const isFull = seated.length >= resource.capacity
            return (
              <ResourceRow
                key={resource.id}
                kind={kind}
                assignable={assignable}
                resource={resource}
                seated={seated}
                unallocated={unallocated}
                sharingGroupLabels={sharingGroupLabels}
                optionName={
                  resource.refType === "option" && resource.refId
                    ? (optionNamesById?.get(resource.refId) ?? null)
                    : null
                }
                isEditing={isEditing}
                isFull={isFull}
                canEdit={Boolean(onEditResource)}
                onBeginEdit={() => setEditingId(resource.id)}
                onCancelEdit={() => setEditingId(null)}
                onSaveEdit={async (input) => {
                  await Promise.resolve(onEditResource?.(resource.id, input))
                  setEditingId(null)
                }}
                onAssignTraveler={(travelerId) => onAssignTraveler(travelerId, resource.id)}
                onUnassignTraveler={onUnassignTraveler}
                onRemoveResource={() => onRemoveResource(resource.id)}
                onBookingOpen={onBookingOpen}
              />
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}
