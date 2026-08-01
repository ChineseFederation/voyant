"use client"

import { useMutation, useQueryClient } from "@tanstack/react-query"

import { fetchWithValidation } from "../client.js"
import { useVoyantContext } from "../provider.js"
import { proposalsQueryKeys } from "../query-keys.js"
import { proposalMediaSingleResponse, successEnvelope } from "../schemas.js"

export interface CreateProposalMediaInput {
  mediaType?: "image" | "video" | "document"
  name: string
  url: string
  storageKey?: string | null
  mimeType?: string | null
  fileSize?: number | null
  altText?: string | null
}

/** Attach / remove proposal media (the upload itself goes through `/v1/admin/uploads`). */
export function useProposalMediaMutation() {
  const { baseUrl, fetcher } = useVoyantContext()
  const queryClient = useQueryClient()

  const invalidate = (proposalId: string) => {
    void queryClient.invalidateQueries({ queryKey: proposalsQueryKeys.proposalMedia(proposalId) })
  }

  const create = useMutation({
    mutationFn: async ({
      proposalId,
      input,
    }: {
      proposalId: string
      input: CreateProposalMediaInput
    }) => {
      const { data } = await fetchWithValidation(
        `/v1/admin/proposals/proposals/${proposalId}/media`,
        proposalMediaSingleResponse,
        { baseUrl, fetcher },
        { method: "POST", body: JSON.stringify(input) },
      )
      return data
    },
    onSuccess: (_data, vars) => invalidate(vars.proposalId),
  })

  // Upload a file to the deployment's media store (`/v1/admin/uploads`), then attach
  // the resulting object to the proposal. Multipart upload uses a raw cookie-auth
  // fetch (the shared JSON fetcher can't carry FormData).
  const upload = useMutation({
    mutationFn: async ({ proposalId, file }: { proposalId: string; file: File }) => {
      const form = new FormData()
      form.append("file", file)
      const res = await fetch(`${baseUrl}/v1/admin/uploads`, {
        method: "POST",
        body: form,
        credentials: "include",
      })
      if (!res.ok) throw new Error(`Upload failed (${res.status})`)
      const uploaded = (await res.json()) as {
        key: string
        url: string
        mimeType: string
        size: number
      }
      const mediaType: CreateProposalMediaInput["mediaType"] = uploaded.mimeType.startsWith(
        "video/",
      )
        ? "video"
        : uploaded.mimeType.startsWith("image/")
          ? "image"
          : "document"
      const { data } = await fetchWithValidation(
        `/v1/admin/proposals/proposals/${proposalId}/media`,
        proposalMediaSingleResponse,
        { baseUrl, fetcher },
        {
          method: "POST",
          body: JSON.stringify({
            mediaType,
            name: file.name,
            url: uploaded.url,
            storageKey: uploaded.key,
            mimeType: uploaded.mimeType,
            fileSize: uploaded.size,
          } satisfies CreateProposalMediaInput),
        },
      )
      return data
    },
    onSuccess: (_data, vars) => invalidate(vars.proposalId),
  })

  const remove = useMutation({
    mutationFn: async ({ id }: { id: string; proposalId: string }) => {
      await fetchWithValidation(
        `/v1/admin/proposals/proposal-media/${id}`,
        successEnvelope,
        { baseUrl, fetcher },
        { method: "DELETE" },
      )
    },
    onSuccess: (_data, vars) => invalidate(vars.proposalId),
  })

  return { create, upload, remove }
}
