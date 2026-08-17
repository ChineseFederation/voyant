"use client"

import { useMutation, useQueryClient } from "@tanstack/react-query"
import { fetchWithValidation } from "../client.js"
import {
  type InquiryCloseOutcome,
  type InquiryKind,
  type InquiryPriority,
  type InquiryStatus,
  inquiryConversionCommandResponse,
  inquirySingleResponse,
} from "../inquiry-schemas.js"
import { useVoyantContext } from "../provider.js"
import { relationshipsQueryKeys } from "../query-keys.js"

export interface CreateInquiryInput {
  subject: string
  kind: InquiryKind
  priority?: InquiryPriority
  customerMessage?: string | null
  internalSummary?: string | null
  personId?: string | null
  organizationId?: string | null
  contactSnapshot?: { name?: string | null; email?: string | null; phone?: string | null }
  ownerId?: string | null
  nextActionAt?: string | null
  travelBrief?: Record<string, unknown> | null
  tags?: string[]
  source?: string
  sourceRef?: string | null
}

export interface UpdateInquiryInput {
  subject?: string
  priority?: InquiryPriority
  internalSummary?: string | null
  personId?: string | null
  organizationId?: string | null
  nextActionAt?: string | null
  travelBrief?: Record<string, unknown> | null
  tags?: string[]
}

export type ConvertInquiryInput =
  | {
      kind: "proposal"
      idempotencyKey: string
      pipelineId?: string
      stageId?: string
      keepInquiryOpen?: boolean
    }
  | {
      kind: "booking_session"
      idempotencyKey: string
      targetLinkId: string
      channelId?: string
      keepInquiryOpen?: boolean
    }
  | { kind: "booking"; idempotencyKey: string; bookingInput: Record<string, unknown> }
  | {
      kind: "attach_existing"
      idempotencyKey: string
      targetKind: "proposal" | "booking_session" | "booking"
      targetId: string
    }

export function useInquiryMutation() {
  const client = useVoyantContext()
  const queryClient = useQueryClient()
  const basePath = "/v1/admin/relationships/inquiries"

  const commit = async (id: string, suffix: string, body?: unknown, method = "POST") => {
    const { data } = await fetchWithValidation(
      `${basePath}/${id}${suffix}`,
      inquirySingleResponse,
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
      const { data } = await fetchWithValidation(basePath, inquirySingleResponse, client, {
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
    mutationFn: ({ id, status }: { id: string; status: InquiryStatus }) =>
      commit(id, "/transition", { status }),
    onSuccess: settle,
  })
  const assign = useMutation({
    mutationFn: ({
      id,
      ownerId,
      teamId,
    }: {
      id: string
      ownerId?: string | null
      teamId?: string | null
    }) => commit(id, "/assign", { ownerId, teamId }),
    onSuccess: settle,
  })
  const close = useMutation({
    mutationFn: ({
      id,
      outcome,
      note,
    }: {
      id: string
      outcome: InquiryCloseOutcome
      note?: string
    }) => commit(id, "/close", { outcome, note }),
    onSuccess: settle,
  })
  const reopen = useMutation({
    mutationFn: (id: string) => commit(id, "/reopen"),
    onSuccess: settle,
  })
  const convert = useMutation({
    mutationFn: ({ id, input }: { id: string; input: ConvertInquiryInput }) =>
      fetchWithValidation(`${basePath}/${id}/convert`, inquiryConversionCommandResponse, client, {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: (_result, { id }) => {
      void queryClient.invalidateQueries({ queryKey: relationshipsQueryKeys.inquiry(id) })
      void queryClient.invalidateQueries({
        queryKey: relationshipsQueryKeys.inquiryConversions(id),
      })
      void queryClient.invalidateQueries({ queryKey: relationshipsQueryKeys.inquiries() })
    },
  })

  return { create, update, transition, assign, close, reopen, convert }
}
