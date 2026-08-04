"use client"

import { useMutation, useQuery } from "@tanstack/react-query"
import {
  type BookingSelectionV1,
  type QuoteResponseV1,
  quoteResponseV1,
} from "@voyant-travel/catalog-contracts/booking-engine/contracts"
import { useEffect, useMemo, useRef, useState } from "react"

import { type BookingJourneyApiOptions, useBookingJourneyApi } from "./use-booking-journey-api.js"

export interface UseBookingQuoteOptions extends BookingJourneyApiOptions {
  draft: BookingSelectionV1 | null
  /** Locale / audience / market scope — defaults sensible per surface. */
  scope?: {
    locale?: string
    audience?: "staff" | "customer" | "partner" | "supplier"
    market?: string
    currency?: string
  }
  /** Debounce window in ms — default 250 (per booking-journey-architecture §5). */
  debounceMs?: number
  /** Disable auto-refetch — caller drives via `mutate()`. */
  enabled?: boolean
}

/**
 * Live-quote a draft. Re-fetches on every meaningful draft change,
 * with a 250ms debounce. Per booking-journey-architecture §5.
 *
 * Returns:
 *   - `data`         — the latest QuoteResponseV1 (or `null` while loading)
 *   - `isQuoting`    — true while a fetch is in flight
 *   - `requote`      — manual trigger (e.g. for "refresh price" buttons)
 */
export function useBookingQuote(options: UseBookingQuoteOptions) {
  const api = useBookingJourneyApi(options)
  const debounceMs = options.debounceMs ?? 250
  const enabled = options.enabled !== false && !!options.draft

  // Stabilize the draft snapshot via a serialized signature so
  // TanStack Query's queryKey only changes when meaningful fields
  // change.
  const signature = options.draft ? signDraft(options.draft) : null
  const [debouncedSignature, setDebouncedSignature] = useState(signature)
  const draftRef = useRef(options.draft)
  draftRef.current = options.draft

  // Scope (market / currency / locale / audience) is part of what the quote
  // prices, so it must be in the query key — otherwise changing the selected
  // market/currency on an already-open journey keeps the previous quote until
  // the draft signature changes.
  const scopeKey = JSON.stringify({
    locale: options.scope?.locale,
    audience: options.scope?.audience,
    market: options.scope?.market,
    currency: options.scope?.currency,
  })

  useEffect(() => {
    if (!signature) {
      setDebouncedSignature(null)
      return
    }
    const t = setTimeout(() => setDebouncedSignature(signature), debounceMs)
    return () => clearTimeout(t)
  }, [signature, debounceMs])

  const query = useQuery<QuoteResponseV1 | null>({
    queryKey: ["booking-quote", options.surface ?? "admin", debouncedSignature, scopeKey],
    queryFn: async () => {
      const draft = draftRef.current
      if (!draft) return null
      return runQuote(api, draft, options.scope)
    },
    enabled,
    // Each meaningful draft edit changes the query key. Keep the previous
    // quote's data visible while the new one fetches so the journey updates
    // in place (price swaps when ready) instead of blanking → falling back
    // to the minimal shape → flashing the whole Configure step on every
    // traveler/room change.
    //
    // BUT do not carry a quote across a SCOPE change: its price is for the old
    // market/currency, and keeping it visible would let the shopper confirm the
    // stale-scope quote in the sub-second window before the re-scoped quote
    // lands. On a scope change we drop to `null` (loading) so the confirm guard
    // (`!quote.data?.quoteId`) blocks booking until the new quote resolves.
    placeholderData: (previous, previousQuery) => {
      const previousScopeKey = previousQuery?.queryKey?.[3]
      return previousScopeKey === scopeKey ? previous : undefined
    },
  })

  const requote = useMutation<QuoteResponseV1, Error, void>({
    mutationFn: async () => {
      const draft = draftRef.current
      if (!draft) throw new Error("no draft to requote")
      return runQuote(api, draft, options.scope)
    },
  })

  return useMemo(
    () => ({
      data: query.data ?? null,
      isQuoting: query.isFetching || requote.isPending,
      // `isQuoting` only covers an active request. Expose the debounce window too so
      // commit surfaces cannot submit the previous quote after the draft changed but
      // before the next request starts.
      isSettling: signature !== debouncedSignature || query.isFetching || requote.isPending,
      error: query.error ?? requote.error ?? null,
      requote: () => requote.mutateAsync(),
      refetch: query.refetch,
    }),
    [
      debouncedSignature,
      query.data,
      query.isFetching,
      query.error,
      query.refetch,
      requote,
      signature,
    ],
  )
}

async function runQuote(
  api: ReturnType<typeof useBookingJourneyApi>,
  draft: BookingSelectionV1,
  scope: UseBookingQuoteOptions["scope"],
): Promise<QuoteResponseV1> {
  // Storefront callers don't surface `sourceKind` in URLs (the
  // server resolves provenance from (module, id) via the catalog
  // plane). Operator callers know the kind upfront and pass it.
  // Either way, only send the source pointer fields when the
  // caller actually has them — empty strings would otherwise fail
  // the server-side validation that requires a non-empty kind.
  const body: Record<string, unknown> = {
    entityModule: draft.entity.module,
    entityId: draft.entity.id,
    scope: {
      locale: scope?.locale ?? "en-GB",
      audience: scope?.audience ?? defaultAudience(api.apiBase),
      market: scope?.market ?? "default",
      currency: scope?.currency,
    },
    draft,
  }
  if (draft.entity.sourceKind) body.sourceKind = draft.entity.sourceKind
  if (draft.entity.sourceConnectionId) body.sourceConnectionId = draft.entity.sourceConnectionId
  if (draft.entity.sourceRef) body.sourceRef = draft.entity.sourceRef
  return api.request<QuoteResponseV1>("POST", "/quote", quoteResponseV1, body)
}

function defaultAudience(apiBase: string): "staff" | "customer" | "partner" | "supplier" {
  return apiBase.includes("/v1/public/") ? "customer" : "staff"
}

/**
 * Pricing-significant signature — only fields that affect price /
 * shape go in. Avoids re-quoting on cosmetic edits like phone
 * formatting or notes.
 */
function signDraft(draft: BookingSelectionV1): string {
  return JSON.stringify({
    entity: draft.entity,
    pax: draft.configure?.pax,
    departureSlotId: draft.configure?.departureSlotId,
    departureDate: draft.configure?.departureDate,
    departureTime: draft.configure?.departureTime,
    variantId: draft.configure?.variantId,
    // Room/unit picks drive per-room pricing — without this the quote never
    // re-runs when the operator changes rooms, leaving a stale base price.
    optionSelections: draft.configure?.optionSelections,
    cabinCategoryId: draft.configure?.cabinCategoryId,
    cabinNumberId: draft.configure?.cabinNumberId,
    dateRange: draft.configure?.dateRange,
    travelerCount: draft.travelers?.length,
    travelerBands: draft.travelers?.map((t) => t.band),
    accommodation: draft.accommodation,
    addons: draft.addons,
    promotionCode: draft.promotionCode,
    buyerType: draft.billing?.buyerType,
    billingCountry: draft.billing?.address?.country,
  })
}
