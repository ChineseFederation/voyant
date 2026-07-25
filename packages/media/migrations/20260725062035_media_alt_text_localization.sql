CREATE TABLE "media_asset_translation" (
	"asset_id" text NOT NULL,
	"language_tag" text NOT NULL,
	"alt_text" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pk_media_asset_translation" PRIMARY KEY("asset_id","language_tag")
);
--> statement-breakpoint
ALTER TABLE "media_asset" ADD COLUMN "default_language_tag" text DEFAULT 'en' NOT NULL;--> statement-breakpoint
ALTER TABLE "media_asset" ADD COLUMN "url" text;--> statement-breakpoint
ALTER TABLE "media_asset_translation" ADD CONSTRAINT "media_asset_translation_asset_id_media_asset_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."media_asset"("id") ON DELETE cascade ON UPDATE no action;
