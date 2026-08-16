import type {
  AncillaryOfferGroupV1,
  AncillarySelectionV1,
} from "@voyant-travel/catalog-contracts/booking-engine/ancillary-contracts"
import { definePort } from "@voyant-travel/core/project"

/**
 * The seam for anything quoted live from a third party at purchase time.
 *
 * Checkout can price and sell what the operator has in its own catalog. It
 * cannot, on its own, offer something whose price is unknown until trip dates
 * and traveller ages are — and which is then only good for a bounded window.
 * That is what this port is for.
 *
 * Commerce deliberately knows nothing about what is on the other side. It does
 * not know that travel insurance exists, and it must not learn: a self-hosted
 * operator with a direct supplier contract binds their own source, and the
 * framework stays out of it. `kind` is a free string for exactly that reason.
 */

/**
 * What a source is given to price with.
 *
 * Ages and dates, and nothing else. Quoting happens before the traveller has
 * decided anything, so there is no basis for sending a name, a document or an
 * email — and a shape that cannot carry them is a stronger guarantee than a
 * rule someone has to remember. Identified data is collected only for an
 * accepted offer, and goes to `prepare`.
 */
export interface AncillaryQuoteInput {
  bookingSessionId: string
  tripStartDate: string
  tripEndDate: string
  /** Destination countries as ISO 3166-1 alpha-2, when the trip states them. */
  destinationCountries: string[]
  /** The operator's own country, which is where the traveller is assumed to reside. */
  originCountry?: string
  travelers: Array<{ ref: string; age: number; band?: string }>
  /** What the traveller stands to lose, in minor units, when it is known. */
  tripCostMinor?: number
  currency: string
  locale?: string
}

export interface AncillaryPrepareInput {
  bookingSessionId: string
  selection: AncillarySelectionV1
  /** The contracting party, taken from the billing step. */
  contact: {
    firstName: string
    lastName: string
    email: string
    phone?: string
  }
  idempotencyKey: string
}

/**
 * What a source hands back once it has an application open.
 *
 * `priceMinor` is authoritative from here on: it is what the booking charges
 * and what the issued artifact must agree with. A source that cannot hold the
 * price it quoted returns the price it can hold, and the caller re-confirms
 * with the traveller rather than quietly charging the new one.
 */
export interface AncillaryPreparedSelection {
  sourceId: string
  providerId: string
  /** Opaque reference the source resolves back to its own application. */
  applicationRef: string
  priceMinor: number
  currency: string
  /** Rendered on the booking and the invoice. */
  title: string
  /** After this instant the application can no longer become a purchase. */
  expiresAt: string
}

export interface AncillaryFulfillInput {
  bookingId: string
  applicationRef: string
  sourceId: string
  /** What the booking actually charged, for the source to reconcile against. */
  chargedPriceMinor: number
  currency: string
  idempotencyKey: string
}

/**
 * The outcome of trying to deliver what the traveller paid for.
 *
 * `failed` is an ordinary result rather than a thrown error, because it happens
 * after the money has been taken: the caller has to record it, tell an operator,
 * and leave the booking intact. Throwing here would lose all three.
 */
export type AncillaryFulfillmentResult =
  | {
      status: "fulfilled"
      /** The supplier's reference a traveller quotes when they claim. */
      reference: string
      /** What the supplier actually charged, for reconciliation. */
      settledPriceMinor: number
      currency: string
      documentIds: string[]
    }
  | {
      status: "failed"
      code: string
      message: string
      retryable: boolean
    }

export interface AncillaryCancelInput {
  bookingId: string
  applicationRef: string
  reason: string
  idempotencyKey: string
}

export interface AncillaryOfferSource {
  /** Stable across deployments; stamped on every offer and selection. */
  readonly sourceId: string
  /** The bucket its offers render in — `"insurance"` for the first of these. */
  readonly kind: string
  /** How the bucket is named to a traveller, already localised. */
  readonly label: string

  /**
   * Prices across everything this source has connected.
   *
   * Always returns a group, never throws for a business outcome. A source with
   * nothing to offer returns an empty `offers` list; a source whose upstream
   * failed returns a `diagnostics` entry. Both keep checkout moving.
   */
  quote(input: AncillaryQuoteInput): Promise<AncillaryOfferGroupV1>

  /** Turns an accepted offer into a held application, before payment. */
  prepare(input: AncillaryPrepareInput): Promise<AncillaryPreparedSelection>

  /** Called once payment has succeeded. Issues, and attaches documents. */
  fulfill(input: AncillaryFulfillInput): Promise<AncillaryFulfillmentResult>

  /** Unwinds a prepared or fulfilled selection. Best effort by nature. */
  cancel(input: AncillaryCancelInput): Promise<void>
}

/**
 * Bound `cardinality: "many"`, and read with `getPorts`.
 *
 * An operator may have zero, one or several sources connected, and zero is a
 * supported, silent state rather than a misconfiguration. One source is a list
 * whose entries happen to share a source — only presentation ever branches on
 * the count.
 */
export const ancillaryOfferSourceRuntimePort = definePort<AncillaryOfferSource>({
  id: "commerce.ancillary-offer-source",
  test(provider) {
    if (provider === null || typeof provider !== "object") {
      throw new Error("commerce.ancillary-offer-source provider must be an object.")
    }
    for (const field of ["sourceId", "kind", "label"] as const) {
      if (typeof provider[field] !== "string" || provider[field].length === 0) {
        throw new Error(
          `commerce.ancillary-offer-source provider must expose a non-empty ${field}.`,
        )
      }
    }
    for (const method of ["quote", "prepare", "fulfill", "cancel"] as const) {
      if (typeof provider[method] !== "function") {
        throw new Error(`commerce.ancillary-offer-source provider must implement ${method}().`)
      }
    }
  },
})
