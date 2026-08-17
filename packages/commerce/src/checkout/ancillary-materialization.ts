/**
 * Turning a prepared ancillary selection into a booking line, and then holding
 * that line to what the supplier actually settled.
 *
 * The premium is written as a `pass_through` line: sell equals cost, so there
 * is no margin for a markup rule to find and no basis for a commission, and
 * the tax treatment travels on the row instead of being resolved from the
 * operator's policy. The traveller ends up reading two documents side by side
 * — the booking total and the third party's own certificate — and they have to
 * agree to the minor unit.
 *
 * Which is also why reconciliation refuses to be helpful. If the amount
 * charged and the amount settled differ, the honest outcomes are both bad:
 * adjusting the booking changes what the traveller already paid, and adjusting
 * nothing leaves the operator short. Choosing either silently is what turns a
 * one-cent rounding difference into an accounting problem nobody finds for a
 * quarter. So the drift is recorded where an operator will see it, and the
 * caller is made to deal with it.
 *
 * The line and the activity row are both written through bookings' own
 * service. `booking_items` is bookings' table, and the pass-through invariant
 * — cost equal to sell, treatment stamped on the row — belongs next to it
 * rather than in every module that sells something it did not price.
 */

import { addBookingPassThroughItem, recordBookingSystemActivity } from "@voyant-travel/bookings"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"

import type { AncillaryFulfillmentResult, AncillaryPreparedSelection } from "./ancillary-ports.js"

export interface MaterializeAncillaryPassThroughItemInput {
  bookingId: string
  /** What the source committed to, from `AncillaryOfferSource.prepare`. */
  selection: AncillaryPreparedSelection
  /**
   * Namespaced tax treatment for the line, e.g. `"insurance/exempt"`. Set by
   * whoever knows the treatment; commerce writes it through untouched.
   */
  taxTreatmentCode?: string | null
  /**
   * The offer this line came from, as `sourceId::providerId::offerId`.
   *
   * Stamped so re-entering checkout can recognise a selection it has already
   * charged for. `applicationRef` cannot answer that question: it is minted by
   * `prepare`, so it only exists once the insurer has already been asked, and
   * asking twice is the thing being prevented.
   */
  selectionKey?: string | null
}

export interface MaterializedAncillaryItem {
  bookingItemId: string
}

/**
 * Write the prepared premium onto the booking as a pass-through line.
 *
 * `priceMinor` from `prepare` is authoritative — it is what the booking
 * charges and what the issued artifact has to agree with. Nothing between here
 * and the invoice may adjust it.
 */
export async function materializeAncillaryPassThroughItem(
  db: PostgresJsDatabase,
  input: MaterializeAncillaryPassThroughItemInput,
): Promise<MaterializedAncillaryItem | null> {
  const { selection } = input
  return addBookingPassThroughItem(db, {
    bookingId: input.bookingId,
    title: selection.title,
    priceMinor: selection.priceMinor,
    currency: selection.currency,
    taxTreatmentCode: input.taxTreatmentCode ?? null,
    sourceOfferId: selection.applicationRef,
    metadata: {
      ancillary: {
        sourceId: selection.sourceId,
        providerId: selection.providerId,
        applicationRef: selection.applicationRef,
        expiresAt: selection.expiresAt,
        ...(input.selectionKey ? { selectionKey: input.selectionKey } : {}),
      },
    },
  })
}

/** What a pass-through line records about the ancillary that produced it. */
export interface AncillaryItemMarker {
  sourceId: string
  providerId: string
  applicationRef: string
  selectionKey?: string
  /**
   * When the held application stops being able to become a purchase.
   *
   * Read back off the line, not merely written to it: a traveller who returns
   * to checkout after this instant would otherwise be charged for a premium
   * nothing can fulfil, and the first anyone hears of it is the failed issue
   * after the money has moved.
   */
  expiresAt?: string
}

/**
 * Read the marker back off a pass-through line's metadata.
 *
 * Returns `null` for a pass-through line that is not an ancillary at all — the
 * treatment is shared with anything else the operator collects rather than
 * prices, so the marker, not the treatment, is what identifies these.
 */
export function readAncillaryItemMarker(
  metadata: Record<string, unknown> | null | undefined,
): AncillaryItemMarker | null {
  const ancillary = metadata?.ancillary
  if (ancillary === null || typeof ancillary !== "object") return null
  const candidate = ancillary as Record<string, unknown>
  const sourceId = candidate.sourceId
  const providerId = candidate.providerId
  const applicationRef = candidate.applicationRef
  if (
    typeof sourceId !== "string" ||
    typeof providerId !== "string" ||
    typeof applicationRef !== "string"
  ) {
    return null
  }
  return {
    sourceId,
    providerId,
    applicationRef,
    ...(typeof candidate.selectionKey === "string" ? { selectionKey: candidate.selectionKey } : {}),
    ...(typeof candidate.expiresAt === "string" ? { expiresAt: candidate.expiresAt } : {}),
  }
}

/**
 * Whether a charged line can still become an issued artifact.
 *
 * A line with no recorded expiry is treated as live: the field is optional on
 * the marker, and refusing checkout over a line written before it existed would
 * strand bookings for a fact nobody recorded.
 */
export function isAncillaryItemExpiredAt(marker: AncillaryItemMarker, at: Date): boolean {
  if (!marker.expiresAt) return false
  const expiresAt = Date.parse(marker.expiresAt)
  return Number.isFinite(expiresAt) && expiresAt <= at.getTime()
}

export type AncillaryPremiumReconciliation =
  | {
      status: "matched"
      bookingItemId: string
      chargedPriceMinor: number
      settledPriceMinor: number
      currency: string
      reference: string
    }
  | {
      status: "not_fulfilled"
      bookingItemId: string
      code: string
      message: string
      retryable: boolean
    }

/**
 * Raised when the premium charged and the premium settled disagree.
 *
 * Carries both sides so the caller does not have to re-derive them to report
 * the discrepancy. One minor unit is a discrepancy: there is no tolerance
 * band, because a tolerance band is just a smaller silent adjustment.
 */
export class AncillaryPremiumDriftError extends Error {
  readonly code = "ancillary_premium_drift"
  constructor(
    readonly bookingItemId: string,
    readonly chargedPriceMinor: number,
    readonly settledPriceMinor: number,
    readonly chargedCurrency: string,
    readonly settledCurrency: string,
  ) {
    super(
      `Ancillary premium drift on booking item ${bookingItemId}: charged ` +
        `${chargedPriceMinor} ${chargedCurrency}, supplier settled ` +
        `${settledPriceMinor} ${settledCurrency}.`,
    )
    this.name = "AncillaryPremiumDriftError"
  }
}

export interface ReconcileAncillaryPremiumInput {
  bookingId: string
  bookingItemId: string
  /** What the booking charged — the pass-through line's sell amount. */
  chargedPriceMinor: number
  currency: string
  result: AncillaryFulfillmentResult
}

/**
 * Compare the charged premium against what `fulfill` reports was settled.
 *
 * A failed fulfilment is recorded and returned, not thrown: it happens after
 * the money has been taken, and the booking has to stay intact so an operator
 * can act on it. Drift is recorded *and* thrown, because unlike a failure it
 * looks like success from every other angle.
 */
export async function reconcileAncillaryPremium(
  db: PostgresJsDatabase,
  input: ReconcileAncillaryPremiumInput,
): Promise<AncillaryPremiumReconciliation> {
  const { result } = input

  if (result.status === "failed") {
    await recordAncillaryActivity(db, input.bookingId, {
      event: "ancillary.fulfillment.failed",
      description: `Ancillary fulfilment failed after payment (${result.code}).`,
      metadata: {
        bookingItemId: input.bookingItemId,
        code: result.code,
        message: result.message,
        retryable: result.retryable,
        chargedPriceMinor: input.chargedPriceMinor,
        currency: input.currency,
      },
    })
    return {
      status: "not_fulfilled",
      bookingItemId: input.bookingItemId,
      code: result.code,
      message: result.message,
      retryable: result.retryable,
    }
  }

  const drifted =
    result.settledPriceMinor !== input.chargedPriceMinor || result.currency !== input.currency

  if (drifted) {
    await recordAncillaryActivity(db, input.bookingId, {
      event: "ancillary.premium.drift",
      description:
        `Ancillary premium drift: charged ${input.chargedPriceMinor} ${input.currency}, ` +
        `supplier settled ${result.settledPriceMinor} ${result.currency}.`,
      metadata: {
        bookingItemId: input.bookingItemId,
        chargedPriceMinor: input.chargedPriceMinor,
        chargedCurrency: input.currency,
        settledPriceMinor: result.settledPriceMinor,
        settledCurrency: result.currency,
        differenceMinor: result.settledPriceMinor - input.chargedPriceMinor,
        reference: result.reference,
      },
    })
    throw new AncillaryPremiumDriftError(
      input.bookingItemId,
      input.chargedPriceMinor,
      result.settledPriceMinor,
      input.currency,
      result.currency,
    )
  }

  return {
    status: "matched",
    bookingItemId: input.bookingItemId,
    chargedPriceMinor: input.chargedPriceMinor,
    settledPriceMinor: result.settledPriceMinor,
    currency: input.currency,
    reference: result.reference,
  }
}

/** Operator-visible record of an automated outcome, written by bookings. */
export async function recordAncillaryActivity(
  db: PostgresJsDatabase,
  bookingId: string,
  entry: { event: string; description: string; metadata: Record<string, unknown> },
): Promise<void> {
  await recordBookingSystemActivity(db, { bookingId, ...entry })
}
