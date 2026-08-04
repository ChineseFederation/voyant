-- Adopt the objects the retired `quotes` module left behind (voyant#4143).
--
-- The framework bundle is the standard profile's own migration source, so it
-- carries the same quotes -> proposals adoption the package sources ship as
-- their own post-cutline increments. Both are guarded end to end and idempotent,
-- so a deployment that runs BOTH paths converges to the same schema and the
-- second pass changes nothing.
--
-- The bundle's frozen cutline slice (0000..0007) is not touched; the rename is
-- expressed here as an append, the way every other bundle upgrade step is.
-- proposals
DO $$
DECLARE
  -- Enum TYPES the module owns. Renamed before the tables so the column type
  -- references follow automatically.
  type_renames text[] := ARRAY[
    'quote_status', 'proposal_status',
    'quote_version_status', 'proposal_version_status'
  ];
  table_renames text[] := ARRAY[
    'quotes', 'proposals',
    'quote_versions', 'proposal_versions',
    'quote_participants', 'proposal_participants',
    'quote_products', 'proposal_products',
    'quote_version_lines', 'proposal_version_lines',
    'quote_media', 'proposal_media',
    'quote_proposal_delivery_requests', 'proposal_delivery_requests',
    'booking_crm_details', 'booking_proposal_details'
  ];
BEGIN
  FOR i IN 1 .. array_length(type_renames, 1) BY 2 LOOP
    IF EXISTS (
      SELECT 1 FROM pg_type t
        JOIN pg_namespace n ON n.oid = t.typnamespace
       WHERE n.nspname = 'public' AND t.typname = type_renames[i]
    ) AND NOT EXISTS (
      SELECT 1 FROM pg_type t
        JOIN pg_namespace n ON n.oid = t.typnamespace
       WHERE n.nspname = 'public' AND t.typname = type_renames[i + 1]
    ) THEN
      EXECUTE format('ALTER TYPE public.%I RENAME TO %I', type_renames[i], type_renames[i + 1]);
    END IF;
  END LOOP;

  FOR i IN 1 .. array_length(table_renames, 1) BY 2 LOOP
    IF to_regclass('public.' || quote_ident(table_renames[i])) IS NOT NULL
       AND to_regclass('public.' || quote_ident(table_renames[i + 1])) IS NULL THEN
      EXECUTE format('ALTER TABLE public.%I RENAME TO %I', table_renames[i], table_renames[i + 1]);
    END IF;
  END LOOP;
END $$;--> statement-breakpoint
-- Columns, addressed by their POST-rename table names.
DO $$
DECLARE
  column_renames text[] := ARRAY[
    'proposal_versions', 'quote_id', 'proposal_id',
    'proposal_participants', 'quote_id', 'proposal_id',
    'proposal_products', 'quote_id', 'proposal_id',
    'proposal_media', 'quote_id', 'proposal_id',
    'proposal_version_lines', 'quote_version_id', 'proposal_version_id',
    'proposal_delivery_requests', 'quote_id', 'proposal_id',
    'proposal_delivery_requests', 'quote_version_id', 'proposal_version_id',
    'booking_proposal_details', 'quote_id', 'proposal_id',
    'booking_proposal_details', 'quote_version_id', 'proposal_version_id'
  ];
BEGIN
  FOR i IN 1 .. array_length(column_renames, 1) BY 3 LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = column_renames[i]
         AND column_name = column_renames[i + 1]
    ) AND NOT EXISTS (
      SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = column_renames[i]
         AND column_name = column_renames[i + 2]
    ) THEN
      EXECUTE format(
        'ALTER TABLE public.%I RENAME COLUMN %I TO %I',
        column_renames[i], column_renames[i + 1], column_renames[i + 2]
      );
    END IF;
  END LOOP;
END $$;--> statement-breakpoint
-- Constraints (primary keys and foreign keys). Renaming a primary-key
-- constraint renames its backing index too, so those are not listed again below.
DO $$
DECLARE
  owner_table text;
  constraint_renames text[] := ARRAY[
    'proposals', 'quotes_pkey', 'proposals_pkey',
    'proposals', 'quotes_pipeline_id_pipelines_id_fk', 'proposals_pipeline_id_pipelines_id_fk',
    'proposals', 'quotes_stage_id_stages_id_fk', 'proposals_stage_id_stages_id_fk',
    'proposal_versions', 'quote_versions_pkey', 'proposal_versions_pkey',
    'proposal_versions', 'quote_versions_quote_id_quotes_id_fk', 'proposal_versions_proposal_id_proposals_id_fk',
    'proposal_versions', 'quote_versions_supersedes_id_quote_versions_id_fk', 'proposal_versions_supersedes_id_proposal_versions_id_fk',
    'proposal_participants', 'quote_participants_pkey', 'proposal_participants_pkey',
    'proposal_participants', 'quote_participants_quote_id_quotes_id_fk', 'proposal_participants_proposal_id_proposals_id_fk',
    'proposal_products', 'quote_products_pkey', 'proposal_products_pkey',
    'proposal_products', 'quote_products_quote_id_quotes_id_fk', 'proposal_products_proposal_id_proposals_id_fk',
    'proposal_version_lines', 'quote_version_lines_pkey', 'proposal_version_lines_pkey',
    'proposal_version_lines', 'quote_version_lines_quote_version_id_quote_versions_id_fk', 'proposal_version_lines_proposal_version_id_proposal_versions_id_fk',
    'proposal_media', 'quote_media_pkey', 'proposal_media_pkey',
    'proposal_media', 'quote_media_quote_id_quotes_id_fk', 'proposal_media_proposal_id_proposals_id_fk',
    'proposal_delivery_requests', 'quote_proposal_delivery_requests_pkey', 'proposal_delivery_requests_pkey',
    'proposal_delivery_requests', 'quote_proposal_delivery_requests_quote_id_quotes_id_fk', 'proposal_delivery_requests_proposal_id_proposals_id_fk',
    'proposal_delivery_requests', 'quote_proposal_delivery_requests_quote_version_id_quote_versions_id_fk', 'proposal_delivery_requests_proposal_version_id_proposal_versions_id_fk',
    'booking_proposal_details', 'booking_crm_details_pkey', 'booking_proposal_details_pkey'
  ];
BEGIN
  FOR i IN 1 .. array_length(constraint_renames, 1) BY 3 LOOP
    owner_table := constraint_renames[i];
    IF to_regclass('public.' || quote_ident(owner_table)) IS NOT NULL
       AND EXISTS (
         SELECT 1 FROM pg_constraint c
          WHERE c.conrelid = to_regclass('public.' || quote_ident(owner_table))
            AND c.conname = constraint_renames[i + 1]
       )
       AND NOT EXISTS (
         SELECT 1 FROM pg_constraint c
          WHERE c.conrelid = to_regclass('public.' || quote_ident(owner_table))
            AND c.conname = constraint_renames[i + 2]
       ) THEN
      EXECUTE format(
        'ALTER TABLE public.%I RENAME CONSTRAINT %I TO %I',
        owner_table, constraint_renames[i + 1], constraint_renames[i + 2]
      );
    END IF;
  END LOOP;
END $$;--> statement-breakpoint
-- Plain indexes.
DO $$
DECLARE
  index_renames text[] := ARRAY[
    'idx_bcd_quote', 'idx_booking_proposal_details_proposal',
    'idx_bcd_quote_version', 'idx_booking_proposal_details_proposal_version',
    'idx_quote_media_quote', 'idx_proposal_media_proposal',
    'idx_quote_media_quote_sort', 'idx_proposal_media_proposal_sort',
    'idx_quote_participants_quote', 'idx_proposal_participants_proposal',
    'idx_quote_participants_quote_primary', 'idx_proposal_participants_proposal_primary',
    'idx_quote_participants_person', 'idx_proposal_participants_person',
    'uidx_quote_participants_unique', 'uidx_proposal_participants_unique',
    'idx_quote_products_quote', 'idx_proposal_products_proposal',
    'idx_quote_products_quote_created', 'idx_proposal_products_proposal_created',
    'idx_quote_products_product', 'idx_proposal_products_product',
    'idx_quote_products_supplier_service', 'idx_proposal_products_supplier_service',
    'idx_quote_version_lines_version', 'idx_proposal_version_lines_version',
    'idx_quote_version_lines_version_created', 'idx_proposal_version_lines_version_created',
    'idx_quote_version_lines_product', 'idx_proposal_version_lines_product',
    'idx_quote_version_lines_supplier_service', 'idx_proposal_version_lines_supplier_service',
    'idx_quote_versions_quote', 'idx_proposal_versions_proposal',
    'idx_quote_versions_status', 'idx_proposal_versions_status',
    'idx_quote_versions_supersedes', 'idx_proposal_versions_supersedes',
    'idx_quote_versions_trip_snapshot', 'idx_proposal_versions_trip_snapshot',
    'idx_quote_versions_quote_updated', 'idx_proposal_versions_proposal_updated',
    'idx_quote_versions_status_updated', 'idx_proposal_versions_status_updated',
    'idx_quotes_person', 'idx_proposals_person',
    'idx_quotes_org', 'idx_proposals_org',
    'idx_quotes_pipeline', 'idx_proposals_pipeline',
    'idx_quotes_stage', 'idx_proposals_stage',
    'idx_quotes_owner', 'idx_proposals_owner',
    'idx_quotes_status', 'idx_proposals_status',
    'idx_quotes_accepted_version', 'idx_proposals_accepted_version',
    'idx_quotes_person_updated', 'idx_proposals_person_updated',
    'idx_quotes_org_updated', 'idx_proposals_org_updated',
    'idx_quotes_pipeline_updated', 'idx_proposals_pipeline_updated',
    'idx_quotes_stage_updated', 'idx_proposals_stage_updated',
    'idx_quotes_owner_updated', 'idx_proposals_owner_updated',
    'idx_quotes_status_updated', 'idx_proposals_status_updated',
    'idx_quote_proposal_delivery_requests_quote', 'idx_proposal_delivery_requests_proposal',
    'uidx_quote_proposal_delivery_requests_version', 'uidx_proposal_delivery_requests_version',
    'uidx_quote_proposal_delivery_requests_command', 'uidx_proposal_delivery_requests_command',
    'uidx_quote_proposal_delivery_requests_claim', 'uidx_proposal_delivery_requests_claim'
  ];
BEGIN
  FOR i IN 1 .. array_length(index_renames, 1) BY 2 LOOP
    IF to_regclass('public.' || quote_ident(index_renames[i])) IS NOT NULL
       AND to_regclass('public.' || quote_ident(index_renames[i + 1])) IS NULL THEN
      EXECUTE format('ALTER INDEX public.%I RENAME TO %I', index_renames[i], index_renames[i + 1]);
    END IF;
  END LOOP;
END $$;--> statement-breakpoint
-- The default pipeline seeded by the retired `quotes/20260727200000` migration
-- named its third stage "Quote Sent". Relabel it only while it is still exactly
-- the row that migration wrote — an operator who renamed their own stage keeps it.
UPDATE "stages"
   SET "name" = 'Proposal Sent',
       "updated_at" = now()
 WHERE "id" = 'stg_default_quote_sent'
   AND "name" = 'Quote Sent';
--> statement-breakpoint
-- relationships
DO $$
DECLARE
  label_renames text[] := ARRAY[
    'entity_type', 'quote', 'proposal',
    'custom_field_target', 'quote', 'proposal'
  ];
BEGIN
  FOR i IN 1 .. array_length(label_renames, 1) BY 3 LOOP
    IF EXISTS (
      SELECT 1 FROM pg_enum e
        JOIN pg_type t ON t.oid = e.enumtypid
        JOIN pg_namespace n ON n.oid = t.typnamespace
       WHERE n.nspname = 'public'
         AND t.typname = label_renames[i]
         AND e.enumlabel = label_renames[i + 1]
    ) AND NOT EXISTS (
      SELECT 1 FROM pg_enum e
        JOIN pg_type t ON t.oid = e.enumtypid
        JOIN pg_namespace n ON n.oid = t.typnamespace
       WHERE n.nspname = 'public'
         AND t.typname = label_renames[i]
         AND e.enumlabel = label_renames[i + 2]
    ) THEN
      EXECUTE format(
        'ALTER TYPE public.%I RENAME VALUE %L TO %L',
        label_renames[i], label_renames[i + 1], label_renames[i + 2]
      );
    END IF;
  END LOOP;
END $$;
--> statement-breakpoint
-- legal
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_enum e
      JOIN pg_type t ON t.oid = e.enumtypid
      JOIN pg_namespace n ON n.oid = t.typnamespace
     WHERE n.nspname = 'public'
       AND t.typname = 'legal_target_kind'
       AND e.enumlabel = 'quote_version'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_enum e
      JOIN pg_type t ON t.oid = e.enumtypid
      JOIN pg_namespace n ON n.oid = t.typnamespace
     WHERE n.nspname = 'public'
       AND t.typname = 'legal_target_kind'
       AND e.enumlabel = 'proposal_version'
  ) THEN
    ALTER TYPE "public"."legal_target_kind" RENAME VALUE 'quote_version' TO 'proposal_version';
  END IF;
END $$;
--> statement-breakpoint
-- bookings
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'booking_origins'
       AND column_name = 'quote_version_id'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'booking_origins'
       AND column_name = 'proposal_version_id'
  ) THEN
    ALTER TABLE "booking_origins" RENAME COLUMN "quote_version_id" TO "proposal_version_id";
  END IF;

  IF to_regclass('public.idx_booking_origins_quote_version') IS NOT NULL
     AND to_regclass('public.idx_booking_origins_proposal_version') IS NULL THEN
    ALTER INDEX "public"."idx_booking_origins_quote_version"
      RENAME TO "idx_booking_origins_proposal_version";
  END IF;
END $$;--> statement-breakpoint
-- `origin_source` is plain text fenced by a CHECK, so the stored value has to be
-- rewritten. Drop the constraint first: the legacy definition rejects the new
-- value, and the current definition rejects the legacy one.
ALTER TABLE "booking_origins" DROP CONSTRAINT IF EXISTS "ck_booking_origins_source";--> statement-breakpoint
UPDATE "booking_origins"
   SET "origin_source" = 'accepted_proposal_version',
       "updated_at" = now()
 WHERE "origin_source" = 'accepted_quote_version';--> statement-breakpoint
ALTER TABLE "booking_origins" ADD CONSTRAINT "ck_booking_origins_source" CHECK ("booking_origins"."origin_source" IN ('manual', 'direct_b2c', 'accepted_proposal_version', 'catalog_price_availability', 'catalog_snapshot', 'provider_source_order', 'legacy_transaction'));
--> statement-breakpoint
-- mice
DO $$
BEGIN
  IF to_regclass('public.quotes_quote_mice_program') IS NOT NULL
     AND to_regclass('public.proposals_proposal_mice_program') IS NULL THEN
    ALTER TABLE "quotes_quote_mice_program" RENAME TO "proposals_proposal_mice_program";
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'proposals_proposal_mice_program'
       AND column_name = 'quotes_quote_id'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'proposals_proposal_mice_program'
       AND column_name = 'proposals_proposal_id'
  ) THEN
    ALTER TABLE "proposals_proposal_mice_program"
      RENAME COLUMN "quotes_quote_id" TO "proposals_proposal_id";
  END IF;

  IF to_regclass('public.proposals_proposal_mice_program') IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM pg_constraint
        WHERE conrelid = to_regclass('public.proposals_proposal_mice_program')
          AND conname = 'quotes_quote_mice_program_pkey'
     ) THEN
    ALTER TABLE "proposals_proposal_mice_program"
      RENAME CONSTRAINT "quotes_quote_mice_program_pkey" TO "proposals_proposal_mice_program_pkey";
  END IF;
END $$;--> statement-breakpoint
DO $$
DECLARE
  index_renames text[] := ARRAY[
    'quotes_quote_mice_program_pair_idx', 'proposals_proposal_mice_program_pair_idx',
    'quotes_quote_mice_program_l_uniq', 'proposals_proposal_mice_program_l_uniq',
    'quotes_quote_mice_program_r_uniq', 'proposals_proposal_mice_program_r_uniq'
  ];
BEGIN
  FOR i IN 1 .. array_length(index_renames, 1) BY 2 LOOP
    IF to_regclass('public.' || quote_ident(index_renames[i])) IS NOT NULL
       AND to_regclass('public.' || quote_ident(index_renames[i + 1])) IS NULL THEN
      EXECUTE format('ALTER INDEX public.%I RENAME TO %I', index_renames[i], index_renames[i + 1]);
    END IF;
  END LOOP;
END $$;
--> statement-breakpoint
-- custom-fields
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'custom_field_definitions'
       AND column_name = 'entity_type'
       AND data_type = 'text'
  ) THEN
    UPDATE "custom_field_definitions"
       SET "entity_type" = 'proposal',
           "updated_at" = now()
     WHERE "entity_type" = 'quote';
  END IF;
END $$;
--> statement-breakpoint
-- db
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'user_profiles'
       AND column_name = 'permissions'
       AND data_type = 'jsonb'
  ) THEN
    UPDATE "user_profiles"
       SET "permissions" =
             ("permissions" - 'quotes')
             || jsonb_build_object('proposals', "permissions" -> 'quotes')
     WHERE "permissions" IS NOT NULL
       AND jsonb_typeof("permissions") = 'object'
       AND "permissions" ? 'quotes'
       AND NOT ("permissions" ? 'proposals');
  END IF;
END $$;--> statement-breakpoint
-- `apikey.permissions` is TEXT holding JSON written by the auth library. Cast
-- per row inside an exception handler so a row holding something that is not a
-- JSON object is left alone rather than failing the whole migration.
DO $$
DECLARE
  row_id text;
  parsed jsonb;
BEGIN
  IF to_regclass('public.apikey') IS NULL THEN
    RETURN;
  END IF;

  FOR row_id IN SELECT "id" FROM "apikey" WHERE "permissions" IS NOT NULL LOOP
    BEGIN
      SELECT "permissions"::jsonb INTO parsed FROM "apikey" WHERE "id" = row_id;
    EXCEPTION WHEN others THEN
      CONTINUE; -- not JSON; nothing this migration can or should do with it
    END;

    IF parsed IS NOT NULL
       AND jsonb_typeof(parsed) = 'object'
       AND parsed ? 'quotes'
       AND NOT (parsed ? 'proposals') THEN
      UPDATE "apikey"
         SET "permissions" =
               ((parsed - 'quotes') || jsonb_build_object('proposals', parsed -> 'quotes'))::text
       WHERE "id" = row_id;
    END IF;
  END LOOP;
END $$;
