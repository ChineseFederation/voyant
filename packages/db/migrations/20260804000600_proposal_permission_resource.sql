-- Rename the `quotes` permission resource to `proposals` (voyant#4143).
--
-- Member and API-key permissions are stored as a `{resource: [action, …]}` map:
-- `user_profiles.permissions` as jsonb, `apikey.permissions` as a JSON string.
-- The quotes → proposals rename renamed the resource in the access catalog, and
-- `assertKnownPermissions` REJECTS a resource the catalog does not list — so on
-- a deployment provisioned before the rename every stored grant carrying
-- `quotes` is both ineffective (proposals routes see no grant) and a hard
-- validation error the moment those permissions are re-saved.
--
-- Both statements are guarded on the old key being present and the new one
-- absent, so they are no-ops after the rename and on a re-run.
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
