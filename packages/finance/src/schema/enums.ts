import { pgEnum } from "drizzle-orm/pg-core"

export const invoiceStatusEnum = pgEnum("invoice_status", [
  "draft",
  "pending_external_allocation",
  "issued",
  "partially_paid",
  "paid",
  "overdue",
  "void",
])

export const paymentMethodEnum = pgEnum("payment_method", [
  "bank_transfer",
  "credit_card",
  "debit_card",
  "cash",
  "cheque",
  "wallet",
  "direct_bill",
  "travel_credit",
  "other",
])

export const paymentStatusEnum = pgEnum("payment_status", [
  "pending",
  "completed",
  "failed",
  "refunded",
])

export const paymentSessionStatusEnum = pgEnum("payment_session_status", [
  "pending",
  "requires_redirect",
  "processing",
  "authorized",
  "paid",
  "failed",
  "cancelled",
  "expired",
])

/**
 * Lifecycle of a contested card payment — a chargeback.
 *
 * Unrelated to `supplier_invoice_status.disputed`, which is an accounts-payable
 * state for a bill the operator is contesting. This one runs the other way: a
 * traveller contests a payment the operator received.
 *
 * `won`, `lost` and `withdrawn` are terminal and each names a resolution;
 * `resolved_at` records when the record reached one. Nothing here names a
 * processor — an adapter maps its own stage vocabulary onto these five.
 */
export const paymentDisputeStatusEnum = pgEnum("payment_dispute_status", [
  "opened",
  "under_review",
  "won",
  "lost",
  "withdrawn",
])

/**
 * How the customer actually got their money back (voyant#4303).
 *
 * A credit note records that a refund is *owed*. This names the leg that pays
 * it, and most of the values are not a card — refunding a bank transfer by bank
 * transfer, handing cash across a counter, or netting the amount off what a
 * trade account owes has nothing to do with any processor.
 *
 * `travel_credit` and `voucher` are deliberately separate values rather than one
 * value with a flag. A travel credit is bound to the person who was refunded; a
 * voucher is transferable, carries its own expiry, and is frequently worth more
 * than the cash it replaces (110% in credit to avoid paying out 100%). They are
 * different instruments in operator usage, and a single value would have made
 * "can I give this to my sister?" a support question rather than a field.
 *
 * `counterparty_offset` is the B2B case: refunding a reseller is usually not a
 * payment at all but a credit against what they owe on other bookings. The
 * balance it offsets belongs to a counterparty, not to one booking.
 */
export const refundSettlementMethodEnum = pgEnum("refund_settlement_method", [
  "processor_reversal",
  "bank_transfer",
  "cash",
  "cheque",
  "travel_credit",
  "voucher",
  "counterparty_offset",
  "other",
])

/**
 * Whether the money has actually moved.
 *
 * Distinct from the credit note's status on purpose: the accounting document is
 * issued once, but the money leg can be owed for days (a bank transfer), can
 * resolve asynchronously (a processor reversal), and can fail after the
 * processor accepted it.
 *
 * `pending` still holds its amount against the payment — see
 * `holdsRefundedFunds` in `refund-settlement-lifecycle.ts`. Only `failed`
 * returns the amount to the refundable remainder, because a retry after an
 * indeterminate outcome is the one error here that cannot be undone by trying
 * again.
 */
export const refundSettlementStatusEnum = pgEnum("refund_settlement_status", [
  "pending",
  "settled",
  "failed",
])

export const paymentSessionTargetTypeEnum = pgEnum("payment_session_target_type", [
  "booking_session",
  "booking",
  "order",
  "invoice",
  "booking_payment_schedule",
  "booking_guarantee",
  "flight_order",
  "other",
])

export const paymentInstrumentTypeEnum = pgEnum("payment_instrument_type", [
  "credit_card",
  "debit_card",
  "bank_account",
  "wallet",
  "travel_credit",
  "direct_bill",
  "cash",
  "other",
])

export const paymentInstrumentOwnerTypeEnum = pgEnum("payment_instrument_owner_type", [
  "client",
  "supplier",
  "channel",
  "agency",
  "internal",
  "other",
])

export const paymentInstrumentStatusEnum = pgEnum("payment_instrument_status", [
  "active",
  "inactive",
  "expired",
  "revoked",
  "failed_verification",
])

export const paymentAuthorizationStatusEnum = pgEnum("payment_authorization_status", [
  "pending",
  "authorized",
  "partially_captured",
  "captured",
  "voided",
  "failed",
  "expired",
])

export const paymentCaptureStatusEnum = pgEnum("payment_capture_status", [
  "pending",
  "completed",
  "failed",
  "refunded",
  "voided",
])

export const captureModeEnum = pgEnum("capture_mode", ["automatic", "manual"])

export const creditNoteStatusEnum = pgEnum("credit_note_status", ["draft", "issued", "applied"])

export const paymentScheduleTypeEnum = pgEnum("payment_schedule_type", [
  "deposit",
  "installment",
  "balance",
  "hold",
  "other",
])

export const paymentScheduleStatusEnum = pgEnum("payment_schedule_status", [
  "pending",
  "due",
  "paid",
  "waived",
  "cancelled",
  "expired",
])

export const guaranteeTypeEnum = pgEnum("guarantee_type", [
  "deposit",
  "credit_card",
  "preauth",
  "card_on_file",
  "bank_transfer",
  "voucher",
  "agency_letter",
  "other",
])

export const guaranteeStatusEnum = pgEnum("guarantee_status", [
  "pending",
  "active",
  "released",
  "failed",
  "cancelled",
  "expired",
])

export const taxScopeEnum = pgEnum("tax_scope", ["included", "excluded", "withheld"])

export const commissionRecipientTypeEnum = pgEnum("commission_recipient_type", [
  "channel",
  "affiliate",
  "agency",
  "agent",
  "internal",
  "supplier",
  "other",
])

export const commissionModelEnum = pgEnum("commission_model", [
  "percentage",
  "fixed",
  "markup",
  "net",
])

export const commissionStatusEnum = pgEnum("commission_status", [
  "pending",
  "accrued",
  "payable",
  "paid",
  "void",
])

export const invoiceTypeEnum = pgEnum("invoice_type", ["invoice", "proforma", "credit_note"])

export const invoiceNumberResetStrategyEnum = pgEnum("invoice_number_reset_strategy", [
  "never",
  "annual",
  "monthly",
])

export const invoiceNumberSeriesScopeEnum = pgEnum("invoice_number_series_scope", [
  "invoice",
  "proforma",
  "credit_note",
])

export const invoiceRenditionFormatEnum = pgEnum("invoice_rendition_format", [
  "html",
  "pdf",
  "xml",
  "json",
])

export const invoiceRenditionStatusEnum = pgEnum("invoice_rendition_status", [
  "pending",
  "ready",
  "failed",
  "stale",
])

export const invoiceTemplateBodyFormatEnum = pgEnum("invoice_template_body_format", [
  "html",
  "markdown",
  "lexical_json",
])

export const taxRegimeCodeEnum = pgEnum("tax_regime_code", [
  "standard",
  "reduced",
  "exempt",
  "reverse_charge",
  "margin_scheme_art311",
  "zero_rated",
  "out_of_scope",
  "other",
])

export const travelCreditStatusEnum = pgEnum("travel_credit_status", [
  "active",
  "redeemed",
  "expired",
  "void",
])

export const travelCreditSourceTypeEnum = pgEnum("travel_credit_source_type", [
  "refund",
  "cancellation_credit",
  "gift",
  "manual",
  "goodwill",
  "promotion",
])

/**
 * Status flow for a received supplier invoice. Mirrors the AR invoice flow
 * where it can; `approved` and `disputed` are AP-specific (an operator
 * approves a payable before it can be paid; a contested bill is disputed).
 */
export const supplierInvoiceStatusEnum = pgEnum("supplier_invoice_status", [
  "draft",
  "received",
  "approved",
  "partially_paid",
  "paid",
  "disputed",
  "void",
])

/**
 * AP-local service taxonomy for supplier-invoice lines. Deliberately NOT the
 * shared `serviceTypeEnum` (suppliers/products) — extending that is a ~17-file
 * cross-package sweep (§5.6). This local enum carries the categories operators
 * think in for cost breakdown charts, including `flight` (named in the request
 * but absent from the shared enum) and `insurance`.
 */
export const apServiceTypeEnum = pgEnum("ap_service_type", [
  "transport",
  "flight",
  "accommodation",
  "guide",
  "meal",
  "experience",
  "insurance",
  "other",
])

/** What a supplier cost allocation attributes the cost to (§6). */
export const costAllocationTargetTypeEnum = pgEnum("cost_allocation_target_type", [
  "departure",
  "product",
  "booking",
  "traveler",
  "unattributed",
])

/** How a multi-target split was derived, for "derived vs explicit" display (§6). */
export const costAllocationSplitMethodEnum = pgEnum("cost_allocation_split_method", [
  "manual",
  "per_pax",
  "equal",
  "weighted",
])
