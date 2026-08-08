import { getTripRequirementSourcingOperation } from "./service-durable-sourcing.js"
import type { TripsStatus } from "./validation.js"

export { cancelComponents, previewCancellation } from "./service-cancellation.js"
export { completeTripCheckout, startCheckout } from "./service-checkout.js"
export {
  drainTripActionOperations,
  executeDurableTripActionCommand,
  getTripActionOperation,
  type TripActionAcceptedResult,
  type TripActionOperationView,
  type TripActionOutcome,
} from "./service-durable-actions.js"
export {
  getTripRequirementSourcingOperation,
  type TripRequirementSourcingOperationView,
  type TripRequirementSourcingOutcome,
} from "./service-durable-sourcing.js"
export {
  aggregateComponentPricing,
  assertTripComponentCanBeReserved,
  assertTripComponentCanBeUpdated,
  assertTripComponentCanReceiveRefs,
  assertTripComponentCanStartCheckout,
  checkoutResultToComponentPatch,
  hasCommittedComponentReference,
  pricingSnapshotFromBreakdown,
  reserveResultToComponentPatch,
  shouldReplayCheckout,
  shouldReplayReserve,
  taxLinesFromBreakdown,
} from "./service-helpers.js"
export { applyQuoteToComponent, priceTrip } from "./service-pricing.js"
export {
  type AddRequirementInput,
  addRequirement,
  assertCandidateSelectable,
  assertEnvelopeRequirementsSatisfied,
  assertRequiredRequirementsResolved,
  availabilityCandidateToRow,
  expireStaleTripCandidates,
  getSelectedCandidateResult,
  isTripCandidateExpired,
  listEnvelopeRequirements,
  pinnedComponentValuesFromCandidate,
  type SelectCandidateInput,
  type SourceRequirementCandidatesDeps,
  type SourceRequirementCandidatesInput,
  selectCandidate,
} from "./service-requirements.js"
export { reserveTrip } from "./service-reservation.js"
export {
  buildTripSnapshotProposal,
  freezeTripSnapshot,
  getTripSnapshotById,
  listTripSnapshots,
} from "./service-snapshots.js"
export {
  addComponent,
  createTrip,
  getTrip,
  listTrips,
  removeComponent,
  reorderComponents,
  updateComponent,
  updateComponentRefs,
  updateTrip,
} from "./service-trips.js"
export type {
  CancelComponentInput,
  CancelComponentResult,
  CancelTripComponentsDeps,
  CancelTripComponentsResult,
  CatalogComponentQuoteInput,
  CheckoutHandoffKind,
  CompleteTripCheckoutInput,
  CompleteTripCheckoutResult,
  ComponentCancellationAction,
  ComponentCancellationPreview,
  ComponentCancellationPreviewInput,
  ComponentCheckoutInput,
  ComponentCheckoutResult,
  PreviewTripCancellationDeps,
  PriceTripDeps,
  PriceTripResult,
  ReleaseReservedComponentInput,
  ReleaseReservedComponentResult,
  ReserveComponentInput,
  ReserveComponentPreflightResult,
  ReserveComponentPreflightStatus,
  ReserveComponentResult,
  ReserveTripDeps,
  ReserveTripResult,
  StartCheckoutDeps,
  StartCheckoutResult,
  StartCheckoutTarget,
  StartedTripComponentCheckout,
  SubmitTripReservationPlanComponent,
  SubmitTripReservationPlanInput,
  SubmitTripReservationPlanResult,
  Trip,
  TripCancellationPreviewResult,
  TripCheckoutInput,
  TripCheckoutResult,
  TripListResult,
  TripReservationPlanComponentKind,
} from "./service-types.js"
export { TripsInvariantError } from "./service-types.js"

import { cancelComponents, previewCancellation } from "./service-cancellation.js"
import { completeTripCheckout, startCheckout } from "./service-checkout.js"
import { priceTrip } from "./service-pricing.js"
import {
  addRequirement,
  expireStaleTripCandidates,
  getSelectedCandidateResult,
  listEnvelopeRequirements,
  selectCandidate,
} from "./service-requirements.js"
import { reserveTrip } from "./service-reservation.js"
import { freezeTripSnapshot, getTripSnapshotById, listTripSnapshots } from "./service-snapshots.js"
import {
  addComponent,
  createTrip,
  getTrip,
  listTrips,
  removeComponent,
  reorderComponents,
  updateComponent,
  updateComponentRefs,
  updateTrip,
} from "./service-trips.js"

export const tripsService = {
  getStatus(): TripsStatus {
    return {
      module: "trips",
      status: "scaffolded",
    }
  },
  createTrip,
  getTrip,
  listTrips,
  updateTrip,
  addComponent,
  updateComponent,
  updateComponentRefs,
  removeComponent,
  reorderComponents,
  priceTrip,
  reserveTrip,
  freezeTripSnapshot,
  getTripSnapshotById,
  listTripSnapshots,
  startCheckout,
  completeTripCheckout,
  previewCancellation,
  cancelComponents,
  addRequirement,
  listEnvelopeRequirements,
  getTripRequirementSourcingOperation,
  selectCandidate,
  getSelectedCandidateResult,
  expireStaleTripCandidates,
}
