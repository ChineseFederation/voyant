import type { NodePgClient } from "drizzle-orm/node-postgres"

export interface PublicationCatalogBackfillSetupMigrationContext {
  client: NodePgClient
  dryRun: false
}

/**
 * Captures the prior-visible product set after schema migration. Operated
 * deployments snapshot Inventory products when that schema is selected;
 * sourced-only deployments deliberately record an empty product snapshot.
 */
export const publicationCatalogBackfillSetupSql = `
DO $$
DECLARE
  backfill_id constant text := 'cpri_prior_visible_catalog_backfill';
  backfill_status text;
  backfill_metadata jsonb;
  product_snapshot_count bigint := 0;
  channel_snapshot_count bigint := 0;
BEGIN
  IF to_regclass('public.channel_publication_reindex_intents') IS NULL THEN
    RAISE EXCEPTION 'publication catalog backfill requires publication intents';
  END IF;
  IF to_regclass('public.channel_publication_backfill_products') IS NULL THEN
    RAISE EXCEPTION 'publication catalog backfill requires the product snapshot table';
  END IF;
  IF to_regclass('public.channel_publication_backfill_channels') IS NULL THEN
    RAISE EXCEPTION 'publication catalog backfill requires the channel snapshot table';
  END IF;
  IF to_regclass('public.channels') IS NULL THEN
    RAISE EXCEPTION 'publication catalog backfill requires the Distribution channels table';
  END IF;

  INSERT INTO "channel_publication_reindex_intents" (
    "id",
    "channel_id",
    "kind",
    "status",
    "requested_by",
    "metadata"
  )
  VALUES (
    backfill_id,
    NULL,
    'catalog',
    'pending',
    'system:setup:@voyant-travel/distribution#setup.publication-catalog-backfill.v1',
    jsonb_build_object(
      'source', 'prior_active_public_catalog',
      'pageSizeOwnedBy', 'distribution-publication-intent-worker',
      'snapshotVersion', 'linear-v1'
    )
  )
  ON CONFLICT DO NOTHING;

  SELECT "status"::text, "metadata"
  INTO backfill_status, backfill_metadata
  FROM "channel_publication_reindex_intents"
  WHERE "id" = backfill_id
  FOR UPDATE;

  IF backfill_metadata->>'snapshotVersion' = 'linear-v1'
    AND jsonb_typeof(backfill_metadata->'productSnapshotCount') = 'number'
    AND jsonb_typeof(backfill_metadata->'channelSnapshotCount') = 'number'
  THEN
    RETURN;
  END IF;

  IF backfill_status <> 'pending' THEN
    RAISE EXCEPTION 'publication catalog backfill cannot repair a non-pending intent';
  END IF;

  DELETE FROM "channel_publication_backfill_products" WHERE "intent_id" = backfill_id;
  DELETE FROM "channel_publication_backfill_channels" WHERE "intent_id" = backfill_id;

  IF to_regclass('public.products') IS NOT NULL THEN
    EXECUTE $products$
      INSERT INTO "channel_publication_backfill_products" ("intent_id", "product_id")
      SELECT 'cpri_prior_visible_catalog_backfill', "products"."id"
      FROM "products"
      WHERE "products"."status" = 'active'
        AND "products"."visibility" = 'public'
      ON CONFLICT DO NOTHING
    $products$;
    GET DIAGNOSTICS product_snapshot_count = ROW_COUNT;
  END IF;

  INSERT INTO "channel_publication_backfill_channels" ("intent_id", "channel_id")
  SELECT backfill_id, "channels"."id"
  FROM "channels"
  WHERE "channels"."status" = 'active'
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS channel_snapshot_count = ROW_COUNT;

  UPDATE "channel_publication_reindex_intents"
  SET "metadata" = coalesce("metadata", '{}'::jsonb) || jsonb_build_object(
    'source', 'prior_active_public_catalog',
    'pageSizeOwnedBy', 'distribution-publication-intent-worker',
    'snapshotVersion', 'linear-v1',
    'productSnapshotCount', product_snapshot_count,
    'channelSnapshotCount', channel_snapshot_count
  )
  WHERE "id" = backfill_id;
END $$;
`

export async function runPublicationCatalogBackfillSetupMigration(
  context: PublicationCatalogBackfillSetupMigrationContext,
): Promise<void> {
  await context.client.query(publicationCatalogBackfillSetupSql)
}
