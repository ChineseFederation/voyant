/**
 * The product-analytics event catalogue.
 *
 * One declared taxonomy for every surface this repository owns. It lives here,
 * next to the port, rather than in the packages that emit — because the whole
 * point of a taxonomy is that it is *one* list. Split across `catalog`,
 * `admin-react` and `storefront-react` it would be three lists that drift, and
 * the conformance checker would have nothing single to compare a document to.
 *
 * `verify:analytics-conformance` reads this file and asserts three things:
 *
 *   1. `docs/architecture/analytics-events.md` documents exactly these events
 *      with exactly these properties,
 *   2. every event named here is emitted by some tracked source file, and
 *   3. no `track()` call anywhere emits a name that is absent from here.
 *
 * Adding an event therefore means: a line here, a line in the doc, and a call
 * site. Deleting one means removing all three. Neither can be done by halves.
 *
 * ## What may go in a property
 *
 * Identifiers and enumerations. Never a traveller name, an email address, a
 * postal address, a document number, or free text the buyer typed. `field`
 * carries a *requirement key* (`traveler.0.passportNumber`), never the value
 * entered against it — see `docs/architecture/booking-pii.md`.
 */

/** A property name an event is declared to carry. */
export type AnalyticsEventProperty = string

/**
 * Event name → the properties it carries.
 *
 * Deliberately a plain frozen object literal of string-literal arrays: the
 * conformance checker reads it from the TypeScript AST rather than importing
 * it, so the catalogue stays legible to a checker that must not load this
 * package's runtime.
 */
export const ANALYTICS_EVENT_CATALOGUE = {
  // --- Booking engine, server ------------------------------------------
  "engine.offer.previewed": ["target_id", "target_type", "priced", "available"],
  "engine.session.created": ["booking_session_id", "scope", "market", "channel"],
  "engine.quote.requested": ["booking_session_id"],
  "engine.quote.succeeded": ["booking_session_id", "duration_ms", "total", "currency"],
  "engine.quote.failed": ["booking_session_id", "failure_reason"],
  "engine.quote.expired": ["booking_session_id", "seconds_since_issue"],
  "engine.hold.requested": ["booking_session_id"],
  "engine.hold.succeeded": ["booking_session_id", "duration_ms"],
  "engine.hold.failed": ["booking_session_id", "failure_reason"],
  "engine.commit.attempted": ["booking_session_id"],
  "engine.commit.succeeded": ["booking_session_id", "booking_id", "duration_ms"],
  "engine.commit.failed": ["booking_session_id", "failure_reason", "missing_requirements"],
  "engine.session.abandoned": ["booking_session_id", "last_step", "age_seconds"],

  // --- Booking engine, client ------------------------------------------
  "engine.journey.started": ["entry_referrer", "channel", "target_type"],
  "engine.step.viewed": ["booking_session_id", "step", "step_index", "requirement_count"],
  "engine.step.completed": ["booking_session_id", "step", "duration_ms", "retries"],
  "engine.field.errored": ["booking_session_id", "step", "field", "error_code"],

  // --- Admin ------------------------------------------------------------
  "admin.nav.viewed": ["route", "module"],
  "admin.resource.created": ["resource_type"],
  "admin.resource.updated": ["resource_type"],
  "admin.resource.deleted": ["resource_type"],
  "admin.action.failed": ["action", "error_code"],
  "admin.search.performed": ["result_count"],
  "admin.extension.opened": ["extension_id"],

  // --- Customer portal --------------------------------------------------
  //
  // `portal.payment.made` and `portal.support.contacted` are deliberately
  // absent: the customer portal serves profile, companions, documents and
  // bookings, and has neither a payment leg nor a support-contact leg to emit
  // them from. Declaring an event with no emitter would fail rule (2) above,
  // and stubbing an emitter to satisfy it would be worse. They belong here the
  // day those surfaces exist.
  "portal.session.started": ["booking_count"],
  "portal.booking.viewed": ["booking_id"],
  "portal.document.downloaded": ["document_type"],
} as const

/** Every declared event name. */
export type AnalyticsEventName = keyof typeof ANALYTICS_EVENT_CATALOGUE

/** The property names an event is declared to carry. */
export type AnalyticsEventProperties<TEvent extends AnalyticsEventName> =
  (typeof ANALYTICS_EVENT_CATALOGUE)[TEvent][number]

export const ANALYTICS_EVENT_NAMES = Object.keys(
  ANALYTICS_EVENT_CATALOGUE,
) as readonly AnalyticsEventName[]

/**
 * The closed enumeration `failure_reason` draws from.
 *
 * This is the single most valuable property in the whole effort, and it is
 * only worth anything if it is an enumeration: a message string turns
 * "conversion dropped" into a text search, whereas a stable value turns it
 * into a breakdown. Every member is a lifecycle outcome the Booking Session
 * contract already publishes — nothing is invented here.
 *
 * `packages/catalog/tests/unit/booking-analytics-reasons.test.ts` asserts this
 * list is exactly the set of failure outcomes
 * `@voyant-travel/catalog-contracts` can produce, so a new rejection kind in
 * the contract fails there rather than silently arriving as an unmapped value.
 */
export const ANALYTICS_FAILURE_REASONS = [
  // Session-level rejections.
  "revision_conflict",
  "session_expired",
  "session_consumed",
  "capability_required",
  "capability_scope_required",
  "not_authorized",
  "idempotency_conflict",
  "supplier_operation_active",
  "selection_incomplete",
  "requirements_changed",
  "quote_required",
  "quote_expired",
  "quote_superseded",
  "hold_required",
  "hold_expired",
  "availability_changed",
  "hold_quantity_mismatch",
  "commit_already_consumed",
  // Where a rejection carries a nested `reason`, that reason *is* the failure
  // reason: the wrapping kind says only "it did not work". The nested
  // vocabularies do not collide with each other or with the kinds above, so
  // the enumeration stays flat and a breakdown needs no second dimension.
  //
  // `quote_unavailable`:
  "target_not_found",
  "target_not_bookable",
  "price_unavailable",
  "policy_unavailable",
  "selection_unavailable",
  // `commit_rejected`:
  "entity_not_found",
  "entity_not_bookable",
  "incomplete_draft",
  "price_changed",
  // `invalid_selection`:
  "unsupported_target",
  "forbidden_field",
  // `renewal_not_allowed`:
  "session_not_active",
  "extension_too_large",
  "absolute_lifetime_exceeded",
  // Commit outcomes that are terminal failures rather than rejections.
  "supplier_failed",
  "revision_mismatch",
  "quote_failure",
  "hold_failure",
  "proposal_acceptance_required",
  // The catch-all. Present so an unmapped outcome is visibly unmapped in the
  // breakdown instead of being dropped, which would understate the failure.
  "unknown",
] as const

export type AnalyticsFailureReason = (typeof ANALYTICS_FAILURE_REASONS)[number]

const FAILURE_REASONS: ReadonlySet<string> = new Set(ANALYTICS_FAILURE_REASONS)

/** Narrow an arbitrary lifecycle string to the declared enumeration. */
export function analyticsFailureReason(value: string | undefined): AnalyticsFailureReason {
  return value !== undefined && FAILURE_REASONS.has(value)
    ? (value as AnalyticsFailureReason)
    : "unknown"
}
