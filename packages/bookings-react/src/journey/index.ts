/** Shared booking-draft primitives retained for trip composition. */
export {
  type ContractAcceptance,
  ContractPreviewDialog,
  type ContractPreviewDialogProps,
} from "./components/contract-preview-dialog.js"
export {
  AccommodationStep,
  AddonsStep,
  BillingStep,
  DepartureStep,
  OptionsStep,
  PaymentStep,
  ReviewStep,
  TravelersStep,
} from "./components/journey-steps.js"
export { PriceSidePanel } from "./components/side-panel.js"
export { StepHeader } from "./components/step-header.js"
export {
  type Draft,
  emptyDraft,
  patchBilling,
  patchConfigure,
  patchPaxCount,
  setAccommodation,
  setAddons,
  setPayment,
  setTravelers,
  totalPax,
} from "./lib/draft-state.js"
export {
  anchorForRequirementKey,
  bookingFieldMessages,
  configureSubStepMessages,
  type DescribedUnsatisfiedRequirement,
  describeUnsatisfiedRequirement,
  describeUnsatisfiedRequirements,
  groupUnsatisfiedRequirements,
  paxBandMessages,
  stepForUnsatisfiedAnchor,
  stepLevelUnsatisfiedMessages,
  travelerFieldMessages,
  type UnsatisfiedRequirementAnchor,
} from "./lib/unsatisfied-requirements.js"
export {
  type BillingExtrasContext,
  type BookingEntitySummary,
  type DeparturePickerProps,
  JOURNEY_STEP_ORDER,
  type JourneyHeaderState,
  type JourneyOptionSelection,
  type JourneyStep,
  type JourneySurface,
  type LeadContactPickerProps,
  type PaymentProviderCapabilities,
  type PaymentProviderStepRenderProps,
  type SidePanelState,
  type TravelCreditPickerProps,
  type TravelerContactPickerProps,
  type UnitsPickerProps,
} from "./types.js"
