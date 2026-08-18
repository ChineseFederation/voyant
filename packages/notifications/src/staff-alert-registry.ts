/**
 * The catalog of staff alerts: which domain events are worth interrupting an
 * operator for, what data each alert's email needs, and how that data gets
 * here.
 *
 * WHY A RESOLVER SEAM EXISTS AT ALL
 *
 * Every declared domain event is id-shaped. `booking.confirmed` carries
 * `{bookingId, bookingNumber, actorId}` — no customer name, no total, no travel
 * dates. `customer.signal.created` carries `{id, personId, kind, source,
 * status}` — no name, no email, no product title. None of that renders an email
 * a human wants to read.
 *
 * Notifications cannot go and fetch the rest. `verify:table-privacy` records
 * `notifications->bookings` and `notifications->finance` as pairs that may
 * shrink but never grow, and there is no `notifications->relationships` pair at
 * all — reading `customer_signals` here would fail the check outright.
 * ADR-0016 decision 7 rules out a port ("No ports for business modules"), so
 * the remaining sanctioned answer is the one AGENTS.md gives: call the owning
 * module's service, from the deployment that already depends on every module.
 *
 * Hence: this module declares the shape it needs, and `apps/operator` registers
 * resolvers that satisfy it. Notifications' schema imports do not change.
 */

import { EVENT_DEAD_LETTERED } from "@voyant-travel/db/outbox"

/** Stable identifiers for staff alerts. Also the `event_key` column value. */
export const STAFF_ALERT_EVENT_KEYS = [
  "staff.booking.confirmed",
  "staff.booking.cancelled",
  "staff.booking.inquiry-created",
  "staff.payment.completed",
  "staff.payment.settlement-stranded",
  "staff.invoice.settled",
  "staff.contract.signed",
  "staff.customer-signal.created",
  "staff.inquiry.created",
  "staff.inquiry.assigned",
  "staff.inquiry.first-response-overdue",
  "staff.inquiry.converted",
] as const

export type StaffAlertEventKey = (typeof STAFF_ALERT_EVENT_KEYS)[number]

/** Grouping for the settings UI. Presentation only — carries no behavior. */
export type StaffAlertGroup = "bookings" | "finance" | "sales" | "legal"

export interface StaffAlertMoney {
  amountCents: number
  currency: string
}

/** A customer/counterparty as an email needs to show them. */
export interface StaffAlertParty {
  name: string
  email: string | null
}

/**
 * Fields every staff alert context carries.
 *
 * `adminPath` is the deep link the email's primary button points at, relative
 * to the admin root. The resolver supplies it because only the owning module
 * knows where its records live.
 */
export interface StaffAlertContextBase {
  /** Deep link into the admin, e.g. `/bookings/bk_123`. Root-relative. */
  adminPath: string
  /**
   * Staff user id to route to when `routeToAssignee` is on, or `null` where the
   * owning module has no assignment concept. See the note on booking ownership
   * in the module README — bookings currently have none.
   */
  assigneeUserId: string | null
  /**
   * The staff user who caused the event, when known. Excluded from recipients:
   * telling someone what they just did is noise, not an alert.
   */
  actorUserId: string | null
}

export interface StaffBookingConfirmedContext extends StaffAlertContextBase {
  bookingId: string
  bookingNumber: string
  customer: StaffAlertParty | null
  total: StaffAlertMoney | null
  travelStartDate: string | null
  travelEndDate: string | null
  travelerCount: number | null
}

export interface StaffBookingCancelledContext extends StaffAlertContextBase {
  bookingId: string
  bookingNumber: string
  customer: StaffAlertParty | null
  total: StaffAlertMoney | null
  previousStatus: string
  reason: string | null
}

export interface StaffBookingInquiryCreatedContext extends StaffAlertContextBase {
  inquiryId: string
  contact: StaffAlertParty | null
  contactPhone: string | null
  productId: string
  departureId: string | null
  locale: string
  message: string
}

export interface StaffPaymentCompletedContext extends StaffAlertContextBase {
  paymentSessionId: string
  bookingId: string | null
  bookingNumber: string | null
  customer: StaffAlertParty | null
  amount: StaffAlertMoney
  provider: string
  /** Whether this settled the booking's balance, when the caller can tell. */
  paidInFull: boolean | null
}

/**
 * A payment that was captured and then never became a Booking.
 *
 * The worst state the system can be in: the shopper has been charged, no seat
 * is held, and until this alert existed nobody was told — the settlement
 * retried, exhausted its attempts, and left a `failed` outbox row that no
 * surface reads (voyant#4636). Always actionable, so unlike every other staff
 * alert it defaults to on.
 */
export interface StaffPaymentSettlementStrandedContext extends StaffAlertContextBase {
  paymentSessionId: string
  bookingSessionId: string | null
  amount: StaffAlertMoney
  provider: string
  /** Why the last settlement attempt was refused, verbatim. */
  error: string
  attempts: number
}

export interface StaffInvoiceSettledContext extends StaffAlertContextBase {
  invoiceId: string
  invoiceNumber: string | null
  bookingId: string | null
  bookingNumber: string | null
  customer: StaffAlertParty | null
  total: StaffAlertMoney | null
}

export interface StaffContractSignedContext extends StaffAlertContextBase {
  contractId: string
  bookingId: string | null
  bookingNumber: string | null
  signerName: string | null
  signedAt: string | null
}

export interface StaffCustomerSignalCreatedContext extends StaffAlertContextBase {
  signalId: string
  person: StaffAlertParty | null
  kind: string
  source: string
  priority: string
  productTitle: string | null
  notes: string | null
}

export type StaffInquiryAlertKind = "created" | "assigned" | "first_response_overdue" | "converted"

export interface StaffInquiryContext extends StaffAlertContextBase {
  inquiryId: string
  alertKind: StaffInquiryAlertKind
  subject: string
  contact: StaffAlertParty | null
  source: string
  status: string
  firstResponseDueAt: string | null
}

/** Context payload keyed by alert. The template for a key receives exactly this. */
export interface StaffAlertContextMap {
  "staff.booking.confirmed": StaffBookingConfirmedContext
  "staff.booking.cancelled": StaffBookingCancelledContext
  "staff.booking.inquiry-created": StaffBookingInquiryCreatedContext
  "staff.payment.completed": StaffPaymentCompletedContext
  "staff.payment.settlement-stranded": StaffPaymentSettlementStrandedContext
  "staff.invoice.settled": StaffInvoiceSettledContext
  "staff.contract.signed": StaffContractSignedContext
  "staff.customer-signal.created": StaffCustomerSignalCreatedContext
  "staff.inquiry.created": StaffInquiryContext
  "staff.inquiry.assigned": StaffInquiryContext
  "staff.inquiry.first-response-overdue": StaffInquiryContext
  "staff.inquiry.converted": StaffInquiryContext
}

export type StaffAlertContext = StaffAlertContextMap[StaffAlertEventKey]

export interface StaffAlertDefinition<K extends StaffAlertEventKey = StaffAlertEventKey> {
  key: K
  /** The declared domain event this alert subscribes to. */
  eventType: string
  group: StaffAlertGroup
  /**
   * Whether a deployment that has never touched the settings page fires this.
   * All false: staff alerts are opt-in per deployment, so upgrading does not
   * silently start mailing an operator who never asked for it.
   */
  defaultEnabled: boolean
  /**
   * Whether assignee routing is meaningful for this alert. False where the
   * owning module has no assignment concept, so the settings UI can hide the
   * control rather than offer a switch that does nothing.
   */
  supportsAssigneeRouting: boolean
  /** Role slugs enabled by default when an operator first turns the alert on. */
  defaultRoles: readonly string[]
  /** `notification_deliveries.template_slug` recorded for sends of this alert. */
  templateSlug: string
}

/**
 * The v1 catalog.
 *
 * `supportsAssigneeRouting` is true only for customer signals, because
 * `customer_signals.assigned_to_user_id` is the one real staff-assignment
 * column in the product today. `booking_staff_assignments` looks like a match
 * but is not one: it holds tour guides and service assignees (first/last name,
 * CRM `person_id`), not staff logins. Until bookings grow an owner column, the
 * booking and finance alerts route by role and explicit address only.
 */
export const STAFF_ALERT_DEFINITIONS = [
  {
    key: "staff.booking.confirmed",
    eventType: "booking.confirmed",
    group: "bookings",
    defaultEnabled: false,
    supportsAssigneeRouting: false,
    defaultRoles: ["owner", "admin"],
    templateSlug: "staff.booking.confirmed",
  },
  {
    key: "staff.booking.cancelled",
    eventType: "booking.cancelled",
    group: "bookings",
    defaultEnabled: false,
    supportsAssigneeRouting: false,
    defaultRoles: ["owner", "admin"],
    templateSlug: "staff.booking.cancelled",
  },
  {
    key: "staff.booking.inquiry-created",
    eventType: "booking.inquiry.created",
    group: "sales",
    defaultEnabled: false,
    supportsAssigneeRouting: false,
    defaultRoles: ["owner", "admin", "member"],
    templateSlug: "staff.booking.inquiry-created",
  },
  {
    key: "staff.payment.completed",
    eventType: "payment.completed",
    group: "finance",
    defaultEnabled: false,
    supportsAssigneeRouting: false,
    defaultRoles: ["owner", "admin"],
    templateSlug: "staff.payment.completed",
  },
  {
    key: "staff.payment.settlement-stranded",
    eventType: EVENT_DEAD_LETTERED,
    group: "finance",
    // The only alert that is on by default. The others tell an operator
    // something went right; this one tells them a customer has paid for
    // nothing, which is not a preference.
    defaultEnabled: true,
    supportsAssigneeRouting: false,
    defaultRoles: ["owner", "admin"],
    templateSlug: "staff.payment.settlement-stranded",
  },
  {
    key: "staff.invoice.settled",
    eventType: "invoice.settled",
    group: "finance",
    defaultEnabled: false,
    supportsAssigneeRouting: false,
    defaultRoles: ["owner", "admin"],
    templateSlug: "staff.invoice.settled",
  },
  {
    key: "staff.contract.signed",
    eventType: "contract.signed",
    group: "legal",
    defaultEnabled: false,
    supportsAssigneeRouting: false,
    defaultRoles: ["owner", "admin"],
    templateSlug: "staff.contract.signed",
  },
  {
    key: "staff.customer-signal.created",
    eventType: "customer.signal.created",
    group: "sales",
    defaultEnabled: false,
    supportsAssigneeRouting: true,
    defaultRoles: ["owner", "admin", "member"],
    templateSlug: "staff.customer-signal.created",
  },
  {
    key: "staff.inquiry.created",
    eventType: "inquiry.created",
    group: "sales",
    defaultEnabled: false,
    supportsAssigneeRouting: false,
    // There is no deployment-level sales-role selector yet. Do not broaden a
    // newly enabled alert to every member; owners/admins are the safe fallback.
    defaultRoles: ["owner", "admin"],
    templateSlug: "staff.inquiry.created",
  },
  {
    key: "staff.inquiry.assigned",
    eventType: "inquiry.assigned",
    group: "sales",
    defaultEnabled: false,
    supportsAssigneeRouting: true,
    defaultRoles: ["owner", "admin", "member"],
    templateSlug: "staff.inquiry.assigned",
  },
  {
    key: "staff.inquiry.first-response-overdue",
    eventType: "inquiry.first_response_overdue",
    group: "sales",
    defaultEnabled: false,
    supportsAssigneeRouting: true,
    defaultRoles: ["owner", "admin", "member"],
    templateSlug: "staff.inquiry.first-response-overdue",
  },
  {
    key: "staff.inquiry.converted",
    eventType: "inquiry.converted",
    group: "sales",
    defaultEnabled: false,
    supportsAssigneeRouting: true,
    defaultRoles: ["owner", "admin", "member"],
    templateSlug: "staff.inquiry.converted",
  },
] as const satisfies ReadonlyArray<StaffAlertDefinition>

const definitionsByKey = new Map<StaffAlertEventKey, StaffAlertDefinition>(
  STAFF_ALERT_DEFINITIONS.map((definition) => [definition.key, definition]),
)

export function getStaffAlertDefinition(key: string): StaffAlertDefinition | undefined {
  return definitionsByKey.get(key as StaffAlertEventKey)
}

export function isStaffAlertEventKey(key: string): key is StaffAlertEventKey {
  return definitionsByKey.has(key as StaffAlertEventKey)
}

/**
 * Turns a raw domain-event payload into the context its email needs, by asking
 * the module that owns the data.
 *
 * Returning `null` means "nothing to send" — the record was deleted between
 * publish and delivery, or the payload names something this alert does not
 * apply to (a `payment.completed` with no booking, say). It is a normal
 * outcome, not an error; only a genuine failure should throw.
 */
export interface StaffAlertContextResolver<K extends StaffAlertEventKey = StaffAlertEventKey> {
  eventKey: K
  resolve(input: {
    db: unknown
    payload: Record<string, unknown>
  }): Promise<StaffAlertContextMap[K] | null>
}

export type StaffAlertContextResolverRegistry = {
  readonly [K in StaffAlertEventKey]?: StaffAlertContextResolver<K>
}

/** Container key the deployment registers its resolver registry under. */
export const STAFF_ALERT_CONTEXT_RESOLVERS_KEY = "notifications.staffAlertContextResolvers"
