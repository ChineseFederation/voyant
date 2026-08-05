---
"@voyant-travel/db": patch
---

Backfill unassigned member permission sets with the full access they already
resolve to.

`user_profiles.permissions` is nullable, and null means "no admin has assigned a
scope set yet"; the staff-access resolver reads that as `["*"]`. The migration
writes that same value down explicitly, so nothing changes behaviour today. It
is groundwork: a fail-closed resolver cannot ship until the existing nulls are
gone, and the backfill has to be deployed and verified first.

It is not sufficient on its own — the signup path still inserts a profile
without permissions, so a fresh deployment's first owner is created null again.
