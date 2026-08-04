"use client"

import { useQuery } from "@tanstack/react-query"
import {
  type AllocationManifestTraveler,
  getSlotQueryOptions,
  type SlotAllocationManifest,
  useAllocationAutomationMutation,
  useAllocationResourceMutation,
  useAssignTravelerAllocationMutation,
  useProductResourceTemplates,
  useSlotAllocation,
  useVoyantAvailabilityContext,
} from "@voyant-travel/operations-react/availability"
import { Button, cn, Tabs, TabsList, TabsTrigger } from "@voyant-travel/ui/components"
import { Armchair, ArrowLeft, Bed, Bus, Users } from "lucide-react"
import { type ReactNode, useMemo, useState } from "react"

import { useAllocationUiI18nOrDefault } from "../i18n/index.js"
import { AddResourceDialog } from "./slot-allocation-add-resource-dialog.js"
import { useAddResourceForm } from "./slot-allocation-add-resource-state.js"
import { AllocationBulkBar } from "./slot-allocation-bulk-bar.js"
import { AllocationConflictsPanel } from "./slot-allocation-conflicts-panel.js"
import { AllocationFleetPanel } from "./slot-allocation-fleet-panel.js"
import {
  canAttachFleetResource,
  collectOccupants,
  collectVehicleOccupants,
  deriveAllocationKinds,
  isTravelerAllocatableKind,
  kindDescription,
  kindLabel,
  parentKindFor,
  type ResourceCapacitySummary,
  ROOM_KIND,
  summarizeResourceCapacity,
  VEHICLE_KIND,
  VEHICLE_SEAT_KIND,
} from "./slot-allocation-model.js"
import { CapacitySummaryBadges, PassengerListPanel } from "./slot-allocation-page-panels.js"
import { useSlotAllocationPlanning } from "./slot-allocation-planning-state.js"
import { AllocationPreviewDialog } from "./slot-allocation-preview-dialog.js"
import { AllocationPrintView } from "./slot-allocation-print-view.js"
import { ResourceColumnsView } from "./slot-allocation-resource-view.js"
import { VehicleSeatsView } from "./slot-allocation-seat-view.js"
import { AllocationToolbarActions } from "./slot-allocation-toolbar-actions.js"

export interface SlotAllocationPageRenderContext {
  slotId: string
  tabId: string
  kind: string
  allocationKind: string
  manifest: SlotAllocationManifest
  travelers: AllocationManifestTraveler[]
  allocationKinds: string[]
}

export interface SlotAllocationPageExtraTab {
  id: string
  label: ReactNode
  icon?: ReactNode
  render: (context: SlotAllocationPageRenderContext) => ReactNode
}

export interface SlotAllocationPageProps {
  slotId: string
  className?: string
  onBack?: () => void
  /**
   * Fired when the operator clicks a booking number on an allocation
   * chip. The host owns the side-panel / drawer / route — this hook
   * just supplies the booking id. When omitted, booking numbers render
   * as plain text.
   */
  onBookingOpen?: (bookingId: string) => void
  renderExtraActions?: (context: { slotId: string; kind: string }) => ReactNode
  renderTravelerActions?: (traveler: AllocationManifestTraveler) => ReactNode
  renderHeaderEnd?: (context: SlotAllocationPageRenderContext) => ReactNode
  renderBefore?: (context: SlotAllocationPageRenderContext) => ReactNode
  renderAfter?: (context: SlotAllocationPageRenderContext) => ReactNode
  extraTabs?: SlotAllocationPageExtraTab[]
  /**
   * Drop the top-level page header (title + back arrow). The host is
   * expected to render its own. Capacity badges + the actions cluster
   * stay as an inline toolbar above the kind tabs so the body is
   * still self-sufficient when embedded.
   */
  embed?: boolean
  /** Human departure label for the printed manifest header. */
  departureLabel?: string | null
}

export function SlotAllocationPage({
  slotId,
  className,
  onBack,
  onBookingOpen,
  renderExtraActions,
  renderTravelerActions,
  renderHeaderEnd,
  renderBefore,
  renderAfter,
  extraTabs = [],
  embed = false,
  departureLabel = null,
}: SlotAllocationPageProps) {
  const { messages, formatDateTime } = useAllocationUiI18nOrDefault()
  const availabilityClient = useVoyantAvailabilityContext()
  const allocation = useSlotAllocation({ slotId })
  const slotRowQuery = useQuery(getSlotQueryOptions(availabilityClient, slotId))
  const slotRow = slotRowQuery.data?.data
  const resourceMutation = useAllocationResourceMutation(slotId)
  const assignMutation = useAssignTravelerAllocationMutation(slotId)
  const automationMutation = useAllocationAutomationMutation(slotId)
  const [selectedKind, setSelectedKind] = useState(ROOM_KIND)
  const [addingResource, setAddingResource] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const data = allocation.data?.data
  const templates = useProductResourceTemplates({
    productId: data?.slot.productId,
    enabled: Boolean(data?.slot.productId),
  })

  const travelers = useMemo(() => {
    const out: AllocationManifestTraveler[] = []
    for (const booking of data?.bookings ?? []) {
      if (booking.status === "cancelled") continue
      out.push(...booking.travelers)
    }
    return out
  }, [data?.bookings])

  const allocationKinds = useMemo(() => {
    return deriveAllocationKinds({
      resources: data?.resources ?? [],
      templateOptions: templates.data?.data ?? [],
    })
  }, [data?.resources, templates.data?.data])

  // option_id → option name, used by ResourceColumnsView to badge each
  // resource row with the option it's tied to (Standard double, etc.).
  const optionNamesById = useMemo(() => {
    const map = new Map<string, string>()
    for (const option of templates.data?.data ?? []) {
      map.set(option.id, option.name)
    }
    return map
  }, [templates.data?.data])

  const visibleExtraTabs = extraTabs.filter((tab) => !allocationKinds.includes(tab.id))
  const selectedAllocationKind = allocationKinds.includes(selectedKind) ? selectedKind : undefined
  const selectedExtraTab = selectedAllocationKind
    ? undefined
    : (visibleExtraTabs.find((tab) => tab.id === selectedKind) ??
      (allocationKinds.length === 0 ? visibleExtraTabs[0] : undefined))
  const activeAllocationKind = selectedExtraTab
    ? undefined
    : (selectedAllocationKind ?? allocationKinds[0])
  const activeKind = activeAllocationKind ?? ROOM_KIND
  const activeTabId = selectedExtraTab?.id ?? activeKind
  const hasAllocationView = Boolean(activeAllocationKind)
  const hasTabs = allocationKinds.length > 0 || visibleExtraTabs.length > 0
  const hasPassengerOnlyView = allocationKinds.length === 0 && visibleExtraTabs.length === 0
  const canAttachFleet = canAttachFleetResource(activeKind)

  const planning = useSlotAllocationPlanning({
    slotId,
    activeKind,
    travelers,
    messages,
    canAttachFleet,
    enabled: hasAllocationView,
    fleetPickerOpen: addingResource,
    onError: setError,
  })

  const resources = useMemo(
    () => (data?.resources ?? []).filter((resource) => resource.kind === activeKind),
    [data?.resources, activeKind],
  )
  const attachedFleetResources = useMemo(
    () =>
      (data?.resources ?? []).filter(
        (resource) => resource.refType === "resource" && resource.kind === activeKind,
      ),
    [data?.resources, activeKind],
  )
  const parentIdsWithChildren = useMemo(() => {
    const ids = new Set<string>()
    for (const resource of data?.resources ?? []) {
      if (resource.parentId) ids.add(resource.parentId)
    }
    return ids
  }, [data?.resources])
  const parentResources = useMemo(
    () => (data?.resources ?? []).filter((resource) => resource.kind === parentKindFor(activeKind)),
    [data?.resources, activeKind],
  )
  const vehicleResources = useMemo(
    () => (data?.resources ?? []).filter((resource) => resource.kind === VEHICLE_KIND),
    [data?.resources],
  )
  const vehicleSeatResources = useMemo(
    () => (data?.resources ?? []).filter((resource) => resource.kind === VEHICLE_SEAT_KIND),
    [data?.resources],
  )
  const occupants = useMemo(
    () =>
      activeKind === VEHICLE_KIND
        ? collectVehicleOccupants(travelers, resources, vehicleSeatResources)
        : collectOccupants(travelers, resources, activeKind),
    [travelers, resources, vehicleSeatResources, activeKind],
  )
  const capacitySummary = useMemo<ResourceCapacitySummary>(
    () =>
      summarizeResourceCapacity({
        resources,
        slotInitialPax: slotRow?.initialPax ?? null,
        slotRemainingPax: slotRow?.remainingPax ?? null,
        unlimited: slotRow?.unlimited ?? false,
      }),
    [resources, slotRow?.initialPax, slotRow?.remainingPax, slotRow?.unlimited],
  )
  const addResourceForm = useAddResourceForm({
    open: addingResource,
    setOpen: setAddingResource,
    slotId,
    activeKind,
    resources,
    vehicleSeatResources,
    slotInitialPax: slotRow?.initialPax,
    slotRemainingPax: slotRow?.remainingPax,
    slotUnlimited: slotRow?.unlimited ?? false,
    canAttachFleet,
    fleetCatalogue: planning.fleetCatalogue,
    messages,
    onError: setError,
    createResource: (input) => resourceMutation.create.mutateAsync(input),
    attachFleetResource: planning.attachFleetResource,
  })
  const resourceLabelById = useMemo(() => {
    const map = new Map<string, string>()
    for (const resource of data?.resources ?? []) {
      if (resource.label) map.set(resource.id, resource.label)
    }
    return map
  }, [data?.resources])

  async function assignTraveler(travelerId: string, resourceId: string | null) {
    setError(null)
    try {
      await assignMutation.mutateAsync({ travelerId, kind: activeKind, resourceId })
    } catch (err) {
      setError(err instanceof Error ? err.message : messages.allocationFailed)
    }
  }

  async function editResource(
    resourceId: string,
    input: { label: string | null; capacity: number },
  ) {
    setError(null)
    try {
      await resourceMutation.update.mutateAsync({ resourceId, input })
    } catch (err) {
      setError(err instanceof Error ? err.message : messages.updateResourceFailed)
      throw err
    }
  }

  async function removeResource(resourceId: string) {
    setError(null)
    try {
      await resourceMutation.remove.mutateAsync(resourceId)
    } catch (err) {
      setError(err instanceof Error ? err.message : messages.removeResourceFailed)
    }
  }

  async function generateResources() {
    setError(null)
    try {
      // Materialize the full configured inventory across all kinds (e.g. all 20
      // doubles + 20 singles + 6 triples) in one click, rather than the
      // pax-derived single-kind auto-materialize.
      await automationMutation.materializeTemplates.mutateAsync()
    } catch (err) {
      setError(err instanceof Error ? err.message : messages.generateResourcesFailed)
    }
  }

  async function confirmAutoAllocate() {
    planning.setPreviewError(null)
    try {
      await automationMutation.autoAllocate.mutateAsync({ kind: activeKind })
      planning.closeAutoAllocatePreview()
    } catch (err) {
      planning.setPreviewError(err instanceof Error ? err.message : messages.autoAllocateFailed)
    }
  }

  function printManifest() {
    if (typeof window !== "undefined") window.print()
  }

  if (allocation.isPending) {
    return (
      <div className={cn("p-6 text-sm text-muted-foreground", className)}>{messages.loading}</div>
    )
  }

  // Only short-circuit when we genuinely have no data to render
  // against. The page intentionally renders even when both resources
  // and travelers are empty so operators can seed the per-departure
  // resource block before any bookings exist — setting up the room
  // block before selling is the canonical flow. The per-kind resource
  // view handles its own empty state (and the "Add resource" /
  // "Generate resources" affordances stay reachable).
  if (!data) {
    return (
      <div className={cn("flex flex-col items-center justify-center gap-3 p-8", className)}>
        <Users className="size-6 text-muted-foreground" aria-hidden="true" />
        <p className="text-sm text-muted-foreground">{messages.empty}</p>
      </div>
    )
  }

  const isSeatMap = activeKind === VEHICLE_SEAT_KIND
  const isTravelerAssignable = isTravelerAllocatableKind(activeKind)
  const canManuallyAddResource = true
  const context: SlotAllocationPageRenderContext = {
    slotId,
    tabId: activeTabId,
    kind: activeTabId,
    allocationKind: activeKind,
    manifest: data,
    travelers,
    allocationKinds,
  }

  const summaryLine =
    selectedExtraTab || !hasAllocationView ? null : (
      <CapacitySummaryBadges summary={capacitySummary} messages={messages} kind={activeKind} />
    )

  const actionsCluster = (
    <AllocationToolbarActions
      slotId={slotId}
      kind={activeKind}
      messages={messages}
      hidden={Boolean(selectedExtraTab) || !hasAllocationView}
      isTravelerAssignable={isTravelerAssignable}
      hasResources={resources.length > 0}
      hasTemplatesForKind={(templates.data?.data ?? []).some((option) =>
        option.templates.some((template) => template.kind === activeKind),
      )}
      materializePending={automationMutation.materializeTemplates.isPending}
      autoAllocatePending={automationMutation.autoAllocate.isPending}
      previewPending={planning.previewPending}
      exportPending={planning.exportPending}
      renderExtraActions={renderExtraActions}
      onGenerateResources={() => void generateResources()}
      onAutoAllocate={() => void planning.openAutoAllocatePreview()}
      onExportPassengers={() => void planning.downloadExport("passengers")}
      onExportResources={() => void planning.downloadExport("resources")}
      onPrint={printManifest}
      onAddResource={addResourceForm.beginAdd}
    />
  )

  return (
    <>
      <div
        className={cn("voyant-print-hidden flex flex-col gap-4", embed ? null : "p-6", className)}
      >
        {embed ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2 text-muted-foreground text-sm">
              {summaryLine}
            </div>
            {actionsCluster}
          </div>
        ) : (
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div className="flex items-start gap-3">
              {onBack ? (
                <Button variant="ghost" size="icon" onClick={onBack} aria-label={messages.back}>
                  <ArrowLeft data-icon aria-hidden="true" />
                </Button>
              ) : null}
              <div>
                <h1 className="text-2xl font-semibold">{messages.pageTitle}</h1>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-muted-foreground text-sm">
                  {summaryLine}
                </div>
              </div>
            </div>
            <div className="flex flex-col gap-3 md:items-end">
              {renderHeaderEnd?.(context)}
              {actionsCluster}
            </div>
          </div>
        )}

        {renderBefore?.(context)}

        {hasTabs ? (
          <Tabs value={activeTabId} onValueChange={setSelectedKind}>
            <TabsList className="flex h-auto w-fit flex-wrap justify-start">
              {allocationKinds.map((kind) => (
                <TabsTrigger key={kind} value={kind} className="gap-2">
                  {kind === VEHICLE_SEAT_KIND ? (
                    <Armchair className="size-4" aria-hidden="true" />
                  ) : kind === VEHICLE_KIND ? (
                    <Bus className="size-4" aria-hidden="true" />
                  ) : (
                    <Bed className="size-4" aria-hidden="true" />
                  )}
                  {kindLabel(kind, messages)}
                </TabsTrigger>
              ))}
              {visibleExtraTabs.map((tab) => (
                <TabsTrigger key={tab.id} value={tab.id} className="gap-2">
                  {tab.icon}
                  {tab.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        ) : null}

        {hasAllocationView && kindDescription(activeKind, messages) ? (
          <p className="text-sm text-muted-foreground">{kindDescription(activeKind, messages)}</p>
        ) : null}

        {selectedExtraTab ? (
          selectedExtraTab.render(context)
        ) : hasPassengerOnlyView ? (
          <PassengerListPanel
            bookings={data.bookings}
            sharingGroupLabels={data.sharingGroupLabels}
            onBookingOpen={onBookingOpen}
            renderTravelerActions={renderTravelerActions}
            messages={messages}
          />
        ) : !hasAllocationView ? (
          <div className="flex flex-col items-center justify-center gap-3 rounded-md border border-dashed p-8 text-center">
            <Users className="size-6 text-muted-foreground" aria-hidden="true" />
            <p className="text-sm text-muted-foreground">{messages.noAllocationsToManage}</p>
          </div>
        ) : (
          <>
            {error ? (
              <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error}
              </div>
            ) : null}

            <AllocationConflictsPanel
              conflicts={planning.conflicts}
              messages={messages}
              loadFailed={planning.conflictsFailed}
              resolveSubjectLabel={(conflict) =>
                conflict.subjectType === "allocation_resource"
                  ? (resourceLabelById.get(conflict.subjectId) ?? null)
                  : conflict.subjectType === "sharing_group"
                    ? (data.sharingGroupLabels[conflict.subjectId] ?? null)
                    : null
              }
            />

            {/* Attaching happens in the add-resource dialog; this panel exists
                to show and release what is attached, so an empty one on every
                rooming tab would be noise. */}
            {canAttachFleet && attachedFleetResources.length > 0 ? (
              <AllocationFleetPanel
                attached={attachedFleetResources}
                messages={messages}
                onDetach={(input) => void planning.detachFleetResource(input)}
                parentIdsWithChildren={parentIdsWithChildren}
                detachPending={planning.detachPending}
              />
            ) : null}

            {canManuallyAddResource ? (
              <AddResourceDialog
                {...addResourceForm.dialogProps({
                  parentResources: vehicleResources,
                  resourceOptions: templates.data?.data ?? [],
                  fleetResourcesPending: planning.fleetCataloguePending,
                  attachPending: planning.attachPending,
                  createPending: resourceMutation.create.isPending,
                })}
              />
            ) : null}

            <AllocationPreviewDialog
              open={planning.previewOpen}
              onOpenChange={planning.setPreviewOpen}
              plan={planning.previewPlan}
              pending={planning.previewPending}
              confirmPending={automationMutation.autoAllocate.isPending}
              error={planning.previewError}
              onConfirm={() => void confirmAutoAllocate()}
              resolveResourceLabel={(resourceId) => resourceLabelById.get(resourceId) ?? null}
              messages={messages}
            />

            {isTravelerAssignable ? (
              <AllocationBulkBar
                kind={activeKind}
                selected={planning.selectedTravelers}
                resources={resources}
                sharingGroupLabels={data.sharingGroupLabels}
                messages={messages}
                onClear={planning.clearSelection}
                onMove={(resourceId) => void planning.moveSelected(resourceId)}
                onGroupTogether={() => void planning.groupSelectedTravelers()}
                onUngroup={() => void planning.ungroupSelectedTravelers()}
                onRenameGroup={(input) => void planning.renameSharingGroup(input)}
                onClearGroupLabel={(groupId) => void planning.clearSharingGroupLabel(groupId)}
                movePending={planning.movePending}
                groupPending={planning.groupPending}
              />
            ) : null}

            {isSeatMap ? (
              <VehicleSeatsView
                seats={resources}
                vehicles={parentResources}
                occupants={occupants}
                sharingGroupLabels={data.sharingGroupLabels}
                onAssignTraveler={(travelerId, resourceId) =>
                  void assignTraveler(travelerId, resourceId)
                }
                onUnassignTraveler={(travelerId) => void assignTraveler(travelerId, null)}
                onRemoveResource={(resourceId) => void removeResource(resourceId)}
                onBookingOpen={onBookingOpen}
                renderTravelerActions={renderTravelerActions}
              />
            ) : (
              <ResourceColumnsView
                kind={activeKind}
                assignable={isTravelerAssignable}
                resources={resources}
                travelers={travelers}
                occupants={occupants}
                sharingGroupLabels={data.sharingGroupLabels}
                optionNamesById={optionNamesById}
                onAssignTraveler={(travelerId, resourceId) =>
                  void assignTraveler(travelerId, resourceId)
                }
                onUnassignTraveler={(travelerId) => void assignTraveler(travelerId, null)}
                onRemoveResource={(resourceId) => void removeResource(resourceId)}
                onEditResource={editResource}
                onBookingOpen={onBookingOpen}
                selection={isTravelerAssignable ? planning.selection : undefined}
              />
            )}
          </>
        )}

        {renderAfter?.(context)}
      </div>

      {hasAllocationView ? (
        <AllocationPrintView
          kind={activeKind}
          departureLabel={departureLabel}
          resources={resources}
          occupants={occupants}
          travelers={travelers}
          conflicts={planning.conflicts}
          printedAt={formatDateTime(new Date().toISOString())}
          messages={messages}
        />
      ) : null}
    </>
  )
}
