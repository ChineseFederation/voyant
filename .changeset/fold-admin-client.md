---
"@voyant-travel/admin-react": minor
"@voyant-travel/admin-contracts": patch
---

Fold `@voyant-travel/admin-client` into `@voyant-travel/admin-react`.

The client was a single-export package whose only consumer was `admin-react`,
which already re-exported all of it — so the split cost a package and a
published version line without giving anyone a smaller surface to depend on.

Its modules now live at `@voyant-travel/admin-react/client`, and the root export
is unchanged: everything previously reachable from `@voyant-travel/admin-react`
still is, including the `@voyant-travel/admin-contracts` surface the client
re-exported.

**`@voyant-travel/admin-client` will no longer be published.** Anything importing
it should import `@voyant-travel/admin-react` (same surface) or
`@voyant-travel/admin-react/client` for just the HTTP client and auth.
