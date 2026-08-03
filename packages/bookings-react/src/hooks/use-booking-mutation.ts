"use client"

import { useMutation, useQueryClient } from "@tanstack/react-query"

import { fetchWithValidation } from "../client.js"
import { useVoyantBookingsContext } from "../provider.js"
import { bookingsQueryKeys } from "../query-keys.js"
import { bookingSingleResponse, successEnvelope } from "../schemas.js"

export interface UpdateBookingInput {
  bookingNumber?: string
  personId?: string | null
  organizationId?: string | null
  sellCurrency?: string
  sellAmountCents?: number | null
  costAmountCents?: number | null
  startDate?: string | null
  endDate?: string | null
  pax?: number | null
  internalNotes?: string | null
  // Billing-contact snapshot — editable post-create via PATCH.
  contactFirstName?: string | null
  contactLastName?: string | null
  contactPartyType?: "individual" | "company" | null
  contactTaxId?: string | null
  contactEmail?: string | null
  contactPhone?: string | null
  contactPreferredLanguage?: string | null
  contactCountry?: string | null
  contactRegion?: string | null
  contactCity?: string | null
  contactAddressLine1?: string | null
  contactAddressLine2?: string | null
  contactPostalCode?: string | null
}

export function useBookingMutation() {
  const { baseUrl, fetcher } = useVoyantBookingsContext()
  const queryClient = useQueryClient()

  const update = useMutation({
    mutationFn: async ({ id, input }: { id: string; input: UpdateBookingInput }) => {
      const { data } = await fetchWithValidation(
        `/v1/admin/bookings/${id}`,
        bookingSingleResponse,
        { baseUrl, fetcher },
        { method: "PATCH", body: JSON.stringify(input) },
      )
      return data
    },
    onSuccess: (data) => {
      void queryClient.invalidateQueries({ queryKey: bookingsQueryKeys.bookings() })
      queryClient.setQueryData(bookingsQueryKeys.booking(data.id), { data })
    },
  })

  const remove = useMutation({
    mutationFn: async (id: string) =>
      fetchWithValidation(
        `/v1/admin/bookings/${id}`,
        successEnvelope,
        { baseUrl, fetcher },
        {
          method: "DELETE",
        },
      ),
    onSuccess: (_data, id) => {
      void queryClient.invalidateQueries({ queryKey: bookingsQueryKeys.bookings() })
      queryClient.removeQueries({ queryKey: bookingsQueryKeys.booking(id) })
    },
  })

  return { update, remove }
}
