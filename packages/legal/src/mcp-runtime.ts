// agent-quality: file-size exception -- owner: legal; tool runtime contribution stays co-located with legal Tool services and durable command execution so admission, audit, and workflow snapshots share one service boundary.
import {
  type ActionLedgerRequestContextValues,
  type ExecuteAdmittedCreatedTargetCommandInput,
  type ExecuteCreatedTargetCommandHandlers,
  type ExecuteCreatedTargetCommandResult,
  executeAdmittedCreatedTargetCommand,
  mapActionLedgerRequestContext,
} from "@voyant-travel/action-ledger"
import { bookingsService, shouldRevealBookingPii } from "@voyant-travel/bookings"
import { bookingItems, bookings } from "@voyant-travel/bookings/schema"
import type { EventBus } from "@voyant-travel/core"
import {
  defineToolContextContribution,
  deriveCommandIdempotencyKey,
  requireService,
  ToolError,
  type ToolHandlerActionPolicyContext,
  withServerResolvedIdempotencyKey,
} from "@voyant-travel/tools"
import { and, eq, sql } from "drizzle-orm"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"
import type { Context } from "hono"
import {
  bookingContractPrerequisites,
  bookingContractReviewSnapshot,
  bookingContractTemplateMatchesChannel,
  getBookingContractReview,
  listApplicableBookingContractTemplates,
  resolveBookingContractLanguage,
} from "./booking-contract-review.js"
import { executeLegalContractDocumentCommand } from "./contract-document-command.js"
import type { ContractDocumentRoutesOptions } from "./contract-document-routes.js"
import { legalContractDocumentRuntimePort } from "./contract-document-runtime-port.js"
import {
  hasManagedBookingWorkflow,
  legalContractDetail,
  legalContractSummary,
} from "./contract-dto.js"
import { executeLegalContractLifecycleCommand } from "./contract-lifecycle-command.js"
import {
  type LegalDocumentArtifactProvider,
  legalDocumentArtifactProviderPort,
} from "./contracts/document-artifact-provider.js"
import type { ContractLifecycleRuntimeOptions } from "./contracts/lifecycle.js"
import { buildContractsRouteRuntime } from "./contracts/route-runtime.js"
import {
  type ContractAttachment,
  type ContractTemplate,
  contracts,
  contractTemplates,
  contractTemplateVersions,
} from "./contracts/schema.js"
import {
  allocateContractNumber,
  contractsService,
  mergeContractNumberIntoVariables,
  validateTemplateVariables,
} from "./contracts/service.js"
import {
  LEGAL_CONTRACT_DRAFT_CREATED_TARGET_POLICY,
  LEGAL_CONTRACT_TEMPLATE_CREATED_TARGET_POLICY,
} from "./created-target-policy.js"
import { parseManagedBookingContractReviewWorkflow } from "./managed-booking-contract-workflow.js"
import type { Policy, PolicyRule, PolicyVersion } from "./policies/schema.js"
import { policiesService } from "./policies/service.js"
import { legalRuntimePort } from "./runtime-port.js"
import type { LegalTerm } from "./terms/schema.js"
import { legalTermsService } from "./terms/service.js"
import type {
  ContractAttachmentDto,
  ContractTemplateDetail,
  ContractTemplateSummary,
  LegalContractDocumentToolServices,
  LegalLifecycleCommandToolServices,
  LegalTermDto,
  LegalToolServices,
  PolicyDetail,
  PolicySummary,
} from "./tools.js"

export * from "./tools.js"

type LegalMcpContext = Context<{
  Bindings: Record<string, unknown>
  Variables: {
    db?: PostgresJsDatabase
    eventBus?: EventBus
    userId?: string
    agentId?: string
    workflowPrincipalId?: string
    principalSubtype?: string
    sessionId?: string
    apiTokenId?: string
    apiKeyId?: string
    callerType?: string
    actor?: string
    isInternalRequest?: boolean
    organizationId?: string
    workflowRunId?: string
    workflowStepId?: string
    scopes?: string[]
  }
}>

export type LegalToolRequestContext = ActionLedgerRequestContextValues & {
  scopes?: readonly string[] | null
}

const BOOKING_PII_DECISION_POLICY = "bookings-pii-scope-or-staff-v1"
const BOOKING_CONTRACT_DRAFT_SNAPSHOT_REASON = "contract_draft_booking_snapshot_reveal"
const BOOKING_CONTRACT_DRAFT_REQUIRED_PII_SCOPES = ["bookings-pii:read"] as const

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

export const voyantToolContextContribution = defineToolContextContribution({
  context: ["legal", "legalContractDocument"],
  async contribute({ request, context, resources }) {
    const c = request as LegalMcpContext
    const db = requireService((c.get("db") ?? context.db) as PostgresJsDatabase | undefined, "db")
    const legalOptions = resources[legalRuntimePort.id] as
      | Parameters<typeof buildContractsRouteRuntime>[1]
      | undefined
    const lifecycleRuntime = buildContractsRouteRuntime(c.env, legalOptions)
    lifecycleRuntime.eventBus ??= c.get("eventBus")

    const documentRuntime = resources[legalContractDocumentRuntimePort.id] as
      | ContractDocumentRoutesOptions
      | undefined
    const documentProvider = resources[legalDocumentArtifactProviderPort.id] as
      | LegalDocumentArtifactProvider
      | undefined
    const actionLedgerContext = legalActionLedgerContext(c)

    return {
      legal: createLegalToolServices(db, lifecycleRuntime, actionLedgerContext),
      ...(documentRuntime && documentProvider
        ? {
            legalContractDocument: createLegalContractDocumentToolServices({
              runtime: documentRuntime,
              provider: documentProvider,
              env: c.env,
              db,
              requestContext: actionLedgerContext,
            }),
          }
        : {}),
    }
  },
})

export function createLegalToolServices(
  db: PostgresJsDatabase,
  lifecycleRuntime?: ContractLifecycleRuntimeOptions,
  requestContext: LegalToolRequestContext = {},
): LegalToolServices & LegalLifecycleCommandToolServices {
  return {
    async listContracts(query) {
      const result = await contractsService.listContracts(db, query)
      return { data: result.data.map(legalContractSummary), meta: pageMeta(result) }
    },
    async getContract(id) {
      const row = await contractsService.getContractById(db, id)
      return row ? legalContractDetail(row) : null
    },
    async createDraft(input, admitted) {
      const result = await executeLegalContractDraftCreate(db, requestContext, input, admitted)
      return { status: "created", contract: result.value, replayed: result.replayed }
    },
    async listTemplates(query) {
      const result = await contractsService.listTemplates(db, query)
      return { data: result.data.map(templateSummary), meta: pageMeta(result) }
    },
    async listApplicableBookingTemplates(input) {
      const result = await listApplicableBookingContractTemplates(db, input)
      if (result.bookingFound) {
        await bookingsService.recordPiiAccess(db, {
          bookingId: input.bookingId,
          travelerId: null,
          actorId:
            requestContext.userId ??
            requestContext.agentId ??
            requestContext.workflowPrincipalId ??
            null,
          actorType: requestContext.actor ?? null,
          callerType: requestContext.callerType ?? null,
          action: "read",
          outcome: "allowed",
          reason: "contract_template_applicability_reveal",
          metadata: {
            bookingId: input.bookingId,
            candidateCount: result.data.length,
            reveal: true,
          },
        })
      }
      return result
    },
    async getBookingContractReview({ contractId }) {
      const review = await getBookingContractReview(db, contractId)
      if (review) {
        await bookingsService.recordPiiAccess(db, {
          bookingId: review.booking.id,
          travelerId: null,
          actorId:
            requestContext.userId ??
            requestContext.agentId ??
            requestContext.workflowPrincipalId ??
            null,
          actorType: requestContext.actor ?? null,
          callerType: requestContext.callerType ?? null,
          action: "read",
          outcome: "allowed",
          reason: "contract_review_reveal",
          metadata: { contractId, reveal: true },
        })
      }
      return review
    },
    async getTemplate(id) {
      const row = await contractsService.getTemplateById(db, id)
      return row ? templateDetail(row) : null
    },
    async previewTemplate({ templateId, variables }) {
      const row = await contractsService.getTemplateById(db, templateId)
      if (!row) {
        throw new ToolError(`Contract template "${templateId}" was not found.`, "NOT_FOUND", {
          templateId,
        })
      }
      return { rendered: contractsService.renderPreview({ body: row.body, variables }) }
    },
    async createTemplate(input, admitted) {
      return executeLegalContractTemplateCreate(db, requestContext, input, admitted)
    },
    async updateTemplate({ id, ...input }) {
      const row = await contractsService.updateTemplate(db, id, input)
      return row ? templateDetail(row) : null
    },
    async listPolicies(query) {
      const result = await policiesService.listPolicies(db, query)
      return { data: result.data.map(policySummary), meta: pageMeta(result) }
    },
    async getPolicy(id) {
      const policy = await policiesService.getPolicyById(db, id)
      return policy ? policyDetail(db, policy) : null
    },
    async resolvePolicy(query) {
      const result = await policiesService.resolvePolicy(db, query)
      if (!result) return null
      return {
        policy: policySummary(result.policy),
        currentVersion: result.version ? policyVersion(result.version) : null,
        currentRules: result.rules.map(policyRule),
      }
    },
    async evaluateCancellation({ policyId, ...query }) {
      return policiesService.evaluateCancellation(db, policyId, query)
    },
    async listTerms(query) {
      const result = await legalTermsService.listTerms(db, query)
      return { data: result.data.map(termDto), meta: pageMeta(result) }
    },
    async getTerm(id) {
      const row = await legalTermsService.getTermById(db, id)
      return row ? termDto(row) : null
    },
    async listAttachments(contractId) {
      return (await contractsService.listAttachments(db, contractId)).map(attachmentDto)
    },
    async issueContract(contractId) {
      const result = await contractsService.issueContract(db, contractId, lifecycleRuntime)
      if (result.status === "not_found") {
        throw new ToolError(`Contract "${contractId}" was not found.`, "NOT_FOUND", { contractId })
      }
      if (result.status !== "issued" || !result.contract) {
        throw new ToolError("Only draft contracts can be issued.", "INVALID_INPUT", { contractId })
      }
      return legalContractDetail(result.contract)
    },
    async sendContract(input) {
      const { contractId, ...delivery } = input
      const result = await contractsService.sendContract(db, contractId, lifecycleRuntime, {
        subject: delivery.subject ?? null,
        message: delivery.message ?? null,
        recipientEmail:
          "recipient" in delivery
            ? delivery.channel === "email"
              ? delivery.recipient
              : null
            : (delivery.recipientEmail ?? null),
      })
      if (result.status === "not_found") {
        throw new ToolError(`Contract "${contractId}" was not found.`, "NOT_FOUND", { contractId })
      }
      if (result.status !== "sent" || !result.contract) {
        throw new ToolError("Only issued or already-sent contracts can be sent.", "INVALID_INPUT", {
          contractId,
        })
      }
      return legalContractDetail(result.contract)
    },
    async executeContract(contractId) {
      const result = await contractsService.executeContract(db, contractId, lifecycleRuntime)
      if (result.status === "not_found") {
        throw new ToolError(`Contract "${contractId}" was not found.`, "NOT_FOUND", { contractId })
      }
      if (result.status !== "executed" || !result.contract) {
        throw new ToolError(
          "Only authoritatively signed contracts can be executed.",
          "INVALID_INPUT",
          { contractId },
        )
      }
      return legalContractDetail(result.contract)
    },
    async issueContractCommand(commandInput, admitted) {
      const result = await executeLegalContractLifecycleCommand({
        db,
        context: requestContext,
        admitted,
        transition: "issue",
        commandInput,
      })
      return result.value
    },
    async sendContractCommand(commandInput, admitted) {
      const result = await executeLegalContractLifecycleCommand({
        db,
        context: requestContext,
        admitted,
        transition: "send",
        commandInput,
      })
      return result.value
    },
    async executeContractCommand(commandInput, admitted) {
      const result = await executeLegalContractLifecycleCommand({
        db,
        context: requestContext,
        admitted,
        transition: "execute",
        commandInput,
      })
      return result.value
    },
    async voidContractCommand(commandInput, admitted) {
      const result = await executeLegalContractLifecycleCommand({
        db,
        context: requestContext,
        admitted,
        transition: "void",
        commandInput,
      })
      return result.value
    },
  }
}

async function executeLegalContractTemplateCreate(
  db: PostgresJsDatabase,
  requestContext: LegalToolRequestContext,
  commandInput: Parameters<LegalToolServices["createTemplate"]>[0],
  admitted: ToolHandlerActionPolicyContext,
) {
  const policy = LEGAL_CONTRACT_TEMPLATE_CREATED_TARGET_POLICY
  const principal = mapActionLedgerRequestContext(requestContext)
  if (principal.principalId === "unknown_request") {
    throw new TypeError("Legal contract-template creation requires a concrete principal")
  }
  if (
    admitted.capabilityId !== policy.toolCapabilityId ||
    admitted.actionPolicy.capabilityId !== policy.capabilityId ||
    admitted.actionPolicy.version !== policy.actionVersion
  ) {
    throw new TypeError("Legal contract-template Tool identity drifted after admission")
  }
  const resolvedAdmitted = withServerResolvedIdempotencyKey(
    admitted,
    await deriveCommandIdempotencyKey("create-contract-template", commandInput),
  )
  admittedCreatedCommandIdempotencyKey(resolvedAdmitted, undefined)
  return (
    await executeAdmittedCreatedTargetCommand(
      {
        db,
        context: requestContext,
        admitted: resolvedAdmitted,
        commandTargetType: policy.commandTargetType,
        canonicalTargetType: policy.canonicalTargetType,
        resultReferenceType: policy.resultReferenceType,
        commandInput,
        evaluatedRisk: policy.evaluatedRisk,
      },
      {
        async create(tx) {
          const row = await contractsService.createTemplate(tx as PostgresJsDatabase, commandInput)
          if (!row) throw new Error("Contract template creation did not return a row")
          return { value: templateDetail(row), targetId: row.id }
        },
        async replay(tx, completed) {
          const row = await contractsService.getTemplateById(
            tx as PostgresJsDatabase,
            completed.reference.id,
          )
          if (!row) throw new Error("Created contract template cannot be replayed")
          return templateDetail(row)
        },
      },
    )
  ).value
}

type LegalCreatedCommandExecutor = (
  input: ExecuteAdmittedCreatedTargetCommandInput<string>,
  handlers: ExecuteCreatedTargetCommandHandlers<{ id: string }, string>,
) => Promise<ExecuteCreatedTargetCommandResult<{ id: string }, string>>
type LegalContractDraftCreateTestHooks = {
  afterBookingReviewSourceRead?: () => Promise<void> | void
}

export function resolveLegalContractDraftLanguage(
  requestedLanguage: string | undefined,
  previousLanguage: string | undefined,
): string {
  return requestedLanguage ?? previousLanguage ?? "en"
}

export function resolveLegalContractDraftExpiration(
  requestedExpiresAt: string | undefined,
  previousExpiresAt: Date | string | null | undefined,
): string | null {
  if (requestedExpiresAt) return requestedExpiresAt
  if (previousExpiresAt instanceof Date) return previousExpiresAt.toISOString()
  return previousExpiresAt ?? null
}

export function resolveLegalContractDraftScope(
  requestedScope: "customer" | "supplier" | "partner" | "channel" | "other" | undefined,
  bookingId: string | null,
  previousScope?: "customer" | "supplier" | "partner" | "channel" | "other",
) {
  const scope = requestedScope ?? previousScope ?? "customer"
  if (bookingId && scope !== "customer") {
    throw new ToolError("Booking contracts must use customer scope.", "INVALID_INPUT", {
      bookingId,
      scope,
    })
  }
  return bookingId ? ("customer" as const) : scope
}

export function resolveLegalContractDraftVariableSchema(
  versionSchema: unknown,
  templateSchema: unknown,
) {
  return versionSchema ?? templateSchema
}

export async function resolveLegalContractDraftNumber(
  db: PostgresJsDatabase,
  input: {
    bookingId: string | null
    seriesId: string | null
    variables: Record<string, unknown> | undefined
  },
  allocate: typeof allocateContractNumber = allocateContractNumber,
): Promise<{
  contractNumber: string | null
  variables: Record<string, unknown> | undefined
}> {
  if (!input.bookingId || !input.seriesId) {
    return { contractNumber: null, variables: input.variables }
  }
  const contractNumber = (await allocate(db, input.seriesId))?.number ?? null
  if (!contractNumber) {
    throw new ToolError(`Contract number series "${input.seriesId}" was not found.`, "NOT_FOUND", {
      seriesId: input.seriesId,
    })
  }
  return {
    contractNumber,
    variables: mergeContractNumberIntoVariables(input.variables ?? {}, contractNumber),
  }
}

export function resolveLegalContractDraftMetadata(
  requestedMetadata: Record<string, unknown> | undefined,
  previousMetadata: Record<string, unknown> | null | undefined,
  input: {
    bookingId: string | null
    revision: number
    previousRevisionId: string | null
    reviewSnapshot?: unknown
  },
): Record<string, unknown> {
  const { bookingContractReviewSnapshot, ...safeRequestedMetadata } = requestedMetadata ?? {}
  const merged = { ...(previousMetadata ?? {}), ...safeRequestedMetadata }
  if (!input.bookingId) {
    const { bookingContractWorkflow: _workflow, ...genericMetadata } = merged
    return genericMetadata
  }
  return {
    ...merged,
    bookingContractWorkflow: {
      revision: input.revision,
      previousRevisionId: input.previousRevisionId,
      reviewOnly: true,
      reviewSnapshot: input.reviewSnapshot,
    },
  }
}

async function resolveLegalContractDraftSnapshotBookingId(
  db: PostgresJsDatabase,
  input: Parameters<LegalToolServices["createDraft"]>[0],
): Promise<string | null> {
  if (input.bookingId) return input.bookingId
  if (!input.revisionOfContractId) return null
  const [previous] = await db
    .select({ bookingId: contracts.bookingId })
    .from(contracts)
    .where(eq(contracts.id, input.revisionOfContractId))
    .limit(1)
  return previous?.bookingId ?? null
}

async function authorizeLegalContractDraftBookingSnapshotRead(
  db: PostgresJsDatabase,
  requestContext: LegalToolRequestContext,
  input: Parameters<LegalToolServices["createDraft"]>[0],
) {
  const bookingId = await resolveLegalContractDraftSnapshotBookingId(db, input)
  if (!bookingId) return

  const allowed = shouldRevealBookingPii({
    actor: requestContext.actor,
    callerType: requestContext.callerType,
    scopes: requestContext.scopes ? [...requestContext.scopes] : null,
    isInternalRequest:
      requestContext.isInternalRequest === true || requestContext.callerType === "internal",
    enforceRbac: true,
  })

  await bookingsService.recordPiiAccess(db, {
    bookingId,
    travelerId: null,
    actorId:
      requestContext.userId ?? requestContext.agentId ?? requestContext.workflowPrincipalId ?? null,
    actorType: requestContext.actor ?? null,
    callerType: requestContext.callerType ?? null,
    action: "read",
    outcome: allowed ? "allowed" : "denied",
    reason: allowed ? BOOKING_CONTRACT_DRAFT_SNAPSHOT_REASON : "insufficient_scope",
    metadata: {
      bookingId,
      revisionOfContractId: input.revisionOfContractId ?? null,
      requestedBookingId: input.bookingId ?? null,
      templateVersionId: input.templateVersionId ?? null,
      routeOrToolName: "legal.create_legal_contract_draft",
      requiredScopes: BOOKING_CONTRACT_DRAFT_REQUIRED_PII_SCOPES,
      decisionPolicy: BOOKING_PII_DECISION_POLICY,
      reveal: allowed,
    },
  })

  if (!allowed) {
    throw new ToolError(
      "Booking contract draft snapshots require bookings-pii:read or wildcard scope.",
      "AUTHORIZATION_DENIED",
      { requiredScopes: BOOKING_CONTRACT_DRAFT_REQUIRED_PII_SCOPES },
    )
  }
}

export async function executeLegalContractDraftCreate(
  db: PostgresJsDatabase,
  requestContext: LegalToolRequestContext,
  input: Parameters<LegalToolServices["createDraft"]>[0],
  admitted: ToolHandlerActionPolicyContext,
  executor: LegalCreatedCommandExecutor = executeAdmittedCreatedTargetCommand,
  createContract: typeof contractsService.createContract = contractsService.createContract,
  testHooks?: LegalContractDraftCreateTestHooks,
) {
  const { idempotencyKey: legacyIdempotencyKey, ...commandInput } = input
  const policy = LEGAL_CONTRACT_DRAFT_CREATED_TARGET_POLICY
  const principal = mapActionLedgerRequestContext(requestContext)
  if (principal.principalId === "unknown_request") {
    throw new TypeError("Legal created-target commands require a concrete principal")
  }
  if (
    admitted.capabilityId !== policy.toolCapabilityId ||
    admitted.actionPolicy.capabilityId !== policy.capabilityId ||
    admitted.actionPolicy.version !== policy.actionVersion
  ) {
    throw new TypeError("Legal created-target command Tool identity drifted after admission")
  }
  admittedCreatedCommandIdempotencyKey(admitted, legacyIdempotencyKey)
  await authorizeLegalContractDraftBookingSnapshotRead(db, requestContext, commandInput)
  return executor(
    {
      db,
      context: requestContext,
      admitted,
      idempotencyKey: legacyIdempotencyKey,
      commandTargetType: policy.commandTargetType,
      canonicalTargetType: policy.canonicalTargetType,
      resultReferenceType: policy.resultReferenceType,
      commandInput,
      evaluatedRisk: policy.evaluatedRisk,
    },
    {
      async create(tx) {
        const transaction = tx as PostgresJsDatabase
        const { revisionOfContractId, ...requestedInput } = commandInput
        const previous = revisionOfContractId
          ? await transaction
              .select()
              .from(contracts)
              .where(eq(contracts.id, revisionOfContractId))
              .for("update")
              .limit(1)
              .then(([row]) => row ?? null)
          : null
        if (revisionOfContractId && !previous) {
          throw new ToolError(
            `Contract revision "${revisionOfContractId}" was not found.`,
            "NOT_FOUND",
            { revisionOfContractId },
          )
        }
        const priorWorkflow = previous
          ? parseManagedBookingContractReviewWorkflow(previous.metadata)
          : null
        if (previous && !priorWorkflow) {
          throw new ToolError(
            "A contract revision must continue a managed booking review workflow.",
            "INVALID_INPUT",
            { revisionOfContractId },
          )
        }
        if (previous && !previous.bookingId) {
          throw new ToolError(
            "A contract revision must remain attached to a booking.",
            "INVALID_INPUT",
            { revisionOfContractId },
          )
        }
        if (
          previous?.status === "sent" ||
          previous?.status === "signed" ||
          previous?.status === "executed"
        ) {
          throw new ToolError(
            "Sent, signed, and executed contract revisions cannot be superseded by a draft revision.",
            "INVALID_INPUT",
            { revisionOfContractId },
          )
        }
        if (previous && priorWorkflow?.reviewSnapshot.booking.id !== previous.bookingId) {
          throw new ToolError(
            "A contract revision predecessor has inconsistent booking workflow metadata.",
            "INVALID_INPUT",
            { revisionOfContractId },
          )
        }
        if (
          previous?.templateVersionId &&
          priorWorkflow?.reviewSnapshot.template.versionId !== previous.templateVersionId
        ) {
          throw new ToolError(
            "A contract revision predecessor has inconsistent template workflow metadata.",
            "INVALID_INPUT",
            { revisionOfContractId },
          )
        }
        if (previous) {
          const [successor] = await transaction
            .select({ id: contracts.id })
            .from(contracts)
            .where(
              // agent-quality: raw-sql reviewed -- owner: legal; JSONB metadata lookup is parameterized and locks are held on the durable parent row before this successor probe.
              sql`${contracts.metadata}->'bookingContractWorkflow'->>'previousRevisionId' = ${previous.id}`,
            )
            .limit(1)
          if (successor) {
            throw new ToolError(
              "A successor revision already exists for this contract revision.",
              "INVALID_INPUT",
              { revisionOfContractId, successorRevisionId: successor.id },
            )
          }
        }
        if (
          previous &&
          requestedInput.bookingId &&
          requestedInput.bookingId !== previous.bookingId
        ) {
          throw new ToolError(
            "A contract revision must remain attached to the same booking.",
            "INVALID_INPUT",
          )
        }
        const revision = priorWorkflow ? priorWorkflow.revision + 1 : 1
        let variables =
          requestedInput.variables ??
          (previous?.variables as Record<string, unknown> | null) ??
          undefined
        const templateVersionId =
          requestedInput.templateVersionId ?? previous?.templateVersionId ?? null
        if ((requestedInput.bookingId ?? previous?.bookingId) && !templateVersionId) {
          throw new ToolError(
            "Booking contract drafts require an applicable template version.",
            "INVALID_INPUT",
            { missingPrerequisites: ["template.currentVersion"] },
          )
        }
        const templateVersion = templateVersionId
          ? await contractsService.getTemplateVersionById(transaction, templateVersionId)
          : null
        if (templateVersionId && !templateVersion) {
          throw new ToolError(
            `Contract template version "${templateVersionId}" was not found.`,
            "NOT_FOUND",
          )
        }
        const template = templateVersion
          ? await transaction
              .select()
              .from(contractTemplates)
              .where(eq(contractTemplates.id, templateVersion.templateId))
              .for("update")
              .limit(1)
              .then(([row]) => row ?? null)
          : null
        if (templateVersion && !template) {
          throw new ToolError(
            `Contract template "${templateVersion.templateId}" was not found.`,
            "NOT_FOUND",
          )
        }
        const bookingId = requestedInput.bookingId ?? previous?.bookingId ?? null
        let language = resolveLegalContractDraftLanguage(
          requestedInput.language,
          previous?.language,
        )
        let reviewSnapshot: unknown
        if (bookingId && templateVersion) {
          if (!template) {
            throw new ToolError(
              `Contract template "${templateVersion.templateId}" was not found.`,
              "NOT_FOUND",
            )
          }
          const bookingRows = await transaction
            .select({ booking: bookings, item: bookingItems })
            .from(bookings)
            .leftJoin(bookingItems, eq(bookingItems.bookingId, bookings.id))
            .where(eq(bookings.id, bookingId))
            .for("share", { of: bookings })
          const booking = bookingRows[0]?.booking ?? null
          if (!booking) {
            throw new ToolError(`Booking "${bookingId}" was not found.`, "NOT_FOUND", {
              bookingId,
            })
          }
          const items = bookingRows.flatMap(({ item }) => (item ? [item] : []))
          await testHooks?.afterBookingReviewSourceRead?.()
          language =
            requestedInput.language ?? previous?.language ?? resolveBookingContractLanguage(booking)
          const expectedChannelId = requestedInput.channelId ?? previous?.channelId ?? null
          const templateApplicable =
            template?.active === true &&
            template.scope === "customer" &&
            template.currentVersionId === templateVersion.id &&
            template.language === language &&
            bookingContractTemplateMatchesChannel(template.channelId, expectedChannelId)
          const missingPrerequisites = bookingContractPrerequisites({
            templateApplicable,
            totalAmountCents: booking.sellAmountCents,
            itemCount: items.length,
          })
          if (missingPrerequisites.length > 0) {
            throw new ToolError(
              `Contract prerequisites are missing: ${missingPrerequisites.join(", ")}.`,
              "INVALID_INPUT",
              { missingPrerequisites },
            )
          }
          const [currentTemplateVersion] = await transaction
            .select({ id: contractTemplateVersions.id })
            .from(contractTemplateVersions)
            .where(
              and(
                eq(contractTemplateVersions.id, templateVersion.id),
                eq(contractTemplateVersions.templateId, template.id),
              ),
            )
            .limit(1)
          if (
            !currentTemplateVersion ||
            !(
              template.active === true &&
              template.scope === "customer" &&
              template.currentVersionId === templateVersion.id &&
              template.language === language &&
              bookingContractTemplateMatchesChannel(template.channelId, expectedChannelId)
            )
          ) {
            throw new ToolError(
              "Contract prerequisites are missing: template.applicableCurrentVersion.",
              "INVALID_INPUT",
              { missingPrerequisites: ["template.applicableCurrentVersion"] },
            )
          }
          reviewSnapshot = bookingContractReviewSnapshot({
            booking,
            items,
            template,
            version: templateVersion,
            language,
            commercialTerms: record(record(variables).commercial),
          })
        }
        const seriesId = requestedInput.seriesId ?? previous?.seriesId ?? null
        const numberedDraft = await resolveLegalContractDraftNumber(transaction, {
          bookingId,
          seriesId,
          variables,
        })
        const contractNumber = numberedDraft.contractNumber
        variables = numberedDraft.variables
        const missingVariables = validateTemplateVariables(
          resolveLegalContractDraftVariableSchema(
            templateVersion?.variableSchema,
            template?.variableSchema,
          ),
          variables ?? {},
        )
        if (missingVariables.length > 0) {
          throw new ToolError(
            `Contract prerequisites are missing: ${missingVariables.join(", ")}.`,
            "INVALID_INPUT",
            { missingPrerequisites: missingVariables },
          )
        }
        const metadata = resolveLegalContractDraftMetadata(
          requestedInput.metadata,
          previous?.metadata as Record<string, unknown> | null,
          {
            bookingId,
            revision,
            previousRevisionId: previous?.id ?? null,
            reviewSnapshot,
          },
        )
        const row = await createContract(
          transaction,
          {
            ...requestedInput,
            status: "draft",
            scope: resolveLegalContractDraftScope(requestedInput.scope, bookingId, previous?.scope),
            language,
            bookingId: requestedInput.bookingId ?? previous?.bookingId ?? null,
            personId: requestedInput.personId ?? previous?.personId ?? null,
            organizationId: requestedInput.organizationId ?? previous?.organizationId ?? null,
            supplierId: requestedInput.supplierId ?? previous?.supplierId ?? null,
            channelId: requestedInput.channelId ?? previous?.channelId ?? null,
            templateVersionId,
            seriesId,
            contractNumber,
            expiresAt: resolveLegalContractDraftExpiration(
              requestedInput.expiresAt,
              previous?.expiresAt,
            ),
            variables: variables ?? null,
            metadata,
          },
          { allowBookingContractWorkflow: true },
        )
        if (!row) throw new Error("Contract draft creation did not return a row")
        if (templateVersion) {
          await transaction
            .update(contracts)
            .set({
              renderedBody: contractsService.renderPreview({
                body: templateVersion.body,
                variables: variables ?? {},
              }),
              renderedBodyFormat: "html",
              updatedAt: new Date(),
            })
            .where(eq(contracts.id, row.id))
        }
        return { value: { id: row.id }, targetId: row.id }
      },
      async replay(_tx, completed) {
        return { id: completed.reference.id }
      },
    },
  )
}

function admittedCreatedCommandIdempotencyKey(
  admitted: ToolHandlerActionPolicyContext,
  legacyIdempotencyKey: string | undefined,
): string {
  const idempotencyKey = admitted.invocation.idempotencyKey?.trim()
  if (!idempotencyKey) {
    throw new ToolError(
      "Created-target command idempotency must come from the admitted Tool invocation.",
      "ACTION_POLICY_REQUIRED",
    )
  }
  if (legacyIdempotencyKey !== undefined && legacyIdempotencyKey !== idempotencyKey) {
    throw new ToolError(
      "The legacy top-level idempotency key does not match the admitted Tool invocation.",
      "INVALID_INPUT",
    )
  }
  return idempotencyKey
}

function legalActionLedgerContext(c: LegalMcpContext): LegalToolRequestContext {
  const callerType = c.get("callerType") ?? null
  return {
    userId: c.get("userId") ?? null,
    agentId: c.get("agentId") ?? null,
    workflowPrincipalId: c.get("workflowPrincipalId") ?? null,
    principalSubtype: c.get("principalSubtype") ?? null,
    sessionId: c.get("sessionId") ?? null,
    apiTokenId: c.get("apiTokenId") ?? c.get("apiKeyId") ?? null,
    callerType,
    actor: c.get("actor") ?? null,
    isInternalRequest: c.get("isInternalRequest") ?? callerType === "internal",
    organizationId: c.get("organizationId") ?? null,
    workflowRunId: c.get("workflowRunId") ?? null,
    workflowStepId: c.get("workflowStepId") ?? null,
    correlationId: c.req.header("x-correlation-id") ?? c.req.header("x-request-id") ?? null,
    scopes: c.get("scopes") ?? null,
  }
}

function pageMeta(result: { total: number; limit: number; offset: number }) {
  return { total: result.total, limit: result.limit, offset: result.offset }
}

export function createLegalContractDocumentToolServices(input: {
  runtime: ContractDocumentRoutesOptions
  provider: LegalDocumentArtifactProvider
  env: unknown
  db: PostgresJsDatabase
  requestContext: ActionLedgerRequestContextValues
}): LegalContractDocumentToolServices {
  async function mutate(
    mode: "generate" | "regenerate",
    command: Parameters<LegalContractDocumentToolServices["generate"]>[0],
    admitted: ToolHandlerActionPolicyContext,
  ) {
    const result = await executeLegalContractDocumentCommand({
      db: input.db,
      context: input.requestContext,
      admitted,
      mode,
      commandInput: command,
      provider: input.provider,
    })
    return result.value
  }

  return {
    generate: (command, admitted) => mutate("generate", command, admitted),
    regenerate: (command, admitted) => mutate("regenerate", command, admitted),
    async resolveDelivery({ attachmentId }) {
      if (!input.runtime.resolveGeneratedDocument) {
        throw new ToolError(
          "The selected contract-document provider does not support authorized delivery resolution.",
          "MISSING_SERVICE",
        )
      }
      const row =
        typeof (input.db as { select?: unknown }).select === "function"
          ? await contractsService.getAttachmentWithContractById(input.db, attachmentId)
          : null
      const delivery = await input.runtime.resolveGeneratedDocument(
        input.env,
        input.db,
        attachmentId,
      )
      if (delivery && row?.contract.bookingId && hasManagedBookingWorkflow(row.contract.metadata)) {
        await bookingsService.recordPiiAccess(input.db, {
          bookingId: row.contract.bookingId,
          travelerId: null,
          actorId:
            input.requestContext.userId ??
            input.requestContext.agentId ??
            input.requestContext.workflowPrincipalId ??
            null,
          actorType: input.requestContext.actor ?? null,
          callerType: input.requestContext.callerType ?? null,
          action: "read",
          outcome: "allowed",
          reason: "contract_document_delivery_reveal",
          metadata: { contractId: row.contract.id, attachmentId, reveal: true },
        })
      }
      return delivery
    },
  }
}

function iso(value: Date): string {
  return value.toISOString()
}
function nullableIso(value: Date | null): string | null {
  return value ? iso(value) : null
}
function templateSummary(row: ContractTemplate): ContractTemplateSummary {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    scope: row.scope,
    language: row.language,
    description: row.description,
    currentVersionId: row.currentVersionId,
    channelId: row.channelId,
    isDefault: row.isDefault,
    active: row.active,
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
  }
}
function templateDetail(row: ContractTemplate): ContractTemplateDetail {
  return {
    ...templateSummary(row),
    body: row.body,
    variableSchema: row.variableSchema as ContractTemplateDetail["variableSchema"],
  }
}
function policySummary(row: Policy): PolicySummary {
  return {
    id: row.id,
    kind: row.kind,
    name: row.name,
    slug: row.slug,
    description: row.description,
    language: row.language,
    currentVersionId: row.currentVersionId,
    metadata: row.metadata as PolicySummary["metadata"],
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
  }
}
function policyVersion(row: PolicyVersion): NonNullable<PolicyDetail["currentVersion"]> {
  return {
    id: row.id,
    policyId: row.policyId,
    version: row.version,
    status: row.status,
    title: row.title,
    body: row.body,
    publishedAt: nullableIso(row.publishedAt),
    retiredAt: nullableIso(row.retiredAt),
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
  }
}
function policyRule(row: PolicyRule): PolicyDetail["currentRules"][number] {
  return {
    id: row.id,
    policyVersionId: row.policyVersionId,
    ruleType: row.ruleType,
    label: row.label,
    daysBeforeDeparture: row.daysBeforeDeparture,
    refundPercent: row.refundPercent,
    refundType: row.refundType,
    flatAmountCents: row.flatAmountCents,
    currency: row.currency,
    validFrom: row.validFrom,
    validTo: row.validTo,
    conditions: row.conditions as PolicyDetail["currentRules"][number]["conditions"],
    sortOrder: row.sortOrder,
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
  }
}
async function policyDetail(db: PostgresJsDatabase, row: Policy): Promise<PolicyDetail> {
  const currentVersion = row.currentVersionId
    ? await policiesService.getPolicyVersionById(db, row.currentVersionId)
    : null
  const rules = currentVersion ? await policiesService.listPolicyRules(db, currentVersion.id) : []
  return {
    policy: policySummary(row),
    currentVersion: currentVersion ? policyVersion(currentVersion) : null,
    currentRules: rules.map(policyRule),
  }
}
function termDto(row: LegalTerm): LegalTermDto {
  return {
    id: row.id,
    contractId: row.contractId,
    policyVersionId: row.policyVersionId,
    targetKind: row.targetKind,
    targetId: row.targetId,
    termType: row.termType,
    title: row.title,
    body: row.body,
    language: row.language,
    required: row.required,
    sortOrder: row.sortOrder,
    acceptanceStatus: row.acceptanceStatus,
    acceptedAt: nullableIso(row.acceptedAt),
    acceptedBy: row.acceptedBy,
    metadata: row.metadata as LegalTermDto["metadata"],
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
  }
}
function attachmentDto(row: ContractAttachment): ContractAttachmentDto {
  return {
    id: row.id,
    contractId: row.contractId,
    kind: row.kind,
    name: row.name,
    mimeType: row.mimeType,
    fileSize: row.fileSize,
    checksum: row.checksum,
    storageAvailable: Boolean(row.storageKey),
    createdAt: iso(row.createdAt),
  }
}
