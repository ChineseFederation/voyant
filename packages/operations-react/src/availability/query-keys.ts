export interface PaginationFilters {
  limit?: number | undefined
  offset?: number | undefined
}

export interface ProductListFilters extends PaginationFilters {
  search?: string | undefined
}

export interface AvailabilityRulesListFilters extends PaginationFilters {
  productId?: string | undefined
}

export interface AvailabilityStartTimesListFilters extends PaginationFilters {
  productId?: string | undefined
}

export interface AvailabilitySlotsListFilters extends PaginationFilters {
  productId?: string | undefined
  itineraryId?: string | undefined
  optionId?: string | undefined
  facilityId?: string | undefined
  availabilityRuleId?: string | undefined
  startTimeId?: string | undefined
  dateLocal?: string | undefined
  startsAtFrom?: string | undefined
  status?: string | undefined
}

export interface AvailabilityOverviewFilters {
  productId?: string | undefined
  attentionLimit?: number | undefined
}

export interface AvailabilityCloseoutsListFilters extends PaginationFilters {
  productId?: string | undefined
  slotId?: string | undefined
}

export interface AvailabilityPickupPointsListFilters extends PaginationFilters {
  productId?: string | undefined
  active?: boolean | undefined
}

export interface AvailabilitySlotDetailFilters extends PaginationFilters {
  slotId?: string | undefined
}

export interface FleetResourceListFilters extends PaginationFilters {
  /** `resources.kind` — "vehicle", "boat", "room", … */
  kind?: string | undefined
  active?: boolean | undefined
}

export const availabilityQueryKeys = {
  all: ["voyant", "availability"] as const,

  products: () => [...availabilityQueryKeys.all, "products"] as const,
  productsList: (filters: ProductListFilters) =>
    [...availabilityQueryKeys.products(), "list", filters] as const,

  rules: () => [...availabilityQueryKeys.all, "rules"] as const,
  rulesList: (filters: AvailabilityRulesListFilters) =>
    [...availabilityQueryKeys.rules(), "list", filters] as const,
  ruleDetail: (id: string) => [...availabilityQueryKeys.rules(), "detail", id] as const,

  startTimes: () => [...availabilityQueryKeys.all, "start-times"] as const,
  startTimesList: (filters: AvailabilityStartTimesListFilters) =>
    [...availabilityQueryKeys.startTimes(), "list", filters] as const,
  startTimeDetail: (id: string) => [...availabilityQueryKeys.startTimes(), "detail", id] as const,

  slots: () => [...availabilityQueryKeys.all, "slots"] as const,
  slotsList: (filters: AvailabilitySlotsListFilters) =>
    [...availabilityQueryKeys.slots(), "list", filters] as const,
  overview: (filters: AvailabilityOverviewFilters) =>
    [...availabilityQueryKeys.all, "overview", filters] as const,

  closeouts: () => [...availabilityQueryKeys.all, "closeouts"] as const,
  closeoutsList: (filters: AvailabilityCloseoutsListFilters) =>
    [...availabilityQueryKeys.closeouts(), "list", filters] as const,

  pickupPoints: () => [...availabilityQueryKeys.all, "pickup-points"] as const,
  pickupPointsList: (filters: AvailabilityPickupPointsListFilters) =>
    [...availabilityQueryKeys.pickupPoints(), "list", filters] as const,

  slotDetail: (id: string) => [...availabilityQueryKeys.slots(), "detail", id] as const,
  /** The composed departure envelope (`GET /slots/{id}/summary`). */
  departureSummary: (id: string) =>
    [...availabilityQueryKeys.slots(), "departure-summary", id] as const,
  slotUnitAvailability: (id: string) =>
    [...availabilityQueryKeys.slots(), "unit-availability", id] as const,
  slotPickupsList: (filters: AvailabilitySlotDetailFilters) =>
    [...availabilityQueryKeys.slots(), "pickups", "list", filters] as const,
  slotCloseoutsList: (filters: AvailabilitySlotDetailFilters) =>
    [...availabilityQueryKeys.slots(), "closeouts", "list", filters] as const,
  slotAssignmentsList: (filters: AvailabilitySlotDetailFilters) =>
    [...availabilityQueryKeys.slots(), "assignments", "list", filters] as const,
  slotResourcesList: (filters: PaginationFilters) =>
    [...availabilityQueryKeys.slots(), "resources", "list", filters] as const,
  slotBookingsList: (filters: PaginationFilters) =>
    [...availabilityQueryKeys.slots(), "bookings", "list", filters] as const,
  slotAllocation: (slotId: string) =>
    [...availabilityQueryKeys.slots(), "allocation", slotId] as const,
  slotAllocationAuditLog: (slotId: string) =>
    [...availabilityQueryKeys.slots(), "allocation", slotId, "audit-log"] as const,
  /**
   * Both of these sit *under* `slotAllocation(slotId)` on purpose: every
   * mutation already invalidates that prefix, so the conflicts projection and
   * the attached fleet list refresh with the manifest instead of needing their
   * own invalidation in each mutation hook.
   */
  slotAllocationConflicts: (slotId: string, kind: string) =>
    [...availabilityQueryKeys.slots(), "allocation", slotId, "conflicts", kind] as const,
  slotAllocationFleetResources: (slotId: string) =>
    [...availabilityQueryKeys.slots(), "allocation", slotId, "fleet-resources"] as const,
  /** The global operated-resource registry, filtered for the attach picker. */
  fleetResourcesList: (filters: FleetResourceListFilters) =>
    [...availabilityQueryKeys.all, "fleet-resources", "list", filters] as const,
  product: (id: string) => [...availabilityQueryKeys.products(), "detail", id] as const,
  productResourceTemplates: (productId: string) =>
    [...availabilityQueryKeys.products(), "resource-templates", productId] as const,
} as const
