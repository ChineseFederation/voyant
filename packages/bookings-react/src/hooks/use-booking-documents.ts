"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { fetchWithValidation } from "../client.js"
import { useVoyantBookingsContext } from "../provider.js"
import { bookingsQueryKeys } from "../query-keys.js"
import { getBookingTravelerDocumentsQueryOptions } from "../query-options.js"
import {
  bookingSingleResponse,
  bookingTravelerDocumentsResponse,
  successEnvelope,
} from "../schemas.js"

export interface UseBookingTravelerDocumentsOptions {
  enabled?: boolean
}

export function useBookingTravelerDocuments(
  bookingId: string | null | undefined,
  options: UseBookingTravelerDocumentsOptions = {},
) {
  const { baseUrl, fetcher } = useVoyantBookingsContext()
  const { enabled = true } = options

  return useQuery({
    ...getBookingTravelerDocumentsQueryOptions({ baseUrl, fetcher }, bookingId),
    enabled: enabled && Boolean(bookingId),
  })
}

export interface CreateBookingTravelerDocumentInput {
  type: string
  fileName: string
  fileUrl: string
  travelerId?: string | null
  /**
   * Identity of a document issued outside Voyant (contract, invoice, proforma,
   * credit note). Voyant records these; it never allocates them.
   */
  issuedBy?: string | null
  issuedSeries?: string | null
  issuedNumber?: string | null
  issuedAt?: string | null
  expiresAt?: string | null
  notes?: string | null
}

export function useBookingTravelerDocumentMutation(bookingId: string) {
  const { baseUrl, fetcher } = useVoyantBookingsContext()
  const queryClient = useQueryClient()

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: bookingsQueryKeys.booking(bookingId) })
    void queryClient.invalidateQueries({ queryKey: bookingsQueryKeys.bookings() })
    void queryClient.invalidateQueries({ queryKey: bookingsQueryKeys.documents(bookingId) })
    void queryClient.invalidateQueries({ queryKey: bookingsQueryKeys.activity(bookingId) })
  }

  const create = useMutation({
    mutationFn: async (input: CreateBookingTravelerDocumentInput) => {
      const { data } = await fetchWithValidation(
        `/v1/admin/bookings/${bookingId}/documents`,
        bookingSingleResponse.extend({
          data: bookingTravelerDocumentsResponse.shape.data.element,
        }),
        { baseUrl, fetcher },
        {
          method: "POST",
          body: JSON.stringify({
            type: input.type,
            fileName: input.fileName,
            fileUrl: input.fileUrl,
            travelerId: input.travelerId,
            issuedBy: input.issuedBy,
            issuedSeries: input.issuedSeries,
            issuedNumber: input.issuedNumber,
            issuedAt: input.issuedAt,
            expiresAt: input.expiresAt,
            notes: input.notes,
          }),
        },
      )
      return data
    },
    onSuccess: invalidate,
  })

  const remove = useMutation({
    mutationFn: async (documentId: string) =>
      fetchWithValidation(
        `/v1/admin/bookings/${bookingId}/documents/${documentId}`,
        successEnvelope,
        { baseUrl, fetcher },
        { method: "DELETE" },
      ),
    onSuccess: invalidate,
  })

  return { create, remove }
}
