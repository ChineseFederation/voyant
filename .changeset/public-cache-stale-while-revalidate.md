---
"@voyant-travel/hono": minor
"@voyant-travel/db": patch
---

Honour `stale-while-revalidate`, make the declared TTL authoritative, and stop
letting one lapse hand the origin latency to every arrival at once.

`publicResponseCache` parsed only `public` and `s-maxage`. Every route that
declared a `stale-while-revalidate` — inventory, commerce, storefront, legal,
cruises, charters — was declaring it to nothing: the entry hard-expired and the
next arrival paid the full uncached cost. With a slow query behind it, that is
an outage rather than a slow request, which is what happened in production.

**Freshness now lives on the entry.** `freshUntil`/`staleUntil` are stored with
the response, and the backend's own expiry is only a storage lifetime. So the
declared `s-maxage` is what is in force regardless of Cloudflare KV's 60-second
floor or the in-process L1's 60-second promotion cap — neither can shorten or
lengthen a route's policy any more.

**An entry inside its stale window is served immediately.** One arrival is
elected to refresh it and every other arrival is served the stored copy without
waiting. If the elected one abandons its request, the lease expires and the next
arrival retries, so the entry is never left unrepopulated while everyone waits
on it. Election goes through `KVStore.putIfAbsent` where the backend supports
it, and falls back to per-isolate exclusion where it does not.

The refresh runs in the requesting handler rather than behind the response,
because Hono discards a route response once the context is finalized — a refresh
scheduled after the middleware returns would re-store the stale body under a new
freshness stamp and produce an entry that looks refreshed and never changes.

**Concurrent cold misses on one key collapse onto one origin computation**
within the isolate.

Also fixes two defects in `@voyant-travel/db`'s Postgres runtime stores, both
found by running their integration tests for the first time:

- `expires_at` was bound as a `Date`, which the postgres.js adapter cannot
  serialize through a raw `sql` template. Every TTL'd write threw, and the
  response cache's best-effort catch swallowed it — so a deployment selecting
  `cache: "postgres"` had a shared response cache that silently stored nothing.
- `createPostgresFixedWindowRateLimitStore` used the reserved word `window`
  unquoted in an INSERT column list and conflict target, which Postgres rejects
  outright. Its integration test never ran because the test fixture's DDL had
  the same defect.

See ADR 0021 §4-5.
