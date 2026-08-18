/**
 * Representative data for each staff alert.
 *
 * Drives the settings page's "Send test", so an operator sees the real layout
 * with plausible content before switching an alert on. Deliberately concrete
 * rather than `"..."` placeholders: a test email full of lorem tells you the
 * pipe works but not whether the thing is readable.
 */

import type { StaffAlertContextMap, StaffAlertEventKey } from "../staff-alert-registry.js"

const SAMPLES: { [K in StaffAlertEventKey]: StaffAlertContextMap[K] } = {
  "staff.booking.confirmed": {
    adminPath: "/bookings/bk_sample",
    assigneeUserId: null,
    actorUserId: null,
    bookingId: "bk_sample",
    bookingNumber: "VOY-1042",
    customer: { name: "Ana Popescu", email: "ana.popescu@example.com" },
    total: { amountCents: 249900, currency: "EUR" },
    travelStartDate: "2027-03-12",
    travelEndDate: "2027-03-19",
    travelerCount: 2,
  },
  "staff.booking.cancelled": {
    adminPath: "/bookings/bk_sample",
    assigneeUserId: null,
    actorUserId: null,
    bookingId: "bk_sample",
    bookingNumber: "VOY-1042",
    customer: { name: "Ana Popescu", email: "ana.popescu@example.com" },
    total: { amountCents: 249900, currency: "EUR" },
    previousStatus: "confirmed",
    reason: "Customer changed travel dates",
  },
  "staff.booking.inquiry-created": {
    adminPath: "/bookings/inquiries/bkin_sample",
    assigneeUserId: null,
    actorUserId: null,
    inquiryId: "bkin_sample",
    contact: { name: "Ana Popescu", email: "ana.popescu@example.com" },
    contactPhone: "+40 700 000 000",
    productId: "prod_kilimanjaro",
    departureId: "departure_march",
    locale: "ro",
    message: "Mai sunt două locuri pentru plecarea din martie?",
  },
  "staff.payment.completed": {
    adminPath: "/bookings/bk_sample",
    assigneeUserId: null,
    actorUserId: null,
    paymentSessionId: "ps_sample",
    bookingId: "bk_sample",
    bookingNumber: "VOY-1042",
    customer: { name: "Ana Popescu", email: "ana.popescu@example.com" },
    amount: { amountCents: 74970, currency: "EUR" },
    provider: "netopia",
    paidInFull: false,
  },
  "staff.payment.settlement-stranded": {
    adminPath: "/finance/payments/ps_sample",
    assigneeUserId: null,
    actorUserId: null,
    paymentSessionId: "ps_sample",
    bookingSessionId: "bses_sample",
    amount: { amountCents: 16000, currency: "RON" },
    provider: "voyant-pay",
    error: "booking_session_settlement_commit_rejected:hold_failure:capacity_unavailable",
    attempts: 8,
  },
  "staff.invoice.settled": {
    adminPath: "/finance/invoices/inv_sample",
    assigneeUserId: null,
    actorUserId: null,
    invoiceId: "inv_sample",
    invoiceNumber: "INV-2027-0114",
    bookingId: "bk_sample",
    bookingNumber: "VOY-1042",
    customer: { name: "Ana Popescu", email: "ana.popescu@example.com" },
    total: { amountCents: 249900, currency: "EUR" },
  },
  "staff.contract.signed": {
    adminPath: "/bookings/bk_sample",
    assigneeUserId: null,
    actorUserId: null,
    contractId: "lct_sample",
    bookingId: "bk_sample",
    bookingNumber: "VOY-1042",
    signerName: "Ana Popescu",
    signedAt: "2027-01-14T09:24:00.000Z",
  },
  "staff.customer-signal.created": {
    adminPath: "/crm/signals/csig_sample",
    assigneeUserId: null,
    actorUserId: null,
    signalId: "csig_sample",
    person: { name: "Ana Popescu", email: "ana.popescu@example.com" },
    kind: "inquiry",
    source: "form",
    priority: "high",
    productTitle: "Kilimanjaro Trek — 8 days",
    notes: "Looking for a March departure for two people.",
  },
  "staff.inquiry.created": inquirySample("created"),
  "staff.inquiry.assigned": inquirySample("assigned"),
  "staff.inquiry.first-response-overdue": inquirySample("first_response_overdue"),
  "staff.inquiry.converted": inquirySample("converted"),
}

function inquirySample(alertKind: import("../staff-alert-registry.js").StaffInquiryAlertKind) {
  return {
    adminPath: "/inquiries/inq_sample",
    assigneeUserId: "usr_sample",
    actorUserId: null,
    inquiryId: "inq_sample",
    alertKind,
    subject: "Private tour of Transylvania",
    contact: { name: "Ana Popescu", email: "ana@example.com" },
    source: "storefront",
    status: alertKind === "converted" ? "converted" : "triaged",
    firstResponseDueAt: "2026-08-18T10:00:00.000Z",
  }
}

export function sampleStaffAlertContext<K extends StaffAlertEventKey>(
  eventKey: K,
): StaffAlertContextMap[K] {
  return SAMPLES[eventKey]
}
