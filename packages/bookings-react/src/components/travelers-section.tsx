// agent-quality: file-size exception -- owner: bookings-react; existing UI surface stays co-located until a dedicated split preserves behavior and tests.
"use client"

import {
  type PersonRecord,
  type PersonRelationshipRecord,
  usePerson,
  usePersonRelationships,
} from "@voyant-travel/relationships-react"
import {
  Button,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@voyant-travel/ui/components"
import { Trash2, UserPlus } from "lucide-react"
import * as React from "react"
import { useBookingsUiMessagesOrDefault } from "../i18n/provider.js"
import {
  createTravelerFromPerson,
  RelatedPersonChip,
  TravelerCategoryButtons,
  TravelerPersonPicker,
  TravelerPricingCategorySelect,
} from "./travelers-section-controls.js"

export type TravelerRole = "lead" | "adult" | "child" | "infant"
export type TravelerUnitAssignmentSource = "auto" | "manual" | "none"

export interface TravelerEntry {
  /** Stable client-side identity used by item/extra travelerKeys links. */
  clientTravelerKey?: string
  personId: string | null
  firstName: string
  lastName: string
  email: string
  /** Snapshotted from the linked person at pick time. Optional. */
  phone: string
  /** Snapshotted from the linked person at pick time. Optional. */
  preferredLanguage: string
  role: TravelerRole
  /** ISO `YYYY-MM-DD` date of birth. Drives age-derived unit assignment. */
  dateOfBirth: string | null
  /** option_unit_id of the person pricing tier this traveler is billed as. */
  pricingUnitId: string | null
  /** pricing_category_id selected from the product's traveler price matrix, when applicable. */
  pricingCategoryId: string | null
  /** Operator intent for `pricingCategoryId`; preserves an explicit category across CRM edits. */
  pricingCategorySource?: TravelerUnitAssignmentSource
  /** option_unit_id of the room/vehicle this traveler occupies, when applicable. */
  inventoryUnitId: string | null
  /** Operator intent for `pricingUnitId`; defaults to `auto` when omitted. */
  pricingUnitSource?: TravelerUnitAssignmentSource
  /** Operator intent for `inventoryUnitId`; defaults to `auto` when omitted. */
  inventoryUnitSource?: TravelerUnitAssignmentSource
}

export interface TravelerListValue {
  travelers: TravelerEntry[]
}

export const emptyTravelerListValue: TravelerListValue = { travelers: [] }

function createClientTravelerKey(): string {
  const random =
    typeof globalThis.crypto?.randomUUID === "function"
      ? globalThis.crypto.randomUUID().replace(/-/g, "")
      : `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`
  return `trav:${random}`
}

/** Factory for a blank row — `role` defaults to `adult` unless the list is empty. */
export function createBlankTraveler(role: TravelerRole = "adult"): TravelerEntry {
  return {
    clientTravelerKey: createClientTravelerKey(),
    personId: null,
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    preferredLanguage: "",
    role,
    dateOfBirth: null,
    pricingUnitId: null,
    pricingCategoryId: null,
    pricingCategorySource: "auto",
    inventoryUnitId: null,
    pricingUnitSource: "auto",
    inventoryUnitSource: "auto",
  }
}

function isBlankTraveler(traveler: TravelerEntry): boolean {
  return (
    traveler.personId === null &&
    !traveler.firstName.trim() &&
    !traveler.lastName.trim() &&
    !traveler.email.trim() &&
    !traveler.phone.trim()
  )
}

export function insertPersonTraveler(
  travelers: TravelerEntry[],
  traveler: TravelerEntry,
): TravelerEntry[] {
  const blankIndex = travelers.findIndex(isBlankTraveler)
  if (blankIndex === -1) return [...travelers, traveler]
  return travelers.map((existing, index) =>
    index === blankIndex
      ? {
          ...traveler,
          clientTravelerKey: existing.clientTravelerKey ?? traveler.clientTravelerKey,
          role: existing.role,
          ...(existing.pricingCategorySource === "manual"
            ? {
                pricingCategoryId: existing.pricingCategoryId,
                pricingCategorySource: "manual" as const,
                pricingUnitId: existing.pricingUnitId,
                pricingUnitSource: existing.pricingUnitSource,
              }
            : {}),
        }
      : existing,
  )
}

// Re-export `computeAgeYears` from the canonical assignment module so
// existing consumers of `travelers-section`'s public surface keep
// working. The implementation lives in `@voyant-travel/bookings/pricing-assignment`.
export { computeAgeYears } from "@voyant-travel/bookings/pricing-assignment"

import {
  computeAgeYears as _computeAgeYears,
  matchUnitByDob as matchAssignmentUnitByDob,
  matchUnitByRoleHint as matchAssignmentUnitByRoleHint,
  type PricingAssignmentUnit,
} from "@voyant-travel/bookings/pricing-assignment"

/**
 * Derive the age-banded traveler role from DOB. Falls back to `adult`
 * when DOB is missing so partial entries still typecheck downstream.
 *
 * Thresholds:
 *   - infant: < 2
 *   - child:  2 – 17
 *   - adult:  18+
 */
export function deriveTravelerRoleFromDob(dob: string | null): TravelerRole {
  const age = _computeAgeYears(dob)
  if (age == null) return "adult"
  if (age < 2) return "infant"
  if (age < 18) return "child"
  return "adult"
}

function roleFromPricingCategoryType(categoryType: string | null | undefined): TravelerRole {
  if (categoryType === "child") return "child"
  if (categoryType === "infant") return "infant"
  return "adult"
}

export function categoryMatchesDob(
  category: TravelerPricingCategoryOption,
  dob: string | null,
): boolean {
  if (category.minAge == null && category.maxAge == null) return false
  const age = _computeAgeYears(dob)
  if (age == null) return false
  return (
    (category.minAge == null || age >= category.minAge) &&
    (category.maxAge == null || age <= category.maxAge)
  )
}

function categoryMatchesRole(
  category: TravelerPricingCategoryOption,
  role: TravelerRole | null,
): boolean {
  if (role === "lead" || role === "adult") return category.categoryType === "adult"
  if (role === "child") return category.categoryType === "child"
  if (role === "infant") return category.categoryType === "infant"
  return false
}

export function matchPricingCategoryForTraveler(
  categories: ReadonlyArray<TravelerPricingCategoryOption> | undefined,
  dob: string | null,
  role: TravelerRole | null,
  inventoryUnitId: string | null,
): string | null {
  if (!categories || categories.length === 0) return null
  const pool = inventoryUnitId
    ? categories.filter((category) => category.unitIds.includes(inventoryUnitId))
    : categories
  if (pool.length === 0) return null
  return (
    pool.find((category) => categoryMatchesDob(category, dob))?.categoryId ??
    pool.find((category) => categoryMatchesRole(category, role))?.categoryId ??
    pool[0]?.categoryId ??
    null
  )
}

export function applyTravelerPricingCategory(
  traveler: TravelerEntry,
  category: TravelerPricingCategoryOption,
): Partial<TravelerEntry> {
  const pricingUnitId =
    category.unitIds.find((unitId) => unitId === traveler.pricingUnitId) ??
    category.unitIds[0] ??
    traveler.pricingUnitId
  return {
    pricingCategoryId: category.categoryId,
    pricingCategorySource: "manual",
    ...(pricingUnitId ? { pricingUnitId, pricingUnitSource: "manual" as const } : {}),
    role:
      traveler.role === "lead" && roleFromPricingCategoryType(category.categoryType) === "adult"
        ? "lead"
        : roleFromPricingCategoryType(category.categoryType),
  }
}

/**
 * Adapter from this file's `RoomGroupUnit` shape (UI-side, uses
 * `unitId`) to the canonical `PricingAssignmentUnit` shape (uses
 * `optionUnitId`). Phase 1 of voyant-travel/voyant#1267 will collapse these
 * by renaming the UI shape.
 */
function roomGroupUnitsAsAssignmentUnits(
  units: ReadonlyArray<RoomGroupUnit>,
): PricingAssignmentUnit[] {
  return units.map((u) => ({
    optionId: null,
    optionUnitId: u.unitId,
    unitName: u.unitName,
    unitCode: u.unitCode,
    minAge: u.minAge,
    maxAge: u.maxAge,
    unitType: u.unitType,
  }))
}

function matchUnitByDob(units: ReadonlyArray<RoomGroupUnit>, dob: string | null): string | null {
  return matchAssignmentUnitByDob(roomGroupUnitsAsAssignmentUnits(units), dob)
}

function matchUnitByRoleHint(
  units: ReadonlyArray<RoomGroupUnit>,
  role: TravelerRole | null,
): string | null {
  return matchAssignmentUnitByRoleHint(roomGroupUnitsAsAssignmentUnits(units), role)
}

export interface RoomUnitOption {
  unitId: string
  unitName: string
  /**
   * How many more travelers can be assigned to this unit. Decremented by
   * the parent based on the stepper's quantity × occupancy capacity minus
   * travelers already assigned to that unit.
   */
  remainingCapacity: number
}

/**
 * Per-option breakdown of the actual age-banded units the product
 * configures. Lets the row render dynamic category buttons (e.g.
 * Adult/Child/Senior for one product, Adult/Child/Infant for another)
 * rather than a hardcoded set.
 */
export interface RoomGroupUnit {
  unitId: string
  /** Short label — typically the unit's own name (Adult, Child, Senior). */
  unitName: string
  /** Stable code (ADULT, CHILD, SENIOR, INFANT, …) when configured. */
  unitCode: string | null
  minAge: number | null
  maxAge: number | null
  unitType: "person" | "group" | "room" | "vehicle" | "service" | "other" | null
}

export interface RoomGroup {
  /** option_id this group of units belongs to. */
  optionId: string
  /** Display name for the option (e.g. "Standard double"). */
  optionName: string
  /** Default unit when the option is first picked (typically the ADULT-coded row). */
  primaryUnitId: string
  units: RoomGroupUnit[]
}

export interface TravelerPricingCategoryOption {
  categoryId: string
  name: string
  code: string | null
  categoryType: string
  minAge: number | null
  maxAge: number | null
  unitIds: string[]
}

export interface TravelersSectionProps {
  value: TravelerListValue
  onChange: (value: TravelerListValue) => void
  /**
   * Rooms the operator has selected (from OptionUnitsStepperSection + occupancy).
   * When provided, each traveler gets a room-assignment dropdown.
   */
  roomUnits?: RoomUnitOption[]
  /**
   * Per-option breakdown of all units the product configures. Drives
   * dynamic category buttons (Adult/Child/Senior or whatever the
   * product configures) and DOB-aware unit pre-selection on attach.
   * Required for category buttons to render.
   */
  roomGroups?: RoomGroup[]
  /**
   * Product pricing categories surfaced by the room x traveler price matrix.
   * Room-only accommodation products use these as the traveler category select.
   */
  pricingCategories?: TravelerPricingCategoryOption[]
  billingPersonId?: string | null
  labels?: {
    heading?: string
    addTraveler?: string
    firstName?: string
    lastName?: string
    email?: string
    role?: string
    category?: string
    dateOfBirth?: string
    roleLead?: string
    roleAdult?: string
    roleChild?: string
    roleInfant?: string
    room?: string
    noRoom?: string
    remove?: string
    empty?: string
    person?: string
    personSearchPlaceholder?: string
    personEmpty?: string
    createNewPerson?: string
    createPersonSheetTitle?: string
    editPerson?: string
    editPersonSheetTitle?: string
    addBillingPerson?: string
    relatedPeopleHeading?: string
    addRelatedPerson?: string
  }
}

const NO_ROOM = "__unassigned__"

/**
 * Traveler list for booking-create flows. Each row can point at an existing
 * CRM person, create a new CRM person, or carry manual name/email details,
 * plus role and optional room assignment.
 *
 * ### Parent contract
 *
 * At submit time, the parent:
 * 1. Inserts a `booking_travelers` row per traveler with `participantType`
 *    derived from the role (`lead` / `adult` → traveler; `child` / `infant`
 *    → traveler with travelerCategory set).
 * 2. Carries `personId` through when the traveler is tied to CRM, including
 *    when the payer is also traveling.
 * 3. Exactly one row should have `role: "lead"` — enforced at submit, not
 *    here. The UI lets the operator pick whichever layout they want, then
 *    the submit handler errors if the invariant isn't met.
 */
export function TravelersSection({
  value,
  onChange,
  roomUnits,
  roomGroups,
  pricingCategories,
  billingPersonId,
  labels,
}: TravelersSectionProps) {
  const messages = useBookingsUiMessagesOrDefault()
  const merged = { ...messages.travelersSection.labels, ...labels }
  const billingPerson = usePerson(billingPersonId ?? undefined, {
    enabled: Boolean(billingPersonId),
  })
  const updateAt = (index: number, patch: Partial<TravelerEntry>) => {
    const next = value.travelers.map((traveler, i) =>
      i === index ? { ...traveler, ...patch } : traveler,
    )
    onChange({ travelers: next })
  }

  const pickPricingCategoryAt = (
    index: number,
    traveler: TravelerEntry,
    category: TravelerPricingCategoryOption,
  ) => {
    updateAt(index, applyTravelerPricingCategory(traveler, category))
  }

  const removeAt = (index: number) => {
    onChange({ travelers: value.travelers.filter((_, i) => i !== index) })
  }

  const pickPricingUnitIdForTraveler = React.useCallback(
    (
      dateOfBirth: string | null = null,
      role: TravelerRole | null = null,
      preferredUnitId: string | null = null,
    ): string | null => {
      if (!roomGroups || roomGroups.length === 0) return null
      const group =
        (preferredUnitId
          ? roomGroups.find(
              (g) =>
                g.primaryUnitId === preferredUnitId ||
                g.units.some((u) => u.unitId === preferredUnitId),
            )
          : undefined) ?? roomGroups[0]
      if (!group) return null
      return (
        matchUnitByDob(group.units, dateOfBirth) ??
        matchUnitByRoleHint(group.units, role) ??
        group.units.find((unit) => unit.unitType == null || unit.unitType === "person")?.unitId ??
        null
      )
    },
    [roomGroups],
  )

  // Auto-pick a room with seats available so operators don't have to
  // hunt for the dropdown on every traveler — they can still override
  // manually via the Room select. Pricing is picked from the same
  // option when the product exposes person tiers.
  const pickAssignmentsForNewTraveler = React.useCallback(
    (
      dateOfBirth: string | null = null,
      role: TravelerRole | null = null,
    ): Pick<TravelerEntry, "pricingUnitId" | "pricingCategoryId" | "inventoryUnitId"> => {
      if (!roomUnits || roomUnits.length === 0) {
        return {
          pricingUnitId: null,
          pricingCategoryId: matchPricingCategoryForTraveler(
            pricingCategories,
            dateOfBirth,
            role,
            null,
          ),
          inventoryUnitId: null,
        }
      }
      const pickedRoom = roomUnits.find((unit) => unit.remainingCapacity > 0)?.unitId ?? null
      if (!pickedRoom || !roomGroups || roomGroups.length === 0) {
        return {
          pricingUnitId: null,
          pricingCategoryId: matchPricingCategoryForTraveler(
            pricingCategories,
            dateOfBirth,
            role,
            pickedRoom,
          ),
          inventoryUnitId: pickedRoom,
        }
      }
      const pricingUnitId = pickPricingUnitIdForTraveler(dateOfBirth, role, pickedRoom)
      return {
        pricingUnitId,
        pricingCategoryId: matchPricingCategoryForTraveler(
          pricingCategories,
          dateOfBirth,
          role,
          pickedRoom,
        ),
        inventoryUnitId: pickedRoom,
      }
    },
    [roomUnits, roomGroups, pricingCategories, pickPricingUnitIdForTraveler],
  )

  // Note: there is no hydration effect any more. Travelers attached
  // before the option-units queries resolve get null assignment ids
  // and `*UnitSource: "auto"`; the resolver in
  // `@voyant-travel/bookings/pricing-assignment` re-derives them at every
  // preview/submit pass, and respects `"none"` (explicit No room) /
  // `"manual"` (operator click) when set. Operator intent is now
  // declarative on the row, not implicit in a one-shot effect.

  const addRow = () => {
    // First traveler defaults to `lead` so the operator doesn't have to
    // remember to flip the role on the initial row.
    const role: TravelerRole = value.travelers.length === 0 ? "lead" : "adult"
    const blank = createBlankTraveler(role)
    onChange({
      travelers: [
        ...value.travelers,
        {
          ...blank,
          ...pickAssignmentsForNewTraveler(null, role),
          pricingUnitSource: "auto",
          pricingCategorySource: "auto",
          inventoryUnitSource: "auto",
        },
      ],
    })
  }

  const addBillingPerson = () => {
    if (!billingPerson.data) return
    const blankTraveler = value.travelers.find(isBlankTraveler)
    const role: TravelerRole =
      blankTraveler?.role ?? (value.travelers.length === 0 ? "lead" : "adult")
    const traveler = createTravelerFromPerson(billingPerson.data, role)
    onChange({
      travelers: insertPersonTraveler(value.travelers, {
        ...traveler,
        ...pickAssignmentsForNewTraveler(traveler.dateOfBirth, role),
        pricingUnitSource: "auto",
        pricingCategorySource: "auto",
        inventoryUnitSource: "auto",
      }),
    })
  }

  const addRelatedPersonTraveler = (person: PersonRecord) => {
    const blankTraveler = value.travelers.find(isBlankTraveler)
    const role: TravelerRole =
      blankTraveler?.role ?? (value.travelers.length === 0 ? "lead" : "adult")
    const traveler = createTravelerFromPerson(person, role)
    onChange({
      travelers: insertPersonTraveler(value.travelers, {
        ...traveler,
        ...pickAssignmentsForNewTraveler(traveler.dateOfBirth, role),
        pricingUnitSource: "auto",
        pricingCategorySource: "auto",
        inventoryUnitSource: "auto",
      }),
    })
  }

  const hasBillingPersonTraveler = Boolean(
    billingPersonId && value.travelers.some((traveler) => traveler.personId === billingPersonId),
  )

  // Relationships of the billing person — surfaced as one-click "add as
  // traveler" chips so the operator can populate family/companions
  // without searching for them in the picker.
  const relationshipsQuery = usePersonRelationships(billingPersonId ?? undefined, {
    enabled: Boolean(billingPersonId),
  })
  const alreadyAddedIds = React.useMemo(
    () => new Set(value.travelers.map((t) => t.personId).filter(Boolean) as string[]),
    [value.travelers],
  )
  const relatedPersonIds: { id: string; kind: PersonRelationshipRecord["kind"] }[] =
    React.useMemo(() => {
      if (!billingPersonId) return []
      const seen = new Set<string>()
      const out: { id: string; kind: PersonRelationshipRecord["kind"] }[] = []
      for (const rel of relationshipsQuery.data?.data ?? []) {
        const otherId = rel.fromPersonId === billingPersonId ? rel.toPersonId : rel.fromPersonId
        if (seen.has(otherId) || alreadyAddedIds.has(otherId)) continue
        seen.add(otherId)
        out.push({ id: otherId, kind: rel.kind })
      }
      return out
    }, [billingPersonId, relationshipsQuery.data?.data, alreadyAddedIds])

  // base-ui's Select reads labels via the `items` prop — without it,
  // <SelectValue /> falls back to the raw value (the unit id). Memoize
  // once for all rows so identity is stable across renders.
  const roomSelectItems = React.useMemo(
    () => [
      { label: merged.noRoom, value: NO_ROOM },
      ...(roomUnits ?? []).map((unit) => ({ label: unit.unitName, value: unit.unitId })),
    ],
    [roomUnits, merged.noRoom],
  )

  return (
    <div className="flex flex-col gap-2 rounded-md border p-3">
      <div className="flex items-center justify-between">
        <Label>{merged.heading}</Label>
        <Button type="button" size="sm" variant="ghost" onClick={addRow}>
          {merged.addTraveler}
        </Button>
      </div>
      {billingPersonId && !hasBillingPersonTraveler ? (
        <div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={addBillingPerson}
            disabled={!billingPerson.data}
          >
            <UserPlus className="mr-1 h-3.5 w-3.5" />
            {merged.addBillingPerson}
          </Button>
        </div>
      ) : null}
      {relatedPersonIds.length > 0 ? (
        <div className="flex flex-col gap-1.5">
          <span className="text-xs text-muted-foreground">{merged.relatedPeopleHeading}</span>
          <div className="flex flex-wrap gap-1.5">
            {relatedPersonIds.map((rel) => (
              <RelatedPersonChip
                key={rel.id}
                personId={rel.id}
                kind={rel.kind}
                addLabel={merged.addRelatedPerson}
                onAdd={addRelatedPersonTraveler}
              />
            ))}
          </div>
        </div>
      ) : null}

      {value.travelers.length === 0 ? (
        <p className="text-xs text-muted-foreground">{merged.empty}</p>
      ) : (
        <div className="flex flex-col gap-2">
          {value.travelers.map((traveler, index) => (
            <div
              // biome-ignore lint/suspicious/noArrayIndexKey: row identity is positional -- owner: bookings-react; existing suppression is intentional pending typed cleanup.
              key={index}
              className="flex flex-col gap-2 rounded-md border p-2"
            >
              <TravelerPersonPicker
                personId={traveler.personId}
                labels={merged}
                pinnedPeople={billingPerson.data ? [billingPerson.data] : []}
                onSelect={(person) =>
                  updateAt(index, {
                    personId: person.id,
                    firstName: person.firstName,
                    lastName: person.lastName,
                    email: person.email ?? "",
                    phone: person.phone ?? "",
                    preferredLanguage: person.preferredLanguage ?? "",
                    dateOfBirth: person.dateOfBirth ?? null,
                    // Re-derive auto-owned unit assignments when the
                    // linked CRM person changes. Pricing and inventory
                    // stay independent: a manual room does not freeze
                    // DOB-driven pricing, and a manual category does
                    // not move the room.
                    ...(traveler.pricingUnitSource === "manual" ||
                    traveler.pricingUnitSource === "none"
                      ? {}
                      : {
                          pricingUnitId: pickPricingUnitIdForTraveler(
                            person.dateOfBirth ?? null,
                            traveler.role,
                            traveler.inventoryUnitId,
                          ),
                          pricingUnitSource: "auto" as const,
                        }),
                    ...(traveler.pricingCategorySource === "manual"
                      ? {}
                      : {
                          pricingCategoryId: matchPricingCategoryForTraveler(
                            pricingCategories,
                            person.dateOfBirth ?? null,
                            traveler.role,
                            traveler.inventoryUnitId,
                          ),
                          pricingCategorySource: "auto" as const,
                        }),
                    ...(traveler.inventoryUnitSource === "manual" ||
                    traveler.inventoryUnitSource === "none"
                      ? {}
                      : {
                          inventoryUnitId: pickAssignmentsForNewTraveler(
                            person.dateOfBirth ?? null,
                            traveler.role,
                          ).inventoryUnitId,
                          inventoryUnitSource: "auto" as const,
                        }),
                  })
                }
                onClear={() =>
                  updateAt(index, {
                    personId: null,
                    firstName: "",
                    lastName: "",
                    email: "",
                    phone: "",
                    preferredLanguage: "",
                    dateOfBirth: null,
                    ...(traveler.pricingUnitSource === "manual" ||
                    traveler.pricingUnitSource === "none"
                      ? {}
                      : {
                          pricingUnitId: pickPricingUnitIdForTraveler(
                            null,
                            traveler.role,
                            traveler.inventoryUnitId,
                          ),
                          pricingUnitSource: "auto" as const,
                        }),
                    ...(traveler.pricingCategorySource === "manual"
                      ? {}
                      : {
                          pricingCategoryId: matchPricingCategoryForTraveler(
                            pricingCategories,
                            null,
                            traveler.role,
                            traveler.inventoryUnitId,
                          ),
                          pricingCategorySource: "auto" as const,
                        }),
                    ...(traveler.inventoryUnitSource === "manual" ||
                    traveler.inventoryUnitSource === "none"
                      ? {}
                      : {
                          inventoryUnitId: pickAssignmentsForNewTraveler(null, traveler.role)
                            .inventoryUnitId,
                          inventoryUnitSource: "auto" as const,
                        }),
                  })
                }
              />

              <div className="grid grid-cols-2 gap-2">
                {pricingCategories ? (
                  <TravelerPricingCategorySelect
                    traveler={traveler}
                    categories={pricingCategories}
                    label={merged.category}
                    onPickCategory={(category) => pickPricingCategoryAt(index, traveler, category)}
                  />
                ) : (
                  <TravelerCategoryButtons
                    traveler={traveler}
                    roomGroups={roomGroups}
                    fallbackLabels={{
                      category: merged.category,
                      adult: merged.roleAdult,
                      child: merged.roleChild,
                      infant: merged.roleInfant,
                    }}
                    onPickUnit={(unitId, nextRole, source) =>
                      updateAt(index, {
                        pricingUnitId: unitId,
                        role: nextRole,
                        // Only freeze as manual when the dynamic button
                        // actually picked a unit. Role-only clicks via
                        // the static fallback stay `auto` so the
                        // resolver can re-derive once real units load.
                        pricingUnitSource: source,
                      })
                    }
                  />
                )}

                {roomUnits && roomUnits.length > 0 ? (
                  <div className="flex flex-col gap-1">
                    <Label className="text-xs">{merged.room}</Label>
                    <Select
                      items={roomSelectItems}
                      value={traveler.inventoryUnitId ?? NO_ROOM}
                      onValueChange={(v) =>
                        updateAt(index, {
                          inventoryUnitId: v === NO_ROOM || !v ? null : v,
                          inventoryUnitSource: v === NO_ROOM || !v ? "none" : "manual",
                          ...(traveler.pricingCategorySource === "manual"
                            ? {}
                            : {
                                pricingCategoryId: matchPricingCategoryForTraveler(
                                  pricingCategories,
                                  traveler.dateOfBirth,
                                  traveler.role,
                                  v === NO_ROOM || !v ? null : v,
                                ),
                                pricingCategorySource: "auto" as const,
                              }),
                        })
                      }
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NO_ROOM}>{merged.noRoom}</SelectItem>
                        {roomUnits.map((unit) => (
                          <SelectItem
                            key={unit.unitId}
                            value={unit.unitId}
                            disabled={
                              unit.remainingCapacity <= 0 &&
                              traveler.inventoryUnitId !== unit.unitId
                            }
                          >
                            {unit.unitName}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ) : null}
              </div>

              <div className="flex justify-end">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 text-destructive"
                  onClick={() => removeAt(index)}
                  aria-label={merged.remove}
                >
                  <Trash2 className="mr-1 h-3.5 w-3.5" />
                  {merged.remove}
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
