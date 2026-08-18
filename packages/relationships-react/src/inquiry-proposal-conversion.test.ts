import type {
  ConvertInquiryToProposalCommand,
  InquiryProposalConversionResult,
} from "@voyant-travel/relationships-contracts"
import { describe, expect, it, vi } from "vitest"
import { VoyantApiError } from "./client.js"
import { crmUiEn, crmUiRo } from "./i18n/index.js"
import {
  createInquiryProposalConversionAttempt,
  inquiryProposalConversionFailureKind,
  inquiryProposalConversionPath,
  proposalDestinationForConversion,
} from "./inquiry-proposal-conversion.js"

const result = (
  kind: "created" | "replayed",
  proposalId: string,
): InquiryProposalConversionResult => ({
  kind,
  conversionId: `conversion-${proposalId}`,
  inquiryId: "inquiry-1",
  inquiryStatus: "converted",
  target: {
    kind: "proposal",
    id: proposalId,
    pipelineId: "pipeline-default",
    stageId: "stage-open",
  },
})

describe("Inquiry Proposal conversion attempt", () => {
  it("sends the canonical command and retains its key across a 503 retry", async () => {
    const commands: ConvertInquiryToProposalCommand[] = []
    const execute = vi.fn(async (_inquiryId: string, command: ConvertInquiryToProposalCommand) => {
      commands.push(command)
      if (commands.length === 1) {
        throw new VoyantApiError("unavailable", 503, {
          error: "unavailable",
          reason: "stage_closed",
        })
      }
      return result("created", "proposal-created")
    })
    const keys = ["stable-key", "next-key"]
    const attempt = createInquiryProposalConversionAttempt({
      execute,
      createIdempotencyKey: () => keys.shift() ?? "unexpected-key",
    })

    await expect(
      attempt.run("inquiry-1", {
        pipelineId: "pipeline-a",
        stageId: "stage-a",
        keepInquiryOpen: true,
      }),
    ).rejects.toMatchObject({ status: 503 })
    const converted = await attempt.run("inquiry-1", {
      pipelineId: "changed-pipeline",
      stageId: "changed-stage",
      keepInquiryOpen: false,
    })

    expect(commands).toEqual([
      {
        kind: "proposal",
        idempotencyKey: "stable-key",
        pipelineId: "pipeline-a",
        stageId: "stage-a",
        keepInquiryOpen: true,
      },
      {
        kind: "proposal",
        idempotencyKey: "stable-key",
        pipelineId: "pipeline-a",
        stageId: "stage-a",
        keepInquiryOpen: true,
      },
    ])
    expect(proposalDestinationForConversion(converted)).toEqual({
      destination: "proposal.detail",
      params: { proposalId: "proposal-created" },
    })

    await attempt.run("inquiry-1", { keepInquiryOpen: false })
    expect(commands.at(-1)).toEqual({
      kind: "proposal",
      idempotencyKey: "next-key",
      keepInquiryOpen: false,
    })
  })

  it("clears the key after a canonical refusal and navigates replayed results", async () => {
    const commands: ConvertInquiryToProposalCommand[] = []
    const execute = vi.fn(async (_inquiryId: string, command: ConvertInquiryToProposalCommand) => {
      commands.push(command)
      if (commands.length === 1) {
        throw new VoyantApiError("refused", 409, {
          error: "refused",
          reason: "stage_closed",
        })
      }
      return result("replayed", "proposal-replayed")
    })
    const keys = ["refused-key", "replayed-key"]
    const attempt = createInquiryProposalConversionAttempt({
      execute,
      createIdempotencyKey: () => keys.shift() ?? "unexpected-key",
    })

    await expect(attempt.run("inquiry-1", { keepInquiryOpen: false })).resolves.toEqual({
      kind: "refused",
      error: "refused",
      reason: "stage_closed",
    })
    const replayed = await attempt.run("inquiry-1", { keepInquiryOpen: false })

    expect(commands.map((command) => command.idempotencyKey)).toEqual([
      "refused-key",
      "replayed-key",
    ])
    expect(proposalDestinationForConversion(replayed)).toEqual({
      destination: "proposal.detail",
      params: { proposalId: "proposal-replayed" },
    })
  })

  it.each([
    [404, "Inquiry not found"],
    [409, "Only a qualified inquiry can start a new conversion"],
  ])("clears the command after a definitive generic %s response", async (status, message) => {
    const commands: ConvertInquiryToProposalCommand[] = []
    const execute = vi.fn(async (_inquiryId: string, command: ConvertInquiryToProposalCommand) => {
      commands.push(command)
      if (commands.length === 1) {
        throw new VoyantApiError(message, status, { error: message })
      }
      return result("created", `proposal-${status}`)
    })
    const keys = [`first-${status}`, `second-${status}`]
    const attempt = createInquiryProposalConversionAttempt({
      execute,
      createIdempotencyKey: () => keys.shift() ?? "unexpected-key",
    })

    await expect(attempt.run("inquiry-1", { keepInquiryOpen: false })).rejects.toMatchObject({
      status,
    })
    await attempt.run("inquiry-1", { keepInquiryOpen: true })

    expect(commands).toEqual([
      {
        kind: "proposal",
        idempotencyKey: `first-${status}`,
        keepInquiryOpen: false,
      },
      {
        kind: "proposal",
        idempotencyKey: `second-${status}`,
        keepInquiryOpen: true,
      },
    ])
  })

  it("classifies unavailable and unexpected failures for localized UI copy", () => {
    expect(inquiryProposalConversionFailureKind(new VoyantApiError("x", 503, {}))).toBe(
      "unavailable",
    )
    expect(inquiryProposalConversionFailureKind(new Error("network"))).toBe("failed")
    expect(inquiryProposalConversionPath("inquiry/one")).toBe(
      "/v1/admin/relationships/inquiries/inquiry%2Fone/convert",
    )
    expect(crmUiEn.inquiryDetail.proposalUnavailable).toContain("temporarily unavailable")
    expect(crmUiRo.inquiryDetail.proposalUnavailable).toContain("temporar indisponibilă")
    expect(crmUiEn.inquiryDetail.proposalRefusals.stage_closed).toContain("closed")
    expect(crmUiRo.inquiryDetail.proposalRefusals.stage_closed).toContain("închisă")
  })
})
