import { readFileSync } from "node:fs"

import { sql } from "drizzle-orm"
import { describe, expect, it } from "vitest"

import { DB_AVAILABLE, setupDistributionRoutes } from "./routes.setup.js"

/**
 * Drives the Direct-channel provisioning migration against a real Postgres,
 * from each starting state a deployment can actually be in.
 *
 * Asserting the file's text would prove nothing about what it does — the
 * adoption logic is a `DO` block whose whole job is choosing between rows that
 * exist. So the migration is executed, and the row it leaves behind is read
 * back.
 */
const MIGRATION = readFileSync(
  new URL("../../migrations/20260814120000_direct_channel_system_key.sql", import.meta.url),
  "utf8",
)

describe.skipIf(!DB_AVAILABLE)("Direct channel provisioning migration", () => {
  const ctx = setupDistributionRoutes()

  async function runMigration() {
    // postgres.js rejects a multi-statement query, so replay the file the way
    // the migration runner does: one statement per breakpoint.
    for (const statement of MIGRATION.split("--> statement-breakpoint")) {
      const trimmed = statement.trim()
      if (trimmed) await ctx.db.execute(sql.raw(trimmed))
    }
  }

  async function directChannels() {
    const rows = await ctx.db.execute<{
      id: string
      name: string
      status: string
      system_key: string | null
    }>(sql`SELECT id, name, status, system_key FROM channels WHERE kind = 'direct' ORDER BY id`)
    return [...rows] as { id: string; name: string; status: string; system_key: string | null }[]
  }

  async function insertChannel(values: {
    id: string
    name: string
    kind?: string
    status?: string
    metadata?: string | null
  }) {
    await ctx.db.execute(sql`
      INSERT INTO "channels" ("id", "name", "kind", "status", "metadata")
      VALUES (
        ${values.id},
        ${values.name},
        ${values.kind ?? "direct"},
        ${values.status ?? "active"},
        ${values.metadata ?? null}::jsonb
      )
    `)
  }

  it("provisions Direct on a deployment that has no channels at all", async () => {
    await runMigration()

    expect(await directChannels()).toEqual([
      expect.objectContaining({ id: "chan_system_direct", name: "Direct", system_key: "direct" }),
    ])
  })

  it("adopts the row the storefront-channel cutover created, rather than adding a second", async () => {
    await insertChannel({ id: "chan_storefront_direct", name: "Storefront Direct" })

    await runMigration()

    // Adoption, not insertion: publication rules and storefront bindings are
    // keyed by this id, and a fresh row beside it would silently unpublish
    // everything already published.
    expect(await directChannels()).toEqual([
      expect.objectContaining({
        id: "chan_storefront_direct",
        name: "Direct",
        system_key: "direct",
      }),
    ])
  })

  it("adopts an operator's own direct channel and leaves its name alone", async () => {
    await insertChannel({ id: "chan_operator_own", name: "Our website" })

    await runMigration()

    expect(await directChannels()).toEqual([
      expect.objectContaining({
        id: "chan_operator_own",
        name: "Our website",
        system_key: "direct",
      }),
    ])
  })

  it("adopts the oldest active direct channel when there is more than one", async () => {
    await insertChannel({ id: "chan_aaa_newer", name: "Newer" })
    await ctx.db.execute(sql`
      UPDATE "channels" SET "created_at" = now() + interval '1 day' WHERE "id" = 'chan_aaa_newer'
    `)
    await insertChannel({ id: "chan_zzz_older", name: "Older" })

    await runMigration()

    const marked = (await directChannels()).filter((row) => row.system_key === "direct")
    expect(marked).toHaveLength(1)
    expect(marked[0]?.id).toBe("chan_zzz_older")
  })

  it("skips an inactive direct channel rather than reviving it", async () => {
    await insertChannel({ id: "chan_archived", name: "Retired", status: "archived" })

    await runMigration()

    const rows = await directChannels()
    expect(rows.find((row) => row.id === "chan_archived")?.system_key).toBeNull()
    expect(rows.find((row) => row.system_key === "direct")?.id).toBe("chan_system_direct")
  })

  it("is idempotent", async () => {
    await runMigration()
    await runMigration()

    expect((await directChannels()).filter((row) => row.system_key === "direct")).toHaveLength(1)
  })

  it("leaves the marker unique across every channel", async () => {
    await runMigration()
    await insertChannel({ id: "chan_other", name: "Someone else", kind: "ota" })

    await expect(
      ctx.db.execute(sql`
        UPDATE "channels" SET "system_key" = 'direct' WHERE "id" = 'chan_other'
      `),
    ).rejects.toThrow()
  })
})
