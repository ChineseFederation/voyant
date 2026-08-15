import { pgEnum } from "drizzle-orm/pg-core"

export const bookingStatusEnum = pgEnum("booking_status", [
  "confirmed",
  "in_progress",
  "completed",
  "cancelled",
])

export const supplierConfirmationStatusEnum = pgEnum("supplier_confirmation_status", [
  "pending",
  "confirmed",
  "rejected",
  "cancelled",
])

export const bookingActivityTypeEnum = pgEnum("booking_activity_type", [
  "booking_created",
  "booking_reserved",
  "booking_converted",
  "booking_confirmed",
  "booking_started",
  "booking_completed",
  "hold_extended",
  "hold_expired",
  "status_change",
  "status_overridden",
  "item_update",
  "allocation_released",
  "fulfillment_issued",
  "fulfillment_updated",
  "redemption_recorded",
  "supplier_update",
  "traveler_update",
  "note_added",
  // System-issued activity rows (e.g. payment-schedule
  // regeneration). Distinct from `note_added` so the UI can filter
  // operator-authored notes from automated audit entries.
  "system_action",
])

/**
 * What a Booking Document is a copy of. Traveller paperwork (`visa`,
 * `insurance`, `health`, `passport_copy`) was the original set; `contract`,
 * `invoice`, `proforma`, and `credit_note` record commercial paperwork that was
 * ISSUED ELSEWHERE — by the operator's accounting system, a predecessor
 * platform, or on paper (voyant#4657). Those four words are the ones the
 * customer portal's unified document view already uses, so a recorded document
 * reaches the customer under the same name as a Voyant-issued one.
 *
 * A row of one of those four kinds is a record, never an issuance: it
 * allocates nothing from `invoice_number_series` or a legal contract series,
 * renders nothing from a template, and creates neither an `invoices` nor a
 * `contracts` row. The document's own identity travels with it in the
 * `issued_*` columns on `booking_documents`.
 */
export const bookingDocumentTypeEnum = pgEnum("booking_document_type", [
  "visa",
  "insurance",
  "health",
  "passport_copy",
  "contract",
  "invoice",
  "proforma",
  "credit_note",
  "other",
])

export const bookingSourceTypeEnum = pgEnum("booking_source_type", [
  "direct",
  "manual",
  "affiliate",
  "ota",
  "reseller",
  "api_partner",
  "internal",
])

export const bookingParticipantTypeEnum = pgEnum("booking_participant_type", [
  "traveler",
  "occupant",
  "other",
])

export const bookingTravelerCategoryEnum = pgEnum("booking_traveler_category", [
  "adult",
  "child",
  "infant",
  "senior",
  "other",
])

export const bookingItemTypeEnum = pgEnum("booking_item_type", [
  "unit",
  "extra",
  "service",
  "fee",
  "tax",
  "discount",
  "adjustment",
  "accommodation",
  "transport",
  "other",
])

export const bookingItemStatusEnum = pgEnum("booking_item_status", [
  "confirmed",
  "cancelled",
  "fulfilled",
])

export const bookingAllocationTypeEnum = pgEnum("booking_allocation_type", [
  "unit",
  "pickup",
  "resource",
])

export const bookingAllocationStatusEnum = pgEnum("booking_allocation_status", [
  "held",
  "confirmed",
  "released",
  "expired",
  "cancelled",
  "fulfilled",
])

export const bookingFulfillmentTypeEnum = pgEnum("booking_fulfillment_type", [
  "service_voucher",
  "ticket",
  "pdf",
  "qr_code",
  "barcode",
  "mobile",
  "other",
])

export const bookingFulfillmentDeliveryChannelEnum = pgEnum(
  "booking_fulfillment_delivery_channel",
  ["download", "email", "api", "wallet", "other"],
)

export const bookingFulfillmentStatusEnum = pgEnum("booking_fulfillment_status", [
  "pending",
  "issued",
  "reissued",
  "revoked",
  "failed",
])

export const bookingRedemptionMethodEnum = pgEnum("booking_redemption_method", [
  "manual",
  "scan",
  "api",
  "other",
])

export const bookingItemParticipantRoleEnum = pgEnum("booking_item_participant_role", [
  "traveler",
  "occupant",
  "beneficiary",
  "other",
])

export const bookingStaffAssignmentRoleEnum = pgEnum("booking_staff_assignment_role", [
  "service_assignee",
  "other",
])

export const bookingPiiAccessActionEnum = pgEnum("booking_pii_access_action", [
  "read",
  "update",
  "delete",
])

export const bookingPiiAccessOutcomeEnum = pgEnum("booking_pii_access_outcome", [
  "allowed",
  "denied",
])
