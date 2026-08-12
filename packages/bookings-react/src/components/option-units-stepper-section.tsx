"use client"

import { useQueries } from "@tanstack/react-query"
import {
  getOptionUnitsQueryOptions,
  type OptionUnitRecord,
  type ProductOptionRecord,
  useProductOptions,
  useVoyantProductsContext,
} from "@voyant-travel/inventory-react"
import { useSlotUnitAvailability } from "@voyant-travel/operations-react/availability"
import { Button, Label } from "@voyant-travel/ui/components"
import { Minus, Plus } from "lucide-react"
import * as React from "react"
import { useBookingsUiMessagesOrDefault } from "../i18n/provider.js"

/** Quantity per option_unit id; omitted ids are treated as 0. */
export interface OptionUnitsStepperValue {
  quantities: Record<string, number>
}

export const emptyOptionUnitsStepperValue: OptionUnitsStepperValue = { quantities: {} }

export interface OptionUnitsStepperUnit {
  optionId: string | null
  optionUnitId: string
  unitName: string
  /** Stable code from the products schema (`ADULT`, `CHILD`, `SENIOR`, …) when present. */
  unitCode?: string | null
  /** Inclusive lower age bound for this unit, when configured. */
  minAge?: number | null
  /** Inclusive upper age bound for this unit, when configured. */
  maxAge?: number | null
  /** Unit category from option_units.unitType — person/group/room/vehicle/service/other. */
  unitType?: "person" | "group" | "room" | "vehicle" | "service" | "other" | null
  occupancyMax: number | null
  initial: number | null
  reserved: number
  remaining: number | null
}

export interface OptionUnitsStepperSectionProps {
  value: OptionUnitsStepperValue
  onChange: (value: OptionUnitsStepperValue) => void
  /** Product whose options become selectable room quantity rows. */
  productId?: string
  /**
   * Departure the operator picked. Departure-specific availability wins
   * when present; otherwise the section falls back to option-level units.
   */
  slotId?: string
  /**
   * Product option whose units should be shown before a departure is picked.
   * Departure-specific availability wins when `slotId` is present.
   */
  optionId?: string | null
  /**
   * When true, only the SELECTED option's units are shown (no cross-option
   * fallback). Use when the option is already chosen and other options'
   * rooms aren't bookable — e.g. the booking journey, where rooms are
   * nested under the picked option. Defaults to false (show all options'
   * units, the create-sheet's cross-option behavior).
   */
  restrictToOption?: boolean
  enabled?: boolean
  onUnitsChange?: (units: OptionUnitsStepperUnit[]) => void
  labels?: {
    heading?: string
    noOption?: string
    noSlot?: string
    noUnits?: string
    remaining?: string
    unlimited?: string
    fillsSlotCapacity?: string
    reviewLine?: string
    required?: string
  }
  slotHasFiniteCapacity?: boolean
  invalidOptionUnitIds?: readonly string[]
  /**
   * Marks the section as a required control so an operator can tell, before
   * submitting, that a quantity has to be picked here. See #4588.
   */
  required?: boolean
  /**
   * Field-level validation message, rendered against this section rather than
   * only in the form's error banner. Anchors "Select at least one option." to
   * the control it actually refers to.
   */
  error?: string | null
  /**
   * Focus/scroll anchor for the section container, so a failed submit can
   * bring the operator to the control that blocked it.
   */
  sectionRef?: React.Ref<HTMLDivElement>
  /** DOM id for the section container, for `aria-describedby` from outside. */
  id?: string
  /** Catalog-sourced products provide option/unit shape through the live quote. */
  providedOptions?: ReadonlyArray<{ id: string; name: string }>
  /** When present (including an empty array), skip owned product/availability lookups. */
  providedUnits?: ReadonlyArray<OptionUnitsStepperUnit>
}

export interface OptionUnitsStepperRow {
  optionKey: string
  optionName: string
  primary: OptionUnitsStepperUnit
  allUnits: OptionUnitsStepperUnit[]
  totalRemaining: number | null
}

/**
 * Rooms / per-unit stepper for booking-create flows. Drives
 * `GET /v1/admin/operations/availability/slots/:id/unit-availability` from #235 when a
 * departure is selected, and product option-level units before departure
 * selection, so operators can build "2 double rooms and 1 single" drafts.
 *
 * The section only tracks **intent** (how many of each unit the operator
 * wants to book). Actual hold/reservation happens when the parent submits
 * the booking — capacity drops the moment the reservation transaction
 * commits; the next refetch of `useSlotUnitAvailability` reflects it.
 *
 * ### Stepper bounds
 *
 * - Minimum is 0 (operator can deselect).
 * - Maximum is the unit's `remaining` count from the server. Unlimited
 *   pools (`remaining === null`) have no upper bound.
 * - The server is the truth: entering `3 doubles` when only 2 remain just
 *   disables the "+" button — we don't let the UI submit a request that
 *   would 409 at insert time.
 */
export function OptionUnitsStepperSection({
  value,
  onChange,
  productId,
  slotId,
  optionId,
  restrictToOption = false,
  enabled = true,
  onUnitsChange,
  labels,
  slotHasFiniteCapacity = false,
  invalidOptionUnitIds = [],
  providedOptions,
  providedUnits,
  required = false,
  error = null,
  sectionRef,
  id,
}: OptionUnitsStepperSectionProps) {
  const productsClient = useVoyantProductsContext()
  const messages = useBookingsUiMessagesOrDefault()
  const merged = { ...messages.roomsStepperSection.labels, ...labels }
  const generatedId = React.useId()
  const sectionId = id ?? generatedId
  const errorId = `${sectionId}-error`
  const usesProvidedUnits = providedUnits !== undefined
  const availability = useSlotUnitAvailability({
    slotId,
    enabled: enabled && Boolean(slotId) && !usesProvidedUnits,
  })

  // Always fetch option-level units for the product. They're needed
  // both before a slot is picked AND as a fallback after picking a slot
  // whose `availability_slots` row has no per-unit allocation rows wired
  // (the default for product-level slots seeded by the operator).
  const optionsQuery = useProductOptions({
    productId,
    status: "active",
    limit: 100,
    enabled: enabled && Boolean(productId) && !usesProvidedUnits,
  })
  const productOptions = React.useMemo(() => {
    const options = providedOptions ?? optionsQuery.data?.data ?? []
    if (!optionId) return options
    const selected = options.find((option) => option.id === optionId)
    const rest = options.filter((option) => option.id !== optionId)
    return selected ? [selected, ...rest] : options
  }, [optionsQuery.data?.data, optionId, providedOptions])
  const optionUnitQueries = useQueries({
    queries: usesProvidedUnits
      ? []
      : productOptions.map((option) => ({
          ...getOptionUnitsQueryOptions(productsClient, {
            optionId: option.id,
            limit: 100,
          }),
          enabled: enabled && Boolean(productId),
        })),
  })
  const optionUnitRows = React.useMemo(() => {
    if (providedUnits) return [...providedUnits]
    const rows: OptionUnitsStepperUnit[] = []
    productOptions.forEach((option, index) => {
      const units = optionUnitQueries[index]?.data?.data ?? []
      rows.push(...units.map((unit) => optionUnitToStepperUnit(option, unit, units.length)))
    })
    return rows
  }, [productOptions, optionUnitQueries, providedUnits])
  // optionUnitId → optionId lookup, derived from the product's own option
  // catalog. The slot-availability endpoint only returns option_unit rows
  // for the slot's bound option and doesn't stamp the option_id on each
  // row, so we look it up from the units we already fetched per option.
  const optionByUnitId = React.useMemo(() => {
    const map = new Map<string, string>()
    for (const unit of optionUnitRows) {
      if (unit.optionId) map.set(unit.optionUnitId, unit.optionId)
    }
    return map
  }, [optionUnitRows])
  const productUnitById = React.useMemo(() => {
    return new Map(optionUnitRows.map((unit) => [unit.optionUnitId, unit]))
  }, [optionUnitRows])
  // The slot's bound option, derived from the first availability row.
  // `null` when the slot is product-level (no option_id) — that path goes
  // through the product-level fallback below.
  const slotOptionId = React.useMemo(
    () => resolveSlotOptionId(availability.data?.data ?? [], optionByUnitId, optionId ?? null),
    [availability.data?.data, optionByUnitId, optionId],
  )
  const availabilityUnitRows = React.useMemo(
    () =>
      (availability.data?.data ?? []).map((unit) => {
        const productUnit = productUnitById.get(unit.optionUnitId)
        return {
          ...unit,
          optionId: productUnit?.optionId ?? slotOptionId ?? optionId ?? null,
          unitCode: productUnit?.unitCode ?? null,
          minAge: productUnit?.minAge ?? null,
          maxAge: productUnit?.maxAge ?? null,
          unitType: productUnit?.unitType ?? null,
        }
      }),
    [availability.data?.data, productUnitById, slotOptionId, optionId],
  )
  // Slot-bound per-unit availability stays authoritative for the slot's
  // option (real-time `remaining` from active bookings). For *other*
  // options the same product offers, fall back to the product-level
  // option_units so the operator can still pick a DBL/TWN even when the
  // slot is option-scoped to SGL. Product-level slots (no option_id) hit
  // the no-slot-rows branch and use the product fallback for everything.
  // See issue #960.
  const units = React.useMemo(() => {
    if (providedUnits) return [...providedUnits]
    const merged = mergeStepperUnits(
      availabilityUnitRows,
      optionUnitRows,
      slotOptionId,
      Boolean(slotId),
    )
    // Journey: the option is already chosen, so show ONLY its units. Other
    // options' rooms aren't bookable under the selected option (an option
    // with no rooms of its own correctly shows none).
    if (restrictToOption && optionId) return merged.filter((unit) => unit.optionId === optionId)
    return merged
  }, [
    availabilityUnitRows,
    optionUnitRows,
    slotOptionId,
    slotId,
    restrictToOption,
    optionId,
    providedUnits,
  ])
  const invalidOptionUnitIdSet = React.useMemo(
    () => new Set(invalidOptionUnitIds),
    [invalidOptionUnitIds],
  )

  React.useEffect(() => {
    onUnitsChange?.(units)
  }, [onUnitsChange, units])

  // Person-priced options are grouped by option: operators choose pax
  // count, then traveler rows split Adult / Child / Infant. Inventory
  // options are different: rooms and vehicles are physical containers,
  // so each room/vehicle unit must be selectable independently.
  const optionRows = React.useMemo(
    () => buildOptionUnitsStepperRows(units, productOptions),
    [units, productOptions],
  )

  // The section is a group of steppers rather than a single control, so the
  // required marker and the validation message live on the container. Both
  // are rendered in every branch — an operator who has to pick a quantity
  // here should be told so before they press a disabled button (#4588).
  const containerProps = {
    id: sectionId,
    ref: sectionRef,
    tabIndex: -1,
    "aria-invalid": error ? true : undefined,
    "aria-describedby": error ? errorId : undefined,
    className: `flex flex-col gap-2 rounded-md border p-3 outline-none ${
      error ? "border-destructive/70 bg-destructive/5 ring-1 ring-destructive/20" : ""
    }`,
  } as const
  const heading = (
    <Label>
      {merged.heading}
      {required ? (
        <>
          <span aria-hidden="true" className="text-destructive">
            {" *"}
          </span>
          <span className="sr-only">{` (${merged.required})`}</span>
        </>
      ) : null}
    </Label>
  )
  const errorNode = error ? (
    <p id={errorId} role="alert" className="text-xs font-medium text-destructive">
      {error}
    </p>
  ) : null

  if (!slotId && !productId && !optionId) {
    return (
      <div {...containerProps}>
        {heading}
        {errorNode}
        <p className="text-xs text-muted-foreground">{merged.noOption}</p>
      </div>
    )
  }

  // Both data sources need to resolve before declaring an empty result
  // — slot units may legitimately be empty (product-level slot), and
  // we don't want to flash the empty state before option-level units
  // finish loading.
  const optionsLoaded = usesProvidedUnits
    ? true
    : optionsQuery.isSuccess && optionUnitQueries.every((query) => query.isSuccess)
  const loaded = usesProvidedUnits
    ? true
    : slotId
      ? availability.isSuccess && optionsLoaded
      : optionsLoaded
  if (loaded && units.length === 0) {
    return (
      <div {...containerProps}>
        {heading}
        {errorNode}
        <p className="text-xs text-muted-foreground">{merged.noUnits}</p>
      </div>
    )
  }

  const setQuantity = (unitId: string, qty: number) => {
    const next = { ...value.quantities }
    if (qty <= 0) {
      delete next[unitId]
    } else {
      next[unitId] = qty
    }
    onChange({ quantities: next })
  }

  return (
    <div {...containerProps}>
      {heading}
      {errorNode}
      <div className="flex flex-col gap-2">
        {optionRows.map(({ optionKey, optionName, primary, allUnits, totalRemaining }) => {
          const qty = value.quantities[primary.optionUnitId] ?? 0
          const isInvalid = optionRowHasInvalidUnit(allUnits, invalidOptionUnitIdSet)
          const remainingLabel = resolveOptionRemainingLabel({
            totalRemaining,
            units: allUnits,
            slotHasFiniteCapacity,
            remaining: merged.remaining,
            unlimited: merged.unlimited,
            fillsSlotCapacity: merged.fillsSlotCapacity,
          })
          const atMax = totalRemaining !== null && qty >= totalRemaining

          return (
            <div
              key={optionKey}
              className={`flex items-center gap-3 rounded-md border px-3 py-2 ${
                isInvalid ? "border-destructive/70 bg-destructive/5 ring-1 ring-destructive/20" : ""
              }`}
              aria-invalid={isInvalid ? true : undefined}
            >
              <div className="flex-1">
                <div className="flex flex-wrap items-center gap-2 text-sm font-medium">
                  <span>{optionName}</span>
                  {isInvalid ? (
                    <span className="rounded-sm bg-destructive/10 px-1.5 py-0.5 text-[10px] font-medium text-destructive">
                      {merged.reviewLine}
                    </span>
                  ) : null}
                </div>
                <div className="text-xs text-muted-foreground">{remainingLabel}</div>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0"
                  onClick={() => setQuantity(primary.optionUnitId, Math.max(0, qty - 1))}
                  disabled={qty <= 0}
                  aria-label={`${merged.decreaseUnitPrefix} ${optionName}`}
                >
                  <Minus className="h-3.5 w-3.5" />
                </Button>
                <span className="min-w-[1.5rem] text-center text-sm tabular-nums">{qty}</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0"
                  onClick={() => setQuantity(primary.optionUnitId, qty + 1)}
                  disabled={atMax}
                  aria-label={`${merged.increaseUnitPrefix} ${optionName}`}
                >
                  <Plus className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export function resolveOptionRemainingLabel({
  totalRemaining,
  units,
  slotHasFiniteCapacity,
  remaining,
  unlimited,
  fillsSlotCapacity,
}: {
  totalRemaining: number | null
  units: ReadonlyArray<Pick<OptionUnitsStepperUnit, "unitType">>
  slotHasFiniteCapacity: boolean
  remaining: string
  unlimited: string
  fillsSlotCapacity?: string
}): string {
  if (totalRemaining !== null) return `${totalRemaining} ${remaining}`
  if (slotHasFiniteCapacity && units.length > 0 && units.every(isPersonUnit)) {
    return fillsSlotCapacity ?? unlimited
  }
  return unlimited
}

export function optionRowHasInvalidUnit(
  units: ReadonlyArray<Pick<OptionUnitsStepperUnit, "optionUnitId">>,
  invalidOptionUnitIds: ReadonlySet<string>,
) {
  return units.some((unit) => invalidOptionUnitIds.has(unit.optionUnitId))
}

/**
 * Returns the `optionId` the slot is bound to, derived from the first
 * slot-availability row whose `optionUnitId` we can map to a known
 * product option. Falls back to the caller's `fallbackOptionId` (the
 * dialog's currently-selected option) when no rows resolve — that lets
 * the existing `optionId` prop drive the previous-behavior path for
 * unit pickers that haven't loaded yet.
 */
export function resolveSlotOptionId(
  slotRows: ReadonlyArray<{ optionUnitId: string }>,
  optionByUnitId: ReadonlyMap<string, string>,
  fallbackOptionId: string | null,
): string | null {
  for (const row of slotRows) {
    const resolved = optionByUnitId.get(row.optionUnitId)
    if (resolved) return resolved
  }
  return fallbackOptionId
}

/**
 * Merges slot-bound per-unit availability with the product's option-unit
 * catalog. Slot rows are authoritative for the slot's option (they carry
 * real-time `remaining`); product-level rows fill in the other options
 * the product offers so the operator can still pick mixes the slot isn't
 * explicitly tracking. When the slot is product-level (no `option_id`)
 * or hasn't loaded slot rows yet, the product-level rows cover everything.
 */
export function mergeStepperUnits(
  slotRows: ReadonlyArray<OptionUnitsStepperUnit>,
  productRows: ReadonlyArray<OptionUnitsStepperUnit>,
  slotOptionId: string | null,
  hasSlot: boolean,
): OptionUnitsStepperUnit[] {
  if (!hasSlot || slotRows.length === 0 || !slotOptionId) {
    return [...productRows]
  }
  const otherOptionRows = productRows.filter((row) => row.optionId !== slotOptionId)
  return [...slotRows, ...otherOptionRows]
}

function isAdultUnit(unit: OptionUnitsStepperUnit): boolean {
  // The seed creates ADULT / CHILD / SENIOR unit codes; the stepper
  // unit object doesn't carry the code, so fall back to name-matching
  // when the upstream code isn't surfaced.
  return /\badult\b/i.test(unit.unitName)
}

function isPersonUnit(unit: Pick<OptionUnitsStepperUnit, "unitType">): boolean {
  return unit.unitType === "person"
}

function isInventoryUnit(unit: Pick<OptionUnitsStepperUnit, "unitType">): boolean {
  return unit.unitType === "room" || unit.unitType === "vehicle"
}

export function buildOptionUnitsStepperRows(
  units: ReadonlyArray<OptionUnitsStepperUnit>,
  productOptions: ReadonlyArray<Pick<ProductOptionRecord, "id" | "name">>,
): OptionUnitsStepperRow[] {
  const groups = new Map<
    string,
    { primary: OptionUnitsStepperUnit; allUnits: OptionUnitsStepperUnit[] }
  >()
  for (const unit of units) {
    const key = unit.optionId ?? unit.optionUnitId
    const entry = groups.get(key)
    if (entry) {
      entry.allUnits.push(unit)
      if (isAdultUnit(unit) && !isAdultUnit(entry.primary)) entry.primary = unit
    } else {
      groups.set(key, { primary: unit, allUnits: [unit] })
    }
  }

  return Array.from(groups.entries()).flatMap(([optionKey, group]) => {
    const optionName =
      productOptions.find((option) => option.id === optionKey)?.name ?? group.primary.unitName
    const inventoryUnits = group.allUnits.filter(isInventoryUnit)
    const inventoryRows: OptionUnitsStepperRow[] = inventoryUnits.map((unit) => ({
      optionKey: unit.optionUnitId,
      optionName: unit.unitName,
      primary: unit,
      allUnits: [unit],
      totalRemaining: unit.remaining,
    }))
    const countUnits = group.allUnits.filter((unit) => !isInventoryUnit(unit))
    if (countUnits.length === 0) return inventoryRows

    const countPrimary = countUnits.find(isAdultUnit) ?? countUnits[0]
    if (!countPrimary) return inventoryRows
    const totalRemaining = countUnits.reduce<number | null>((acc, unit) => {
      if (unit.remaining === null || acc === null) return null
      return acc + unit.remaining
    }, 0)
    return [
      ...inventoryRows,
      {
        optionKey:
          inventoryRows.length > 0 ? `${optionKey}:${countPrimary.optionUnitId}` : optionKey,
        optionName: inventoryRows.length > 0 ? countPrimary.unitName : optionName,
        primary: countPrimary,
        allUnits: countUnits,
        totalRemaining,
      },
    ]
  })
}

function optionUnitToStepperUnit(
  option: Pick<ProductOptionRecord, "id" | "name">,
  unit: OptionUnitRecord,
  unitCount: number,
): OptionUnitsStepperUnit {
  return {
    optionId: option.id,
    optionUnitId: unit.id,
    unitName: unitCount === 1 ? option.name : `${option.name} - ${unit.name}`,
    unitCode: unit.code,
    minAge: unit.minAge,
    maxAge: unit.maxAge,
    unitType: unit.unitType,
    occupancyMax: unit.occupancyMax,
    initial: null,
    reserved: 0,
    remaining: unit.maxQuantity ?? null,
  }
}
