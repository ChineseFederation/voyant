-- Retarget custom field definitions from `quote` to `proposal` (voyant#4143).
--
-- `custom_field_definitions.entity_type` is plain TEXT here (this package took
-- authority for it and widened the column off the `custom_field_target` enum),
-- so the enum relabelling in `relationships/20260804000100` does NOT reach the
-- stored values. The registry looks definitions up by exact entity key
-- (`eq(customFieldDefinitions.entityType, entity)`), so a deployment
-- provisioned before the quotes → proposals rename would silently show no
-- custom fields on proposals at all.
--
-- Guarded on the column having actually been widened to text: while it is still
-- the `custom_field_target` enum the relabelling owns the value, and the later
-- `USING entity_type::text` widening carries the new label across. A pre-rename
-- database has no `proposal` definitions (the entity did not exist), so the
-- uniqueness indexes on `(entity_type, key)` cannot collide; if one somehow
-- does, failing loudly is correct.
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
