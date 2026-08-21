ALTER TABLE "booking_sessions" ADD COLUMN "owner_buyer_account_id" text;

ALTER TABLE "booking_sessions" ADD COLUMN "owner_buyer_account_kind" text;

ALTER TABLE "booking_sessions" ADD CONSTRAINT "booking_sessions_buyer_account_pair"
CHECK (
  ("owner_buyer_account_id" IS NULL AND "owner_buyer_account_kind" IS NULL)
  OR ("owner_buyer_account_id" IS NOT NULL AND "owner_buyer_account_kind" IN ('personal', 'business'))
);

ALTER TABLE "booking_sessions" ADD CONSTRAINT "booking_sessions_buyer_account_actor"
CHECK ("owner_buyer_account_id" IS NULL OR "actor_kind" = 'customer');
