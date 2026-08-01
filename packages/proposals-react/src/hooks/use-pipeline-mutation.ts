"use client"

import { useMutation, useQueryClient } from "@tanstack/react-query"
import { z } from "zod"

import { fetchWithValidation } from "../client.js"
import { useVoyantContext } from "../provider.js"
import { proposalsQueryKeys } from "../query-keys.js"
import { pipelineSingleResponse, stageSingleResponse } from "../schemas.js"

export interface CreatePipelineInput {
  name: string
  entityType?: string
  isDefault?: boolean
  sortOrder?: number
  [key: string]: unknown
}

export type UpdatePipelineInput = Partial<CreatePipelineInput>

export interface CreateStageInput {
  pipelineId: string
  name: string
  sortOrder?: number
  probability?: number | null
  isClosed?: boolean
  isWon?: boolean
  isLost?: boolean
  [key: string]: unknown
}

export type UpdateStageInput = Partial<CreateStageInput>

const deleteResponseSchema = z.object({ success: z.boolean() })

export function usePipelineMutation() {
  const { baseUrl, fetcher } = useVoyantContext()
  const queryClient = useQueryClient()

  const createPipeline = useMutation({
    mutationFn: async (input: CreatePipelineInput) => {
      const { data } = await fetchWithValidation(
        "/v1/admin/proposals/pipelines",
        pipelineSingleResponse,
        { baseUrl, fetcher },
        { method: "POST", body: JSON.stringify(input) },
      )
      return data
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: proposalsQueryKeys.pipelines() })
    },
  })

  const updatePipeline = useMutation({
    mutationFn: async ({ id, input }: { id: string; input: UpdatePipelineInput }) => {
      const { data } = await fetchWithValidation(
        `/v1/admin/proposals/pipelines/${id}`,
        pipelineSingleResponse,
        { baseUrl, fetcher },
        { method: "PATCH", body: JSON.stringify(input) },
      )
      return data
    },
    onSuccess: (data) => {
      void queryClient.invalidateQueries({ queryKey: proposalsQueryKeys.pipelines() })
      queryClient.setQueryData(proposalsQueryKeys.pipeline(data.id), data)
    },
  })

  const removePipeline = useMutation({
    mutationFn: async (id: string) => {
      return fetchWithValidation(
        `/v1/admin/proposals/pipelines/${id}`,
        deleteResponseSchema,
        { baseUrl, fetcher },
        { method: "DELETE" },
      )
    },
    onSuccess: (_data, id) => {
      void queryClient.invalidateQueries({ queryKey: proposalsQueryKeys.pipelines() })
      queryClient.removeQueries({ queryKey: proposalsQueryKeys.pipeline(id) })
    },
  })

  const createStage = useMutation({
    mutationFn: async (input: CreateStageInput) => {
      const { data } = await fetchWithValidation(
        "/v1/admin/proposals/stages",
        stageSingleResponse,
        { baseUrl, fetcher },
        { method: "POST", body: JSON.stringify(input) },
      )
      return data
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: proposalsQueryKeys.stages() })
    },
  })

  const updateStage = useMutation({
    mutationFn: async ({ id, input }: { id: string; input: UpdateStageInput }) => {
      const { data } = await fetchWithValidation(
        `/v1/admin/proposals/stages/${id}`,
        stageSingleResponse,
        { baseUrl, fetcher },
        { method: "PATCH", body: JSON.stringify(input) },
      )
      return data
    },
    onSuccess: (data) => {
      void queryClient.invalidateQueries({ queryKey: proposalsQueryKeys.stages() })
      queryClient.setQueryData(proposalsQueryKeys.stage(data.id), data)
    },
  })

  const removeStage = useMutation({
    mutationFn: async (id: string) => {
      return fetchWithValidation(
        `/v1/admin/proposals/stages/${id}`,
        deleteResponseSchema,
        { baseUrl, fetcher },
        { method: "DELETE" },
      )
    },
    onSuccess: (_data, id) => {
      void queryClient.invalidateQueries({ queryKey: proposalsQueryKeys.stages() })
      queryClient.removeQueries({ queryKey: proposalsQueryKeys.stage(id) })
    },
  })

  return {
    createPipeline,
    updatePipeline,
    removePipeline,
    createStage,
    updateStage,
    removeStage,
  }
}
