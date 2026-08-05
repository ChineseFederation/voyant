-- Give every unassigned member the permission set it already resolves to.
--
-- `user_profiles.permissions` is nullable, and `null` means "no admin has
-- assigned a scope set yet". `resolveStaffAccess` reads that as full access
-- (`["*"]`) so that deployments provisioned before member RBAC keep working.
-- This backfill writes that same `["*"]` down explicitly.
--
-- IT CHANGES NO BEHAVIOUR. Every row it touches resolved to `["*"]` before and
-- resolves to `["*"]` after; it only moves the value from the resolver's
-- fallback into the column. It exists so that a LATER release can make the
-- resolver fail closed (and the column NOT NULL) without locking existing
-- members out of their own deployment.
--
-- THIS ALONE DOES NOT MAKE THE COLUMN SAFE TO REQUIRE. Two gaps remain, and
-- both must be closed before any fail-closed change:
--
--   1. Nothing on the write side sets `permissions` at signup.
--      `provisionCurrentUserProfile` inserts a profile without it, so the
--      bootstrap owner of every new deployment is created null again the
--      moment this migration has run.
--   2. `resolveStaffAccess` also falls back when there is no `user_profiles`
--      row at all (`profile?.permissions ?? …`), which no `UPDATE` can reach.
--
-- Deliberately `["*"]` and not the catalog-expanded admin preset: local mode
-- has never expanded the wildcard, and resources marked `explicit-resource`
-- (team, bookings PII, apps) are NOT satisfied by a bare `*`. Expanding here
-- would be a privilege increase, not a migration.
--
-- Guarded on the column's existence and shape, and on `IS NULL`, so a re-run
-- and a database that never had the column are both no-ops.
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
       SET "permissions" = '["*"]'::jsonb
     WHERE "permissions" IS NULL;
  END IF;
END $$;
