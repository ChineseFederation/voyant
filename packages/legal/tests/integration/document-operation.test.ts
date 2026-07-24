import {
  actionLedgerService,
  buildActionApprovalCommandFingerprint,
} from "@voyant-travel/action-ledger"
import { createDbClient } from "@voyant-travel/db"
import { eventOutboxTable } from "@voyant-travel/db/schema"
import { cleanupTestDb } from "@voyant-travel/db/test-utils"
import { eq } from "drizzle-orm"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { executeLegalContractDocumentCommand } from "../../src/contract-document-command.js"
import {
  LEGAL_CONTRACT_DOCUMENT_HANDLER_EXPECTATIONS,
  LEGAL_CONTRACT_DOCUMENT_POLICIES,
} from "../../src/contract-document-policy.js"
import {
  checksumLegalDocumentBytes,
  LEGAL_DOCUMENT_ARTIFACT_PROVIDER_PROTOCOL,
  LegalDocumentArtifactMismatchError,
  type LegalDocumentArtifactProvider,
} from "../../src/contracts/document-artifact-provider.js"
import {
  createLegalDocumentOperationEngine,
  LegalDocumentCanonicalChangedError,
  LegalDocumentCanonicalExistsError,
  LegalDocumentCanonicalMissingError,
  LegalDocumentOperationRowDriftError,
  LegalDocumentProviderBindingError,
} from "../../src/contracts/document-operation.js"
import {
  contractAttachments,
  contractDocumentOperations,
  contracts,
} from "../../src/contracts/schema.js"
import {
  contractsService,
  DurableContractDocumentAttachmentMutationError,
} from "../../src/contracts/service.js"
import { createLegalContractDocumentToolServices } from "../../src/mcp-runtime.js"

const DB_AVAILABLE = !!process.env.TEST_DATABASE_URL
type TestDb = PostgresJsDatabase & {
  $client: { end(options?: { timeout?: number | null }): Promise<unknown> }
}

function provider(version = "1"): LegalDocumentArtifactProvider & {
  objects: Map<string, Uint8Array>
  renders: number
  puts: number
} {
  const objects = new Map<string, Uint8Array>()
  return {
    identity: {
      id: "test.legal-document",
      version,
      protocol: LEGAL_DOCUMENT_ARTIFACT_PROVIDER_PROTOCOL,
    },
    objects,
    renders: 0,
    puts: 0,
    async render(descriptor) {
      this.renders += 1
      const bytes = new TextEncoder().encode(descriptor.body)
      return {
        bytes,
        checksumSha256: await checksumLegalDocumentBytes(bytes),
        name: "contract.pdf",
        contentType: "application/pdf",
      }
    },
    async put(input) {
      this.puts += 1
      const existing = objects.get(input.operationKey)
      if (
        existing &&
        (await checksumLegalDocumentBytes(existing)) !== input.artifact.checksumSha256
      ) {
        throw new LegalDocumentArtifactMismatchError(input.operationKey)
      }
      objects.set(input.operationKey, input.artifact.bytes.slice())
      return {
        key: input.operationKey,
        checksumSha256: input.artifact.checksumSha256,
        byteLength: input.artifact.bytes.byteLength,
      }
    },
    async inspect(key) {
      const bytes = objects.get(key)
      return bytes
        ? {
            status: "present" as const,
            key,
            checksumSha256: await checksumLegalDocumentBytes(bytes),
            byteLength: bytes.byteLength,
          }
        : { status: "absent" as const }
    },
    async get(key) {
      return objects.get(key)?.slice() ?? null
    },
    async deleteIfPresent(key) {
      objects.delete(key)
    },
  }
}

describe.skipIf(!DB_AVAILABLE)("legal document durable operation", () => {
  let db: TestDb
  const requestContext = {
    userId: "staff-1",
    actor: "staff",
    organizationId: null,
  } as const
  const reasonCode = "operator_approved"

  beforeAll(() => {
    db = createDbClient(process.env.TEST_DATABASE_URL as string, {
      adapter: "node",
      nodeMaxConnections: 4,
      timeouts: { statementMs: false, queryMs: false, connectMs: false },
    }) as TestDb
  })
  beforeEach(() => cleanupTestDb(db))
  afterAll(async () => db.$client.end({ timeout: 0 }))

  async function contract(bookingId: string) {
    const [row] = await db
      .insert(contracts)
      .values({
        title: "Durable contract",
        scope: "customer",
        bookingId,
        renderedBody: "<p>immutable contract</p>",
        renderedBodyFormat: "html",
      })
      .returning()
    return row!
  }

  function admission(
    engine: ReturnType<typeof createLegalDocumentOperationEngine>,
    contractId: string,
    bookingId: string,
    input: { mode?: "generate" | "regenerate"; key?: string; fingerprint?: string } = {},
  ) {
    const mode = input.mode ?? "generate"
    const key = input.key ?? "document-command"
    const fingerprint = input.fingerprint ?? "request-v1"
    return engine.admit({
      db,
      bookingId,
      mode,
      idempotencyKey: key,
      requestFingerprint: fingerprint,
      principal: { type: "staff", id: "staff-1", organizationId: null },
      claim: {
        actionId: `claim-${bookingId}-${key}`,
        actionName: `legal.document.${mode}`,
        actionVersion: "v1",
        targetType: "booking",
        targetId: bookingId,
        idempotencyScope: "legal-document-test",
        idempotencyKey: key,
        idempotencyFingerprint: fingerprint,
        commandPayload: { bookingId, contractId },
      },
      prepareTarget: async () => ({
        contractId,
        bookingId,
        organizationId: null,
        descriptor: {
          contractId,
          bookingId,
          templateVersionId: null,
          contractNumber: null,
          body: "immutable bytes",
          bodyFormat: "html",
          variables: {},
        },
      }),
    })
  }

  async function approvedAdmission(
    mode: "generate" | "regenerate",
    idempotencyKey: string,
    commandInput: { bookingId: string; contractId: string },
  ) {
    const policy = LEGAL_CONTRACT_DOCUMENT_POLICIES[mode]
    const expectation = LEGAL_CONTRACT_DOCUMENT_HANDLER_EXPECTATIONS[mode]
    const fingerprint = await buildActionApprovalCommandFingerprint({
      actionName: policy.actionName,
      actionVersion: policy.actionVersion,
      targetType: policy.canonicalTargetType,
      targetId: commandInput.bookingId,
      commandInput,
      approvalPolicy: "required",
      capabilityId: policy.actionName,
      capabilityVersion: policy.actionVersion,
      evaluatedRisk: policy.evaluatedRisk,
      reasonCode,
    })
    const requested = await actionLedgerService.requestApproval(db, {
      requestedAction: {
        actionName: policy.actionName,
        actionVersion: policy.actionVersion,
        actionKind: "execute",
        evaluatedRisk: policy.evaluatedRisk,
        principalType: "user",
        principalId: requestContext.userId,
        organizationId: requestContext.organizationId,
        routeOrToolName: policy.toolCapabilityId,
        idempotencyScope: `test:legal-document-approval:${policy.actionName}`,
        idempotencyKey,
        idempotencyFingerprint: fingerprint,
        targetType: policy.canonicalTargetType,
        targetId: commandInput.bookingId,
        capabilityId: policy.actionName,
        capabilityVersion: policy.actionVersion,
        authorizationSource: "legal_document_test",
      },
      approval: {
        policyName: policy.approvalPolicyName,
        policyVersion: policy.actionVersion,
        requestedByPrincipalId: requestContext.userId,
        riskSnapshot: policy.evaluatedRisk,
        reasonCode,
      },
    })
    await actionLedgerService.decideApproval(db, {
      id: requested.approval.id,
      status: "approved",
      decidedByPrincipalId: "user_approver",
      decisionAction: {
        actionName: "@voyant-travel/legal#action.approve-document-test",
        actionVersion: "v1",
        principalType: "user",
        principalId: "user_approver",
        organizationId: requestContext.organizationId,
      },
    })
    return admittedDocumentCommand(
      expectation,
      idempotencyKey,
      fingerprint,
      requested.approval.id,
      commandInput.bookingId,
    )
  }

  function admittedDocumentCommand(
    expectation: (typeof LEGAL_CONTRACT_DOCUMENT_HANDLER_EXPECTATIONS)["generate" | "regenerate"],
    idempotencyKey: string,
    fingerprint: string,
    approvalId: string,
    bookingId: string,
  ) {
    return {
      capabilityId: expectation.capabilityId,
      capabilityVersion: expectation.capabilityVersion,
      canonicalName: expectation.canonicalName,
      actionPolicy: {
        ...expectation.actionPolicy,
        enforcement: "handler" as const,
        invocation: {
          controlField: "_voyant" as const,
          requiredFields: [
            "confirmed",
            "targetId",
            "idempotencyKey",
            "approvalId",
            "idempotencyFingerprint",
          ] as const,
          optionalFields: ["reasonCode", "approvalId", "idempotencyFingerprint"] as const,
          fingerprintAlgorithm: "action-ledger-command-v1" as const,
        },
      },
      invocation: {
        confirmed: true,
        targetId: bookingId,
        idempotencyKey,
        approvalId,
        idempotencyFingerprint: fingerprint,
        reasonCode,
      },
    }
  }

  it("serializes null-organization replay and rejects drift", async () => {
    const target = await contract("booking-replay")
    const engine = createLegalDocumentOperationEngine({ provider: provider() })
    const [first, second] = await Promise.all([
      admission(engine, target.id, "booking-replay"),
      admission(engine, target.id, "booking-replay"),
    ])
    expect(first.operationId).toMatch(/^lcdo_/)
    expect(first.operationId).toBe(second.operationId)
    expect([first.replayed, second.replayed].sort()).toEqual([false, true])
    await expect(
      admission(engine, target.id, "booking-replay", { fingerprint: "drift" }),
    ).rejects.toThrow(/different immutable/)
    expect(await db.select().from(contractDocumentOperations)).toHaveLength(1)
  })

  it("refuses generate over an existing canonical attachment", async () => {
    const target = await contract("booking-existing")
    await db.insert(contractAttachments).values({
      contractId: target.id,
      kind: "document",
      name: "existing.pdf",
      storageKey: "existing/key",
      metadata: {
        providerId: "test.legal-document",
        providerVersion: "1",
        providerProtocol: LEGAL_DOCUMENT_ARTIFACT_PROVIDER_PROTOCOL,
      },
    })
    const engine = createLegalDocumentOperationEngine({ provider: provider() })
    await expect(admission(engine, target.id, "booking-existing")).rejects.toBeInstanceOf(
      LegalDocumentCanonicalExistsError,
    )
  })

  it("requires an existing canonical attachment for regenerate", async () => {
    const target = await contract("booking-regenerate-missing")
    const engine = createLegalDocumentOperationEngine({ provider: provider() })
    await expect(
      admission(engine, target.id, "booking-regenerate-missing", { mode: "regenerate" }),
    ).rejects.toBeInstanceOf(LegalDocumentCanonicalMissingError)
  })

  it("prohibits generic mutation and reclassification of durable document rows", async () => {
    const target = await contract("booking-generic-mutation")
    const [canonical] = await db
      .insert(contractAttachments)
      .values({
        contractId: target.id,
        kind: "document",
        name: "canonical.pdf",
        storageKey: "canonical/key",
      })
      .returning()
    const [appendix] = await db
      .insert(contractAttachments)
      .values({
        contractId: target.id,
        kind: "appendix",
        name: "appendix.pdf",
        storageKey: "appendix/key",
      })
      .returning()

    await expect(
      contractsService.createAttachment(db, target.id, {
        kind: "document",
        name: "alternate.pdf",
      }),
    ).rejects.toBeInstanceOf(DurableContractDocumentAttachmentMutationError)
    await expect(
      contractsService.updateAttachment(db, canonical!.id, { name: "mutated.pdf" }),
    ).rejects.toBeInstanceOf(DurableContractDocumentAttachmentMutationError)
    await expect(contractsService.deleteAttachment(db, canonical!.id)).rejects.toBeInstanceOf(
      DurableContractDocumentAttachmentMutationError,
    )
    await expect(
      contractsService.updateAttachment(db, appendix!.id, { kind: "document-history" }),
    ).rejects.toBeInstanceOf(DurableContractDocumentAttachmentMutationError)

    expect(await contractsService.getAttachmentById(db, canonical!.id)).toMatchObject({
      kind: "document",
      name: "canonical.pdf",
    })
  })

  it("invokes production Tool services through the durable provider and operation engine", async () => {
    const [target] = await db
      .insert(contracts)
      .values({
        title: "Invokable contract",
        scope: "customer",
        bookingId: "booking-tool-invocation",
        renderedBody: "<p>immutable contract</p>",
        renderedBodyFormat: "html",
        variables: {},
      })
      .returning()
    const artifactProvider = provider()
    const command = { bookingId: target!.bookingId!, contractId: target!.id }
    const approved = await approvedAdmission("generate", "tool-generate-1", command)
    const service = createLegalContractDocumentToolServices({
      runtime: {
        resolveGeneratedDocument: async () => null,
        resolveStorage: () => null,
        guessMimeType: () => "application/octet-stream",
      },
      provider: artifactProvider,
      env: {},
      db,
      requestContext,
    })

    const result = await service.generate(command, approved)

    expect(result).toMatchObject({
      bookingId: target!.bookingId,
      contractId: target!.id,
      mode: "generate",
    })
    expect(await db.select().from(contractDocumentOperations)).toEqual([
      expect.objectContaining({
        claimActionId: expect.any(String),
        claimActionName: "@voyant-travel/legal#action.generate-booking-contract-document",
        claimIdempotencyFingerprint: approved.invocation.idempotencyFingerprint,
        claimCommandPayload: command,
      }),
    ])
  })

  it("rejects missing and fabricated approvals before admitting a document operation", async () => {
    const target = await contract("booking-document-fake-approval")
    const command = { bookingId: target.bookingId!, contractId: target.id }
    const expectation = LEGAL_CONTRACT_DOCUMENT_HANDLER_EXPECTATIONS.generate
    for (const approvalId of ["", "approval_fabricated"]) {
      const admitted = admittedDocumentCommand(
        expectation,
        `fake-approval-${approvalId || "missing"}`,
        "fingerprint_fabricated",
        approvalId,
        command.bookingId,
      )
      await expect(
        executeLegalContractDocumentCommand({
          db,
          context: requestContext,
          admitted,
          mode: "generate",
          commandInput: command,
          provider: provider(),
        }),
      ).rejects.toMatchObject({
        name: expect.stringMatching(
          /ActionLedgerCreatedCommand(Approval|FingerprintMismatch|Protocol)Error/,
        ),
      })
    }
    expect(await db.select().from(contractDocumentOperations)).toHaveLength(0)
  })

  it("rejects an action claim bound to a mismatched document operation identity", async () => {
    const target = await contract("booking-document-claim-mismatch")
    const command = { bookingId: target.bookingId!, contractId: target.id }
    const admitted = await approvedAdmission("generate", "document-claim-mismatch", command)
    const first = await executeLegalContractDocumentCommand({
      db,
      context: requestContext,
      admitted,
      mode: "generate",
      commandInput: command,
      provider: provider(),
    })
    await db
      .update(contractDocumentOperations)
      .set({ claimActionName: "@voyant-travel/legal#action.regenerate-booking-contract-document" })
      .where(eq(contractDocumentOperations.id, first.value.operationId))

    await expect(
      executeLegalContractDocumentCommand({
        db,
        context: requestContext,
        admitted,
        mode: "generate",
        commandInput: command,
        provider: provider(),
      }),
    ).rejects.toMatchObject({
      name: "LegalContractDocumentCommandError",
      reason: "operation_identity_mismatch",
    })
  })

  it("rejects a fingerprint that does not authorize the exact document command", async () => {
    const target = await contract("booking-document-fingerprint-mismatch")
    const command = { bookingId: target.bookingId!, contractId: target.id }
    const admitted = await approvedAdmission("generate", "document-fingerprint-mismatch", command)
    const drifted = {
      ...admitted,
      invocation: {
        ...admitted.invocation,
        idempotencyFingerprint: "fingerprint_for_different_command",
      },
    }
    await expect(
      executeLegalContractDocumentCommand({
        db,
        context: requestContext,
        admitted: drifted,
        mode: "generate",
        commandInput: command,
        provider: provider(),
      }),
    ).rejects.toMatchObject({
      name: expect.stringMatching(
        /ActionLedgerCreatedCommand(Approval|FingerprintMismatch|Protocol)Error/,
      ),
    })
    expect(await db.select().from(contractDocumentOperations)).toHaveLength(0)
  })

  it("serializes concurrent approved commands and replays the exact operation result", async () => {
    const target = await contract("booking-document-concurrent-command")
    const command = { bookingId: target.bookingId!, contractId: target.id }
    const admitted = await approvedAdmission("generate", "document-concurrent-command", command)
    const artifactProvider = provider()
    const execute = () =>
      executeLegalContractDocumentCommand({
        db,
        context: requestContext,
        admitted,
        mode: "generate",
        commandInput: command,
        provider: artifactProvider,
      })
    const [first, replay] = await Promise.all([execute(), execute()])

    expect([first.replayed, replay.replayed].sort()).toEqual([false, true])
    expect(first.value).toEqual(replay.value)
    expect(artifactProvider.renders).toBe(1)
    expect(await db.select().from(contractDocumentOperations)).toEqual([
      expect.objectContaining({
        id: first.value.operationId,
        claimActionId: first.command.causation.claimActionId,
        result: first.value,
      }),
    ])
  })

  it("polls a live exact-command owner during forced execution overlap", async () => {
    const target = await contract("booking-document-forced-overlap")
    const command = { bookingId: target.bookingId!, contractId: target.id }
    const admitted = await approvedAdmission("generate", "document-forced-overlap", command)
    const artifactProvider = provider()
    const render = artifactProvider.render.bind(artifactProvider)
    let entered!: () => void
    const renderEntered = new Promise<void>((resolve) => {
      entered = resolve
    })
    let release!: () => void
    const blocked = new Promise<void>((resolve) => {
      release = resolve
    })
    let renderCalls = 0
    artifactProvider.render = async (descriptor) => {
      renderCalls++
      if (renderCalls === 1) {
        entered()
        await blocked
      }
      return render(descriptor)
    }
    const execute = () =>
      executeLegalContractDocumentCommand({
        db,
        context: requestContext,
        admitted,
        mode: "generate",
        commandInput: command,
        provider: artifactProvider,
      })

    const owner = execute()
    await renderEntered
    const replay = execute()
    await new Promise((resolve) => setTimeout(resolve, 50))
    release()
    const [ownerResult, replayResult] = await Promise.all([owner, replay])

    expect(ownerResult.value).toEqual(replayResult.value)
    expect([ownerResult.replayed, replayResult.replayed].sort()).toEqual([false, true])
    expect(renderCalls).toBe(1)
  })

  it("rejects replay when immutable operation or result identity is tampered", async () => {
    const target = await contract("booking-document-operation-tamper")
    const command = { bookingId: target.bookingId!, contractId: target.id }
    const admitted = await approvedAdmission("generate", "document-operation-tamper", command)
    const artifactProvider = provider()
    const first = await executeLegalContractDocumentCommand({
      db,
      context: requestContext,
      admitted,
      mode: "generate",
      commandInput: command,
      provider: artifactProvider,
    })
    const [original] = await db
      .select()
      .from(contractDocumentOperations)
      .where(eq(contractDocumentOperations.id, first.value.operationId))

    for (const tamper of [
      { requestFingerprint: "tampered-request" },
      { targetFingerprint: "tampered-target" },
      { tenantScope: "organization:tampered" },
      {
        renderDescriptor: {
          ...(original!.renderDescriptor as Record<string, unknown>),
          body: "<p>tampered body</p>",
        },
      },
      {
        renderDescriptor: {
          ...(original!.renderDescriptor as Record<string, unknown>),
          variables: { tampered: true },
        },
      },
      {
        renderDescriptor: {
          ...(original!.renderDescriptor as Record<string, unknown>),
          templateVersionId: "contract_template_versions_tampered",
        },
      },
      {
        result: {
          ...first.value,
          attachmentId: "attachment_tampered",
        },
      },
      {
        result: {
          ...first.value,
          checksumSha256: "checksum_tampered",
        },
      },
    ]) {
      await db
        .update(contractDocumentOperations)
        .set(tamper)
        .where(eq(contractDocumentOperations.id, first.value.operationId))
      await expect(
        executeLegalContractDocumentCommand({
          db,
          context: requestContext,
          admitted,
          mode: "generate",
          commandInput: command,
          provider: artifactProvider,
        }),
      ).rejects.toMatchObject({
        name: "LegalContractDocumentCommandError",
        reason: "operation_identity_mismatch",
      })
      await db
        .update(contractDocumentOperations)
        .set({
          requestFingerprint: original!.requestFingerprint,
          targetFingerprint: original!.targetFingerprint,
          tenantScope: original!.tenantScope,
          renderDescriptor: original!.renderDescriptor,
          result: original!.result,
        })
        .where(eq(contractDocumentOperations.id, first.value.operationId))
    }
  })

  it("resumes the same durable operation after a crash following atomic prepare", async () => {
    const target = await contract("booking-document-prepare-crash")
    const command = { bookingId: target.bookingId!, contractId: target.id }
    const admitted = await approvedAdmission("generate", "document-prepare-crash", command)
    const artifactProvider = provider()
    await expect(
      executeLegalContractDocumentCommand({
        db,
        context: requestContext,
        admitted,
        mode: "generate",
        commandInput: command,
        provider: artifactProvider,
        testHooks: {
          async afterPrepareCommit() {
            throw new Error("process crashed after document prepare")
          },
        },
      }),
    ).rejects.toThrow("process crashed after document prepare")

    const [prepared] = await db.select().from(contractDocumentOperations)
    expect(prepared).toMatchObject({
      checkpoint: "prepared",
      result: null,
      claimActionId: expect.any(String),
    })
    const resumed = await executeLegalContractDocumentCommand({
      db,
      context: requestContext,
      admitted,
      mode: "generate",
      commandInput: command,
      provider: artifactProvider,
    })
    expect(resumed).toMatchObject({
      replayed: true,
      value: { operationId: prepared!.id },
    })
    expect(await db.select().from(contractDocumentOperations)).toHaveLength(1)
  })

  it("fences a stale worker and commits one attachment and one outbox event", async () => {
    const target = await contract("booking-fence")
    const artifactProvider = provider()
    let current = new Date("2026-07-24T00:00:00.000Z")
    let release!: () => void
    const blocked = new Promise<void>((resolve) => {
      release = resolve
    })
    let rendered!: () => void
    const reachedRender = new Promise<void>((resolve) => {
      rendered = resolve
    })
    let pauseOnce = true
    const engine = createLegalDocumentOperationEngine({
      provider: artifactProvider,
      leaseMs: 1_000,
      now: () => current,
      testHooks: {
        async afterRenderCheckpoint() {
          if (!pauseOnce) return
          pauseOnce = false
          rendered()
          await blocked
        },
      },
    })
    const admitted = await admission(engine, target.id, "booking-fence")
    const stale = engine.run(db, admitted.operationId, "worker-stale")
    await reachedRender
    current = new Date(current.getTime() + 2_000)
    const winner = await engine.run(db, admitted.operationId, "worker-winner")
    release()
    await expect(stale).rejects.toThrow(/fenced/)
    expect(winner?.attachmentId).toEqual(expect.any(String))
    expect(artifactProvider.renders).toBe(1)
    expect(
      await db
        .select()
        .from(contractAttachments)
        .where(eq(contractAttachments.contractId, target.id)),
    ).toHaveLength(1)
    const [event] = await db.select().from(eventOutboxTable)
    expect(event?.payload).toEqual({
      contractId: target.id,
      contractStatus: "draft",
      attachmentId: winner?.attachmentId,
      attachmentKind: "document",
      attachmentName: "contract.pdf",
      renderedBodyFormat: "html",
      regenerated: false,
    })
  })

  it("rejects stale concurrent regeneration with compare-and-swap", async () => {
    const target = await contract("booking-regenerate-race")
    const artifactProvider = provider()
    const oldBytes = new TextEncoder().encode("old")
    artifactProvider.objects.set("old/key", oldBytes)
    await db.insert(contractAttachments).values({
      contractId: target.id,
      kind: "document",
      name: "old.pdf",
      storageKey: "old/key",
      checksum: await checksumLegalDocumentBytes(oldBytes),
      metadata: {
        providerId: artifactProvider.identity.id,
        providerVersion: artifactProvider.identity.version,
        providerProtocol: artifactProvider.identity.protocol,
      },
    })
    const engine = createLegalDocumentOperationEngine({
      provider: artifactProvider,
      maxAttempts: 1,
    })
    const first = await admission(engine, target.id, target.bookingId!, {
      mode: "regenerate",
      key: "regenerate-first",
    })
    const stale = await admission(engine, target.id, target.bookingId!, {
      mode: "regenerate",
      key: "regenerate-stale",
    })

    await engine.run(db, first.operationId, "winner")
    await expect(engine.run(db, stale.operationId, "stale")).rejects.toBeInstanceOf(
      LegalDocumentCanonicalChangedError,
    )

    const canonical = await db
      .select()
      .from(contractAttachments)
      .where(eq(contractAttachments.kind, "document"))
    expect(canonical).toHaveLength(1)
    expect(canonical[0]?.id).toBe(
      (
        await db
          .select()
          .from(contractDocumentOperations)
          .where(eq(contractDocumentOperations.id, first.operationId))
      )[0]?.canonicalAttachmentId,
    )
  })

  it("rejects regeneration when the admitted canonical row is mutated in place", async () => {
    const target = await contract("booking-regenerate-same-row-race")
    const artifactProvider = provider()
    const oldBytes = new TextEncoder().encode("old")
    artifactProvider.objects.set("old/same-row", oldBytes)
    const [canonical] = await db
      .insert(contractAttachments)
      .values({
        contractId: target.id,
        kind: "document",
        name: "old.pdf",
        mimeType: "application/pdf",
        fileSize: oldBytes.byteLength,
        storageKey: "old/same-row",
        checksum: await checksumLegalDocumentBytes(oldBytes),
        metadata: {
          providerId: artifactProvider.identity.id,
          providerVersion: artifactProvider.identity.version,
          providerProtocol: artifactProvider.identity.protocol,
        },
      })
      .returning()
    const engine = createLegalDocumentOperationEngine({
      provider: artifactProvider,
      maxAttempts: 1,
    })
    const admitted = await admission(engine, target.id, target.bookingId!, {
      mode: "regenerate",
      key: "regenerate-same-row",
    })

    await db
      .update(contractAttachments)
      .set({
        storageKey: "concurrent/replacement",
        checksum: "concurrent-checksum",
      })
      .where(eq(contractAttachments.id, canonical!.id))

    await expect(engine.run(db, admitted.operationId, "stale")).rejects.toBeInstanceOf(
      LegalDocumentCanonicalChangedError,
    )
    const [after] = await db
      .select()
      .from(contractAttachments)
      .where(eq(contractAttachments.id, canonical!.id))
    expect(after).toMatchObject({
      id: canonical!.id,
      kind: "document",
      storageKey: "concurrent/replacement",
      checksum: "concurrent-checksum",
    })
  })

  it("rejects regeneration when canonical attachment metadata is mutated in place", async () => {
    const target = await contract("booking-regenerate-metadata-race")
    const artifactProvider = provider()
    const oldBytes = new TextEncoder().encode("old")
    artifactProvider.objects.set("old/metadata", oldBytes)
    const [canonical] = await db
      .insert(contractAttachments)
      .values({
        contractId: target.id,
        kind: "document",
        name: "old.pdf",
        storageKey: "old/metadata",
        checksum: await checksumLegalDocumentBytes(oldBytes),
        metadata: {
          providerId: artifactProvider.identity.id,
          providerVersion: artifactProvider.identity.version,
          providerProtocol: artifactProvider.identity.protocol,
          nested: { revision: 1 },
        },
      })
      .returning()
    const engine = createLegalDocumentOperationEngine({
      provider: artifactProvider,
      maxAttempts: 1,
    })
    const admitted = await admission(engine, target.id, target.bookingId!, {
      mode: "regenerate",
      key: "regenerate-metadata",
    })

    await db
      .update(contractAttachments)
      .set({
        metadata: {
          ...(canonical!.metadata as Record<string, unknown>),
          nested: { revision: 2 },
        },
      })
      .where(eq(contractAttachments.id, canonical!.id))

    await expect(engine.run(db, admitted.operationId, "stale")).rejects.toBeInstanceOf(
      LegalDocumentCanonicalChangedError,
    )
  })

  it("resumes from render, put, stored, and finalized crash boundaries", async () => {
    const boundaries = [
      "afterRenderCheckpoint",
      "afterPutBeforeCheckpoint",
      "afterStoredCheckpoint",
      "afterFinalize",
    ] as const

    for (const boundary of boundaries) {
      const bookingId = `booking-crash-${boundary}`
      const target = await contract(bookingId)
      const artifactProvider = provider()
      let crash = true
      const engine = createLegalDocumentOperationEngine({
        provider: artifactProvider,
        testHooks: {
          async [boundary]() {
            if (!crash) return
            crash = false
            throw new Error(`crash:${boundary}`)
          },
        },
      })
      const admitted = await admission(engine, target.id, bookingId)
      await expect(engine.run(db, admitted.operationId, `first-${boundary}`)).rejects.toThrow(
        `crash:${boundary}`,
      )
      const result = await engine.run(db, admitted.operationId, `retry-${boundary}`)
      expect(result?.attachmentId).toEqual(expect.any(String))
      expect(artifactProvider.renders).toBe(1)
    }

    expect(await db.select().from(contractAttachments)).toHaveLength(boundaries.length)
    expect(await db.select().from(eventOutboxTable)).toHaveLength(boundaries.length)
  })

  it("recovers cleanup after crashing immediately after the dead-letter checkpoint", async () => {
    const target = await contract("booking-dead-letter-checkpoint-crash")
    const artifactProvider = provider()
    let clock = new Date("2026-07-24T12:00:00.000Z")
    const crashing = createLegalDocumentOperationEngine({
      provider: artifactProvider,
      maxAttempts: 1,
      now: () => clock,
      testHooks: {
        async beforeFinalize() {
          throw new Error("terminal render failure")
        },
        async afterDeadLetterCheckpoint() {
          throw new Error("crash:afterDeadLetterCheckpoint")
        },
      },
    })
    const admitted = await admission(crashing, target.id, target.bookingId!)

    await expect(crashing.run(db, admitted.operationId, "crashing-worker")).rejects.toThrow(
      "crash:afterDeadLetterCheckpoint",
    )
    const [checkpointed] = await db
      .select()
      .from(contractDocumentOperations)
      .where(eq(contractDocumentOperations.id, admitted.operationId))
    expect(checkpointed?.status).toBe("dead_lettered_cleanup_needed")
    expect(artifactProvider.objects.has(checkpointed!.operationKey)).toBe(true)

    clock = new Date("2026-07-24T13:00:00.000Z")
    const restarted = createLegalDocumentOperationEngine({
      provider: artifactProvider,
      now: () => clock,
    })
    await expect(restarted.runDue(db)).resolves.toEqual([null])
    const [settled] = await db
      .select()
      .from(contractDocumentOperations)
      .where(eq(contractDocumentOperations.id, admitted.operationId))
    expect(settled?.status).toBe("dead_lettered_cleanup_complete")
    expect(artifactProvider.objects.has(settled!.operationKey)).toBe(false)
  })

  it("dead-letters provider drift without touching the canonical attachment", async () => {
    const target = await contract("booking-provider-drift")
    const original = provider("1")
    await db.insert(contractAttachments).values({
      contractId: target.id,
      kind: "document",
      name: "existing.pdf",
      storageKey: "existing/key",
      metadata: {
        providerId: original.identity.id,
        providerVersion: original.identity.version,
        providerProtocol: original.identity.protocol,
      },
    })
    const admitted = await admission(
      createLegalDocumentOperationEngine({ provider: original }),
      target.id,
      "booking-provider-drift",
      { mode: "regenerate" },
    )
    const drifted = createLegalDocumentOperationEngine({ provider: provider("2") })
    await expect(drifted.run(db, admitted.operationId)).rejects.toBeInstanceOf(
      LegalDocumentProviderBindingError,
    )
    const [operation] = await db
      .select()
      .from(contractDocumentOperations)
      .where(eq(contractDocumentOperations.id, admitted.operationId))
    expect(operation?.status).toBe("dead_lettered")
    expect(await db.select().from(contractAttachments)).toHaveLength(1)
    expect(await db.select().from(eventOutboxTable)).toHaveLength(0)
  })

  it("tombstones cleaned history and resumes dead-letter cleanup", async () => {
    const target = await contract("booking-cleanup")
    const artifactProvider = provider()
    const oldBytes = new TextEncoder().encode("old")
    artifactProvider.objects.set("old/key", oldBytes)
    const [oldAttachment] = await db
      .insert(contractAttachments)
      .values({
        contractId: target.id,
        kind: "document",
        name: "old.pdf",
        storageKey: "old/key",
        metadata: {
          providerId: artifactProvider.identity.id,
          providerVersion: artifactProvider.identity.version,
          providerProtocol: artifactProvider.identity.protocol,
        },
      })
      .returning()
    const engine = createLegalDocumentOperationEngine({ provider: artifactProvider })
    const admitted = await admission(engine, target.id, target.bookingId!, {
      mode: "regenerate",
    })
    await engine.run(db, admitted.operationId, "finalize")
    await engine.run(db, admitted.operationId, "cleanup")

    const [history] = await db
      .select()
      .from(contractAttachments)
      .where(eq(contractAttachments.id, oldAttachment!.id))
    expect(history).toMatchObject({
      kind: "document-history",
      storageKey: null,
      metadata: expect.objectContaining({
        tombstoneReason: "replaced-canonical-artifact-cleaned",
      }),
    })

    const deadLetterTarget = await contract("booking-dead-letter-cleanup")
    const cleanupProvider = provider()
    let failDelete = true
    const originalDelete = cleanupProvider.deleteIfPresent.bind(cleanupProvider)
    cleanupProvider.deleteIfPresent = async (key) => {
      if (failDelete) {
        failDelete = false
        await originalDelete(key)
        throw new Error("cleanup outcome ambiguous")
      }
      await originalDelete(key)
    }
    const deadLetterEngine = createLegalDocumentOperationEngine({
      provider: cleanupProvider,
      maxAttempts: 1,
      testHooks: {
        async beforeFinalize() {
          throw new Error("terminal render failure")
        },
      },
    })
    const deadLetter = await admission(
      deadLetterEngine,
      deadLetterTarget.id,
      deadLetterTarget.bookingId!,
    )
    await expect(deadLetterEngine.run(db, deadLetter.operationId, "initial")).rejects.toThrow(
      "terminal render failure",
    )
    expect(cleanupProvider.objects.size).toBe(0)
    expect(
      (
        await db
          .select()
          .from(contractDocumentOperations)
          .where(eq(contractDocumentOperations.id, deadLetter.operationId))
      )[0]?.status,
    ).toBe("dead_lettered_cleanup_needed")
    await expect(
      deadLetterEngine.run(db, deadLetter.operationId, "cleanup-retry"),
    ).resolves.toBeNull()
    expect(
      (
        await db
          .select()
          .from(contractDocumentOperations)
          .where(eq(contractDocumentOperations.id, deadLetter.operationId))
      )[0]?.status,
    ).toBe("dead_lettered_cleanup_complete")
  })

  it("rejects same-fence operation row drift before canonical finalize", async () => {
    const target = await contract("booking-same-fence-row-drift")
    const artifactProvider = provider()
    const engine = createLegalDocumentOperationEngine({
      provider: artifactProvider,
      testHooks: {
        async beforeFinalize(operationId) {
          await db
            .update(contractDocumentOperations)
            .set({ artifactName: "tampered.pdf" })
            .where(eq(contractDocumentOperations.id, operationId))
        },
      },
    })
    const admitted = await admission(engine, target.id, target.bookingId!)

    await expect(engine.run(db, admitted.operationId, "same-fence-worker")).rejects.toBeInstanceOf(
      LegalDocumentOperationRowDriftError,
    )

    const [operation] = await db
      .select()
      .from(contractDocumentOperations)
      .where(eq(contractDocumentOperations.id, admitted.operationId))
    const canonical = await db
      .select()
      .from(contractAttachments)
      .where(eq(contractAttachments.contractId, target.id))
    expect(operation).toMatchObject({
      status: "running",
      checkpoint: "stored",
      artifactName: "tampered.pdf",
      leaseOwner: "same-fence-worker",
    })
    expect(canonical).toEqual([])
  })

  it("rejects same-fence row drift before recording a retry transition", async () => {
    const target = await contract("booking-same-fence-retry-drift")
    const artifactProvider = provider()
    const engine = createLegalDocumentOperationEngine({
      provider: artifactProvider,
      testHooks: {
        async afterPutBeforeCheckpoint(operationId) {
          await db
            .update(contractDocumentOperations)
            .set({ artifactName: "tampered-before-retry.pdf" })
            .where(eq(contractDocumentOperations.id, operationId))
          throw new Error("post-put failure")
        },
      },
    })
    const admitted = await admission(engine, target.id, target.bookingId!)

    await expect(
      engine.run(db, admitted.operationId, "same-fence-retry-worker"),
    ).rejects.toBeInstanceOf(LegalDocumentOperationRowDriftError)

    const [operation] = await db
      .select()
      .from(contractDocumentOperations)
      .where(eq(contractDocumentOperations.id, admitted.operationId))
    expect(operation).toMatchObject({
      status: "running",
      checkpoint: "rendered",
      artifactName: "tampered-before-retry.pdf",
      leaseOwner: "same-fence-retry-worker",
    })
  })

  it("retains an old canonical object when its provider identity does not match", async () => {
    const target = await contract("booking-old-provider")
    await db.insert(contractAttachments).values({
      contractId: target.id,
      kind: "document",
      name: "old.pdf",
      storageKey: "old-provider/key",
      metadata: {
        providerId: "other.provider",
        providerVersion: "7",
        providerProtocol: LEGAL_DOCUMENT_ARTIFACT_PROVIDER_PROTOCOL,
      },
    })
    const artifactProvider = provider()
    artifactProvider.objects.set("old-provider/key", new TextEncoder().encode("old bytes"))
    const engine = createLegalDocumentOperationEngine({ provider: artifactProvider })
    const admitted = await admission(engine, target.id, "booking-old-provider", {
      mode: "regenerate",
    })

    await engine.run(db, admitted.operationId, "finalize-worker")
    await engine.run(db, admitted.operationId, "cleanup-worker")

    const [operation] = await db
      .select()
      .from(contractDocumentOperations)
      .where(eq(contractDocumentOperations.id, admitted.operationId))
    expect(operation?.status).toBe("cleanup_needed")
    expect(artifactProvider.objects.has("old-provider/key")).toBe(true)
    expect(
      await db.select().from(contractAttachments).where(eq(contractAttachments.kind, "document")),
    ).toHaveLength(1)
  })
})
