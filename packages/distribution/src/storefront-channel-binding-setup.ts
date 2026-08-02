import type { NodePgClient } from "drizzle-orm/node-postgres"

export interface StorefrontChannelBindingSetupMigrationContext {
  client: NodePgClient
  dryRun: false
}

/**
 * Cross-package data cutover admitted after both DB-owned link DDL and
 * Distribution-owned channel schema migrations have completed.
 */
export const storefrontChannelBindingCutoverSql = `
DO $$
BEGIN
  IF to_regclass('public.auth_storefront_distribution_channel') IS NULL THEN
    RAISE EXCEPTION 'storefront channel binding cutover requires the binding table';
  END IF;
  IF to_regclass('public.storefronts') IS NULL THEN
    RAISE EXCEPTION 'storefront channel binding cutover requires the storefronts table';
  END IF;
  IF to_regclass('public.channels') IS NULL THEN
    RAISE EXCEPTION 'storefront channel binding cutover requires the channels table';
  END IF;
END $$;

INSERT INTO "channels" (
  "id",
  "name",
  "description",
  "kind",
  "status",
  "metadata"
)
SELECT
  'chan_storefront_direct',
  'Storefront Direct',
  'Backfilled direct channel for storefront fail-closed cutover.',
  'direct',
  'active',
  jsonb_build_object(
    'source', 'system:setup:@voyant-travel/distribution#setup.storefront-channel-bindings.v1'
  )
WHERE NOT EXISTS (
  SELECT 1
  FROM "channels"
  WHERE "kind" = 'direct'
);

DO $$
DECLARE
  direct_channel_id text;
BEGIN
  SELECT id
  INTO direct_channel_id
  FROM "channels"
  WHERE "kind" = 'direct'
    AND "status" = 'active'
  ORDER BY "created_at", "id"
  LIMIT 1;

  IF direct_channel_id IS NULL THEN
    RAISE EXCEPTION 'cannot backfill storefront channel bindings without an active direct channel';
  END IF;

  INSERT INTO "auth_storefront_distribution_channel" (
    "id",
    "storefront_id",
    "channel_id",
    "created_at",
    "updated_at",
    "deleted_at"
  )
  SELECT
    'lnk_sfchan_' || substr(md5(s.id || direct_channel_id), 1, 20),
    s.id,
    direct_channel_id,
    now(),
    now(),
    NULL
  FROM "storefronts" s
  WHERE NOT EXISTS (
    SELECT 1
    FROM "auth_storefront_distribution_channel" binding
    WHERE binding."storefront_id" = s.id
      AND binding."deleted_at" IS NULL
  )
  ON CONFLICT DO NOTHING;

  IF EXISTS (
    SELECT 1
    FROM "storefronts" s
    WHERE NOT EXISTS (
      SELECT 1
      FROM "auth_storefront_distribution_channel" binding
      JOIN "channels" c ON c.id = binding."channel_id"
      WHERE binding."storefront_id" = s.id
        AND binding."deleted_at" IS NULL
        AND c."status" = 'active'
    )
  ) THEN
    RAISE EXCEPTION 'storefront channel binding cutover left unbound or inactive storefronts';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "auth_storefront_distribution_channel"
    WHERE "deleted_at" IS NULL
    GROUP BY "storefront_id"
    HAVING count(DISTINCT "channel_id") > 1
  ) THEN
    RAISE EXCEPTION 'storefront channel binding cutover found multiple active bindings';
  END IF;
END $$;
`

export async function runStorefrontChannelBindingSetupMigration(
  context: StorefrontChannelBindingSetupMigrationContext,
): Promise<void> {
  await context.client.query(storefrontChannelBindingCutoverSql)
}
