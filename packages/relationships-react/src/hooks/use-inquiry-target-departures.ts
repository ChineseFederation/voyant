"use client"

import { useQuery } from "@tanstack/react-query"
import { z } from "zod"
import { fetchWithValidation } from "../client.js"
import { useVoyantContext } from "../provider.js"

/**
 * Departures an operator can attach to an Inquiry, scoped to one Product.
 *
 * Availability owns slots, and this package cannot depend on
 * `operations-react`. The read goes over Operations' published admin API, the
 * same way {@link useInquiryTargetProducts} reads Inventory's. Only the fields
 * the picker shows are validated, so the rest of the slot projection can change
 * without breaking it.
 */
const departurePickerResponseSchema = z.object({
  data: z.array(
    z
      .object({
        id: z.string(),
        productId: z.string(),
        dateLocal: z.string(),
        startsAt: z.string(),
        endsAt: z.string().nullable().optional(),
        status: z.string(),
        remainingPax: z.number().nullable().optional(),
      })
      .loose(),
  ),
})

export type InquiryTargetDeparture = z.infer<typeof departurePickerResponseSchema>["data"][number]

export interface UseInquiryTargetDeparturesOptions {
  /** Only a Product's own departures are offered; without one there is nothing to list. */
  productId?: string | null
  enabled?: boolean
  limit?: number
  /** ISO instant; defaults to now so past departures stay out of the picker. */
  from?: string
}

export function useInquiryTargetDepartures(options: UseInquiryTargetDeparturesOptions = {}) {
  const client = useVoyantContext()
  const { productId, enabled = true, limit = 20, from } = options
  return useQuery({
    queryKey: ["relationships", "inquiry-target-departures", { productId, limit, from }],
    queryFn: async () => {
      const params = new URLSearchParams({
        limit: String(limit),
        status: "open",
        productId: productId ?? "",
        startsAtFrom: from ?? new Date().toISOString(),
      })
      const { data } = await fetchWithValidation(
        `/v1/admin/operations/availability/slots?${params.toString()}`,
        departurePickerResponseSchema,
        client,
      )
      return data
    },
    enabled: enabled && Boolean(productId),
    staleTime: 30_000,
  })
}
