# Public Route Cache Policy

This policy classifies public API routes by cache behavior. It complements
[`caching-architecture.md`](./caching-architecture.md): the shared cache
contract explains what cache can safely do, while this document says which
public route groups should opt in.

The tier model behind these headers — which cache honours what, and what a
deployment must declare to serve a public storefront — is decided in
[ADR 0021](../adr/0021-http-response-cache-tiers.md). The classes below say what
a route declares; the ADR says what the declaration obligates.

The Node deployment marks `GET /v1/public/*` responses cacheable only when the
route explicitly emits `Cache-Control: public, s-maxage=...` and the response
has no `Set-Cookie`. Shared response caching is performed by an external CDN or
the graph-selected `env.CACHE` provider; the runtime does not depend on the
Cloudflare Cache API.

## Policy Classes

- `shared-response-cache`: non-personalized, stale-tolerant public GET. The
  route must emit `Cache-Control: public, s-maxage=..., stale-while-revalidate=...`.
- `kv-read-model`: public read backed by a KV/document/read-model source. It
  should still emit shared response-cache headers on the public mount unless it
  varies by request headers without a matching `Vary`.
- `private-no-store`: bearer-like IDs, customer/session/payment/proposal,
  contract instance, signature, PII, or any response with `Set-Cookie`. Emit
  `Cache-Control: private, no-store` when the route is under `/v1/public/*`.
- `live-by-correctness`: volatile price quote, hold, booking, payment mutation,
  eligibility, or write flow where stale data can change correctness.
- `index-backed`: search/index reads. GET searches can use shared response
  cache when non-personalized; POST searches are not cached by the current
  public response cache because the cache key is URL-only.

## Route Matrix

| Route group | Policy | Notes |
| --- | --- | --- |
| Inventory public product browse/detail, categories, tags, destinations | `shared-response-cache`, `kv-read-model` | Product detail can read through `env.CACHE`; routes also emit shared response-cache headers. |
| Storefront departure browse/detail, itinerary, product extensions, availability snapshots, offer reads | `shared-response-cache` | Checkout and customer mutations remain live. Storefront settings are not shared-cached because deployments can resolve variants from request headers such as `x-storefront`. |
| Catalog sourced content for products, cruises, and accommodations | `kv-read-model` | Do not use shared response cache while locale can fall back to `Accept-Language`; require locale in the URL/cache key before opting in. |
| Cruise public browse/detail/sailing/ship GETs | `shared-response-cache` | Quote POST routes are `live-by-correctness`. |
| Charter public browse/detail/voyage/yacht GETs | `shared-response-cache` | Quote POST routes are `live-by-correctness`. |
| Commerce public pricing and availability snapshots | `shared-response-cache` | Snapshot reads are stale-tolerant browse data; checkout re-verifies live. |
| Booking transport requirements | `shared-response-cache` | Requirements change slowly and are re-evaluated during booking. |
| Legal policies, terms, and default contract template | `shared-response-cache` | Published/default legal reference content is safe to cache briefly. |
| Legal contract instance and contract signature routes | `private-no-store` | Public URL surface, but tied to a specific contract/signature flow. |
| Operator public profile, public operator settings, payment-link config | `shared-response-cache` | Public deploy configuration and operator identity; payment sessions remain private/live. |
| Payment link sessions, payment resolve/retry/card start, trip summaries | `private-no-store` or `live-by-correctness` | Session-specific and payment-state dependent. |
| Proposals, finance customer portal, document delivery | `private-no-store` | Customer-facing but bearer/session scoped. |
| Catalog POST search | `index-backed` | Not response-cached today because the request body is outside the URL cache key. Use GET/hash read models before adding shared response caching. |

## Authoring Rule

When adding a public route:

1. Choose one policy class above before implementation.
2. For non-personalized GETs under `/v1/public/*`, set shared public
   `Cache-Control` with `s-maxage`.
3. For personalized or bearer-like public routes, set `private, no-store` when
   returning sensitive state.
4. Do not cache a route that varies by request headers unless the route also
   emits the correct `Vary` header or normalizes the variant into the URL.
5. Do not use KV or response cache as a correctness primitive; the live DB path
   must remain correct on every cache miss.

The mechanical guardrail is `pnpm verify:public-cache-policy`.
