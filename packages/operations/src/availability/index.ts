import type { Module } from "@voyant-travel/core"
import type { ApiModule } from "@voyant-travel/hono/module"

import { availabilityLinkable } from "./linkables.js"
import { availabilityAdminRoutes } from "./routes.js"
import { availabilityService } from "./service.js"

export { availabilityLinkable, departureLinkable } from "./linkables.js"
export type { AvailabilityAdminRoutes, AvailabilityRoutes } from "./routes.js"

export const availabilityModule: Module = {
  name: "availability",
  requiresTransactionalDb: true,
  linkable: availabilityLinkable,
}

export const availabilityApiModule: ApiModule = {
  module: availabilityModule,
  adminRoutes: availabilityAdminRoutes,
}

export type {
  AllocationAuditLog,
  AllocationResource,
  AvailabilityCloseout,
  AvailabilityPickupPoint,
  AvailabilityRule,
  AvailabilitySlot,
  AvailabilitySlotPickup,
  AvailabilityStartTime,
  CustomPickupArea,
  LocationPickupTime,
  NewAllocationResource,
  NewAvailabilityCloseout,
  NewAvailabilityPickupPoint,
  NewAvailabilityRule,
  NewAvailabilitySlot,
  NewAvailabilitySlotPickup,
  NewAvailabilityStartTime,
  NewCustomPickupArea,
  NewLocationPickupTime,
  NewPickupGroup,
  NewPickupLocation,
  NewProductMeetingConfig,
  NewProductOptionResourceTemplate,
  PickupGroup,
  PickupLocation,
  ProductMeetingConfig,
  ProductOptionResourceTemplate,
  SharingGroupLabel,
} from "@voyant-travel/availability/schema"
export {
  allocationAuditLog,
  allocationResources,
  availabilityCloseouts,
  availabilityPickupPoints,
  availabilityRules,
  availabilitySlotPickups,
  availabilitySlots,
  availabilityStartTimes,
  customPickupAreas,
  locationPickupTimes,
  pickupGroups,
  pickupLocations,
  productMeetingConfigs,
  productOptionResourceTemplates,
  sharingGroupLabels,
} from "@voyant-travel/availability/schema"
export {
  AVAILABILITY_SLOT_CHANGED_EVENT,
  type AvailabilitySlotChangedEvent,
  type AvailabilitySlotChangeSource,
} from "./events.js"
export {
  type GenerateAvailabilitySlotsOptions,
  type GenerateAvailabilitySlotsResult,
  generateAvailabilitySlots,
} from "./generate-slots.js"
export {
  countDeparturesOnVersion,
  listUnboundDepartures,
  reportUnboundDepartures,
  type UnboundDeparture,
  type UnboundDepartureReport,
} from "./service-aggregates.js"
export {
  type AllocationManifestBooking,
  type AllocationManifestTraveler,
  getSlotAllocationManifest,
  getSlotResourceAvailability,
  getSlotsResourceAvailability,
  type PlannedAllocation,
  type ResourceCapacityViolation,
  type SlotAllocationManifest,
  type SlotAllocationManifestOptions,
  type SlotAllocationManifestPagination,
  type SlotResourceAvailability,
  validateSlotAllocationCapacity,
} from "./service-allocation.js"
export {
  type MaterializeSlotResourcesFromTemplatesOptions,
  materializeSlotResourcesFromTemplateDefaults,
} from "./service-allocation-automation.js"
export {
  allocationExportFilename,
  buildAllocationPassengersCsv,
  buildAllocationRoomingCsv,
} from "./service-allocation-exports.js"
export {
  type DepartureAllocationCounters,
  type DepartureBookingCounters,
  type DepartureCapacityCounters,
  type DepartureResourceCounters,
  type DepartureTravelerCounters,
  getDepartureCapacityCounters,
} from "./service-departure-capacity.js"
export {
  type DepartureIssue,
  type DepartureIssueCode,
  type DepartureIssueInput,
  type DepartureIssueSeverity,
  type DepartureIssueSubjectType,
  evaluateDepartureIssues,
  getDepartureIssues,
} from "./service-departure-issues.js"
export {
  type DepartureBookingQuantities,
  type DepartureExtrasRollup,
  type DepartureFinanceHeadline,
  type DepartureFinanceLine,
  type DepartureIdentity,
  type DepartureOperationsReadiness,
  type DepartureSummary,
  getDepartureSummary,
} from "./service-departure-summary.js"
export {
  instantToSlotLocal,
  type LocalToInstantInput,
  localToInstant,
  type SlotLocalDateTime,
  type SlotTimeRangeInput,
  slotEndDateLocal,
  slotLocalEnd,
  slotLocalStart,
} from "./slot-timezone.js"
export {
  allocationAuditLogQuerySchema,
  allocationAutomationSchema,
  allocationManifestQuerySchema,
  assignTravelerAllocationSchema,
  availabilityCloseoutListQuerySchema,
  availabilityOverviewQuerySchema,
  availabilityPickupPointListQuerySchema,
  availabilityRuleListQuerySchema,
  availabilitySlotListQuerySchema,
  availabilitySlotPickupListQuerySchema,
  availabilityStartTimeListQuerySchema,
  customPickupAreaListQuerySchema,
  insertAllocationResourceSchema,
  insertAvailabilityCloseoutSchema,
  insertAvailabilityPickupPointSchema,
  insertAvailabilityRuleSchema,
  insertAvailabilitySlotPickupSchema,
  insertAvailabilitySlotSchema,
  insertAvailabilityStartTimeSchema,
  insertCustomPickupAreaSchema,
  insertLocationPickupTimeSchema,
  insertPickupGroupSchema,
  insertPickupLocationSchema,
  insertProductMeetingConfigSchema,
  locationPickupTimeListQuerySchema,
  operatedDepartureResourceKindSchema,
  pairSharingGroupSchema,
  pickupGroupListQuerySchema,
  pickupLocationListQuerySchema,
  productMeetingConfigListQuerySchema,
  type SeatLayoutCell,
  type SeatLayoutSpec,
  seatLayoutCellSchema,
  seatLayoutSpecSchema,
  updateAllocationResourceSchema,
  updateAvailabilityCloseoutSchema,
  updateAvailabilityPickupPointSchema,
  updateAvailabilityRuleSchema,
  updateAvailabilitySlotPickupSchema,
  updateAvailabilitySlotSchema,
  updateAvailabilityStartTimeSchema,
  updateCustomPickupAreaSchema,
  updateLocationPickupTimeSchema,
  updatePickupGroupSchema,
  updatePickupLocationSchema,
  updateProductMeetingConfigSchema,
  updateSharingGroupLabelSchema,
  updateTravelerSharingGroupSchema,
  upsertResourceTemplateSchema,
} from "./validation.js"
export { availabilityService }
