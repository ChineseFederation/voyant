-- Relabel the `quote` member of the shared entity enums (voyant#4143).
--
-- `entity_type` and `custom_field_target` are owned here and were edited in
-- their shipped baselines when `quotes` became `proposals` (#4004). A deployment
-- provisioned before that release still has the `quote` label, so `pipelines`,
-- `activities` and `custom_field_definitions` carry a value the application no
-- longer knows.
--
-- RENAME VALUE keeps the label's OID, so existing rows AND the column defaults
-- that reference it (`pipelines.entity_type DEFAULT 'quote'`) follow the rename
-- without a rewrite. Guarded on the old label being present and the new one
-- absent, so this is a no-op after the rename and on a re-run.
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
