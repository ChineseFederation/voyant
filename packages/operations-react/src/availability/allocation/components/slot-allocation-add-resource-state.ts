"use client"

import type {
  AllocationResource,
  FleetResource,
  ProductOptionResourceTemplates,
} from "@voyant-travel/operations-react/availability"
import { type FormEvent, useMemo, useState } from "react"

import type { AllocationUiMessages } from "../i18n/index.js"
import type { AddResourceSource } from "./slot-allocation-add-resource-dialog.js"
import {
  defaultCapacityFor,
  type ResourceCapacitySummary,
  summarizeResourceCapacity,
  VEHICLE_SEAT_KIND,
  validateVehicleSeatDesignation,
} from "./slot-allocation-model.js"

/**
 * The add-resource dialog's own state and its two submit paths: create a
 * container for this departure, or attach a global fleet record.
 *
 * Kept beside the dialog rather than in the page because the two are only ever
 * used together, and because the projected-capacity preview needs the same
 * draft capacity the form holds.
 */
export interface UseAddResourceFormOptions {
  /**
   * Controlled by the page: whether the fleet registry is worth fetching is the
   * same question as whether this dialog is open, and the planning hook that
   * owns that fetch runs before this one.
   */
  open: boolean
  setOpen: (open: boolean) => void
  slotId: string
  activeKind: string
  /** Resources of the active kind, for the projected-capacity preview. */
  resources: readonly AllocationResource[]
  /** Every seat on the departure, for the duplicate-designation check. */
  vehicleSeatResources: AllocationResource[]
  /** Flattened rather than an object so the projection memo has stable deps. */
  slotInitialPax: number | null | undefined
  slotRemainingPax: number | null | undefined
  slotUnlimited: boolean
  canAttachFleet: boolean
  fleetCatalogue: readonly FleetResource[]
  messages: AllocationUiMessages
  onError: (message: string | null) => void
  /** Writes a fresh `allocation_resources` row for this departure. */
  createResource: (input: {
    kind: string
    label: string | null
    capacity: number
    refType: string | null
    refId: string | null
    parentId: string | null
  }) => Promise<unknown>
  /** Attaches a fleet record; resolves `false` when the attach was rejected. */
  attachFleetResource: (input: { resourceId: string; capacity?: number }) => Promise<boolean>
}

export function useAddResourceForm({
  open,
  setOpen,
  slotId,
  activeKind,
  resources,
  vehicleSeatResources,
  slotInitialPax,
  slotRemainingPax,
  slotUnlimited,
  canAttachFleet,
  fleetCatalogue,
  messages,
  onError,
  createResource,
  attachFleetResource,
}: UseAddResourceFormOptions) {
  const [source, setSource] = useState<AddResourceSource>("manual")
  const [fleetResourceId, setFleetResourceId] = useState<string | null>(null)
  const [label, setLabel] = useState("")
  const [capacity, setCapacity] = useState(2)
  const [optionId, setOptionId] = useState<string | null>(null)
  const [parentId, setParentId] = useState<string | null>(null)

  /**
   * What the departure's capacity would look like once this draft lands, so an
   * operator sees an oversell before they create it rather than after.
   */
  const projectedSummary = useMemo<ResourceCapacitySummary | null>(() => {
    if (!open) return null
    const capacityNumber = Number.isFinite(capacity) ? Math.max(0, capacity) : 0
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
          // The draft carries no room constraints: this projection exists only
          // to answer "would creating this oversell the departure", and
          // `summarizeResourceCapacity` reads capacity and parentage alone.
          // The occupancy fields are what the real row will inherit from its
          // template once it is created.
          occupancyMin: null,
          roomTypeId: null,
          bedConfiguration: null,
          accessible: false,
          minAge: null,
          maxAge: null,
          flags: {},
          parentId: null,
          sortOrder: 0,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ],
      slotInitialPax: slotInitialPax ?? null,
      slotRemainingPax: slotRemainingPax ?? null,
      unlimited: slotUnlimited,
    })
  }, [
    open,
    capacity,
    resources,
    slotId,
    activeKind,
    slotInitialPax,
    slotRemainingPax,
    slotUnlimited,
  ])

  function beginAdd() {
    setLabel("")
    setCapacity(defaultCapacityFor(activeKind))
    setOptionId(null)
    setParentId(null)
    setSource("manual")
    setFleetResourceId(null)
    onError(null)
    setOpen(true)
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    onError(null)

    if (canAttachFleet && source === "fleet") {
      if (!fleetResourceId) return
      const record = fleetCatalogue.find((entry) => entry.id === fleetResourceId)
      // The server defaults capacity from the fleet record; only a record that
      // declares none needs the operator to supply one.
      const attached = await attachFleetResource({
        resourceId: fleetResourceId,
        ...(record?.capacity == null ? { capacity } : {}),
      })
      if (attached) {
        setFleetResourceId(null)
        setOpen(false)
      }
      return
    }

    if (activeKind === VEHICLE_SEAT_KIND) {
      const issue = validateVehicleSeatDesignation({
        label,
        parentId,
        seats: vehicleSeatResources,
      })
      if (issue) {
        onError(
          issue === "duplicate"
            ? messages.seatDesignationDuplicate
            : messages.seatDesignationRequired,
        )
        return
      }
    }

    try {
      await createResource({
        kind: activeKind,
        label: label.trim() || null,
        capacity,
        refType: optionId ? "option" : null,
        refId: optionId,
        parentId: activeKind === VEHICLE_SEAT_KIND ? parentId : null,
      })
      setLabel("")
      setCapacity(defaultCapacityFor(activeKind))
      setOptionId(null)
      setParentId(null)
      setOpen(false)
    } catch (err) {
      onError(err instanceof Error ? err.message : messages.createResourceFailed)
    }
  }

  /** The dialog's controlled props, spread by the page. */
  function dialogProps(input: {
    parentResources: readonly AllocationResource[]
    resourceOptions: readonly ProductOptionResourceTemplates[]
    fleetResourcesPending: boolean
    attachPending: boolean
    createPending: boolean
  }) {
    return {
      open,
      onOpenChange: setOpen,
      onSubmit: (event: FormEvent<HTMLFormElement>) => void submit(event),
      activeKind,
      source,
      onSourceChange: setSource,
      canAttachFleet,
      fleetResources: fleetCatalogue,
      fleetResourcesPending: input.fleetResourcesPending,
      fleetResourceId,
      onFleetResourceIdChange: setFleetResourceId,
      attachPending: input.attachPending,
      resourceLabel: label,
      onResourceLabelChange: setLabel,
      resourceCapacity: capacity,
      onResourceCapacityChange: setCapacity,
      resourceOptionId: optionId,
      onResourceOptionIdChange: setOptionId,
      resourceParentId: parentId,
      onResourceParentIdChange: setParentId,
      parentResources: input.parentResources,
      resourceOptions: input.resourceOptions,
      projectedSummary,
      createPending: input.createPending,
      messages,
    }
  }

  return { beginAdd, dialogProps }
}
