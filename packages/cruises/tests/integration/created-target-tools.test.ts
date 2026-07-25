import { actionLedgerEntries } from "@voyant-travel/action-ledger/schema"
import { createDbClient } from "@voyant-travel/db"
import { eventOutboxTable } from "@voyant-travel/db/schema"
import { cleanupTestDb } from "@voyant-travel/db/test-utils"
import { createToolRegistry, type ToolContext } from "@voyant-travel/tools"
import { eq } from "drizzle-orm"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"

import { CRUISE_HANDLER_ACTION_POLICY } from "../../src/created-target-policy.js"
import { cruiseCreatedEventId, executeCruiseCreate } from "../../src/mcp-runtime.js"
import { cruises } from "../../src/schema-core.js"
import { cruiseSearchIndex } from "../../src/schema-search.js"
import { cruisesService } from "../../src/service.js"
import {
  type CruisesToolOperation,
  type CruisesToolServices,
  createCruiseTool,
} from "../../src/tools.js"
import { insertCruiseSchema } from "../../src/validation-core.js"

const DB_AVAILABLE = !!process.env.TEST_DATABASE_URL
type ClosableTestDb = PostgresJsDatabase & {
  $client: { end(options?: { timeout?: number | null }): Promise<unknown> }
}

describe.skipIf(!DB_AVAILABLE)("Cruises created-target Tool wiring", () => {
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

  const admitted = (idempotencyKey: string) =>
    ({
      capabilityId: CRUISE_HANDLER_ACTION_POLICY.capabilityId,
      capabilityVersion: CRUISE_HANDLER_ACTION_POLICY.capabilityVersion,
      canonicalName: CRUISE_HANDLER_ACTION_POLICY.canonicalName,
      actionPolicy: {
        ...CRUISE_HANDLER_ACTION_POLICY.actionPolicy,
        enforcement: "handler",
        invocation: {
          controlField: "_voyant",
          requiredFields: [],
          optionalFields: [],
          fingerprintAlgorithm: "action-ledger-command-v1",
        },
      },
      invocation: { idempotencyKey },
    }) as never

  const context = {
    userId: "user_cruise_create",
    callerType: "session",
    actor: "staff",
    organizationId: "org_cruise_create",
  } as const

  it("atomically creates, projects, enqueues, replays, conflicts, and serializes", async () => {
    const idempotencyKey = "cruise-create-1"
    const input = insertCruiseSchema.parse({
      slug: "atomic-cruise",
      name: "Atomic cruise",
      cruiseType: "ocean",
      nights: 7,
    })
    let releaseFirst: () => void = () => undefined
    const holdFirst = new Promise<void>((resolve) => {
      releaseFirst = resolve
    })
    let projectionReady: () => void = () => undefined
    const projected = new Promise<void>((resolve) => {
      projectionReady = resolve
    })
    const firstPromise = executeCommand(input, idempotencyKey, context, {
      async afterRequiredProjection() {
        projectionReady()
        await holdFirst
      },
    })
    await projected
    let secondSettled = false
    const secondPromise = executeCommand(input, idempotencyKey, context).finally(() => {
      secondSettled = true
    })
    await new Promise((resolve) => setTimeout(resolve, 25))
    expect(secondSettled).toBe(false)
    releaseFirst()

    const [first, replay] = await Promise.all([firstPromise, secondPromise])
    expect(first.replayed).toBe(false)
    expect(replay).toMatchObject({ replayed: true, value: first.value })

    await expect(
      executeCommand({ ...input, name: "Drifted cruise" }, idempotencyKey, context),
    ).rejects.toMatchObject({
      code: "PROVIDER_ERROR",
      cause: { name: "ActionLedgerIdempotencyConflictError" },
    })

    expect(await db.select().from(cruises).where(eq(cruises.slug, input.slug))).toHaveLength(1)
    expect(
      await db
        .select()
        .from(cruiseSearchIndex)
        .where(eq(cruiseSearchIndex.localCruiseId, first.value.id)),
    ).toHaveLength(1)
    expect(await db.select().from(eventOutboxTable)).toEqual([
      expect.objectContaining({
        name: "cruise.created",
        payload: { id: first.value.id },
        metadata: expect.objectContaining({ category: "domain", source: "service" }),
      }),
    ])
    expect(
      await db
        .select()
        .from(actionLedgerEntries)
        .where(eq(actionLedgerEntries.idempotencyKey, idempotencyKey)),
    ).toHaveLength(2)
  })

  it("rolls back the claim, cruise, projection, outbox, and result together", async () => {
    const idempotencyKey = "cruise-create-rollback"
    const input = insertCruiseSchema.parse({
      slug: "rolled-back-cruise",
      name: "Rolled back cruise",
      cruiseType: "river",
      nights: 4,
    })
    await expect(
      executeCommand(input, idempotencyKey, context, {
        async afterRequiredProjection() {
          throw new Error("injected post-projection failure")
        },
      }),
    ).rejects.toMatchObject({
      code: "PROVIDER_ERROR",
      cause: { message: "injected post-projection failure" },
    })

    expect(await db.select().from(cruises).where(eq(cruises.slug, input.slug))).toHaveLength(0)
    expect(
      await db.select().from(cruiseSearchIndex).where(eq(cruiseSearchIndex.slug, input.slug)),
    ).toHaveLength(0)
    expect(await db.select().from(eventOutboxTable)).toHaveLength(0)
    expect(
      await db
        .select()
        .from(actionLedgerEntries)
        .where(eq(actionLedgerEntries.idempotencyKey, idempotencyKey)),
    ).toHaveLength(0)
  })

  it("keeps lifecycle events distinct for the same command fingerprint across principals", async () => {
    const idempotencyKey = "shared-cross-principal-key"
    const input = insertCruiseSchema.parse({
      slug: "shared-cross-principal-cruise",
      name: "Shared cross-principal cruise",
      cruiseType: "ocean",
      nights: 8,
    })
    const first = await executeCommand(input, idempotencyKey, {
      userId: "user_cruise_create_a",
      callerType: "session",
      actor: "staff",
      organizationId: "org_cruise_create_a",
    })

    // The cruise slug and its required projection are globally unique. Move
    // the first product to a new slug so a second principal can execute the
    // exact same command input and reproduce the cross-scope fingerprint.
    await cruisesService.updateCruise(db, first.value.id, {
      slug: "shared-cross-principal-cruise-a",
    })

    const second = await executeCommand(input, idempotencyKey, {
      userId: "user_cruise_create_b",
      callerType: "session",
      actor: "staff",
      organizationId: "org_cruise_create_b",
    })

    expect(second.value.id).not.toBe(first.value.id)
    expect(await db.select().from(cruises)).toHaveLength(2)
    expect((await db.select().from(eventOutboxTable)).map(({ eventId }) => eventId).sort()).toEqual(
      [cruiseCreatedEventId(first.value.id), cruiseCreatedEventId(second.value.id)].sort(),
    )
  })

  async function executeCommand(
    input: Parameters<typeof executeCruiseCreate>[3],
    idempotencyKey: string,
    requestContext: Parameters<typeof executeCruiseCreate>[1],
    testHooks?: Parameters<typeof executeCruiseCreate>[5],
  ) {
    const registry = createToolRegistry()
    registry.register(createCruiseTool, {
      actionPolicy: CRUISE_HANDLER_ACTION_POLICY.actionPolicy,
    })
    const result = await registry.dispatch<{
      status: "created"
      cruise: { id: string }
      replayed: boolean
    }>(createCruiseTool.name, { ...input, idempotencyKey }, {
      db,
      actor: requestContext.actor,
      audience: requestContext.actor,
      tenantId: requestContext.organizationId,
      organizationId: requestContext.organizationId,
      resolverScope: {
        locale: "en-GB",
        audience: requestContext.actor,
        market: "default",
        actor: requestContext.actor,
      },
      handlerActionPolicy: admitted(idempotencyKey),
      cruises: {
        async execute(
          operation: CruisesToolOperation,
          toolInput: unknown,
          mintedAdmission,
        ): Promise<unknown> {
          expect(operation).toBe("createCruise")
          const { idempotencyKey: legacyIdempotencyKey, ...commandInput } = toolInput as Record<
            string,
            unknown
          >
          const execution = await executeCruiseCreate(
            db,
            requestContext,
            typeof legacyIdempotencyKey === "string" ? legacyIdempotencyKey : undefined,
            commandInput as Parameters<typeof executeCruiseCreate>[3],
            mintedAdmission!,
            testHooks,
          )
          return {
            status: "created",
            cruise: execution.value,
            replayed: execution.replayed,
          }
        },
      } satisfies CruisesToolServices,
    } satisfies ToolContext & { cruises: CruisesToolServices })
    return { value: result.cruise, replayed: result.replayed }
  }
})
