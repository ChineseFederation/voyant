---
"@voyant-travel/hono": minor
"@voyant-travel/catalog": minor
---

Cache body-keyed public POST reads in the framework, and let catalog search
declare its own policy.

`publicResponseCache` was GET-only, so `POST /v1/public/catalog/search` — the
slowest public read there is — could not declare a cache policy at all. The gap
was filled downstream by a bespoke cache in the Voyant Cloud dispatcher that
hardcoded the route path, invented its own TTL, and omitted
`stale-while-revalidate`. Self-hosted deployments got nothing, and any second
body-keyed read would have needed the same bespoke treatment.

A module now declares participation with `bodyKeyedCache`, listing public
sub-paths whose POST reads are keyed on the canonicalized request body as well
as the URL and the variant headers. The declaration lives at mount time rather
than in a response header because the middleware has to canonicalize the body
*before* the route runs; the policy itself still lives on the response, which is
what lets an edge tier honour the same contract instead of matching a path.

Keying is fail-closed. A request goes to the origin uncached when it carries a
query string (an unknown parameter must not alias a body-only key), a non-JSON
or oversized body (64 KiB), `Authorization`, or a caller-specific body field
anywhere in the payload — embeddings, personalization, session, customer, user,
preview, or debug. Bodies differing only in property order share an entry.

`POST /v1/public/catalog/search` declares
`public, s-maxage=60, stale-while-revalidate=300` for an empty-query browse and
`s-maxage=30` for a keyword search, on the public surface only. The TTLs stay
short on purpose: the key carries no catalog projection generation, so the clock
is still the only invalidation there is (voyant-travel/platform#1726).

See ADR 0021 §2.
