"use client"

import { useMutation, useQueryClient } from "@tanstack/react-query"
import {
  type AssignInquiryInput,
  type CloseInquiryInput,
  type CreateInquiryInput,
  inquiryCreateResponseSchema,
  inquiryResponseSchema,
  type ReopenInquiryInput,
  type TransitionInquiryInput,
  type UpdateInquiryInput,
} from "@voyant-travel/relationships-contracts"
import { fetchWithValidation } from "../client.js"
import { useVoyantContext } from "../provider.js"
import { relationshipsQueryKeys } from "../query-keys.js"

export function useInquiryMutation() {
  const client = useVoyantContext()
  const queryClient = useQueryClient()
  const basePath = "/v1/admin/relationships/inquiries"

  const commit = async (id: string, suffix: string, body?: unknown, method = "POST") => {
    const { data } = await fetchWithValidation(
      `${basePath}/${id}${suffix}`,
      inquiryResponseSchema,
      client,
      { method, body: body === undefined ? undefined : JSON.stringify(body) },
    )
    return data
  }
  const settle = (data: { id: string }) => {
    queryClient.setQueryData(relationshipsQueryKeys.inquiry(data.id), data)
    void queryClient.invalidateQueries({ queryKey: relationshipsQueryKeys.inquiries() })
  }

  const create = useMutation({
    mutationFn: async (input: CreateInquiryInput) => {
      const { data } = await fetchWithValidation(basePath, inquiryCreateResponseSchema, client, {
        method: "POST",
        body: JSON.stringify(input),
      })
      return data
    },
    onSuccess: settle,
  })
  const update = useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateInquiryInput }) =>
      commit(id, "", input, "PATCH"),
    onSuccess: settle,
  })
  const transition = useMutation({
    mutationFn: ({ id, input }: { id: string; input: TransitionInquiryInput }) =>
      commit(id, "/transition", input),
    onSuccess: settle,
  })
  const assign = useMutation({
    mutationFn: ({ id, input }: { id: string; input: AssignInquiryInput }) =>
      commit(id, "/assign", input),
    onSuccess: settle,
  })
  const close = useMutation({
    mutationFn: ({ id, input }: { id: string; input: CloseInquiryInput }) =>
      commit(id, "/close", input),
    onSuccess: settle,
  })
  const reopen = useMutation({
    mutationFn: ({ id, input = {} }: { id: string; input?: ReopenInquiryInput }) =>
      commit(id, "/reopen", input),
    onSuccess: settle,
  })

  return { create, update, transition, assign, close, reopen }
}
