import { sql } from "drizzle-orm"
import { describe, expect, it } from "vitest"

import { DB_AVAILABLE, json, setupDistributionRoutes } from "./routes.setup.js"

/**
 * The system Direct channel is provisioned by migration, and the integration
 * harness truncates every table between tests — so each case that needs it
 * plants it the way the migration does: through SQL, because `system_key` is
 * deliberately not settable through the API.
 */
describe.skipIf(!DB_AVAILABLE)("System-provisioned Direct channel", () => {
  const ctx = setupDistributionRoutes()

  async function seedDirectChannel(id = "chan_system_direct") {
    await ctx.db.execute(sql`
      INSERT INTO "channels" ("id", "name", "kind", "status", "system_key")
      VALUES (${id}, 'Direct', 'direct', 'active', 'direct')
    `)
    return id
  }

  it("refuses to delete it", async () => {
    const id = await seedDirectChannel()

    const res = await ctx.app.request(`/channels/${id}`, { method: "DELETE" })

    expect(res.status).toBe(409)
    expect((await res.json()).error).toMatch(/cannot be deleted/i)

    const stillThere = await ctx.app.request(`/channels/${id}`, { method: "GET" })
    expect(stillThere.status).toBe(200)
  })

  it("refuses to deactivate it", async () => {
    const id = await seedDirectChannel()

    const res = await ctx.app.request(`/channels/${id}`, {
      method: "PATCH",
      ...json({ status: "archived" }),
    })

    expect(res.status).toBe(409)
    expect((await res.json()).error).toMatch(/cannot be deactivated/i)
  })

  it("refuses to re-kind it", async () => {
    const id = await seedDirectChannel()

    const res = await ctx.app.request(`/channels/${id}`, {
      method: "PATCH",
      ...json({ kind: "ota" }),
    })

    expect(res.status).toBe(409)
  })

  it("still accepts the edits that are the operator's to make", async () => {
    const id = await seedDirectChannel()

    const res = await ctx.app.request(`/channels/${id}`, {
      method: "PATCH",
      ...json({ description: "Our own website and checkout", contactEmail: "hello@example.com" }),
    })

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data.description).toBe("Our own website and checkout")
    expect(body.data.systemKey).toBe("direct")
  })

  it("is left out of the counterparty list but kept in the default one", async () => {
    const directId = await seedDirectChannel()
    const counterparty = await ctx.seedChannel({ kind: "ota" })

    const listed = async (query: string) => {
      const res = await ctx.app.request(`/channels${query}`, { method: "GET" })
      expect(res.status).toBe(200)
      return ((await res.json()).data as { id: string }[]).map((row) => row.id)
    }

    // Publication and product-mapping pickers read the unfiltered endpoint and
    // must be able to target Direct — default-hiding it would make the channel
    // everything publishes to the one channel nothing can be published to.
    expect(await listed("")).toEqual(expect.arrayContaining([directId, counterparty.id]))
    expect(await listed("?system=exclude")).toEqual([counterparty.id])
    expect(await listed("?system=only")).toEqual([directId])
  })

  it("reports the refusal per id in a batch delete instead of failing the batch", async () => {
    const directId = await seedDirectChannel()
    const counterparty = await ctx.seedChannel({ kind: "ota" })

    const res = await ctx.app.request("/channels/batch-delete", {
      method: "POST",
      ...json({ ids: [directId, counterparty.id] }),
    })

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.deletedIds).toEqual([counterparty.id])
    expect(body.failed).toEqual([
      { id: directId, error: expect.stringMatching(/cannot be deleted/i) },
    ])
  })
})
