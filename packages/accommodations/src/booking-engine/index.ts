/**
 * `@voyant-travel/accommodations/booking-engine` — owned-arm booking +
 * availability-search handlers for the accommodation vertical.
 *
 * Per `docs/architecture/booking-journey-architecture.md` §6.
 */

export {
  type AccommodationContentLoader,
  type CreateAccommodationBookingHandlerOptions,
  createAccommodationBookingHandler,
} from "./handler.js"
export {
  type AccommodationSearchBridge,
  type AccommodationSearchBridgeInput,
  type AccommodationSearchCriteria,
  type AccommodationSearchMatch,
  type AccommodationSearchOccupancy,
  type CreateAccommodationSearchHandlerOptions,
  createAccommodationOwnedSearchHandler,
  nightsBetween,
} from "./search-handler.js"
