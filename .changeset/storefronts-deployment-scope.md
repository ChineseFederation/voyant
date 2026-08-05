---
"@voyant-travel/auth": patch
"@voyant-travel/auth-react": patch
"@voyant-travel/db": patch
---

Make the Storefronts admin surface reachable again.

Storefronts were scoped to a Better Auth operator organization, but the operator
auth realm never creates one — the `organization` plugin is wired for the
customer realm only. So `organization` is empty on every deployment: reads
filtered to nothing, writes failed the `organization_id` foreign key, and the
route rejected the session outright with "No active operator organization." A
tenant could neither create a storefront nor read its keys.

A self-host deployment is the tenant boundary (`docs/adr/0001-tenant-scoping.md`),
so a storefront now belongs to the deployment: `organization_id` is dropped from
`storefronts`, `storefront_api_keys`, and `storefront_customer_auth_credentials`,
the slug is unique per deployment, and `StorefrontDto.organizationId` is gone
from the admin contract. Authorization is unchanged — the `/v1/admin/*` staff
guard and the `storefronts:*` scopes.

Also stops rejecting a trusted origin that carries a path. The env allowlist is
built from `APP_URL`, which is documented and shipped as the API base
(`http://host:3300/api`); an origin check only ever compares origins, so the path
is narrowed away instead of throwing. Rejecting it made every public catalog read
answer 500 with "customer auth trusted origin must be an absolute HTTP(S) origin".
