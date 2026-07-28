# Voyant Auth And Identity Architecture

This guide defines how Voyant should treat authentication, identity, and
request actor context.

The goal is simple:

- keep auth as a shared infrastructure surface
- separate session identity from workspace/actor authorization
- keep module routes and services consuming shared auth context instead of
  rebuilding it
- keep identity storage and user preferences reusable across admin and public
  surfaces

Auth should be a framework capability, not a package-local pattern.

The realm split and migration contract are recorded in
[ADR-0014](../adr/0014-admin-and-customer-auth-realms.md) and the
[auth realm migration guide](./auth-realm-migration.md).

## Core Rules

### 1. Authentication should be shared infrastructure

Voyant should treat authentication as shared runtime infrastructure.

That includes:

- session resolution
- authenticated user identity
- request actor context
- API-level unauthorized handling

Modules and routes should consume that shared context, not invent their own
auth mechanisms.

Rule:

Auth belongs in shared runtime infrastructure, not inside individual domain
packages.

### 2. Identity and authorization are not the same thing

Voyant should distinguish between:

- who the user is
- what workspace/organization they act in
- what permissions they have

Those are related but separate concerns.

Examples:

- a signed-in user identity
- an active organization or actor context
- permission checks for admin actions

Rule:

Do not collapse identity, actor selection, and permission checks into one
generic auth concept.

### 3. Session auth should remain the default primary model

For Voyant admin and authenticated public surfaces, session-based auth should
remain the primary default.

That aligns with:

- Better Auth
- the shared authenticated-user flows
- admin and customer-portal runtime expectations

Rule:

Session auth should stay the default model unless a route explicitly needs a
different boundary such as internal or machine auth.

### 3a. Voyant Cloud is an identity broker, not the admin session issuer

Voyant Cloud-provisioned admin deployments use `voyant-cloud` auth mode. In
that mode, Voyant Cloud owns WorkOS identity, organization membership, app
scope, broker grants, assertion signing, and revalidation. The tenant admin
deployment still owns the local Better Auth mirror user, Better Auth session
cookie, Better Auth JWT/JWKS endpoints, and local API-token storage.

Cloud mode is exclusive. When `VOYANT_ADMIN_AUTH_MODE=voyant-cloud`, local
credential sign-in, sign-up, password reset, email verification, email OTP,
change-email, invitations, and social OAuth are disabled server-side. Hiding
local UI is not sufficient. Local development and self-host deployments use
`VOYANT_ADMIN_AUTH_MODE=local` and keep the regular Better Auth flows without
WorkOS or Voyant Cloud configuration.

The local mirror user uses a generated local Better Auth `auth.user.id`. WorkOS
ids and platform organization ids are stored only in account/linkage tables and
must not become JWT `sub` values or be exposed through provider-neutral request
auth context.

Rule:

Cloud answers "who is this WorkOS user and may they access this deployment";
Better Auth answers "what local admin session/token does this deployment
trust".

### 3b. Admin and customer sessions are separate realms

Admin and storefront customer auth use separate Better Auth instances and must
not share tables, cookies, signing secrets, base paths, or automatic email
linking. Managed admin mode affects only the admin realm; customer email and
social routes remain independently selectable.

Rule:

An identity may cross a realm only through an explicit domain link keyed by
stable ids, never by matching email addresses.

## Request Context

### 4. Routes should consume shared request identity helpers

Routes should use the shared request helpers and middleware surface for auth,
not read ad hoc request state directly.

Examples:

- `requireUserId(...)`
- shared auth middleware
- actor-aware middleware
- permission guards

Rule:

Routes should consume shared auth/request helpers instead of open-coded auth
branches.

### 5. Actor context should be explicit when routes depend on workspace state

Some routes only need a signed-in user.
Others need a resolved actor or workspace context.

Those should remain separate concepts.

Rule:

Use actor-aware middleware and guards only when the route genuinely depends on
workspace or actor context.

### 6. Permission checks should be narrower than auth

Permission checks are an authorization concern layered on top of auth and actor
resolution.

They should stay explicit and route-scoped.

Rule:

Do not treat every authenticated route as a permission-checked route by
default.

## Identity Storage

### 7. User profile data should stay reusable across surfaces

Voyant user identity/profile data should support both:

- admin/runtime preferences
- public/customer-facing identity reads and updates

Examples:

- locale
- timezone
- billing/contact preferences
- traveler identity/document data where appropriate

Rule:

Identity storage should remain a shared capability that multiple product
surfaces can use safely.

### 8. UI locale and business-content locale are separate

Admin UI locale should not be treated as the same concern as product-content
translations.

The auth/identity surface should support storing user-level locale/timezone
preferences so the admin runtime can resolve them cleanly.

Rule:

User preferences should support runtime presentation without being confused for
content translation ownership.

## Public And Internal Boundaries

### 9. Public auth surfaces should stay explicit

Public authenticated routes should remain clearly separated from:

- unauthenticated public APIs
- admin APIs
- internal-only routes

That keeps the transport boundary easy to reason about.

Rule:

Authentication should not blur the admin/public/internal route split.

### 10. Internal or machine auth should stay distinct from session auth

If Voyant adds or expands internal service auth, machine auth, or signed
request boundaries, that should be treated as a separate concern from standard
user sessions.

Rule:

Do not overload user-session auth to cover every non-user access pattern.

### 10a. Trusted internal acting-user attribution is not authorization

An internal caller authenticated by an exact configured `INTERNAL_API_KEY`
match may send `x-voyant-acting-user-id` when it performs work interactively on
behalf of a Voyant staff user. Managed Max sends the Voyant Cloud / WorkOS
provider account id. The Hono runtime must resolve that assertion through an
active `cloud_auth_user_links` row and records the linked deployment-local auth
user id as request `userId` with `principalSubtype: "max"`. An unknown or
revoked link fails authentication. This is attribution and a delegated identity
input, not a replacement for the machine credential's authorization.

`INTERNAL_API_KEY_SCOPES` remains a hard permission ceiling. A route guarded by
`requirePermission(resource, action)` must reject the request when the internal
credential lacks that scope, even if the asserted user would independently
have the permission in an interactive session. Audit consumers should record
both the internal caller and the asserted actor where their schema permits it.

Every holder of a configured internal key is technically able to assert this
header. Managed deployments must therefore distribute that key only to trusted
internal workloads allowed to act on behalf of staff, rotate it with the
comma-separated overlap procedure, and give it the narrowest practical scopes.
Self-hosted deployments that do not operate such a trusted workload should not
forward the header and may leave `INTERNAL_API_KEY` unset. Untrusted clients and
ordinary `voy_*` API keys must never be allowed to assert acting-user identity.

For the current token-signing baseline and the threshold for eventual JWKS-style
distribution, see
[`token-signing-and-key-distribution-policy.md`](./token-signing-and-key-distribution-policy.md).

### 10a. Cloud-mode API tokens must revalidate Cloud membership

Better Auth API keys are local machine credentials, but in Cloud mode they are
still owned by a Cloud-mirrored user. A personal API token must not keep working
after that user's WorkOS/Voyant Cloud membership is revoked.

Cloud-mode API-token management and raw `voy_` API-token middleware validation
must call Cloud revalidation for the mirrored user. A revoked response marks the
Cloud link revoked and disables that user's local API keys. Cached pull
revalidation is acceptable for v1; a future Cloud webhook may reduce revocation
latency, but webhook push is an optimization, not the only enforcement path.

Rule:

Local API tokens remain Better Auth API keys, but Cloud mode gates their use on
current Cloud membership.

## Product Guidance

### 11. Templates should compose the auth surface, not redefine it

Starters may:

- choose auth UI
- decide how the auth runtime is mounted
- provide app-level session or workspace flows

But they should not redefine the core auth and identity model in incompatible
ways.

Rule:

Templates compose the shared auth surface; they should not create a second auth
architecture.

Voyant Cloud-provisioned templates are prewired with Cloud broker environment
variables (`VOYANT_CLOUD_ADMIN_AUTH_START_URL`,
`VOYANT_CLOUD_ADMIN_AUTH_EXCHANGE_URL`, `VOYANT_CLOUD_ADMIN_AUTH_JWKS_URL`,
`VOYANT_CLOUD_ADMIN_AUTH_REVALIDATE_URL`,
`VOYANT_CLOUD_ADMIN_AUTH_CLIENT_TOKEN`, and `VOYANT_CLOUD_DEPLOYMENT_ID`) and
run with `VOYANT_ADMIN_AUTH_MODE=voyant-cloud`. The checked-in local examples
must default to `local` so self-hosters and local development are not coupled to
Voyant Cloud.

### 12. Modules should rely on shared auth contracts

Domain modules should assume:

- request auth has already been resolved
- the route layer can supply authenticated user or actor context
- shared auth errors and guards exist

They should not own package-specific auth models.

Rule:

Domain modules should consume shared auth context rather than implement their
own auth semantics.

## Practical Checklist

When adding auth-sensitive functionality in Voyant:

1. Decide whether the route needs signed-in identity, actor context, or a
   permission check.
2. Use the shared auth middleware and helpers for that level of need.
3. Keep session auth as the default for user-facing authenticated surfaces.
4. Keep internal/machine auth separate from user-session auth.
5. Reuse shared identity/profile storage for runtime preferences and customer
   identity data where appropriate.
6. Do not rebuild auth semantics inside the module itself.
7. Keep token-format and verification details inside shared auth/runtime
   surfaces.

## Non-Goals

This guide does not introduce:

- a replacement auth provider
- a new permission system
- a claim that every authenticated route needs the same authorization depth

The point is a clear shared auth and identity model, not a larger auth
framework.
