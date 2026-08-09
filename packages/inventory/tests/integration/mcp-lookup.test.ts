import { createDbClient } from "@voyant-travel/db"
import { cleanupTestDb } from "@voyant-travel/db/test-utils"
import { createToolRegistry } from "@voyant-travel/tools"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"

import { voyantToolContextContribution } from "../../src/mcp-runtime.js"
import { products, productTranslations } from "../../src/schema.js"
import { inventoryTools } from "../../src/tools.js"

const DB_AVAILABLE = !!process.env.TEST_DATABASE_URL
type ClosableTestDb = PostgresJsDatabase & {
  $client: { end(options?: { timeout?: number | null }): Promise<unknown> }
}

describe.skipIf(!DB_AVAILABLE)("Inventory MCP lookup", () => {
  let db: ClosableTestDb

  beforeAll(() => {
    db = createDbClient(process.env.TEST_DATABASE_URL as string, {
      adapter: "node",
      nodeMaxConnections: 2,
      timeouts: { statementMs: false, queryMs: false, connectMs: false },
    }) as ClosableTestDb
  })
  beforeEach(() => cleanupTestDb(db))
  afterAll(() => db.$client.end({ timeout: 0 }))

  async function toolContext() {
    const request = {
      env: {},
      var: {
        db,
        userId: "user_1",
        agentId: "agent_1",
        callerType: "agent",
        actor: "staff",
      },
      req: { header: () => undefined },
      get(key: string) {
        return this.var[key as keyof typeof this.var]
      },
    }
    const base = {
      db,
      actor: "staff" as const,
      audience: "staff" as const,
      tenantId: "default",
      resolverScope: {
        locale: "en",
        market: "default",
        audience: "staff" as const,
        actor: "staff" as const,
      },
    }
    const contributed = await voyantToolContextContribution.contribute({
      request,
      context: base,
      resources: {},
    })
    return { ...base, ...contributed }
  }

  it("fails closed when a catalog slug belongs to more than one product", async () => {
    const [first, second] = await db
      .insert(products)
      .values([
        { name: "First product", sellCurrency: "EUR" },
        { name: "Second product", sellCurrency: "EUR" },
      ])
      .returning({ id: products.id })
    await db.insert(productTranslations).values([
      {
        productId: first.id,
        languageTag: "en",
        slug: "shared-trip",
        name: "First product",
      },
      {
        productId: second.id,
        languageTag: "en",
        slug: "shared-trip",
        name: "Second product",
      },
    ])

    const registry = createToolRegistry()
    registry.registerAll(inventoryTools)

    await expect(
      registry.dispatch("get_product", { slug: "shared-trip" }, await toolContext()),
    ).rejects.toMatchObject({
      code: "INVALID_INPUT",
      meta: { slug: "shared-trip", candidates: expect.arrayContaining([first.id, second.id]) },
    })
  })
})
