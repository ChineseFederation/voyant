/**
 * Pure synthesis helpers for the demo flight service. The implementation is
 * split by booking-engine surface so offers, orders, ancillaries, and seat maps
 * can evolve independently while preserving the public module exports.
 */

export { synthesizeAncillaryCatalog } from "./synthesis-ancillaries.js"
export { synthesizeFareCalendar } from "./synthesis-fare-calendar.js"
export { applySearchFilters, parsePageCursor, synthesizeOffers } from "./synthesis-offers.js"
export { synthesizeOrder, ticketHeldOrder } from "./synthesis-orders.js"
export { findSegmentInOffer, synthesizeSeatMap } from "./synthesis-seat-maps.js"
