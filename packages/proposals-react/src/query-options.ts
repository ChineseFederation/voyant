"use client"

import { queryOptions } from "@tanstack/react-query"

import { type FetchWithValidationOptions, fetchWithValidation } from "./client.js"
import type { UsePipelinesOptions } from "./hooks/use-pipelines.js"
import type { UseProposalVersionsOptions } from "./hooks/use-proposal-versions.js"
import type { UseProposalsOptions } from "./hooks/use-proposals.js"
import type { UseStagesOptions } from "./hooks/use-stages.js"
import { proposalsQueryKeys } from "./query-keys.js"
import {
  pipelineListResponse,
  pipelineSingleResponse,
  proposalListResponse,
  proposalSingleResponse,
  proposalVersionLineListResponse,
  proposalVersionListResponse,
  proposalVersionSingleResponse,
  stageListResponse,
  stageSingleResponse,
} from "./schemas.js"

const basePath = "/v1/admin/proposals"

export function getPipelinesQueryOptions(
  client: FetchWithValidationOptions,
  options: UsePipelinesOptions = {},
) {
  const { enabled: _enabled = true, ...filters } = options

  return queryOptions({
    queryKey: proposalsQueryKeys.pipelinesList(filters),
    queryFn: () => {
      const params = new URLSearchParams()
      if (filters.entityType) params.set("entityType", filters.entityType)
      if (filters.limit !== undefined) params.set("limit", String(filters.limit))
      if (filters.offset !== undefined) params.set("offset", String(filters.offset))
      const qs = params.toString()

      return fetchWithValidation(
        `${basePath}/pipelines${qs ? `?${qs}` : ""}`,
        pipelineListResponse,
        {
          baseUrl: client.baseUrl,
          fetcher: client.fetcher,
        },
      )
    },
  })
}

export function getPipelineQueryOptions(client: FetchWithValidationOptions, id: string) {
  return queryOptions({
    queryKey: proposalsQueryKeys.pipeline(id),
    queryFn: async () => {
      const { data } = await fetchWithValidation(
        `${basePath}/pipelines/${id}`,
        pipelineSingleResponse,
        {
          baseUrl: client.baseUrl,
          fetcher: client.fetcher,
        },
      )
      return data
    },
  })
}

export function getStagesQueryOptions(
  client: FetchWithValidationOptions,
  options: UseStagesOptions = {},
) {
  const { enabled: _enabled = true, ...filters } = options

  return queryOptions({
    queryKey: proposalsQueryKeys.stagesList(filters),
    queryFn: () => {
      const params = new URLSearchParams()
      if (filters.pipelineId) params.set("pipelineId", filters.pipelineId)
      if (filters.limit !== undefined) params.set("limit", String(filters.limit))
      if (filters.offset !== undefined) params.set("offset", String(filters.offset))
      const qs = params.toString()

      return fetchWithValidation(`${basePath}/stages${qs ? `?${qs}` : ""}`, stageListResponse, {
        baseUrl: client.baseUrl,
        fetcher: client.fetcher,
      })
    },
  })
}

export function getStageQueryOptions(client: FetchWithValidationOptions, id: string) {
  return queryOptions({
    queryKey: proposalsQueryKeys.stage(id),
    queryFn: async () => {
      const { data } = await fetchWithValidation(`${basePath}/stages/${id}`, stageSingleResponse, {
        baseUrl: client.baseUrl,
        fetcher: client.fetcher,
      })
      return data
    },
  })
}

export function getProposalsQueryOptions(
  client: FetchWithValidationOptions,
  options: UseProposalsOptions = {},
) {
  const { enabled: _enabled = true, ...filters } = options

  return queryOptions({
    queryKey: proposalsQueryKeys.proposalsList(filters),
    queryFn: () => {
      const params = new URLSearchParams()
      if (filters.search) params.set("search", filters.search)
      if (filters.personId) params.set("personId", filters.personId)
      if (filters.organizationId) params.set("organizationId", filters.organizationId)
      if (filters.pipelineId) params.set("pipelineId", filters.pipelineId)
      if (filters.stageId) params.set("stageId", filters.stageId)
      if (filters.ownerId) params.set("ownerId", filters.ownerId)
      if (filters.status) params.set("status", filters.status)
      if (filters.limit !== undefined) params.set("limit", String(filters.limit))
      if (filters.offset !== undefined) params.set("offset", String(filters.offset))
      const qs = params.toString()

      return fetchWithValidation(
        `${basePath}/proposals${qs ? `?${qs}` : ""}`,
        proposalListResponse,
        {
          baseUrl: client.baseUrl,
          fetcher: client.fetcher,
        },
      )
    },
  })
}

export function getProposalQueryOptions(client: FetchWithValidationOptions, id: string) {
  return queryOptions({
    queryKey: proposalsQueryKeys.proposal(id),
    queryFn: async () => {
      const { data } = await fetchWithValidation(
        `${basePath}/proposals/${id}`,
        proposalSingleResponse,
        {
          baseUrl: client.baseUrl,
          fetcher: client.fetcher,
        },
      )
      return data
    },
  })
}

export function getProposalVersionsQueryOptions(
  client: FetchWithValidationOptions,
  options: UseProposalVersionsOptions = {},
) {
  const { enabled: _enabled = true, ...filters } = options

  return queryOptions({
    queryKey: proposalsQueryKeys.proposalVersionsList(filters),
    queryFn: () => {
      const params = new URLSearchParams()
      if (filters.proposalId) params.set("proposalId", filters.proposalId)
      if (filters.status) params.set("status", filters.status)
      if (filters.limit !== undefined) params.set("limit", String(filters.limit))
      if (filters.offset !== undefined) params.set("offset", String(filters.offset))
      const qs = params.toString()

      return fetchWithValidation(
        `${basePath}/proposal-versions${qs ? `?${qs}` : ""}`,
        proposalVersionListResponse,
        {
          baseUrl: client.baseUrl,
          fetcher: client.fetcher,
        },
      )
    },
  })
}

export function getProposalVersionQueryOptions(client: FetchWithValidationOptions, id: string) {
  return queryOptions({
    queryKey: proposalsQueryKeys.proposalVersion(id),
    queryFn: async () => {
      const { data } = await fetchWithValidation(
        `${basePath}/proposal-versions/${id}`,
        proposalVersionSingleResponse,
        {
          baseUrl: client.baseUrl,
          fetcher: client.fetcher,
        },
      )
      return data
    },
  })
}

export function getProposalVersionLinesQueryOptions(
  client: FetchWithValidationOptions,
  proposalVersionId: string,
) {
  return queryOptions({
    queryKey: proposalsQueryKeys.proposalVersionLines(proposalVersionId),
    queryFn: async () => {
      const data = await fetchWithValidation(
        `${basePath}/proposal-versions/${proposalVersionId}/lines`,
        proposalVersionLineListResponse,
        {
          baseUrl: client.baseUrl,
          fetcher: client.fetcher,
        },
      )
      return data.data
    },
  })
}
