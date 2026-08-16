import { createDbClient } from "@voyant-travel/db"
import { authOrganization, publicApiKeys } from "@voyant-travel/db/schema/iam"
import { sql } from "drizzle-orm"
import { afterAll, beforeEach, describe, expect, it } from "vitest"

import { createPublicApiChannelProvider } from "../../src/public-api-channel-provider.js"
import { createLocalPublicApiAdapter } from "../../src/public-api-local-adapter.js"
import type { PublicApiRequestContext } from "../../src/public-api-runtime-port.js"

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL

/**
 * The Direct-channel lookup is raw SQL — `packages/auth` reads `channels`
 * without importing Distribution's tables — so a fake `db` that records
 * statements can only tell you what the query *says*. It cannot tell you the
 * query is wrong.
 *
 * It was: `ORDER BY (system_key = 'direct') DESC` reads NULL for every
 * operator-created channel, and a DESC sort puts NULLs first, so the row the
 * clause exists to prefer came last. Only Postgres says so, which is why this
 * lives here and not next to the unit tests.
 */
describe.skipIf(!TEST_DATABASE_URL)("public API channel resolution against Postgres", () => {
  const db = createDbClient(TEST_DATABASE_URL!, {
    adapter: "node",
    nodeMaxConnections: 4,
    timeouts: { connectMs: false, queryMs: false, statementMs: false },
  })
  const adapter = createLocalPublicApiAdapter({ resolveCipher: () => ({}) as never })
  const provider = createPublicApiChannelProvider()
  const context: PublicApiRequestContext = { bindings: {}, db }

  beforeEach(async () => {
    await db.execute(sql`DELETE FROM "channels"`)
    await db.delete(publicApiKeys)
    await db.delete(authOrganization)
  })

  afterAll(async () => {
    await db.execute(sql`DELETE FROM "channels"`)
    await db.delete(publicApiKeys)
  })

  async function insertChannel(values: {
    id: string
    name: string
    kind?: string
    status?: string
    systemKey?: string | null
    createdAt?: string
  }) {
    await db.execute(sql`
      INSERT INTO "channels" ("id", "name", "kind", "status", "system_key", "created_at")
      VALUES (
        ${values.id},
        ${values.name},
        ${values.kind ?? "direct"},
        ${values.status ?? "active"},
        ${values.systemKey ?? null},
        ${values.createdAt ?? "2026-08-01T00:00:00.000Z"}
      )
    `)
  }

  const issueKey = (channelId: string | null = null) =>
    adapter.issueApiKey(context, {
      kind: "publishable",
      allowedOrigins: ["https://shop.example.com"],
      channelId,
    })

  it("prefers the system row over an operator-created direct channel", async () => {
    // The operator's own row is inserted FIRST and sorts first on created_at,
    // so only the system-key preference can put the system row ahead of it.
    await insertChannel({
      id: "chan_operator",
      name: "Our website",
      createdAt: "2026-07-01T00:00:00.000Z",
    })
    await insertChannel({
      id: "chan_system",
      name: "Direct",
      systemKey: "direct",
      createdAt: "2026-08-01T00:00:00.000Z",
    })

    const key = await issueKey(null)

    expect(await provider.resolveChannelForKey(context, key.channelId)).toMatchObject({
      channelId: "chan_system",
      implicit: true,
    })
  })

  it("falls back to the oldest active direct channel when no system row exists", async () => {
    // What a deployment that hand-created a self-representing channel before
    // the system row existed already publishes through.
    await insertChannel({ id: "chan_new", name: "New", createdAt: "2026-08-05T00:00:00.000Z" })
    await insertChannel({ id: "chan_old", name: "Old", createdAt: "2026-07-05T00:00:00.000Z" })

    expect(await provider.resolveChannelForKey(context, null)).toMatchObject({
      channelId: "chan_old",
      implicit: true,
    })
  })

  it("serves the channel a key names, over the Direct default", async () => {
    await insertChannel({ id: "chan_system", name: "Direct", systemKey: "direct" })
    await insertChannel({ id: "chan_affiliate", name: "Affiliate", kind: "affiliate" })

    const key = await issueKey("chan_affiliate")

    expect(await provider.resolveChannelForKey(context, key.channelId)).toMatchObject({
      channelId: "chan_affiliate",
      implicit: false,
    })
  })

  it("falls back to Direct when the named channel goes inactive", async () => {
    await insertChannel({ id: "chan_system", name: "Direct", systemKey: "direct" })
    await insertChannel({
      id: "chan_affiliate",
      name: "Affiliate",
      kind: "affiliate",
      status: "archived",
    })

    const key = await issueKey("chan_affiliate")

    // Losing the channel an operator chose is a reason to serve the default,
    // not a reason to take the public surface down.
    expect(await provider.resolveChannelForKey(context, key.channelId)).toMatchObject({
      channelId: "chan_system",
      implicit: true,
    })
  })

  it("ignores an inactive system row rather than serving it", async () => {
    await insertChannel({
      id: "chan_system",
      name: "Direct",
      systemKey: "direct",
      status: "archived",
    })

    expect(await provider.resolveChannelForKey(context, null)).toBeNull()
  })

  it("resolves a mixed batch with one Direct lookup", async () => {
    await insertChannel({ id: "chan_system", name: "Direct", systemKey: "direct" })
    await insertChannel({ id: "chan_affiliate", name: "Affiliate", kind: "affiliate" })

    const resolved = await provider.resolveChannelsForKeys(context, [
      null,
      "chan_affiliate",
      "chan_missing",
    ])

    expect(resolved.get(null)).toMatchObject({ channelId: "chan_system", implicit: true })
    expect(resolved.get("chan_affiliate")).toMatchObject({
      channelId: "chan_affiliate",
      implicit: false,
    })
    expect(resolved.get("chan_missing")).toMatchObject({
      channelId: "chan_system",
      implicit: true,
    })
  })
})
