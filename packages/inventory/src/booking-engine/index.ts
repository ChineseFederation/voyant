/**
 * `@voyant-travel/inventory/booking-engine` — owned-arm booking handler
 * for the Product vertical.
 *
 * Per `docs/architecture/booking-journey-architecture.md` §6.
 */

export {
  type AvailabilityHoldBridge,
  buildOwnedProductDraftShape,
  type CreateProductsBookingHandlerOptions,
  createProductsBookingHandler,
} from "./handler.js"
