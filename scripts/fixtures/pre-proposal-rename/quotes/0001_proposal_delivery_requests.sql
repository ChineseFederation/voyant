CREATE TABLE "quote_proposal_delivery_requests" (
	"idempotency_key" text PRIMARY KEY NOT NULL,
	"request_fingerprint" text NOT NULL,
	"quote_id" text NOT NULL,
	"quote_version_id" text NOT NULL,
	"proposal_url" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	CONSTRAINT "quote_proposal_delivery_requests_quote_id_quotes_id_fk" FOREIGN KEY ("quote_id") REFERENCES "public"."quotes"("id") ON DELETE cascade ON UPDATE no action,
	CONSTRAINT "quote_proposal_delivery_requests_quote_version_id_quote_versions_id_fk" FOREIGN KEY ("quote_version_id") REFERENCES "public"."quote_versions"("id") ON DELETE cascade ON UPDATE no action
);--> statement-breakpoint
CREATE INDEX "idx_quote_proposal_delivery_requests_quote" ON "quote_proposal_delivery_requests" USING btree ("quote_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "uidx_quote_proposal_delivery_requests_version" ON "quote_proposal_delivery_requests" USING btree ("quote_version_id");
