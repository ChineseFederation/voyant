"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { z } from "zod"

import { fetchWithValidation } from "../client.js"
import { useVoyantDistributionContext } from "../provider.js"
import type {
  ProductPublicationsListFilters,
  SupplierPublicationsListFilters,
} from "../query-keys.js"
import { distributionQueryKeys } from "../query-keys.js"
import {
  getEffectivePublicationQueryOptions,
  getProductPublicationsQueryOptions,
  getSupplierPublicationsQueryOptions,
} from "../query-options.js"
import {
  channelProductPublicationSingleResponse,
  publicationDecisionSchema,
  successEnvelope,
  supplierPublicationMutationResponse,
  supplierPublicationPreviewResponse,
} from "../schemas.js"

const publicationInputSchema = z.object({
  channelId: z.string().min(1),
  decision: publicationDecisionSchema,
  reason: z.string().min(1).nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).nullable().optional(),
})

export const productPublicationInputSchema = publicationInputSchema.extend({
  productId: z.string().min(1),
})

export const supplierPublicationInputSchema = publicationInputSchema.extend({
  supplierId: z.string().min(1),
})

export type ProductPublicationInput = z.infer<typeof productPublicationInputSchema>
export type SupplierPublicationInput = z.infer<typeof supplierPublicationInputSchema>

export interface UseProductPublicationsOptions extends ProductPublicationsListFilters {
  enabled?: boolean
}

export interface UseSupplierPublicationsOptions extends SupplierPublicationsListFilters {
  enabled?: boolean
}

export interface UseEffectivePublicationOptions {
  channelId?: string | null
  productId?: string | null
  canonicalSupplierId?: string | null
  enabled?: boolean
}

export function useProductPublications(options: UseProductPublicationsOptions = {}) {
  const client = useVoyantDistributionContext()
  const { enabled = true } = options
  return useQuery({ ...getProductPublicationsQueryOptions(client, options), enabled })
}

export function useSupplierPublications(options: UseSupplierPublicationsOptions = {}) {
  const client = useVoyantDistributionContext()
  const { enabled = true } = options
  return useQuery({ ...getSupplierPublicationsQueryOptions(client, options), enabled })
}

export function useEffectivePublication(options: UseEffectivePublicationOptions) {
  const client = useVoyantDistributionContext()
  const enabled = !!options.channelId && !!options.productId && (options.enabled ?? true)
  return useQuery({ ...getEffectivePublicationQueryOptions(client, options), enabled })
}

export function usePublicationMutation() {
  const { baseUrl, fetcher } = useVoyantDistributionContext()
  const queryClient = useQueryClient()
  const client = { baseUrl, fetcher }

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: distributionQueryKeys.productPublications() })
    void queryClient.invalidateQueries({ queryKey: distributionQueryKeys.supplierPublications() })
    void queryClient.invalidateQueries({ queryKey: distributionQueryKeys.all })
  }

  const upsertProduct = useMutation({
    mutationFn: async (input: ProductPublicationInput) => {
      const { data } = await fetchWithValidation(
        "/v1/admin/distribution/product-publications",
        channelProductPublicationSingleResponse,
        client,
        { method: "PUT", body: JSON.stringify(productPublicationInputSchema.parse(input)) },
      )
      return data
    },
    onSuccess: invalidate,
  })

  const removeProduct = useMutation({
    mutationFn: (id: string) =>
      fetchWithValidation(
        `/v1/admin/distribution/product-publications/${encodeURIComponent(id)}`,
        successEnvelope,
        client,
        { method: "DELETE" },
      ),
    onSuccess: invalidate,
  })

  const previewSupplier = useMutation({
    mutationFn: (input: SupplierPublicationInput) =>
      fetchWithValidation(
        "/v1/admin/distribution/supplier-publications/preview",
        supplierPublicationPreviewResponse,
        client,
        { method: "POST", body: JSON.stringify(supplierPublicationInputSchema.parse(input)) },
      ),
  })

  const upsertSupplier = useMutation({
    mutationFn: (input: SupplierPublicationInput) =>
      fetchWithValidation(
        "/v1/admin/distribution/supplier-publications",
        supplierPublicationMutationResponse,
        client,
        { method: "PUT", body: JSON.stringify(supplierPublicationInputSchema.parse(input)) },
      ),
    onSuccess: invalidate,
  })

  const removeSupplier = useMutation({
    mutationFn: (id: string) =>
      fetchWithValidation(
        `/v1/admin/distribution/supplier-publications/${encodeURIComponent(id)}`,
        successEnvelope,
        client,
        { method: "DELETE" },
      ),
    onSuccess: invalidate,
  })

  return { upsertProduct, removeProduct, previewSupplier, upsertSupplier, removeSupplier }
}
