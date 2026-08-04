-- Bring the link table's NOT NULL constraint names across the rename (voyant#4148).
--
-- `20260804000400` renames the table, its left-hand column, its primary key and
-- its indexes. It does not reach the NOT NULL constraints: `ALTER TABLE ...
-- RENAME` never renames a constraint, and PostgreSQL 18 catalogues one per NOT
-- NULL column in `pg_constraint`. A deployment repaired by that migration
-- therefore keeps those names on the retired vocabulary while a freshly
-- provisioned one has them on the current one.
--
-- The target name is DERIVED rather than enumerated. PostgreSQL builds it as
-- makeObjectName(table, column, 'not_null'): join the two with an underscore,
-- append the label, and while the result would exceed the 63-byte identifier
-- limit, shave a character off whichever of the two is longer. Reproducing that
-- lands exactly the name a fresh provision has, including the truncated ones.
--
-- PostgreSQL 16 and 17 do not catalogue NOT NULL constraints at all, so the
-- query simply returns nothing there. Guarded on the derived name being free, so
-- this is a no-op on an already-aligned database and on a re-run.
DO $$
DECLARE
  -- Addressed by its POST-rename name: `20260804000400` has already run.
  owned_tables text[] := ARRAY['proposals_proposal_mice_program'];
  -- NAMEDATALEN - 1, less the separating underscore and the '_not_null' label.
  budget constant int := 63 - 1 - length('_not_null');
  candidate record;
  table_chars int;
  column_chars int;
  derived_name text;
BEGIN
  FOR candidate IN
    SELECT rel.oid AS table_oid, rel.relname AS table_name, c.conname, att.attname AS column_name
      FROM pg_constraint c
      JOIN pg_class rel ON rel.oid = c.conrelid
      JOIN pg_namespace n ON n.oid = rel.relnamespace
      JOIN pg_attribute att ON att.attrelid = c.conrelid AND att.attnum = c.conkey[1]
     WHERE n.nspname = 'public'
       AND c.contype = 'n'
       AND array_length(c.conkey, 1) = 1
       AND rel.relname = ANY (owned_tables)
  LOOP
    table_chars := length(candidate.table_name);
    column_chars := length(candidate.column_name);
    WHILE table_chars + column_chars > budget LOOP
      IF table_chars > column_chars THEN
        table_chars := table_chars - 1;
      ELSE
        column_chars := column_chars - 1;
      END IF;
    END LOOP;
    derived_name :=
      left(candidate.table_name, table_chars)
      || '_' || left(candidate.column_name, column_chars)
      || '_not_null';

    IF candidate.conname <> derived_name
       AND NOT EXISTS (
         SELECT 1 FROM pg_constraint existing
          WHERE existing.conrelid = candidate.table_oid
            AND existing.conname = derived_name
       ) THEN
      EXECUTE format(
        'ALTER TABLE public.%I RENAME CONSTRAINT %I TO %I',
        candidate.table_name, candidate.conname, derived_name
      );
    END IF;
  END LOOP;
END $$;
