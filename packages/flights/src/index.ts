// Flight contract types — offers, orders, segments, search, booking.

// Flight admin HTTP routes (module-owned; the deployment supplies connector +
// payment options).
export {
  type AdmittedFlightShoppingSource,
  createFlightAdminRoutes,
  createFlightsApiModule,
  createFlightsVoyantRuntime,
  type FlightOrderPaymentSummary,
  type FlightPaymentIntegration,
  type FlightPublicApiShoppingContext,
  type FlightsApiModuleOptions,
  type FlightsRouteOptions,
  type FlightsRuntime,
  flightsRuntimePort,
} from "./api-runtime.js"
// FlightConnectorAdapter contract.
export {
  type AdapterLogger,
  CAPABILITY_NOT_SUPPORTED,
  type FlightAdapterCapabilities,
  type FlightAdapterContext,
  type FlightAdapterEnvironment,
  type FlightBookResponse,
  type FlightCancelReason,
  type FlightCancelResponse,
  FlightCapabilityNotSupportedError,
  type FlightConnectorAdapter,
  type FlightGetOrderResponse,
  type FlightPriceRequest,
  type FlightPriceResponse,
  type FlightSearchResponse,
  requireCapability,
} from "./contract/adapter.js"
export * from "./contract/schemas.js"
export * from "./contract/types.js"
export {
  type DrainDurableFlightActionOperationsOptions,
  type DrainDurableFlightActionOperationsResult,
  type DurableFlightActionOperationView,
  drainDurableFlightActionOperations,
  getDurableFlightActionOperation,
} from "./durable-action-command.js"
export {
  assertDurableFlightActionResult,
  DURABLE_FLIGHT_ACTION_PROTOCOL,
  type DurableFlightActionCapability,
  type DurableFlightActionCommand,
  type DurableFlightActionKind,
  type DurableFlightActionProbe,
  type DurableFlightActionResult,
  type DurableFlightActionRuntime,
  durableFlightActionRuntimePort,
} from "./durable-action-runtime-port.js"
export {
  FLIGHTS_ENTITY_MODULE,
  mergedFlightOffersToCandidates,
  mergedFlightOfferToCandidate,
} from "./orchestration/availability-bridge.js"
export {
  type ConnectionResult,
  type ConnectionSearchStatus,
  type FanOutFlightSearchOptions,
  type FanOutFlightSearchResult,
  fanOutFlightSearch,
  type MergedFlightOffer,
} from "./orchestration/fan-out.js"
// Orchestration — fingerprinting + multi-connection fan-out.
export { itineraryFingerprint } from "./orchestration/fingerprint.js"
// Flight-specific payment integration — maps a FlightOrder onto a generic
// order-payment-session service + an optional card provider (both structural).
export {
  buildFlightSummary,
  createFlightOrderPaymentIntegration,
  type FlightCardBilling,
  type FlightOrderPaymentIntegrationDeps,
  type FlightOrderPaymentSessionOptions,
  formatDay,
  type OrderPaymentSessionsLike,
  parseAmountToCents,
  synthesizeBilling,
} from "./payment-integration.js"
export {
  type BoundPublicApiFlightOffer,
  createProviderFirstFlightBookingLifecycle,
  type ProviderFirstFlightBookingLifecycle,
  type ProviderFirstFlightBookingLifecycleOptions,
  type PublicApiFlightCommitOutcome,
  type PublicApiFlightHold,
  type PublicApiFlightHoldOutcome,
  PublicApiFlightLifecycleError,
  type PublicApiFlightMutationOutcome,
  type PublicApiFlightOperationClaim,
  type PublicApiFlightOperationClaimInput,
  type PublicApiFlightOperationStore,
  type PublicApiFlightPriceLock,
} from "./public-api-booking-lifecycle.js"
// ReferenceDataProvider — swappable provider for global reference data.
export {
  type Aircraft,
  type Airline,
  type Airport,
  dedupeCodes,
  type ReferenceDataCapabilities,
  type ReferenceDataProvider,
} from "./reference/contract.js"
export {
  createLocalPostgresReferenceProvider,
  type LocalPostgresReferenceProviderOptions,
  referenceAircraft,
  referenceAirlines,
  referenceAirports,
} from "./reference/local-postgres.js"
export {
  createStaticBundleReferenceProvider,
  type StaticBundleProviderOptions,
  type StaticBundleReferenceData,
} from "./reference/static-bundle.js"
// Snapshot capture for booking-time integration with the catalog plane.
export {
  type BuildFlightSnapshotInputOptions,
  buildFlightSnapshotInput,
} from "./snapshot.js"
