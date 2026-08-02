import { describe, expect, it, vi } from "vitest"

import {
  publicationCatalogBackfillSetupSql,
  runPublicationCatalogBackfillSetupMigration,
} from "../../src/publication-catalog-backfill-setup.js"

describe("publication catalog backfill setup migration", () => {
  it("snapshots operated products when present and records none in sourced-only deployments", () => {
    expect(publicationCatalogBackfillSetupSql).toContain(
      "to_regclass('public.products') IS NOT NULL",
    )
    expect(publicationCatalogBackfillSetupSql).toContain("product_snapshot_count bigint := 0")
    expect(publicationCatalogBackfillSetupSql).toContain("'catalog'")
    expect(publicationCatalogBackfillSetupSql).toContain("ON CONFLICT DO NOTHING")
    expect(publicationCatalogBackfillSetupSql).toContain("'snapshotVersion', 'linear-v1'")
    expect(publicationCatalogBackfillSetupSql).toContain("'productSnapshotCount'")
    expect(publicationCatalogBackfillSetupSql).toContain("'channelSnapshotCount'")
    expect(publicationCatalogBackfillSetupSql).toMatch(
      /INSERT INTO "channel_publication_backfill_products"[\s\S]*FROM "products"[\s\S]*"status" = 'active'[\s\S]*"visibility" = 'public'/,
    )
    expect(publicationCatalogBackfillSetupSql).toMatch(
      /INSERT INTO "channel_publication_backfill_channels"[\s\S]*FROM "channels"[\s\S]*"status" = 'active'/,
    )
    expect(publicationCatalogBackfillSetupSql).not.toMatch(/CROSS\s+JOIN\s+"products"/i)
    expect(publicationCatalogBackfillSetupSql).not.toMatch(/FROM "products"\s*,\s*"channels"/i)
    expect(publicationCatalogBackfillSetupSql).toContain(
      "publication catalog backfill cannot repair a non-pending intent",
    )
    expect(publicationCatalogBackfillSetupSql).not.toContain(
      'INSERT INTO "channel_product_publications"',
    )
  })

  it("executes the admitted backfill through the migration runner client", async () => {
    const query = vi.fn(async () => ({ rows: [] }))

    await runPublicationCatalogBackfillSetupMigration({
      client: { query } as never,
      dryRun: false,
    })

    expect(query).toHaveBeenCalledOnce()
    expect(query).toHaveBeenCalledWith(publicationCatalogBackfillSetupSql)
  })
})
