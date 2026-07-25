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
import { Armchair, ArrowLeft, Bed, Plus, Sparkles, Users, Wand2 } from "lucide-react"
import { type FormEvent, type ReactNode, useMemo, useState } from "react"

import { useAllocationUiMessagesOrDefault } from "../i18n/index.js"
import { AddResourceDialog } from "./slot-allocation-add-resource-dialog.js"
import {
  collectOccupants,
  defaultCapacityFor,
  deriveAllocationKinds,
  kindLabel,
  parentKindFor,
  type ResourceCapacitySummary,
  ROOM_KIND,
  summarizeResourceCapacity,
  VEHICLE_SEAT_KIND,
} from "./slot-allocation-model.js"
import { CapacitySummaryBadges, PassengerListPanel } from "./slot-allocation-page-panels.js"
import { ResourceColumnsView } from "./slot-allocation-resource-view.js"
import { VehicleSeatsView } from "./slot-allocation-seat-view.js"

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
}: SlotAllocationPageProps) {
  const messages = useAllocationUiMessagesOrDefault()
  const availabilityClient = useVoyantAvailabilityContext()
  const allocation = useSlotAllocation({ slotId })
  const slotRowQuery = useQuery(getSlotQueryOptions(availabilityClient, slotId))
  const slotRow = slotRowQuery.data?.data
  const resourceMutation = useAllocationResourceMutation(slotId)
  const assignMutation = useAssignTravelerAllocationMutation(slotId)
  const automationMutation = useAllocationAutomationMutation(slotId)
  const [selectedKind, setSelectedKind] = useState(ROOM_KIND)
  const [addingResource, setAddingResource] = useState(false)
  const [resourceLabel, setResourceLabel] = useState("")
  const [resourceCapacity, setResourceCapacity] = useState(2)
  const [resourceOptionId, setResourceOptionId] = useState<string | null>(null)
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
  const resources = useMemo(
    () => (data?.resources ?? []).filter((resource) => resource.kind === activeKind),
    [data?.resources, activeKind],
  )
  const parentResources = useMemo(
    () => (data?.resources ?? []).filter((resource) => resource.kind === parentKindFor(activeKind)),
    [data?.resources, activeKind],
  )
  const occupants = useMemo(
    () => collectOccupants(travelers, resources, activeKind),
    [travelers, resources, activeKind],
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
  const projectedSummary = useMemo<ResourceCapacitySummary | null>(() => {
    if (!addingResource) return null
    const capacityNumber = Number.isFinite(resourceCapacity) ? Math.max(0, resourceCapacity) : 0
    return summarizeResourceCapacity({
      resources: [
        ...resources,
        {
          id: "__projected__",
          slotId,
          kind: activeKind,
          label: null,
          refType: null,
          refId: null,
          capacity: capacityNumber,
          flags: {},
          parentId: null,
          sortOrder: 0,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ],
      slotInitialPax: slotRow?.initialPax ?? null,
      slotRemainingPax: slotRow?.remainingPax ?? null,
      unlimited: slotRow?.unlimited ?? false,
    })
  }, [
    addingResource,
    resourceCapacity,
    resources,
    slotId,
    activeKind,
    slotRow?.initialPax,
    slotRow?.remainingPax,
    slotRow?.unlimited,
  ])

  async function assignTraveler(travelerId: string, resourceId: string | null) {
    setError(null)
    try {
      await assignMutation.mutateAsync({ travelerId, kind: activeKind, resourceId })
    } catch (err) {
      setError(err instanceof Error ? err.message : messages.allocationFailed)
    }
  }

  async function createResource(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    try {
      await resourceMutation.create.mutateAsync({
        kind: activeKind,
        label: resourceLabel.trim() || null,
        capacity: resourceCapacity,
        refType: resourceOptionId ? "option" : null,
        refId: resourceOptionId,
      })
      setResourceLabel("")
      setResourceCapacity(defaultCapacityFor(activeKind))
      setResourceOptionId(null)
      setAddingResource(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : messages.createResourceFailed)
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

  async function autoAllocate() {
    setError(null)
    try {
      await automationMutation.autoAllocate.mutateAsync({ kind: activeKind })
    } catch (err) {
      setError(err instanceof Error ? err.message : messages.autoAllocateFailed)
    }
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
  const canManuallyAddResource = !isSeatMap
  const context: SlotAllocationPageRenderContext = {
    slotId,
    tabId: activeTabId,
    kind: activeTabId,
    allocationKind: activeKind,
    manifest: data,
    travelers,
    allocationKinds,
  }

  const summaryLine = (
    <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
      {selectedExtraTab || !hasAllocationView ? null : (
        <CapacitySummaryBadges summary={capacitySummary} messages={messages} kind={activeKind} />
      )}
    </div>
  )

  const actionsCluster = (
    <div className="flex flex-wrap items-center gap-2">
      {selectedExtraTab || !hasAllocationView
        ? null
        : renderExtraActions?.({ slotId, kind: activeKind })}
      {selectedExtraTab || !hasAllocationView ? null : resources.length === 0 ? (
        <Button
          variant="outline"
          onClick={() => void generateResources()}
          disabled={automationMutation.materializeTemplates.isPending}
        >
          <Sparkles data-icon="inline-start" aria-hidden="true" />
          {automationMutation.materializeTemplates.isPending
            ? messages.generatingResources
            : messages.generateResources}
        </Button>
      ) : (
        <Button
          variant="outline"
          onClick={() => void autoAllocate()}
          disabled={automationMutation.autoAllocate.isPending}
        >
          <Wand2 data-icon="inline-start" aria-hidden="true" />
          {automationMutation.autoAllocate.isPending
            ? messages.autoAllocating
            : messages.autoAllocate}
        </Button>
      )}
      {!selectedExtraTab && hasAllocationView && canManuallyAddResource ? (
        <Button
          variant="outline"
          onClick={() => {
            setResourceLabel("")
            setResourceCapacity(defaultCapacityFor(activeKind))
            setResourceOptionId(null)
            setError(null)
            setAddingResource(true)
          }}
        >
          <Plus data-icon="inline-start" aria-hidden="true" />
          {messages.addResource}
        </Button>
      ) : null}
    </div>
  )

  return (
    <div className={cn("flex flex-col gap-4", embed ? null : "p-6", className)}>
      {embed ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          {summaryLine}
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
              <div className="mt-1">{summaryLine}</div>
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

          {canManuallyAddResource ? (
            <AddResourceDialog
              open={addingResource}
              onOpenChange={setAddingResource}
              onSubmit={createResource}
              activeKind={activeKind}
              resourceLabel={resourceLabel}
              onResourceLabelChange={setResourceLabel}
              resourceCapacity={resourceCapacity}
              onResourceCapacityChange={setResourceCapacity}
              resourceOptionId={resourceOptionId}
              onResourceOptionIdChange={setResourceOptionId}
              resourceOptions={templates.data?.data ?? []}
              projectedSummary={projectedSummary}
              createPending={resourceMutation.create.isPending}
              messages={messages}
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
              onBookingOpen={onBookingOpen}
              renderTravelerActions={renderTravelerActions}
            />
          ) : (
            <ResourceColumnsView
              kind={activeKind}
              resources={resources}
              travelers={travelers}
              occupants={occupants}
              sharingGroupLabels={data.sharingGroupLabels}
              optionNamesById={optionNamesById}
              onAssignTraveler={(travelerId, resourceId) =>
                void assignTraveler(travelerId, resourceId)
              }
              onUnassignTraveler={(travelerId) => void assignTraveler(travelerId, null)}
              onRemoveResource={(resourceId) =>
                void resourceMutation.remove.mutateAsync(resourceId)
              }
              onEditResource={editResource}
              onBookingOpen={onBookingOpen}
              renderTravelerActions={renderTravelerActions}
            />
          )}
        </>
      )}

      {renderAfter?.(context)}
    </div>
  )
}
