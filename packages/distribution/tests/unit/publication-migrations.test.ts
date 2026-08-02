import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

function migration(name: string) {
  return readFileSync(new URL(`../../migrations/${name}`, import.meta.url), "utf8")
}

type Snapshot = {
  tables: Record<
    string,
    {
      columns: Record<string, { notNull: boolean }>
      indexes: Record<string, unknown>
    }
  >
  enums: Record<string, { values: string[] }>
}

describe("publication cutover migrations", () => {
  it("creates resumable catalog backfill storage without reaching into Inventory", () => {
    const sql = migration("20260801173500_backfill_prior_visible_catalog_publications.sql")
    expect(sql).toContain('CREATE TABLE "channel_publication_backfill_products"')
    expect(sql).toContain('CREATE TABLE "channel_publication_backfill_channels"')
    expect(sql).not.toContain('FROM "backfill_intent", "products"')
    expect(sql).not.toContain('FROM "products"')
  })

  it("evolves channel-independent intents after the 1430 baseline", () => {
    const baseline = migration("20260801143000_channel_publications.sql")
    const evolution = migration("20260801172000_publication_intent_leases.sql")
    expect(baseline.match(/"channel_id" text NOT NULL/g)).toHaveLength(3)
    expect(baseline).not.toContain("uniq_channel_pub_reindex_global_product_pending")
    expect(evolution).toContain('ALTER COLUMN "channel_id" DROP NOT NULL')
    expect(evolution).toContain("uniq_channel_pub_reindex_global_product_pending")
    expect(evolution).toContain("uniq_channel_pub_reindex_global_supplier_pending")
    expect(evolution).toContain("uniq_channel_pub_reindex_catalog_pending")
  })

  it("keeps the 1430 snapshot scoped to the baseline migration", () => {
    const snapshot = JSON.parse(
      readFileSync(
        new URL("../../migrations/meta/20260801143000_snapshot.json", import.meta.url),
        "utf8",
      ),
    ) as Snapshot
    expect(
      snapshot.tables["public.channel_reconciliation_policies"]?.columns.channel_id?.notNull,
    ).toBe(true)
    expect(
      snapshot.tables["public.channel_product_publications"]?.columns.channel_id?.notNull,
    ).toBe(true)
    expect(
      snapshot.tables["public.channel_publication_reindex_intents"]?.columns.channel_id?.notNull,
    ).toBe(true)
    expect(snapshot.enums["public.channel_publication_reindex_intent_kind"]?.values).toEqual([
      "product",
      "supplier",
    ])
    expect(
      snapshot.tables["public.channel_publication_reindex_intents"]?.indexes,
    ).not.toHaveProperty("uniq_channel_pub_reindex_catalog_pending")
  })
})
