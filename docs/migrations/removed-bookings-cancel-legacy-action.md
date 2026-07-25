# Removed the `bookings:cancel` legacy permission

## TL;DR

- `bookings:cancel` is no longer a known or mintable API-key/staff permission.
  The Bookings access resource now advertises only `bookings:read`,
  `bookings:write`, and explicit `bookings-pii:read`.
- Cancelling a booking has always required `bookings:write` — the
  `cancel_booking` Tool's `requiredScopes` was never `bookings:cancel`. Runtime
  enforcement for cancellation does not change.
- API keys or staff roles that were minted with an explicit `bookings:cancel`
  grant keep that string stored, but it no longer matches anything at
  enforcement time and can no longer be re-granted through the permission
  editor or API-key creation. Re-grant `bookings:write` instead if the actor
  needs to cancel bookings.
- No database schema migration is required.
- `@voyant-travel/operator-standard` is bumped major alongside Bookings
  because it distributes the Bookings access catalog to the standard Operator
  graph.

## Removed exports

None. This is a data-only change to the Bookings package's selected access
catalog (`packages/bookings/src/voyant.ts`) — the `legacyActions: ["cancel"]`
entry on the `bookings` resource was removed. No TypeScript symbol, route, or
Tool was removed.

## HTTP route changes

None.

## Hook signature changes

None.

## Caller-code migrations

Before, an API key or staff role could be minted with `bookings:cancel` as a
(non-functional) legacy alias:

```ts
await createApiKey({
  permissions: { bookings: ["read", "write", "cancel"] },
})
```

After, mint `bookings:write` only — it already covers cancellation:

```ts
await createApiKey({
  permissions: { bookings: ["read", "write"] },
})
```

Any caller that checks `hasApiKeyPermission(permissions, "bookings", "cancel")`
should check `bookings:write` instead; `bookings:cancel` never had independent
enforcement.

## Per-package CHANGELOG links

- [`@voyant-travel/bookings`](../../packages/bookings/CHANGELOG.md)
- [`@voyant-travel/bookings-react`](../../packages/bookings-react/CHANGELOG.md)
- [`@voyant-travel/operator-standard`](../../packages/operator-standard/CHANGELOG.md)
