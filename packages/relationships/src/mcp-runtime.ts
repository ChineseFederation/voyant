import type { ActionLedgerRequestContextValues } from "@voyant-travel/action-ledger"
import type { EventBus } from "@voyant-travel/core"
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
import { executeOrganizationCreateCommand } from "./organization-created-command.js"
import { executePersonCreateCommand } from "./person-created-command.js"
import { relationshipsService } from "./service/index.js"
import { updateOrganizationSchema, updatePersonSchema } from "./validation.js"

export * from "./tools.js"

type RelationshipsMcpEnv = {
  Variables: ActionLedgerRequestContextValues & {
    apiKeyId?: string
    eventBus?: EventBus
  }
}

export const voyantToolContextContribution = defineToolContextContribution({
  context: ["relationships"],
  contribute: ({ request, context }) => {
    const c = request as Context<RelationshipsMcpEnv>
    const db = context.db as PostgresJsDatabase
    const eventBus = c.get("eventBus")
    const requestContext = relationshipsActionLedgerContext(c)
    const authorId = () => {
      const id = c.get("userId") ?? c.get("apiTokenId") ?? c.get("apiKeyId")
      if (!id) {
        throw new ToolError(
          "CRM note writes require an authenticated user or API credential id for authorship.",
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
            idempotencyKey?: string
            [key: string]: unknown
          },
          admitted: ToolHandlerActionPolicyContext,
        ) {
          const { idempotencyKey, vatNumber, billingAddress, ...rawOrganization } = input
          const organizationData = {
            ...rawOrganization,
            taxId: rawOrganization.taxId ?? vatNumber,
          } as Parameters<typeof relationshipsService.createOrganization>[1]
          const result = await executeOrganizationCreateCommand({
            db,
            context: requestContext,
            commandInput: {
              organization: organizationData,
              billingAddress: billingAddress
                ? (billingAddress as Parameters<typeof relationshipsService.createAddress>[3])
                : null,
            },
            admitted,
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
