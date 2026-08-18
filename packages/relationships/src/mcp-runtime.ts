import type { ActionLedgerRequestContextValues } from "@voyant-travel/action-ledger"
import type { EventBus, ModuleContainer } from "@voyant-travel/core"
import { createLinkService } from "@voyant-travel/db/links"
import {
  defineToolContextContribution,
  deriveCommandIdempotencyKey,
  ToolError,
  type ToolHandlerActionPolicyContext,
  withServerResolvedIdempotencyKey,
} from "@voyant-travel/tools"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"
import type { Context } from "hono"

import { emitOrganizationChanged, emitPersonChanged } from "./events.js"
import { executeInquiryCreateCommand } from "./inquiry-created-command.js"
import { executeOrganizationCreateCommand } from "./organization-created-command.js"
import { executePersonCreateCommand } from "./person-created-command.js"
import {
  RELATIONSHIPS_ROUTE_RUNTIME_CONTAINER_KEY,
  type RelationshipsRouteRuntime,
} from "./route-runtime.js"
import { relationshipsService } from "./service/index.js"
import { convertInquiryToBookingTarget } from "./service/inquiry-booking-conversions.js"
import { convertInquiryToProposal } from "./service/inquiry-conversions.js"
import { inquiryOptionUnitLink, inquiryProductLink } from "./standard-links.js"
import {
  addInquiryTargetSchema,
  assignInquirySchema,
  closeInquirySchema,
  convertInquiryToBookingSessionSchema,
  convertInquiryToProposalSchema,
  inquiryListQuerySchema,
  recordInquiryActivitySchema,
  reopenInquirySchema,
  transitionInquirySchema,
  updateInquirySchema,
  updateOrganizationSchema,
  updatePersonSchema,
} from "./validation.js"

export * from "./tools.js"

type RelationshipsMcpEnv = {
  Variables: ActionLedgerRequestContextValues & {
    apiKeyId?: string
    eventBus?: EventBus
    container?: ModuleContainer
  }
}

export const voyantToolContextContribution = defineToolContextContribution({
  context: ["relationships"],
  contribute: ({ request, context }) => {
    const c = request as Context<RelationshipsMcpEnv>
    const db = context.db as PostgresJsDatabase
    const inquiryTargetLinks = createLinkService(
      () => db,
      [inquiryProductLink, inquiryOptionUnitLink],
    )
    const withInquiryTargets = async <T extends { id: string }>(inquiry: T) => ({
      ...inquiry,
      targets: await relationshipsService.listInquiryTargets(db, inquiryTargetLinks, inquiry.id),
    })
    const eventBus = c.get("eventBus")
    const relationshipsRuntime = c
      .get("container")
      ?.resolve(RELATIONSHIPS_ROUTE_RUNTIME_CONTAINER_KEY) as RelationshipsRouteRuntime | undefined
    const proposalInquiryConversion = relationshipsRuntime?.proposalInquiryConversion
    const requestContext = relationshipsActionLedgerContext(c)
    const authorId = () => {
      const id = c.get("userId") ?? c.get("apiTokenId") ?? c.get("apiKeyId")
      if (!id) {
        throw new ToolError(
          "CRM writes require an authenticated user or API credential id for authorship.",
          "AUTHORIZATION_DENIED",
        )
      }
      return id
    }

    return {
      relationships: {
        listPeople: (query: Parameters<typeof relationshipsService.listPeople>[1]) =>
          relationshipsService.listPeople(db, query),
        getPersonById: (id: string) => relationshipsService.getPersonById(db, id),
        async createPerson(
          input: {
            idempotencyKey?: string
            firstName: string
            lastName: string
            email?: string | null
            phone?: string | null
            organizationId?: string | null
            [key: string]: unknown
          },
          admitted: ToolHandlerActionPolicyContext,
        ) {
          const { idempotencyKey, ...data } = input
          // voyant#3921: resolve the idempotency key server-side when the caller
          // did not supply one. Requiring the model to invent an opaque token made
          // every create fail on first attempt with admitted_policy_mismatch — the
          // requirement appears nowhere in the input schema, so the agent could
          // only learn it by failing. Hashing the request content gives the
          // protocol exactly what it wants: an identical retry replays the
          // original person rather than writing a second one.
          const resolvedIdempotencyKey =
            idempotencyKey ?? (await deriveCommandIdempotencyKey("create-person", data))
          const result = await executePersonCreateCommand({
            db,
            context: requestContext,
            commandInput: {
              person: data as Parameters<typeof relationshipsService.createPerson>[1],
            },
            admitted: withServerResolvedIdempotencyKey(admitted, resolvedIdempotencyKey),
            legacyIdempotencyKey: resolvedIdempotencyKey,
          })
          return {
            status: "created" as const,
            person: result.value,
            replayed: result.replayed,
          }
        },
        async updatePerson(input: { id: string; [key: string]: unknown }) {
          const { id, ...patch } = input
          const person = await relationshipsService.updatePerson(
            db,
            id,
            updatePersonSchema.parse(patch),
          )
          if (person) {
            await emitPersonChanged(eventBus, { id: person.id, action: "updated" }, "service")
          }
          return person
        },
        listOrganizations: (query: Parameters<typeof relationshipsService.listOrganizations>[1]) =>
          relationshipsService.listOrganizations(db, query),
        getOrganizationById: (id: string) => relationshipsService.getOrganizationById(db, id),
        async createOrganization(
          input: {
            taxId?: string | null
            vatNumber?: string
            billingAddress?: Record<string, unknown>
            [key: string]: unknown
          },
          admitted: ToolHandlerActionPolicyContext,
        ) {
          const { vatNumber, billingAddress, ...rawOrganization } = input
          const organizationData = {
            ...rawOrganization,
            taxId: rawOrganization.taxId ?? vatNumber,
          } as Parameters<typeof relationshipsService.createOrganization>[1]
          const commandInput = {
            organization: organizationData,
            billingAddress: billingAddress
              ? (billingAddress as Parameters<typeof relationshipsService.createAddress>[3])
              : null,
          }
          const idempotencyKey = await deriveCommandIdempotencyKey(
            "create-organization",
            commandInput,
          )
          const result = await executeOrganizationCreateCommand({
            db,
            context: requestContext,
            commandInput,
            admitted: withServerResolvedIdempotencyKey(admitted, idempotencyKey),
            legacyIdempotencyKey: idempotencyKey,
          })
          return {
            status: "created" as const,
            organization: result.value,
            replayed: result.replayed,
          }
        },
        async updateOrganization(input: {
          id: string
          vatNumber?: string
          [key: string]: unknown
        }) {
          const { id, vatNumber, ...rawPatch } = input
          const patch = updateOrganizationSchema.parse({
            ...rawPatch,
            taxId: rawPatch.taxId ?? vatNumber,
          })
          const organization = await relationshipsService.updateOrganization(db, id, patch)
          if (organization) {
            await emitOrganizationChanged(
              eventBus,
              { id: organization.id, action: "updated" },
              "service",
            )
          }
          return organization
        },
        listNotes: ({
          entityType,
          entityId,
        }: {
          entityType: "person" | "organization"
          entityId: string
        }) =>
          entityType === "person"
            ? relationshipsService.listPersonNotes(db, entityId)
            : relationshipsService.listOrganizationNotes(db, entityId),
        addNote: ({
          entityType,
          entityId,
          content,
        }: {
          entityType: "person" | "organization"
          entityId: string
          content: string
        }) =>
          entityType === "person"
            ? relationshipsService.createPersonNote(db, entityId, authorId(), { content })
            : relationshipsService.createOrganizationNote(db, entityId, authorId(), { content }),
        updateNote: ({
          entityType,
          id,
          content,
        }: {
          entityType: "person" | "organization"
          id: string
          content: string
        }) =>
          entityType === "person"
            ? relationshipsService.updatePersonNote(db, id, content)
            : relationshipsService.updateOrganizationNote(db, id, content),
        listContactMethods: ({
          entityType,
          entityId,
        }: {
          entityType: "person" | "organization"
          entityId: string
        }) => relationshipsService.listContactMethods(db, entityType, entityId),
        addContactMethod: ({
          entityType,
          entityId,
          ...data
        }: {
          entityType: "person" | "organization"
          entityId: string
          [key: string]: unknown
        }) =>
          relationshipsService.createContactMethod(
            db,
            entityType,
            entityId,
            data as Parameters<typeof relationshipsService.createContactMethod>[3],
          ),
        updateContactMethod: ({ id, ...data }: { id: string; [key: string]: unknown }) =>
          relationshipsService.updateContactMethod(
            db,
            id,
            data as Parameters<typeof relationshipsService.updateContactMethod>[2],
          ),
        listAddresses: ({
          entityType,
          entityId,
        }: {
          entityType: "person" | "organization"
          entityId: string
        }) => relationshipsService.listAddresses(db, entityType, entityId),
        addAddress: ({
          entityType,
          entityId,
          ...data
        }: {
          entityType: "person" | "organization"
          entityId: string
          [key: string]: unknown
        }) =>
          relationshipsService.createAddress(
            db,
            entityType,
            entityId,
            data as Parameters<typeof relationshipsService.createAddress>[3],
          ),
        updateAddress: ({ id, ...data }: { id: string; [key: string]: unknown }) =>
          relationshipsService.updateAddress(
            db,
            id,
            data as Parameters<typeof relationshipsService.updateAddress>[2],
          ),
        async createInquiry(
          input: Parameters<typeof executeInquiryCreateCommand>[0]["commandInput"]["inquiry"],
          admitted: ToolHandlerActionPolicyContext,
        ) {
          const actorId = authorId()
          const idempotencyKey = await deriveCommandIdempotencyKey("create-inquiry", input)
          const result = await executeInquiryCreateCommand({
            db,
            context: requestContext,
            commandInput: { inquiry: input, actorId },
            admitted: withServerResolvedIdempotencyKey(admitted, idempotencyKey),
            idempotencyKey,
            slaPolicy: relationshipsRuntime?.inquiryFirstResponseSlaPolicy,
          })
          const inquiry = await relationshipsService.getInquiry(db, result.value.id)
          if (!inquiry) {
            throw new ToolError("Created Inquiry could not be resolved.", "PROVIDER_ERROR")
          }
          return { data: await withInquiryTargets(inquiry), replayed: result.replayed }
        },
        async listInquiries(input: unknown) {
          const query = inquiryListQuerySchema.parse(input)
          const result = await relationshipsService.listInquiries(
            db,
            query,
            c.get("userId") ?? undefined,
          )
          const targets = await relationshipsService.listInquiryTargetsForInquiries(
            db,
            inquiryTargetLinks,
            result.data.map((inquiry) => inquiry.id),
          )
          return {
            ...result,
            data: result.data.map((inquiry) => ({
              ...inquiry,
              targets: targets.get(inquiry.id) ?? [],
            })),
          }
        },
        async getInquiry(id: string) {
          const inquiry = await relationshipsService.getInquiry(db, id)
          return inquiry ? withInquiryTargets(inquiry) : null
        },
        async updateInquiry({ id, ...input }: { id: string; [key: string]: unknown }) {
          return withInquiryTargets(
            await relationshipsService.updateInquiry(
              db,
              id,
              updateInquirySchema.parse(input),
              authorId(),
            ),
          )
        },
        async recordInquiryActivity({ id, ...input }: { id: string; [key: string]: unknown }) {
          await relationshipsService.recordInquiryActivity(
            db,
            id,
            recordInquiryActivitySchema.parse(input),
            authorId(),
          )
          const inquiry = await relationshipsService.getInquiry(db, id)
          if (!inquiry) throw new ToolError("Inquiry could not be resolved.", "PROVIDER_ERROR")
          return withInquiryTargets(inquiry)
        },
        async qualifyInquiry({ id }: { id: string }) {
          return withInquiryTargets(
            await relationshipsService.transitionInquiry(
              db,
              id,
              { status: "qualified" },
              authorId(),
            ),
          )
        },
        async manageInquiryTarget(input: {
          id: string
          operation: "add" | "remove"
          [key: string]: unknown
        }) {
          if (input.operation === "add") {
            const { id, operation: _operation, ...targetInput } = input
            const targetValidation = relationshipsRuntime?.inquiryTargetValidation
            if (!targetValidation) {
              throw new ToolError(
                "Inquiry target validation is unavailable in this deployment.",
                "PROVIDER_UNAVAILABLE",
              )
            }
            const target = await relationshipsService.addInquiryTarget(
              db,
              id,
              addInquiryTargetSchema.parse(targetInput),
              authorId(),
              targetValidation,
            )
            return { operation: "add" as const, target }
          }
          await relationshipsService.deleteInquiryTarget(
            db,
            input.id,
            String(input.targetLinkId),
            authorId(),
          )
          return { operation: "remove" as const, removedLinkId: String(input.targetLinkId) }
        },
        async startBookingFromInquiry({ id, ...input }: { id: string; [key: string]: unknown }) {
          const sessionRuntime = relationshipsRuntime?.inquiryBookingSession
          if (!sessionRuntime) {
            throw new ToolError(
              "Booking Session conversion is unavailable in this deployment.",
              "PROVIDER_UNAVAILABLE",
            )
          }
          const command = convertInquiryToBookingSessionSchema.parse(input)
          const result = await convertInquiryToBookingTarget(
            db,
            sessionRuntime,
            inquiryTargetLinks,
            id,
            command,
            authorId(),
          )
          return result
        },
        async assignInquiry({ id, ...input }: { id: string; [key: string]: unknown }) {
          return withInquiryTargets(
            await relationshipsService.assignInquiry(
              db,
              id,
              assignInquirySchema.parse(input),
              authorId(),
            ),
          )
        },
        async closeInquiry({ id, ...input }: { id: string; [key: string]: unknown }) {
          return withInquiryTargets(
            await relationshipsService.closeInquiry(
              db,
              id,
              closeInquirySchema.parse(input),
              authorId(),
            ),
          )
        },
        async convertInquiry({ id, ...input }: { id: string; [key: string]: unknown }) {
          if (!proposalInquiryConversion) {
            throw new ToolError(
              "Proposal conversion is unavailable in this deployment.",
              "PROVIDER_UNAVAILABLE",
            )
          }
          return convertInquiryToProposal(
            db,
            proposalInquiryConversion,
            id,
            convertInquiryToProposalSchema.parse(input),
            authorId(),
          )
        },
        async reopenInquiry({ id, ...input }: { id: string; [key: string]: unknown }) {
          return withInquiryTargets(
            await relationshipsService.reopenInquiry(
              db,
              id,
              reopenInquirySchema.parse(input),
              authorId(),
            ),
          )
        },
        async transitionInquiry({ id, ...input }: { id: string; [key: string]: unknown }) {
          return withInquiryTargets(
            await relationshipsService.transitionInquiry(
              db,
              id,
              transitionInquirySchema.parse(input),
              authorId(),
            ),
          )
        },
      },
    }
  },
})

function relationshipsActionLedgerContext(
  c: Context<RelationshipsMcpEnv>,
): ActionLedgerRequestContextValues {
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
