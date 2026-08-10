import { describe, expect, it } from "vitest"

import {
  acquireNodeDatabase,
  openNodeDatabase,
  resolveNodeDatabase,
  withNodeDatabase,
} from "../../src/runtime/index.js"

const PRIMARY = "postgresql://user:pass@localhost:5432/voyant_node_runtime"

describe("Node database runtime", () => {
  it("reuses one process-owned database for the same connection settings", () => {
    const env = { DATABASE_URL: PRIMARY }

    expect(resolveNodeDatabase(env)).toBe(resolveNodeDatabase(env))
  })

  it("prefers DATABASE_URL_DIRECT", () => {
    const direct = resolveNodeDatabase({
      DATABASE_URL: `${PRIMARY}_fallback`,
      DATABASE_URL_DIRECT: `${PRIMARY}_direct`,
    })

    expect(direct).toBe(
      resolveNodeDatabase({
        DATABASE_URL: `${PRIMARY}_other_fallback`,
        DATABASE_URL_DIRECT: `${PRIMARY}_direct`,
      }),
    )
  })

  it("refreshes the process client when replica settings change", () => {
    const database = resolveNodeDatabase({
      DATABASE_URL: `${PRIMARY}_replicas`,
      DATABASE_URL_REPLICAS: `${PRIMARY}_replica_a`,
    })

    expect(
      resolveNodeDatabase({
        DATABASE_URL: `${PRIMARY}_replicas`,
        DATABASE_URL_REPLICAS: `${PRIMARY}_replica_b`,
      }),
    ).not.toBe(database)
  })

  it("refreshes the process client when the connection budget changes", () => {
    const database = resolveNodeDatabase({
      DATABASE_URL: `${PRIMARY}_pool_budget`,
      DATABASE_MAX_CONNECTIONS: "4",
    })

    expect(
      resolveNodeDatabase({
        DATABASE_URL: `${PRIMARY}_pool_budget`,
        DATABASE_MAX_CONNECTIONS: "5",
      }),
    ).not.toBe(database)
  })

  it("rejects invalid connection budgets", () => {
    expect(() =>
      resolveNodeDatabase({
        DATABASE_URL: `${PRIMARY}_invalid_pool_budget`,
        DATABASE_MAX_CONNECTIONS: "0",
      }),
    ).toThrow("DATABASE_MAX_CONNECTIONS must be a positive integer.")

    expect(() =>
      resolveNodeDatabase({
        DATABASE_URL: `${PRIMARY}_invalid_total_budget`,
        DATABASE_MAX_TOTAL_CONNECTIONS: "2.5",
      }),
    ).toThrow("DATABASE_MAX_TOTAL_CONNECTIONS must be a positive integer.")
  })

  it("rejects an aggregate budget smaller than one primary and its replicas", () => {
    expect(() =>
      resolveNodeDatabase({
        DATABASE_URL: `${PRIMARY}_undersized_total`,
        DATABASE_URL_REPLICAS: `${PRIMARY}_undersized_replica`,
        DATABASE_MAX_CONNECTIONS: "4",
        DATABASE_MAX_TOTAL_CONNECTIONS: "7",
      }),
    ).toThrow(
      "DATABASE_MAX_TOTAL_CONNECTIONS must accommodate DATABASE_MAX_CONNECTIONS for the primary and every replica.",
    )
  })

  it("evicts idle pools before their declared sockets exceed the aggregate budget", () => {
    const settings = {
      DATABASE_MAX_CONNECTIONS: "2",
      DATABASE_MAX_TOTAL_CONNECTIONS: "4",
      DATABASE_MAX_TENANT_POOLS: "10",
    }
    const firstEnv = { DATABASE_URL: `${PRIMARY}_aggregate_first`, ...settings }
    const first = resolveNodeDatabase(firstEnv)
    resolveNodeDatabase({ DATABASE_URL: `${PRIMARY}_aggregate_second`, ...settings })
    resolveNodeDatabase({ DATABASE_URL: `${PRIMARY}_aggregate_third`, ...settings })

    expect(resolveNodeDatabase(firstEnv)).not.toBe(first)
  })

  it("uses the tighter explicit tenant-pool count cap", () => {
    const settings = {
      DATABASE_MAX_CONNECTIONS: "2",
      DATABASE_MAX_TOTAL_CONNECTIONS: "32",
      DATABASE_MAX_TENANT_POOLS: "1",
    }
    const firstEnv = { DATABASE_URL: `${PRIMARY}_count_first`, ...settings }
    const first = resolveNodeDatabase(firstEnv)
    resolveNodeDatabase({ DATABASE_URL: `${PRIMARY}_count_second`, ...settings })

    expect(resolveNodeDatabase(firstEnv)).not.toBe(first)
  })

  it("rejects admission instead of evicting active pools", () => {
    const settings = {
      DATABASE_MAX_CONNECTIONS: "2",
      DATABASE_MAX_TOTAL_CONNECTIONS: "4",
      DATABASE_MAX_TENANT_POOLS: "2",
    }
    const first = acquireNodeDatabase({
      DATABASE_URL: `${PRIMARY}_active_first`,
      ...settings,
    })
    const second = acquireNodeDatabase({
      DATABASE_URL: `${PRIMARY}_active_second`,
      ...settings,
    })
    try {
      expect(() =>
        resolveNodeDatabase({
          DATABASE_URL: `${PRIMARY}_active_third`,
          ...settings,
        }),
      ).toThrow("Voyant Node tenant database pool capacity is exhausted.")
    } finally {
      first.release()
      second.release()
    }
  })

  it("does not reuse a pool created under a different aggregate envelope", () => {
    const database = resolveNodeDatabase({
      DATABASE_URL: `${PRIMARY}_aggregate_identity`,
      DATABASE_MAX_TOTAL_CONNECTIONS: "32",
    })

    expect(
      resolveNodeDatabase({
        DATABASE_URL: `${PRIMARY}_aggregate_identity`,
        DATABASE_MAX_TOTAL_CONNECTIONS: "16",
      }),
    ).not.toBe(database)
  })

  it("allows tenant pools of different sizes inside one process envelope", () => {
    const smaller = acquireNodeDatabase({
      DATABASE_URL: `${PRIMARY}_mixed_smaller`,
      DATABASE_MAX_CONNECTIONS: "2",
      DATABASE_MAX_TOTAL_CONNECTIONS: "8",
      DATABASE_MAX_TENANT_POOLS: "4",
    })
    try {
      expect(() =>
        resolveNodeDatabase({
          DATABASE_URL: `${PRIMARY}_mixed_larger`,
          DATABASE_MAX_CONNECTIONS: "4",
          DATABASE_MAX_TOTAL_CONNECTIONS: "8",
          DATABASE_MAX_TENANT_POOLS: "4",
        }),
      ).not.toThrow()
    } finally {
      smaller.release()
    }
  })

  it("rejects process-wide envelope drift while a tenant pool is active", () => {
    const held = acquireNodeDatabase({
      DATABASE_URL: `${PRIMARY}_envelope_held`,
      DATABASE_MAX_TOTAL_CONNECTIONS: "16",
    })
    try {
      expect(() =>
        resolveNodeDatabase({
          DATABASE_URL: `${PRIMARY}_envelope_conflict`,
          DATABASE_MAX_TOTAL_CONNECTIONS: "32",
        }),
      ).toThrow(
        "Voyant Node database capacity settings cannot change while tenant pools are active.",
      )
    } finally {
      held.release()
    }
  })

  it("provides lifecycle adapters without disposing the process-owned pool", async () => {
    const env = { DATABASE_URL: `${PRIMARY}_lifecycle` }
    const resource = openNodeDatabase(env)

    expect(resource.db).toBe(resolveNodeDatabase(env))
    await expect(resource.dispose()).resolves.toBeUndefined()
    await expect(withNodeDatabase(env, async (database) => database)).resolves.toBe(resource.db)
  })

  it("requires a database URL", () => {
    expect(() => resolveNodeDatabase({ DATABASE_URL: "" })).toThrow(
      "Voyant Node runtime requires DATABASE_URL.",
    )
  })
})
