"use client"

import { useQuery } from "@tanstack/react-query"
import { z } from "zod"
import { fetchWithValidation } from "../client.js"
import { useVoyantContext } from "../provider.js"

/**
 * Products an operator can attach to an Inquiry as its Product target.
 *
 * Inventory owns Products, and this package cannot depend on `inventory-react`
 * (its admin extension already depends on this one). The read therefore goes
 * over Inventory's published admin API, the same way `catalog-react` reads
 * product content. Only the two fields the picker shows are validated, so a
 * change to the rest of Inventory's product projection cannot break the picker.
 */
const productPickerResponseSchema = z.object({
  data: z.array(
    z
      .object({
        id: z.string(),
        name: z.string(),
        startDate: z.string().nullable().optional(),
        endDate: z.string().nullable().optional(),
      })
      .loose(),
  ),
})

export type InquiryTargetProduct = z.infer<typeof productPickerResponseSchema>["data"][number]

export interface UseInquiryTargetProductsOptions {
  search?: string
  enabled?: boolean
  limit?: number
}

export function useInquiryTargetProducts(options: UseInquiryTargetProductsOptions = {}) {
  const client = useVoyantContext()
  const { search = "", enabled = true, limit = 20 } = options
  return useQuery({
    queryKey: ["relationships", "inquiry-target-products", { search, limit }],
    queryFn: async () => {
      const params = new URLSearchParams({ limit: String(limit) })
      if (search.trim()) params.set("search", search.trim())
      const { data } = await fetchWithValidation(
        `/v1/admin/products?${params.toString()}`,
        productPickerResponseSchema,
        client,
      )
      return data
    },
    enabled,
    staleTime: 30_000,
  })
}
