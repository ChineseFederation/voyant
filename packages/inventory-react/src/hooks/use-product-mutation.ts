"use client"

import { useMutation, useQueryClient } from "@tanstack/react-query"
import { z } from "zod"

import { fetchWithValidation } from "../client.js"
import { useVoyantProductsContext } from "../provider.js"
import { productsQueryKeys } from "../query-keys.js"
import { type ProductPaymentPolicy, productSingleResponse } from "../schemas.js"

export interface CreateProductInput {
  name: string
  status?: "draft" | "active" | "archived"
  description?: string | null
  inclusionsHtml?: string | null
  exclusionsHtml?: string | null
  termsHtml?: string | null
  termsShowOnContract?: boolean
  bookingMode?: "date" | "date_time" | "open" | "stay" | "transfer" | "itinerary" | "other"
  capacityMode?: "free_sale" | "limited" | "on_request"
  timezone?: string | null
  visibility?: "public" | "private" | "hidden"
  activated?: boolean
  reservationTimeoutMinutes?: number | null
  sellCurrency: string
  sellAmountCents?: number | null
  costAmountCents?: number | null
  marginPercent?: number | null
  facilityId?: string | null
  productTypeId?: string | null
  productSubtypeCode?: string | null
  durationMinutes?: number | null
  contractTemplateId?: string | null
  taxClassId?: string | null
  startDate?: string | null
  endDate?: string | null
  pax?: number | null
  customerPaymentPolicy?: ProductPaymentPolicy | null
  tags?: string[]
}

export type UpdateProductInput = Partial<CreateProductInput>

const deleteResponseSchema = z.object({ success: z.boolean() })

export function useProductMutation() {
  const { baseUrl, fetcher } = useVoyantProductsContext()
  const queryClient = useQueryClient()

  const create = useMutation({
    mutationFn: async (input: CreateProductInput) => {
      const { data } = await fetchWithValidation(
        "/v1/admin/products",
        productSingleResponse,
        {
          baseUrl,
          fetcher,
        },
        { method: "POST", body: JSON.stringify(input) },
      )
      return data
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: productsQueryKeys.products() })
    },
  })

  const update = useMutation({
    mutationFn: async ({ id, input }: { id: string; input: UpdateProductInput }) => {
      const { data } = await fetchWithValidation(
        `/v1/admin/products/${id}`,
        productSingleResponse,
        { baseUrl, fetcher },
        { method: "PATCH", body: JSON.stringify(input) },
      )
      return data
    },
    onSuccess: (data) => {
      void queryClient.invalidateQueries({ queryKey: productsQueryKeys.products() })
      queryClient.setQueryData(productsQueryKeys.product(data.id), data)
    },
  })

  const remove = useMutation({
    mutationFn: async (id: string) => {
      return fetchWithValidation(
        `/v1/admin/products/${id}`,
        deleteResponseSchema,
        { baseUrl, fetcher },
        { method: "DELETE" },
      )
    },
    onSuccess: (_data, id) => {
      void queryClient.invalidateQueries({ queryKey: productsQueryKeys.products() })
      queryClient.removeQueries({ queryKey: productsQueryKeys.product(id) })
    },
  })

  return { create, update, remove }
}
