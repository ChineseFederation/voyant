"use client"

import { useMutation, useQueryClient } from "@tanstack/react-query"
import { z } from "zod"

import { fetchWithValidation } from "../client.js"
import { useVoyantProductsContext } from "../provider.js"
import { productsQueryKeys } from "../query-keys.js"
import { productTypeSingleResponse, successEnvelope } from "../schemas.js"

const productTypeInputSchema = z.object({
  name: z.string().min(1).max(255),
  code: z.string().min(1).max(100),
  description: z.string().nullable().optional(),
  sortOrder: z.number().int().optional(),
  active: z.boolean().optional(),
  metadata: z.record(z.string(), z.unknown()).nullable().optional(),
})

export type CreateProductTypeInput = z.input<typeof productTypeInputSchema>
export type UpdateProductTypeInput = Partial<Omit<CreateProductTypeInput, "code">>

export function useProductTypeMutation() {
  const { baseUrl, fetcher } = useVoyantProductsContext()
  const queryClient = useQueryClient()

  const create = useMutation({
    mutationFn: async (input: CreateProductTypeInput) => {
      const { data } = await fetchWithValidation(
        "/v1/admin/products/product-types",
        productTypeSingleResponse,
        { baseUrl, fetcher },
        { method: "POST", body: JSON.stringify(input) },
      )
      return data
    },
    onSuccess: (data) => {
      void queryClient.invalidateQueries({ queryKey: productsQueryKeys.productTypes() })
      queryClient.setQueryData(productsQueryKeys.productType(data.id), data)
    },
  })

  const update = useMutation({
    mutationFn: async ({ id, input }: { id: string; input: UpdateProductTypeInput }) => {
      const { data } = await fetchWithValidation(
        `/v1/admin/products/product-types/${id}`,
        productTypeSingleResponse,
        { baseUrl, fetcher },
        { method: "PATCH", body: JSON.stringify(input) },
      )
      return data
    },
    onSuccess: (data) => {
      void queryClient.invalidateQueries({ queryKey: productsQueryKeys.productTypes() })
      queryClient.setQueryData(productsQueryKeys.productType(data.id), data)
    },
  })

  const remove = useMutation({
    mutationFn: async (id: string) =>
      fetchWithValidation(
        `/v1/admin/products/product-types/${id}`,
        successEnvelope,
        { baseUrl, fetcher },
        { method: "DELETE" },
      ),
    onSuccess: (_data, id) => {
      void queryClient.invalidateQueries({ queryKey: productsQueryKeys.productTypes() })
      queryClient.removeQueries({ queryKey: productsQueryKeys.productType(id) })
    },
  })

  return { create, update, remove }
}
