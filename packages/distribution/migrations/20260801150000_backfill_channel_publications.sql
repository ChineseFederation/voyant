INSERT INTO "channel_product_publications" (
	"id",
	"channel_id",
	"product_id",
	"decision",
	"reason",
	"created_by",
	"updated_by",
	"metadata"
)
SELECT
	'chpp_backfill_' || "channel_product_mappings"."id",
	"channel_product_mappings"."channel_id",
	"channel_product_mappings"."product_id",
	'include',
	'Backfilled from active channel product mapping during publication cutover.',
	'system:migration:20260801150000_backfill_channel_publications',
	'system:migration:20260801150000_backfill_channel_publications',
	jsonb_build_object(
		'source', 'active_channel_product_mapping',
		'mappingId', "channel_product_mappings"."id"
	)
FROM "channel_product_mappings"
WHERE "channel_product_mappings"."active" = true
ON CONFLICT ("channel_id", "product_id") DO NOTHING;
