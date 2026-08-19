/**
 * Turning id-shaped domain events into the data a staff alert email shows.
 *
 * Every resolver here calls the OWNING module's service — never its tables.
 * That is the distinction `verify:table-privacy` enforces: a service call is
 * in-process coupling, which ADR-0016 permits between modules; a table read
 * would open an importer->owner pair, and several of these pairs
 * (`notifications->relationships`, `notifications->operator-settings`) do not
 * exist and may not be created.
 *
 * A resolver returns `null` for "nothing to send" — the record was deleted
 * between publish and delivery, or the payload names something the alert does
 * not apply to. That is a normal outcome; only genuine failures throw.
 */

import { bookingInquiriesService, bookingsService } from "@voyant-travel/bookings"
// Narrow entry on purpose: the `@voyant-travel/finance` barrel is forbidden
// here (see `module.test.ts`) because it drags the whole 87k-line module
// into the import closure. `service-invoice-core` carries two imports.
import { financeInvoiceCoreService } from "@voyant-travel/finance/service-invoice-core"
import { getOperatorProfile } from "@voyant-travel/operator-settings/service"
import { relationshipsService } from "@voyant-travel/relationships"
import { INQUIRY_DETAIL_DESTINATION } from "@voyant-travel/relationships-contracts/inquiry-navigation"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"

import {
  DEFAULT_STAFF_ALERT_BRAND_COLOR,
  DEFAULT_STAFF_ALERT_CORNER_RADIUS,
  normalizeBrandColor,
  type StaffAlertBrand,
} from "./emails/brand.js"
import type {
  StaffAlertContextResolver,
  StaffAlertContextResolverRegistry,
  StaffAlertParty,
} from "./staff-alert-registry.js"

function asString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null
}

/**
 * A booking's customer.
 *
 * `bookings` records the counterparty as `contact_*`, not `customer_*`. Reading
 * the wrong column names does not fail — every field simply comes back
 * undefined and the email renders "Unknown customer" with no total, which is
 * exactly the kind of quietly useless alert this feature exists to avoid.
 */
function partyFromBooking(booking: Record<string, unknown>): StaffAlertParty | null {
  const name = [asString(booking.contactFirstName), asString(booking.contactLastName)]
    .filter(Boolean)
    .join(" ")
  if (!name) return null
  return { name, email: asString(booking.contactEmail) }
}

/** The sell-side total. `base*` columns are the operator's reporting currency. */
function moneyFromBooking(booking: Record<string, unknown>) {
  const amountCents = asNumber(booking.sellAmountCents)
  const currency = asString(booking.sellCurrency)
  if (amountCents === null || !currency) return null
  return { amountCents, currency }
}

async function loadBooking(db: PostgresJsDatabase, bookingId: string) {
  const booking = await bookingsService.getBookingById(db, bookingId)
  return (booking ?? null) as Record<string, unknown> | null
}

const bookingConfirmedResolver: StaffAlertContextResolver<"staff.booking.confirmed"> = {
  eventKey: "staff.booking.confirmed",
  async resolve({ db, payload }) {
    const bookingId = asString(payload.bookingId)
    if (!bookingId) return null
    const booking = await loadBooking(db as PostgresJsDatabase, bookingId)
    if (!booking) return null

    return {
      adminPath: `/bookings/${bookingId}`,
      // Bookings has no staff-owner column; see the README. Role routing
      // carries these alerts instead.
      assigneeUserId: null,
      actorUserId: asString(payload.actorId),
      bookingId,
      bookingNumber:
        asString(payload.bookingNumber) ?? asString(booking.bookingNumber) ?? bookingId,
      customer: partyFromBooking(booking),
      total: moneyFromBooking(booking),
      travelStartDate: asString(booking.startDate),
      travelEndDate: asString(booking.endDate),
      travelerCount: asNumber(booking.pax),
    }
  },
}

const bookingCancelledResolver: StaffAlertContextResolver<"staff.booking.cancelled"> = {
  eventKey: "staff.booking.cancelled",
  async resolve({ db, payload }) {
    const bookingId = asString(payload.bookingId)
    if (!bookingId) return null
    const booking = await loadBooking(db as PostgresJsDatabase, bookingId)
    if (!booking) return null

    return {
      adminPath: `/bookings/${bookingId}`,
      assigneeUserId: null,
      actorUserId: asString(payload.actorId),
      bookingId,
      bookingNumber:
        asString(payload.bookingNumber) ?? asString(booking.bookingNumber) ?? bookingId,
      customer: partyFromBooking(booking),
      total: moneyFromBooking(booking),
      previousStatus: asString(payload.previousStatus) ?? "confirmed",
      reason: asString(payload.reason),
    }
  },
}

const bookingInquiryCreatedResolver: StaffAlertContextResolver<"staff.booking.inquiry-created"> = {
  eventKey: "staff.booking.inquiry-created",
  async resolve({ db, payload }) {
    const inquiryId = asString(payload.inquiryId)
    if (!inquiryId) return null
    const inquiry = await bookingInquiriesService.getById(db as PostgresJsDatabase, inquiryId)
    if (!inquiry) return null
    const name = [inquiry.contactFirstName, inquiry.contactLastName]
      .filter(Boolean)
      .join(" ")
      .trim()

    return {
      adminPath: `/bookings/inquiries/${inquiry.id}`,
      assigneeUserId: null,
      actorUserId: null,
      inquiryId: inquiry.id,
      contact: name ? { name, email: inquiry.contactEmail } : null,
      contactPhone: inquiry.contactPhone,
      productId: inquiry.productId,
      departureId: inquiry.departureId,
      locale: inquiry.locale,
      message: inquiry.message,
    }
  },
}

const paymentCompletedResolver: StaffAlertContextResolver<"staff.payment.completed"> = {
  eventKey: "staff.payment.completed",
  async resolve({ db, payload }) {
    const paymentSessionId = asString(payload.paymentSessionId)
    const amountCents = asNumber(payload.amountCents)
    const currency = asString(payload.currency)
    if (!paymentSessionId || amountCents === null || !currency) return null

    const bookingId = asString(payload.bookingId)
    const booking = bookingId ? await loadBooking(db as PostgresJsDatabase, bookingId) : null

    return {
      adminPath: bookingId ? `/bookings/${bookingId}` : `/finance/payments/${paymentSessionId}`,
      assigneeUserId: null,
      actorUserId: null,
      paymentSessionId,
      bookingId,
      bookingNumber: booking ? (asString(booking.bookingNumber) ?? bookingId) : null,
      customer: booking ? partyFromBooking(booking) : null,
      amount: { amountCents, currency },
      provider: asString(payload.provider) ?? "unknown",
      // The event does not say whether this settled the balance, and deciding
      // it here would mean reaching into finance's schedules. Null renders as
      // silence rather than a claim that might be wrong.
      paidInFull: null,
    }
  },
}

const invoiceSettledResolver: StaffAlertContextResolver<"staff.invoice.settled"> = {
  eventKey: "staff.invoice.settled",
  async resolve({ db, payload }) {
    const invoiceId = asString(payload.invoiceId)
    if (!invoiceId) return null

    // The event carries settlement figures only — `paidCents`, `balanceDueCents`
    // and a payment id, with no number, currency or booking. Everything a human
    // needs to recognise the invoice has to come from the record itself.
    const database = db as PostgresJsDatabase
    const invoice = (await financeInvoiceCoreService.getInvoiceById(database, invoiceId)) as Record<
      string,
      unknown
    > | null
    if (!invoice) return null

    const bookingId = asString(invoice.bookingId)
    const booking = bookingId ? await loadBooking(database, bookingId) : null
    const totalCents = asNumber(invoice.totalCents)
    const currency = asString(invoice.currency)

    return {
      adminPath: `/finance/invoices/${invoiceId}`,
      assigneeUserId: null,
      actorUserId: null,
      invoiceId,
      invoiceNumber: asString(invoice.invoiceNumber),
      bookingId,
      bookingNumber: booking ? asString(booking.bookingNumber) : null,
      customer: booking ? partyFromBooking(booking) : null,
      total: totalCents !== null && currency ? { amountCents: totalCents, currency } : null,
    }
  },
}

const contractSignedResolver: StaffAlertContextResolver<"staff.contract.signed"> = {
  eventKey: "staff.contract.signed",
  async resolve({ db, payload }) {
    const contractId = asString(payload.contractId)
    if (!contractId) return null

    const database = db as PostgresJsDatabase
    const bookingId = asString(payload.bookingId)
    const booking = bookingId ? await loadBooking(database, bookingId) : null

    // The payload names the signing party by id, not by name. Resolve it
    // through CRM rather than leaving the alert to say "Unknown customer" —
    // who signed is the one fact this alert exists to carry.
    const personId = asString(payload.personId)
    const person = personId ? await relationshipsService.getPersonById(database, personId) : null
    const signerName = person
      ? [person.firstName, person.lastName].filter(Boolean).join(" ").trim() || null
      : booking
        ? (partyFromBooking(booking)?.name ?? null)
        : null

    return {
      adminPath: bookingId ? `/bookings/${bookingId}` : `/legal/contracts/${contractId}`,
      assigneeUserId: null,
      actorUserId: null,
      contractId,
      bookingId,
      bookingNumber:
        (booking ? asString(booking.bookingNumber) : null) ?? asString(payload.contractNumber),
      signerName,
      signedAt: asString(payload.occurredAt),
    }
  },
}

const customerSignalCreatedResolver: StaffAlertContextResolver<"staff.customer-signal.created"> = {
  eventKey: "staff.customer-signal.created",
  async resolve({ db, payload }) {
    const signalId = asString(payload.id)
    if (!signalId) return null

    const database = db as PostgresJsDatabase
    const signal = await relationshipsService.getCustomerSignal(database, signalId)
    if (!signal) return null

    const person = signal.personId
      ? await relationshipsService.getPersonById(database, signal.personId)
      : null

    return {
      adminPath: `/crm/signals/${signalId}`,
      // The one alert with real assignee data behind it.
      assigneeUserId: signal.assignedToUserId ?? null,
      actorUserId: null,
      signalId,
      person: person
        ? {
            name: [person.firstName, person.lastName].filter(Boolean).join(" ").trim(),
            email: asString((person as Record<string, unknown>).email),
          }
        : null,
      kind: signal.kind,
      source: signal.source,
      priority: signal.priority,
      // Resolving a product title means asking inventory, which this package
      // does not depend on. The id is not worth showing a human, so the row is
      // omitted rather than filled with `prd_01H…`.
      productTitle: null,
      notes: signal.notes ?? null,
    }
  },
}

function inquiryResolver<
  K extends Extract<
    import("./staff-alert-registry.js").StaffAlertEventKey,
    `staff.inquiry.${string}`
  >,
>(
  eventKey: K,
  alertKind: import("./staff-alert-registry.js").StaffInquiryAlertKind,
): StaffAlertContextResolver<K> {
  return {
    eventKey,
    async resolve({ db, payload, resolveAdminDestination }) {
      const inquiryId = asString(payload.id)
      if (!inquiryId) return null
      if (!resolveAdminDestination) {
        throw new Error("Inquiry staff alerts require an admin destination resolver.")
      }
      const inquiry = await relationshipsService.getInquiry(db as PostgresJsDatabase, inquiryId)
      if (!inquiry) return null
      const assignedOwnerId = payload.ownerId === null ? null : asString(payload.ownerId)
      if (eventKey === "staff.inquiry.assigned" && assignedOwnerId === undefined) return null
      const snapshot = inquiry.contactSnapshot as Record<string, unknown>
      const name = asString(snapshot.name) ?? asString(snapshot.email) ?? asString(snapshot.phone)
      const adminPath = resolveAdminDestination(INQUIRY_DETAIL_DESTINATION, { inquiryId })
      if (!adminPath) return null

      return {
        adminPath,
        assigneeUserId: eventKey === "staff.inquiry.assigned" ? assignedOwnerId : inquiry.ownerId,
        actorUserId: asString(payload.actorId),
        inquiryId,
        alertKind,
        subject: inquiry.subject,
        contact: name ? { name, email: asString(snapshot.email) } : null,
        source: inquiry.source,
        status: inquiry.status,
        firstResponseDueAt: inquiry.firstResponseDueAt?.toISOString() ?? null,
      } as Awaited<ReturnType<StaffAlertContextResolver<K>["resolve"]>>
    },
  }
}

const inquiryCreatedResolver = inquiryResolver("staff.inquiry.created", "created")
const inquiryAssignedResolver = inquiryResolver("staff.inquiry.assigned", "assigned")
const inquiryFirstResponseOverdueResolver = inquiryResolver(
  "staff.inquiry.first-response-overdue",
  "first_response_overdue",
)
const inquiryConvertedResolver = inquiryResolver("staff.inquiry.converted", "converted")

/**
 * Turn a dead-lettered delivery into a stranded-payment alert, or decline.
 *
 * `event.dead_lettered` fires for every event that exhausts its attempts, so
 * this is the filter: only a `payment.completed` that never became a Booking
 * means a customer has paid for nothing. Anything else is somebody else's
 * problem and resolves to `null`.
 *
 * Deliberately trusts the undelivered payload rather than re-reading the
 * payment session. The payload is what the settlement was given and it is
 * exactly what an operator needs to find the row; re-reading would add a
 * `notifications->finance` table reach the boundary check does not permit for
 * a lookup this alert does not need.
 */
const paymentSettlementStrandedResolver: StaffAlertContextResolver<"staff.payment.settlement-stranded"> =
  {
    eventKey: "staff.payment.settlement-stranded",
    async resolve({ payload }) {
      if (asString(payload.name) !== "payment.completed") return null
      const stranded = (payload.payload ?? {}) as Record<string, unknown>
      const paymentSessionId = asString(stranded.paymentSessionId)
      const amountCents = asNumber(stranded.amountCents)
      const currency = asString(stranded.currency)
      if (!paymentSessionId || amountCents === null || !currency) return null
      // A `payment.completed` that already carries a Booking is not stranded —
      // the money found its Booking and something else about the delivery
      // failed.
      if (asString(stranded.bookingId)) return null

      return {
        adminPath: `/finance/payments/${paymentSessionId}`,
        assigneeUserId: null,
        actorUserId: null,
        paymentSessionId,
        bookingSessionId:
          asString(stranded.targetType) === "booking_session" ? asString(stranded.targetId) : null,
        amount: { amountCents, currency },
        provider: asString(stranded.provider) ?? "unknown",
        error: asString(payload.error) ?? "unknown",
        attempts: asNumber(payload.attempts) ?? 0,
      }
    },
  }

/** Every resolver, ready to register on the staff alert runtime. */
export const staffAlertContextResolvers: StaffAlertContextResolverRegistry = {
  "staff.booking.confirmed": bookingConfirmedResolver,
  "staff.booking.cancelled": bookingCancelledResolver,
  "staff.booking.inquiry-created": bookingInquiryCreatedResolver,
  "staff.payment.completed": paymentCompletedResolver,
  "staff.payment.settlement-stranded": paymentSettlementStrandedResolver,
  "staff.invoice.settled": invoiceSettledResolver,
  "staff.contract.signed": contractSignedResolver,
  "staff.customer-signal.created": customerSignalCreatedResolver,
  "staff.inquiry.created": inquiryCreatedResolver,
  "staff.inquiry.assigned": inquiryAssignedResolver,
  "staff.inquiry.first-response-overdue": inquiryFirstResponseOverdueResolver,
  "staff.inquiry.converted": inquiryConvertedResolver,
}

/**
 * Operator identity for the email shell, from `operator_profile`.
 *
 * `adminBaseUrl` is not in that table — it is deployment topology, not operator
 * data — so the host passes it in. Without it every deep link would be relative
 * and unusable from an inbox.
 */
export function createStaffAlertBrandResolver(options: { adminBaseUrl: string }) {
  return async function resolveBrand(db: PostgresJsDatabase): Promise<StaffAlertBrand> {
    const profile = await getOperatorProfile(db)
    return {
      operatorName: profile?.name ?? profile?.legalName ?? "Voyant",
      brandColor: normalizeBrandColor(profile?.brandColor ?? DEFAULT_STAFF_ALERT_BRAND_COLOR),
      cornerRadius: profile?.cornerRadius ?? DEFAULT_STAFF_ALERT_CORNER_RADIUS,
      // `logo_light_asset_key` is a storage key, not a URL, and resolving it
      // needs the storage port. Until that is wired the header renders the
      // operator's name as a wordmark — which Gmail shows and a blocked remote
      // image would not.
      logoUrl: null,
      supportEmail: profile?.supportEmail ?? profile?.email ?? null,
      adminBaseUrl: options.adminBaseUrl,
      locale: profile?.defaultLocale ?? "en",
    }
  }
}
