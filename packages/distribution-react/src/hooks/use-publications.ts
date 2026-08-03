"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { z } from "zod"

import { fetchWithValidation } from "../client.js"
import { useVoyantDistributionContext } from "../provider.js"
import type {
  ProductPublicationsListFilters,
  SourcePublicationsListFilters,
  SupplierPublicationsListFilters,
} from "../query-keys.js"
import { distributionQueryKeys } from "../query-keys.js"
import {
  getEffectivePublicationQueryOptions,
  getProductPublicationsQueryOptions,
  getPublicationSourcesQueryOptions,
  getSourcePublicationsQueryOptions,
  getSupplierPublicationsQueryOptions,
} from "../query-options.js"
import {
  channelProductPublicationSingleResponse,
  publicationDecisionSchema,
  sourcePublicationMutationResponse,
  sourcePublicationPreviewResponse,
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

export const sourcePublicationInputSchema = publicationInputSchema.extend({
  sourceKind: z.string().min(1),
  // Absent addresses every connection of the kind; present addresses one.
  sourceConnectionId: z.string().min(1).nullable().optional(),
})

export type ProductPublicationInput = z.infer<typeof productPublicationInputSchema>
export type SupplierPublicationInput = z.infer<typeof supplierPublicationInputSchema>
export type SourcePublicationInput = z.infer<typeof sourcePublicationInputSchema>

export interface UseProductPublicationsOptions extends ProductPublicationsListFilters {
  enabled?: boolean
}

export interface UseSupplierPublicationsOptions extends SupplierPublicationsListFilters {
  enabled?: boolean
}

export interface UseSourcePublicationsOptions extends SourcePublicationsListFilters {
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

export function useSourcePublications(options: UseSourcePublicationsOptions = {}) {
  const client = useVoyantDistributionContext()
  const { enabled = true } = options
  return useQuery({ ...getSourcePublicationsQueryOptions(client, options), enabled })
}

/** The supply sources discovery has found, as publication subjects. */
export function usePublicationSources(options: { enabled?: boolean } = {}) {
  const client = useVoyantDistributionContext()
  return useQuery({
    ...getPublicationSourcesQueryOptions(client),
    enabled: options.enabled ?? true,
  })
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
    void queryClient.invalidateQueries({ queryKey: distributionQueryKeys.sourcePublications() })
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

  const previewSource = useMutation({
    mutationFn: (input: SourcePublicationInput) =>
      fetchWithValidation(
        "/v1/admin/distribution/source-publications/preview",
        sourcePublicationPreviewResponse,
        client,
        { method: "POST", body: JSON.stringify(sourcePublicationInputSchema.parse(input)) },
      ),
  })

  const upsertSource = useMutation({
    mutationFn: (input: SourcePublicationInput) =>
      fetchWithValidation(
        "/v1/admin/distribution/source-publications",
        sourcePublicationMutationResponse,
        client,
        { method: "PUT", body: JSON.stringify(sourcePublicationInputSchema.parse(input)) },
      ),
    onSuccess: invalidate,
  })

  const removeSource = useMutation({
    mutationFn: (id: string) =>
      fetchWithValidation(
        `/v1/admin/distribution/source-publications/${encodeURIComponent(id)}`,
        successEnvelope,
        client,
        { method: "DELETE" },
      ),
    onSuccess: invalidate,
  })

  return {
    upsertProduct,
    removeProduct,
    previewSupplier,
    upsertSupplier,
    removeSupplier,
    previewSource,
    upsertSource,
    removeSource,
  }
}
