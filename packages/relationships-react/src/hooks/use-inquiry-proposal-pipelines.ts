"use client"

import { useQuery } from "@tanstack/react-query"
import { z } from "zod"
import { fetchWithValidation } from "../client.js"
import { useVoyantContext } from "../provider.js"

/**
 * Proposal pipelines and their stages, for the Inquiry conversion overrides.
 *
 * Proposals owns these, and `proposals-react` already depends on this package,
 * so the read goes over the published admin API rather than the reverse import.
 * Both are optional overrides — the conversion picks a sensible default when
 * neither is set — so a deployment without Proposals mounted simply yields
 * nothing and the fields stay hidden.
 */
const pipelineResponseSchema = z.object({
  data: z.array(z.object({ id: z.string(), name: z.string(), isDefault: z.boolean() }).loose()),
})

const stageResponseSchema = z.object({
  data: z.array(
    z
      .object({
        id: z.string(),
        pipelineId: z.string(),
        name: z.string(),
        isClosed: z.boolean(),
        sortOrder: z.number().optional(),
      })
      .loose(),
  ),
})

export type InquiryProposalPipeline = z.infer<typeof pipelineResponseSchema>["data"][number]
export type InquiryProposalStage = z.infer<typeof stageResponseSchema>["data"][number]

export function useInquiryProposalPipelines(options: { enabled?: boolean } = {}) {
  const client = useVoyantContext()
  return useQuery({
    queryKey: ["relationships", "inquiry-proposal-pipelines"],
    queryFn: async () => {
      const { data } = await fetchWithValidation(
        "/v1/admin/proposals/pipelines?entityType=proposal&limit=50",
        pipelineResponseSchema,
        client,
      )
      return data
    },
    enabled: options.enabled ?? true,
    staleTime: 300_000,
    // A deployment without Proposals answers 404; that is not an error the
    // operator needs to see, the override just stays unavailable.
    retry: false,
  })
}

export function useInquiryProposalStages(pipelineId: string | null) {
  const client = useVoyantContext()
  return useQuery({
    queryKey: ["relationships", "inquiry-proposal-stages", pipelineId],
    queryFn: async () => {
      const { data } = await fetchWithValidation(
        `/v1/admin/proposals/stages?pipelineId=${encodeURIComponent(pipelineId ?? "")}&limit=100`,
        stageResponseSchema,
        client,
      )
      // A closed stage cannot receive a new Proposal, so offering one would only
      // produce the `stage_closed` refusal after the operator committed.
      return data.filter((stage) => !stage.isClosed)
    },
    enabled: Boolean(pipelineId),
    staleTime: 300_000,
    retry: false,
  })
}
