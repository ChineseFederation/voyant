"use client"

import { queryOptions } from "@tanstack/react-query"

import { type FetchWithValidationOptions, fetchWithValidation } from "./client.js"
import type { UseBookingLinksOptions } from "./hooks/use-booking-links.js"
import type { UseBookingsOptions } from "./hooks/use-bookings.js"
import type { UseChannelsOptions } from "./hooks/use-channels.js"
import type { UseCommissionRulesOptions } from "./hooks/use-commission-rules.js"
import type { UseContractsOptions } from "./hooks/use-contracts.js"
import type { UseMappingsOptions } from "./hooks/use-mappings.js"
import type { UseProductsOptions } from "./hooks/use-products.js"
import type {
  UseEffectivePublicationOptions,
  UseProductPublicationsOptions,
  UseSourcePublicationsOptions,
  UseSupplierPublicationsOptions,
} from "./hooks/use-publications.js"
import type { UseSuppliersOptions } from "./hooks/use-suppliers.js"
import type { UseWebhookEventsOptions } from "./hooks/use-webhook-events.js"
import { distributionQueryKeys } from "./query-keys.js"
import {
  bookingListResponse,
  bookingSingleResponse,
  channelBookingLinkListResponse,
  channelBookingLinkSingleResponse,
  channelCommissionRuleListResponse,
  channelCommissionRuleSingleResponse,
  channelContractListResponse,
  channelContractSingleResponse,
  channelListResponse,
  channelProductMappingListResponse,
  channelProductMappingSingleResponse,
  channelProductPublicationListResponse,
  channelSingleResponse,
  channelSourcePublicationListResponse,
  channelSupplierPublicationListResponse,
  channelWebhookEventListResponse,
  channelWebhookEventSingleResponse,
  effectivePublicationSingleResponse,
  productListResponse,
  productSingleResponse,
  publicationSourceListResponse,
  supplierListResponse,
  supplierSingleResponse,
} from "./schemas.js"

function appendPagination(params: URLSearchParams, filters: { limit?: number; offset?: number }) {
  if (filters.limit !== undefined) params.set("limit", String(filters.limit))
  if (filters.offset !== undefined) params.set("offset", String(filters.offset))
}

export function getSuppliersQueryOptions(
  client: FetchWithValidationOptions,
  options: UseSuppliersOptions = {},
) {
  const { enabled: _enabled = true, ...filters } = options
  return queryOptions({
    queryKey: distributionQueryKeys.suppliersList(filters),
    queryFn: () => {
      const params = new URLSearchParams()
      appendPagination(params, filters)
      const qs = params.toString()
      return fetchWithValidation(
        `/v1/admin/suppliers${qs ? `?${qs}` : ""}`,
        supplierListResponse,
        client,
      )
    },
  })
}

export function getSupplierQueryOptions(
  client: FetchWithValidationOptions,
  id: string | null | undefined,
) {
  return queryOptions({
    queryKey: distributionQueryKeys.supplier(id ?? ""),
    queryFn: async () => {
      if (!id) throw new Error("getSupplierQueryOptions requires an id")
      return fetchWithValidation(`/v1/admin/suppliers/${id}`, supplierSingleResponse, client)
    },
  })
}

export function getProductsQueryOptions(
  client: FetchWithValidationOptions,
  options: UseProductsOptions = {},
) {
  const { enabled: _enabled = true, ...filters } = options
  return queryOptions({
    queryKey: distributionQueryKeys.productsList(filters),
    queryFn: () => {
      const params = new URLSearchParams()
      appendPagination(params, filters)
      const qs = params.toString()
      return fetchWithValidation(
        `/v1/admin/products${qs ? `?${qs}` : ""}`,
        productListResponse,
        client,
      )
    },
  })
}

export function getProductQueryOptions(
  client: FetchWithValidationOptions,
  id: string | null | undefined,
) {
  return queryOptions({
    queryKey: distributionQueryKeys.product(id ?? ""),
    queryFn: async () => {
      if (!id) throw new Error("getProductQueryOptions requires an id")
      return fetchWithValidation(`/v1/admin/products/${id}`, productSingleResponse, client)
    },
  })
}

export function getBookingsQueryOptions(
  client: FetchWithValidationOptions,
  options: UseBookingsOptions = {},
) {
  const { enabled: _enabled = true, ...filters } = options
  return queryOptions({
    queryKey: distributionQueryKeys.bookingsList(filters),
    queryFn: () => {
      const params = new URLSearchParams()
      appendPagination(params, filters)
      const qs = params.toString()
      return fetchWithValidation(
        `/v1/admin/bookings${qs ? `?${qs}` : ""}`,
        bookingListResponse,
        client,
      )
    },
  })
}

export function getBookingQueryOptions(
  client: FetchWithValidationOptions,
  id: string | null | undefined,
) {
  return queryOptions({
    queryKey: distributionQueryKeys.booking(id ?? ""),
    queryFn: async () => {
      if (!id) throw new Error("getBookingQueryOptions requires an id")
      return fetchWithValidation(`/v1/admin/bookings/${id}`, bookingSingleResponse, client)
    },
  })
}

export function getChannelsQueryOptions(
  client: FetchWithValidationOptions,
  options: UseChannelsOptions = {},
) {
  const { enabled: _enabled = true, ...filters } = options
  return queryOptions({
    queryKey: distributionQueryKeys.channelsList(filters),
    queryFn: () => {
      const params = new URLSearchParams()
      appendPagination(params, filters)
      if (filters.system) params.set("system", filters.system)
      const qs = params.toString()
      return fetchWithValidation(
        `/v1/admin/distribution/channels${qs ? `?${qs}` : ""}`,
        channelListResponse,
        client,
      )
    },
  })
}

export function getChannelQueryOptions(
  client: FetchWithValidationOptions,
  id: string | null | undefined,
) {
  return queryOptions({
    queryKey: distributionQueryKeys.channel(id ?? ""),
    queryFn: async () => {
      if (!id) throw new Error("getChannelQueryOptions requires an id")
      return fetchWithValidation(
        `/v1/admin/distribution/channels/${id}`,
        channelSingleResponse,
        client,
      )
    },
  })
}

export function getContractsQueryOptions(
  client: FetchWithValidationOptions,
  options: UseContractsOptions = {},
) {
  const { enabled: _enabled = true, ...filters } = options
  return queryOptions({
    queryKey: distributionQueryKeys.contractsList(filters),
    queryFn: () => {
      const params = new URLSearchParams()
      if ("channelId" in filters && filters.channelId) params.set("channelId", filters.channelId)
      appendPagination(params, filters)
      const qs = params.toString()
      return fetchWithValidation(
        `/v1/admin/distribution/contracts${qs ? `?${qs}` : ""}`,
        channelContractListResponse,
        client,
      )
    },
  })
}

export function getContractQueryOptions(
  client: FetchWithValidationOptions,
  id: string | null | undefined,
) {
  return queryOptions({
    queryKey: distributionQueryKeys.contract(id ?? ""),
    queryFn: async () => {
      if (!id) throw new Error("getContractQueryOptions requires an id")
      return fetchWithValidation(
        `/v1/admin/distribution/contracts/${id}`,
        channelContractSingleResponse,
        client,
      )
    },
  })
}

export function getCommissionRulesQueryOptions(
  client: FetchWithValidationOptions,
  options: UseCommissionRulesOptions = {},
) {
  const { enabled: _enabled = true, ...filters } = options
  return queryOptions({
    queryKey: distributionQueryKeys.commissionRulesList(filters),
    queryFn: () => {
      const params = new URLSearchParams()
      if (filters.contractId) params.set("contractId", filters.contractId)
      appendPagination(params, filters)
      const qs = params.toString()
      return fetchWithValidation(
        `/v1/admin/distribution/commission-rules${qs ? `?${qs}` : ""}`,
        channelCommissionRuleListResponse,
        client,
      )
    },
  })
}

export function getCommissionRuleQueryOptions(
  client: FetchWithValidationOptions,
  id: string | null | undefined,
) {
  return queryOptions({
    queryKey: distributionQueryKeys.commissionRule(id ?? ""),
    queryFn: async () => {
      if (!id) throw new Error("getCommissionRuleQueryOptions requires an id")
      return fetchWithValidation(
        `/v1/admin/distribution/commission-rules/${id}`,
        channelCommissionRuleSingleResponse,
        client,
      )
    },
  })
}

export function getMappingsQueryOptions(
  client: FetchWithValidationOptions,
  options: UseMappingsOptions = {},
) {
  const { enabled: _enabled = true, ...filters } = options
  return queryOptions({
    queryKey: distributionQueryKeys.mappingsList(filters),
    queryFn: () => {
      const params = new URLSearchParams()
      if (filters.channelId) params.set("channelId", filters.channelId)
      appendPagination(params, filters)
      const qs = params.toString()
      return fetchWithValidation(
        `/v1/admin/distribution/product-mappings${qs ? `?${qs}` : ""}`,
        channelProductMappingListResponse,
        client,
      )
    },
  })
}

export function getMappingQueryOptions(
  client: FetchWithValidationOptions,
  id: string | null | undefined,
) {
  return queryOptions({
    queryKey: distributionQueryKeys.mapping(id ?? ""),
    queryFn: async () => {
      if (!id) throw new Error("getMappingQueryOptions requires an id")
      return fetchWithValidation(
        `/v1/admin/distribution/product-mappings/${id}`,
        channelProductMappingSingleResponse,
        client,
      )
    },
  })
}

export function getProductPublicationsQueryOptions(
  client: FetchWithValidationOptions,
  options: UseProductPublicationsOptions = {},
) {
  const { enabled: _enabled = true, ...filters } = options
  return queryOptions({
    queryKey: distributionQueryKeys.productPublicationsList(filters),
    queryFn: () => {
      const params = new URLSearchParams()
      if (filters.channelId) params.set("channelId", filters.channelId)
      if (filters.productId) params.set("productId", filters.productId)
      if (filters.decision) params.set("decision", filters.decision)
      appendPagination(params, filters)
      const qs = params.toString()
      return fetchWithValidation(
        `/v1/admin/distribution/product-publications${qs ? `?${qs}` : ""}`,
        channelProductPublicationListResponse,
        client,
      )
    },
  })
}

export function getSourcePublicationsQueryOptions(
  client: FetchWithValidationOptions,
  options: UseSourcePublicationsOptions = {},
) {
  const { enabled: _enabled = true, ...filters } = options
  return queryOptions({
    queryKey: distributionQueryKeys.sourcePublicationsList(filters),
    queryFn: () => {
      const params = new URLSearchParams()
      if (filters.channelId) params.set("channelId", filters.channelId)
      if (filters.sourceKind) params.set("sourceKind", filters.sourceKind)
      if (filters.sourceConnectionId) params.set("sourceConnectionId", filters.sourceConnectionId)
      if (filters.decision) params.set("decision", filters.decision)
      appendPagination(params, filters)
      const qs = params.toString()
      return fetchWithValidation(
        `/v1/admin/distribution/source-publications${qs ? `?${qs}` : ""}`,
        channelSourcePublicationListResponse,
        client,
      )
    },
  })
}

export function getPublicationSourcesQueryOptions(client: FetchWithValidationOptions) {
  return queryOptions({
    queryKey: distributionQueryKeys.publicationSources(),
    queryFn: () =>
      fetchWithValidation(
        "/v1/admin/distribution/publication-sources",
        publicationSourceListResponse,
        client,
      ),
  })
}

export function getSupplierPublicationsQueryOptions(
  client: FetchWithValidationOptions,
  options: UseSupplierPublicationsOptions = {},
) {
  const { enabled: _enabled = true, ...filters } = options
  return queryOptions({
    queryKey: distributionQueryKeys.supplierPublicationsList(filters),
    queryFn: () => {
      const params = new URLSearchParams()
      if (filters.channelId) params.set("channelId", filters.channelId)
      if (filters.supplierId) params.set("supplierId", filters.supplierId)
      if (filters.decision) params.set("decision", filters.decision)
      appendPagination(params, filters)
      const qs = params.toString()
      return fetchWithValidation(
        `/v1/admin/distribution/supplier-publications${qs ? `?${qs}` : ""}`,
        channelSupplierPublicationListResponse,
        client,
      )
    },
  })
}

export function getEffectivePublicationQueryOptions(
  client: FetchWithValidationOptions,
  options: UseEffectivePublicationOptions,
) {
  return queryOptions({
    queryKey: distributionQueryKeys.effectivePublication(
      options.channelId ?? "",
      options.productId ?? "",
      options.canonicalSupplierId,
    ),
    queryFn: async () => {
      if (!options.channelId || !options.productId) {
        throw new Error("getEffectivePublicationQueryOptions requires channelId and productId")
      }
      return fetchWithValidation(
        "/v1/admin/distribution/publications/effective",
        effectivePublicationSingleResponse,
        client,
        {
          method: "POST",
          body: JSON.stringify({
            channelId: options.channelId,
            productId: options.productId,
            canonicalSupplierId: options.canonicalSupplierId ?? undefined,
          }),
        },
      )
    },
  })
}

export function getBookingLinksQueryOptions(
  client: FetchWithValidationOptions,
  options: UseBookingLinksOptions = {},
) {
  const { enabled: _enabled = true, ...filters } = options
  return queryOptions({
    queryKey: distributionQueryKeys.bookingLinksList(filters),
    queryFn: () => {
      const params = new URLSearchParams()
      if (filters.channelId) params.set("channelId", filters.channelId)
      appendPagination(params, filters)
      const qs = params.toString()
      return fetchWithValidation(
        `/v1/admin/distribution/booking-links${qs ? `?${qs}` : ""}`,
        channelBookingLinkListResponse,
        client,
      )
    },
  })
}

export function getBookingLinkQueryOptions(
  client: FetchWithValidationOptions,
  id: string | null | undefined,
) {
  return queryOptions({
    queryKey: distributionQueryKeys.bookingLink(id ?? ""),
    queryFn: async () => {
      if (!id) throw new Error("getBookingLinkQueryOptions requires an id")
      return fetchWithValidation(
        `/v1/admin/distribution/booking-links/${id}`,
        channelBookingLinkSingleResponse,
        client,
      )
    },
  })
}

export function getWebhookEventsQueryOptions(
  client: FetchWithValidationOptions,
  options: UseWebhookEventsOptions = {},
) {
  const { enabled: _enabled = true, ...filters } = options
  return queryOptions({
    queryKey: distributionQueryKeys.webhookEventsList(filters),
    queryFn: () => {
      const params = new URLSearchParams()
      if (filters.channelId) params.set("channelId", filters.channelId)
      appendPagination(params, filters)
      const qs = params.toString()
      return fetchWithValidation(
        `/v1/admin/distribution/webhook-events${qs ? `?${qs}` : ""}`,
        channelWebhookEventListResponse,
        client,
      )
    },
  })
}

export function getWebhookEventQueryOptions(
  client: FetchWithValidationOptions,
  id: string | null | undefined,
) {
  return queryOptions({
    queryKey: distributionQueryKeys.webhookEvent(id ?? ""),
    queryFn: async () => {
      if (!id) throw new Error("getWebhookEventQueryOptions requires an id")
      return fetchWithValidation(
        `/v1/admin/distribution/webhook-events/${id}`,
        channelWebhookEventSingleResponse,
        client,
      )
    },
  })
}
