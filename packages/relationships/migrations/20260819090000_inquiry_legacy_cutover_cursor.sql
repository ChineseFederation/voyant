CREATE TABLE "inquiry_legacy_cutover_cursors" (
	"source_table" text PRIMARY KEY NOT NULL,
	"last_source_id" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
