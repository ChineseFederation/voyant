import type { PaymentAdapter, PaymentAdapterRuntimeContext } from "@voyant-travel/finance"
import {
  computePaymentSchedule,
  createOrReuseBookingSessionPayment,
  expirePendingBookingSessionPayments,
  financeService,
  findEstablishedBookingSessionPayment,
  noDepositPolicy,
  resolveEffectivePaymentPolicy,
  resolvePaymentCallbackUrl,
  startPaymentAdapterCardPayment,
  transferBookingSessionPaymentToBooking,
} from "@voyant-travel/finance"
import type { FinanceOperatorSettingsRuntime } from "@voyant-travel/finance/runtime-port"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"

import type {
  CatalogDistributionRuntimeExtension,
  CatalogInventoryRuntimeExtension,
} from "../runtime-contracts.js"
import type { BookingSessionPaymentPorts } from "./sessions-service.js"

export interface ProductionBookingSessionPaymentDeps {
  db: PostgresJsDatabase
  inventory: Pick<CatalogInventoryRuntimeExtension, "loadProductPaymentPolicyContext">
  distribution: Pick<CatalogDistributionRuntimeExtension, "loadSupplierPaymentPolicy">
  settings: Pick<FinanceOperatorSettingsRuntime, "resolveOperatorDefaultPaymentPolicy">
  resolvePaymentAdapter?: () => PaymentAdapter | null | Promise<PaymentAdapter | null>
  paymentAdapterContext?: PaymentAdapterRuntimeContext
  financeRuntime?: Parameters<typeof createOrReuseBookingSessionPayment>[2]
}

export function createProductionBookingSessionPaymentPorts(
  deps: ProductionBookingSessionPaymentDeps,
): BookingSessionPaymentPorts {
  return {
    async prepare({ session, quote, hold, commit, access, now }) {
      if (session.target.kind !== "product") return { kind: "not_required" }
      // An admitted staff workflow can establish its collection plan directly
      // on the atomic Booking command (including already-recorded offline
      // payments). That explicit schedule is the guarantee decision; do not
      // start a second customer checkout session alongside it.
      if (
        access.actorKind === "staff" &&
        access.staffBookingAuthority?.admitted &&
        hasStaffPaymentSchedule(session.statePayload)
      ) {
        return { kind: "not_required" }
      }

      const context = await deps.inventory.loadProductPaymentPolicyContext(
        deps.db,
        session.target.productId,
      )
      if (!context) throw new Error("booking_session_payment_product_not_found")
      const [supplierPolicy, operatorDefault] = await Promise.all([
        context.supplierId
          ? deps.distribution.loadSupplierPaymentPolicy(deps.db, context.supplierId)
          : Promise.resolve(null),
        deps.settings.resolveOperatorDefaultPaymentPolicy(deps.db),
      ])
      const resolved = resolveEffectivePaymentPolicy({
        listingPolicy: context.listingPolicy,
        categoryPolicy: context.categoryPolicy,
        supplierPolicy,
        operatorDefault: operatorDefault ?? noDepositPolicy,
      })
      const dueNow = computePaymentSchedule(
        {
          totalCents: quote.pricing.total,
          currency: quote.pricing.currency,
          departureDate: context.departureDate,
          today: now,
        },
        resolved.policy,
      )[0]
      if (!dueNow || dueNow.amountCents <= 0) return { kind: "not_required" }

      const established = await findEstablishedBookingSessionPayment(deps.db, session.id, {
        amountCents: dueNow.amountCents,
        currency: dueNow.currency,
      })
      if (established) return { kind: "established", paymentSessionId: established.id }

      const contact = paymentContact(session.statePayload)
      let paymentSession = await createOrReuseBookingSessionPayment(
        deps.db,
        {
          bookingSessionId: session.id,
          commitIdempotencyKey: commit.idempotencyKey,
          amountCents: dueNow.amountCents,
          currency: dueNow.currency,
          payerEmail: contact.email,
          payerName: [contact.firstName, contact.lastName].filter(Boolean).join(" ") || null,
          returnUrl: commit.payment?.returnUrl,
          cancelUrl: commit.payment?.cancelUrl,
          expiresAt: earliestDate(
            session.expiresAt,
            quote.expiresAt,
            hold?.expiresAt ?? quote.expiresAt,
          ),
          metadata: {
            paymentPolicySource: resolved.source,
            paymentScheduleType: dueNow.scheduleType,
            sessionActorKind: session.actorKind,
            quoteId: quote.id,
            ...(hold ? { holdId: hold.id } : {}),
          },
        },
        deps.financeRuntime,
      )
      if (!paymentSession) throw new Error("booking_session_payment_creation_failed")

      if (paymentSession.status === "authorized" || paymentSession.status === "paid") {
        return { kind: "established", paymentSessionId: paymentSession.id }
      }

      const adapter = await deps.resolvePaymentAdapter?.()
      if (adapter && paymentSession.status === "pending" && contact.email && contact.firstName) {
        await startPaymentAdapterCardPayment(
          adapter,
          {
            db: deps.db,
            sessionId: paymentSession.id,
            billing: {
              email: contact.email,
              firstName: contact.firstName,
              ...(contact.lastName ? { lastName: contact.lastName } : {}),
              ...(contact.phone ? { phone: contact.phone } : {}),
              ...(contact.country ? { country: contact.country } : {}),
            },
            description: `Booking Session ${session.id}`,
            returnUrl: commit.payment?.returnUrl,
            cancelUrl: commit.payment?.cancelUrl,
            metadata: {
              bookingSessionId: session.id,
              quoteId: quote.id,
              ...(hold ? { holdId: hold.id } : {}),
            },
          },
          {
            context: deps.paymentAdapterContext ?? { env: {} },
            runtime: deps.financeRuntime,
            notifyUrl: resolvePaymentCallbackUrl(deps.paymentAdapterContext?.env ?? {}),
          },
        )
        const refreshed = await financeService.getPaymentSessionById(deps.db, paymentSession.id)
        if (refreshed) paymentSession = refreshed
      }

      return {
        kind: "required",
        allowedGuarantees: ["deposit"],
        paymentSession: projectPaymentSession(paymentSession),
      }
    },
    async transferToBooking({ tx, ...input }) {
      await transferBookingSessionPaymentToBooking(tx as PostgresJsDatabase, input)
    },
    async expirePending({ tx, bookingSessionId, at }) {
      await expirePendingBookingSessionPayments(tx as PostgresJsDatabase, bookingSessionId, at)
    },
  }
}

function hasStaffPaymentSchedule(payload: Record<string, unknown>): boolean {
  const staffBooking = record(payload.staffBooking)
  return Array.isArray(staffBooking?.paymentSchedules) && staffBooking.paymentSchedules.length > 0
}

function projectPaymentSession(session: {
  id: string
  status:
    | "pending"
    | "requires_redirect"
    | "processing"
    | "authorized"
    | "paid"
    | "failed"
    | "cancelled"
    | "expired"
  amountCents: number
  currency: string
  redirectUrl: string | null
  expiresAt: Date | null
}) {
  return {
    id: session.id,
    status: session.status,
    amountCents: session.amountCents,
    currency: session.currency,
    redirectUrl: session.redirectUrl,
    expiresAt: session.expiresAt?.toISOString() ?? null,
  }
}

function earliestDate(...dates: Date[]): Date {
  return new Date(Math.min(...dates.map((date) => date.getTime())))
}

function paymentContact(payload: Record<string, unknown>) {
  const billing = record(payload.billing)
  const contact = record(billing?.contact)
  const address = record(billing?.address)
  return {
    firstName: stringValue(contact?.firstName),
    lastName: stringValue(contact?.lastName),
    email: stringValue(contact?.email),
    phone: stringValue(contact?.phone),
    country: stringValue(address?.country),
  }
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null
}
