import { createToolRegistry, type ToolContext } from "@voyant-travel/tools"
import { describe, expect, it, vi } from "vitest"
import { LEGAL_CONTRACT_DOCUMENT_HANDLER_EXPECTATIONS } from "../../src/contract-document-policy.js"
import { LEGAL_CONTRACT_LIFECYCLE_HANDLER_EXPECTATIONS } from "../../src/existing-target-policy.js"
import { createLegalContractDocumentToolServices } from "../../src/mcp-runtime.js"
import {
  createContractTemplateTool,
  generateBookingContractDocumentTool,
  issueLegalContractTool,
  legalContractDocumentTools,
  legalTools,
  resolveContractDocumentDeliveryTool,
  sendLegalContractTool,
} from "../../src/tools.js"

function baseContext(): ToolContext {
  return {
    db: {},
    actor: "staff",
    audience: "staff",
    tenantId: "tenant-1",
    resolverScope: {
      locale: "en",
      audience: "staff",
      market: "default",
      actor: "staff",
    },
  }
}

describe("legal Tools", () => {
  it("publishes unique typed capabilities for both selected legal units", () => {
    expect(legalTools).toHaveLength(18)
    expect(legalContractDocumentTools).toHaveLength(3)
    const tools = [...legalTools, ...legalContractDocumentTools]
    expect(new Set(tools.map((tool) => tool.capabilityId)).size).toBe(tools.length)
    expect(tools.every((tool) => tool.audience?.allowed?.includes("staff"))).toBe(true)
    expect(() => createToolRegistry().registerAll(tools)).not.toThrow()
  })

  it("marks authoring and externally consequential lifecycle calls as guarded writes", () => {
    expect(createContractTemplateTool.requiredScopes).toEqual(["legal:write"])
    expect(createContractTemplateTool.riskPolicy).toMatchObject({
      destructive: false,
      reversible: true,
      confirmationRequired: true,
      sideEffects: ["data-write"],
    })
    expect(sendLegalContractTool.riskPolicy).toMatchObject({
      destructive: false,
      reversible: false,
      confirmationRequired: true,
      sideEffects: ["data-write", "email"],
    })
  })

  it("uses admitted lifecycle command methods", async () => {
    const issueContract = vi.fn()
    const issueContractCommand = vi.fn(async () => ({ id: "contract_1" }) as never)
    const legal = {
      issueContract,
      issueContractCommand,
      sendContractCommand: vi.fn(),
      executeContractCommand: vi.fn(),
    } as never
    const expected = LEGAL_CONTRACT_LIFECYCLE_HANDLER_EXPECTATIONS.issue

    await issueLegalContractTool.handler(
      { contractId: "contract_1" },
      {
        ...baseContext(),
        legal,
        handlerActionPolicy: {
          capabilityId: expected.capabilityId,
          capabilityVersion: expected.capabilityVersion,
          canonicalName: expected.canonicalName,
          actionPolicy: {
            ...expected.actionPolicy,
            enforcement: "handler",
            invocation: {
              controlField: "_voyant",
              requiredFields: [
                "confirmed",
                "targetId",
                "idempotencyKey",
                "approvalId",
                "idempotencyFingerprint",
              ],
              optionalFields: ["reasonCode", "approvalId", "idempotencyFingerprint"],
              fingerprintAlgorithm: "action-ledger-command-v1",
            },
          },
          invocation: {
            confirmed: true,
            targetId: "contract_1",
            idempotencyKey: "issue_1",
            approvalId: "approval_1",
            idempotencyFingerprint: "fingerprint_1",
          },
        },
      },
    )

    expect(issueContractCommand).toHaveBeenCalledWith(
      { contractId: "contract_1" },
      expect.objectContaining({ capabilityId: expected.capabilityId }),
    )
    expect(issueContract).not.toHaveBeenCalled()
  })

  it("rejects contract-document access outside an exact staff audience", async () => {
    await expect(
      resolveContractDocumentDeliveryTool.handler(
        { attachmentId: "attachment_1" },
        {
          ...baseContext(),
          audience: "customer",
          legalContractDocument: {
            generate: vi.fn(),
            regenerate: vi.fn(),
            resolveDelivery: vi.fn(),
          },
        },
      ),
    ).rejects.toMatchObject({ code: "AUTHORIZATION_DENIED" })
  })

  it("invokes the durable generate service through admitted Tool action wiring", async () => {
    const generate = vi.fn(async () => ({
      operationId: "lcdo_1",
      bookingId: "booking_1",
      contractId: "contract_1",
      attachmentId: "attachment_1",
      mode: "generate" as const,
      checksumSha256: "checksum",
    }))
    const expected = LEGAL_CONTRACT_DOCUMENT_HANDLER_EXPECTATIONS.generate

    await generateBookingContractDocumentTool.handler(
      { bookingId: "booking_1", contractId: "contract_1" },
      {
        ...baseContext(),
        legalContractDocument: {
          generate,
          regenerate: vi.fn(),
          resolveDelivery: vi.fn(),
        },
        handlerActionPolicy: {
          capabilityId: expected.capabilityId,
          capabilityVersion: expected.capabilityVersion,
          canonicalName: expected.canonicalName,
          actionPolicy: {
            ...expected.actionPolicy,
            enforcement: "handler",
            invocation: {
              controlField: "_voyant",
              requiredFields: [
                "confirmed",
                "targetId",
                "idempotencyKey",
                "approvalId",
                "idempotencyFingerprint",
              ],
              optionalFields: ["reasonCode", "approvalId", "idempotencyFingerprint"],
              fingerprintAlgorithm: "action-ledger-command-v1",
            },
          },
          invocation: {
            confirmed: true,
            targetId: "booking_1",
            idempotencyKey: "generate_1",
            approvalId: "approval_1",
            idempotencyFingerprint: "fingerprint_1",
          },
        },
      },
    )

    expect(generate).toHaveBeenCalledWith(
      { bookingId: "booking_1", contractId: "contract_1" },
      expect.objectContaining({ capabilityId: expected.capabilityId }),
    )
  })

  it("exposes only authorized document delivery resolution", async () => {
    const resolveGeneratedDocument = vi.fn(async () => ({
      url: "https://documents.example.test/signed",
      filename: "contract.pdf",
      contentType: "application/pdf",
    }))
    const service = createLegalContractDocumentToolServices({
      runtime: {
        resolveGeneratedDocument,
        resolveStorage: vi.fn(),
        guessMimeType: vi.fn(),
      },
      env: {},
      db: {} as never,
      provider: {} as never,
      requestContext: {},
    })

    await expect(service.resolveDelivery({ attachmentId: "attachment_1" })).resolves.toMatchObject({
      filename: "contract.pdf",
    })
  })
})
