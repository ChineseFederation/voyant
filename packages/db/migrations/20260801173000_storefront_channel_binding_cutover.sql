CREATE TABLE IF NOT EXISTS "auth_storefront_distribution_channel" (
	"id" text PRIMARY KEY NOT NULL,
	"storefront_id" text NOT NULL,
	"channel_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "auth_storefront_distribution_channel_pair_idx"
	ON "auth_storefront_distribution_channel" ("storefront_id", "channel_id")
	WHERE "deleted_at" IS NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "auth_storefront_distribution_channel_l_uniq"
	ON "auth_storefront_distribution_channel" ("storefront_id")
	WHERE "deleted_at" IS NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "auth_storefront_distribution_channel_r_idx"
	ON "auth_storefront_distribution_channel" ("channel_id")
	WHERE "deleted_at" IS NULL;
--> statement-breakpoint
DO $$
BEGIN
	IF EXISTS (
		WITH origins AS (
			SELECT
				s.id AS storefront_id,
				origin.value AS origin
			FROM "storefronts" s
			CROSS JOIN LATERAL jsonb_array_elements_text(s.allowed_origins) AS origin(value)
		)
		SELECT 1
		FROM origins left_origin
		JOIN origins right_origin
			ON left_origin.storefront_id < right_origin.storefront_id
		WHERE
			left_origin.origin = right_origin.origin
			OR (
				left_origin.origin LIKE 'https://*.%'
				AND right_origin.origin NOT LIKE 'https://*.%'
				AND split_part(substring(right_origin.origin from 9), ':', 1)
					LIKE '%.' || substring(left_origin.origin from 11)
				AND strpos(
					left(
						split_part(substring(right_origin.origin from 9), ':', 1),
						length(split_part(substring(right_origin.origin from 9), ':', 1))
							- length(substring(left_origin.origin from 11)) - 1
					),
					'.'
				) = 0
			)
			OR (
				right_origin.origin LIKE 'https://*.%'
				AND left_origin.origin NOT LIKE 'https://*.%'
				AND split_part(substring(left_origin.origin from 9), ':', 1)
					LIKE '%.' || substring(right_origin.origin from 11)
				AND strpos(
					left(
						split_part(substring(left_origin.origin from 9), ':', 1),
						length(split_part(substring(left_origin.origin from 9), ':', 1))
							- length(substring(right_origin.origin from 11)) - 1
					),
					'.'
				) = 0
			)
			OR (
				left_origin.origin LIKE 'https://*.%'
				AND right_origin.origin LIKE 'https://*.%'
				AND replace(left_origin.origin, 'https://*.', '') = replace(right_origin.origin, 'https://*.', '')
			)
	) THEN
		RAISE EXCEPTION 'storefront allowed origins overlap across storefronts';
	END IF;
END $$;
