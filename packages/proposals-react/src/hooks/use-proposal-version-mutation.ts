"use client"

import { useMutation, useQueryClient } from "@tanstack/react-query"
import { z } from "zod"

import { fetchWithValidation } from "../client.js"
import { useVoyantContext } from "../provider.js"
import { proposalsQueryKeys } from "../query-keys.js"
import {
  acceptProposalVersionResponse,
  listEnvelope,
  proposalVersionLineSingleResponse,
  proposalVersionRecordSchema,
  proposalVersionSingleResponse,
} from "../schemas.js"

export interface CreateProposalVersionInput {
  currency: string
  proposalId?: string
  label?: string | null
  supersedesId?: string | null
  tripSnapshotId?: string | null
  validUntil?: string | null
  subtotalAmountCents?: number
  taxAmountCents?: number
  totalAmountCents?: number
  /**
   * Finance's `PaymentPolicy`; `null` states no terms on this version.
   * Left `unknown` so this entry carries no type dependency on
   * `@voyant-travel/finance`, which is an optional peer here.
   */
  paymentTerms?: unknown
  notes?: string | null
  sentAt?: string | null
  viewedAt?: string | null
  decidedAt?: string | null
  [key: string]: unknown
}

export type UpdateProposalVersionInput = Partial<CreateProposalVersionInput>

export interface SendProposalVersionInput {
  validUntil?: string | null
}

export interface ExpireProposalVersionsInput {
  now?: string
}

export interface CreateProposalVersionLineInput {
  description: string
  currency: string
  quantity?: number
  unitPriceAmountCents?: number
  totalAmountCents?: number
  productId?: string | null
  supplierServiceId?: string | null
  [key: string]: unknown
}

export type UpdateProposalVersionLineInput = Partial<CreateProposalVersionLineInput>

const deleteResponseSchema = z.object({ success: z.boolean() })
const proposalVersionArrayResponse = listEnvelope(proposalVersionRecordSchema)

export function useProposalVersionMutation() {
  const { baseUrl, fetcher } = useVoyantContext()
  const queryClient = useQueryClient()

  const create = useMutation({
    mutationFn: async ({
      proposalId,
      input,
    }: {
      proposalId: string
      input: CreateProposalVersionInput
    }) => {
      const { data } = await fetchWithValidation(
        `/v1/admin/proposals/proposals/${proposalId}/versions`,
        proposalVersionSingleResponse,
        { baseUrl, fetcher },
        { method: "POST", body: JSON.stringify(input) },
      )
      return data
    },
    onSuccess: (_data, vars) => {
      void queryClient.invalidateQueries({ queryKey: proposalsQueryKeys.proposalVersions() })
      void queryClient.invalidateQueries({
        queryKey: proposalsQueryKeys.proposalVersionsList({ proposalId: vars.proposalId }),
      })
      void queryClient.invalidateQueries({ queryKey: proposalsQueryKeys.proposal(vars.proposalId) })
    },
  })

  // Snapshot the proposal's current line items into a new version (the "Save"
  // action). The server copies products → version lines, computes the total,
  // and supersedes the prior current version.
  const snapshot = useMutation({
    mutationFn: async ({ proposalId }: { proposalId: string }) => {
      const { data } = await fetchWithValidation(
        `/v1/admin/proposals/proposals/${proposalId}/versions/snapshot`,
        proposalVersionSingleResponse,
        { baseUrl, fetcher },
        { method: "POST" },
      )
      return data
    },
    onSuccess: (_data, vars) => {
      void queryClient.invalidateQueries({ queryKey: proposalsQueryKeys.proposalVersions() })
      void queryClient.invalidateQueries({
        queryKey: proposalsQueryKeys.proposalVersionsList({ proposalId: vars.proposalId }),
      })
      void queryClient.invalidateQueries({ queryKey: proposalsQueryKeys.proposal(vars.proposalId) })
    },
  })

  // Narrow validity-date update (the generic update schema carries insert
  // defaults that would clobber status/totals — see the service note).
  const setValidUntil = useMutation({
    mutationFn: async ({ id, validUntil }: { id: string; validUntil: string | null }) => {
      const { data } = await fetchWithValidation(
        `/v1/admin/proposals/proposal-versions/${id}/validity`,
        proposalVersionSingleResponse,
        { baseUrl, fetcher },
        { method: "PATCH", body: JSON.stringify({ validUntil }) },
      )
      return data
    },
    onSuccess: (data) => {
      void queryClient.invalidateQueries({ queryKey: proposalsQueryKeys.proposalVersions() })
      void queryClient.invalidateQueries({ queryKey: proposalsQueryKeys.proposal(data.proposalId) })
    },
  })

  // Send a version to the client for review (proposal admin route). Marks it
  // "sent" and returns the shareable proposal URL.
  const sendProposal = useMutation({
    mutationFn: async ({ id }: { id: string }) => {
      const { data } = await fetchWithValidation(
        `/v1/admin/proposal-versions/${id}/send`,
        z.object({
          data: z.object({
            proposalVersion: proposalVersionRecordSchema,
            proposalUrl: z.string(),
            // Sent, but not acceptable. The route allows a line-item proposal
            // out for review and says so here; the caller is expected to show
            // it rather than let the operator believe a live offer is out.
            warnings: z
              .array(z.object({ code: z.string(), message: z.string() }))
              .optional()
              .default([]),
          }),
        }),
        { baseUrl, fetcher },
        { method: "POST", body: JSON.stringify({}) },
      )
      return data
    },
    onSuccess: (data) => {
      void queryClient.invalidateQueries({ queryKey: proposalsQueryKeys.proposalVersions() })
      void queryClient.invalidateQueries({
        queryKey: proposalsQueryKeys.proposal(data.proposalVersion.proposalId),
      })
    },
  })

  // Resolve the deployment's shareable proposal URL for an already-sent
  // version without side effects (no re-send, no view tracking) — used when
  // re-copying the review link. Returns the same deployment-resolved URL the
  // initial send produced.
  const fetchProposalLink = useMutation({
    mutationFn: async ({ id }: { id: string }) => {
      const { data } = await fetchWithValidation(
        `/v1/admin/proposal-versions/${id}/proposal-link`,
        z.object({ data: z.object({ proposalUrl: z.string() }) }),
        { baseUrl, fetcher },
        { method: "GET" },
      )
      return data
    },
  })

  const update = useMutation({
    mutationFn: async ({ id, input }: { id: string; input: UpdateProposalVersionInput }) => {
      const { data } = await fetchWithValidation(
        `/v1/admin/proposals/proposal-versions/${id}`,
        proposalVersionSingleResponse,
        { baseUrl, fetcher },
        { method: "PATCH", body: JSON.stringify(input) },
      )
      return data
    },
    onSuccess: (data) => {
      void queryClient.invalidateQueries({ queryKey: proposalsQueryKeys.proposalVersions() })
      queryClient.setQueryData(proposalsQueryKeys.proposalVersion(data.id), data)
      void queryClient.invalidateQueries({ queryKey: proposalsQueryKeys.proposal(data.proposalId) })
    },
  })

  const remove = useMutation({
    mutationFn: async (id: string) => {
      return fetchWithValidation(
        `/v1/admin/proposals/proposal-versions/${id}`,
        deleteResponseSchema,
        { baseUrl, fetcher },
        { method: "DELETE" },
      )
    },
    onSuccess: (_data, id) => {
      void queryClient.invalidateQueries({ queryKey: proposalsQueryKeys.proposalVersions() })
      queryClient.removeQueries({ queryKey: proposalsQueryKeys.proposalVersion(id) })
    },
  })

  const send = useMutation({
    mutationFn: async ({ id, input }: { id: string; input?: SendProposalVersionInput }) => {
      const { data } = await fetchWithValidation(
        `/v1/admin/proposals/proposal-versions/${id}/send`,
        proposalVersionSingleResponse,
        { baseUrl, fetcher },
        { method: "POST", body: JSON.stringify(input ?? {}) },
      )
      return data
    },
    onSuccess: (data) => {
      void queryClient.invalidateQueries({ queryKey: proposalsQueryKeys.proposalVersions() })
      queryClient.setQueryData(proposalsQueryKeys.proposalVersion(data.id), data)
      void queryClient.invalidateQueries({ queryKey: proposalsQueryKeys.proposal(data.proposalId) })
    },
  })

  const view = useMutation({
    mutationFn: async (id: string) => {
      const { data } = await fetchWithValidation(
        `/v1/admin/proposals/proposal-versions/${id}/view`,
        proposalVersionSingleResponse,
        { baseUrl, fetcher },
        { method: "POST", body: JSON.stringify({}) },
      )
      return data
    },
    onSuccess: (data) => {
      queryClient.setQueryData(proposalsQueryKeys.proposalVersion(data.id), data)
      void queryClient.invalidateQueries({ queryKey: proposalsQueryKeys.proposalVersions() })
    },
  })

  const decline = useMutation({
    mutationFn: async (id: string) => {
      const { data } = await fetchWithValidation(
        `/v1/admin/proposals/proposal-versions/${id}/decline`,
        proposalVersionSingleResponse,
        { baseUrl, fetcher },
        { method: "POST", body: JSON.stringify({}) },
      )
      return data
    },
    onSuccess: (data) => {
      void queryClient.invalidateQueries({ queryKey: proposalsQueryKeys.proposalVersions() })
      queryClient.setQueryData(proposalsQueryKeys.proposalVersion(data.id), data)
      void queryClient.invalidateQueries({ queryKey: proposalsQueryKeys.proposal(data.proposalId) })
    },
  })

  const accept = useMutation({
    mutationFn: async (id: string) => {
      const { data } = await fetchWithValidation(
        `/v1/admin/proposals/proposal-versions/${id}/accept`,
        acceptProposalVersionResponse,
        { baseUrl, fetcher },
        { method: "POST", body: JSON.stringify({}) },
      )
      return data
    },
    onSuccess: (data) => {
      void queryClient.invalidateQueries({ queryKey: proposalsQueryKeys.proposalVersions() })
      queryClient.setQueryData(proposalsQueryKeys.proposal(data.proposal.id), data.proposal)
      queryClient.setQueryData(
        proposalsQueryKeys.proposalVersion(data.proposalVersion.id),
        data.proposalVersion,
      )
      for (const proposalVersion of data.closedProposalVersions) {
        queryClient.setQueryData(
          proposalsQueryKeys.proposalVersion(proposalVersion.id),
          proposalVersion,
        )
      }
      void queryClient.invalidateQueries({
        queryKey: proposalsQueryKeys.proposalVersionsList({ proposalId: data.proposal.id }),
      })
    },
  })

  const expire = useMutation({
    mutationFn: async (input?: ExpireProposalVersionsInput) => {
      const { data } = await fetchWithValidation(
        "/v1/admin/proposals/proposal-versions/expire",
        proposalVersionArrayResponse,
        { baseUrl, fetcher },
        { method: "POST", body: JSON.stringify(input ?? {}) },
      )
      return data
    },
    onSuccess: (data) => {
      void queryClient.invalidateQueries({ queryKey: proposalsQueryKeys.proposalVersions() })
      for (const proposalVersion of data) {
        queryClient.setQueryData(
          proposalsQueryKeys.proposalVersion(proposalVersion.id),
          proposalVersion,
        )
        void queryClient.invalidateQueries({
          queryKey: proposalsQueryKeys.proposal(proposalVersion.proposalId),
        })
      }
    },
  })

  const createLine = useMutation({
    mutationFn: async ({
      proposalVersionId,
      input,
    }: {
      proposalVersionId: string
      input: CreateProposalVersionLineInput
    }) => {
      const { data } = await fetchWithValidation(
        `/v1/admin/proposals/proposal-versions/${proposalVersionId}/lines`,
        proposalVersionLineSingleResponse,
        { baseUrl, fetcher },
        { method: "POST", body: JSON.stringify(input) },
      )
      return data
    },
    onSuccess: (_data, vars) => {
      void queryClient.invalidateQueries({
        queryKey: proposalsQueryKeys.proposalVersionLines(vars.proposalVersionId),
      })
      void queryClient.invalidateQueries({
        queryKey: proposalsQueryKeys.proposalVersion(vars.proposalVersionId),
      })
    },
  })

  const updateLine = useMutation({
    mutationFn: async ({
      proposalVersionId: _proposalVersionId,
      lineId,
      input,
    }: {
      proposalVersionId: string
      lineId: string
      input: UpdateProposalVersionLineInput
    }) => {
      const { data } = await fetchWithValidation(
        `/v1/admin/proposals/proposal-version-lines/${lineId}`,
        proposalVersionLineSingleResponse,
        { baseUrl, fetcher },
        { method: "PATCH", body: JSON.stringify(input) },
      )
      return data
    },
    onSuccess: (_data, vars) => {
      void queryClient.invalidateQueries({
        queryKey: proposalsQueryKeys.proposalVersionLines(vars.proposalVersionId),
      })
      void queryClient.invalidateQueries({
        queryKey: proposalsQueryKeys.proposalVersion(vars.proposalVersionId),
      })
    },
  })

  const removeLine = useMutation({
    mutationFn: async ({
      proposalVersionId: _proposalVersionId,
      lineId,
    }: {
      proposalVersionId: string
      lineId: string
    }) => {
      return fetchWithValidation(
        `/v1/admin/proposals/proposal-version-lines/${lineId}`,
        deleteResponseSchema,
        { baseUrl, fetcher },
        { method: "DELETE" },
      )
    },
    onSuccess: (_data, vars) => {
      void queryClient.invalidateQueries({
        queryKey: proposalsQueryKeys.proposalVersionLines(vars.proposalVersionId),
      })
      void queryClient.invalidateQueries({
        queryKey: proposalsQueryKeys.proposalVersion(vars.proposalVersionId),
      })
    },
  })

  return {
    create,
    snapshot,
    sendProposal,
    fetchProposalLink,
    setValidUntil,
    update,
    remove,
    send,
    view,
    decline,
    accept,
    expire,
    createLine,
    updateLine,
    removeLine,
  }
}
