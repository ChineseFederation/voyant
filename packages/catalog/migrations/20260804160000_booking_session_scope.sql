-- The v1 Booking Session had no commercial or presentation scope. Quoting
-- hardcoded `{ locale: "en", audience: "customer", market: "default" }`, so
-- every Session priced in the default market and rendered English requirement
-- labels regardless of who was shopping. Scope now rides the Session.
--
-- Existing rows really were quoted at those hardcoded values, so backfilling
-- them records what actually happened instead of inventing a scope.
ALTER TABLE "booking_sessions" ADD COLUMN "locale" text NOT NULL DEFAULT 'en';
--> statement-breakpoint
ALTER TABLE "booking_sessions" ADD COLUMN "market" text NOT NULL DEFAULT 'default';
--> statement-breakpoint
ALTER TABLE "booking_sessions" ADD COLUMN "currency" text;
--> statement-breakpoint
-- The defaults exist only to backfill the rows above. A new Session must state
-- its own scope, so drop them once the columns are populated.
ALTER TABLE "booking_sessions" ALTER COLUMN "locale" DROP DEFAULT;
--> statement-breakpoint
ALTER TABLE "booking_sessions" ALTER COLUMN "market" DROP DEFAULT;
