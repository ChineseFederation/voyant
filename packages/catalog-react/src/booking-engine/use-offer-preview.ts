"use client"

import { useMutation, useQuery } from "@tanstack/react-query"
import {
  type OfferPreviewOutcomeV1,
  type OfferPreviewRequestV1,
  type OfferPreviewResultV1,
  type OfferPreviewTargetV1,
  offerPreviewOutcomeV1,
} from "@voyant-travel/catalog-contracts/booking-engine/preview-contracts"
import { useEffect, useMemo, useRef, useState } from "react"

import { type BookingJourneyApiOptions, useBookingJourneyApi } from "./use-booking-journey-api.js"

/** What a preview is quoted in. `audience` is deliberately absent — the server
 *  derives it from the caller's actor kind, so a storefront visitor cannot ask
 *  for staff pricing by naming it. */
export interface OfferPreviewScope {
  locale?: string
  market?: string
  currency?: string
}

export interface UseOfferPreviewOptions extends BookingJourneyApiOptions {
  /**
   * What to price. Nullable so a page can hold the hook idle until it knows
   * which entity it is showing; a null target disables the read.
   */
  target: OfferPreviewTargetV1 | null
  scope?: OfferPreviewScope
  /**
   * What the shopper has picked so far. Only the public selection schema —
   * the same one a Booking Session accepts — so nothing here can carry staff
   * or engine-owned authority.
   */
  selection?: OfferPreviewRequestV1["selection"] | null
  /** Debounce window in ms — default 250, per booking-journey-architecture §5. */
  debounceMs?: number
  /** Set false to hold the read (e.g. the selection is not yet complete). */
  enabled?: boolean
}

/**
 * A rejected preview. The server carries rejections in a 200 body rather than
 * as a transport error, so the hook raises this to keep "there is no preview"
 * distinct from "here is a preview that says unavailable" — the latter is a
 * normal, renderable result and arrives as `data`.
 */
export class OfferPreviewRejectedError extends Error {
  readonly reason: Extract<OfferPreviewOutcomeV1, { kind: "rejected" }>["error"]

  constructor(reason: Extract<OfferPreviewOutcomeV1, { kind: "rejected" }>["error"]) {
    super(`Offer preview rejected: ${reason.kind}`)
    this.name = "OfferPreviewRejectedError"
    this.reason = reason
  }
}

export interface UseOfferPreviewResult {
  /** The latest non-binding preview, or `null` while there is none to show. */
  data: OfferPreviewResultV1 | null
  /** True while a preview request is in flight. */
  isPreviewing: boolean
  /** True while in flight OR inside the debounce window — see below. */
  isSettling: boolean
  error: Error | null
  /** Re-read now, ignoring the debounce (e.g. a "refresh price" button). */
  refresh: () => Promise<OfferPreviewResultV1>
}

/**
 * Read what a target would cost and what booking it would require, without
 * opening a Booking Session.
 *
 * This is the storefront detail-page price probe. Moving a pax stepper is not
 * an attempt to book, so it must not mint a Session: Sessions are persisted,
 * revisioned, capability-bearing, expiring rows a sweep has to reap, and one
 * per keystroke floods `booking_sessions` at real traffic. `POST
 * /v1/{surface}/catalog/offers/preview` answers the same question statelessly
 * — no identifier, nothing persisted, `binding: false`.
 *
 * The debounce, the pricing-significant signature and the scope-aware
 * `placeholderData` below are carried over from `useBookingQuote` because each
 * fixed a real bug; the comments at each say which.
 */
export function useOfferPreview(options: UseOfferPreviewOptions): UseOfferPreviewResult {
  const api = useBookingJourneyApi(options)
  const debounceMs = options.debounceMs ?? 250
  const enabled = options.enabled !== false && options.target !== null

  // Stabilize the request via a serialized signature so TanStack Query's
  // queryKey only changes when a pricing-significant field changes — a
  // cosmetic edit must not cost a round trip.
  const signature = options.target
    ? signPreview(options.target, options.selection ?? undefined)
    : null
  const [debouncedSignature, setDebouncedSignature] = useState(signature)
  const requestRef = useRef<{ target: OfferPreviewTargetV1 | null; scope: OfferPreviewScope }>({
    target: options.target,
    scope: options.scope ?? {},
  })
  requestRef.current = { target: options.target, scope: options.scope ?? {} }
  const selectionRef = useRef(options.selection)
  selectionRef.current = options.selection

  // Scope (market / currency / locale) is part of what the preview prices, so
  // it must be in the query key — otherwise changing the selected market on an
  // already-open page keeps the previous market's price.
  const scopeKey = JSON.stringify({
    locale: options.scope?.locale,
    market: options.scope?.market,
    currency: options.scope?.currency,
  })

  useEffect(() => {
    if (!signature) {
      setDebouncedSignature(null)
      return
    }
    const timer = setTimeout(() => setDebouncedSignature(signature), debounceMs)
    return () => clearTimeout(timer)
  }, [signature, debounceMs])

  const query = useQuery<OfferPreviewResultV1 | null>({
    queryKey: ["offer-preview", options.surface ?? "admin", debouncedSignature, scopeKey],
    queryFn: async () => {
      const { target, scope } = requestRef.current
      if (!target) return null
      return runPreview(api, target, scope, selectionRef.current ?? undefined)
    },
    enabled,
    // Each pricing-significant edit changes the query key. Keep the previous
    // preview visible while the next one fetches so the price swaps in place
    // instead of blanking → flashing the whole sidebar on every pax change.
    //
    // BUT never carry a preview across a SCOPE change: its price is for the old
    // market/currency, and showing it in the sub-second window before the
    // re-scoped read lands would quote the shopper a stale-market price
    // (voyant#2643). On a scope change we drop to `null` (loading).
    placeholderData: (previous, previousQuery) => {
      const previousScopeKey = previousQuery?.queryKey?.[3]
      return previousScopeKey === scopeKey ? previous : undefined
    },
  })

  const refresh = useMutation<OfferPreviewResultV1, Error, void>({
    mutationFn: async () => {
      const { target, scope } = requestRef.current
      if (!target) throw new Error("no target to preview")
      return runPreview(api, target, scope, selectionRef.current ?? undefined)
    },
  })

  return useMemo(
    () => ({
      data: query.data ?? null,
      isPreviewing: query.isFetching || refresh.isPending,
      // `isPreviewing` only covers an active request. Expose the debounce window
      // too, so a surface cannot treat the previous price as current after the
      // selection changed but before the next request starts.
      isSettling: signature !== debouncedSignature || query.isFetching || refresh.isPending,
      error: query.error ?? refresh.error ?? null,
      refresh: () => refresh.mutateAsync(),
    }),
    [debouncedSignature, query.data, query.isFetching, query.error, refresh, signature],
  )
}

async function runPreview(
  api: ReturnType<typeof useBookingJourneyApi>,
  target: OfferPreviewTargetV1,
  scope: OfferPreviewScope,
  selection: OfferPreviewRequestV1["selection"] | undefined,
): Promise<OfferPreviewResultV1> {
  const outcome = await api.request<OfferPreviewOutcomeV1>(
    "POST",
    "/offers/preview",
    offerPreviewOutcomeV1,
    offerPreviewRequestBody(target, scope, selection),
  )
  if (outcome.kind === "rejected") throw new OfferPreviewRejectedError(outcome.error)
  return outcome.preview
}

/**
 * The wire body. Not exported from the package barrel — it is module-internal
 * and exists separately only so the defaults can be asserted without a DOM.
 */
export function offerPreviewRequestBody(
  target: OfferPreviewTargetV1,
  scope: OfferPreviewScope,
  selection: OfferPreviewRequestV1["selection"] | undefined,
): OfferPreviewRequestV1 {
  return {
    target,
    scope: {
      locale: scope.locale ?? "en-GB",
      market: scope.market ?? "default",
      ...(scope.currency ? { currency: scope.currency } : {}),
    },
    ...(selection ? { selection } : {}),
  }
}

/**
 * Pricing-significant signature — only fields that affect the price or the
 * shape of the requirements go in. Keeps a cosmetic edit (a phone number, a
 * note) from costing a round trip.
 */
export function signPreview(
  target: OfferPreviewTargetV1,
  selection: OfferPreviewRequestV1["selection"] | undefined,
): string {
  const configure = selection?.configure
  return JSON.stringify({
    target,
    pax: configure?.pax,
    departureSlotId: configure?.departureSlotId,
    departureDate: configure?.departureDate,
    departureTime: configure?.departureTime,
    variantId: configure?.variantId,
    // Room/unit picks drive per-room pricing — without this the preview never
    // re-runs when the shopper changes rooms, leaving a stale base price.
    optionSelections: configure?.optionSelections,
    cabinCategoryId: configure?.cabinCategoryId,
    cabinNumberId: configure?.cabinNumberId,
    roomTypeId: configure?.roomTypeId,
    ratePlanId: configure?.ratePlanId,
    board: configure?.board,
    dateRange: configure?.dateRange,
    airArrangement: configure?.airArrangement,
    accommodation: selection?.accommodation,
    addons: selection?.addons,
    promotionCode: selection?.promotionCode,
    travelerBands: selection?.travelers?.map((traveler) => traveler.band),
    buyerType: selection?.billing?.buyerType,
    billingCountry: selection?.billing?.address?.country,
  })
}
