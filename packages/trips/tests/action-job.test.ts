import type { VoyantGraphRuntimeFactoryContext } from "@voyant-travel/core/project"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { runTripActionJob } from "../src/action-job.js"
import { durableTripActionRuntimePort } from "../src/durable-action-runtime-port.js"
import { tripsDatabaseRuntimePort } from "../src/runtime-port.js"
import {
  drainTripActionOperations,
  hasRecoverableTripActionOperations,
} from "../src/service-durable-actions.js"

vi.mock("../src/service-durable-actions.js", () => ({
  drainTripActionOperations: vi.fn(),
  hasRecoverableTripActionOperations: vi.fn(),
}))

describe("Trips durable action job", () => {
  beforeEach(() => vi.clearAllMocks())

  it("resolves a normal database handle before provider I/O", async () => {
    const db = {} as PostgresJsDatabase
    const resolveDb = vi.fn(() => db)
    const withDb = vi.fn()
    const runtime = {
      price: { backendIdentity: "price" },
      reserve: { backendIdentity: "reserve" },
    }
    const bindings = { DATABASE_URL: "postgres://test" }
    const context = {
      bindings,
      hasPort: vi.fn((port) => port.id === durableTripActionRuntimePort.id),
      getPort: vi.fn(async (port) =>
        port.id === tripsDatabaseRuntimePort.id ? { resolveDb, withDb } : runtime,
      ),
    } as unknown as VoyantGraphRuntimeFactoryContext

    await runTripActionJob(context)

    expect(resolveDb).toHaveBeenCalledWith(bindings)
    expect(withDb).not.toHaveBeenCalled()
    expect(drainTripActionOperations).toHaveBeenCalledWith(db, {
      price: runtime.price,
      reserve: runtime.reserve,
    })
  })

  it("checks recoverable work without opening a batch transaction", async () => {
    const db = {} as PostgresJsDatabase
    const resolveDb = vi.fn(() => db)
    const withDb = vi.fn()
    vi.mocked(hasRecoverableTripActionOperations).mockResolvedValue(false)
    const context = {
      bindings: {},
      hasPort: vi.fn(() => false),
      getPort: vi.fn(async () => ({ resolveDb, withDb })),
    } as unknown as VoyantGraphRuntimeFactoryContext

    await runTripActionJob(context)

    expect(hasRecoverableTripActionOperations).toHaveBeenCalledWith(db)
    expect(withDb).not.toHaveBeenCalled()
    expect(drainTripActionOperations).not.toHaveBeenCalled()
  })
})
