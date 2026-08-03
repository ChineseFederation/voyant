import type { NodePgClient } from "drizzle-orm/node-postgres"

export interface PublicationSourceBackfillSetupMigrationContext {
  client: NodePgClient
  dryRun: false
}

/**
 * Preserves what a deployment already publishes when source publication
 * becomes default-deny.
 *
 * Sourced entries previously landed in every channel slice unconditionally
 * (#4089). Turning on the gate without this would empty the storefront of
 * every connected supplier's inventory on the next index pass — a live
 * behaviour change no operator asked for. So each `(source_kind,
 * source_connection_id)` pair that already has active entries gets an explicit
 * `include` rule on each active channel: the gate starts enforcing, and the
 * status quo is now something the operator can see and revoke rather than
 * something implied by having connected at all.
 *
 * Runs once. A pair that has any rule on a channel — from a previous run or
 * authored by the operator since — is left alone, so a deliberate `exclude` is
 * never overwritten by a re-run.
 *
 * Deployments that index no sourced inventory yet insert nothing and are
 * default-deny from the start, which is the intended behaviour for every
 * connection attached after this ships.
 */
export const publicationSourceBackfillSetupSql = `
DO $$
DECLARE
  backfilled_count bigint := 0;
BEGIN
  IF to_regclass('public.channel_source_publications') IS NULL THEN
    RAISE EXCEPTION 'publication source backfill requires channel_source_publications';
  END IF;
  IF to_regclass('public.channels') IS NULL THEN
    RAISE EXCEPTION 'publication source backfill requires the Distribution channels table';
  END IF;

  -- Catalog owns this table and a deployment may not select that schema at
  -- all. Nothing indexed means nothing to preserve, so absence is not an error.
  IF to_regclass('public.catalog_sourced_entries') IS NULL THEN
    RETURN;
  END IF;

  INSERT INTO "channel_source_publications" (
    "id",
    "channel_id",
    "source_kind",
    "source_connection_id",
    "decision",
    "reason",
    "created_by",
    "updated_by",
    "metadata"
  )
  SELECT
    -- Deterministic surrogate so a re-run is idempotent. chr(31) is the unit
    -- separator: it cannot occur in a source kind or connection id, and unlike
    -- NUL it is a legal character in a PostgreSQL text value.
    'chsc_backfill_' || md5(
      channel."id" || chr(31) || source."source_kind" || chr(31) ||
        coalesce(source."source_connection_id", '')
    ),
    channel."id",
    source."source_kind",
    source."source_connection_id",
    'include',
    'Backfilled from inventory already indexed before source publication gating.',
    'system:setup:@voyant-travel/distribution#setup.publication-source-backfill.v1',
    'system:setup:@voyant-travel/distribution#setup.publication-source-backfill.v1',
    jsonb_build_object(
      'source', 'prior_indexed_sourced_entries',
      'entryCount', source."entry_count"
    )
  FROM (
    SELECT
      "source_kind",
      "source_connection_id",
      count(*) AS "entry_count"
    FROM "catalog_sourced_entries"
    WHERE "status" = 'active'
    GROUP BY "source_kind", "source_connection_id"
  ) AS source
  CROSS JOIN (
    SELECT "id" FROM "channels" WHERE "status" = 'active'
  ) AS channel
  WHERE NOT EXISTS (
    SELECT 1
    FROM "channel_source_publications" existing
    WHERE existing."channel_id" = channel."id"
      AND existing."source_kind" = source."source_kind"
      AND existing."source_connection_id" IS NOT DISTINCT FROM source."source_connection_id"
  )
  ON CONFLICT DO NOTHING;

  GET DIAGNOSTICS backfilled_count = ROW_COUNT;
  RAISE NOTICE 'publication source backfill wrote % include rule(s)', backfilled_count;
END $$;
`

export async function runPublicationSourceBackfillSetupMigration(
  context: PublicationSourceBackfillSetupMigrationContext,
): Promise<void> {
  await context.client.query(publicationSourceBackfillSetupSql)
}
