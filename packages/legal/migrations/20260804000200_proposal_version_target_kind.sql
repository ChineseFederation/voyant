-- Relabel `legal_target_kind.quote_version` (voyant#4143).
--
-- The enum is owned here and its shipped baseline was edited when `quotes`
-- became `proposals` (#4004). A deployment provisioned before that release still
-- has the `quote_version` label, so any legal document attached to a proposal
-- version carries a target kind the application no longer knows.
--
-- RENAME VALUE keeps the label's OID, so existing rows follow without a rewrite.
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
