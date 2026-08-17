/**
 * The refusals, which are the only interesting part of `prepare` to test
 * without a database.
 *
 * Each of these decides *before* anything is written — an expired application
 * and a changed price are both caught while the booking still has no premium
 * line — so they need no insert, and asserting them here is not a weaker
 * version of the integration test but a different question: whether checkout
 * stops at all.
 *
 * Every case is money. Charging for an application that can no longer be
 * issued, or for a price nobody agreed to, is the failure mode this whole path
 * is arranged around.
 */

import type { AncillarySelectionV1 } from "@voyant-travel/catalog-contracts/booking-engine/ancillary-contracts"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"
import { describe, expect, it } from "vitest"

import {
  AncillaryApplicationExpiredError,
  AncillaryTermsChangedError,
  prepareBookingAncillaries,
} from "./ancillary-commit.js"
import type { AncillaryOfferSource, AncillaryPreparedSelection } from "./ancillary-ports.js"

const NOW = new Date("2026-08-16T12:00:00.000Z")

/** Only `execute` is reached: the advisory lock take and release. */
const db = { execute: async () => undefined } as unknown as PostgresJsDatabase

function selection(overrides: Partial<AncillarySelectionV1> = {}): AncillarySelectionV1 {
  return {
    kind: "insurance",
    decision: "accepted",
    offerId: "offer_1",
    sourceId: "insurance",
    providerId: "northwind",
    quoteRef: "quote_1",
    travelers: [],
    selectedOptionIds: [],
    acceptedDisclosures: [],
    ...overrides,
  } as AncillarySelectionV1
}

function source(prepared: Partial<AncillaryPreparedSelection> = {}): AncillaryOfferSource {
  return {
    sourceId: "insurance",
    kind: "insurance",
    label: "Travel insurance",
    quote: async () => ({ kind: "insurance", label: "", offers: [], diagnostics: [] }),
    prepare: async () => ({
      sourceId: "insurance",
      providerId: "northwind",
      applicationRef: "app_1",
      priceMinor: 4500,
      currency: "EUR",
      title: "Trip protection",
      expiresAt: "2026-08-17T12:00:00.000Z",
      ...prepared,
    }),
    fulfill: async () => ({ status: "fulfilled" }),
    cancel: async () => undefined,
  } as unknown as AncillaryOfferSource
}

function item(metadata: Record<string, unknown>) {
  return {
    bookingItemId: "bit_1",
    priceMinor: 4500,
    currency: "EUR",
    metadata,
  }
}

describe("prepareBookingAncillaries refuses rather than charges", () => {
  it("stops when the already-charged application has expired", async () => {
    const expired = item({
      ancillary: {
        sourceId: "insurance",
        providerId: "northwind",
        applicationRef: "app_1",
        selectionKey: "insurance::northwind::offer_1",
        expiresAt: "2026-08-16T11:59:59.000Z",
      },
    })

    await expect(
      prepareBookingAncillaries({
        db,
        bookingId: "bkg_1",
        bookingSessionId: "bs_1",
        sources: [source()],
        accepted: [selection()],
        contact: { firstName: "Ana", lastName: "Pop", email: "ana@example.test" },
        listPassThroughItems: async () => [expired] as never,
        now: () => NOW,
      }),
    ).rejects.toBeInstanceOf(AncillaryApplicationExpiredError)
  })

  it("treats a line with no recorded expiry as live", async () => {
    // The field is optional, and a line written before it existed must not
    // strand a booking over a fact nobody recorded.
    const live = item({
      ancillary: {
        sourceId: "insurance",
        providerId: "northwind",
        applicationRef: "app_1",
        selectionKey: "insurance::northwind::offer_1",
      },
    })

    const result = await prepareBookingAncillaries({
      db,
      bookingId: "bkg_1",
      bookingSessionId: "bs_1",
      sources: [source()],
      accepted: [selection()],
      contact: { firstName: "Ana", lastName: "Pop", email: "ana@example.test" },
      listPassThroughItems: async () => [live] as never,
      now: () => NOW,
    })

    expect(result.prepared).toHaveLength(0)
    expect(result.alreadyCharged).toEqual(["insurance::northwind::offer_1"])
  })

  it("stops when the source can no longer hold the accepted price", async () => {
    await expect(
      prepareBookingAncillaries({
        db,
        bookingId: "bkg_1",
        bookingSessionId: "bs_1",
        sources: [source({ priceMinor: 5200 })],
        accepted: [selection({ acceptedPriceMinor: 4500, acceptedCurrency: "EUR" })],
        contact: { firstName: "Ana", lastName: "Pop", email: "ana@example.test" },
        listPassThroughItems: async () => [],
        now: () => NOW,
      }),
    ).rejects.toBeInstanceOf(AncillaryTermsChangedError)
  })

  it("stops when the currency changes, even at the same number", async () => {
    await expect(
      prepareBookingAncillaries({
        db,
        bookingId: "bkg_1",
        bookingSessionId: "bs_1",
        sources: [source({ currency: "RON" })],
        accepted: [selection({ acceptedPriceMinor: 4500, acceptedCurrency: "EUR" })],
        contact: { firstName: "Ana", lastName: "Pop", email: "ana@example.test" },
        listPassThroughItems: async () => [],
        now: () => NOW,
      }),
    ).rejects.toBeInstanceOf(AncillaryTermsChangedError)
  })

  it("does not compare against a selection that recorded no accepted terms", async () => {
    // Nothing to consent to means nothing to contradict; blocking here would
    // fail every checkout whose selection predates the snapshot fields.
    const result = await prepareBookingAncillaries({
      db,
      bookingId: "bkg_1",
      bookingSessionId: "bs_1",
      sources: [source({ priceMinor: 9900 })],
      accepted: [selection()],
      contact: { firstName: "Ana", lastName: "Pop", email: "ana@example.test" },
      listPassThroughItems: async () => [],
      now: () => NOW,
    }).catch((error: unknown) => error)

    expect(result).not.toBeInstanceOf(AncillaryTermsChangedError)
  })
})
