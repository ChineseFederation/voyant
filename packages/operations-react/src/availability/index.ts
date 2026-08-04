export {
  instantToSlotLocal,
  type LocalToInstantInput,
  localToInstant,
  type SlotLocalDateTime,
  type SlotTimeRangeInput,
  slotEndDateLocal,
  slotLocalEnd,
  slotLocalStart,
} from "@voyant-travel/operations/scheduling"
export {
  defaultFetcher,
  fetchWithValidation,
  VoyantApiError,
  type VoyantFetcher,
} from "./client.js"
export * from "./constants.js"
export {
  type DepartureWorkspaceSearchParams,
  type DepartureWorkspaceTab,
  defaultDepartureWorkspaceTab,
  departureWorkspaceSearchSchema,
  departureWorkspaceTabs,
  parseDepartureWorkspaceTab,
} from "./departure-search-params.js"
export * from "./hooks/index.js"
export {
  useVoyantAvailabilityContext,
  type VoyantAvailabilityContextValue,
  VoyantAvailabilityProvider,
  type VoyantAvailabilityProviderProps,
} from "./provider.js"
export { availabilityQueryKeys } from "./query-keys.js"
export {
  getAvailabilityOverviewQueryOptions,
  getCloseoutsQueryOptions,
  getDepartureFleetResourcesQueryOptions,
  getDepartureSummaryQueryOptions,
  getFleetResourcesQueryOptions,
  getPickupPointsQueryOptions,
  getProductQueryOptions,
  getProductResourceTemplatesQueryOptions,
  getProductsQueryOptions,
  getRulesQueryOptions,
  getSlotAllocationAuditLogQueryOptions,
  getSlotAllocationConflictsQueryOptions,
  getSlotAllocationQueryOptions,
  getSlotAssignmentsQueryOptions,
  getSlotBookingsQueryOptions,
  getSlotCloseoutsQueryOptions,
  getSlotPickupsQueryOptions,
  getSlotQueryOptions,
  getSlotResourcesQueryOptions,
  getSlotsQueryOptions,
  getSlotUnitAvailabilityQueryOptions,
  getStartTimesQueryOptions,
} from "./query-options.js"
export * from "./schemas.js"
export * from "./utils.js"
