-- Rename the proposal ⇄ MICE-programme link table (voyant#4143).
--
-- Link tables are named from the two linkables they join, so `quotes.quote`
-- becoming `proposals.proposal` (#4004) renamed the table and its left-hand
-- column. The standard-links migration was edited in place, so a deployment
-- provisioned before that release still has `quotes_quote_mice_program` while
-- the link service resolves `proposals_proposal_mice_program`.
--
-- Guarded end to end: a no-op on a database provisioned after the rename and on
-- a re-run.
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
