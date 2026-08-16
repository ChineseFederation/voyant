import type { BookingPaymentCheckoutV1 } from "@voyant-travel/catalog-contracts/booking-engine/lifecycle-conformance"
import { identifiedUserId } from "@voyant-travel/core"
import type { PaymentAdapter, PaymentAdapterRuntimeContext } from "@voyant-travel/finance"
import {
  computePaymentSchedule,
  createOrReuseBookingSessionPayment,
  expirePendingBookingSessionPayments,
  financeService,
  findEstablishedBookingSessionPayment,
  hasInFlightBookingSessionPayment,
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
  inventory: Pick<
    CatalogInventoryRuntimeExtension,
    "loadProductPaymentPolicyContext" | "resolveSelectedDepartureDate"
  >
  distribution: Pick<CatalogDistributionRuntimeExtension, "loadSupplierPaymentPolicy">
  settings: Pick<FinanceOperatorSettingsRuntime, "resolveOperatorDefaultPaymentPolicy">
  resolvePaymentAdapter?: () => PaymentAdapter | null | Promise<PaymentAdapter | null>
  paymentAdapterContext?: PaymentAdapterRuntimeContext
  financeRuntime?: Parameters<typeof createOrReuseBookingSessionPayment>[2]
  /** Host-owned bank-transfer document/instruction orchestration. */
  establishBankTransfer?: BookingSessionPaymentPorts["establishBankTransfer"]
  /**
   * Whether the operator's booking terms authorize charging a stored
   * instrument while the shopper is away, and which revision says so.
   *
   * Absent, or resolving to null, means no instrument is stored. Fail closed
   * is the only safe default: the operator is the merchant of record and
   * carries the liability for an agreement they never wrote.
   */
  resolveStoredInstrumentMandate?: (
    db: PostgresJsDatabase,
  ) => Promise<{ enabled: boolean; revision: string } | null>
}

/**
 * What the shopper authorized, derived from the operator's terms and the
 * shopper's acceptance of them.
 *
 * Both halves are required and neither substitutes for the other. Terms that
 * carry the mandate authorize nothing until somebody accepts them, and an
 * acceptance authorizes nothing if the terms accepted never said it.
 *
 * `agreementReference` is the record. Card network rules ask the merchant to
 * keep one, and this is the handle that ties the stored instrument back to the
 * exact acceptance and terms revision it rests on. Without the revision an
 * acceptance says only that some terms were agreed at some point, which is not
 * evidence of anything.
 */
function storedInstrumentIntent(
  mandate: { enabled: boolean; revision: string } | null | undefined,
  session: { id: string; statePayload: Record<string, unknown> },
): { merchantInitiated: true; agreementReference: string } | undefined {
  if (!mandate?.enabled) return undefined
  const acceptance = record(session.statePayload.contractAcceptance)
  const acceptedAt = stringValue(acceptance?.acceptedAt)
  if (!acceptedAt || Number.isNaN(Date.parse(acceptedAt))) return undefined
  return {
    merchantInitiated: true,
    agreementReference: `booking-terms:${mandate.revision}:${session.id}:${acceptedAt}`,
  }
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
      // Bank transfer is a pay-later Commit path. Its durable document and
      // instructions are established once the Booking id exists, inside the
      // same Commit transaction, by `establishBankTransfer` below.
      if (commit.checkoutIntent === "bank_transfer") return { kind: "not_required" }

      // Anchored to the Quote's own instant, not Commit's.
      //
      // The deposit gate counts whole UTC days to departure, so a Quote taken
      // at 23:55 and committed at 00:02 measures one day less — and a
      // departure sitting exactly on `minDaysBeforeDepartureForDeposit`
      // advertises a deposit and then charges the full total. Payment policy
      // is outside the price fingerprint, so nothing rejects that Commit.
      //
      // `quotedAt` is what `describePlan` published from, and a Quote lives
      // for minutes, so this is never a stale anchor — it is the instant the
      // shopper was quoted at. It also stops the settlement re-check below
      // from spuriously failing on an amount that moved under it.
      //
      // This does not close the whole gap: an operator editing the policy
      // mid-session still changes the cascade, and only a fingerprinted or
      // persisted plan can reject that. See the PR discussion.
      const plan = await resolvePlan(deps, session, quote.pricing, quote.quotedAt)
      if (!plan) throw new Error("booking_session_payment_product_not_found")
      const { context, resolved, departureDate, entries } = plan
      const dueNow = entries[0]
      if (!dueNow || dueNow.amountCents <= 0) return { kind: "not_required" }

      const settlementPaymentSessionId = access.settlementAuthority?.paymentSessionId
      if (settlementPaymentSessionId) {
        const settled = await financeService.getPaymentSessionById(
          deps.db,
          settlementPaymentSessionId,
        )
        if (
          settled?.targetType !== "booking_session" ||
          settled.targetId !== session.id ||
          settled.amountCents !== dueNow.amountCents ||
          settled.currency !== dueNow.currency ||
          (settled.status !== "authorized" && settled.status !== "paid")
        ) {
          throw new Error("booking_session_settlement_payment_not_established")
        }
        return { kind: "established", paymentSessionId: settled.id }
      }

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
      if (adapter && paymentSession.status === "pending") {
        const reference = customerReference(session)
        // Storage binds to the customer record, so an unidentified shopper
        // stores nothing however the terms read: there would be nobody for the
        // instrument to belong to.
        const storeInstrument = reference
          ? storedInstrumentIntent(await deps.resolveStoredInstrumentMandate?.(deps.db), session)
          : undefined
        await startPaymentAdapterCardPayment(
          adapter,
          {
            db: deps.db,
            sessionId: paymentSession.id,
            billing: {
              ...(contact.email ? { email: contact.email } : {}),
              ...(contact.firstName ? { firstName: contact.firstName } : {}),
              ...(contact.lastName ? { lastName: contact.lastName } : {}),
              ...(contact.phone ? { phone: contact.phone } : {}),
              ...(contact.country ? { country: contact.country } : {}),
              ...(contact.state ? { state: contact.state } : {}),
              ...(contact.city ? { city: contact.city } : {}),
              ...(contact.postalCode ? { postalCode: contact.postalCode } : {}),
              ...(contact.details ? { details: contact.details } : {}),
            },
            description: checkoutLineItem({
              productName: context.name,
              departureDate,
              locale: session.scope.locale,
            }),
            locale: session.scope.locale,
            ...(reference ? { customerReference: reference } : {}),
            ...(storeInstrument ? { storeInstrument } : {}),
            returnUrl: commit.payment?.returnUrl,
            cancelUrl: commit.payment?.cancelUrl,
            // Forwarded verbatim: the storefront is the only party that knows
            // what it can render, and nothing between it and the adapter is
            // entitled to decide on its behalf. Absent stays absent, which
            // `acceptedPaymentCheckoutHandoffs` reads as `["redirect"]`, and
            // an adapter without `embeddedCheckout` still answers with a
            // redirect through `negotiatePaymentCheckoutHandoff`
            // (voyant#4346). The parameter type is
            // `readonly PaymentCheckoutHandoff[]`, which is what pins the
            // contract's mirrored enum to the port.
            acceptedCheckoutHandoffs: commit.payment?.acceptedCheckoutHandoffs,
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
    async describePlan({ session, pricing, now }) {
      const plan = await resolvePlan(deps, session, pricing, now)
      // A target with no product, or a product that has since gone: the Quote
      // simply carries no plan. Commit throws on the same condition because it
      // is about to take money; a projection has nothing to protect.
      if (!plan) return null
      const [dueNow] = plan.entries
      if (!dueNow) return null
      return {
        policySource: plan.resolved.source,
        currency: pricing.currency,
        totalCents: pricing.total,
        dueNowCents: dueNow.amountCents,
        entries: plan.entries.map((entry) => ({
          scheduleType: entry.scheduleType,
          amountCents: entry.amountCents,
          currency: entry.currency,
          dueDate: entry.dueDate,
        })),
      }
    },
    async hasInFlight({ bookingSessionId }) {
      return hasInFlightBookingSessionPayment(deps.db, bookingSessionId)
    },
    async describeEstablished({ paymentSessionId }) {
      const session = await financeService.getPaymentSessionById(deps.db, paymentSessionId)
      if (!session) return null
      // Written by `prepare` above, into the same metadata the idempotency key
      // is derived from. Absent on a payment established before this was
      // recorded, which settlement reads as "no recorded Quote" and falls back.
      const metadata = session.metadata ?? {}
      return {
        quoteId: stringValue(metadata.quoteId),
        holdId: stringValue(metadata.holdId),
      }
    },
    async transferToBooking({ tx, ...input }) {
      await transferBookingSessionPaymentToBooking(tx as PostgresJsDatabase, input)
    },
    async expirePending({ tx, bookingSessionId, at }) {
      await expirePendingBookingSessionPayments(tx as PostgresJsDatabase, bookingSessionId, at)
    },
    async establishBankTransfer(input) {
      return (await deps.establishBankTransfer?.(input)) ?? null
    },
  }
}

/**
 * What the shopper is asked to pay for on the hosted checkout page.
 *
 * `description` is the only product-shaped field on `PaymentInitiationInput`,
 * so whatever is put here is the whole of what a provider can render — nothing
 * downstream can repair an identifier sent in its place. Names the product and,
 * where the target has one, its departure, in the Session's locale.
 *
 * Undefined when the product has no name: finance then falls back to the
 * payment session's own notes, which is still better than an id.
 */
function checkoutLineItem(input: {
  productName: string | null
  departureDate: string | null
  locale: string
}): string | undefined {
  const name = input.productName?.trim()
  if (!name) return undefined
  const departure = formatDepartureDate(input.departureDate, input.locale)
  return departure ? `${name} — ${departure}` : name
}

/**
 * Render a date-only departure in the Session's locale. The column is a plain
 * calendar date, so it is formatted in UTC — resolving it against the server's
 * zone would move it a day for a shopper west of the meridian.
 */
function formatDepartureDate(departureDate: string | null, locale: string): string | null {
  if (!departureDate) return null
  const parsed = new Date(`${departureDate}T00:00:00Z`)
  if (Number.isNaN(parsed.getTime())) return null
  try {
    return new Intl.DateTimeFormat(locale, { dateStyle: "long", timeZone: "UTC" }).format(parsed)
  } catch {
    // An unparseable locale tag must not fail a checkout; the ISO date still
    // tells the shopper which departure they are paying for.
    return departureDate
  }
}

/**
 * The opaque, stable customer reference a hosted provider binds a stored
 * customer to. Prefers the CRM person the buyer was identified as; falls back
 * to the owning principal only for a customer-actor Session, because on a
 * staff-created Session the principal is the agent, not the shopper.
 *
 * The principal has to survive `identifiedUserId` first. A guest Session is
 * `actorKind: "customer"` with the anonymous placeholder as its principal, and
 * a reference is a *stable customer key* — the provider mints a Customer under
 * it on first use and matches every later checkout to that same record. Handing
 * over a value every guest shares therefore pools unrelated shoppers into one
 * Customer, keeping the first shopper's billing email on all of them
 * (voyant#4637). Absent is the correct answer: an anonymous shopper pays as a
 * guest, which is what the resolution contract asks for.
 */
function customerReference(session: {
  actorKind: string
  ownerPrincipalId?: string
  statePayload: Record<string, unknown>
}): string | undefined {
  const billing = record(session.statePayload.billing)
  const personId = stringValue(record(billing?.contact)?.personId)
  if (personId) return personId
  if (session.actorKind !== "customer") return undefined
  return identifiedUserId(session.ownerPrincipalId) ?? undefined
}

/**
 * The collection plan for a product Session, and everything that went into it.
 *
 * One derivation, two readers: `prepare` charges `entries[0]` at Commit and
 * `describePlan` publishes the whole thing on the Quote. Quoting a plan that a
 * second, parallel derivation produced would put the shopper's stated terms and
 * their actual charge back on separate code paths, which is the shape of
 * voyant#4741 rather than a fix for it.
 *
 * The policy cascade and the departure are two different questions about two
 * different things — the listing, and what the shopper selected off it. They
 * were one call until voyant#4740, which is how every deposit gate came to be
 * measured from `products.startDate`.
 *
 * Null when the product is gone. Callers differ on what that means: Commit
 * throws, a Quote projection publishes nothing.
 */
async function resolvePlan(
  deps: ProductionBookingSessionPaymentDeps,
  session: {
    target: { kind: string; productId?: string }
    scope: { locale: string }
    statePayload: Record<string, unknown>
  },
  pricing: { total: number; currency: string },
  /**
   * The instant the plan is measured from. Both callers pass the Quote's own
   * `quotedAt`, so the plan published on a Quote and the plan charged against
   * it are the same function of the same inputs.
   */
  asOf: Date,
) {
  const productId = session.target.productId
  if (session.target.kind !== "product" || !productId) return null
  const [context, departureDate] = await Promise.all([
    deps.inventory.loadProductPaymentPolicyContext(deps.db, productId, {
      locale: session.scope.locale,
    }),
    deps.inventory.resolveSelectedDepartureDate(deps.db, {
      productId,
      departureSlotId: selectedDepartureSlotId(session.statePayload),
    }),
  ])
  if (!context) return null
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
  const entries = computePaymentSchedule(
    {
      totalCents: pricing.total,
      currency: pricing.currency,
      departureDate,
      today: asOf,
    },
    resolved.policy,
  )
  return { context, resolved, departureDate, entries }
}

/**
 * Which departure the Session's selection names.
 *
 * The slot id and nothing else, read off the Session's own `configure` step —
 * the same place the Commit reads it from, and the only part of the selection
 * that reaches `bookings.startDate`. `configure.departureDate` sits right next
 * to it and is deliberately left behind: see `resolveSelectedDepartureDate`.
 */
function selectedDepartureSlotId(payload: Record<string, unknown>): string | null {
  return stringValue(record(payload.configure)?.departureSlotId)
}

function hasStaffPaymentSchedule(payload: Record<string, unknown>): boolean {
  const staffBooking = record(payload.staffBooking)
  return Array.isArray(staffBooking?.paymentSchedules) && staffBooking.paymentSchedules.length > 0
}

/**
 * What the Commit outcome says about the payment the shopper still owes.
 *
 * `checkout` is carried whole. `redirectUrl` is only the redirect arm's
 * flattened projection and is `null` for an embedded handoff, so a projection
 * that stopped at it would drop the client secret between the adapter and the
 * one outcome the storefront reads — the storefront having just been allowed to
 * ask for that arm at Commit (voyant#4346).
 */
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
  checkout?: BookingPaymentCheckoutV1 | null
  expiresAt: Date | null
}) {
  return {
    id: session.id,
    status: session.status,
    amountCents: session.amountCents,
    currency: session.currency,
    redirectUrl: session.redirectUrl,
    checkout: session.checkout ?? null,
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
    // `CardPaymentBilling.state` — a processor that computes tax from the
    // billing address needs the subdivision, not just the country
    // (voyant#4290).
    state: stringValue(address?.region),
    city: stringValue(address?.city),
    postalCode: stringValue(address?.postal),
    details: stringValue(address?.line1),
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
