# API Tokens

> **Deprecated for `/v1/admin/*`.** A storefront secret key (`vsk_`) now covers
> both published surfaces with a scope grant and a capability line behind it,
> which is what a deployment API key was being used for. The `voy_` path still
> works — self-host deployments consume these packages from npm and cannot be
> migrated on their behalf — but it logs a deprecation on use, and a deployment
> that has finished migrating closes the window with
> `VOYANT_DEPLOYMENT_API_KEY_MODE=disabled`, which stops minting as well as
> authenticating. Admin **sessions** are unaffected,
> as are `voy_` keys with a customer, partner or supplier audience. See
> [`public-api-key-capability-line.md`](./public-api-key-capability-line.md).

Voyant API tokens are Better Auth API keys configured for automation and
cross-runtime integrations. They are intended for CMS sync jobs, storefront
proxies, webhook relays, domain API commands, and other systems that need a
narrow capability without carrying an operator session.

## Ownership

- Better Auth owns key creation, storage, hashing, listing, updates, and
  deletion through the API Key plugin.
- Better Auth `permissions` are the canonical authorization model:

  ```ts
  {
    products: ["read"],
    bookings: ["write"],
  }
  ```

- `@voyant-travel/types/api-keys` owns Voyant's permission descriptor catalog and
  helper functions.
- `@voyant-travel/hono` verifies `voy_` API keys and checks Better Auth
  permissions against route resources.
- `@voyant-travel/auth` exposes the `/auth/api-tokens` management facade used by
  the UI. The facade calls Better Auth's server API because fields such as
  `permissions`, `remaining`, and `enabled` are server-only on the underlying
  API Key plugin HTTP routes.
- `@voyant-travel/auth-react` exposes React Query hooks for token management against
  that facade.
- `@voyant-travel/auth-react/ui` exposes reusable management UI.

API tokens must not become user sessions. Do not enable Better Auth's session
mocking for API keys unless a deployment has a separate, explicit security
review.

## Permission Format

Permissions are Better Auth's `Record<string, string[]>` shape:

```ts
{
  products: ["read", "write"],
  bookings: ["read"],
  webhooks: ["relay"],
}
```

Wildcard permissions are supported:

```ts
{ "*": ["*"] }
{ products: ["*"] }
{ "*": ["read"] }
```

Known permissions include:

- `products: ["read"]`
- `departures: ["read"]`
- `itineraries: ["read"]`
- `catalog: ["read", "search"]`
- `bookings: ["read", "write"]`
- `availability: ["read"]`
- `accommodations: ["read"]`
- `ground: ["read"]`
- `cruises: ["read"]`
- `webhooks: ["relay"]`

The contract is intentionally extensible. New modules can use their module name
as the resource and do not need a central enum change for every custom
permission, though common permissions should be added to the descriptor catalog
so the shared UI can display them.

## Hono Surface Rules

For API-key callers, `requireActor(...)` checks the first path segment after
`/v1/admin/` or `/v1/public/` as the resource and derives the action from the
HTTP method:

- `GET` / `HEAD`: `read` or `search`
- `POST`: `write`, `trigger`, or `relay`
- `PUT` / `PATCH`: `write`
- `DELETE`: `delete`

Examples:

- `GET /v1/public/products` requires `{ products: ["read"] }`,
  `{ products: ["*"] }`, `{ "*": ["read"] }`, or `{ "*": ["*"] }`.
- `POST /v1/admin/webhooks/relay` accepts `{ webhooks: ["relay"] }`.

Session callers still use the normal actor checks. Internal requests still
bypass the actor guard through `isInternalRequest`.

When a `voy_` token authenticates, the auth middleware also sets
`callerType: "api_key"`, `apiTokenId`, the legacy alias `apiKeyId`, and
`scopes` on the request context. Audit-log consumers should record
`apiTokenId` instead of the raw bearer secret.

## Creating Tokens

Use the operator starter's Settings -> API Tokens screen, or call Voyant's
management facade from an authenticated operator session:

```ts
await fetch("/auth/api-tokens", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    name: "CMS content sync",
    expiresIn: 60 * 60 * 24 * 90,
    permissions: {
      products: ["read"],
      departures: ["read"],
      itineraries: ["read"],
    },
  }),
})
```

The returned secret is shown once. Store it in the third-party system or
automation secret store, then use it as:

```http
Authorization: Bearer voy_...
```

## Rotating Tokens

Operators can rotate a token secret without replacing the token record:

```ts
await fetch("/auth/api-tokens/key_123/rotate", {
  method: "POST",
})
```

Rotation returns a new one-time `key` value, preserves the existing token id,
name, permissions, usage counters, and expiration, and updates the stored hash
so the previous secret stops authenticating immediately. The facade appends
non-secret rotation metadata under `metadata.voyant.apiToken`, including the
last rotation timestamp and previous displayed starts. Do not log the returned
secret after handing it to the operator.
