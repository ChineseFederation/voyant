import type { LinkService } from "@voyant-travel/core"
import type { SQL } from "drizzle-orm"
import { PgDialect } from "drizzle-orm/pg-core"
import { describe, expect, it, vi } from "vitest"

import { createLinkServiceStorefrontChannelBindingProvider } from "../../src/storefront-channel-binding-provider.js"
import { StorefrontInputError } from "../../src/storefront-origins.js"
import type { StorefrontRequestContext } from "../../src/storefront-runtime-port.js"

const dialect = new PgDialect()

const BINDING_TABLE = "auth_storefront_distribution_channel"

type Statement = { sql: string; params: unknown[] }

/**
 * Managed-shaped request context: `db` and `bindings`, no deployment
 * `LinkService`. That is exactly what the managed operator runtime composes
 * (voyant#4336) — the provider has to serve it from the database alone.
 */
function managedContext(respond: (statement: Statement) => unknown[]) {
  const statements: Statement[] = []
  const db = {
    execute(query: SQL) {
      const statement = dialect.sqlToQuery(query)
      const recorded = { sql: statement.sql, params: statement.params }
      statements.push(recorded)
      return Promise.resolve(respond(recorded))
    },
  }
  const context = { bindings: {}, db } as unknown as StorefrontRequestContext
  return { context, statements }
}

function linkRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "lnk_1",
    storefront_id: "sf_1",
    channel_id: "chan_1",
    created_at: new Date("2026-08-01T00:00:00.000Z"),
    updated_at: new Date("2026-08-02T00:00:00.000Z"),
    deleted_at: null,
    ...overrides,
  }
}

function activeChannelRow(overrides: Record<string, unknown> = {}) {
  return { id: "chan_1", name: "Direct", status: "active", ...overrides }
}

/**
 * The Direct-channel lookup is the only read that mentions `system_key`, which
 * is what separates it from the by-id channel read both go through `channels`.
 */
const isDirectChannelRead = (sql: string) => sql.includes("system_key")

describe("storefront channel binding without a deployment LinkService", () => {
  it("lists bindings by reading the pivot table from the request database", async () => {
    const provider = createLinkServiceStorefrontChannelBindingProvider()
    const { context, statements } = managedContext(({ sql }) => {
      if (sql.includes(BINDING_TABLE)) return [linkRow()]
      if (isDirectChannelRead(sql)) return []
      if (sql.includes("channels")) return [activeChannelRow()]
      return []
    })

    const bindings = await provider.listStorefrontChannelBindings(context, ["sf_1", "sf_2"])

    expect(bindings).toEqual({
      sf_1: {
        storefrontId: "sf_1",
        channelId: "chan_1",
        channelName: "Direct",
        channelStatus: "active",
        createdAt: "2026-08-01T00:00:00.000Z",
        updatedAt: "2026-08-02T00:00:00.000Z",
        implicit: false,
      },
      // No pivot row and no Direct channel in this deployment: still null.
      sf_2: null,
    })
    const pivotRead = statements.find((statement) => statement.sql.includes(BINDING_TABLE))
    expect(pivotRead?.sql).toContain('"storefront_id"')
    expect(pivotRead?.params).toContainEqual(["sf_1", "sf_2"])
  })

  it("resolves a single binding through the same path", async () => {
    const provider = createLinkServiceStorefrontChannelBindingProvider()
    const { context } = managedContext(({ sql }) => {
      if (sql.includes(BINDING_TABLE)) return [linkRow()]
      if (isDirectChannelRead(sql)) return []
      if (sql.includes("channels")) return [activeChannelRow()]
      return []
    })

    await expect(provider.getStorefrontChannelBinding(context, "sf_1")).resolves.toMatchObject({
      storefrontId: "sf_1",
      channelId: "chan_1",
    })
  })

  it("still refuses a storefront carrying more than one active binding", async () => {
    const provider = createLinkServiceStorefrontChannelBindingProvider()
    const { context } = managedContext(({ sql }) => {
      if (sql.includes(BINDING_TABLE)) {
        return [linkRow(), linkRow({ id: "lnk_2", channel_id: "chan_2" })]
      }
      return []
    })

    await expect(provider.listStorefrontChannelBindings(context, ["sf_1"])).rejects.toThrow(
      StorefrontInputError,
    )
  })

  it("writes a binding into the pivot table", async () => {
    const provider = createLinkServiceStorefrontChannelBindingProvider()
    const { context, statements } = managedContext(({ sql }) => {
      if (sql.startsWith("INSERT INTO")) return [linkRow()]
      if (sql.includes("channels")) return [activeChannelRow()]
      return []
    })

    const binding = await provider.setStorefrontChannelBinding(context, "sf_1", {
      channelId: "chan_1",
    })

    expect(binding).toMatchObject({ storefrontId: "sf_1", channelId: "chan_1" })
    const insert = statements.find((statement) => statement.sql.startsWith("INSERT INTO"))
    expect(insert?.sql).toContain(BINDING_TABLE)
    expect(insert?.params).toEqual(expect.arrayContaining(["sf_1", "chan_1"]))
  })

  it("clears a binding by soft-deleting its pivot rows", async () => {
    const provider = createLinkServiceStorefrontChannelBindingProvider()
    const { context, statements } = managedContext(({ sql }) =>
      sql.startsWith("SELECT") ? [linkRow()] : [],
    )

    await provider.clearStorefrontChannelBinding(context, "sf_1")

    const update = statements.find((statement) => statement.sql.startsWith("UPDATE"))
    expect(update?.sql).toContain(BINDING_TABLE)
    expect(update?.sql).toContain('"deleted_at" = now()')
    expect(update?.params).toEqual(expect.arrayContaining(["sf_1", "chan_1"]))
  })
})

describe("implicit Direct channel", () => {
  const directRow = { id: "chan_system_direct", name: "Direct", status: "active" }

  function deploymentWithDirectChannel(pivotRows: unknown[]) {
    return managedContext(({ sql }) => {
      if (sql.includes(BINDING_TABLE)) return pivotRows as Record<string, unknown>[]
      if (isDirectChannelRead(sql)) return [directRow]
      if (sql.includes("channels")) return [activeChannelRow()]
      return []
    })
  }

  it("binds an unbound storefront to the deployment's Direct channel", async () => {
    const provider = createLinkServiceStorefrontChannelBindingProvider()
    const { context } = deploymentWithDirectChannel([])

    const binding = await provider.getStorefrontChannelBinding(context, "sf_1")

    expect(binding).toEqual({
      storefrontId: "sf_1",
      channelId: "chan_system_direct",
      channelName: "Direct",
      channelStatus: "active",
      // Nothing was configured, so there is no link row to date.
      createdAt: null,
      updatedAt: null,
      implicit: true,
    })
  })

  it("prefers an explicit binding over Direct", async () => {
    const provider = createLinkServiceStorefrontChannelBindingProvider()
    const { context } = deploymentWithDirectChannel([linkRow()])

    await expect(provider.getStorefrontChannelBinding(context, "sf_1")).resolves.toMatchObject({
      channelId: "chan_1",
      implicit: false,
    })
  })

  it("falls back to Direct when the explicitly bound channel is no longer active", async () => {
    const provider = createLinkServiceStorefrontChannelBindingProvider()
    const { context } = managedContext(({ sql }) => {
      if (sql.includes(BINDING_TABLE)) return [linkRow()]
      if (isDirectChannelRead(sql)) return [directRow]
      if (sql.includes("channels")) return [activeChannelRow({ status: "archived" })]
      return []
    })

    // Losing the channel an operator chose is a reason to serve the default,
    // not a reason to take the public surface down.
    await expect(provider.getStorefrontChannelBinding(context, "sf_1")).resolves.toMatchObject({
      channelId: "chan_system_direct",
      implicit: true,
    })
  })

  it("reads the Direct channel once for a batch, and not at all when every storefront is bound", async () => {
    const provider = createLinkServiceStorefrontChannelBindingProvider()
    const { context, statements } = deploymentWithDirectChannel([
      linkRow({ storefront_id: "sf_1" }),
      linkRow({ id: "lnk_2", storefront_id: "sf_2" }),
    ])

    await provider.listStorefrontChannelBindings(context, ["sf_1", "sf_2"])

    expect(statements.filter((statement) => isDirectChannelRead(statement.sql))).toHaveLength(0)
  })

  it("prefers the system row over an operator's own direct channel", async () => {
    const provider = createLinkServiceStorefrontChannelBindingProvider()
    const { context, statements } = deploymentWithDirectChannel([])

    await provider.getStorefrontChannelBinding(context, "sf_1")

    const read = statements.find((statement) => isDirectChannelRead(statement.sql))
    expect(read?.sql).toContain("system_key = 'direct'")
    expect(read?.sql).toContain("kind = 'direct'")
    // `IS NOT DISTINCT FROM`, not `=`. `system_key` is null on every
    // operator-created channel, `NULL = 'direct'` is NULL, and a DESC sort puts
    // NULLs first — so the `=` form ranked the operator's own direct channel
    // above the system row. What this fake db cannot tell you is that the query
    // is wrong; `routes.direct-channel.test.ts` runs it against Postgres, which
    // is what caught it.
    expect(read?.sql).toContain("(system_key IS NOT DISTINCT FROM 'direct') DESC")
  })

  it("reports no binding, rather than failing, when the channel read faults", async () => {
    const provider = createLinkServiceStorefrontChannelBindingProvider()
    // A deployment that has not run the distribution migration has no
    // `system_key` column. "No Direct channel" is the honest answer there; a
    // throw would turn a 403 into a 500.
    const { context } = managedContext(({ sql }) => {
      if (sql.includes(BINDING_TABLE)) return []
      if (isDirectChannelRead(sql)) throw new Error('column "system_key" does not exist')
      return []
    })

    await expect(provider.getStorefrontChannelBinding(context, "sf_1")).resolves.toBeNull()
  })
})

describe("storefront channel binding with a deployment LinkService", () => {
  it("prefers the wired service over the database fallback", async () => {
    const provider = createLinkServiceStorefrontChannelBindingProvider()
    const { context, statements } = managedContext(({ sql }) =>
      sql.includes("channels") && !isDirectChannelRead(sql) ? [activeChannelRow()] : [],
    )
    const list = vi.fn(async () => [
      {
        id: "lnk_1",
        leftId: "sf_1",
        rightId: "chan_1",
        createdAt: new Date("2026-08-01T00:00:00.000Z"),
        updatedAt: new Date("2026-08-02T00:00:00.000Z"),
        deletedAt: null,
      },
    ])
    const link = { list } as unknown as LinkService

    const bindings = await provider.listStorefrontChannelBindings({ ...context, link }, ["sf_1"])

    expect(bindings.sf_1).toMatchObject({ channelId: "chan_1", channelName: "Direct" })
    expect(list).toHaveBeenCalledWith(BINDING_TABLE, { leftIds: ["sf_1"] })
    expect(statements.every((statement) => !statement.sql.includes(BINDING_TABLE))).toBe(true)
  })
})
