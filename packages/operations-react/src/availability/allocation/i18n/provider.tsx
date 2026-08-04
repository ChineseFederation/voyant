"use client"

import {
  createLocaleFormatters,
  createPackageMessagesContext,
  type LocaleMessageDefinitions,
  type LocaleMessageOverrides,
  type PackageI18nValue,
  resolvePackageMessages,
} from "@voyant-travel/i18n"
import type { ReactNode } from "react"

import { allocationUiEn } from "./en.js"
import { allocationUiRo } from "./ro.js"

export { allocationUiEn, allocationUiRo }

/**
 * One localized entry per stable server conflict code. Mirrors
 * `DepartureIssueCodeMessage`: the server's English `message` is a fallback for
 * consumers with no catalogue, never the string an operator reads.
 */
export interface AllocationConflictCodeMessage {
  title: string
  description: string
}

export type AllocationUiMessages = Record<string, unknown> & {
  pageTitle: string
  loading: string
  empty: string
  back: string
  addRoom: string
  addResource: string
  generateRooms: string
  generatingRooms: string
  generateResources: string
  generatingResources: string
  autoAllocate: string
  autoAllocating: string
  booking: string
  exportPassengers: string
  exportRooming: string
  auditLog: string
  auditLogDescription: string
  auditActions: Record<string, string>
  roomLabel: string
  roomCapacity: string
  createRoom: string
  resourceLabel: string
  resourceCapacity: string
  resourceOption: string
  resourceOptionPlaceholder: string
  resourceOptionNone: string
  resourceParent: string
  resourceParentPlaceholder: string
  resourceParentRequired: string
  seatDesignationRequired: string
  seatDesignationDuplicate: string
  createResource: string
  editResource: string
  saveResource: string
  updateResourceFailed: string
  removeResourceFailed: string
  cancel: string
  unallocated: string
  unallocatedDescription: string
  unallocatedEmpty: string
  assignTraveler: string
  assignTravelerSearch: string
  assignTravelerEmpty: string
  assignTravelerSameBooking: string
  assignTravelerOthers: string
  resourceOtherGroup: string
  rooms: string
  resources: string
  vehicles: string
  vehicleSeats: string
  vehicle: string
  seat: string
  operationalKindDescriptions: Record<"room" | "vehicle" | "vehicle_seat", string>
  cabins: string
  flightSeats: string
  travelers: string
  capacity: string
  lead: string
  sharingGroup: string
  accessibility: string
  dietary: string
  smokingAllowed: string
  remove: string
  overCapacity: string
  dropHere: string
  slotCapacityLabel: string
  slotCapacityUnlimited: string
  resourceCapacityLabel: string
  resourceCapacityFits: string
  resourceCapacityExact: string
  resourceCapacityOver: string
  overCapacityWarning: string
  noRooms: string
  noResources: string
  noSeats: string
  noAllocationsToManage: string
  passengerListEmpty: string
  windowSeat: string
  aisleSeat: string
  middleSeat: string
  /**
   * The server-side conflicts projection (`GET .../allocation/conflicts`).
   *
   * Replaces the `validation*` keys, which were fragments assembled by a
   * client-side rule set (`buildValidationIssues`) that covered three of the
   * seven cases and had no call sites. Each server code needs a whole sentence,
   * so the fragments could not be carried over; the two whole-sentence strings
   * live on as `conflicts.title` and `conflicts.clearTitle`.
   */
  conflicts: {
    title: string
    description: string
    clearTitle: string
    clearDescription: string
    criticalGroup: string
    warningGroup: string
    criticalBadge: string
    warningBadge: string
    affectedLabel: string
    loadFailed: string
    codes: Record<string, AllocationConflictCodeMessage>
  }
  fleet: {
    sourceLabel: string
    sourceManual: string
    sourceFleet: string
    pickerLabel: string
    pickerPlaceholder: string
    pickerEmpty: string
    pickerLoading: string
    capacityUnknown: string
    attachedTitle: string
    attachedDescription: string
    attachedEmpty: string
    attach: string
    attaching: string
    detach: string
    detachConfirm: string
    alreadyAttached: string
    doubleBooked: string
    attachFailed: string
    detachFailed: string
    detachHasChildren: string
  }
  bulk: {
    selectTraveler: string
    selectAll: string
    selectedSummary: string
    clear: string
    moveTo: string
    moveToPlaceholder: string
    unassignTarget: string
    move: string
    moving: string
    moveFailed: string
    groupTogether: string
    groupFailed: string
    ungroup: string
    ungroupFailed: string
    renameGroup: string
    renameGroupLabel: string
    renameGroupFailed: string
    saveGroupLabel: string
    clearGroupLabel: string
  }
  preview: {
    title: string
    description: string
    planning: string
    emptyPlan: string
    travelerColumn: string
    bookingColumn: string
    fromColumn: string
    toColumn: string
    unassignedValue: string
    unchangedBadge: string
    summary: string
    violationsTitle: string
    violationsDescription: string
    /** Groups the planner could only place by relaxing a constraint. */
    compromisesTitle: string
    compromisesDescription: string
    compromiseRow: string
    relaxations: Record<
      "bed_preference" | "room_type" | "option" | "option_unit" | "age_band" | "accessibility",
      string
    >
    /** Groups the planner could not place, and why. */
    unplacedTitle: string
    unplacedNoCapacity: string
    unplacedNoResources: string
    confirm: string
    confirming: string
    previewFailed: string
  }
  exportMenu: {
    label: string
    seating: string
    print: string
    downloading: string
    failed: string
  }
  /**
   * The printed rooming list. #4036 widened it from the four columns a screen
   * summary needs to the ones a hotel needs to make up the rooms.
   */
  print: {
    heading: string
    departureLabel: string
    generatedAt: string
    resourceColumn: string
    capacityColumn: string
    occupantsColumn: string
    roomTypeColumn: string
    bedConfigurationColumn: string
    accessibleColumn: string
    bookingColumn: string
    sharingGroupColumn: string
    bedPreferenceColumn: string
    notesColumn: string
    accessibilityNote: string
    yes: string
    no: string
    unallocatedRow: string
    totalRow: string
    conflictsHeading: string
  }
  /** The admin affordance for the preferences the room rules check against. */
  roomingPreferences: {
    title: string
    description: string
    editButton: string
    bedPreferenceLabel: string
    bedPreferenceNone: string
    bedPreferences: Record<"single" | "twin" | "double" | "no-preference", string>
    roomTypeLabel: string
    roomTypePlaceholder: string
    roomTypeHint: string
    save: string
    saving: string
    cancel: string
    saveFailed: string
  }
  /**
   * Waiving a blocking room constraint. The reason is mandatory and is written
   * into the departure's audit trail alongside the rules it waived.
   */
  override: {
    title: string
    description: string
    violationsHeading: string
    reasonLabel: string
    reasonPlaceholder: string
    reasonRequired: string
    confirm: string
    confirming: string
    cancel: string
    severities: Record<"blocking" | "advisory", string>
    codes: Record<string, string>
  }
  allocationFailed: string
  createRoomFailed: string
  createResourceFailed: string
  generateRoomsFailed: string
  generateResourcesFailed: string
  autoAllocateFailed: string
  paymentStatusLabels: Record<"paid" | "partial" | "unpaid", string>
  seatMapBuilder: {
    heading: string
    description: string
    cellKindHeading: string
    cellKindHint: string
    cellKinds: Record<"seat" | "aisle" | "door" | "void", string>
    cellKindShort: Record<"seat" | "aisle" | "door" | "void", string>
    addRow: string
    removeRow: string
    rowAria: string
    columnAria: string
    seatCountSummary: string
    capacityChip: string
    presetHeading: string
    presetHint: string
    presets: {
      standardCoach: string
      miniCoach: string
      largeBus: string
      doubleDecker: string
      withMidDoor: string
    }
    resetSpec: string
    rowLabel: string
    voidDoorReminder: string
  }
}

const fallbackLocale = "en"

export const allocationUiMessageDefinitions = {
  en: allocationUiEn,
  ro: allocationUiRo,
} satisfies LocaleMessageDefinitions<AllocationUiMessages>

export type AllocationUiMessageOverrides = LocaleMessageOverrides<AllocationUiMessages>

const allocationUiContext =
  createPackageMessagesContext<AllocationUiMessages>("AllocationUiMessages")

const defaultAllocationUiI18n: PackageI18nValue<AllocationUiMessages> = {
  messages: allocationUiEn,
  ...createLocaleFormatters(fallbackLocale),
}

export function resolveAllocationUiMessages({
  locale,
  overrides,
}: {
  locale: string | null | undefined
  overrides?: AllocationUiMessageOverrides | null
}) {
  return resolvePackageMessages({
    definitions: allocationUiMessageDefinitions,
    fallbackLocale,
    locale,
    overrides,
  })
}

export function getAllocationUiI18n({
  locale,
  overrides,
}: {
  locale?: string | null | undefined
  overrides?: AllocationUiMessageOverrides | null
}): PackageI18nValue<AllocationUiMessages> {
  const resolvedLocale = locale ?? fallbackLocale

  return {
    messages: resolveAllocationUiMessages({
      locale: resolvedLocale,
      overrides,
    }),
    ...createLocaleFormatters(resolvedLocale),
  }
}

export function AllocationUiMessagesProvider({
  children,
  locale,
  timeZone,
  overrides,
}: {
  children: ReactNode
  locale: string | null | undefined
  timeZone?: string | null
  overrides?: AllocationUiMessageOverrides | null
}) {
  return (
    <allocationUiContext.ResolvedMessagesProvider
      definitions={allocationUiMessageDefinitions}
      fallbackLocale={fallbackLocale}
      locale={locale}
      timeZone={timeZone}
      overrides={overrides}
    >
      {children}
    </allocationUiContext.ResolvedMessagesProvider>
  )
}

export const useAllocationUiI18n = allocationUiContext.useI18n
export const useAllocationUiMessages = allocationUiContext.useMessages

export function useAllocationUiI18nOrDefault() {
  return allocationUiContext.useOptionalI18n() ?? defaultAllocationUiI18n
}

export function useAllocationUiMessagesOrDefault() {
  return useAllocationUiI18nOrDefault().messages
}
