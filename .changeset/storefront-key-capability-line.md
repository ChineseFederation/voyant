---
"@voyant-travel/accommodations": minor
"@voyant-travel/auth": minor
"@voyant-travel/auth-react": minor
"@voyant-travel/bookings": minor
"@voyant-travel/catalog": minor
"@voyant-travel/charters": minor
"@voyant-travel/commerce": minor
"@voyant-travel/core": minor
"@voyant-travel/cruises": minor
"@voyant-travel/db": minor
"@voyant-travel/finance": minor
"@voyant-travel/framework": minor
"@voyant-travel/graph-contracts": minor
"@voyant-travel/hono": minor
"@voyant-travel/inventory": minor
"@voyant-travel/legal": minor
"@voyant-travel/operator-settings": minor
"@voyant-travel/proposals": minor
"@voyant-travel/public-document-delivery": minor
"@voyant-travel/realtime": minor
"@voyant-travel/storefront": minor
"@voyant-travel/trips": minor
"@voyant-travel/types": minor
---

Enforce the PK/SK capability line on the public API, and give secret keys scopes.

`vpk_`/`vsk_` existed at issuance, in storage and on an admin label, and nothing
branched on them for authorization: no route required a secret key and none was
denied to a publishable one, so a leaked `vpk_` could commit bookings and open
payment sessions — bounded only by an `Origin` header, which any non-browser
client sets freely.

- Every `/v1/public/*` API bundle now declares `publishable` (and
  `guardedIntake`, for routes that capture person data with nothing challenging
  the submitter). One middleware enforces it, and **an undeclared route is
  secret-key-only** — silence is a denial, not an omission.
- Every published operation carries `x-voyant-key-kind: publishable | secret`,
  derived from the same declaration the middleware reads.
- Origin handling is split by kind: a publishable key still requires an origin
  (it is the only thing narrowing where a browser-resident credential may be
  used); a secret key no longer does, so a genuine server-to-server caller can
  use the API without a BFF forwarding a synthetic header. An origin that IS
  presented is still checked, whichever kind sent it. Dynamic CORS applies to
  the publishable path only.
- A secret key now authenticates `/v1/admin/*` and carries a scope grant in the
  deployment's own access-catalog vocabulary, defaulting to a commerce-shaped
  set at mint. `{"*": ["*"]}` is an explicit opt-in and is called out in the
  admin surface.
- The `voy_` deployment API key on `/v1/admin/*` is deprecated. It still works
  and now logs on use; close the window with
  `VOYANT_DEPLOYMENT_API_KEY_MODE=disabled`, which stops minting as well as
  authenticating. Admin sessions are unaffected, as are `voy_` keys with a
  customer, partner or supplier audience.

**Breaking for custom public routes.** A deployment-authored `ApiModule` that
mounts `/v1/public/*` routes must declare `publishable` for browser clients to
reach them; without it the routes are secret-key-only. First-party modules are
already declared. See `docs/architecture/storefront-key-capability-line.md`.
