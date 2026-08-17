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
  /** Identifies this conversion operation; exact retries resolve the same Proposal. */
  idempotencyKey: string
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
  | "invalid_input"
  | "pipeline_not_found"
  | "default_pipeline_not_found"
  | "stage_not_found"
  | "stage_pipeline_mismatch"
  | "stage_closed"
  | "open_stage_not_found"
  | "source_conflict"

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

/**
 * Proposal-owned durable identity for one Inquiry conversion operation.
 *
 * `source` remains `inquiry`; `sourceRef` is
 * `<percent-encoded inquiry id>/conversion/<percent-encoded idempotency key>`.
 * The reversible form keeps the originating Inquiry navigable while allowing
 * separate conversion operations for that Inquiry to create separate targets.
 */
export const PROPOSAL_INQUIRY_ID_MAX_LENGTH = 255
export const PROPOSAL_INQUIRY_IDEMPOTENCY_KEY_MAX_LENGTH = 255

export function formatProposalInquirySourceRef(
  inquiryId: string,
  idempotencyKey: string,
): string | null {
  if (
    !isValidSourceRefPart(inquiryId, PROPOSAL_INQUIRY_ID_MAX_LENGTH) ||
    !isValidSourceRefPart(idempotencyKey, PROPOSAL_INQUIRY_IDEMPOTENCY_KEY_MAX_LENGTH)
  ) {
    return null
  }
  return `${encodeURIComponent(inquiryId)}/conversion/${encodeURIComponent(idempotencyKey)}`
}

export function parseProposalInquirySourceRef(
  sourceRef: string,
): { inquiryId: string; idempotencyKey: string } | null {
  const marker = "/conversion/"
  const markerIndex = sourceRef.indexOf(marker)
  if (markerIndex < 1) return null
  const encodedInquiryId = sourceRef.slice(0, markerIndex)
  const encodedIdempotencyKey = sourceRef.slice(markerIndex + marker.length)
  try {
    const inquiryId = decodeURIComponent(encodedInquiryId)
    const idempotencyKey = decodeURIComponent(encodedIdempotencyKey)
    if (formatProposalInquirySourceRef(inquiryId, idempotencyKey) === null) return null
    return { inquiryId, idempotencyKey }
  } catch {
    return null
  }
}

function isValidSourceRefPart(value: unknown, maxLength: number): value is string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > maxLength ||
    value.trim().length === 0
  ) {
    return false
  }
  for (let index = 0; index < value.length; index += 1) {
    const codeUnit = value.charCodeAt(index)
    if (codeUnit >= 0xd800 && codeUnit <= 0xdbff) {
      if (index + 1 >= value.length) return false
      const next = value.charCodeAt(index + 1)
      if (next < 0xdc00 || next > 0xdfff) return false
      index += 1
    } else if (codeUnit >= 0xdc00 && codeUnit <= 0xdfff) {
      return false
    }
  }
  return true
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
