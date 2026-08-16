---
"@voyant-travel/admin": patch
"@voyant-travel/auth": patch
"@voyant-travel/hono": patch
---

Cut the admin cold-load and per-navigation request budget.

The workspace guard now resolves the authenticated shell bootstrap through the
router's QueryClient. TanStack re-runs `beforeLoad` for every matched route on
every navigation, so the guard's single round trip was being paid again on each
client-side navigation; it is now paid once per session and revalidated in the
background. Shell slices are re-seeded only from a freshly fetched response, so
a navigation no longer overwrites what the shell has since done with them.

`/auth/shell-bootstrap` now claims a capability for any slice the host answered
for, including one it answered with nothing. Resolving "no navigation
preferences stored" used to drop the capability and send the shell asking
`/v1/admin/navigation-preferences` for the same nothing on every page load.

Admin locale narrowing (`en-GB` → `en`) happens on the first render instead of
the one after, so the authenticated tree no longer re-renders — and re-keys
everything derived from the locale — a tick after it mounts.

`/v1/admin/*` GETs returning JSON now carry `ETag` and
`Cache-Control: private, no-cache`, and answer a matching `If-None-Match` with a
bodyless 304, so a repeat navigation revalidates instead of re-downloading. A
route that sets its own `Cache-Control` is left alone.
