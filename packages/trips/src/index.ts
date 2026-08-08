import type { BootstrapContext, Module } from "@voyant-travel/core"
import { defineGraphRuntimeFactory } from "@voyant-travel/core/project"
import { stampOpenApiRegistryApiId } from "@voyant-travel/hono"
import type { ApiModule } from "@voyant-travel/hono/module"

import {
  TRIPS_PAYMENT_SUBSCRIBER_RUNTIME_KEY,
  type TripsPaymentSubscriberRuntime,
} from "./payment-subscriber-runtime.js"
import {
  createTripsRoutes,
  type TripsRoutesOptions,
  type TripsRoutesOptionsInput,
} from "./routes.js"
import { tripsDatabaseRuntimePort, tripsRoutesRuntimePort } from "./runtime-port.js"

export { createTripBookingSessionCompositeHandler } from "./booking-session-composite-handler.js"
export {
  type CatalogAdapterContext,
  type CatalogComponentAdapter,
  type CatalogComponentAdapterOptions,
  createCatalogComponentAdapter,
  previewCancellation,
  type StartComponentCheckout,
} from "./catalog-component.js"
export {
  type CatalogComponentBookingDraftOverrides,
  isCatalogBackedTripComponent,
  toBookingSelectionV1,
} from "./catalog-component-adapter.js"
export {
  CRUISE_EXTENSION_METADATA_KIND,
  type CruiseExtensionExtra,
  type CruiseExtensionLifecycle,
  type CruiseExtensionLinkCommand,
  type CruiseExtensionLinkInput,
  type CruiseExtensionPlacement,
  type CruiseExtensionRepresentation,
  type CruiseExtensionSelection,
  type CruiseExtensionTargetKind,
  createCruiseExtensionComponent,
  createCruiseExtensionExtra,
  createCruiseExtensionLinkCommand,
  cruiseExtensionLinkKey,
  groupCruiseExtensionLinksByProduct,
  representCruiseExtensionSelection,
} from "./cruise-extension.js"
export {
  type DurableTripActionCapability,
  type DurableTripActionCommand,
  type DurableTripActionKind,
  type DurableTripActionResult,
  type DurableTripActionRuntime,
  durableTripActionRuntimePort,
} from "./durable-action-runtime-port.js"
export {
  createFlightComponentAdapter,
  type FlightAdapterContext,
  type FlightComponentAdapter,
  type FlightComponentAdapterApi,
  type FlightComponentAdapterOptions,
  previewFlightCancellation,
} from "./flight-component.js"
export type {
  TripsRoutes,
  TripsRoutesOptions,
  TripsRoutesOptionsInput,
  TripsRoutesOptionsProvider,
} from "./routes.js"
export { createTripsRoutes } from "./routes.js"
export {
  type CreateStorefrontTripInput,
  createStorefrontTrip,
  createStorefrontTripCapability,
  resolveStorefrontTripAccess,
  STOREFRONT_TRIP_CAPABILITY_HEADER,
  STOREFRONT_TRIP_CAPABILITY_TTL_MS,
  type StorefrontTripAccessOptions,
  type StorefrontTripAccessResolution,
  type StorefrontTripContext,
  type StorefrontTripHandle,
  type StorefrontTripScope,
  storefrontTripScopeSchema,
} from "./storefront-access.js"

export const tripsModule: Module = {
  name: "trips",
}

export interface TripsApiModuleOptions extends TripsRoutesOptions {
  adminRoutes?: boolean
  publicRoutes?: boolean
  routesOptions?: TripsRoutesOptionsInput
}

export function createTripsApiModule(options: TripsApiModuleOptions = {}) {
  const { adminRoutes = true, publicRoutes = false, routesOptions, ...routeOptions } = options
  const resolvedRouteOptions = memoizeTripsRouteOptionsInput(routesOptions ?? routeOptions)
  const apiModule: ApiModule = {
    module: tripsModule,
  }
  if (adminRoutes) {
    apiModule.adminRoutes = stampOpenApiRegistryApiId(
      createTripsRoutes(withTripsRouteSurface(resolvedRouteOptions, "admin")),
      "@voyant-travel/trips#api.admin",
    )
  }
  if (publicRoutes) {
    apiModule.publicRoutes = stampOpenApiRegistryApiId(
      createTripsRoutes(withTripsRouteSurface(resolvedRouteOptions, "public")),
      "@voyant-travel/trips#api.public",
    )
  }
  return apiModule
}

/** Package-owned adapter from graph ports to the complete Trips runtime. */
export const createTripsVoyantRuntime = defineGraphRuntimeFactory(async ({ api, getPort }) => {
  const [routesOptions, databaseRuntime] = await Promise.all([
    getPort(tripsRoutesRuntimePort),
    getPort(tripsDatabaseRuntimePort),
  ])
  const configured = createTripsApiModule({
    routesOptions,
    adminRoutes: api.some(({ surface }) => surface === "admin"),
    publicRoutes: api.some(({ surface }) => surface === "public"),
  })
  const bootstrap = configured.module.bootstrap

  return {
    ...configured,
    module: {
      ...configured.module,
      requiresTransactionalDb: true,
      bootstrap: async (context: BootstrapContext) => {
        const runtime: TripsPaymentSubscriberRuntime = {
          withDb: (operation) => databaseRuntime.withDb(context.bindings, operation),
        }
        context.container.register(TRIPS_PAYMENT_SUBSCRIBER_RUNTIME_KEY, runtime)
        await bootstrap?.(context)
      },
    },
  }
})

export type { TripsDatabaseRuntime } from "./runtime-port.js"
export { tripsDatabaseRuntimePort, tripsRoutesRuntimePort } from "./runtime-port.js"

function memoizeTripsRouteOptionsInput(options: TripsRoutesOptionsInput): TripsRoutesOptionsInput {
  if (typeof options !== "function") return options

  let optionsPromise: Promise<TripsRoutesOptions> | undefined
  return () => {
    optionsPromise ??= Promise.resolve()
      .then(options)
      .catch((error) => {
        optionsPromise = undefined
        throw error
      })
    return optionsPromise
  }
}

function withTripsRouteSurface(
  options: TripsRoutesOptionsInput,
  surface: NonNullable<TripsRoutesOptions["surface"]>,
): TripsRoutesOptionsInput {
  if (typeof options !== "function") return { ...options, surface }
  return async () => ({ ...(await options()), surface })
}

export { tripsRoutes } from "./routes.js"
export type {
  NewTripCandidate,
  NewTripComponent,
  NewTripComponentEvent,
  NewTripEnvelope,
  NewTripRequirement,
  NewTripReservationPlan,
  NewTripSnapshot,
  TripCandidate,
  TripComponent,
  TripComponentEvent,
  TripComponentPricingSnapshot,
  TripComponentTaxLineSnapshot,
  TripEnvelope,
  TripEnvelopePricingSnapshot,
  TripRequirement,
  TripRequirementSourcingOperation,
  TripReservationPlan,
  TripReservationPlanCompensationSnapshot,
  TripReservationPlanComponentSnapshot,
  TripReservationPlanFailureSnapshot,
  TripSnapshot,
  TripSnapshotProposal,
  TripSnapshotProposalLine,
} from "./schema.js"
export {
  tripCandidateStatusEnum,
  tripCandidates,
  tripComponentEvents,
  tripComponentEventTypeEnum,
  tripComponentKindEnum,
  tripComponentStatusEnum,
  tripComponents,
  tripEnvelopeStatusEnum,
  tripEnvelopes,
  tripRequirementSourcingOperationStatusEnum,
  tripRequirementSourcingOperations,
  tripRequirementStatusEnum,
  tripRequirements,
  tripReservationPlanStatusEnum,
  tripReservationPlans,
  tripSnapshots,
} from "./schema.js"
export {
  type AddRequirementInput,
  addRequirement,
  aggregateComponentPricing,
  applyQuoteToComponent,
  assertCandidateSelectable,
  assertEnvelopeRequirementsSatisfied,
  assertRequiredRequirementsResolved,
  assertTripComponentCanBeReserved,
  assertTripComponentCanBeUpdated,
  assertTripComponentCanReceiveRefs,
  assertTripComponentCanStartCheckout,
  availabilityCandidateToRow,
  buildTripSnapshotProposal,
  type CancelComponentInput,
  type CancelComponentResult,
  type CancelTripComponentsDeps,
  type CancelTripComponentsResult,
  type CatalogComponentQuoteInput,
  type CheckoutHandoffKind,
  type CompleteTripCheckoutInput,
  type CompleteTripCheckoutResult,
  type ComponentCancellationAction,
  type ComponentCancellationPreview,
  type ComponentCancellationPreviewInput,
  type ComponentCheckoutInput,
  type ComponentCheckoutResult,
  checkoutResultToComponentPatch,
  completeTripCheckout,
  expireStaleTripCandidates,
  freezeTripSnapshot,
  getTripSnapshotById,
  hasCommittedComponentReference,
  isTripCandidateExpired,
  listEnvelopeRequirements,
  listTripSnapshots,
  type PreviewTripCancellationDeps,
  type PriceTripDeps,
  type PriceTripResult,
  pinnedComponentValuesFromCandidate,
  pricingSnapshotFromBreakdown,
  type ReleaseReservedComponentInput,
  type ReleaseReservedComponentResult,
  type ReserveComponentInput,
  type ReserveComponentPreflightResult,
  type ReserveComponentPreflightStatus,
  type ReserveComponentResult,
  type ReserveTripDeps,
  type ReserveTripResult,
  reserveResultToComponentPatch,
  type SelectCandidateInput,
  type SourceRequirementCandidatesDeps,
  type SourceRequirementCandidatesInput,
  type StartCheckoutDeps,
  type StartCheckoutResult,
  type StartCheckoutTarget,
  type StartedTripComponentCheckout,
  type SubmitTripReservationPlanComponent,
  type SubmitTripReservationPlanInput,
  type SubmitTripReservationPlanResult,
  selectCandidate,
  shouldReplayCheckout,
  shouldReplayReserve,
  type Trip,
  type TripCancellationPreviewResult,
  type TripCheckoutInput,
  type TripCheckoutResult,
  type TripListResult,
  type TripReservationPlanComponentKind,
  TripsInvariantError,
  taxLinesFromBreakdown,
  tripsService,
} from "./service.js"
export {
  type DrainTripRequirementSourcingOptions,
  type DrainTripRequirementSourcingResult,
  drainTripRequirementSourcing,
  executeDurableTripRequirementSourcingCommand,
  getTripRequirementSourcingOperation,
  type SourceTripCandidatesAcceptedResult,
  TRIP_REQUIREMENT_SOURCING_STATUS_TOOL,
  type TripRequirementSourcingOperationView,
  type TripRequirementSourcingOutcome,
} from "./service-durable-sourcing.js"
export {
  type TripsSourcingJobRuntime,
  tripsSourcingJobRuntimePort,
} from "./sourcing-job-runtime-port.js"
export {
  type CreateTripArgs,
  type CreateTripResult,
  createTripTool,
  type PriceTripArgs,
  priceTripTool,
  type ReserveTripArgs,
  type ReviseTripArgs,
  type ReviseTripResult,
  reserveTripTool,
  reviseTripTool,
  type TripsToolContext,
  type TripsToolServices,
  tripsTools,
} from "./tools.js"
export {
  assertTripTravelerPartyComplete,
  validateTripTravelerParty,
} from "./traveler-party-validation.js"
export {
  type AddRequirementBody,
  addRequirementSchema,
  availabilitySearchScopeSchema,
  type CancelTripComponentsInput,
  type CreateTripComponentBodyInput,
  type CreateTripComponentInput,
  type CreateTripEnvelopeInput,
  type CreateTripSnapshotInput,
  cancelTripComponentsSchema,
  catalogComponentReferenceSchema,
  committedComponentReferenceSchema,
  createTripComponentBodySchema,
  createTripComponentSchema,
  createTripEnvelopeSchema,
  createTripSnapshotSchema,
  type GetRequirementSourcingOperationInput,
  getRequirementSourcingOperationSchema,
  isAllowedTripComponentStatusTransition,
  isTerminalTripComponentStatus,
  type ListTripsQuery,
  listTripsQuerySchema,
  type PreviewTripCancellationInput,
  type PriceTripInput,
  previewTripCancellationSchema,
  priceTripSchema,
  type ReserveTripInput,
  reorderTripComponentsSchema,
  reserveTripSchema,
  type SelectCandidateBody,
  type SourceRequirementCandidatesBody,
  type StartTripCheckoutInput,
  selectCandidateSchema,
  sourceRequirementCandidatesSchema,
  startTripCheckoutSchema,
  type TripComponentEventType,
  type TripComponentKind,
  type TripComponentStatus,
  type TripEnvelopeStatus,
  type TripsHealthCheck,
  type TripsListSortDir,
  type TripsListSortField,
  type TripsStatus,
  tripComponentEventTypeSchema,
  tripComponentKindSchema,
  tripComponentPricingSnapshotSchema,
  tripComponentStatusSchema,
  tripComponentStatusTransitionSchema,
  tripComponentTaxLineSchema,
  tripEnvelopePricingSnapshotSchema,
  tripEnvelopeStatusSchema,
  tripSnapshotProposalLineSchema,
  tripSnapshotProposalSchema,
  tripsHealthCheckSchema,
  tripsListSortDirSchema,
  tripsListSortFieldSchema,
  tripsStatusSchema,
  type UpdateTripComponentInput,
  updateTripComponentRefsSchema,
  updateTripComponentSchema,
  updateTripEnvelopeSchema,
} from "./validation.js"
