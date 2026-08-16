import type { BookingPaymentCheckoutV1 } from "@voyant-travel/catalog-contracts/booking-engine/lifecycle-conformance"
import type { BookingSessionTargetV1 } from "@voyant-travel/catalog-contracts/booking-engine/session-contracts"
import { identifiedUserId } from "@voyant-travel/core"
import type {
  ComputedScheduleEntry,
  PaymentAdapter,
  PaymentAdapterRuntimeContext,
  PaymentPolicy,
} from "@voyant-travel/finance"
import {
  computePaymentSchedule,
  createOrReuseBookingSessionPayment,
  expirePendingBookingSessionPayments,
  financeService,
  findEstablishedBookingSessionPayment,
  findLiveBookingSessionPayment,
  hasInFlightBookingSessionPayment,
  noDepositPolicy,
  resolveEffectivePaymentPolicy,
  resolvePaymentCallbackUrl,
  startPaymentAdapterCardPayment,
  transferBookingSessionPaymentToBooking,
} from "@voyant-travel/finance"
import type { FinanceOperatorSettingsRuntime } from "@voyant-travel/finance/runtime-port"
import { and, eq } from "drizzle-orm"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"

import type {
  CatalogDistributionRuntimeExtension,
  CatalogEntityPaymentPolicyReaders,
  CatalogInventoryRuntimeExtension,
} from "../runtime-contracts.js"
import { catalogSourcedEntriesTable } from "../schema-sourced-entries.js"
import type {
  BookingSessionCompositeHandler,
  BookingSessionPaymentPorts,
  BookingSessionTargetPaymentContext,
} from "./sessions-service.js"

export interface ProductionBookingSessionPaymentDeps {
  db: PostgresJsDatabase
  inventory: Pick<
    CatalogInventoryRuntimeExtension,
    "loadProductPaymentPolicyContext" | "resolveSelectedDepartureDate"
  >
  distribution: Pick<CatalogDistributionRuntimeExtension, "loadSupplierPaymentPolicy">
  settings: Pick<FinanceOperatorSettingsRuntime, "resolveOperatorDefaultPaymentPolicy">
  /**
   * The entity-keyed cascade layers — the same three the storefront's
   * policy-preview route walks, keyed by the listing a Session targets rather
   * than by a Booking that does not exist yet.
   *
   * Injected rather than imported, for the reason
   * `payment-policy-cascade.ts` gives: resolving an accommodation rate plan or
   * a cruise cabin → sailing → cruise layer reads tables this package must not
   * depend on.
   *
   * Absent means those layers are simply silent and a non-product target
   * resolves on the operator default alone — the cascade's own tail, which is
   * still a policy. It is not a reason to collect nothing.
   */
  entityPolicy?: CatalogEntityPaymentPolicyReaders
  /**
   * The composite handler that owns Trip Snapshot targets, so a Trip can state
   * its own policy context. Resolved lazily because the handler is registered
   * by the trips module after the session module is constructed.
   */
  resolveCompositeHandler?: () =>
    | BookingSessionCompositeHandler
    | undefined
    | Promise<BookingSessionCompositeHandler | undefined>
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
      // A vertical that states it has no policy context for this target
      // collects nothing. That is the one honest `not_required` for a target
      // kind — it is the vertical's answer, not this port's enum check
      // (voyant#4745).
      if (plan.kind === "declined") return { kind: "not_required" }
      if (plan.kind === "target_gone") {
        throw new Error("booking_session_payment_target_not_found")
      }
      const { context, resolved, departureDate, entries } = plan
      const payInFull = commit.payInFull === true
      const dueNow = collectNow(entries, { payInFull, totalCents: quote.pricing.total })
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

      // A Session collects one amount at a time.
      //
      // Commit is the one lifecycle action `rejectWhilePaymentInFlight` does
      // not guard — renewing, reselecting, quoting, holding and abandoning all
      // refuse while money is with a processor, but a Commit may always be
      // retried, which is what lets a dropped response be finished. That was
      // safe while every Commit on a Session asked for the same money. Offering
      // the shopper a second amount ends that: click "Pay deposit", go back,
      // click "Pay in full" — under a new idempotency key, which the request
      // fingerprint now requires — and the lookups above both miss. The
      // established lookup matches only settled money *at this amount*, and
      // `createOrReuseBookingSessionPayment` is keyed on the Commit, so a second
      // live checkout opens beside the first and both can capture. The worse
      // sibling needs no second tab: a shopper who already paid the deposit and
      // then asks to pay in full is charged the whole total on top of it.
      //
      // Refusing is the same answer the Session already gives everywhere else,
      // and it resolves by itself the moment the first payment does — in either
      // direction. Retrying *this* Commit is untouched: a payment already
      // established under this idempotency key is the one being retried, not a
      // competing one, and `createOrReuseBookingSessionPayment` reuses it (or
      // refuses on its own idempotency grounds if the amount moved under it).
      const live = await findLiveBookingSessionPayment(deps.db, session.id, now)
      if (
        live &&
        stringValue(record(live.metadata)?.commitIdempotencyKey) !== commit.idempotencyKey &&
        (live.amountCents !== dueNow.amountCents || live.currency !== dueNow.currency)
      ) {
        throw new Error("booking_session_payment_amount_in_flight")
      }

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
            // The shopper's own choice, not the policy's. `paymentScheduleType`
            // cannot stand in for it: a policy that never offered a deposit
            // also reads `full`, and settlement has to re-derive the same
            // amount it collected, not the amount the policy would ask for.
            ...(payInFull ? { payInFull: true } : {}),
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
      // A listing that has since gone, or a vertical with no policy context:
      // the Quote simply carries no plan. Commit throws on the first because
      // it is about to take money; a projection has nothing to protect.
      if (plan.kind !== "plan") return null
      const [dueNow] = plan.entries
      if (!dueNow) return null
      return {
        policySource: plan.resolved.source,
        currency: pricing.currency,
        totalCents: pricing.total,
        dueNowCents: dueNow.amountCents,
        // The second button, and only when it says something the first does
        // not: a plan that already collects the whole total now offers no
        // choice, and advertising one would render two identical options.
        payInFullCents: dueNow.amountCents < pricing.total ? pricing.total : null,
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
        // Settlement re-runs `prepare` and re-checks the amount it is settling
        // against a freshly derived plan. Without this the derivation would
        // come back to the policy's deposit while the processor holds the
        // whole total, and every pay-in-full checkout would fail to settle.
        payInFull: metadata.payInFull === true,
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
 * The one instalment Commit collects, given what the policy asked for and what
 * the shopper chose.
 *
 * Absent a choice this is `entries[0]` — the policy's own first row, exactly as
 * before. `payInFull` collapses the deposit/balance pair into the single `full`
 * row the shopper asked for, because a deposit is an option the operator
 * extends and not an obligation to place on the buyer (voyant#4742).
 *
 * The choice may only ever *increase* what is collected, and that is checked
 * rather than assumed. `resolveDepositAmountCents` clamps a deposit to the
 * total today, so nothing can currently reach the throw — but the flag arrives
 * from a browser and the thing it moves is money, which is the wrong pair of
 * facts to leave resting on a clamp in another package. A policy that grew a
 * surcharge, or a total that moved under the plan, would otherwise let a client
 * quietly pay less by asking to pay "in full".
 *
 * The collapsed row keeps `entries[0]`'s due date rather than formatting one:
 * `computePaymentSchedule` already dates the first instalment as due today, and
 * a second clock here is a second answer.
 */
function collectNow(
  entries: ComputedScheduleEntry[],
  request: { payInFull: boolean; totalCents: number },
): ComputedScheduleEntry | undefined {
  const dueNow = entries[0]
  if (!dueNow || !request.payInFull) return dueNow
  const amountCents = Math.max(0, Math.round(request.totalCents))
  if (amountCents < dueNow.amountCents) {
    throw new Error("booking_session_pay_in_full_collects_less_than_policy")
  }
  return { ...dueNow, scheduleType: "full", amountCents }
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
 * The Session shape both plan derivations read. Structural rather than the
 * full internal record so `describePlan`'s stateless Offer Preview caller can
 * pass what it has.
 */
type PlanSession = {
  target: BookingSessionTargetV1
  scope: { locale: string }
  statePayload: Record<string, unknown>
}

/**
 * What a Session's target contributed, or why it contributed nothing.
 *
 * `target_gone` and `declined` are different facts and the callers treat them
 * differently. The listing having disappeared under a live Session is a
 * failure; a vertical stating it has no payment context yet is an answer.
 */
type ResolvedPlan =
  | {
      kind: "plan"
      context: BookingSessionTargetPaymentContext
      resolved: ReturnType<typeof resolveEffectivePaymentPolicy>
      departureDate: string | null
      entries: ReturnType<typeof computePaymentSchedule>
    }
  | { kind: "target_gone" }
  | { kind: "declined" }

/**
 * The collection plan for a Session, and everything that went into it.
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
 * The cascade and the schedule are computed once here, for every target kind.
 * Which layers a target contributes is the only thing that differs, and that is
 * {@link resolveTargetPaymentContext}'s job — up to voyant#4745 the difference
 * was instead "product, or nothing at all".
 */
async function resolvePlan(
  deps: ProductionBookingSessionPaymentDeps,
  session: PlanSession,
  pricing: { total: number; currency: string },
  /**
   * The instant the plan is measured from. Both callers pass the Quote's own
   * `quotedAt`, so the plan published on a Quote and the plan charged against
   * it are the same function of the same inputs.
   */
  asOf: Date,
): Promise<ResolvedPlan> {
  const resolution = await resolveTargetPaymentContext(deps, session)
  if (resolution.kind !== "resolved") return resolution
  const { context } = resolution
  const operatorDefault = await deps.settings.resolveOperatorDefaultPaymentPolicy(deps.db)
  const resolved = resolveEffectivePaymentPolicy({
    listingPolicy: context.listingPolicy,
    categoryPolicy: context.categoryPolicy,
    supplierPolicy: context.supplierPolicy,
    operatorDefault: operatorDefault ?? noDepositPolicy,
  })
  const entries = computePaymentSchedule(
    {
      totalCents: pricing.total,
      currency: pricing.currency,
      departureDate: context.departureDate,
      today: asOf,
    },
    resolved.policy,
  )
  return { kind: "plan", context, resolved, departureDate: context.departureDate, entries }
}

/**
 * Which cascade layers the Session's target contributes, and the two facts the
 * schedule is anchored on — when the shopper travels, and what they are paying
 * for.
 *
 * Dispatches on the target kind because that is what decides *where the layers
 * are read from*, not whether they are read at all. `bookingSessionTargetV1`
 * admits four kinds and only one of them had an answer here, so an
 * accommodation, a cruise cabin or a composite trip committed with no payment
 * session and no card ever presented (voyant#4745).
 */
async function resolveTargetPaymentContext(
  deps: ProductionBookingSessionPaymentDeps,
  session: PlanSession,
): Promise<
  | { kind: "resolved"; context: BookingSessionTargetPaymentContext }
  | { kind: "target_gone" }
  | {
      kind: "declined"
    }
> {
  const target = session.target
  switch (target.kind) {
    case "product":
      return resolveProductPaymentContext(deps, session, target.productId)
    case "owned_entity":
      // An owned product reached through the generic arm is still a product,
      // and its own reader answers with the category layer and a localized
      // name that the generic entity cascade has no way to produce.
      return target.entityModule === "products"
        ? resolveProductPaymentContext(deps, session, target.entityId)
        : resolveEntityPaymentContext(deps, session, {
            entityModule: target.entityModule,
            entityId: target.entityId,
          })
    case "catalog_item":
      return resolveSourcedPaymentContext(deps, session, target.catalogItemId)
    case "trip_snapshot":
      return resolveTripPaymentContext(deps, session, target)
  }
}

/**
 * The product cascade: the listing's own policy, its first category's, and its
 * supplier's — plus the departure the *selection* buys, which is a different
 * question from what the listing advertises (voyant#4740).
 */
async function resolveProductPaymentContext(
  deps: ProductionBookingSessionPaymentDeps,
  session: PlanSession,
  productId: string,
): Promise<
  { kind: "resolved"; context: BookingSessionTargetPaymentContext } | { kind: "target_gone" }
> {
  const [context, departureDate] = await Promise.all([
    deps.inventory.loadProductPaymentPolicyContext(deps.db, productId, {
      locale: session.scope.locale,
    }),
    deps.inventory.resolveSelectedDepartureDate(deps.db, {
      productId,
      departureSlotId: selectedDepartureSlotId(session.statePayload),
    }),
  ])
  if (!context) return { kind: "target_gone" }
  const supplierPolicy = context.supplierId
    ? await deps.distribution.loadSupplierPaymentPolicy(deps.db, context.supplierId)
    : null
  return {
    kind: "resolved",
    context: {
      listingPolicy: context.listingPolicy,
      categoryPolicy: context.categoryPolicy,
      supplierPolicy,
      departureDate,
      name: context.name,
    },
  }
}

/**
 * The cascade for an owned vertical's listing, keyed the way the storefront's
 * own policy preview keys it: the entity, plus the journey selections that
 * decide which layer of it applies — a rate plan for a stay, a cabin category
 * and sailing for a cruise. `PaymentPolicyEntityContext` exists for exactly
 * this and the readers already walk it.
 *
 * The departure is deliberately **not** taken from the Session's selection.
 * `configure.departureDate` is client-supplied, and the deposit gate is a
 * distance-to-departure test, so honouring it would let a shopper name a date
 * far enough out to buy a deposit on a stay that starts next week. Without a
 * date `computePaymentSchedule` collects the full total, which is the
 * fail-closed answer: an over-collection is refundable and is quoted to the
 * shopper before they accept, an under-collection is money that never arrives.
 * A vertical that wants its deposit honoured supplies the date through
 * `describeEntity`.
 */
async function resolveEntityPaymentContext(
  deps: ProductionBookingSessionPaymentDeps,
  session: PlanSession,
  entity: { entityModule: string; entityId: string },
): Promise<{ kind: "resolved"; context: BookingSessionTargetPaymentContext }> {
  const readers = deps.entityPolicy
  const context = { ...entity, ...journeySelections(session.statePayload) }
  const [listingPolicy, categoryPolicy, supplierPolicy, described] = await Promise.all([
    readers?.resolveListingPolicyForEntity(deps.db, context) ?? nullPolicy(),
    readers?.resolveCategoryPolicyForEntity(deps.db, context) ?? nullPolicy(),
    readers?.resolveSupplierPolicyForEntity(deps.db, context) ?? nullPolicy(),
    readers?.describeEntity?.(deps.db, context, { locale: session.scope.locale }) ?? null,
  ])
  return {
    kind: "resolved",
    context: {
      listingPolicy,
      categoryPolicy,
      supplierPolicy,
      departureDate: described?.departureDate ?? null,
      name: described?.name ?? null,
    },
  }
}

/**
 * A sourced target resolved to the entity behind it, then through the same
 * entity cascade.
 *
 * The row is read here rather than through a reader because
 * `catalog_sourced_entries` is this package's own table. Its `projection` is
 * the local copy of what the adapter returned, which is where the name on the
 * shopper's checkout page comes from — a sourced entry has no `products` row
 * to read one off.
 *
 * An entry that has been withdrawn under a live Session is left to the Commit
 * arm, which owns the question and answers it as `entity_not_bookable`. Failing
 * here instead would replace that rejection with an unhandled error for the same
 * fact, and there is no money at stake in a target nothing can commit.
 */
async function resolveSourcedPaymentContext(
  deps: ProductionBookingSessionPaymentDeps,
  session: PlanSession,
  catalogItemId: string,
): Promise<
  { kind: "resolved"; context: BookingSessionTargetPaymentContext } | { kind: "declined" }
> {
  const [row] = await deps.db
    .select({
      entityModule: catalogSourcedEntriesTable.entity_module,
      entityId: catalogSourcedEntriesTable.entity_id,
      projection: catalogSourcedEntriesTable.projection,
    })
    .from(catalogSourcedEntriesTable)
    .where(
      and(
        eq(catalogSourcedEntriesTable.entity_id, catalogItemId),
        eq(catalogSourcedEntriesTable.status, "active"),
      ),
    )
    .limit(1)
  if (!row) return { kind: "declined" }
  const resolution = await resolveEntityPaymentContext(deps, session, {
    entityModule: row.entityModule,
    entityId: row.entityId,
  })
  const name =
    resolution.context.name ?? stringValue(row.projection.name) ?? stringValue(row.projection.title)
  return { kind: "resolved", context: { ...resolution.context, name } }
}

/**
 * A composite itinerary states its own context, through the handler that owns
 * it. One Trip is one total and one departure, so the policy resolves from the
 * Trip rather than per component — several deposits with different due dates
 * for one itinerary is not a schedule.
 *
 * A handler that does not describe one has decided the Trip collects nothing,
 * which is what `declined` says.
 */
async function resolveTripPaymentContext(
  deps: ProductionBookingSessionPaymentDeps,
  session: PlanSession,
  target: { tripSnapshotId: string; tripEnvelopeId: string },
): Promise<
  { kind: "resolved"; context: BookingSessionTargetPaymentContext } | { kind: "declined" }
> {
  const handler = await deps.resolveCompositeHandler?.()
  const context = await handler?.describePaymentContext?.({
    db: deps.db,
    tripSnapshotId: target.tripSnapshotId,
    tripEnvelopeId: target.tripEnvelopeId,
    locale: session.scope.locale,
  })
  return context ? { kind: "resolved", context } : { kind: "declined" }
}

/** The cascade keys a journey selection carries, for the readers that walk them. */
function journeySelections(payload: Record<string, unknown>): {
  sailingId?: string
  cabinCategoryId?: string
  ratePlanId?: string
} {
  const configure = record(payload.configure)
  const sailingId = stringValue(configure?.sailingId)
  const cabinCategoryId = stringValue(configure?.cabinCategoryId)
  // A stay names its rate plan per room; the cascade takes one, and the first
  // selected room is the one the storefront preview would have sent.
  const rooms = record(payload.accommodation)?.rooms
  const firstRoom = Array.isArray(rooms) ? record(rooms[0]) : undefined
  const ratePlanId = stringValue(configure?.ratePlanId) ?? stringValue(firstRoom?.ratePlanId)
  return {
    ...(sailingId ? { sailingId } : {}),
    ...(cabinCategoryId ? { cabinCategoryId } : {}),
    ...(ratePlanId ? { ratePlanId } : {}),
  }
}

async function nullPolicy(): Promise<PaymentPolicy | null> {
  return null
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
