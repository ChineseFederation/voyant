import { actionLedgerEntries } from "@voyant-travel/action-ledger/schema"
import { createDbClient } from "@voyant-travel/db"
import { eventOutboxTable } from "@voyant-travel/db/schema"
import { cleanupTestDb } from "@voyant-travel/db/test-utils"
import { createToolRegistry, type ToolContext } from "@voyant-travel/tools"
import { eq } from "drizzle-orm"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"

import {
  COMMERCE_CREATED_TARGET_POLICIES,
  commerceHandlerActionPolicyExpectation,
} from "../../src/created-target-policy.js"
import {
  executePromotionCreateCommand,
  promotionCreatedEventId,
} from "../../src/promotion-created-command.js"
import { promotionalOfferProducts, promotionalOffers } from "../../src/promotions/schema.js"
import { insertPromotionalOfferSchema } from "../../src/promotions/validation.js"
import { type CommerceToolServices, createPromotionTool } from "../../src/tools.js"

const DB_AVAILABLE = !!process.env.TEST_DATABASE_URL
type ClosableTestDb = PostgresJsDatabase & {
  $client: { end(options?: { timeout?: number | null }): Promise<unknown> }
}

describe.skipIf(!DB_AVAILABLE)("Commerce promotion created-target command", () => {
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

  it("atomically creates, materializes, replays, conflicts, serializes, and enqueues once", async () => {
    const idempotencyKey = "promotion-create-1"
    const command = promotionCommand(idempotencyKey)
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

    await expect(
      executeCommand({
        ...command,
        input: { ...command.input, name: "Drifted promotion" },
      }),
    ).rejects.toMatchObject({
      code: "PROVIDER_ERROR",
      cause: { name: "ActionLedgerIdempotencyConflictError" },
    })

    const offers = await db.select().from(promotionalOffers)
    expect(offers).toHaveLength(1)
    const links = await db.select().from(promotionalOfferProducts)
    expect(links.map(({ productId }) => productId).sort()).toEqual(["product_1", "product_2"])
    expect(links.every(({ offerId }) => offerId === first.value.id)).toBe(true)

    const outbox = await db.select().from(eventOutboxTable)
    expect(outbox).toHaveLength(1)
    const expectedEventId = promotionCreatedEventId(first.value.id)
    expect(outbox[0]).toMatchObject({
      eventId: expectedEventId,
      name: "promotion.changed",
      payload: {
        offerId: first.value.id,
        source: "created",
        affected: { kind: "products", productIds: ["product_1", "product_2"] },
      },
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
        targetType: "promotion",
        targetId: first.value.id,
        actionName: COMMERCE_CREATED_TARGET_POLICIES.promotion.actionName,
        capabilityId: COMMERCE_CREATED_TARGET_POLICIES.promotion.capabilityId,
        routeOrToolName: COMMERCE_CREATED_TARGET_POLICIES.promotion.toolCapabilityId,
        causationActionId: expect.any(String),
      }),
    )
  })

  it("keeps identical cross-principal commands and their outbox events distinct", async () => {
    const idempotencyKey = "promotion-create-cross-principal"
    const first = await executeCommand(
      promotionCommand(idempotencyKey, {
        userId: "user_1",
        organizationId: "organization_1",
        active: false,
      }),
    )
    const second = await executeCommand(
      promotionCommand(idempotencyKey, {
        userId: "user_2",
        organizationId: "organization_2",
        active: false,
      }),
    )

    expect(first.replayed).toBe(false)
    expect(second.replayed).toBe(false)
    expect(second.value.id).not.toBe(first.value.id)
    expect((await db.select().from(promotionalOffers)).map(({ id }) => id).sort()).toEqual(
      [first.value.id, second.value.id].sort(),
    )
    expect((await db.select().from(eventOutboxTable)).map(({ eventId }) => eventId).sort()).toEqual(
      [promotionCreatedEventId(first.value.id), promotionCreatedEventId(second.value.id)].sort(),
    )
  })

  it("rolls back the claim, offer, links, outbox, and result after a post-insert crash", async () => {
    const idempotencyKey = "promotion-create-crash"
    const command = promotionCommand(idempotencyKey)
    await expect(
      executeCommand({
        ...command,
        input: {
          ...command.input,
          name: "Rollback promotion",
          slug: "rollback-promotion",
        },
        testHooks: {
          async afterDomainCreate() {
            throw new Error("injected post-insert crash")
          },
        },
      }),
    ).rejects.toMatchObject({
      code: "PROVIDER_ERROR",
      cause: { message: "injected post-insert crash" },
    })

    expect(
      await db
        .select()
        .from(promotionalOffers)
        .where(eq(promotionalOffers.name, "Rollback promotion")),
    ).toHaveLength(0)
    expect(await db.select().from(promotionalOfferProducts)).toHaveLength(0)
    expect(await db.select().from(eventOutboxTable)).toHaveLength(0)
    expect(
      await db
        .select()
        .from(actionLedgerEntries)
        .where(eq(actionLedgerEntries.idempotencyKey, idempotencyKey)),
    ).toHaveLength(0)
  })

  function promotionCommand(
    idempotencyKey: string,
    options: {
      userId?: string
      organizationId?: string
      active?: boolean
    } = {},
  ) {
    const input = {
      ...insertPromotionalOfferSchema.parse({
        name: "Atomic promotion",
        slug: "atomic-promotion",
        discountType: "percentage",
        discountPercent: 10,
        scope: { kind: "products", productIds: ["product_1", "product_2"] },
        active: options.active,
      }),
      idempotencyKey,
    }
    const policy = COMMERCE_CREATED_TARGET_POLICIES.promotion
    const expectation = commerceHandlerActionPolicyExpectation(policy)
    return {
      db,
      context: {
        userId: options.userId ?? "user_1",
        callerType: "session" as const,
        actor: "staff" as const,
        organizationId: options.organizationId ?? "organization_1",
      },
      input,
      admitted: {
        capabilityId: expectation.capabilityId,
        capabilityVersion: expectation.capabilityVersion,
        canonicalName: expectation.canonicalName,
        actionPolicy: {
          ...expectation.actionPolicy,
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
      mutationRuntime: {
        async resolveExistingProductIds(_tx: PostgresJsDatabase, productIds: string[]) {
          return productIds
        },
      },
    }
  }

  async function executeCommand(command: Parameters<typeof executePromotionCreateCommand>[0]) {
    const expectation = commerceHandlerActionPolicyExpectation(
      COMMERCE_CREATED_TARGET_POLICIES.promotion,
    )
    const registry = createToolRegistry()
    registry.register(createPromotionTool, { actionPolicy: expectation.actionPolicy })
    const result = await registry.dispatch<{
      status: "created"
      promotion: { id: string }
      replayed: boolean
    }>(createPromotionTool.name, command.input, {
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
      commerce: {
        async createPromotion(_input, admitted) {
          const execution = await executePromotionCreateCommand({ ...command, admitted })
          return {
            status: "created",
            promotion: execution.value,
            replayed: execution.replayed,
          }
        },
      } as CommerceToolServices,
    } satisfies ToolContext & { commerce: CommerceToolServices })
    return { value: result.promotion, replayed: result.replayed }
  }
})
