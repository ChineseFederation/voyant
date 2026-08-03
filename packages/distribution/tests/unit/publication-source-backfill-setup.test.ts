import { describe, expect, it, vi } from "vitest"

import {
  publicationSourceBackfillSetupSql,
  runPublicationSourceBackfillSetupMigration,
} from "../../src/publication-source-backfill-setup.js"

describe("publication source backfill setup migration", () => {
  it("preserves inventory that was already indexed when the gate turns on", () => {
    // Every (kind, connection) pair with active entries × every active channel.
    expect(publicationSourceBackfillSetupSql).toMatch(
      /INSERT INTO "channel_source_publications"[\s\S]*FROM "catalog_sourced_entries"[\s\S]*"status" = 'active'/,
    )
    expect(publicationSourceBackfillSetupSql).toMatch(
      /CROSS JOIN \(\s*SELECT "id" FROM "channels" WHERE "status" = 'active'\s*\) AS channel/,
    )
    expect(publicationSourceBackfillSetupSql).toContain("'include'")
  })

  it("treats an absent sourced-entry store as nothing to preserve, not a failure", () => {
    // Catalog owns that table and a deployment may not select its schema.
    expect(publicationSourceBackfillSetupSql).toMatch(
      /IF to_regclass\('public\.catalog_sourced_entries'\) IS NULL THEN\s*RETURN;/,
    )
    // Its own tables are a hard requirement, though.
    expect(publicationSourceBackfillSetupSql).toContain(
      "publication source backfill requires channel_source_publications",
    )
  })

  it("never overwrites a decision the operator has since authored", () => {
    // NOT EXISTS on the subject, not just ON CONFLICT: a deliberate `exclude`
    // must survive a re-run rather than being reverted to `include`.
    expect(publicationSourceBackfillSetupSql).toMatch(
      /WHERE NOT EXISTS \(\s*SELECT 1\s*FROM "channel_source_publications" existing/,
    )
    expect(publicationSourceBackfillSetupSql).toContain(
      `existing."source_connection_id" IS NOT DISTINCT FROM source."source_connection_id"`,
    )
    expect(publicationSourceBackfillSetupSql).toContain("ON CONFLICT DO NOTHING")
  })

  it("uses only escape sequences PostgreSQL accepts in a text value", () => {
    // A NUL separator (`\u0000`) parses in TypeScript but PostgreSQL rejects it
    // with "invalid Unicode escape value", which failed the whole setup
    // migration at deploy time. chr(31) needs no escape syntax at all.
    expect(publicationSourceBackfillSetupSql).not.toMatch(/\\u0000/)
    expect(publicationSourceBackfillSetupSql).not.toMatch(/E'/)
    expect(publicationSourceBackfillSetupSql).toContain("chr(31)")
  })

  it("executes through the migration runner client", async () => {
    const query = vi.fn(async () => ({ rows: [] }))

    await runPublicationSourceBackfillSetupMigration({
      client: { query } as never,
      dryRun: false,
    })

    expect(query).toHaveBeenCalledWith(publicationSourceBackfillSetupSql)
  })
})
