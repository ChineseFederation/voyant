-- Known networks (GetYourGuide, Viator, Voyant Connect, …) are offered as a
-- catalog the operator picks from, not seeded as rows: a `channels` row is a
-- commercial relationship, and pre-creating one per network would fill the
-- counterparty list with companies nobody has contracted with.
--
-- What the row keeps is which catalog entry it came from, so a connector can
-- bind to "the GetYourGuide channel" instead of matching on a display name the
-- operator is free to rename. Named networks only — the partner-type presets
-- (affiliate, reseller, api_partner) prefill a form and never write a key,
-- because an operator has many affiliates and none of them is *the* affiliate.
ALTER TABLE "channels" ADD COLUMN IF NOT EXISTS "preset_key" text;
--> statement-breakpoint
-- Partial and unique: null on every hand-described channel, and at most one row
-- per network, so the key resolves to a row rather than to a list.
CREATE UNIQUE INDEX IF NOT EXISTS "uniq_channels_preset_key"
	ON "channels" ("preset_key")
	WHERE "preset_key" IS NOT NULL;
