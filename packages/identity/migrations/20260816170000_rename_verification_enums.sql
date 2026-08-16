-- Rename the verification enum TYPES off the retired storefront entity
-- (voyant#4624 follow-up, voyant#4627).
--
-- The table and its indexes were renamed in
-- `20260814190000_rename_verification_challenges`, but Postgres enum types are
-- separate objects and that migration did not touch them. The columns kept
-- working because a column's type is bound by oid, not by name — so this is the
-- last place the retired word survives in the schema.
--
-- Drizzle derives the enum name from the declaration, so leaving them renamed
-- in code but not in the database would make a fresh replay and an upgraded
-- database disagree, exactly as the index renames would have.
--
-- Pure rename: the oid, its values and every column bound to it are unchanged.

ALTER TYPE "storefront_verification_channel"
  RENAME TO "customer_verification_channel";

ALTER TYPE "storefront_verification_status"
  RENAME TO "customer_verification_status";
