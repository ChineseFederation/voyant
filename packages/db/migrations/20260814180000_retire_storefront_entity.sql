-- Retire the storefront entity (voyant#4624).
--
-- The row modelled a multiplicity that does not exist: a deployment IS the
-- tenant boundary (ADR-0001) and multi-brand-per-deployment is explicitly not
-- happening, so what the storefront carried splits between the two things that
-- genuinely vary — the KEY (origins, channel, cookie scope) and the DEPLOYMENT
-- (customer-account methods, policy, OAuth credentials).
--
-- Key ids are copied verbatim. A `sfk_`-prefixed id stays `sfk_` in
-- `public_api_keys` even though newly minted rows get `pak_`: the id is opaque
-- and a key's identity is what an operator has already recorded elsewhere.
-- Rewriting it would rotate every key by another name, which the issue rules
-- out.

-- 1. The key becomes the unit -------------------------------------------------

CREATE TABLE IF NOT EXISTS "public_api_keys" (
  "id" text PRIMARY KEY NOT NULL,
  "kind" text NOT NULL,
  "scopes" jsonb,
  "token_hash" text NOT NULL,
  "token_preview" text NOT NULL,
  "name" text,
  "allowed_origins" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "channel_id" text,
  "host_only_cookies" boolean DEFAULT true NOT NULL,
  "last_used_at" timestamp with time zone,
  "revoked_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

-- Origins, cookie scope and the channel come down from the storefront the key
-- hung off. The channel is read from the storefront->channel link pivot; a
-- storefront with no explicit binding leaves it NULL, which resolves to the
-- deployment's Direct channel (voyant#4633) — the same answer it got before.
--
-- `DISTINCT ON` and not a bare join: the pivot is declared `isList: true`, so a
-- storefront with two binding rows would otherwise duplicate its keys. The
-- runtime treated multiple bindings as an error and refused to serve; taking
-- the oldest keeps the key working rather than dropping it on the floor.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema = 'public' AND table_name = 'storefront_api_keys') THEN
    INSERT INTO "public_api_keys" (
      "id", "kind", "scopes", "token_hash", "token_preview", "name",
      "allowed_origins", "channel_id", "host_only_cookies",
      "last_used_at", "revoked_at", "created_at", "updated_at"
    )
    SELECT
      k."id",
      k."kind",
      k."scopes",
      k."token_hash",
      k."token_preview",
      COALESCE(k."name", s."name"),
      COALESCE(s."allowed_origins", '[]'::jsonb),
      b."channel_id",
      COALESCE(s."host_only_cookies", true),
      k."last_used_at",
      k."revoked_at",
      k."created_at",
      k."updated_at"
    FROM "storefront_api_keys" k
    LEFT JOIN "storefronts" s ON s."id" = k."storefront_id"
    LEFT JOIN LATERAL (
      SELECT l."channel_id"
      FROM "auth_storefront_distribution_channel" l
      WHERE l."storefront_id" = k."storefront_id"
      ORDER BY l."created_at", l."channel_id"
      LIMIT 1
    ) b ON true
    ON CONFLICT DO NOTHING;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "public_api_keys_token_hash_unique"
  ON "public_api_keys" ("token_hash");
CREATE INDEX IF NOT EXISTS "public_api_keys_channel_idx"
  ON "public_api_keys" ("channel_id");

-- 2. Customer accounts belong to the deployment -------------------------------

CREATE TABLE IF NOT EXISTS "customer_account_settings" (
  "id" text PRIMARY KEY NOT NULL,
  "singleton" boolean DEFAULT true NOT NULL,
  "methods" jsonb NOT NULL,
  "account_policy" jsonb DEFAULT '{"allowedKinds":["personal"],"personalSignup":"open","businessOnboarding":"disabled"}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "customer_account_settings_singleton_unique"
  ON "customer_account_settings" ("singleton");

-- The oldest storefront's configuration wins. A deployment that only ever had
-- one — which the issue argues is all of them — is unaffected by the tie-break;
-- one that hand-created a second is served the config its customers have been
-- signing in against for longest, rather than whichever row sorted first.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema = 'public' AND table_name = 'storefronts') THEN
    INSERT INTO "customer_account_settings" ("id", "singleton", "methods", "account_policy")
    SELECT
      'cast_' || substr(md5(random()::text || clock_timestamp()::text), 1, 26),
      true,
      s."methods",
      s."account_policy"
    FROM "storefronts" s
    ORDER BY s."created_at", s."id"
    LIMIT 1
    ON CONFLICT ("singleton") DO NOTHING;
  END IF;
END $$;

-- A deployment with no storefront at all still needs a row, or the first read
-- of the customer-account policy has to invent one. Methods default to the
-- email pair: it is the configuration that needs no operator secrets, so it is
-- the only one that can be correct without asking.
INSERT INTO "customer_account_settings" ("id", "singleton", "methods")
SELECT
  'cast_' || substr(md5(random()::text || clock_timestamp()::text), 1, 26),
  true,
  '{"emailCode":true,"emailPassword":true,"google":false,"facebook":false,"apple":false}'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM "customer_account_settings")
ON CONFLICT ("singleton") DO NOTHING;

CREATE TABLE IF NOT EXISTS "customer_account_credentials" (
  "id" text PRIMARY KEY NOT NULL,
  "provider" text NOT NULL,
  "encrypted_credentials" jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "customer_account_credentials_provider_unique"
  ON "customer_account_credentials" ("provider");

-- One credential bundle per provider now, so a deployment with two storefronts
-- configuring the same provider has to collapse.
--
-- The credential must come from the SAME storefront whose methods and policy won
-- `customer_account_settings` above, or a deployment ends up advertising one
-- storefront's enabled providers while holding another's OAuth client — social
-- sign-in then fails against a client id the operator never associated with
-- those settings. Ranking by credential age alone does not give that: the
-- losing storefront's credential may well be the older row.
--
-- `IS NOT DISTINCT FROM` rather than `=`: with no storefronts at all the
-- sub-select is NULL, `x = NULL` is NULL, and a DESC sort puts NULLs FIRST —
-- the same trap the Direct-channel lookup hit in voyant#4633.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema = 'public'
               AND table_name = 'storefront_customer_auth_credentials') THEN
    INSERT INTO "customer_account_credentials" ("id", "provider", "encrypted_credentials", "created_at", "updated_at")
    SELECT DISTINCT ON (c."provider")
      c."id",
      c."provider",
      c."encrypted_credentials",
      c."created_at",
      c."updated_at"
    FROM "storefront_customer_auth_credentials" c
    ORDER BY
      c."provider",
      (c."storefront_id" IS NOT DISTINCT FROM
        (SELECT s."id" FROM "storefronts" s ORDER BY s."created_at", s."id" LIMIT 1)) DESC,
      c."created_at",
      c."id"
    ON CONFLICT ("provider") DO NOTHING;
  END IF;
END $$;

-- 3. The entity goes ----------------------------------------------------------

DROP TABLE IF EXISTS "auth_storefront_distribution_channel";
DROP TABLE IF EXISTS "storefront_customer_auth_credentials";
DROP TABLE IF EXISTS "storefront_api_keys";
DROP TABLE IF EXISTS "storefronts";
