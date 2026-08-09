import { createDbClient } from "@voyant-travel/db"
import { cleanupTestDb } from "@voyant-travel/db/test-utils"
import { createToolRegistry } from "@voyant-travel/tools"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"

import { voyantToolContextContribution } from "../../src/mcp-runtime.js"
import { bookings, bookingTravelers } from "../../src/schema.js"
import { bookingsTools } from "../../src/tools.js"

const DB_AVAILABLE = !!process.env.TEST_DATABASE_URL
type ClosableTestDb = PostgresJsDatabase & {
  $client: { end(options?: { timeout?: number | null }): Promise<unknown> }
}

describe.skipIf(!DB_AVAILABLE)("Bookings MCP lookup", () => {
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
        scopes: ["bookings:read"],
        isInternalRequest: false,
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

  it("redacts traveler identity when get_booking resolves by booking number", async () => {
    const [booking] = await db
      .insert(bookings)
      .values({
        bookingNumber: "BK-MCP-PII-001",
        status: "confirmed",
        sellCurrency: "EUR",
      })
      .returning({ id: bookings.id })
    await db.insert(bookingTravelers).values({
      bookingId: booking.id,
      participantType: "traveler",
      firstName: "Ana",
      lastName: "Traveler",
      email: "ana@example.test",
      phone: "+40123456789",
    })

    const registry = createToolRegistry()
    registry.registerAll(bookingsTools)
    const result = await registry.dispatch<{ travelers: Record<string, unknown>[] }>(
      "get_booking",
      { bookingNumber: "BK-MCP-PII-001" },
      await toolContext(),
    )

    expect(result.travelers).toHaveLength(1)
    expect(result.travelers[0]).toMatchObject({
      firstName: "***",
      lastName: "***",
      email: "a***a@example.test",
      phone: "***6789",
    })
  })
})
