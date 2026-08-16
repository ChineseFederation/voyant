---
"@voyant-travel/identity": minor
"@voyant-travel/public-api": minor
"@voyant-travel/notifications": patch
"@voyant-travel/operator-standard": patch
---

Move customer verification to `@voyant-travel/identity` (#4627). The
`customer_verification_challenges` table, its three migrations, the schema,
service, public routes and runtime port now belong to the module that owns
customer identity, and `packages/public-api` is left owning no tables at all.

Identity declares `legacyMigrationSources: ["public-api", "storefront"]` — both,
because a deployment ran these under `storefront` before #4649 and under
`public-api` after it, and the runner matches a ledger row on any declared
source. Every migration tag is preserved unchanged, because the tag is the
ledger identity.

The four `start`/`confirm_my_email`/`sms_verification` Tools stay in
`public-api`: they resolve the authenticated customer's own destination through
the customer portal's profile, which composes auth and customer records, so
moving them would have made identity depend on the composition layer above it.

The verification enum types are renamed off the retired storefront entity —
`storefront_verification_channel`/`_status` become `customer_verification_*`.
The table and its indexes were renamed in #4649 but Postgres enum types are
separate objects that migration did not touch.
