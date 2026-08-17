/**
 * Turning an accepted ancillary offer into a charge, and then into a policy.
 *
 * Two halves, on either side of the money, and the split is the whole design:
 *
 *  - {@link prepareBookingAncillaries} runs **after the Booking is committed
 *    and before the traveller pays**. It opens the application at the third
 *    party and writes the premium onto the Booking, so the amount the payment
 *    provider is asked for already contains it.
 *  - {@link fulfillBookingAncillaries} runs **after payment has succeeded**,
 *    from the checkout-finalize saga, and turns the held application into an
 *    issued artifact.
 *
 * `prepare` is a network call to a third party, so it deliberately does not
 * run inside the Booking Session commit transaction. That transaction carries
 * the session state machine and the settlement path (voyant#4733, voyant#4734);
 * an HTTP round trip inside it either holds it open across the call or fails it
 * after money has moved. Checkout-start is the first point at which the Booking
 * exists, nothing has been charged, and a failure is still something the
 * traveller can see and act on.
 *
 * Which is also why the two halves fail in opposite directions. Before the
 * money: a source that cannot open an application must stop checkout, because
 * charging a traveller for insurance that was never applied for is worse than
 * an error page they can retry. After the money: nothing may throw for a
 * business outcome, because the charge has already happened and the booking has
 * to stay intact for an operator to act on.
 */

import type { listBookingPassThroughItems as listBookingPassThroughItemsFn } from "@voyant-travel/bookings"
import {
  type AncillarySelectionV1,
  ancillarySelectionKey,
} from "@voyant-travel/catalog-contracts/booking-engine/ancillary-contracts"
import { sql } from "drizzle-orm"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"

import {
  AncillaryPremiumDriftError,
  type AncillaryPremiumReconciliation,
  isAncillaryItemExpiredAt,
  materializeAncillaryPassThroughItem,
  readAncillaryItemMarker,
  reconcileAncillaryPremium,
  recordAncillaryActivity,
} from "./ancillary-materialization.js"
import type { AncillaryOfferSource } from "./ancillary-ports.js"

/** The contracting party a source needs before it will open an application. */
export interface AncillaryContact {
  firstName: string
  lastName: string
  email: string
  phone?: string
}

/** Raised when an accepted offer could not be turned into a charge. */
export class AncillaryPreparationError extends Error {
  readonly code = "ancillary_preparation_failed"
  constructor(
    readonly sourceId: string,
    readonly reason: unknown,
  ) {
    super(
      `Preparing the accepted ancillary offer from source "${sourceId}" failed: ` +
        (reason instanceof Error ? reason.message : String(reason)),
    )
    this.name = "AncillaryPreparationError"
  }
}

/** Raised when the held application can no longer become a purchase. */
export class AncillaryApplicationExpiredError extends Error {
  readonly code = "ancillary_application_expired"
  constructor(
    readonly sourceId: string,
    readonly expiredAt: string,
  ) {
    super(
      `The held ancillary application from source "${sourceId}" expired at ${expiredAt} and ` +
        "cannot become a purchase; the traveller has to choose again.",
    )
    this.name = "AncillaryApplicationExpiredError"
  }
}

/** Raised when the source can no longer hold the price the traveller accepted. */
export class AncillaryTermsChangedError extends Error {
  readonly code = "ancillary_terms_changed"
  constructor(
    readonly sourceId: string,
    readonly accepted: { priceMinor: number; currency: string },
    readonly offered: { priceMinor: number; currency: string },
  ) {
    super(
      `The ancillary offer from source "${sourceId}" is no longer ` +
        `${accepted.priceMinor} ${accepted.currency} but ` +
        `${offered.priceMinor} ${offered.currency}; charging it would collect terms ` +
        "the traveller never agreed to.",
    )
    this.name = "AncillaryTermsChangedError"
  }
}

export interface PrepareBookingAncillariesInput {
  db: PostgresJsDatabase
  bookingId: string
  /** The Session the Booking came from; the source keys its application to it. */
  bookingSessionId: string
  /** Whatever the deployment bound. Empty is the normal, silent case. */
  sources: readonly AncillaryOfferSource[]
  /** The accepted decisions, read by whoever owns the Session rows. */
  accepted: readonly AncillarySelectionV1[]
  /** Injected so expiry is evaluated against one instant, and stays testable. */
  now?: () => Date
  /**
   * The contracting party.
   *
   * Passed in rather than read off the selection here, because the caller can
   * see both the Session's billing step and the Booking's own contact columns —
   * and a blank name reaching the insurer is an application rejected for a
   * reason the traveller cannot tell apart from being declined.
   */
  contact: AncillaryContact
  /** Existing pass-through lines, so a re-entered checkout charges once. */
  /**
   * Re-read INSIDE the lock rather than handed in as a snapshot.
   *
   * A snapshot taken by the caller is exactly the stale view the lock exists to
   * defeat: the second request would hold the lock and still act on a list read
   * before the first one inserted.
   */
  listPassThroughItems: typeof listBookingPassThroughItemsFn
  /**
   * Namespaced tax treatment for the premium line, e.g. `"insurance/exempt"`.
   * Resolved by whoever knows the treatment for this source's kind; commerce
   * writes whatever comes back through untouched.
   */
  resolveTaxTreatmentCode?: (source: AncillaryOfferSource) => string | null | undefined
}

export interface PreparedBookingAncillary {
  bookingItemId: string
  sourceId: string
  providerId: string
  applicationRef: string
  priceMinor: number
  currency: string
}

export interface PrepareBookingAncillariesResult {
  /** Lines written by this call. Empty when everything was already charged. */
  prepared: PreparedBookingAncillary[]
  /** Accepted selections that already had a line, keyed by selection. */
  alreadyCharged: string[]
  /**
   * Accepted selections whose source is no longer bound.
   *
   * Not an error: an operator may disconnect a provider between the offer and
   * the checkout, and there is then nobody to open the application with. The
   * traveller is simply not charged for it, which is the only outcome that
   * cannot leave them paying for nothing.
   */
  unresolvedSources: string[]
}

/**
 * Open an application per accepted offer and put its premium on the Booking.
 *
 * `priceMinor` from `prepare` is what gets charged. It is authoritative by
 * contract — a source that can no longer hold what it quoted returns the price
 * it can hold — and nothing between here and the invoice may adjust it.
 */
export async function prepareBookingAncillaries(
  input: PrepareBookingAncillariesInput,
): Promise<PrepareBookingAncillariesResult> {
  const empty: PrepareBookingAncillariesResult = {
    prepared: [],
    alreadyCharged: [],
    unresolvedSources: [],
  }
  if (input.sources.length === 0 || input.accepted.length === 0) return empty

  // Serialised per Booking, because the check and the insert are not one
  // statement. Two overlapping `/checkout/start` calls both read an
  // `existingItems` snapshot with no line for the selection, and both then
  // insert one: `booking_items` has no uniqueness to catch it, the provider's
  // idempotency key deduplicates the application but not the row, and the
  // recomputed total charges the premium twice.
  //
  // A session-level advisory lock rather than a transaction: `prepare` is an
  // HTTP call to a third party and must not run inside an open transaction.
  // The second caller waits, then sees the marker and takes the skip.
  return withBookingAncillaryLock(input.db, input.bookingId, () => prepareUnderLock(input))
}

/**
 * Hold a Postgres advisory lock for the duration of `operation`.
 *
 * Released in `finally` so a throw — which is the normal way this path reports
 * a refusal — cannot leave the next checkout blocked on a lock nobody holds any
 * intent over.
 */
async function withBookingAncillaryLock<T>(
  db: PostgresJsDatabase,
  bookingId: string,
  operation: () => Promise<T>,
): Promise<T> {
  const key = sql`hashtextextended(${`ancillary-prepare:${bookingId}`}, 0)`
  await db.execute(sql`select pg_advisory_lock(${key})`)
  try {
    return await operation()
  } finally {
    await db.execute(sql`select pg_advisory_unlock(${key})`)
  }
}

async function prepareUnderLock(
  input: PrepareBookingAncillariesInput,
): Promise<PrepareBookingAncillariesResult> {
  const result: PrepareBookingAncillariesResult = {
    prepared: [],
    alreadyCharged: [],
    unresolvedSources: [],
  }
  const accepted = input.accepted

  const now = input.now?.() ?? new Date()
  const charged = new Set<string>()
  const existingItems = await input.listPassThroughItems(input.db, input.bookingId)
  for (const item of existingItems) {
    const marker = readAncillaryItemMarker(item.metadata)
    if (!marker?.selectionKey) continue
    // An already-charged line whose application has expired cannot become an
    // artifact, and the skip below would carry it silently through to payment.
    // Refusing here is the only outcome that does not charge for nothing.
    if (isAncillaryItemExpiredAt(marker, now)) {
      throw new AncillaryApplicationExpiredError(marker.sourceId, marker.expiresAt ?? "")
    }
    charged.add(marker.selectionKey)
  }

  const { contact, bookingSessionId } = input

  for (const selection of accepted) {
    const key = ancillarySelectionKey(selection)
    if (!key) continue
    if (charged.has(key)) {
      result.alreadyCharged.push(key)
      continue
    }

    const source = input.sources.find((candidate) => candidate.sourceId === selection.sourceId)
    if (!source) {
      result.unresolvedSources.push(key)
      continue
    }

    let prepared: Awaited<ReturnType<AncillaryOfferSource["prepare"]>>
    try {
      prepared = await source.prepare({
        bookingSessionId,
        selection,
        contact: {
          firstName: contact.firstName,
          lastName: contact.lastName,
          email: contact.email,
          ...(contact.phone ? { phone: contact.phone } : {}),
        },
        // Derived from the Booking and the offer, never random: a customer who
        // hits Back and resubmits reaches the third party with the same key and
        // gets the same application rather than a second one.
        idempotencyKey: `ancillary-prepare:${input.bookingId}:${key}`,
      })
    } catch (error) {
      throw new AncillaryPreparationError(selection.sourceId ?? source.sourceId, error)
    }

    // The source is allowed to come back with a price it can still hold. It is
    // not allowed to have that price charged without the traveller agreeing to
    // it, so a change stops checkout instead of quietly re-pricing the booking.
    if (
      selection.acceptedPriceMinor !== undefined &&
      selection.acceptedCurrency !== undefined &&
      (prepared.priceMinor !== selection.acceptedPriceMinor ||
        prepared.currency !== selection.acceptedCurrency)
    ) {
      throw new AncillaryTermsChangedError(
        source.sourceId,
        { priceMinor: selection.acceptedPriceMinor, currency: selection.acceptedCurrency },
        { priceMinor: prepared.priceMinor, currency: prepared.currency },
      )
    }

    const materialized = await materializeAncillaryPassThroughItem(input.db, {
      bookingId: input.bookingId,
      selection: prepared,
      taxTreatmentCode: input.resolveTaxTreatmentCode?.(source) ?? null,
      selectionKey: key,
    })
    if (!materialized) {
      throw new AncillaryPreparationError(
        source.sourceId,
        new Error("The prepared ancillary premium produced no booking line."),
      )
    }

    charged.add(key)
    result.prepared.push({
      bookingItemId: materialized.bookingItemId,
      sourceId: prepared.sourceId,
      providerId: prepared.providerId,
      applicationRef: prepared.applicationRef,
      priceMinor: prepared.priceMinor,
      currency: prepared.currency,
    })
  }

  return result
}

export interface FulfillBookingAncillariesInput {
  db: PostgresJsDatabase
  bookingId: string
  sources: readonly AncillaryOfferSource[]
  listPassThroughItems: typeof listBookingPassThroughItemsFn
}

export interface FulfilledBookingAncillary {
  bookingItemId: string
  applicationRef: string
  sourceId: string
  status: "fulfilled" | "not_fulfilled" | "drifted" | "source_not_bound"
  /** The supplier's reference, for a fulfilment that produced one. */
  reference?: string
  /** Documents the source attached through the booking-document path. */
  documentIds?: string[]
  code?: string
  message?: string
  retryable?: boolean
}

export interface FulfillBookingAncillariesResult {
  outcomes: FulfilledBookingAncillary[]
}

/**
 * Issue every prepared ancillary on a paid Booking, and reconcile each one.
 *
 * Nothing here throws for a supplier outcome. This runs after the traveller has
 * been charged, so a refusal, an outage or a premium that does not match is a
 * result to record — `reconcileAncillaryPremium` writes each of them to the
 * booking's activity log, and the source's own failure path records
 * `issue_failed` and raises the staff alert. Throwing would re-run an issue
 * that has already reached the supplier.
 */
export async function fulfillBookingAncillaries(
  input: FulfillBookingAncillariesInput,
): Promise<FulfillBookingAncillariesResult> {
  // Deliberately NOT short-circuited on an empty source list. A charged line
  // whose source is unbound at delivery time — a deployment or configuration
  // change between the charge and `payment.completed` — would otherwise be
  // skipped, the saga would complete, `completedAt` would be recorded, and
  // redelivery after the source came back would return early. The traveller
  // would have paid for an artifact nobody ever issues, and nothing would say
  // so. Inspecting the lines anyway turns that into an actionable record.
  const outcomes: FulfilledBookingAncillary[] = []
  const items = await input.listPassThroughItems(input.db, input.bookingId)
  for (const item of items) {
    const marker = readAncillaryItemMarker(item.metadata)
    if (!marker) continue

    const source = input.sources.find((candidate) => candidate.sourceId === marker.sourceId)
    if (!source) {
      // On the booking, not merely in the step output: the saga's own record is
      // not somewhere an operator looks, and this is money already taken.
      await recordAncillaryActivity(input.db, input.bookingId, {
        event: "ancillary.fulfillment.unresolved",
        description:
          `A paid ancillary could not be issued: no source is bound for ` +
          `"${marker.sourceId}". It stays unfulfilled until one is.`,
        metadata: {
          bookingItemId: item.bookingItemId,
          applicationRef: marker.applicationRef,
          sourceId: marker.sourceId,
          chargedPriceMinor: item.priceMinor,
          currency: item.currency,
          retryable: true,
        },
      })
      outcomes.push({
        bookingItemId: item.bookingItemId,
        applicationRef: marker.applicationRef,
        sourceId: marker.sourceId,
        status: "source_not_bound",
        message: `No ancillary source is bound for "${marker.sourceId}".`,
        retryable: true,
      })
      continue
    }

    const result = await source.fulfill({
      bookingId: input.bookingId,
      applicationRef: marker.applicationRef,
      sourceId: marker.sourceId,
      chargedPriceMinor: item.priceMinor,
      currency: item.currency,
      // Stable across retries for the same reason `prepare`'s is: a retried
      // issue that produces a second policy is a second real charge.
      idempotencyKey: `ancillary-fulfill:${input.bookingId}:${item.bookingItemId}`,
    })

    let reconciliation: AncillaryPremiumReconciliation | null = null
    try {
      reconciliation = await reconcileAncillaryPremium(input.db, {
        bookingId: input.bookingId,
        bookingItemId: item.bookingItemId,
        chargedPriceMinor: item.priceMinor,
        currency: item.currency,
        result,
      })
    } catch (error) {
      if (!(error instanceof AncillaryPremiumDriftError)) throw error
      // Recorded on the booking by `reconcileAncillaryPremium` before it threw,
      // and carried out of the saga step here. Rethrowing would fail a step
      // that runs after a captured payment and after an issued policy, and the
      // retry would ask the supplier to issue again.
      outcomes.push({
        bookingItemId: item.bookingItemId,
        applicationRef: marker.applicationRef,
        sourceId: marker.sourceId,
        status: "drifted",
        code: error.code,
        message: error.message,
        retryable: false,
      })
      continue
    }

    if (reconciliation.status === "not_fulfilled") {
      outcomes.push({
        bookingItemId: item.bookingItemId,
        applicationRef: marker.applicationRef,
        sourceId: marker.sourceId,
        status: "not_fulfilled",
        code: reconciliation.code,
        message: reconciliation.message,
        retryable: reconciliation.retryable,
      })
      continue
    }

    outcomes.push({
      bookingItemId: item.bookingItemId,
      applicationRef: marker.applicationRef,
      sourceId: marker.sourceId,
      status: "fulfilled",
      reference: reconciliation.reference,
      ...(result.status === "fulfilled" ? { documentIds: result.documentIds } : {}),
    })
  }

  return { outcomes }
}
