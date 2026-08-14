-- The Direct channel becomes a thing the deployment owns rather than a
-- counterparty the operator has to invent.
--
-- Publication is default-deny per channel, and every public catalog read
-- resolves a channel before it answers, so serving your own website used to
-- require hand-creating a row in `channels` — a table of commercial
-- counterparties, sitting next to `suppliers`, with contracts and rate limits —
-- that represents yourself. Nothing provisioned it, so the surface 403ed until
-- someone did (voyant#4624, voyant#4323).
--
-- `system_key` marks the rows the deployment provisions for itself. It is a
-- column and not a `metadata` key because the marker has to be unforgeable:
-- `deleteChannel` and the status guard refuse on it, and `metadata` is editable
-- through the ordinary channel PATCH.
ALTER TABLE "channels" ADD COLUMN IF NOT EXISTS "system_key" text;
--> statement-breakpoint
-- Partial: null on every operator-created channel, so only the one system row
-- per key is constrained.
CREATE UNIQUE INDEX IF NOT EXISTS "uniq_channels_system_key"
	ON "channels" ("system_key")
	WHERE "system_key" IS NOT NULL;
--> statement-breakpoint
DO $$
DECLARE
	adopted_id text;
BEGIN
	-- Already provisioned (re-run, or a deployment that arrived here twice).
	IF EXISTS (SELECT 1 FROM "channels" WHERE "system_key" = 'direct') THEN
		RETURN;
	END IF;

	-- Adopt before inserting. `channel_product_mappings` and the publication
	-- rules are keyed by channel id, and storefront->channel bindings point at
	-- one specific row, so minting a fresh channel next to an existing `direct`
	-- one would silently unpublish everything already published and leave every
	-- binding pointing at a channel the public surface no longer resolves to.
	--
	-- Preference order:
	--   1. the row the storefront-channel-binding setup cutover created — ours,
	--      so it is safe to rename from "Storefront Direct" to "Direct"
	--   2. the oldest active `direct` channel — the operator's own
	--      self-representing counterparty, exactly the row this work retires.
	--      Keep its name; it is theirs, and the id is what everything points at.
	SELECT "id" INTO adopted_id
	FROM "channels"
	WHERE "id" = 'chan_storefront_direct'
		AND "kind" = 'direct'
	LIMIT 1;

	IF adopted_id IS NOT NULL THEN
		UPDATE "channels"
		SET "system_key" = 'direct',
			"name" = 'Direct',
			"description" = 'Everything you sell through yourself — your website, the booking engine, the customer portal, and anything built on the Public API.',
			"status" = 'active',
			"updated_at" = now()
		WHERE "id" = adopted_id;
		RETURN;
	END IF;

	SELECT "id" INTO adopted_id
	FROM "channels"
	WHERE "kind" = 'direct'
		AND "status" = 'active'
	ORDER BY "created_at", "id"
	LIMIT 1;

	IF adopted_id IS NOT NULL THEN
		UPDATE "channels"
		SET "system_key" = 'direct',
			"updated_at" = now()
		WHERE "id" = adopted_id;
		RETURN;
	END IF;

	INSERT INTO "channels" ("id", "name", "description", "kind", "status", "system_key")
	VALUES (
		'chan_system_direct',
		'Direct',
		'Everything you sell through yourself — your website, the booking engine, the customer portal, and anything built on the Public API.',
		'direct',
		'active',
		'direct'
	)
	ON CONFLICT ("id") DO NOTHING;
END $$;
