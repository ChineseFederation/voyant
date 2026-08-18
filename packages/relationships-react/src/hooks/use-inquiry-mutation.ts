"use client"

import { useMutation, useQueryClient } from "@tanstack/react-query"
import {
  type AssignInquiryInput,
  type CloseInquiryInput,
  type CreateInquiryInput,
  inquiryBookingConversionResultSchema,
  inquiryCreateResponseSchema,
  inquiryProposalConversionResultSchema,
  inquiryResponseSchema,
  type RecordInquiryActivityInput,
  type ReopenInquiryInput,
  recordInquiryActivityResultSchema,
  type TransitionInquiryInput,
  type UpdateInquiryInput,
} from "@voyant-travel/relationships-contracts"
import { useMemo } from "react"
import { fetchWithValidation } from "../client.js"
import {
  createInquiryBookingSessionConversionAttempt,
  type InquiryBookingSessionConversionOptions,
  inquiryBookingSessionConversionPath,
} from "../inquiry-booking-session-conversion.js"
import {
  createInquiryProposalConversionAttempt,
  type InquiryProposalConversionOptions,
  inquiryProposalConversionPath,
} from "../inquiry-proposal-conversion.js"
import { useVoyantContext } from "../provider.js"
import { relationshipsQueryKeys } from "../query-keys.js"

export function useInquiryMutation() {
  const client = useVoyantContext()
  const queryClient = useQueryClient()
  const basePath = "/v1/admin/relationships/inquiries"
  const proposalConversion = useMemo(
    () =>
      createInquiryProposalConversionAttempt({
        execute: async (inquiryId, command) => {
          const { data } = await fetchWithValidation(
            inquiryProposalConversionPath(inquiryId),
            inquiryProposalConversionResultSchema,
            client,
            { method: "POST", body: JSON.stringify(command) },
          )
          return data
        },
      }),
    [client],
  )
  const bookingSessionConversion = useMemo(
    () =>
      createInquiryBookingSessionConversionAttempt({
        execute: async (inquiryId, command) => {
          const { data } = await fetchWithValidation(
            inquiryBookingSessionConversionPath(inquiryId),
            inquiryBookingConversionResultSchema,
            client,
            { method: "POST", body: JSON.stringify(command) },
          )
          return data
        },
      }),
    [client],
  )

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
  const recordFirstResponse = useMutation({
    mutationFn: ({ id }: { id: string }) => commit(id, "/record-first-response", {}),
    onSuccess: settle,
  })
  const convertToProposal = useMutation({
    mutationFn: ({ id, input }: { id: string; input: InquiryProposalConversionOptions }) =>
      proposalConversion.run(id, input),
    onSuccess: (outcome, variables) => {
      if (outcome.kind !== "converted") return
      void queryClient.invalidateQueries({ queryKey: relationshipsQueryKeys.inquiries() })
      void queryClient.invalidateQueries({ queryKey: relationshipsQueryKeys.inquiry(variables.id) })
    },
  })
  const convertToBookingSession = useMutation({
    mutationFn: ({ id, input }: { id: string; input: InquiryBookingSessionConversionOptions }) =>
      bookingSessionConversion.run(id, input),
    onSuccess: (outcome, variables) => {
      if (outcome.kind !== "converted") return
      void queryClient.invalidateQueries({ queryKey: relationshipsQueryKeys.inquiries() })
      void queryClient.invalidateQueries({ queryKey: relationshipsQueryKeys.inquiry(variables.id) })
    },
  })

  const recordActivity = useMutation({
    mutationFn: ({ id, input }: { id: string; input: RecordInquiryActivityInput }) =>
      fetchWithValidation(
        `${basePath}/${id}/activities`,
        recordInquiryActivityResultSchema,
        client,
        { method: "POST", body: JSON.stringify(input) },
      ),
    onSuccess: (_result, variables) => {
      void queryClient.invalidateQueries({
        queryKey: relationshipsQueryKeys.inquiryActivities(variables.id),
      })
      void queryClient.invalidateQueries({ queryKey: relationshipsQueryKeys.inquiry(variables.id) })
      void queryClient.invalidateQueries({ queryKey: relationshipsQueryKeys.inquiries() })
    },
  })

  return {
    create,
    update,
    transition,
    assign,
    close,
    reopen,
    recordFirstResponse,
    convertToProposal,
    convertToBookingSession,
    recordActivity,
  }
}
