"use client"

import { useMutation, useQueryClient } from "@tanstack/react-query"
import { z } from "zod"

import { fetchWithValidation } from "../client.js"
import { useVoyantDistributionContext } from "../provider.js"
import { distributionQueryKeys } from "../query-keys.js"
import { channelKindSchema, channelSingleResponse, successEnvelope } from "../schemas.js"

const channelInputSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().nullable().optional(),
  kind: channelKindSchema,
  status: z.enum(["active", "inactive", "pending", "archived"]).optional(),
  website: z.string().url().nullable().optional(),
  contactName: z.string().nullable().optional(),
  contactEmail: z.string().email().nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).nullable().optional(),
  /**
   * Catalog entry this channel is created from, for named networks only. Set
   * once, at creation — `UpdateChannelInput` drops it, because the key says
   * which counterparty the row *is*.
   */
  presetKey: z.string().nullable().optional(),
})

export type CreateChannelInput = z.input<typeof channelInputSchema>
export type UpdateChannelInput = Partial<Omit<CreateChannelInput, "presetKey">>

export function useChannelMutation() {
  const { baseUrl, fetcher } = useVoyantDistributionContext()
  const queryClient = useQueryClient()

  const create = useMutation({
    mutationFn: async (input: CreateChannelInput) => {
      const { data } = await fetchWithValidation(
        "/v1/admin/distribution/channels",
        channelSingleResponse,
        { baseUrl, fetcher },
        { method: "POST", body: JSON.stringify(input) },
      )
      return data
    },
    onSuccess: (data) => {
      void queryClient.invalidateQueries({ queryKey: distributionQueryKeys.channels() })
      queryClient.setQueryData(distributionQueryKeys.channel(data.id), data)
    },
  })

  const update = useMutation({
    mutationFn: async ({ id, input }: { id: string; input: UpdateChannelInput }) => {
      const { data } = await fetchWithValidation(
        `/v1/admin/distribution/channels/${id}`,
        channelSingleResponse,
        { baseUrl, fetcher },
        { method: "PATCH", body: JSON.stringify(input) },
      )
      return data
    },
    onSuccess: (data) => {
      void queryClient.invalidateQueries({ queryKey: distributionQueryKeys.channels() })
      queryClient.setQueryData(distributionQueryKeys.channel(data.id), data)
    },
  })

  const remove = useMutation({
    mutationFn: async (id: string) =>
      fetchWithValidation(
        `/v1/admin/distribution/channels/${id}`,
        successEnvelope,
        { baseUrl, fetcher },
        { method: "DELETE" },
      ),
    onSuccess: (_data, id) => {
      void queryClient.invalidateQueries({ queryKey: distributionQueryKeys.channels() })
      queryClient.removeQueries({ queryKey: distributionQueryKeys.channel(id) })
    },
  })

  return { create, update, remove }
}
