import { createToolRegistry, type ToolContext } from "@voyant-travel/tools"
import { describe, expect, it, vi } from "vitest"
import { LEGAL_CONTRACT_DOCUMENT_HANDLER_EXPECTATIONS } from "../../src/contract-document-policy.js"
import { contractsService } from "../../src/contracts/service.js"
import { LEGAL_CONTRACT_LIFECYCLE_HANDLER_EXPECTATIONS } from "../../src/existing-target-policy.js"
import { createLegalContractDocumentToolServices } from "../../src/mcp-runtime.js"
import {
  createContractTemplateTool,
  createLegalContractDraftTool,
  generateBookingContractDocumentTool,
  getBookingContractReviewTool,
  issueLegalContractTool,
  legalContractDocumentTools,
  legalTools,
  listApplicableBookingContractTemplatesTool,
  resolveContractDocumentDeliveryTool,
  sendLegalContractTool,
  voidLegalContractTool,
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

const bookingContractContentFingerprint = `booking-contract-content:v1:sha256:${"a".repeat(64)}`

describe("legal Tools", () => {
  it("publishes unique typed capabilities for both selected legal units", () => {
    expect(legalTools).toHaveLength(21)
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
      sideEffects: ["data-write", "email", "sms"],
    })
  })

  it("advertises the bounded review-first booking contract workflow", () => {
    expect(listApplicableBookingContractTemplatesTool.description).toContain("missing prerequisite")
    expect(listApplicableBookingContractTemplatesTool.requiredScopes).toEqual([
      "legal:read",
      "bookings-pii:read",
    ])
    expect(getBookingContractReviewTool.description).toContain("exact template version")
    expect(getBookingContractReviewTool.requiredScopes).toEqual(["legal:read", "bookings-pii:read"])
    expect(resolveContractDocumentDeliveryTool.requiredScopes).toEqual(["legal:read"])
    expect(
      createLegalContractDraftTool.inputSchema.safeParse({
        title: "Revised agreement",
        revisionOfContractId: "contract_1",
      }).success,
    ).toBe(true)
    expect(sendLegalContractTool.inputSchema.safeParse({ contractId: "contract_1" }).success).toBe(
      true,
    )
    expect(
      sendLegalContractTool.inputSchema.safeParse({
        contractId: "contract_1",
        recipientEmail: "legacy@example.com",
      }).success,
    ).toBe(true)
    expect(
      sendLegalContractTool.inputSchema.safeParse({
        contractId: "contract_1",
        recipient: "not-an-email",
        channel: "email",
        revision: 2,
        contentFingerprint: bookingContractContentFingerprint,
      }).success,
    ).toBe(false)
    expect(
      sendLegalContractTool.inputSchema.safeParse({
        contractId: "contract_1",
        recipient: "+40700000000",
        channel: "sms",
        revision: 2,
        contentFingerprint: bookingContractContentFingerprint,
      }).success,
    ).toBe(true)
    expect(
      sendLegalContractTool.inputSchema.safeParse({
        contractId: "contract_1",
        recipient: "+40700000000",
        channel: "whatsapp",
        revision: 2,
        contentFingerprint: bookingContractContentFingerprint,
      }).success,
    ).toBe(true)
    expect(
      sendLegalContractTool.inputSchema.safeParse({
        contractId: "contract_1",
        recipient: "traveller@example.com",
        channel: "email",
        revision: 2,
        contentFingerprint: bookingContractContentFingerprint,
        notificationsSuppressed: false,
      }).success,
    ).toBe(true)
    expect(
      voidLegalContractTool.inputSchema.safeParse({
        contractId: "contract_1",
        revision: 2,
        reason: "Booking cancelled",
        acknowledgedConsequences: false,
      }).success,
    ).toBe(false)
  })

  it("admits only canonical international phone recipients for sms and whatsapp sends", async () => {
    const expected = LEGAL_CONTRACT_LIFECYCLE_HANDLER_EXPECTATIONS.send
    const sendContractCommand = vi.fn(async () => {
      throw new Error("sendContractCommand should not run for invalid recipient input")
    })
    const legal = {
      issueContract: vi.fn(),
      sendContract: vi.fn(),
      executeContract: vi.fn(),
      listContracts: vi.fn(),
      getContract: vi.fn(),
      listTemplates: vi.fn(),
      getTemplate: vi.fn(),
      createTemplate: vi.fn(),
      listPolicies: vi.fn(),
      getPolicy: vi.fn(),
      resolvePolicy: vi.fn(),
      evaluateCancellation: vi.fn(),
      listTerms: vi.fn(),
      listAttachments: vi.fn(),
      issueContractCommand: vi.fn(),
      sendContractCommand,
      voidContractCommand: vi.fn(),
      executeContractCommand: vi.fn(),
    } as never
    const registry = createToolRegistry()
    registry.register(sendLegalContractTool, { actionPolicy: expected.actionPolicy })
    const validInput = {
      contractId: "contract_1",
      recipient: "+40700000000",
      revision: 2,
      contentFingerprint: bookingContractContentFingerprint,
    }

    expect(
      sendLegalContractTool.inputSchema.safeParse({ ...validInput, channel: "sms" }).success,
    ).toBe(true)
    expect(
      sendLegalContractTool.inputSchema.safeParse({ ...validInput, channel: "whatsapp" }).success,
    ).toBe(true)

    for (const channel of ["sms", "whatsapp"] as const) {
      for (const recipient of [
        "abc",
        "40700000000",
        "+40 700000000",
        "+40-700000000",
        "+1234567",
        "+1234567890123456",
        " +40700000000",
        "+40700000000 ",
      ]) {
        await expect(
          registry.dispatch(
            sendLegalContractTool.name,
            { ...validInput, channel, recipient },
            { ...baseContext(), legal },
          ),
        ).rejects.toThrow()
      }
    }

    expect(sendContractCommand).not.toHaveBeenCalled()
  })

  it("uses admitted lifecycle command methods", async () => {
    const issueContract = vi.fn()
    const issueContractCommand = vi.fn(async () => {
      const now = "2026-07-25T08:00:00.000Z"
      return {
        id: "contract_1",
        contractNumber: "CTR-1",
        scope: "customer",
        status: "issued",
        title: "Customer agreement",
        bookingId: "booking_1",
        personId: null,
        organizationId: null,
        supplierId: null,
        language: "en",
        issuedAt: now,
        sentAt: null,
        executedAt: null,
        expiresAt: null,
        voidedAt: null,
        createdAt: now,
        updatedAt: now,
        templateVersionId: null,
        seriesId: null,
        channelId: null,
        targetKind: "booking",
        targetId: "booking_1",
        targetProvider: null,
        targetSourceRef: null,
        renderedBodyFormat: "markdown",
        renderedBody: "# Customer agreement",
        variables: {},
        metadata: {},
        stageHistory: [],
      } as const
    })
    const legal = {
      issueContract,
      issueContractCommand,
      sendContractCommand: vi.fn(),
      voidContractCommand: vi.fn(),
      executeContractCommand: vi.fn(),
    } as never
    const expected = LEGAL_CONTRACT_LIFECYCLE_HANDLER_EXPECTATIONS.issue

    const registry = createToolRegistry()
    registry.register(issueLegalContractTool, { actionPolicy: expected.actionPolicy })
    await registry.dispatch(
      issueLegalContractTool.name,
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

    const registry = createToolRegistry()
    registry.register(generateBookingContractDocumentTool, {
      actionPolicy: expected.actionPolicy,
    })
    await registry.dispatch(
      generateBookingContractDocumentTool.name,
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

  it("resolves non-managed contract document delivery without bookings PII scope", async () => {
    const getAttachmentWithContractById = vi
      .spyOn(contractsService, "getAttachmentWithContractById")
      .mockResolvedValueOnce({
        attachment: { id: "attachment_1" },
        contract: { id: "contract_1", bookingId: null, metadata: {} },
      } as never)
    const resolveDelivery = vi.fn(async () => ({
      url: "https://documents.example.test/signed",
      filename: "contract.pdf",
      contentType: "application/pdf",
    }))

    try {
      await expect(
        resolveContractDocumentDeliveryTool.handler(
          { attachmentId: "attachment_1" },
          {
            ...baseContext(),
            scopes: ["legal:read"],
            db: { select: vi.fn() },
            legalContractDocument: {
              generate: vi.fn(),
              regenerate: vi.fn(),
              resolveDelivery,
            },
          },
        ),
      ).resolves.toMatchObject({ filename: "contract.pdf" })
      expect(getAttachmentWithContractById).toHaveBeenCalledWith(
        expect.objectContaining({ select: expect.any(Function) }),
        "attachment_1",
      )
      expect(resolveDelivery).toHaveBeenCalledWith({ attachmentId: "attachment_1" })
    } finally {
      getAttachmentWithContractById.mockRestore()
    }
  })

  it("hides managed contract document delivery without bookings PII scope", async () => {
    const auditValues = vi.fn(async () => undefined)
    const getAttachmentWithContractById = vi
      .spyOn(contractsService, "getAttachmentWithContractById")
      .mockResolvedValueOnce({
        attachment: { id: "attachment_1" },
        contract: {
          id: "contract_1",
          bookingId: "booking_1",
          metadata: { bookingContractWorkflow: { reviewSnapshot: {} } },
        },
      } as never)
    const resolveDelivery = vi.fn(async () => ({
      url: "https://documents.example.test/signed",
      filename: "contract.pdf",
      contentType: "application/pdf",
    }))

    try {
      await expect(
        resolveContractDocumentDeliveryTool.handler(
          { attachmentId: "attachment_1" },
          {
            ...baseContext(),
            scopes: ["legal:read"],
            db: {
              select: vi.fn(),
              insert: vi.fn(() => ({ values: auditValues })),
            },
            legalContractDocument: {
              generate: vi.fn(),
              regenerate: vi.fn(),
              resolveDelivery,
            },
          },
        ),
      ).rejects.toMatchObject({ code: "NOT_FOUND" })
    } finally {
      getAttachmentWithContractById.mockRestore()
    }

    expect(resolveDelivery).not.toHaveBeenCalled()
    expect(auditValues).toHaveBeenCalledWith(
      expect.objectContaining({
        bookingId: "booking_1",
        outcome: "denied",
        reason: "insufficient_scope",
        metadata: expect.objectContaining({ attachmentId: "attachment_1" }),
      }),
    )
  })

  it("resolves managed contract document delivery with bookings PII scope", async () => {
    const getAttachmentWithContractById = vi
      .spyOn(contractsService, "getAttachmentWithContractById")
      .mockResolvedValueOnce({
        attachment: { id: "attachment_1" },
        contract: {
          id: "contract_1",
          bookingId: "booking_1",
          metadata: { bookingContractWorkflow: { reviewSnapshot: {} } },
        },
      } as never)
    const resolveDelivery = vi.fn(async () => ({
      url: "https://documents.example.test/signed",
      filename: "contract.pdf",
      contentType: "application/pdf",
    }))

    try {
      await expect(
        resolveContractDocumentDeliveryTool.handler(
          { attachmentId: "attachment_1" },
          {
            ...baseContext(),
            scopes: ["legal:read", "bookings-pii:read"],
            db: { select: vi.fn() },
            legalContractDocument: {
              generate: vi.fn(),
              regenerate: vi.fn(),
              resolveDelivery,
            },
          },
        ),
      ).resolves.toMatchObject({ filename: "contract.pdf" })
    } finally {
      getAttachmentWithContractById.mockRestore()
    }

    expect(resolveDelivery).toHaveBeenCalledWith({ attachmentId: "attachment_1" })
  })
})
