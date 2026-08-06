import { describe, expect, it } from "vitest"

import { openNodeDatabase, resolveNodeDatabase, withNodeDatabase } from "../../src/runtime/index.js"

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
