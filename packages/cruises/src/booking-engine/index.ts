/**
 * `@voyant-travel/cruises/booking-engine` — owned-arm booking handler
 * for the cruises vertical (Phase F skeleton).
 *
 * Per `docs/architecture/booking-journey-architecture.md` §6 + §10
 * Phase F.
 */

export {
  type CreateCruiseBookingHandlerOptions,
  type CruiseHandlerLoaders,
  createCruiseBookingHandler,
  type ResolvedCruisePrice,
} from "./handler.js"
