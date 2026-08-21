---
"@voyant-travel/auth": patch
"@voyant-travel/i18n": patch
---

Mount the account-profile facade on `PATCH /auth/me`, and name the Inquiries nav
item in both locales.

`handleAccountProfileRequest` was exported, documented and unit-tested, but no
runtime ever mounted it: `/auth/me` was registered `GET`-only, so every
deployment answered 404 to the account-profile write. The admin shell writes
`locale`/`timezone` there whenever someone switches language and reverts the
switch when the write fails, so the language switcher silently snapped back to
English on every attempt — Romanian was unreachable in the operator.

The regression test asks the ROUTER rather than the facade, because a facade
unit test passes whether or not anything mounts it.

`operator-nav.ts` also had no `inquiries` key, so that nav item fell back to a
hardcoded English string in every locale while its siblings translated.
