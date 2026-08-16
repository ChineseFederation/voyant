"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import type { z } from "zod"

import {
  type BookingAmendmentRecord,
  bookingAmendmentApplyResponse,
  bookingAmendmentListResponse,
  bookingAmendmentPreviewResponse,
  bookingAmendmentResponse,
} from "../amendment-schemas.js"
import { fetchWithValidation } from "../client.js"
import { useVoyantBookingsContext } from "../provider.js"
import { bookingsQueryKeys } from "../query-keys.js"

export interface TravelerRosterAddInput {
  type: "traveler_add"
  bookingItemIds: string[]
  traveler: {
    personId?: string | null
    participantType?: "traveler" | "occupant" | "other"
    travelerCategory?: string | null
    firstName: string
    lastName: string
    email?: string | null
    phone?: string | null
    preferredLanguage?: string | null
  }
}

export interface TravelerRosterDropInput {
  type: "traveler_drop"
  bookingItemIds: string[]
  travelerId: string
}

export type TravelerRosterChangeInput = TravelerRosterAddInput | TravelerRosterDropInput

export interface PreviewRosterChangeInput {
  expectedBookingRevision: number
  reason: string
  change: TravelerRosterChangeInput
}

export interface BookingItemAdditionInput {
  type: "item_add"
  productId: string
  optionId?: string | null
  optionUnitId?: string | null
  availabilitySlotId?: string | null
  quantity: number
  title?: string
}

export interface BookingItemMoveInput {
  type: "item_move"
  bookingItemId: string
  availabilitySlotId: string
  changeFeeCents: number
  fareDiscountCents: number
  refundHandling: "refund" | "travel_credit" | "waive"
}

export interface PreviewItemMoveInput {
  expectedBookingRevision: number
  reason: string
  move: BookingItemMoveInput
}

export interface PreviewItemAdditionInput {
  expectedBookingRevision: number
  reason: string
  addition: BookingItemAdditionInput
}

/**
 * Outcome of a roster preview.
 *
 * `no_op`, `availability_changed` and the rest are not errors — they are
 * answers, and the dialog shows each one differently. Collapsing them into
 * a thrown error would tell an operator "something went wrong" when the
 * real answer is "that departure just sold out".
 */
export type RosterPreviewResult =
  | { status: "ok"; amendment: BookingAmendmentRecord }
  | { status: "no_op" }
  | { status: "availability_changed"; bookingItemId?: string }
  | { status: "unsupported_configuration"; reason?: string }
  | { status: "stale_revision"; currentBookingRevision?: number }
  | { status: "other"; code: string }

function invalidateAmendmentQueries(
  queryClient: ReturnType<typeof useQueryClient>,
  bookingId: string,
) {
  void queryClient.invalidateQueries({ queryKey: bookingsQueryKeys.amendments(bookingId) })
  void queryClient.invalidateQueries({
    queryKey: bookingsQueryKeys.booking(bookingId),
    exact: true,
  })
  void queryClient.invalidateQueries({ queryKey: bookingsQueryKeys.items(bookingId) })
  void queryClient.invalidateQueries({ queryKey: bookingsQueryKeys.travelers(bookingId) })
  void queryClient.invalidateQueries({ queryKey: bookingsQueryKeys.activity(bookingId) })
}

/**
 * Amendment mutations are idempotent by contract — the server rejects a
 * request without an `Idempotency-Key`. One key per attempt: retrying the
 * same attempt must replay, while a fresh attempt must quote afresh.
 */
function idempotencyHeaders(key: string): HeadersInit {
  return { "Idempotency-Key": key }
}

export function useBookingAmendments(bookingId: string, options: { enabled?: boolean } = {}) {
  const { baseUrl, fetcher } = useVoyantBookingsContext()

  return useQuery({
    queryKey: bookingsQueryKeys.amendments(bookingId),
    enabled: options.enabled ?? true,
    queryFn: async () => {
      const { data } = await fetchWithValidation(
        `/v1/admin/bookings/${bookingId}/amendments`,
        bookingAmendmentListResponse,
        { baseUrl, fetcher },
      )
      return data
    },
  })
}

/**
 * Normalise a preview response into the discriminated result the dialog
 * renders. Shared by both preview endpoints — they answer with the same
 * envelope and the same set of "nothing to quote" outcomes.
 */
function toPreviewResult(
  body: z.infer<typeof bookingAmendmentPreviewResponse>,
): RosterPreviewResult {
  if ("amendment" in body.data) {
    return { status: "ok", amendment: body.data.amendment }
  }
  const status = body.data.status
  if (
    status === "no_op" ||
    status === "availability_changed" ||
    status === "unsupported_configuration" ||
    status === "stale_revision"
  ) {
    return { ...body.data, status } as RosterPreviewResult
  }
  return { status: "other", code: status }
}

export function useBookingAmendmentFlow(bookingId: string) {
  const { baseUrl, fetcher } = useVoyantBookingsContext()
  const queryClient = useQueryClient()

  const previewRosterChange = useMutation({
    mutationFn: async ({
      input,
      idempotencyKey,
    }: {
      input: PreviewRosterChangeInput
      idempotencyKey: string
    }): Promise<RosterPreviewResult> =>
      toPreviewResult(
        await fetchWithValidation(
          `/v1/admin/bookings/${bookingId}/amendments/traveler-roster/preview`,
          bookingAmendmentPreviewResponse,
          { baseUrl, fetcher },
          {
            method: "POST",
            body: JSON.stringify(input),
            headers: idempotencyHeaders(idempotencyKey),
          },
        ),
      ),
  })

  const previewItemAddition = useMutation({
    mutationFn: async ({
      input,
      idempotencyKey,
    }: {
      input: PreviewItemAdditionInput
      idempotencyKey: string
    }): Promise<RosterPreviewResult> =>
      toPreviewResult(
        await fetchWithValidation(
          `/v1/admin/bookings/${bookingId}/amendments/items/preview`,
          bookingAmendmentPreviewResponse,
          { baseUrl, fetcher },
          {
            method: "POST",
            body: JSON.stringify(input),
            headers: idempotencyHeaders(idempotencyKey),
          },
        ),
      ),
  })

  const previewItemMove = useMutation({
    mutationFn: async ({
      input,
      idempotencyKey,
    }: {
      input: PreviewItemMoveInput
      idempotencyKey: string
    }): Promise<RosterPreviewResult> =>
      toPreviewResult(
        await fetchWithValidation(
          `/v1/admin/bookings/${bookingId}/amendments/items/move/preview`,
          bookingAmendmentPreviewResponse,
          { baseUrl, fetcher },
          {
            method: "POST",
            body: JSON.stringify(input),
            headers: idempotencyHeaders(idempotencyKey),
          },
        ),
      ),
  })

  const accept = useMutation({
    mutationFn: async ({
      amendmentId,
      proposedRevisionId,
      idempotencyKey,
    }: {
      amendmentId: string
      proposedRevisionId: string
      idempotencyKey: string
    }) => {
      const { data } = await fetchWithValidation(
        `/v1/admin/bookings/${bookingId}/amendments/${amendmentId}/accept`,
        bookingAmendmentResponse,
        { baseUrl, fetcher },
        {
          method: "POST",
          body: JSON.stringify({ proposedRevisionId }),
          headers: idempotencyHeaders(idempotencyKey),
        },
      )
      return data
    },
    onSuccess: () => invalidateAmendmentQueries(queryClient, bookingId),
  })

  const apply = useMutation({
    mutationFn: async ({
      amendmentId,
      proposedRevisionId,
      expectedBookingRevision,
      idempotencyKey,
    }: {
      amendmentId: string
      proposedRevisionId: string
      expectedBookingRevision: number
      idempotencyKey: string
    }) => {
      const { data } = await fetchWithValidation(
        `/v1/admin/bookings/${bookingId}/amendments/${amendmentId}/apply`,
        bookingAmendmentApplyResponse,
        { baseUrl, fetcher },
        {
          method: "POST",
          body: JSON.stringify({ proposedRevisionId, expectedBookingRevision }),
          headers: idempotencyHeaders(idempotencyKey),
        },
      )
      return data.amendment
    },
    onSuccess: () => invalidateAmendmentQueries(queryClient, bookingId),
  })

  return { previewRosterChange, previewItemAddition, previewItemMove, accept, apply }
}
