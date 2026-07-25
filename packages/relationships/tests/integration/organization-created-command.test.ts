import { actionLedgerEntries } from "@voyant-travel/action-ledger/schema"
import { createDbClient } from "@voyant-travel/db"
import { eventOutboxTable } from "@voyant-travel/db/schema"
import { cleanupTestDb } from "@voyant-travel/db/test-utils"
import { identityAddresses } from "@voyant-travel/identity"
import { insertAddressForEntitySchema } from "@voyant-travel/identity/validation"
import { createToolRegistry, type ToolContext } from "@voyant-travel/tools"
import { eq } from "drizzle-orm"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"

import {
  RELATIONSHIPS_ORGANIZATION_CREATED_TARGET_POLICY,
  RELATIONSHIPS_ORGANIZATION_HANDLER_ACTION_POLICY,
} from "../../src/created-target-policy.js"
import {
  executeOrganizationCreateCommand,
  organizationCreatedEventId,
} from "../../src/organization-created-command.js"
import { organizations } from "../../src/schema.js"
import { createOrganizationTool, type RelationshipsToolServices } from "../../src/tools.js"
import { insertOrganizationSchema } from "../../src/validation.js"

const DB_AVAILABLE = !!process.env.TEST_DATABASE_URL
type ClosableTestDb = PostgresJsDatabase & {
  $client: { end(options?: { timeout?: number | null }): Promise<unknown> }
}

describe.skipIf(!DB_AVAILABLE)("Relationships organization created-target command", () => {
  let db: ClosableTestDb

  beforeAll(() => {
    db = createDbClient(process.env.TEST_DATABASE_URL as string, {
      adapter: "node",
      nodeMaxConnections: 2,
      timeouts: { statementMs: false, queryMs: false, connectMs: false },
    }) as ClosableTestDb
  })
  beforeEach(() => cleanupTestDb(db))
  afterAll(async () => {
    await db.$client.end({ timeout: 0 })
  })

  it("atomically creates, replays, conflicts, serializes, and enqueues once", async () => {
    const idempotencyKey = "organization-create-1"
    const command = organizationCommand(idempotencyKey)
    let releaseFirst: () => void = () => undefined
    const holdFirst = new Promise<void>((resolve) => {
      releaseFirst = resolve
    })
    let domainInserted: () => void = () => undefined
    const inserted = new Promise<void>((resolve) => {
      domainInserted = resolve
    })

    const firstPromise = executeCommand({
      ...command,
      testHooks: {
        async afterDomainCreate() {
          domainInserted()
          await holdFirst
        },
      },
    })
    await inserted
    let secondSettled = false
    const secondPromise = executeCommand(command).finally(() => {
      secondSettled = true
    })
    await new Promise((resolve) => setTimeout(resolve, 25))
    expect(secondSettled).toBe(false)

    releaseFirst()
    const [first, concurrentReplay] = await Promise.all([firstPromise, secondPromise])
    expect(first.replayed).toBe(false)
    expect(concurrentReplay).toMatchObject({ replayed: true, value: first.value })

    const exactReplay = await executeCommand(command)
    expect(exactReplay).toMatchObject({ replayed: true, value: first.value })
    await expect(
      executeCommand({
        ...command,
        commandInput: {
          ...command.commandInput,
          organization: { ...command.commandInput.organization, name: "Drifted organization" },
        },
      }),
    ).rejects.toMatchObject({
      code: "PROVIDER_ERROR",
      message: expect.stringContaining(
        "Action ledger idempotency key was reused with a different fingerprint",
      ),
      cause: {
        name: "ActionLedgerIdempotencyConflictError",
        existingActionId: expect.any(String),
      },
    })

    const organizationRows = await db.select().from(organizations)
    expect(organizationRows).toHaveLength(1)
    expect(organizationRows[0]).toMatchObject({
      id: first.value.id,
      name: "Atomic organization",
      taxId: "RO123",
    })
    const addresses = await db.select().from(identityAddresses)
    expect(addresses).toHaveLength(1)
    expect(addresses[0]).toMatchObject({
      entityType: "organization",
      entityId: first.value.id,
      label: "billing",
      line1: "Calea Victoriei 1",
      country: "RO",
    })

    const expectedEventId = organizationCreatedEventId(first.value.id)
    const outbox = await db.select().from(eventOutboxTable)
    expect(outbox).toHaveLength(1)
    expect(outbox[0]).toMatchObject({
      eventId: expectedEventId,
      name: "organization.changed",
      payload: { id: first.value.id, action: "created" },
      metadata: {
        category: "domain",
        source: "service",
        eventId: expectedEventId,
      },
    })

    const canonical = await db
      .select()
      .from(actionLedgerEntries)
      .where(eq(actionLedgerEntries.status, "succeeded"))
    expect(canonical).toContainEqual(
      expect.objectContaining({
        targetType: "organization",
        targetId: first.value.id,
        actionName: RELATIONSHIPS_ORGANIZATION_CREATED_TARGET_POLICY.actionName,
        capabilityId: RELATIONSHIPS_ORGANIZATION_CREATED_TARGET_POLICY.actionName,
        routeOrToolName: RELATIONSHIPS_ORGANIZATION_CREATED_TARGET_POLICY.toolCapabilityId,
        causationActionId: expect.any(String),
      }),
    )
  })

  it("keeps identical cross-principal commands and lifecycle events distinct", async () => {
    const idempotencyKey = "organization-create-cross-principal"
    const first = await executeCommand(
      organizationCommand(idempotencyKey, {
        userId: "user_1",
        organizationId: "tenant_1",
      }),
    )
    const second = await executeCommand(
      organizationCommand(idempotencyKey, {
        userId: "user_2",
        organizationId: "tenant_2",
      }),
    )

    expect(first.replayed).toBe(false)
    expect(second.replayed).toBe(false)
    expect(second.value.id).not.toBe(first.value.id)
    expect((await db.select().from(organizations)).map(({ id }) => id).sort()).toEqual(
      [first.value.id, second.value.id].sort(),
    )
    expect((await db.select().from(eventOutboxTable)).map(({ eventId }) => eventId).sort()).toEqual(
      [
        organizationCreatedEventId(first.value.id),
        organizationCreatedEventId(second.value.id),
      ].sort(),
    )
  })

  it("rolls back the claim, organization, billing address, outbox, and result", async () => {
    const idempotencyKey = "organization-create-crash"
    const command = organizationCommand(idempotencyKey, {
      name: "Rollback organization",
    })
    await expect(
      executeCommand({
        ...command,
        testHooks: {
          async afterDomainCreate() {
            throw new Error("injected post-insert crash")
          },
        },
      }),
    ).rejects.toThrow("injected post-insert crash")

    expect(
      await db.select().from(organizations).where(eq(organizations.name, "Rollback organization")),
    ).toHaveLength(0)
    expect(await db.select().from(identityAddresses)).toHaveLength(0)
    expect(await db.select().from(eventOutboxTable)).toHaveLength(0)
    expect(
      await db
        .select()
        .from(actionLedgerEntries)
        .where(eq(actionLedgerEntries.idempotencyKey, idempotencyKey)),
    ).toHaveLength(0)
  })

  function organizationCommand(
    idempotencyKey: string,
    options: {
      userId?: string
      organizationId?: string
      name?: string
    } = {},
  ) {
    return {
      db,
      context: {
        userId: options.userId ?? "user_1",
        callerType: "session" as const,
        actor: "staff" as const,
        organizationId: options.organizationId ?? "tenant_1",
      },
      commandInput: {
        organization: insertOrganizationSchema.parse({
          name: options.name ?? "Atomic organization",
          taxId: "RO123",
        }),
        billingAddress: insertAddressForEntitySchema.parse({
          label: "billing",
          line1: "Calea Victoriei 1",
          country: "RO",
        }),
      },
      admitted: {
        ...RELATIONSHIPS_ORGANIZATION_HANDLER_ACTION_POLICY,
        actionPolicy: {
          ...RELATIONSHIPS_ORGANIZATION_HANDLER_ACTION_POLICY.actionPolicy,
          enforcement: "handler" as const,
          invocation: {
            controlField: "_voyant" as const,
            requiredFields: ["idempotencyKey"] as const,
            optionalFields: ["reasonCode", "approvalId", "idempotencyFingerprint"] as const,
            fingerprintAlgorithm: "action-ledger-command-v1" as const,
          },
        },
        invocation: { idempotencyKey },
      },
    }
  }

  async function executeCommand(command: ReturnType<typeof organizationCommand>) {
    const registry = createToolRegistry()
    registry.register(createOrganizationTool, {
      actionPolicy: RELATIONSHIPS_ORGANIZATION_HANDLER_ACTION_POLICY.actionPolicy,
    })
    const result = await registry.dispatch<{
      status: "created"
      organization: { id: string }
      replayed: boolean
    }>(
      createOrganizationTool.name,
      {
        ...command.commandInput.organization,
        billingAddress: command.commandInput.billingAddress,
      },
      {
        db: command.db,
        actor: command.context.actor,
        audience: command.context.actor,
        tenantId: command.context.organizationId,
        organizationId: command.context.organizationId,
        resolverScope: {
          locale: "en-GB",
          audience: command.context.actor,
          market: "default",
          actor: command.context.actor,
        },
        handlerActionPolicy: command.admitted,
        relationships: {
          async createOrganization(_input, admitted) {
            const execution = await executeOrganizationCreateCommand({
              ...command,
              admitted,
            })
            return {
              status: "created",
              organization: execution.value,
              replayed: execution.replayed,
            }
          },
        } as RelationshipsToolServices,
      } satisfies ToolContext & { relationships: RelationshipsToolServices },
    )
    return { value: result.organization, replayed: result.replayed }
  }
})
