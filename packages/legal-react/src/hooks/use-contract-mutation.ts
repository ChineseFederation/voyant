"use client"

import { useMutation, useQueryClient } from "@tanstack/react-query"
import type {
  insertContractSchema,
  updateContractSchema,
} from "@voyant-travel/legal/contracts/validation"
import type { z } from "zod"

import { fetchWithValidation } from "../client.js"
import { useVoyantLegalContext } from "../provider.js"
import { legalQueryKeys } from "../query-keys.js"
import { legalContractSingleResponse, successEnvelope } from "../schemas.js"

export type CreateLegalContractInput = z.input<typeof insertContractSchema>
export type UpdateLegalContractInput = z.input<typeof updateContractSchema>

export interface SendLegalContractInputBody {
  /** Customer email to deliver the contract to. */
  recipientEmail?: string | null
  /** Subject line for the outgoing email. */
  subject?: string | null
  /** Plain-text or HTML body that the operator typed in the send dialog. */
  message?: string | null
}

export interface SendLegalContractInput {
  id: string
  input?: SendLegalContractInputBody
}

export function useLegalContractMutation() {
  const { baseUrl, fetcher } = useVoyantLegalContext()
  const queryClient = useQueryClient()

  const create = useMutation({
    mutationFn: async (input: CreateLegalContractInput) => {
      const { data } = await fetchWithValidation(
        "/v1/admin/legal/contracts",
        legalContractSingleResponse,
        { baseUrl, fetcher },
        { method: "POST", body: JSON.stringify(input) },
      )
      return data
    },
    onSuccess: (data) => {
      void queryClient.invalidateQueries({ queryKey: legalQueryKeys.contracts() })
      queryClient.setQueryData(legalQueryKeys.contract(data.id), data)
    },
  })

  const update = useMutation({
    mutationFn: async ({ id, input }: { id: string; input: UpdateLegalContractInput }) => {
      const { data } = await fetchWithValidation(
        `/v1/admin/legal/contracts/${id}`,
        legalContractSingleResponse,
        { baseUrl, fetcher },
        { method: "PATCH", body: JSON.stringify(input) },
      )
      return data
    },
    onSuccess: (data) => {
      void queryClient.invalidateQueries({ queryKey: legalQueryKeys.contracts() })
      queryClient.setQueryData(legalQueryKeys.contract(data.id), data)
    },
  })

  const remove = useMutation({
    mutationFn: async (id: string) =>
      fetchWithValidation(
        `/v1/admin/legal/contracts/${id}`,
        successEnvelope,
        { baseUrl, fetcher },
        {
          method: "DELETE",
        },
      ),
    onSuccess: (_data, id) => {
      void queryClient.invalidateQueries({ queryKey: legalQueryKeys.contracts() })
      queryClient.removeQueries({ queryKey: legalQueryKeys.contract(id) })
      queryClient.removeQueries({ queryKey: legalQueryKeys.contractSignatures(id) })
      queryClient.removeQueries({ queryKey: legalQueryKeys.contractAttachments(id) })
    },
  })

  const issue = useMutation({
    mutationFn: async (id: string) => {
      const { data } = await fetchWithValidation(
        `/v1/admin/legal/contracts/${id}/issue`,
        legalContractSingleResponse,
        { baseUrl, fetcher },
        { method: "POST" },
      )
      return data
    },
    onSuccess: (data) => {
      void queryClient.invalidateQueries({ queryKey: legalQueryKeys.contracts() })
      queryClient.setQueryData(legalQueryKeys.contract(data.id), data)
    },
  })

  const send = useMutation({
    mutationFn: async (input: SendLegalContractInput | string) => {
      // Back-compat: callers that just need the status flip can keep
      // passing the id string. New callers (ContractSendDialog) pass
      // `{ id, input: { subject, message, recipientEmail } }` so the
      // route can carry their customization onto the `contract.sent`
      // lifecycle event.
      const normalized: SendLegalContractInput =
        typeof input === "string" ? { id: input, input: {} } : input
      const { data } = await fetchWithValidation(
        `/v1/admin/legal/contracts/${normalized.id}/send`,
        legalContractSingleResponse,
        { baseUrl, fetcher },
        { method: "POST", body: JSON.stringify(normalized.input ?? {}) },
      )
      return data
    },
    onSuccess: (data) => {
      void queryClient.invalidateQueries({ queryKey: legalQueryKeys.contracts() })
      queryClient.setQueryData(legalQueryKeys.contract(data.id), data)
    },
  })

  const execute = useMutation({
    mutationFn: async (id: string) => {
      const { data } = await fetchWithValidation(
        `/v1/admin/legal/contracts/${id}/execute`,
        legalContractSingleResponse,
        { baseUrl, fetcher },
        { method: "POST" },
      )
      return data
    },
    onSuccess: (data) => {
      void queryClient.invalidateQueries({ queryKey: legalQueryKeys.contracts() })
      queryClient.setQueryData(legalQueryKeys.contract(data.id), data)
    },
  })

  const voidContract = useMutation({
    mutationFn: async (id: string) => {
      const { data } = await fetchWithValidation(
        `/v1/admin/legal/contracts/${id}/void`,
        legalContractSingleResponse,
        { baseUrl, fetcher },
        { method: "POST" },
      )
      return data
    },
    onSuccess: (data) => {
      void queryClient.invalidateQueries({ queryKey: legalQueryKeys.contracts() })
      queryClient.setQueryData(legalQueryKeys.contract(data.id), data)
    },
  })

  return {
    create,
    update,
    remove,
    issue,
    send,
    execute,
    voidContract,
  }
}
