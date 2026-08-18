import type { paths as RelationshipsAdminPaths } from "@voyant-travel/admin-api-client/relationships"
import {
  type ConvertInquiryToProposalCommand,
  convertInquiryToProposalSchema,
  type InquiryProposalConversionRefusalReason,
  type InquiryProposalConversionResult,
  inquiryProposalConversionRefusalSchema,
} from "@voyant-travel/relationships-contracts"

const proposalConversionRoute =
  "/v1/admin/relationships/inquiries/{id}/convert" as const satisfies keyof RelationshipsAdminPaths
type GeneratedProposalConversionCommand = NonNullable<
  RelationshipsAdminPaths[typeof proposalConversionRoute]["post"]
>["requestBody"]["content"]["application/json"]

export type InquiryProposalConversionOptions = Omit<
  ConvertInquiryToProposalCommand,
  "kind" | "idempotencyKey"
>

export type InquiryProposalConversionOutcome =
  | { kind: "converted"; result: InquiryProposalConversionResult }
  | {
      kind: "refused"
      error: string
      reason: InquiryProposalConversionRefusalReason
    }

export interface InquiryProposalConversionAttempt {
  run(
    inquiryId: string,
    options: InquiryProposalConversionOptions,
  ): Promise<InquiryProposalConversionOutcome>
}

export function createInquiryProposalConversionAttempt({
  execute,
  createIdempotencyKey = () => crypto.randomUUID(),
}: {
  execute: (
    inquiryId: string,
    command: ConvertInquiryToProposalCommand,
  ) => Promise<InquiryProposalConversionResult>
  createIdempotencyKey?: () => string
}): InquiryProposalConversionAttempt {
  const pendingCommands = new Map<string, ConvertInquiryToProposalCommand>()

  return {
    async run(inquiryId, options) {
      const command =
        pendingCommands.get(inquiryId) ??
        convertInquiryToProposalSchema.parse({
          ...options,
          kind: "proposal",
          idempotencyKey: createIdempotencyKey(),
        })
      pendingCommands.set(inquiryId, command)
      const generatedCommand: GeneratedProposalConversionCommand = command
      void generatedCommand

      try {
        const result = await execute(inquiryId, command)
        pendingCommands.delete(inquiryId)
        return { kind: "converted", result }
      } catch (error) {
        if (errorStatus(error) === 409) {
          const refusal = inquiryProposalConversionRefusalSchema.safeParse(errorBody(error))
          if (refusal.success) {
            pendingCommands.delete(inquiryId)
            return { kind: "refused", ...refusal.data }
          }
        }
        throw error
      }
    },
  }
}

export function inquiryProposalConversionPath(inquiryId: string) {
  return proposalConversionRoute.replace("{id}", encodeURIComponent(inquiryId))
}

export function proposalDestinationForConversion(outcome: InquiryProposalConversionOutcome) {
  return outcome.kind === "converted"
    ? ({
        destination: "proposal.detail",
        params: { proposalId: outcome.result.target.id },
      } as const)
    : null
}

export function inquiryProposalConversionFailureKind(error: unknown): "unavailable" | "failed" {
  return errorStatus(error) === 503 ? "unavailable" : "failed"
}

function errorStatus(error: unknown) {
  return typeof error === "object" && error !== null && "status" in error ? error.status : undefined
}

function errorBody(error: unknown) {
  return typeof error === "object" && error !== null && "body" in error
    ? (error as { body: unknown }).body
    : undefined
}
