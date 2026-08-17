export interface ProposalInquiryPipelinePreference {
  pipelineId?: string | null
  stageId?: string | null
}

/** An Inquiry-owned Product snapshot. Pricing remains a Proposals concern. */
export interface ProposalInquiryProductTargetSnapshot {
  productId: string
  nameSnapshot: string
  description?: string | null
  quantity?: number
}

export interface ConvertInquiryToProposalInput {
  inquiryId: string
  title: string
  summary?: string | null
  personId?: string | null
  organizationId?: string | null
  ownerId?: string | null
  actorId?: string | null
  tags?: readonly string[]
  pipeline?: ProposalInquiryPipelinePreference
  productTargets?: readonly ProposalInquiryProductTargetSnapshot[]
}

export type ProposalInquiryConversionRefusalReason =
  | "pipeline_not_found"
  | "default_pipeline_not_found"
  | "stage_not_found"
  | "stage_pipeline_mismatch"
  | "stage_closed"
  | "open_stage_not_found"
  | "source_conflict"
  | "source_proposal_not_open"

export interface ProposalInquiryConversionSuccess {
  kind: "created" | "replayed"
  proposalId: string
  pipelineId: string
  stageId: string
}

export interface ProposalInquiryConversionRefusal {
  kind: "refused"
  reason: ProposalInquiryConversionRefusalReason
}

export type ProposalInquiryConversionOutcome =
  | ProposalInquiryConversionSuccess
  | ProposalInquiryConversionRefusal

export interface ProposalInquiryConversionRuntime {
  convertInquiry(
    database: unknown,
    input: ConvertInquiryToProposalInput,
  ): Promise<ProposalInquiryConversionOutcome>
}

/** Import-cheap port consumed by the Relationships conversion coordinator. */
export const proposalInquiryConversionRuntimePort = Object.freeze({
  id: "proposals.inquiry-conversion.runtime",
  test(provider: ProposalInquiryConversionRuntime) {
    if (provider === null || typeof provider !== "object") {
      throw new Error("proposals.inquiry-conversion.runtime provider must be an object.")
    }
    if (typeof Reflect.get(provider, "convertInquiry") !== "function") {
      throw new Error(
        "proposals.inquiry-conversion.runtime provider must implement convertInquiry().",
      )
    }
  },
})
