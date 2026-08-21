"use client"

import { useMutation, useQueryClient } from "@tanstack/react-query"
import {
  type AddInquiryTargetInput,
  type AssignInquiryInput,
  type CloseInquiryInput,
  type CreateInquiryInput,
  inquiryAttachmentResponseSchema,
  inquiryBookingConversionResultSchema,
  inquiryCreateResponseSchema,
  inquiryProposalConversionResultSchema,
  inquiryResponseSchema,
  inquiryTargetResponseSchema,
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
  const invalidateInquiry = (id: string) => {
    void queryClient.invalidateQueries({ queryKey: relationshipsQueryKeys.inquiry(id) })
    void queryClient.invalidateQueries({ queryKey: relationshipsQueryKeys.inquiries() })
  }
  const addTarget = useMutation({
    mutationFn: async ({ id, input }: { id: string; input: AddInquiryTargetInput }) => {
      const { data } = await fetchWithValidation(
        `${basePath}/${encodeURIComponent(id)}/targets`,
        inquiryTargetResponseSchema,
        client,
        { method: "POST", body: JSON.stringify(input) },
      )
      return data
    },
    onSuccess: (_data, variables) => invalidateInquiry(variables.id),
  })
  const removeTarget = useMutation({
    mutationFn: async ({ id, linkId }: { id: string; linkId: string }) => {
      await client.fetcher(
        `${client.baseUrl.replace(/\/$/, "")}${basePath}/${encodeURIComponent(id)}/targets/${encodeURIComponent(linkId)}`,
        { method: "DELETE" },
      )
    },
    onSuccess: (_data, variables) => invalidateInquiry(variables.id),
  })
  const uploadAttachment = useMutation({
    mutationFn: async ({ id, file, caption }: { id: string; file: File; caption?: string }) => {
      const form = new FormData()
      form.set("file", file)
      const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer())
      const checksum = Array.from(new Uint8Array(digest), (byte) =>
        byte.toString(16).padStart(2, "0"),
      ).join("")
      // Stable across transport retries and browser reloads, but scoped to this
      // Inquiry so another Inquiry cannot claim an in-flight preparation.
      form.set("operationKey", `inqatt_${id}_${checksum}`.slice(0, 128))
      if (caption?.trim()) form.set("caption", caption.trim())
      const base = client.baseUrl.endsWith("/") ? client.baseUrl.slice(0, -1) : client.baseUrl
      const uploaded = await client.fetcher(
        `${base}${basePath}/${encodeURIComponent(id)}/attachments/upload`,
        {
          method: "POST",
          body: form,
        },
      )
      if (!uploaded.ok) throw new Error("Private document upload failed")
      const { data } = inquiryAttachmentResponseSchema.parse(await uploaded.json())
      return data
    },
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: relationshipsQueryKeys.inquiry(variables.id) })
    },
  })
  const updateAttachment = useMutation({
    mutationFn: async ({
      id,
      linkId,
      caption,
    }: {
      id: string
      linkId: string
      caption: string | null
    }) => {
      const { data } = await fetchWithValidation(
        `${basePath}/${encodeURIComponent(id)}/attachments/${encodeURIComponent(linkId)}`,
        inquiryAttachmentResponseSchema,
        client,
        { method: "PATCH", body: JSON.stringify({ caption }) },
      )
      return data
    },
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: relationshipsQueryKeys.inquiry(variables.id) })
    },
  })
  const removeAttachment = useMutation({
    mutationFn: async ({ id, linkId }: { id: string; linkId: string }) => {
      const base = client.baseUrl.endsWith("/") ? client.baseUrl.slice(0, -1) : client.baseUrl
      const response = await client.fetcher(
        `${base}${basePath}/${encodeURIComponent(id)}/attachments/${encodeURIComponent(linkId)}`,
        { method: "DELETE" },
      )
      if (!response.ok) throw new Error("Attachment removal failed")
    },
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: relationshipsQueryKeys.inquiry(variables.id) })
    },
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
    uploadAttachment,
    updateAttachment,
    removeAttachment,
    addTarget,
    removeTarget,
    convertToProposal,
    convertToBookingSession,
    recordActivity,
  }
}
