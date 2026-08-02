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
  validationTitle: string
  validationClear: string
  validationUnallocated: string
  validationOverCapacity: string
  validationSplitGroup: string
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

export const allocationUiEn = {
  pageTitle: "Allocation",
  loading: "Loading allocation...",
  empty: "Allocation data unavailable for this departure.",
  back: "Back",
  addRoom: "Add room",
  addResource: "Add resource",
  generateRooms: "Generate rooms",
  generatingRooms: "Generating...",
  generateResources: "Generate resources",
  generatingResources: "Generating...",
  autoAllocate: "Auto-allocate",
  autoAllocating: "Allocating...",
  booking: "Booking",
  exportPassengers: "Passengers",
  exportRooming: "Rooming",
  auditLog: "Audit log",
  auditLogDescription: "Recent allocation changes for this departure.",
  auditActions: {
    "resource.create": "Resource created",
    "resource.update": "Resource updated",
    "resource.delete": "Resource deleted",
    "traveler.assign": "Traveler assigned",
    "traveler.unassign": "Traveler unassigned",
    "traveler.sharing-group.set": "Sharing group set",
    "traveler.sharing-group.clear": "Sharing group cleared",
    "sharing-group.label.update": "Group label updated",
    "sharing-group.label.clear": "Group label cleared",
    "resources.materialize": "Resources generated",
    "auto-allocate": "Auto-allocate",
  },
  roomLabel: "Room label",
  roomCapacity: "Capacity",
  createRoom: "Create room",
  resourceLabel: "Resource label",
  resourceCapacity: "Capacity",
  resourceOption: "Tied to option",
  resourceOptionPlaceholder: "Select an option…",
  resourceOptionNone: "Unassigned (manual)",
  resourceParent: "Vehicle",
  resourceParentPlaceholder: "Select the vehicle this seat belongs to…",
  resourceParentRequired: "Create a vehicle before adding its seats.",
  seatDesignationRequired: "Enter a seat designation, such as 12A.",
  seatDesignationDuplicate: "That seat designation already exists in this vehicle.",
  createResource: "Create resource",
  editResource: "Edit resource",
  saveResource: "Save",
  updateResourceFailed: "Could not update resource.",
  removeResourceFailed: "Could not remove resource.",
  cancel: "Cancel",
  unallocated: "Unallocated",
  unallocatedDescription: "Travelers not assigned to this resource kind.",
  unallocatedEmpty: "Everyone has been assigned.",
  assignTraveler: "Assign",
  assignTravelerSearch: "Search traveler...",
  assignTravelerEmpty: "No unallocated travelers.",
  assignTravelerSameBooking: "Same booking",
  assignTravelerOthers: "Other bookings",
  resourceOtherGroup: "Other",
  rooms: "Rooms",
  resources: "Resources",
  vehicles: "Vehicles",
  vehicleSeats: "Seats",
  vehicle: "Vehicle",
  seat: "Seat",
  operationalKindDescriptions: {
    room: "Assign travelers to rooms or other shared accommodation units.",
    vehicle: "Group travelers by the coach, minibus, aircraft, or vessel carrying them.",
    vehicle_seat: "Assign each traveler an exact seat within a vehicle.",
  },
  cabins: "Cabins",
  flightSeats: "Flight seats",
  travelers: "Travelers",
  capacity: "Capacity",
  lead: "Lead",
  sharingGroup: "Sharing group",
  accessibility: "Accessibility",
  dietary: "Dietary",
  smokingAllowed: "Smoking",
  remove: "Remove",
  overCapacity: "Resource is full",
  dropHere: "Drop traveler here",
  slotCapacityLabel: "Free seats",
  slotCapacityUnlimited: "Unlimited",
  resourceCapacityLabel: "Set up",
  resourceCapacityFits: "fits in slot",
  resourceCapacityExact: "matches slot",
  resourceCapacityOver: "over slot cap",
  overCapacityWarning: "Capacity is more than this departure's guest limit.",
  noRooms: "No rooms have been added for this slot.",
  noResources: "No resources have been added for this slot.",
  noSeats: "No vehicle seats have been generated for this slot.",
  noAllocationsToManage: "This slot has no allocations to manage.",
  passengerListEmpty: "No passengers are booked on this departure yet.",
  windowSeat: "Window",
  aisleSeat: "Aisle",
  middleSeat: "Middle",
  validationTitle: "Allocation needs attention",
  validationClear: "No validation issues",
  validationUnallocated: "unallocated",
  validationOverCapacity: "is over capacity",
  validationSplitGroup: "Split sharing group",
  allocationFailed: "Could not update allocation.",
  createRoomFailed: "Could not create room.",
  createResourceFailed: "Could not create resource.",
  generateRoomsFailed: "Could not generate rooms.",
  generateResourcesFailed: "Could not generate resources.",
  autoAllocateFailed: "Could not auto-allocate travelers.",
  paymentStatusLabels: {
    paid: "Paid",
    partial: "Partially paid",
    unpaid: "Unpaid",
  },
  seatMapBuilder: {
    heading: "Seat map",
    description:
      "Click a cell to cycle through seat → aisle → door → void. Capacity is computed from the seat cells.",
    cellKindHeading: "Cell kinds",
    cellKindHint: "Tip: doors and voids do not count toward capacity.",
    cellKinds: {
      seat: "Seat",
      aisle: "Aisle",
      door: "Door",
      void: "Empty space",
    },
    cellKindShort: {
      seat: "S",
      aisle: "·",
      door: "D",
      void: " ",
    },
    addRow: "Add row",
    removeRow: "Remove last row",
    rowAria: "Row {row}",
    columnAria: "Row {row}, column {column}",
    seatCountSummary: "{count} seats",
    capacityChip: "Capacity {count}",
    presetHeading: "Start from a preset",
    presetHint: "Pick a starter layout and tweak any cell.",
    presets: {
      standardCoach: "Standard coach (2-2, 11 rows)",
      miniCoach: "Mini-coach (2-1, 7 rows)",
      largeBus: "Large bus (3-2, 11 rows)",
      doubleDecker: "Double-aisle (2-1-2, 11 rows)",
      withMidDoor: "Coach with mid-door (2-2, door at row 7)",
    },
    resetSpec: "Clear layout",
    rowLabel: "Row {row}",
    voidDoorReminder:
      "Use a void cell for permanent obstacles (toilet, wheelchair spot). Use a door cell for boarding doors that interrupt seating mid-coach.",
  },
} satisfies AllocationUiMessages

export const allocationUiRo = {
  pageTitle: "Alocare",
  loading: "Se incarca alocarea...",
  empty: "Datele de alocare nu sunt disponibile pentru aceasta plecare.",
  back: "Inapoi",
  addRoom: "Adauga camera",
  addResource: "Adauga resursa",
  generateRooms: "Genereaza camere",
  generatingRooms: "Se genereaza...",
  generateResources: "Genereaza resurse",
  generatingResources: "Se genereaza...",
  autoAllocate: "Auto-aloca",
  autoAllocating: "Se aloca...",
  booking: "Rezervare",
  exportPassengers: "Pasageri",
  exportRooming: "Rooming",
  auditLog: "Istoric",
  auditLogDescription: "Ultimele modificari de alocare pentru aceasta plecare.",
  auditActions: {
    "resource.create": "Resursa creata",
    "resource.update": "Resursa actualizata",
    "resource.delete": "Resursa stearsa",
    "traveler.assign": "Calator alocat",
    "traveler.unassign": "Calator dezalocat",
    "traveler.sharing-group.set": "Grup partaj setat",
    "traveler.sharing-group.clear": "Grup partaj sters",
    "sharing-group.label.update": "Eticheta grup actualizata",
    "sharing-group.label.clear": "Eticheta grup stearsa",
    "resources.materialize": "Resurse generate",
    "auto-allocate": "Auto-alocare",
  },
  roomLabel: "Eticheta camera",
  roomCapacity: "Capacitate",
  createRoom: "Creeaza camera",
  resourceLabel: "Eticheta resursa",
  resourceCapacity: "Capacitate",
  resourceOption: "Optiune asociata",
  resourceOptionPlaceholder: "Alege o optiune…",
  resourceOptionNone: "Neasociata (manual)",
  resourceParent: "Vehicul",
  resourceParentPlaceholder: "Alege vehiculul caruia ii apartine locul…",
  resourceParentRequired: "Creeaza un vehicul inainte de a-i adauga locurile.",
  seatDesignationRequired: "Introdu o denumire pentru loc, de exemplu 12A.",
  seatDesignationDuplicate: "Aceasta denumire de loc exista deja in vehicul.",
  createResource: "Creeaza resursa",
  editResource: "Editeaza resursa",
  saveResource: "Salveaza",
  updateResourceFailed: "Resursa nu a putut fi actualizata.",
  removeResourceFailed: "Resursa nu a putut fi stearsa.",
  cancel: "Anuleaza",
  unallocated: "Nealocati",
  unallocatedDescription: "Calatori fara acest tip de resursa alocat.",
  unallocatedEmpty: "Toti calatorii sunt alocati.",
  assignTraveler: "Aloca",
  assignTravelerSearch: "Cauta calator...",
  assignTravelerEmpty: "Nu exista calatori nealocati.",
  assignTravelerSameBooking: "Aceeasi rezervare",
  assignTravelerOthers: "Alte rezervari",
  resourceOtherGroup: "Altele",
  rooms: "Camere",
  resources: "Resurse",
  vehicles: "Vehicule",
  vehicleSeats: "Locuri",
  vehicle: "Vehicul",
  seat: "Loc",
  operationalKindDescriptions: {
    room: "Aloca calatorii in camere sau alte unitati de cazare partajate.",
    vehicle: "Grupeaza calatorii dupa autocarul, minibusul, aeronava sau vasul folosit.",
    vehicle_seat: "Aloca fiecarui calator un loc exact intr-un vehicul.",
  },
  cabins: "Cabine",
  flightSeats: "Locuri zbor",
  travelers: "Calatori",
  capacity: "Capacitate",
  lead: "Lead",
  sharingGroup: "Grup partaj",
  accessibility: "Accesibilitate",
  dietary: "Dieta",
  smokingAllowed: "Fumat",
  remove: "Scoate",
  overCapacity: "Resursa este plina",
  dropHere: "Trage calatorul aici",
  slotCapacityLabel: "Locuri libere",
  slotCapacityUnlimited: "Nelimitat",
  resourceCapacityLabel: "Configurat",
  resourceCapacityFits: "incape in slot",
  resourceCapacityExact: "egal cu slotul",
  resourceCapacityOver: "depaseste slotul",
  overCapacityWarning: "Capacitatea depaseste limita de oaspeti a acestei plecari.",
  noRooms: "Nu exista camere adaugate pentru acest slot.",
  noResources: "Nu exista resurse adaugate pentru acest slot.",
  noSeats: "Nu exista locuri generate pentru acest slot.",
  noAllocationsToManage: "Acest slot nu are alocari de gestionat.",
  passengerListEmpty: "Nu exista pasageri rezervati pe aceasta plecare.",
  windowSeat: "Geam",
  aisleSeat: "Culoar",
  middleSeat: "Mijloc",
  validationTitle: "Alocarea necesita atentie",
  validationClear: "Fara probleme de validare",
  validationUnallocated: "nealocati",
  validationOverCapacity: "depaseste capacitatea",
  validationSplitGroup: "Grup partaj impartit",
  allocationFailed: "Alocarea nu a putut fi actualizata.",
  createRoomFailed: "Camera nu a putut fi creata.",
  createResourceFailed: "Resursa nu a putut fi creata.",
  generateRoomsFailed: "Camerele nu au putut fi generate.",
  generateResourcesFailed: "Resursele nu au putut fi generate.",
  autoAllocateFailed: "Calatorii nu au putut fi auto-alocati.",
  paymentStatusLabels: {
    paid: "Achitata",
    partial: "Partial achitata",
    unpaid: "Neachitata",
  },
  seatMapBuilder: {
    heading: "Harta locurilor",
    description:
      "Apasa o celula pentru a comuta scaun → culoar → usa → spatiu gol. Capacitatea este calculata din celulele de tip scaun.",
    cellKindHeading: "Tipuri de celule",
    cellKindHint: "Sfat: usile si spatiile goale nu se numara in capacitate.",
    cellKinds: {
      seat: "Scaun",
      aisle: "Culoar",
      door: "Usa",
      void: "Spatiu gol",
    },
    cellKindShort: {
      seat: "S",
      aisle: "·",
      door: "U",
      void: " ",
    },
    addRow: "Adauga rand",
    removeRow: "Sterge ultimul rand",
    rowAria: "Randul {row}",
    columnAria: "Randul {row}, coloana {column}",
    seatCountSummary: "{count} scaune",
    capacityChip: "Capacitate {count}",
    presetHeading: "Porneste de la o configuratie predefinita",
    presetHint: "Alege o configuratie de start si modifica orice celula.",
    presets: {
      standardCoach: "Autocar standard (2-2, 11 randuri)",
      miniCoach: "Minibus (2-1, 7 randuri)",
      largeBus: "Autocar mare (3-2, 11 randuri)",
      doubleDecker: "Doua culoare (2-1-2, 11 randuri)",
      withMidDoor: "Autocar cu usa centrala (2-2, usa la randul 7)",
    },
    resetSpec: "Sterge configuratia",
    rowLabel: "Randul {row}",
    voidDoorReminder:
      "Foloseste o celula de tip spatiu gol pentru obstacole permanente (toaleta, loc pentru scaun cu rotile). Foloseste o usa pentru usile de imbarcare care intrerup scaunele in mijlocul autocarului.",
  },
} satisfies AllocationUiMessages

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
