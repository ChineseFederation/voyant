/**
 * `@voyant-travel/catalog-react/booking-engine` — the client for the v1
 * Booking Session lifecycle.
 *
 * This replaces the beta hook family, which spoke three routes that no longer
 * exist: `GET/PUT/DELETE /catalog/drafts/:id`, `POST /catalog/holds/{place,
 * release}` and `POST /catalog/quote`. A draft is now a Session's selection, a
 * hold is a Session Hold against a Quote, and a live price on a page that has
 * not started booking is an Offer Preview.
 *
 * Hooks:
 *   - `useOfferPreview`        — stateless, non-binding price + requirements
 *   - `useBookingSession`      — create / resume / PATCH the selection
 *   - `useBookingQuote`        — price the current Session revision
 *   - `useBookingHold`         — hold real capacity against a Quote
 *   - `useCommitBookingSession`       — commit the Quote (+ Hold) into a Booking
 *   - `useBookingRequirements` — the descriptor accessor with a fallback
 *
 * They share `useBookingJourneyApi()`, which derives the API base from the
 * surrounding `VoyantCatalogProvider` and lets callers pick the surface
 * (`/v1/admin` vs `/v1/public`). Identical surface for operator and
 * storefront — Phase B's "build once, ship everywhere" rule.
 *
 * Two rules run through all of it:
 *
 *   1. **Lifecycle outcomes are returned, not thrown.** Every route answers
 *      one discriminated `bookingSessionOutcomeV1`. Callers branch on it;
 *      nothing here flattens `selection_incomplete` — with its machine-readable
 *      `unsatisfied[]` — into an error string a host cannot render.
 *   2. **Idempotency keys are derived, never random.** One user action means
 *      one key across every retry of it. A fresh key per attempt is a second
 *      Session, a second Quote, or a second booking.
 */

export {
  abandonBookingSession,
  adoptBookingSession,
  type BookingSessionApi,
  bookingSelectionDigest,
  bookingSessionIdempotencyKey,
  commitBookingSession,
  holdBookingSession,
  openBookingSession,
  patchBookingSessionSelection,
  previewBookingOffer,
  quoteBookingSession,
  renewBookingSession,
  resumeBookingSession,
} from "./session-client.js"
export {
  type BookingSessionJourneyContinuation,
  type BookingSessionJourneyInput,
  type BookingSessionJourneyResult,
  commitBookingSessionJourneyV1,
} from "./session-journey.js"
export {
  BookingSessionJourneyError,
  type BookingSessionOutcomeKind,
  type BookingSessionOutcomeOf,
  type BookingSessionRecoveryV1,
  bookingSessionOf,
  bookingSessionOutcomeOf,
  bookingSessionRecoveryV1,
  bookingSessionRejection,
  expectBookingSessionOutcome,
  unsatisfiedBookingRequirements,
} from "./session-outcomes.js"
export {
  type PlaceBookingHoldInput,
  type UseBookingHold,
  type UseBookingHoldOptions,
  useBookingHold,
} from "./use-booking-hold.js"
export {
  BOOKING_SESSION_CAPABILITY_HEADER,
  type BookingJourneyApiConfig,
  type BookingJourneyApiOptions,
  type BookingJourneyMethod,
  createBookingJourneyApi,
  type UseBookingJourneyApi,
  useBookingJourneyApi,
} from "./use-booking-journey-api.js"
export {
  type UseBookingQuote,
  type UseBookingQuoteOptions,
  useBookingQuote,
} from "./use-booking-quote.js"
export {
  type UseBookingRequirementsOptions,
  useBookingRequirements,
} from "./use-booking-requirements.js"
export {
  type UseBookingSession,
  type UseBookingSessionOptions,
  useBookingSession,
} from "./use-booking-session.js"
export {
  type BookingCommitInput,
  type UseCommitBookingSession,
  type UseCommitBookingSessionOptions,
  useCommitBookingSession,
} from "./use-commit-booking-session.js"
export {
  OfferPreviewRejectedError,
  type OfferPreviewScope,
  type UseOfferPreviewOptions,
  type UseOfferPreviewResult,
  useOfferPreview,
} from "./use-offer-preview.js"
