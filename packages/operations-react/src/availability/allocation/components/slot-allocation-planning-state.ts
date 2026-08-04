"use client"

import {
  type AllocationManifestTraveler,
  type AllocationPlanPreview,
  downloadCsvDocument,
  useAllocationExportMutation,
  useAutoAllocatePreviewMutation,
  useBatchAssignTravelerAllocationsMutation,
  useDepartureFleetResourceMutation,
  useFleetResources,
  useSharingGroupLabelMutation,
  useSlotAllocationConflicts,
  useTravelerSharingGroupMutation,
} from "@voyant-travel/operations-react/availability"
import { useMemo, useState } from "react"

import type { AllocationUiMessages } from "../i18n/index.js"
import {
  type AllocationSelection,
  describeFleetAttachError,
  fleetResourcesForKind,
} from "./slot-allocation-model.js"

/**
 * Everything the departure workspace needs to *plan* a departure, kept out of
 * the page component: the conflicts projection, the fleet registry and its
 * link, multi-select and its atomic batch move, the previewed auto-allocation,
 * the sharing-group edits and the CSV exports.
 *
 * The page owns layout and the per-resource CRUD it already had; this owns the
 * commands the planning routes introduced. Errors are handed back through
 * `onError` so the workspace keeps its single error banner rather than growing
 * a second one.
 */
export interface UseSlotAllocationPlanningOptions {
  slotId: string
  /** Resource kind of the active tab. Every command is scoped to it. */
  activeKind: string
  /** Travelers on live bookings, in manifest order. */
  travelers: readonly AllocationManifestTraveler[]
  messages: AllocationUiMessages
  /** `true` when a fleet `resources` record can back this kind. */
  canAttachFleet: boolean
  /** Whether the conflicts projection should be fetched at all. */
  enabled: boolean
  /** Whether the fleet registry should be fetched (the add dialog is open). */
  fleetPickerOpen: boolean
  onError: (message: string | null) => void
}

export function useSlotAllocationPlanning({
  slotId,
  activeKind,
  travelers,
  messages,
  canAttachFleet,
  enabled,
  fleetPickerOpen,
  onError,
}: UseSlotAllocationPlanningOptions) {
  const batchAssignMutation = useBatchAssignTravelerAllocationsMutation(slotId)
  const previewMutation = useAutoAllocatePreviewMutation(slotId)
  const fleetMutation = useDepartureFleetResourceMutation(slotId)
  const sharingGroupMutation = useTravelerSharingGroupMutation(slotId)
  const sharingGroupLabelMutation = useSharingGroupLabelMutation(slotId)
  const exportMutation = useAllocationExportMutation(slotId)

  const [selectedTravelerIds, setSelectedTravelerIds] = useState<ReadonlySet<string>>(
    () => new Set<string>(),
  )
  const [previewOpen, setPreviewOpen] = useState(false)
  const [previewPlan, setPreviewPlan] = useState<AllocationPlanPreview | null>(null)
  const [previewError, setPreviewError] = useState<string | null>(null)

  const conflictsQuery = useSlotAllocationConflicts({ slotId, kind: activeKind, enabled })
  const conflicts = useMemo(() => conflictsQuery.data?.data ?? [], [conflictsQuery.data?.data])

  const fleetCatalogueQuery = useFleetResources({ enabled: fleetPickerOpen && canAttachFleet })
  const fleetCatalogue = useMemo(
    () => fleetResourcesForKind(fleetCatalogueQuery.data?.data ?? [], activeKind),
    [fleetCatalogueQuery.data?.data, activeKind],
  )

  const selection = useMemo<AllocationSelection>(
    () => ({
      selectedIds: selectedTravelerIds,
      onToggle: (travelerId: string) => {
        setSelectedTravelerIds((previous) => {
          const next = new Set(previous)
          if (next.has(travelerId)) next.delete(travelerId)
          else next.add(travelerId)
          return next
        })
      },
    }),
    [selectedTravelerIds],
  )
  const selectedTravelers = useMemo(
    () => travelers.filter((traveler) => selectedTravelerIds.has(traveler.id)),
    [travelers, selectedTravelerIds],
  )

  function clearSelection() {
    setSelectedTravelerIds(new Set<string>())
  }

  /**
   * Move the whole selection in one transaction. `expectedResourceId` carries
   * where the client believed each traveler sat, so a move planned against a
   * stale manifest is rejected wholesale rather than half-applied.
   */
  async function moveSelected(resourceId: string | null) {
    onError(null)
    try {
      await batchAssignMutation.mutateAsync({
        kind: activeKind,
        assignments: selectedTravelers.map((traveler) => ({
          travelerId: traveler.id,
          resourceId,
          expectedResourceId: traveler.allocations[activeKind] ?? null,
        })),
      })
      clearSelection()
    } catch (err) {
      onError(err instanceof Error ? err.message : messages.bulk.moveFailed)
    }
  }

  async function groupSelectedTravelers() {
    onError(null)
    try {
      await sharingGroupMutation.pair.mutateAsync({
        travelerIds: selectedTravelers.map((traveler) => traveler.id),
      })
    } catch (err) {
      onError(err instanceof Error ? err.message : messages.bulk.groupFailed)
    }
  }

  async function ungroupSelectedTravelers() {
    onError(null)
    try {
      for (const traveler of selectedTravelers) {
        await sharingGroupMutation.update.mutateAsync({
          travelerId: traveler.id,
          sharingGroupId: null,
        })
      }
    } catch (err) {
      onError(err instanceof Error ? err.message : messages.bulk.ungroupFailed)
    }
  }

  async function renameSharingGroup(input: { groupId: string; label: string }) {
    onError(null)
    try {
      await sharingGroupLabelMutation.update.mutateAsync(input)
    } catch (err) {
      onError(err instanceof Error ? err.message : messages.bulk.renameGroupFailed)
    }
  }

  async function clearSharingGroupLabel(groupId: string) {
    onError(null)
    try {
      await sharingGroupLabelMutation.remove.mutateAsync(groupId)
    } catch (err) {
      onError(err instanceof Error ? err.message : messages.bulk.renameGroupFailed)
    }
  }

  /**
   * Attach a fleet record to this departure. Returns `true` when the dialog
   * should close — a rejected attach keeps it open with the reason showing.
   */
  async function attachFleetResource(input: {
    resourceId: string
    /** Supplied only when the fleet record declares no capacity of its own. */
    capacity?: number
  }): Promise<boolean> {
    onError(null)
    try {
      const link = await fleetMutation.attach.mutateAsync({
        resourceId: input.resourceId,
        kind: activeKind,
        ...(input.capacity === undefined ? {} : { capacity: input.capacity }),
      })
      if (!link.created) onError(messages.fleet.alreadyAttached)
      return true
    } catch (err) {
      onError(describeFleetAttachError(err, messages))
      return false
    }
  }

  async function detachFleetResource(input: { resourceId: string; cascade: boolean }) {
    onError(null)
    try {
      await fleetMutation.detach.mutateAsync(input)
    } catch (err) {
      onError(err instanceof Error ? err.message : messages.fleet.detachFailed)
    }
  }

  /**
   * Auto-allocate is previewed, not fired. The dry run is computed under the
   * same lock the writer takes, so what the operator reviews is what the commit
   * re-derives — but nothing is written until they say so.
   */
  async function openAutoAllocatePreview() {
    onError(null)
    setPreviewError(null)
    setPreviewPlan(null)
    setPreviewOpen(true)
    try {
      setPreviewPlan(await previewMutation.mutateAsync({ kind: activeKind }))
    } catch (err) {
      setPreviewError(err instanceof Error ? err.message : messages.preview.previewFailed)
    }
  }

  function closeAutoAllocatePreview() {
    setPreviewOpen(false)
    setPreviewPlan(null)
  }

  async function downloadExport(variant: "passengers" | "resources") {
    onError(null)
    try {
      downloadCsvDocument(await exportMutation.mutateAsync({ variant, kind: activeKind }))
    } catch (err) {
      onError(err instanceof Error ? err.message : messages.exportMenu.failed)
    }
  }

  return {
    conflicts,
    conflictsFailed: conflictsQuery.isError,
    fleetCatalogue,
    fleetCataloguePending: fleetCatalogueQuery.isPending,
    selection,
    selectedTravelers,
    clearSelection,
    moveSelected,
    movePending: batchAssignMutation.isPending,
    groupSelectedTravelers,
    ungroupSelectedTravelers,
    renameSharingGroup,
    clearSharingGroupLabel,
    groupPending:
      sharingGroupMutation.pair.isPending ||
      sharingGroupMutation.update.isPending ||
      sharingGroupLabelMutation.update.isPending ||
      sharingGroupLabelMutation.remove.isPending,
    attachFleetResource,
    attachPending: fleetMutation.attach.isPending,
    detachFleetResource,
    detachPending: fleetMutation.detach.isPending,
    openAutoAllocatePreview,
    closeAutoAllocatePreview,
    setPreviewOpen,
    setPreviewError,
    previewOpen,
    previewPlan,
    previewError,
    previewPending: previewMutation.isPending,
    downloadExport,
    exportPending: exportMutation.isPending,
  }
}
