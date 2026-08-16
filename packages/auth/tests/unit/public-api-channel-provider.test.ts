import type { SQL } from "drizzle-orm"
import { PgDialect } from "drizzle-orm/pg-core"
import { describe, expect, it } from "vitest"

import { createPublicApiChannelProvider } from "../../src/public-api-channel-provider.js"
import type { PublicApiRequestContext } from "../../src/public-api-runtime-port.js"

const dialect = new PgDialect()

type Statement = { sql: string; params: unknown[] }

/**
 * Managed-shaped request context: `db` and `bindings`, no deployment
 * `LinkService`. That is exactly what the managed operator runtime composes
 * (voyant#4336) — the provider has to serve it from the database alone.
 */
function context(respond: (statement: Statement) => unknown[]) {
  const statements: Statement[] = []
  const db = {
    execute(query: SQL) {
      const statement = dialect.sqlToQuery(query)
      const recorded = { sql: statement.sql, params: statement.params }
      statements.push(recorded)
      return Promise.resolve(respond(recorded))
    },
  }
  return {
    context: { bindings: {}, db } as unknown as PublicApiRequestContext,
    statements,
  }
}

function channelRow(overrides: Record<string, unknown> = {}) {
  return { id: "chan_1", name: "Direct", status: "active", ...overrides }
}

/**
 * The Direct lookup is the only read that mentions `system_key`, which is what
 * separates it from the by-id read; both go through `channels`.
 */
const isDirectRead = (sql: string) => sql.includes("system_key")

describe("public API channel provider", () => {
  it("resolves the channel a key names, and marks it as not implicit", async () => {
    const provider = createPublicApiChannelProvider()
    const { context: ctx, statements } = context(({ sql }) =>
      isDirectRead(sql) ? [] : [channelRow({ id: "chan_affiliate", name: "Affiliate" })],
    )

    const resolved = await provider.resolveChannelForKey(ctx, "chan_affiliate")

    expect(resolved).toEqual({
      channelId: "chan_affiliate",
      channelName: "Affiliate",
      channelStatus: "active",
      implicit: false,
    })
    // An explicitly named, active channel must not also cost a Direct lookup.
    expect(statements.filter((statement) => isDirectRead(statement.sql))).toHaveLength(0)
  })

  it("resolves a key naming no channel to Direct, and marks it implicit", async () => {
    const provider = createPublicApiChannelProvider()
    const { context: ctx } = context(({ sql }) => (isDirectRead(sql) ? [channelRow()] : []))

    expect(await provider.resolveChannelForKey(ctx, null)).toEqual({
      channelId: "chan_1",
      channelName: "Direct",
      channelStatus: "active",
      implicit: true,
    })
  })

  it("falls back to Direct when the named channel is gone", async () => {
    const provider = createPublicApiChannelProvider()
    const { context: ctx } = context(({ sql }) =>
      isDirectRead(sql) ? [channelRow({ id: "chan_direct" })] : [],
    )

    // Losing the channel an operator chose is a reason to serve the default,
    // not a reason to take the public surface down.
    expect(await provider.resolveChannelForKey(ctx, "chan_deleted")).toMatchObject({
      channelId: "chan_direct",
      implicit: true,
    })
  })

  it("falls back to Direct when the named channel is no longer active", async () => {
    const provider = createPublicApiChannelProvider()
    const { context: ctx } = context(({ sql }) =>
      isDirectRead(sql)
        ? [channelRow({ id: "chan_direct" })]
        : [channelRow({ id: "chan_affiliate", status: "archived" })],
    )

    expect(await provider.resolveChannelForKey(ctx, "chan_affiliate")).toMatchObject({
      channelId: "chan_direct",
      implicit: true,
    })
  })

  it("prefers the system row over an operator-created direct channel", async () => {
    const provider = createPublicApiChannelProvider()
    const { context: ctx, statements } = context(({ sql }) =>
      isDirectRead(sql) ? [channelRow({ id: "chan_system" })] : [],
    )

    await provider.resolveChannelForKey(ctx, null)

    const direct = statements.find((statement) => isDirectRead(statement.sql))
    // `system_key` is NULL on every operator-created channel and `NULL =
    // 'direct'` is NULL, which a DESC sort puts FIRST — so plain equality
    // ranked the operator's own channel above the system row this clause
    // exists to prefer. Only `IS NOT DISTINCT FROM` orders it correctly.
    expect(direct?.sql).toContain("IS NOT DISTINCT FROM")
  })

  it("returns null when the deployment has no active Direct channel", async () => {
    const provider = createPublicApiChannelProvider()
    const { context: ctx } = context(() => [])

    expect(await provider.resolveChannelForKey(ctx, null)).toBeNull()
  })

  it("answers null rather than throwing when the channels read faults", async () => {
    const provider = createPublicApiChannelProvider()
    // A deployment that has not run the distribution migration has no
    // `system_key` column; the honest answer there is "no Direct channel".
    const { context: ctx } = context(() => {
      throw new Error('column "system_key" does not exist')
    })

    expect(await provider.resolveChannelForKey(ctx, null)).toBeNull()
  })

  it("resolves a batch with a single Direct lookup for every unbound key", async () => {
    const provider = createPublicApiChannelProvider()
    const { context: ctx, statements } = context(({ sql }) =>
      isDirectRead(sql)
        ? [channelRow({ id: "chan_direct" })]
        : [channelRow({ id: "chan_affiliate", name: "Affiliate" })],
    )

    const resolved = await provider.resolveChannelsForKeys(ctx, [
      null,
      "chan_affiliate",
      null,
      "chan_gone",
    ])

    expect(resolved.get(null)).toMatchObject({ channelId: "chan_direct", implicit: true })
    expect(resolved.get("chan_affiliate")).toMatchObject({
      channelId: "chan_affiliate",
      implicit: false,
    })
    expect(resolved.get("chan_gone")).toMatchObject({ channelId: "chan_direct", implicit: true })
    // Resolved once for the whole batch, not once per unbound key.
    expect(statements.filter((statement) => isDirectRead(statement.sql))).toHaveLength(1)
  })

  it("never issues a Direct lookup when every key names an active channel", async () => {
    const provider = createPublicApiChannelProvider()
    const { context: ctx, statements } = context(({ sql }) =>
      isDirectRead(sql) ? [] : [channelRow({ id: "chan_a" }), channelRow({ id: "chan_b" })],
    )

    await provider.resolveChannelsForKeys(ctx, ["chan_a", "chan_b"])

    expect(statements.filter((statement) => isDirectRead(statement.sql))).toHaveLength(0)
  })
})
