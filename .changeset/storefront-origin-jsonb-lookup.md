---
"@voyant-travel/auth": patch
---

Resolve a storefront by origin against the jsonb column it actually has.

`resolveStorefrontByOrigin` filtered `storefronts.allowed_origins` as if it were
a Postgres `text[]`: exact matches used `@> ARRAY[$1]::text[]` and the wildcard
candidate scan used `unnest(...)`. The column is declared `jsonb`
(`packages/db/src/schema/iam/storefronts.ts`), and neither `jsonb @> text[]` nor
`unnest(jsonb)` exists, so both statements failed to plan.

Because it is a type error rather than a data condition, it fired on every call
regardless of what was stored — an empty `storefronts` table reproduces it. Any
public storefront request carrying an `Origin` header returned 500, which covers
keyless preflight authorization and origin-resolved storefront reads.

The filters now speak jsonb: `@> $1::jsonb` for exact containment and
`jsonb_array_elements_text(...)` for the wildcard candidate scan. Both were
executed against Postgres rather than reviewed by eye.

`packages/auth/tests/integration/local-storefront.test.ts` already covered this
and already asserted the right thing — it fails with the query error the moment
a database is present. It never ran: the suite is `describe.skipIf(!TEST_DATABASE_URL)`
and the `db-integration` CI lane enumerates its files by hand, with no
`@voyant-travel/auth` entry. That file is now in the lane, so the fix is guarded.
