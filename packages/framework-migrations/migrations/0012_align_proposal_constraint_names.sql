-- Bring the NOT NULL constraint names across the rename too (voyant#4148).
--
-- The framework bundle is the standard profile's own migration source, so it
-- carries the same alignment the package sources ship as their own post-cutline
-- increments. Both are derived and guarded, so a deployment that runs BOTH paths
-- converges to the same schema and the second pass changes nothing.
--
-- `0011` renames the tables, columns, enum types, indexes, primary keys and
-- foreign keys the retired module left behind. It does not reach the NOT NULL
-- constraints: `ALTER TABLE ... RENAME` never renames a constraint, and
-- PostgreSQL 18 catalogues one per NOT NULL column in `pg_constraint`. A
-- deployment repaired by `0011` therefore keeps those names on the retired
-- vocabulary while a freshly provisioned one has them on the current one — two
-- populations whose schemas are equivalent but not identical, which is the
-- condition voyant#4143 came out of.
--
-- The target name is DERIVED rather than enumerated. PostgreSQL builds it as
-- makeObjectName(table, column, 'not_null'): join the two with an underscore,
-- append the label, and while the result would exceed the 63-byte identifier
-- limit, shave a character off whichever of the two is longer. Reproducing that
-- lands exactly the name a fresh provision has, including the truncated ones,
-- and keeps following the tables if they are ever renamed again.
--
-- PostgreSQL 16 and 17 do not catalogue NOT NULL constraints at all, so the
-- query simply returns nothing there. Guarded on the derived name being free, so
-- this is a no-op on an already-aligned database and on a re-run.
-- proposals
DO $$
DECLARE
  -- Addressed by their POST-rename names: the `0011` renames have already run.
  owned_tables text[] := ARRAY[
    'proposals',
    'proposal_versions',
    'proposal_participants',
    'proposal_products',
    'proposal_version_lines',
    'proposal_media',
    'proposal_delivery_requests',
    'booking_proposal_details'
  ];
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
END $$;--> statement-breakpoint
-- One foreign key `0011` addressed by a name the database never held.
--
-- Its generated name is longer than the 63-byte identifier limit, so what
-- PostgreSQL actually stored was the truncated form — the rename matched
-- nothing and silently did nothing. A freshly provisioned deployment holds the
-- truncated form of the CURRENT name, so that is the target here.
--
-- Located by shape rather than by its old name, which is the only way to be
-- sure of the exact bytes truncation left behind.
DO $$
DECLARE
  target_name constant text := left(
    'proposal_delivery_requests_proposal_version_id_proposal_versions_id_fk', 63
  );
  current_name text;
BEGIN
  IF to_regclass('public.proposal_delivery_requests') IS NULL
     OR to_regclass('public.proposal_versions') IS NULL THEN
    RETURN;
  END IF;

  SELECT c.conname INTO current_name
    FROM pg_constraint c
   WHERE c.conrelid = to_regclass('public.proposal_delivery_requests')
     AND c.contype = 'f'
     AND c.confrelid = to_regclass('public.proposal_versions')
     AND pg_get_constraintdef(c.oid) LIKE 'FOREIGN KEY (proposal_version_id)%'
   LIMIT 1;

  IF current_name IS NOT NULL
     AND current_name <> target_name
     AND NOT EXISTS (
       SELECT 1 FROM pg_constraint existing
        WHERE existing.conrelid = to_regclass('public.proposal_delivery_requests')
          AND existing.conname = target_name
     ) THEN
    EXECUTE format(
      'ALTER TABLE public.proposal_delivery_requests RENAME CONSTRAINT %I TO %I',
      current_name, target_name
    );
  END IF;
END $$;--> statement-breakpoint
-- mice
DO $$
DECLARE
  -- Addressed by its POST-rename name: the `0011` renames have already run.
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
