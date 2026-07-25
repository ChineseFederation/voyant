ALTER TABLE "quote_proposal_delivery_requests" RENAME COLUMN "idempotency_key" TO "id";--> statement-breakpoint
ALTER TABLE "quote_proposal_delivery_requests" ADD COLUMN "command_scope" text;--> statement-breakpoint
ALTER TABLE "quote_proposal_delivery_requests" ADD COLUMN "command_idempotency_key" text;--> statement-breakpoint
ALTER TABLE "quote_proposal_delivery_requests" ADD COLUMN "claim_action_id" text;--> statement-breakpoint
ALTER TABLE "quote_proposal_delivery_requests" ADD COLUMN "organization_id" text;--> statement-breakpoint
ALTER TABLE "quote_proposal_delivery_requests" ADD COLUMN "target_type" text;--> statement-breakpoint
ALTER TABLE "quote_proposal_delivery_requests" ADD COLUMN "target_id" text;--> statement-breakpoint
ALTER TABLE "quote_proposal_delivery_requests" ADD COLUMN "provider" text;--> statement-breakpoint
ALTER TABLE "quote_proposal_delivery_requests" ADD COLUMN "result_snapshot" jsonb;--> statement-breakpoint
UPDATE "quote_proposal_delivery_requests"
SET
	"command_scope" = 'legacy.quotes.snapshot-send',
	"command_idempotency_key" = "id",
	"claim_action_id" = "id",
	"target_type" = 'quote',
	"target_id" = "quote_id",
	"provider" = 'historical-unavailable',
	"result_snapshot" = '{}'::jsonb;--> statement-breakpoint
ALTER TABLE "quote_proposal_delivery_requests" ALTER COLUMN "command_scope" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "quote_proposal_delivery_requests" ALTER COLUMN "command_idempotency_key" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "quote_proposal_delivery_requests" ALTER COLUMN "claim_action_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "quote_proposal_delivery_requests" ALTER COLUMN "target_type" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "quote_proposal_delivery_requests" ALTER COLUMN "target_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "quote_proposal_delivery_requests" ALTER COLUMN "provider" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "quote_proposal_delivery_requests" ALTER COLUMN "result_snapshot" SET NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "uidx_quote_proposal_delivery_requests_command" ON "quote_proposal_delivery_requests" USING btree ("command_scope","command_idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "uidx_quote_proposal_delivery_requests_claim" ON "quote_proposal_delivery_requests" USING btree ("claim_action_id");
