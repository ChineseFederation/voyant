# Remote App Runtime And App-Owned Custom Fields

- **Status:** Accepted
- **Audience:** framework, Operator, security, and integration maintainers
- **Decision type:** public runtime and package contract

## Decision

Voyant treats an **app** as a separately deployed service activated for a
deployment through OAuth. App backend code never executes inside the Operator
process, and an app never contributes database migrations, graph units,
providers, routes, or other executable server code to a Voyant deployment.

This repository provides a deployment-local remote app runtime:

- custom app registration;
- immutable declarative releases;
- release acquisition by upload or protected HTTPS manifest fetch;
- consent, installation, grants, pause, revoke, uninstall, and purge;
- OAuth credentials and versioned App APIs;
- durable webhook subscriptions;
- sandboxed admin extensions;
- app-owned, namespaced custom fields;
- local audit and health state.

Custom apps do not require a listing, publication workflow, or Voyant-operated
service. A deployment owner supplies and supports the app and explicitly chooses
when to ingest and activate a new release.

Operated catalogs, listing services, publisher programs, commerce, and hosted
distribution policy are outside this repository. A host may offer an admitted
release to the same installation runtime through an explicit integration, but
the public runtime does not discover, authorize, bill, or operate such a service.

Each app release is an immutable, signed, content-addressed artifact. It contains
closed declarative metadata and optional sandboxed static UI assets, never the
app backend or executable Operator code. Acquisition and activation are
separate: acquiring a release stores a verified snapshot; OAuth consent and
activation create or advance the durable installation.

Npm remains exclusively a deployment mechanism for trusted executable code
selected by a developer: Voyant modules, project modules, infrastructure
providers, and deeply integrated adapters. An app release artifact is not an npm
package, plugin, or deployment graph unit.

Deployment-local TypeScript custom-field declarations are unsupported. The
database is the only runtime authority for custom-field definitions.
Operator-owned definitions are created in Settings; app-owned definitions are
reconciled from the installed app release or app API.

Every app receives a platform-assigned reserved namespace. Apps address their
own namespace through the `$app` alias and cannot submit, claim, read, or write
another app's physical namespace. Custom-field identity is `(target, namespace,
key)`.

## Scope

### Goals

1. Let an operator activate, pause, or uninstall an app without executing
   ecosystem code, migrations, or graph changes.
2. Keep all app execution outside the Operator process.
3. Give apps least-privilege access through versioned APIs and OAuth grants.
4. Support secure remote admin pages and targeted UI extensions.
5. Deliver versioned events reliably to remote app webhooks.
6. Let apps attach typed values to Voyant entities without schema migrations.
7. Prevent custom-field collisions and cross-app access by construction.
8. Keep complex app-owned records in the app's own database.
9. Make installation, grants, calls, deliveries, and custom-field mutations
   auditable.
10. Let a deployment create, release, and install custom apps without an
    operated catalog or publication service.
11. Let every app own its UI, translations, supported locales, and fallback
    locale without adding app strings to Voyant translation catalogs.
12. Bind every authenticated app interaction to the installed release and
    negotiated contract versions.

### Non-goals

- Runtime package-manager execution, dynamic imports, or mutable `install(app)`
  hooks inside the Operator.
- Allowing remote apps to contribute Drizzle schemas or migrations.
- Running remote app callbacks inside a Voyant database transaction.
- Providing a general-purpose hosted relational database for apps.
- Replacing Voyant modules, adapters, or providers with runtime apps.
- Supporting arbitrary app JavaScript or React in the admin origin.
- Operating a public catalog, listing review, publisher program, subscription,
  billing, or payout system.
- Automatically updating a custom app from a mutable remote source.
- Distributing app releases through npm or any package manager.
- Preventing a developer from privately distributing an app artifact to another
  deployment; distribution terms are outside the runtime contract.
- Guaranteeing ordered or exactly-once webhook delivery.
- Allowing arbitrary validation functions in custom-field definitions.

## Terminology

| Term | Meaning |
| --- | --- |
| **App** | A separately deployed service activated for a Voyant deployment through OAuth. |
| **App registration** | Stable identity, credentials, redirect URIs, ownership, and release-signing identity for an app. |
| **App release** | An immutable validated snapshot of an app manifest and its declared capabilities. |
| **App release artifact** | The signed, content-addressed declarative package for one release, with optional sandboxed static assets and no backend or Operator runtime code. |
| **Release acquisition** | Storing a verified release artifact in a deployment-local registry or accepting one from an explicit host integration. |
| **App installation** | The deployment-local relationship between an app registration, one active release, grants, and lifecycle state. |
| **Custom app** | An app registered directly by an authorized deployment actor and installed without an operated listing service. |
| **Admin extension** | A remote page or slot contribution rendered through the sandboxed admin extension host. |
| **App locale catalog** | App-owned translations for its remote UI and validated localized metadata for host-rendered labels. |
| **Deployment component** | Trusted npm-selected module, adapter, or provider included in the resolved deployment graph. |
| **Custom-field target** | A Voyant entity type whose owning module supports namespaced custom fields. |
| **Reserved app namespace** | An immutable physical namespace assigned by the deployment to one app registration. |

The word **plugin** does not describe a runtime-installed app. Executable npm
bundles are classified by their deployment role: module, extension, adapter, or
provider. A declarative app artifact is not a plugin or graph unit.

## Product Classification

| Capability | Delivery |
| --- | --- |
| Core and vertical domain behavior | Voyant or project module |
| Search, payment, storage, cache, or workflow implementation | Deployment adapter or provider |
| CRM, accounting, document export, or remote synchronization | Remote app when stable APIs and events are sufficient |
| Dashboard card or entity-side panel | Remote admin extension |
| Small app-specific attribute on a Voyant entity | App-owned custom field |
| Complex app-specific records | App-owned database |

Capabilities requiring native transactions, synchronous checkout participation,
schema ownership, or infrastructure authority remain deployment components.

## Trust Boundary

The Operator graph is immutable at runtime. Activating or upgrading an app
changes database state and sandboxed asset registrations only. It does not
change the project manifest, lockfile, build, migration plan, imports, graph
units, or provider selection.

Remote apps interact with Voyant through five public contract families:

1. OAuth authorization and token endpoints.
2. Versioned resource APIs.
3. Versioned outbound events and webhooks.
4. Sandboxed admin extensions.
5. Namespaced custom-field definition and value APIs.

All app traffic is external network traffic even when the app is operated by the
same organization or deployed on nearby infrastructure.

## Registration And Distribution

An app registration has one immutable app ID and physical namespace.
Human-readable names and slugs may change and are never authorization or
namespace identity.

A registration records:

- immutable app ID and reserved namespace;
- owning actor or organization;
- display metadata and lifecycle state;
- exact redirect URI allowlist;
- launch, lifecycle, privacy, health, and support URLs;
- client authentication material and signing keys;
- requested and optional scopes;
- supported Voyant API range;
- released manifest history.

Custom app creation must:

1. Require a dedicated app-development or app-administration permission.
2. Assign the app ID and reserved namespace before installation.
3. Record exact redirect URIs and lifecycle endpoints.
4. Accept a signed manifest snapshot or protected HTTPS source.
5. Validate requested scopes and compatibility.
6. Create an immutable release.
7. Issue or register client authentication material.
8. Start consent directly or produce a restricted installation link.

An arbitrary URL can never choose an app ID or reserved namespace.

### Managed acquisition and consent handoff

A managed host may offer an admitted release through the optional
`apps.managed-marketplace` runtime port. The port supplies both the stable host
deployment identity used for local installation rows and the acquisition
resolver. The browser supplies only an opaque,
single-purpose install intent. The host authenticates the deployment, resolves
that intent, verifies its private catalog admission and provenance, and adapts
the result to `voyant.runtime-marketplace-acquisition.v1`. This managed
acquisition path never accepts catalog records, artifact locations, publisher
claims, app IDs, release IDs, manifests, or OAuth coordinates directly from
query parameters or request JSON.

The deployment-local runtime independently validates the closed acquisition
envelope, compiles the manifest against the selected graph, compares the
canonical digest, and idempotently stores the verified snapshot. Host app and
release IDs remain the local `apps.id` and `app_releases.id` so managed contract
generation has one stable identity; only the reserved `app--...` namespace is
generated locally. Marketplace identity, owner, version, and digest conflicts
fail closed. No private artifact storage coordinate is persisted.

Confidential OAuth client authentication follows the same boundary. The
publisher retains a high-entropy client secret in its own broker. The private
catalog and deployment receive only its SHA-256 verifier through the
host-verified acquisition envelope; the deployment stores that verifier as the
active client credential. The raw secret never enters the catalog, artifact,
setup assertion, browser, or Voyant database.

Acquisition returns local app and release IDs plus, when present, the
deployment-scoped identity and current release of the existing installation.
The native Apps page then renders consent from the admitted normalized release:
required and optional scopes, data classifications, external secret-custody
disclosure, retention, webhooks, admin pages and slots, privacy policy, and
support. Fresh consent uses the installation mutation. When an active
installation already exists at a different admitted release, the same consent
screen uses the explicit installation activation route, supplies the required
scopes approved in that ceremony, advances the existing installation, and only
then starts the setup handoff. Retrying either path is idempotent and never
creates a second installation identity.

After an active Marketplace installation is created, a host may create a
one-time setup handoff. The public runtime sends only `installationId`, `appId`,
and `releaseId` to host authority. The host owns OAuth coordinates and signs a
short-lived assertion with JWT type `voyant-marketplace-setup+jwt` and claims
schema `voyant.marketplace-setup-assertion.v1`. Its `sub` equals
`installationId`, `aud` equals `appId`, and its positive lifetime is at most 300
seconds. It includes `iss`, `jti`, `iat`, `exp`, the three stable identities,
and exact HTTPS `authorizationUrl`, `tokenUrl`, and admitted `redirectUri`.
The host sends the assertion server-to-server with `POST` to the exact admitted
manifest `urls.setup`, `Authorization: Bearer <assertion>`,
`Accept: application/json`, and an empty body. The first use returns `201`; an
identical-`jti` retry returns `200`. Both return exactly
`{ "redirectUrl": "https://<setup-origin>/setup/start?code=<opaque>" }` with
`Cache-Control: no-store`. The browser receives only that opaque redirect URL;
it never chooses or edits assertion claims or OAuth endpoints. The public
runtime also requires the returned redirect to be HTTPS and to share the
admitted manifest setup origin.

The assertion `authorizationUrl` targets the authenticated admin page
`/apps/oauth/authorize`, not the mutation API. A browser GET only renders the
verified app, release, and scopes. Explicit approval POSTs the request to the
Apps OAuth API, which validates the exact redirect URI and preserves PKCE,
state, and a constrained optional nonce before redirecting to the app.

Marketplace uninstall performs local revocation first and then invokes managed
authority with the immutable installation, app, and release IDs. Authority
signs a short-lived, purpose-specific lifecycle assertion and POSTs it to the
exact admitted `urls.lifecycle`. Publisher cleanup is idempotent and
retry-safe: all installation-scoped OAuth, provider, setup, and webhook secrets
are revoked before publisher state is marked revoked. Lifecycle assertions use
a key and JWKS distinct from setup and admin-auth signing keys.

## Manifest And Release Artifact

The manifest is closed, versioned, declarative data. It may declare:

- manifest schema version and app release version;
- Voyant API compatibility range;
- requested and optional scopes;
- admin pages and supported slot extensions;
- default locale, supported locales, and localized host metadata;
- webhook event subscriptions and event versions;
- app-owned custom-field definitions;
- setup and configuration descriptors;
- health, launch, lifecycle, privacy, and support URLs;
- data classification and retention declarations.

It may not declare:

- database schemas or migrations;
- host routes or runtime factories;
- subscribers or infrastructure providers;
- dependency installation or lifecycle scripts;
- arbitrary executable host hooks.

Releasing a manifest creates an immutable artifact containing:

- the canonical manifest snapshot;
- validated host-rendered localized metadata;
- optional static iframe UI and locale assets;
- integrity hashes and signature provenance;
- declared API, event, extension, and Voyant compatibility ranges;
- deterministic reconciliation metadata.

Any included JavaScript, CSS, fonts, images, or locale catalogs are untrusted
static iframe assets. They are served only from an isolated origin and never
imported by the Operator, admin bundle, build, or migration process.

Publication or ingestion rejects:

- lifecycle scripts or package-manager metadata implying execution;
- dependency declarations;
- binary entries and native addons;
- executable host exports;
- undeclared files outside the release envelope and asset inventory.

A release cannot be replaced in place. Marking a release unavailable prevents
new acquisition where policy permits but does not silently rewrite an already
verified installation.

The data declaration truthfully states whether the remote app retains secrets
in its own custody. `storesSecrets: true` is valid for provider integrations
that retain encrypted installation or provider credentials outside Voyant. It
is a review and disclosure signal, never permission to put secrets in the
manifest, iframe context, custom fields, logs, or host database payloads.

Direct HTTPS manifest submission is an ingress path, not a mutable runtime
source of truth. Fetching must enforce HTTPS, response-size, redirect,
DNS-rebinding, timeout, content-type, and signature protections. The deployment
stores the validated snapshot and digest used for the release.

## Installation Lifecycle

An installation has these states:

`pending`, `authorizing`, `active`, `paused`, `degraded`, `revoked`, and
`uninstalled`.

Acquisition precedes activation:

1. Acquire an immutable release artifact.
2. Verify digest, signature, provenance, and app identity.
3. Validate Voyant, API, event, extension, and custom-field compatibility.
4. Present required and optional grants.
5. Complete OAuth authorization.
6. Create or advance the installation atomically.
7. Reconcile safe manifest declarations.
8. Activate webhooks and sandboxed extensions.
9. Emit an auditable lifecycle event.

Installation is idempotent. Reinstalling the same app reuses the reserved
namespace. Credential generations cannot overlap silently.

Pausing disables API credentials, webhook delivery, and extension mounting but
retains installation state. Uninstall additionally deactivates subscriptions
and app-owned definitions while retaining values by default. Purge is a
separate privileged operation with preview and retention checks.

Custom app releases never advance automatically from a mutable remote source.
The owner first ingests an immutable release; an authorized actor then activates
it after compatibility and consent checks.

## OAuth, Grants, And Credentials

Voyant acts as the authorization server for deployment-local app access.
Authorization uses the authorization-code flow with PKCE, exact redirect
matching, state validation, short-lived one-time codes, and confidential-client
authentication where applicable.

Two access modes are supported:

- **Offline installation access:** bounded to an installation and its grants for
  webhooks, scheduled work, and background synchronization.
- **Online actor access:** short-lived access for an interactive admin session;
  effective permission is the intersection of installation grants, viewer
  grants, and contextual restrictions.

Online actor access is minted only from a verified, single-use extension
session token. Public OAuth and App API request bodies cannot assert a viewer ID
or viewer permission set to invoke the internal actor-token exchange primitive.

Refresh, rotation, pause, and revoke must invalidate credential generations
immediately. Tokens include or resolve to the app, installation, deployment
audience, installed release, negotiated API version, grants, issue time, expiry,
and credential generation.

A scope is usable only when it exists in the selected Voyant access catalog, is
allowed for remote apps, appears in the installed release, and is granted by an
authorized actor. OAuth scope never bypasses action-ledger or approval policy.

## Remote Admin Extensions

Remote UI uses a sandboxed iframe and versioned message protocol. Active
installation state is the source of mounted pages, navigation entries, and
supported dashboard or entity-detail slots.

App assets never execute in the admin origin. The host passes only declared,
validated context. Full entity payloads and installation credentials are not
sent through iframe initialization messages.

Each `admin.pages[]` declaration may also provide declarative navigation
placement. `order` is an integer (default `0`; lower values render first),
`insertAfter` names an existing host navigation item after which the page is
anchored, and `group` is an installation-local key. Pages with the same `group`
render beneath one non-navigable structural entry whose label is resolved from
the app's localized `navigation` messages using the group key. All pages in a
group must declare the same `insertAfter`; equal-order ties preserve the
resolved descriptor list order. When these fields are omitted, pages retain the
original flat, appended navigation behavior and order.

The host issues short-lived, audience-bound session tokens for an extension.
The host-authenticated viewer scope set is captured inside the signed token at
issuance. At exchange, an app may only narrow that set; app-supplied scope names
are never accepted as evidence of viewer authority.
The iframe sends the token to its own backend, which exchanges it for online
actor access. Effective access remains bounded by the app, installation,
release, viewer, entity context, and current grants.
The online credential retains the signed entity and slot constraint. A
Finance document-scoped App API action must match that exact entity ID;
collection operations and other entity kinds fail closed. Client
authentication, online credential minting, and single-use session-token
consumption share one database transaction, so invalid client credentials or a
failed mint never burn the session token.

Managed-auth wiring remains a readiness blocker. The host must provide the
optional `apps.managed-auth` runtime port with a stable app-runtime audience and
host-owned session-token signing material. The port also supplies one stable
workload-environment ID plus a provider-neutral resolver for the current
contract generation of each `(app, release)`. Generations are per installation,
not global runtime configuration: two apps in one workload environment may
legitimately be on different generations. Session-token lifetime defaults to
120 seconds and a host override is capped at 300 seconds. The Apps package
composes OAuth, session-token issuance, session-token exchange, and app
access-token resolution from that port without replacing the host's staff
authentication integration. In managed mode, the workload-environment ID and
resolved per-app contract generation are authoritative for installation and
credential identity. A rollout-local deployment revision is retained only as
operational provenance and cannot invalidate an authorization code, refresh
token, access token, or extension session token. Direct/self-hosted runtimes
without this port preserve deployment-local binding.
Remote-app bearer resolution is attempted only for `/v1/app` routes; app scopes
cannot authorize admin or public route families with similarly named resources.
Managed authorization derives the consenting actor and grantable scope ceiling
from the authenticated staff context, never request body claims. Managed token
and session exchanges also require an explicitly provisioned client secret;
missing credential state fails closed.
If the port is absent, this composition stays off and the protocol endpoints
remain unavailable or staff-only.

Only `POST /v1/admin/apps/oauth/token` and `POST
/v1/admin/apps/oauth/session-token/exchange` use the exact
client-authenticated route posture. Their handlers retain client-credential,
PKCE, redirect, replay, and transactional exchange authority, and the framework
applies its public-write rate limit. OAuth authorization, extension
session-token issuance, installation management, and every other Apps admin
route remain staff-authenticated. Other methods, sibling paths, and child paths
never inherit the exception.

Extensions fail soft. A slow, invalid, or unavailable app origin cannot block a
native admin page.

### Localization

The app owns its in-frame translation catalogs. The release declares a complete
default locale, supported locales, and validated localized strings for the small
amount of app text rendered by Voyant, such as navigation labels.

Locale resolution uses exact match, declared language fallback, then the
complete default locale. The host passes active locale, resolved app locale,
text direction, and locale changes through the extension protocol.

## App APIs

App APIs are a narrow, versioned surface distinct from broad admin routes. Every
request resolves:

- app and installation identity;
- active installed release and digest;
- deployment audience;
- negotiated API version;
- effective scopes and actor mode;
- app namespace and relevant entity context.

There is no universal database API. Resource-owning modules expose explicit
remote-safe reads and actions through the selected access catalog. App APIs do
not expose internal table shapes or bypass module services.

Finance integrations use provider-neutral document contracts:

- `GET /v1/app/finance/documents/:id` hydrates an invoice or proforma by its
  stable Voyant ID, including billing identity, lines, tax fields, currencies,
  persisted FX context, dates, language, totals, number-series metadata,
  special tax-regime and margin-scheme Article 311 flags, and
  external-allocation state. It requires `finance-documents:read`.
- `GET /v1/app/finance/documents/:id/external-reference` reads the
  provider reference under `finance-external-references:read`.
- `PUT /v1/app/finance/documents/:id/external-reference` idempotently replaces
  the complete, size-bounded reference document under
  `finance-external-references:write`. An optional `allocation.invoiceNumber`
  requires the additional `finance-external-allocation:write` scope.
- `PUT /v1/app/finance/documents/:id/artifacts/provider-pdf` accepts an exact
  `application/pdf` body under `finance-document-artifacts:write`. The default
  limit is 10 MiB, both declared and streamed size are enforced, and the body
  must begin with the PDF signature. `Idempotency-Key` and
  `X-Voyant-Artifact-Name` are required and bounded. A replay returns
  `unchanged`; reusing the key with different bytes or a different name returns
  a conflict. The response contains the rendition ID and an authenticated
  Voyant document URL, never a bucket, binding, or storage key.
- `PUT /v1/app/finance/documents/:id/external-sync-state` records
  `succeeded`, `retryable_failure`, or `terminal_failure` under
  `finance-external-sync:write`. Each observation carries a bounded operation
  ID, timestamp, optional provider-neutral metadata, and a bounded error for
  failures. Exact replay is unchanged, reuse with different content conflicts,
  and an observation at or before the current timestamp is rejected as out of
  order.
- `PUT /v1/app/finance/documents/:id/external-lifecycle-state` records a
  terminal `converted` or `voided` fact under
  `finance-external-lifecycle:write`. Conversion requires explicit lineage
  from the route's source proforma to its successor invoice and is accepted
  only after that native relationship is durable. Void observations are
  accepted only for a natively void document that was not converted. The
  append-only operation ledger treats exact replay as unchanged, rejects a
  reused operation ID with different content, and rejects out-of-order or
  post-terminal transitions.
- `POST /v1/app/finance/documents/:id/settlement-observations` records `partial`
  or `paid` evidence under `finance-settlement-observations:write`. Each
  observation contains a bounded operation ID and timestamp, ISO currency,
  balanced document totals, and a bounded set of external payment identifiers.
  It validates the native document currency and total but never inserts a
  payment, changes paid totals, or marks the native document paid.
  Only issued, overdue, partially paid, or paid native documents accept
  observations. Reported status and paid balance describe the external system
  and may intentionally differ from the native settlement state; `created`
  means the evidence was recorded, not that native reconciliation succeeded.
  Payment identifiers are a cumulative set. Later partial observations cannot
  reduce paid cents, increase the balance, or drop a previously reported
  identifier, and a paid observation is terminal.

The allocation and reference write share one database transaction and one app
audit record. Replaying the same allocation succeeds as `already_applied`;
attempting to replace it or reuse an occupied number returns a stable conflict.
Reference ownership is derived from the authenticated immutable app ID. A
caller cannot select, discover, read, or overwrite another app's provider key.
Artifact storage is selected by the deployment-local Finance runtime. Upload is
compensated when the referenced document cannot be bound or persistence fails;
an unbound object is never returned through the App API. Document links resolve
through Voyant's authenticated rendition route so storage authority stays with
the host. External-sync state is current-state data on the app-owned external
reference and does not grant broader finance mutation access.
Lifecycle operations and settlement observations are append-only. External
payment identifiers are normalized and owned by authenticated app identity;
one identifier cannot move between finance documents for the same app. The
document row and each identifier ownership key are locked before mutation so
concurrent requests preserve the same ordering and ownership rules. All
document routes enforce an online token's signed entity constraint before
resolving scopes or invoking Finance.
The provider-neutral DTOs and runtime port are owned by `finance-contracts`;
Finance implements that port and the Apps gateway consumes it without either
package importing the other's implementation.

## Events And Webhooks

Only events explicitly declared as externally deliverable can be subscribed to
by an app. Subscriptions pin an event schema version and are reconciled from the
active release and grants.

`invoice.issued` and `invoice.proforma.issued` are externally deliverable. Their
external projection contains only the stable `invoiceId`, provider-neutral
`invoiceType`, and `skipExternalSync` control. Apps hydrate the current finance
document through the scoped API instead of receiving customer, line, tax,
series, or provider configuration in the webhook payload.
`skipExternalSync` is an issuance-scoped decision that is not persisted on the
document; the webhook projection is authoritative and a Worker must stop before
hydration when it is true.

`invoice.proforma.converted`, `invoice.voided`, and
`invoice.payment.recorded` are also externally deliverable through dedicated
version 2 minimal projections. Lifecycle projections expose stable document
IDs, document type, occurrence time, and conversion lineage where relevant.
The payment projection additionally exposes only the bounded amounts,
currencies, method, and date required to mirror the completed payment at an
external accounting provider. Customer identity, booking identity, line items,
free-text reasons and payment references, numbering, and routing fields stay
inside Finance. `invoice.settled` remains an internal event: an app reports
external settlement evidence through the scoped observation endpoint instead
of subscribing to an internal reconciliation signal.

Delivery is durable, signed, at-least-once, idempotency-friendly, retried with
bounded backoff, observable, and replayable where retention policy permits.
Queues isolate destinations and installations so one unhealthy app cannot starve
another app or the Operator.

Webhook payloads identify the event, delivery, installation, release, schema
version, occurrence time, and deployment. Secrets and undeclared fields are
excluded through the event catalog rather than app preference alone.

## App-Owned Custom Fields

### Target registry

Each entity-owning module registers supported custom-field targets, including
identity, storage and API capabilities, allowed types, and read/write/search/
export/presentation behavior. Apps cannot attach fields to an unknown or
unsupported table.

### Ownership and identity

Definitions distinguish operator and app ownership:

| Owner | Namespace | Structural control |
| --- | --- | --- |
| Operator | operator-assigned | Authorized staff |
| App | platform-assigned `app--<opaque-id>` | Owning app release or app API |

Definition uniqueness is `(target, namespace, key)`. The `$app` alias is
resolved from authenticated installation identity. A submitted physical app
namespace is rejected.

App-owned structural properties are read-only to staff. Explicitly supported
presentation overrides may remain operator-owned. Definition policy and value
policy are separate.

Only declarative validation is allowed: length, numeric bounds, choices,
patterns from an accepted subset, date constraints, nullability, and defaults
where the target supports them.

### Values and lifecycle

Entity values are stored as namespaced JSONB:

```json
{
  "operator": { "internal_note": "..." },
  "app--01ABC": { "external_ref": "INV-42" }
}
```

An app can read or write only its own namespace unless a distinct operator-owned
field grant permits otherwise. Removing a definition does not silently delete
values. Uninstall retains values by default; purge is explicit and audited.

## App Data Ownership

Voyant stores only data needed for native integration:

- app identity, releases, installations, grants, and credentials;
- resolved extensions and webhook subscriptions;
- app-owned field definitions and values;
- installation configuration, audit, and health state.

The app stores complex records, cursors, mappings, queues, and provider-specific
state in its own service. Voyant remains authoritative for native domain records;
the app is authoritative for its private operational records.

## Versioning And Compatibility

The runtime versions independently:

- artifact format and signature profile;
- manifest schema;
- Voyant App API;
- event payload schemas;
- admin extension protocol;
- manifest localization and host-label schema.

An app release declares compatible ranges. Acquisition and activation fail
closed when there is no overlap. Event subscriptions pin supported versions.
Breaking contract versions require an announced support window and an
installation-visible deadline.

Every authenticated request, token exchange, webhook, and lifecycle callback is
bound to the installed release and relevant negotiated versions. A remote app
backend must honor the release contract it declares. An unsupported or invalid
backend response degrades only that installation; it cannot block Operator boot
or native operation.

## Security Requirements

1. Exact OAuth redirect matching with no wildcard production redirects.
2. PKCE, state validation, one-time authorization codes, and short expiry.
3. Immediate pause, uninstall, grant revocation, and credential-generation
   revocation.
4. Credentials stored through the secret system and never placed in manifests,
   custom fields, logs, or iframe context.
5. Short-lived, audience-bound admin session tokens with replay-resistant IDs.
6. No installation access token delivered to an iframe.
7. Service-boundary scope, installation, target, and namespace enforcement.
8. Webhook signatures over exact bytes, timestamp tolerance, rotation, and
   unique delivery IDs.
9. Outbound endpoint SSRF protections and HTTPS requirements.
10. Per-app and per-installation rate, concurrency, payload, and retry limits.
11. Data classification derived from platform declarations.
12. Audit coverage for grants, credentials, remote mutations, exports, and
    app-owned field access.
13. Tenant identity derived from deployment and installation, never from an
    app-supplied tenant parameter.
14. Localized host metadata treated as untrusted plain text.
15. Artifact signature, digest, provenance, and package-to-app identity
    verification before acquisition or activation.
16. Static assets isolated by origin and restrictive content security policy.
17. Ingestion rejection for scripts, dependencies, binaries, native addons,
    executable exports, and undeclared files.
18. Protected HTTPS manifest fetch with size, redirect, DNS-rebinding, timeout,
    content-type, and signature checks.
19. Apps declaring `storesSecrets: true` remain responsible for encrypted
    publisher custody, rotation, least-privilege access, and breach response;
    the declaration grants no host secret-storage capability.

## Module Ownership

Implementation is divided into independently testable modules:

1. **App Registry:** custom registration, releases, and immutable app identity.
2. **Release Ingestion:** protected fetch/upload, content addressing, signature
   verification, provenance, and local release state.
3. **Installation Service:** consent, grants, lifecycle, activation, pause,
   uninstall, reinstall, and purge planning.
4. **Manifest Compiler:** closed-schema validation and deterministic
   reconciliation.
5. **Authorization Server:** OAuth codes, credentials, online token exchange,
   rotation, revocation, and scope intersection.
6. **Remote App Gateway:** release-aware negotiation, rate limits, service
   context, and remote-safe APIs.
7. **Admin Extension Broker:** descriptors, isolated assets, iframe tokens,
   locale context, and fail-soft hosting.
8. **Webhook Integration:** subscription resolution, signed durable delivery,
   retry, replay, and health.
9. **Custom Fields:** targets, namespaces, definitions, values, validation,
   reconciliation, and lifecycle.
10. **App Governance UI:** custom app development, installations, grants, health,
    audit, and data-retention actions.

No generic module imports a specific app, listing service, or provider.

## Public Data Model

The deployment-local model contains:

- app registrations, redirect URIs, credentials, and immutable releases;
- release artifacts, localizations, and acquisition provenance;
- installations, grants, credentials, settings, and secret references;
- resolved extension registrations and webhook subscriptions;
- delivery and app audit records;
- custom-field targets, definitions, overrides, and namespaced values.

An externally operated listing or commerce model is not part of this schema.
The deployment stores only the provenance needed to verify and explain an
offered release.

## Verification

Tests assert public behavior and durable invariants:

- manifest and artifact acceptance, rejection, canonicalization, and signatures;
- rejection of executable or undeclared artifact content;
- protected manifest-fetch behavior;
- installation state transitions and idempotency;
- explicit custom-release activation with no automatic mutable-source update;
- scope intersection, token audience, rotation, pause, and revoke;
- release and negotiated-version context on all app interactions;
- iframe sandbox, session exchange, locale context, and fail-soft behavior;
- webhook signing, isolation, retries, replay, and duplicates;
- namespace allocation, `$app` resolution, and cross-app isolation;
- custom-field ownership, lifecycle, validation, presentation, search, and export;
- remote app outages degrading only the installation;
- architecture checks preventing apps from entering the executable deployment
  graph and preventing deployment packages from registering as apps.

## Acceptance Criteria

1. Activating or upgrading an app adds no executable code, graph units, routes,
   providers, schemas, migrations, or backend code to the Operator.
2. A deployment can create, release, and install a custom app with no dependency
   on a Voyant-operated service.
3. A custom release advances only through explicit ingestion and activation.
4. No app manifest can declare schema, migrations, providers, or runtime code.
5. Each release is immutable, signed, content-addressed, and verified before
   activation.
6. App UI is app-owned, release-pinned, isolated, and sandboxed.
7. Every app request resolves an active installation, installed release,
   negotiated versions, and effective scopes.
8. Every app has an immutable reserved namespace, and cross-app namespace access
   is rejected by construction.
9. Custom-field definitions have one database authority and explicit ownership.
10. Pause, revoke, and uninstall immediately remove access and extension
    activation while retaining values by default.
11. Webhook delivery is signed, durable, observable, bounded, and replayable.
12. App outages and unsupported releases cannot block Operator boot or native
    pages.
13. Public packages contain no operated catalog, listing, commerce, or publisher
    workflow authority.

## Consequences

### Benefits

- A stable public app contract usable without an operated service.
- Runtime activation without executable deployment mutation.
- App failures isolated from the Operator process.
- Least-privilege APIs and collision-proof extensible data.
- App-owned UI, localization, backend, and release cadence.
- A narrow, testable boundary for hosts that choose to offer acquired releases.

### Costs

- Deployments operate authorization, installation, token, webhook, and sandbox
  infrastructure for custom apps.
- Remote calls introduce latency and failure modes.
- Apps cannot participate in native transactions.
- App APIs and event schemas require compatibility discipline.
- Deployment owners are responsible for acquiring, updating, and supporting
  their custom apps.

## Resolved Decisions

- App backends are remote-only; release artifacts are declarative.
- Custom apps can be created and installed without a listing or operated
  publication service.
- App artifacts are never distributed through npm.
- Acquisition and OAuth activation are separate.
- App releases advance only through immutable snapshots and explicit activation.
- New required scopes always require renewed consent.
- Every app interaction is bound to the installed release and negotiated
  contract versions.
- Remote apps own complex records in their own database.
- App-owned custom fields use immutable namespaces and server-resolved `$app`.
- Database definitions are the sole runtime custom-field authority.
- App UI and localization remain app-owned and isolated from the admin origin.
- Operated catalogs, listings, commerce, publisher review, and hosted
  distribution policy are outside the public repository.
