import {
  type ActionLedgerRequestContextValues,
  type ExecuteAdmittedCreatedTargetCommandInput,
  type ExecuteCreatedTargetCommandHandlers,
  type ExecuteCreatedTargetCommandResult,
  executeAdmittedCreatedTargetCommand,
  mapActionLedgerRequestContext,
} from "@voyant-travel/action-ledger"
import { bookingItems, bookingPiiAccessLog, bookings } from "@voyant-travel/bookings/schema"
import type { EventBus } from "@voyant-travel/core"
import {
  defineToolContextContribution,
  requireService,
  ToolError,
  type ToolHandlerActionPolicyContext,
} from "@voyant-travel/tools"
import { eq } from "drizzle-orm"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"
import type { Context } from "hono"
import {
  bookingContractPrerequisites,
  bookingContractTemplateMatchesChannel,
  getBookingContractReview,
  listApplicableBookingContractTemplates,
  resolveBookingContractLanguage,
} from "./booking-contract-review.js"
import { executeLegalContractDocumentCommand } from "./contract-document-command.js"
import type { ContractDocumentRoutesOptions } from "./contract-document-routes.js"
import { legalContractDocumentRuntimePort } from "./contract-document-runtime-port.js"
import { legalContractDetail, legalContractSummary } from "./contract-dto.js"
import { executeLegalContractLifecycleCommand } from "./contract-lifecycle-command.js"
import {
  type LegalDocumentArtifactProvider,
  legalDocumentArtifactProviderPort,
} from "./contracts/document-artifact-provider.js"
import type { ContractLifecycleRuntimeOptions } from "./contracts/lifecycle.js"
import { buildContractsRouteRuntime } from "./contracts/route-runtime.js"
import { type ContractAttachment, type ContractTemplate, contracts } from "./contracts/schema.js"
import {
  allocateContractNumber,
  contractsService,
  mergeContractNumberIntoVariables,
  validateTemplateVariables,
} from "./contracts/service.js"
import { LEGAL_CONTRACT_DRAFT_CREATED_TARGET_POLICY } from "./created-target-policy.js"
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
  }
}>

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
  requestContext: ActionLedgerRequestContextValues = {},
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
    listApplicableBookingTemplates(input) {
      return listApplicableBookingContractTemplates(db, input)
    },
    async getBookingContractReview({ contractId }) {
      const review = await getBookingContractReview(db, contractId)
      if (review) {
        await db.insert(bookingPiiAccessLog).values({
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
    async createTemplate(input) {
      const row = await contractsService.createTemplate(db, input)
      if (!row) throw new Error("Contract template creation did not return a row")
      return templateDetail(row)
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

type LegalCreatedCommandExecutor = (
  input: ExecuteAdmittedCreatedTargetCommandInput<string>,
  handlers: ExecuteCreatedTargetCommandHandlers<{ id: string }, string>,
) => Promise<ExecuteCreatedTargetCommandResult<{ id: string }, string>>

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
  requestedScope: "customer" | "supplier" | "partner" | "channel" | "other",
  bookingId: string | null,
) {
  if (bookingId && requestedScope !== "customer") {
    throw new ToolError("Booking contracts must use customer scope.", "INVALID_INPUT", {
      bookingId,
      scope: requestedScope,
    })
  }
  return bookingId ? ("customer" as const) : requestedScope
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
  },
): Record<string, unknown> {
  const merged = { ...(previousMetadata ?? {}), ...(requestedMetadata ?? {}) }
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
    },
  }
}

export async function executeLegalContractDraftCreate(
  db: PostgresJsDatabase,
  requestContext: ActionLedgerRequestContextValues,
  input: Parameters<LegalToolServices["createDraft"]>[0],
  admitted: ToolHandlerActionPolicyContext,
  executor: LegalCreatedCommandExecutor = executeAdmittedCreatedTargetCommand,
  createContract: typeof contractsService.createContract = contractsService.createContract,
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
          ? await contractsService.getContractById(transaction, revisionOfContractId)
          : null
        if (revisionOfContractId && !previous) {
          throw new ToolError(
            `Contract revision "${revisionOfContractId}" was not found.`,
            "NOT_FOUND",
            { revisionOfContractId },
          )
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
        const priorWorkflow =
          previous?.metadata &&
          typeof previous.metadata === "object" &&
          !Array.isArray(previous.metadata)
            ? (previous.metadata as Record<string, unknown>).bookingContractWorkflow
            : null
        const priorRevision =
          priorWorkflow && typeof priorWorkflow === "object" && !Array.isArray(priorWorkflow)
            ? (priorWorkflow as Record<string, unknown>).revision
            : null
        const revision = typeof priorRevision === "number" ? priorRevision + 1 : previous ? 2 : 1
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
        const bookingId = requestedInput.bookingId ?? previous?.bookingId ?? null
        let language = resolveLegalContractDraftLanguage(
          requestedInput.language,
          previous?.language,
        )
        if (bookingId && templateVersion) {
          const [booking] = await transaction
            .select()
            .from(bookings)
            .where(eq(bookings.id, bookingId))
            .limit(1)
          if (!booking) {
            throw new ToolError(`Booking "${bookingId}" was not found.`, "NOT_FOUND", {
              bookingId,
            })
          }
          language =
            requestedInput.language ?? previous?.language ?? resolveBookingContractLanguage(booking)
          const template = await contractsService.getTemplateById(
            transaction,
            templateVersion.templateId,
          )
          const expectedChannelId = requestedInput.channelId ?? previous?.channelId ?? null
          const templateApplicable =
            template?.active === true &&
            template.scope === "customer" &&
            template.currentVersionId === templateVersion.id &&
            template.language === language &&
            bookingContractTemplateMatchesChannel(template.channelId, expectedChannelId)
          const itemCount = await transaction
            .select({ id: bookingItems.id })
            .from(bookingItems)
            .where(eq(bookingItems.bookingId, bookingId))
            .limit(1)
          const missingPrerequisites = bookingContractPrerequisites({
            templateApplicable,
            totalAmountCents: booking.sellAmountCents,
            itemCount: itemCount.length,
          })
          if (missingPrerequisites.length > 0) {
            throw new ToolError(
              `Contract prerequisites are missing: ${missingPrerequisites.join(", ")}.`,
              "INVALID_INPUT",
              { missingPrerequisites },
            )
          }
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
          templateVersion?.variableSchema,
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
          },
        )
        const row = await createContract(transaction, {
          ...requestedInput,
          status: "draft",
          scope: resolveLegalContractDraftScope(requestedInput.scope, bookingId),
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
        })
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

function legalActionLedgerContext(c: LegalMcpContext): ActionLedgerRequestContextValues {
  return {
    userId: c.get("userId") ?? null,
    agentId: c.get("agentId") ?? null,
    workflowPrincipalId: c.get("workflowPrincipalId") ?? null,
    principalSubtype: c.get("principalSubtype") ?? null,
    sessionId: c.get("sessionId") ?? null,
    apiTokenId: c.get("apiTokenId") ?? c.get("apiKeyId") ?? null,
    callerType: c.get("callerType") ?? null,
    actor: c.get("actor") ?? null,
    isInternalRequest: c.get("isInternalRequest") ?? false,
    organizationId: c.get("organizationId") ?? null,
    workflowRunId: c.get("workflowRunId") ?? null,
    workflowStepId: c.get("workflowStepId") ?? null,
    correlationId: c.req.header("x-correlation-id") ?? c.req.header("x-request-id") ?? null,
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
      return input.runtime.resolveGeneratedDocument(input.env, input.db, attachmentId)
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
