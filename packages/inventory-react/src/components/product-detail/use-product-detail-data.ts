import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import type { MediaAsset } from "@voyant-travel/media-react"
import { useMemo } from "react"
import { productsQueryKeys, useProduct, useProductItineraries } from "../../index.js"

import { useProductDetailHost, useProductDetailMessages } from "./host.js"

import {
  type AvailabilityRule,
  type ChannelInfo,
  type ChannelProductMapping,
  type DepartureSlot,
  getChannelsQueryOptions,
  getProductChannelMappingsQueryOptions,
  getProductDetailMediaQueryOptions,
  getProductRulesQueryOptions,
  getProductSlotsQueryOptions,
  type ProductMediaItem,
} from "./product-detail-shared.js"

export interface UseProductDetailDataResult {
  product: ReturnType<typeof useProduct>["data"]
  isPending: boolean
  slots: DepartureSlot[]
  rules: AvailabilityRule[]
  channels: ChannelInfo[]
  mappings: ChannelProductMapping[]
  media: ProductMediaItem[]
  itineraryNameById: Map<string, string>
  refetch: {
    slots: () => void
    rules: () => void
    mappings: () => void
    media: () => void
  }
  mutations: {
    addChannelMapping: ReturnType<typeof useMutation<unknown, Error, string>>
    removeChannelMapping: ReturnType<typeof useMutation<unknown, Error, string>>
    duplicateProduct: ReturnType<typeof useMutation<{ data: { id: string } }, Error, void>>
    deleteProduct: ReturnType<typeof useMutation<unknown, Error, void>>
    deleteSlot: ReturnType<typeof useMutation<unknown, Error, string>>
    deleteRule: ReturnType<typeof useMutation<unknown, Error, string>>
    uploadMedia: ReturnType<
      typeof useMutation<{ data: ProductMediaItem }, Error, { file: File; dayId?: string }>
    >
    addMediaFromLibrary: ReturnType<
      typeof useMutation<unknown, Error, { assets: MediaAsset[]; dayId?: string }>
    >
    deleteMedia: ReturnType<typeof useMutation<unknown, Error, string>>
    setCover: ReturnType<typeof useMutation<unknown, Error, string>>
    setOpenGraph: ReturnType<typeof useMutation<unknown, Error, string | null>>
    generateBrochure: ReturnType<typeof useMutation<unknown, Error, void>>
  }
  invalidateProduct: () => void
}

export function useProductDetailData(productId: string): UseProductDetailDataResult {
  const queryClient = useQueryClient()
  const host = useProductDetailHost()
  const api = host.api
  const messages = useProductDetailMessages()
  const productMessages = messages.products.core

  const productQuery = useProduct(productId)
  const itinerariesQuery = useProductItineraries(productId)
  const productActionLedgerQueryKey = [...productsQueryKeys.product(productId), "action-ledger"]

  const slotsQuery = useQuery(getProductSlotsQueryOptions(api, productId))
  const rulesQuery = useQuery(getProductRulesQueryOptions(api, productId))
  const channelsQuery = useQuery(getChannelsQueryOptions(api))
  const mappingsQuery = useQuery(getProductChannelMappingsQueryOptions(api, productId))
  const mediaQuery = useQuery(getProductDetailMediaQueryOptions(api, productId))

  const addChannelMapping = useMutation({
    mutationFn: (channelId: string) =>
      api.post("/v1/admin/distribution/product-mappings", {
        channelId,
        productId,
        active: true,
      }),
    onSuccess: () => {
      void mappingsQuery.refetch()
      void queryClient.invalidateQueries({ queryKey: productActionLedgerQueryKey })
    },
  })

  const removeChannelMapping = useMutation({
    mutationFn: (mappingId: string) =>
      api.delete(`/v1/admin/distribution/product-mappings/${mappingId}`),
    onSuccess: () => {
      void mappingsQuery.refetch()
      void queryClient.invalidateQueries({ queryKey: productActionLedgerQueryKey })
    },
  })

  const deleteProduct = useMutation({
    mutationFn: () => api.delete(`/v1/admin/products/${productId}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["products"] })
      void queryClient.invalidateQueries({ queryKey: productActionLedgerQueryKey })
    },
  })

  const duplicateProduct = useMutation({
    mutationFn: () =>
      api.post<{ data: { id: string } }>(`/v1/admin/products/${productId}/duplicate`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: productsQueryKeys.products() })
    },
  })

  const deleteSlot = useMutation({
    mutationFn: (slotId: string) => api.delete(`/v1/admin/operations/availability/slots/${slotId}`),
    onSuccess: () => {
      void slotsQuery.refetch()
      void queryClient.invalidateQueries({ queryKey: productActionLedgerQueryKey })
    },
  })

  const deleteRule = useMutation({
    mutationFn: (ruleId: string) => api.delete(`/v1/admin/operations/availability/rules/${ruleId}`),
    onSuccess: () => {
      void rulesQuery.refetch()
      void queryClient.invalidateQueries({ queryKey: productActionLedgerQueryKey })
    },
  })

  const uploadMedia = useMutation({
    mutationFn: async ({ file, dayId }: { file: File; dayId?: string }) => {
      if (!host.uploadMedia) throw new Error(productMessages.uploadFailed)
      const result = await host.uploadMedia(file, { productId, dayId })
      const endpoint = dayId
        ? `/v1/admin/products/${productId}/days/${dayId}/media`
        : `/v1/admin/products/${productId}/media`
      return api.post<{ data: ProductMediaItem }>(endpoint, {
        mediaType: result.mediaType,
        name: result.name,
        url: result.url,
        storageKey: result.storageKey,
        mimeType: result.mimeType,
        fileSize: result.fileSize,
        width: result.width,
        height: result.height,
      })
    },
    onSuccess: () => {
      void mediaQuery.refetch()
      void queryClient.invalidateQueries({ queryKey: productActionLedgerQueryKey })
    },
  })

  const addMediaFromLibrary = useMutation({
    mutationFn: async ({ assets, dayId }: { assets: MediaAsset[]; dayId?: string }) => {
      const endpoint = dayId
        ? `/v1/admin/products/${productId}/days/${dayId}/media`
        : `/v1/admin/products/${productId}/media`
      for (const asset of assets) {
        await api.post(endpoint, {
          mediaType: asset.type,
          name: asset.name,
          url: asset.url ?? `/api/v1/admin/media/${asset.storageKey}`,
          storageKey: asset.storageKey,
          mimeType: asset.mimeType,
          fileSize: asset.fileSize,
          width: asset.width,
          height: asset.height,
          altText: asset.altText,
          assetId: asset.id,
        })
      }
    },
    onSuccess: () => {
      void mediaQuery.refetch()
      void queryClient.invalidateQueries({ queryKey: productActionLedgerQueryKey })
    },
  })

  const deleteMedia = useMutation({
    mutationFn: (mediaId: string) => api.delete(`/v1/admin/products/media/${mediaId}`),
    onSuccess: () => {
      void mediaQuery.refetch()
      void queryClient.invalidateQueries({ queryKey: productActionLedgerQueryKey })
    },
  })

  const setCover = useMutation({
    mutationFn: (mediaId: string) => api.patch(`/v1/admin/products/media/${mediaId}/set-cover`, {}),
    onSuccess: () => {
      void mediaQuery.refetch()
      void queryClient.invalidateQueries({ queryKey: productActionLedgerQueryKey })
    },
  })

  const setOpenGraph = useMutation({
    mutationFn: (mediaId: string | null) =>
      api.patch(`/v1/admin/products/${productId}/open-graph-image`, { mediaId }),
    onSuccess: () => {
      void mediaQuery.refetch()
      void queryClient.invalidateQueries({ queryKey: productActionLedgerQueryKey })
    },
  })

  const generateBrochure = useMutation({
    mutationFn: () => api.post(`/v1/admin/products/${productId}/brochure/generate`, {}),
    onSuccess: () => {
      void mediaQuery.refetch()
      void queryClient.invalidateQueries({ queryKey: productActionLedgerQueryKey })
    },
  })

  const itineraryNameById = useMemo(
    () =>
      new Map(
        (itinerariesQuery.data?.data ?? []).map(
          (itinerary) => [itinerary.id, itinerary.name] as const,
        ),
      ),
    [itinerariesQuery.data],
  )

  const invalidateProduct = () => {
    void queryClient.invalidateQueries({ queryKey: productsQueryKeys.product(productId) })
    void queryClient.invalidateQueries({ queryKey: productsQueryKeys.products() })
    void queryClient.invalidateQueries({ queryKey: productActionLedgerQueryKey })
  }

  return {
    product: productQuery.data,
    isPending: productQuery.isPending,
    slots: slotsQuery.data?.data ?? [],
    rules: rulesQuery.data?.data ?? [],
    channels: channelsQuery.data?.data ?? [],
    mappings: mappingsQuery.data?.data ?? [],
    media: mediaQuery.data?.data ?? [],
    itineraryNameById,
    refetch: {
      slots: () => void slotsQuery.refetch(),
      rules: () => void rulesQuery.refetch(),
      mappings: () => void mappingsQuery.refetch(),
      media: () => void mediaQuery.refetch(),
    },
    mutations: {
      addChannelMapping,
      removeChannelMapping,
      duplicateProduct,
      deleteProduct,
      deleteSlot,
      deleteRule,
      uploadMedia,
      addMediaFromLibrary,
      deleteMedia,
      setCover,
      setOpenGraph,
      generateBrochure,
    },
    invalidateProduct,
  }
}
