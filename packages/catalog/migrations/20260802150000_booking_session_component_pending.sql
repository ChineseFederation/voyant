ALTER TABLE "booking_sessions" DROP CONSTRAINT "booking_sessions_state";
--> statement-breakpoint
ALTER TABLE "booking_sessions" ADD CONSTRAINT "booking_sessions_state" CHECK ("state" IN ('active', 'supplier_pending', 'component_pending', 'consumed', 'expired', 'abandoned'));
