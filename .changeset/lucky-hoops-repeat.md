---
"@voyant-travel/operator-standard": patch
"@voyant-travel/auth-react": patch
---

Fix operator admin sign-in posting to the wrong auth realm.

The admin shell scoped its auth fetcher to the `/auth/admin` Better Auth realm,
but then rendered `VoyantAvailabilityProvider` in its child-provider list. Every
`Voyant<Domain>Provider` is an alias of the one `VoyantReactProvider`, so that
replaced the shell's `{ baseUrl, fetcher }` for the whole tree and every
auth-react call fell back to the realm-less `/api/auth/*` surface — sign-in,
sign-up, and password reset all 404'd. The provider is redundant (domain hooks
read the shell's context directly) and is gone; a `verify:symbol-policy` rule
keeps any provider alias out of the operator shell.

`createAuthBasePathFetcher` now takes `sharedPaths`, so the paths the deployment
serves itself — `/auth/me`, `/auth/status`, `/auth/bootstrap-status`,
`/auth/api-tokens`, `/auth/organization/list-members` — stay on the shared
prefix instead of being rewritten onto the realm.
