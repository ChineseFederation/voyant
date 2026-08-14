import { createDbClient } from "@voyant-travel/db"
import { authOrganization, storefronts } from "@voyant-travel/db/schema/iam"
import { sql } from "drizzle-orm"
import { afterAll, beforeEach, describe, expect, it } from "vitest"

import { createLinkServiceStorefrontChannelBindingProvider } from "../../src/storefront-channel-binding-provider.js"
import { createLocalStorefrontAdapter } from "../../src/storefront-local-adapter.js"
import type { StorefrontRequestContext } from "../../src/storefront-runtime-port.js"

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
describe.skipIf(!TEST_DATABASE_URL)("storefront channel binding against Postgres", () => {
  const db = createDbClient(TEST_DATABASE_URL!, {
    adapter: "node",
    nodeMaxConnections: 4,
    timeouts: { connectMs: false, queryMs: false, statementMs: false },
  })
  const adapter = createLocalStorefrontAdapter({ resolveCipher: () => ({}) as never })
  const provider = createLinkServiceStorefrontChannelBindingProvider()
  const context: StorefrontRequestContext = { bindings: {}, db }

  beforeEach(async () => {
    await db.execute(sql`DELETE FROM "auth_storefront_distribution_channel"`)
    await db.execute(sql`DELETE FROM "channels"`)
    await db.delete(storefronts)
    await db.delete(authOrganization)
  })

  afterAll(async () => {
    await db.execute(sql`DELETE FROM "auth_storefront_distribution_channel"`)
    await db.execute(sql`DELETE FROM "channels"`)
    await db.delete(storefronts)
  })

  async function createShop() {
    return adapter.createStorefront(context, {
      name: "Shop",
      slug: "shop",
      hostingKind: "external",
      allowedOrigins: ["https://shop.example.com"],
      methods: {
        emailCode: true,
        emailPassword: false,
        google: false,
        facebook: false,
        apple: false,
      },
    })
  }

  async function insertChannel(input: {
    id: string
    name: string
    kind?: string
    status?: string
    systemKey?: string | null
  }) {
    await db.execute(sql`
      INSERT INTO "channels" ("id", "name", "kind", "status", "system_key")
      VALUES (
        ${input.id},
        ${input.name},
        ${input.kind ?? "direct"}::channel_kind,
        ${input.status ?? "active"}::channel_status,
        ${input.systemKey ?? null}
      )
    `)
    return input.id
  }

  it("reports no binding when the deployment has no Direct channel", async () => {
    const shop = await createShop()

    await expect(provider.getStorefrontChannelBinding(context, shop.id)).resolves.toBeNull()
  })

  it("resolves an unbound storefront to the system Direct channel", async () => {
    const shop = await createShop()
    await insertChannel({ id: "chan_system_direct", name: "Direct", systemKey: "direct" })

    await expect(provider.getStorefrontChannelBinding(context, shop.id)).resolves.toMatchObject({
      storefrontId: shop.id,
      channelId: "chan_system_direct",
      channelName: "Direct",
      implicit: true,
    })
  })

  it("prefers the system row over an operator's own, older, direct channel", async () => {
    const shop = await createShop()
    await insertChannel({ id: "chan_operator_own", name: "Our website" })
    await db.execute(
      sql`UPDATE "channels" SET "created_at" = now() - interval '1 year' WHERE "id" = 'chan_operator_own'`,
    )
    await insertChannel({ id: "chan_system_direct", name: "Direct", systemKey: "direct" })

    const binding = await provider.getStorefrontChannelBinding(context, shop.id)

    expect(binding?.channelId).toBe("chan_system_direct")
  })

  it("falls back to an operator's own direct channel when no system row exists", async () => {
    const shop = await createShop()
    await insertChannel({ id: "chan_operator_own", name: "Our website" })

    const binding = await provider.getStorefrontChannelBinding(context, shop.id)

    expect(binding?.channelId).toBe("chan_operator_own")
    expect(binding?.implicit).toBe(true)
  })

  it("lets an explicit binding win, and returns to Direct when it is cleared", async () => {
    const shop = await createShop()
    await insertChannel({ id: "chan_system_direct", name: "Direct", systemKey: "direct" })
    await insertChannel({ id: "chan_partner", name: "Partner OTA", kind: "ota" })

    await provider.setStorefrontChannelBinding(context, shop.id, { channelId: "chan_partner" })
    await expect(provider.getStorefrontChannelBinding(context, shop.id)).resolves.toMatchObject({
      channelId: "chan_partner",
      implicit: false,
    })

    await provider.clearStorefrontChannelBinding(context, shop.id)
    await expect(provider.getStorefrontChannelBinding(context, shop.id)).resolves.toMatchObject({
      channelId: "chan_system_direct",
      implicit: true,
    })
  })

  it("falls back to Direct when the explicitly bound channel is archived", async () => {
    const shop = await createShop()
    await insertChannel({ id: "chan_system_direct", name: "Direct", systemKey: "direct" })
    await insertChannel({ id: "chan_partner", name: "Partner OTA", kind: "ota" })
    await provider.setStorefrontChannelBinding(context, shop.id, { channelId: "chan_partner" })

    await db.execute(sql`UPDATE "channels" SET "status" = 'archived' WHERE "id" = 'chan_partner'`)

    // Losing the channel an operator chose is a reason to serve the default,
    // not a reason to take the public surface down.
    await expect(provider.getStorefrontChannelBinding(context, shop.id)).resolves.toMatchObject({
      channelId: "chan_system_direct",
      implicit: true,
    })
  })
})
