"use client"

import { useQuery } from "@tanstack/react-query"

import { fetchWithValidation } from "../client.js"
import { useVoyantContext } from "../provider.js"
import { proposalsQueryKeys, type StagesListFilters } from "../query-keys.js"
import { stageListResponse, stageSingleResponse } from "../schemas.js"

export interface UseStagesOptions extends StagesListFilters {
  enabled?: boolean
}

export function useStages(options: UseStagesOptions = {}) {
  const { baseUrl, fetcher } = useVoyantContext()
  const { enabled = true, ...filters } = options

  return useQuery({
    queryKey: proposalsQueryKeys.stagesList(filters),
    queryFn: () => {
      const params = new URLSearchParams()
      if (filters.pipelineId) params.set("pipelineId", filters.pipelineId)
      if (filters.limit !== undefined) params.set("limit", String(filters.limit))
      if (filters.offset !== undefined) params.set("offset", String(filters.offset))
      const qs = params.toString()
      return fetchWithValidation(
        `/v1/admin/proposals/stages${qs ? `?${qs}` : ""}`,
        stageListResponse,
        {
          baseUrl,
          fetcher,
        },
      )
    },
    enabled,
  })
}

export interface UseStageOptions {
  enabled?: boolean
}

export function useStage(id: string | undefined, options: UseStageOptions = {}) {
  const { baseUrl, fetcher } = useVoyantContext()
  const { enabled = true } = options

  return useQuery({
    queryKey: proposalsQueryKeys.stage(id ?? ""),
    queryFn: async () => {
      if (!id) throw new Error("useStage requires an id")
      const { data } = await fetchWithValidation(
        `/v1/admin/proposals/stages/${id}`,
        stageSingleResponse,
        {
          baseUrl,
          fetcher,
        },
      )
      return data
    },
    enabled: enabled && Boolean(id),
  })
}
