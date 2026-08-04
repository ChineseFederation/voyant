-- Adopt the objects the retired `quotes` module left behind (voyant#4143).
--
-- `quotes` became `proposals` in #4004, and the rename was expressed by editing
-- shipped baselines in place. A deployment provisioned BEFORE that release still
-- holds live rows in `quotes`, `quote_versions` and their satellites, and the
-- proposal-named objects the application queries never come into existence.
--
-- This RENAMES the legacy objects rather than creating new ones: the rows must
-- survive, and every foreign key, index and sequence follows the table it hangs
-- off. Each step is guarded on the legacy name being present AND the new name
-- being free, so the whole migration is a no-op on a database provisioned after
-- the rename (and on a re-run).
--
-- The corresponding cross-module objects are renamed by their OWN packages:
-- `booking_origins.proposal_version_id` (bookings), the `entity_type` /
-- `custom_field_target` labels (relationships), `legal_target_kind`
-- (legal) and the MICE link table (mice).
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
