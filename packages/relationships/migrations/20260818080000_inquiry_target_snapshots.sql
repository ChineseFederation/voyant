CREATE TABLE "inquiry_target_snapshots" (
	"link_id" text PRIMARY KEY NOT NULL,
	"inquiry_id" text NOT NULL,
	"kind" text NOT NULL,
	"target_id" text NOT NULL,
	"snapshot" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "inquiry_target_snapshots" ADD CONSTRAINT "inquiry_target_snapshots_inquiry_id_inquiries_id_fk" FOREIGN KEY ("inquiry_id") REFERENCES "public"."inquiries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_inquiry_target_snapshots_target" ON "inquiry_target_snapshots" USING btree ("inquiry_id","kind","target_id");--> statement-breakpoint
CREATE INDEX "idx_inquiry_target_snapshots_inquiry" ON "inquiry_target_snapshots" USING btree ("inquiry_id","created_at");