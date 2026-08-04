/**
 * `@voyant-travel/catalog-react/booking-engine` — React Query hooks
 * driving the unified booking journey shell.
 *
 * Per `docs/architecture/booking-journey-architecture.md` §8.1.
 *
 * Hooks:
 *   - `useOfferPreview`        — debounced, non-binding price probe for a
 *                                storefront detail page. Opens no Booking
 *                                Session; see `use-offer-preview.ts`.
 *   - `useBookingDraft`        — local draft state with server sync
 *   - `useBookingQuote`        — debounced live quote on draft change
 *   - `useBookingRequirements` — convenience accessor on the latest quote
 *
 * The hooks share a `useBookingJourneyApi()` accessor that derives
 * the API base from the surrounding `VoyantCatalogProvider` and
 * lets callers override the surface (`/v1/admin` vs `/v1/public`).
 *
 * Identical surface for operator and storefront — Phase B's "build
 * once, ship everywhere" rule (§ Rule 4).
 */

export {
  type UseBookingDraftOptions,
  useBookingDraft,
} from "./use-booking-draft.js"
export {
  type PlaceHoldInput,
  type ReleaseHoldInput,
  useBookingHold,
} from "./use-booking-hold.js"
export {
  type BookingJourneyApiOptions,
  type UseBookingJourneyApi,
  useBookingJourneyApi,
} from "./use-booking-journey-api.js"
export {
  type UseBookingQuoteOptions,
  useBookingQuote,
} from "./use-booking-quote.js"
export {
  type UseBookingRequirementsOptions,
  useBookingRequirements,
} from "./use-booking-requirements.js"
export {
  OfferPreviewRejectedError,
  type OfferPreviewScope,
  type UseOfferPreviewOptions,
  type UseOfferPreviewResult,
  useOfferPreview,
} from "./use-offer-preview.js"
