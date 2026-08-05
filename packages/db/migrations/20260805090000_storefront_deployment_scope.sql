-- Storefronts belong to the deployment, not to an operator organization.
--
-- The operator auth realm never creates a Better Auth organization (the
-- `organization` plugin is wired for the customer realm only), so `organization`
-- is empty on every operator deployment. Scoping the storefront access model by
-- `organization_id NOT NULL REFERENCES organization(id)` therefore made every
-- insert fail its foreign key and every read filter to nothing, which is why the
-- Storefronts admin surface could neither list nor create (voyant#4261).
--
-- A self-host deployment is the tenant boundary (docs/adr/0001-tenant-scoping.md),
-- so the column carried no authorization meaning it could enforce. Drop it.
ALTER TABLE "storefronts" DROP CONSTRAINT IF EXISTS "storefronts_organization_id_organization_id_fk";--> statement-breakpoint
ALTER TABLE "storefront_api_keys" DROP CONSTRAINT IF EXISTS "storefront_api_keys_organization_id_organization_id_fk";--> statement-breakpoint
ALTER TABLE "storefront_customer_auth_credentials" DROP CONSTRAINT IF EXISTS "storefront_customer_auth_credentials_organization_id_organization_id_fk";--> statement-breakpoint
DROP INDEX IF EXISTS "storefronts_org_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "storefront_api_keys_org_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "storefront_customer_auth_credentials_org_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "storefronts_org_slug_unique";--> statement-breakpoint
ALTER TABLE "storefronts" DROP COLUMN IF EXISTS "organization_id";--> statement-breakpoint
ALTER TABLE "storefront_api_keys" DROP COLUMN IF EXISTS "organization_id";--> statement-breakpoint
ALTER TABLE "storefront_customer_auth_credentials" DROP COLUMN IF EXISTS "organization_id";--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "storefronts_slug_unique" ON "storefronts" USING btree ("slug");
