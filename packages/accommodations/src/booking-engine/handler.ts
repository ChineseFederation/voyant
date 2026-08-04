/**
 * Owned-arm booking handler for the `accommodation` vertical.
 *
 * Per `docs/architecture/booking-journey-architecture.md` §6.
 *
 * Phase B scope (deliberately narrow):
 *   - `computeQuote` projects the property's accommodation content
 *     into a `BookingRequirements` with date-range + occupancy
 *     sub-steps and a Rooms accommodation step. Pricing is resolved
 *     from first-party date-aware owned rates + inventory when the
 *     draft has a selected room and rate plan; otherwise no pricing
 *     is returned yet.
 * Templates wire this read/quote handler at boot the same way they wire the
 * products handler.
 */

import type {
  BookingRequirements,
  ComputeQuoteBatchResult,
  ComputeQuoteRequest,
  ComputeQuoteResult,
  ComputeQuotesRequest,
  OwnedBookingHandler,
  OwnedHandlerContext,
} from "@voyant-travel/catalog/booking-engine"

import type { AccommodationContent } from "../content-shape.js"
import { buildAccommodationRequirements } from "../requirements.js"
import {
  type OwnedStayQuoteResult,
  type QuoteOwnedStayInput,
  quoteOwnedStay,
  quoteOwnedStaysBatch,
} from "../service-owned-stays.js"

interface DraftLike {
  configure?: {
    pax?: Partial<Record<string, number>>
    dateRange?: { checkIn?: string; checkOut?: string }
  }
  accommodation?: {
    rooms?: ReadonlyArray<{
      optionUnitId: string
      quantity: number
      ratePlanId?: string
      adult?: number
      adults?: number
      child?: number
      children?: number
      infant?: number
      infants?: number
    }>
  }
  billing?: {
    contact?: { firstName?: string; lastName?: string; email?: string; phone?: string }
    address?: { country?: string }
  }
  travelers?: Array<{
    firstName: string
    lastName: string
    band?: string
  }>
  internalNotes?: string
}

/**
 * Caller-supplied loader — keeps the handler free of a hard
 * dependency on the template's content service wiring (which spans
 * sourced + owned + overlays). Templates wire this to
 * `getAccommodationContent` from `@voyant-travel/accommodations/service-content`.
 */
export type AccommodationContentLoader = (
  ctx: OwnedHandlerContext,
  entityId: string,
) => Promise<AccommodationContent | null>

export interface CreateAccommodationBookingHandlerOptions {
  /** Loader for the property's content payload. */
  loadContent: AccommodationContentLoader
  /**
   * Default min/max nights when the supplier hasn't declared bounds.
   * The journey's date-range sub-step uses these as guard rails.
   */
  defaultMinNights?: number
  defaultMaxNights?: number
}

export function createAccommodationBookingHandler(
  options: CreateAccommodationBookingHandlerOptions,
): OwnedBookingHandler {
  return {
    entityModule: "accommodations",

    async computeQuote(
      ctx: OwnedHandlerContext,
      request: ComputeQuoteRequest,
    ): Promise<ComputeQuoteResult> {
      const content = await options.loadContent(ctx, request.entityId)
      if (!content) {
        return { available: false, invalidReason: "property_not_found" }
      }

      const shape: BookingRequirements = buildAccommodationRequirements(content, {
        minNights: options.defaultMinNights,
        maxNights: options.defaultMaxNights,
      })

      const draft = (request.draft ?? {}) as DraftLike
      const quoteInput = quoteInputFromDraft(draft, request.scope.currency)
      const quote = quoteInput ? await quoteOwnedStay(ctx.db, quoteInput) : undefined
      const pricing = quote?.status === "ok" ? pricingFromOwnedStayQuote(quote) : undefined

      return {
        available: quote?.status === "ok" ? quote.available : true,
        invalidReason: quoteInvalidReason(quote),
        pricing,
        shape,
      }
    },

    async computeQuotes(
      ctx: OwnedHandlerContext,
      request: ComputeQuotesRequest,
    ): Promise<ReadonlyArray<ComputeQuoteBatchResult>> {
      const prepared = await Promise.all(
        request.selections.map(async (selection) => {
          const content = await options.loadContent(ctx, selection.entityId)
          const shape = content
            ? buildAccommodationRequirements(content, {
                minNights: options.defaultMinNights,
                maxNights: options.defaultMaxNights,
              })
            : undefined
          const draft = (selection.draft ?? {}) as DraftLike
          return {
            selection,
            shape,
            quoteInput: content ? quoteInputFromDraft(draft, request.scope.currency) : undefined,
            invalidReason: content ? undefined : "property_not_found",
          }
        }),
      )
      const quotable = prepared.flatMap((item) =>
        item.quoteInput
          ? [{ selectionId: item.selection.selectionId, input: item.quoteInput }]
          : [],
      )
      const quotes = quotable.length
        ? await quoteOwnedStaysBatch(
            ctx.db,
            quotable.map((item) => item.input),
          )
        : []
      const quoteBySelectionId = new Map(
        quotable.map((item, index) => [item.selectionId, quotes[index]]),
      )

      return prepared.map(({ selection, shape, invalidReason }) => {
        const quote = quoteBySelectionId.get(selection.selectionId)
        return {
          selectionId: selection.selectionId,
          result: {
            available: quote?.status === "ok" ? quote.available : !invalidReason,
            invalidReason: invalidReason ?? quoteInvalidReason(quote),
            pricing: quote?.status === "ok" ? pricingFromOwnedStayQuote(quote) : undefined,
            shape,
          },
        }
      })
    },

    async placeHold(_ctx, request) {
      const token = request.draftId ?? `acc_${Date.now().toString(36)}`
      return {
        holdToken: token,
        expiresAt: new Date(Date.now() + request.ttlMs),
      }
    },

    async releaseHold(_ctx, _holdToken) {
      // No-op until inventory reservation against rate plans + room
      // inventory lands.
    },
  }
}

function quoteInputFromDraft(
  draft: DraftLike,
  currency: string | undefined,
): QuoteOwnedStayInput | undefined {
  const range = draft.configure?.dateRange
  const rooms = draft.accommodation?.rooms ?? []
  const firstRoom = rooms[0]
  if (!range?.checkIn || !range?.checkOut || !firstRoom?.ratePlanId) return undefined
  const roomCount = rooms.reduce((sum, room) => sum + Math.max(1, room.quantity), 0)
  const occupancies = occupanciesFromRooms(rooms)
  return {
    roomTypeId: firstRoom.optionUnitId,
    ratePlanId: firstRoom.ratePlanId,
    checkIn: range.checkIn,
    checkOut: range.checkOut,
    roomCount: roomCount || firstRoom.quantity,
    occupancy: {
      adults: draft.configure?.pax?.adult ?? draft.travelers?.length ?? 1,
      children: draft.configure?.pax?.child ?? 0,
      infants: draft.configure?.pax?.infant ?? 0,
    },
    occupancies,
    currency,
  }
}

function occupanciesFromRooms(
  rooms: NonNullable<DraftLike["accommodation"]>["rooms"],
): QuoteOwnedStayInput["occupancies"] {
  const occupancies = rooms?.flatMap((room) => {
    const adults = room.adults ?? room.adult
    const children = room.children ?? room.child
    const infants = room.infants ?? room.infant
    if (typeof adults !== "number" && typeof children !== "number" && typeof infants !== "number") {
      return []
    }
    const occupancy = {
      ...(typeof adults === "number" ? { adults } : {}),
      ...(typeof children === "number" ? { children } : {}),
      ...(typeof infants === "number" ? { infants } : {}),
    }
    return Array.from({ length: Math.max(1, room.quantity) }, () => occupancy)
  })
  return occupancies && occupancies.length > 0 ? occupancies : undefined
}

function pricingFromOwnedStayQuote(
  quote: Extract<OwnedStayQuoteResult, { status: "ok" }>,
): NonNullable<ComputeQuoteResult["pricing"]> {
  return {
    base_amount: quote.totalAmountCents,
    taxes: 0,
    fees: 0,
    surcharges: 0,
    currency: quote.currency,
    breakdown: {
      lines: quote.nightlyRates.map((rate) => ({
        kind: "accommodations",
        label: rate.date,
        quantity: rate.quantity,
        unitAmount: rate.sellAmountCents,
        totalAmount: rate.totalAmountCents,
      })),
      subtotal: quote.totalAmountCents,
      taxTotal: 0,
      total: quote.totalAmountCents,
      nights: quote.nights,
      rooms: quote.roomCount,
      nightlyRates: quote.nightlyRates,
      availability: quote.availability,
    },
  }
}

function quoteInvalidReason(quote: OwnedStayQuoteResult | undefined): string | undefined {
  if (!quote || quote.status === "ok") return undefined
  return quote.status
}
