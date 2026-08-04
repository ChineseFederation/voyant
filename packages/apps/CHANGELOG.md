# @voyant-travel/apps

## 0.14.7

### Patch Changes

- 7de4013: Define every app compatibility version once, in the package a publisher can install.

  `VOYANT_APP_CONTRACT_VERSIONS` collects the versions an app declares itself
  compatible with — the dated `/v1/app/*` surface, the manifest schema, the admin
  extension protocol major, and the event catalog — each derived from the constant
  that owns it rather than restated as a literal. They were previously written out
  by hand wherever a check needed them, including in another repository, so
  nothing connected a bump to the checks meant to enforce it.

  `APP_API_VERSION` moves here from `@voyant-travel/apps` and is re-exported from
  its old path. The old home is a private package: a publisher pinning
  `appApiVersions` could not read the contract they were pinning to.

- Updated dependencies [7de4013]
  - @voyant-travel/app-manifest@0.2.0

## 0.14.6

### Patch Changes

- Updated dependencies [3552f14]
  - @voyant-travel/core@0.138.0
  - @voyant-travel/custom-fields@0.2.27
  - @voyant-travel/db@0.120.2
  - @voyant-travel/hono@0.140.1
  - @voyant-travel/webhook-delivery@0.5.14

## 0.14.5

### Patch Changes

- Updated dependencies [c35841b]
  - @voyant-travel/hono@0.140.0
  - @voyant-travel/custom-fields@0.2.25
  - @voyant-travel/webhook-delivery@0.5.13
  - @voyant-travel/core@0.137.2

## 0.14.4

### Patch Changes

- Updated dependencies [2bc1570]
- Updated dependencies [2bc1570]
- Updated dependencies [14033fb]
  - @voyant-travel/db@0.120.0
  - @voyant-travel/hono@0.139.0
  - @voyant-travel/custom-fields@0.2.24
  - @voyant-travel/types@0.109.12
  - @voyant-travel/webhook-delivery@0.5.12

## 0.14.3

### Patch Changes

- Updated dependencies [c986bd5]
- Updated dependencies [9f412dd]
  - @voyant-travel/core@0.137.1
  - @voyant-travel/finance-contracts@0.110.0
  - @voyant-travel/db@0.119.4

## 0.14.2

### Patch Changes

- ed8610c: Extract the publisher-facing declarative surface out of the host runtime
  modules, so an app publisher can validate and digest a release without
  installing the operator.

  `@voyant-travel/app-manifest` owns the app manifest schema and
  `compileAppManifest`. `@voyant-travel/custom-fields-contracts` and
  `@voyant-travel/webhook-delivery-contracts` carry the two contracts the manifest
  builds on; the latter also gives a publisher `verifyWebhookPayloadSignature`,
  which previously required depending on the whole delivery runtime.

  No behaviour changes. `@voyant-travel/apps/compiler`,
  `@voyant-travel/apps/contracts`, and `@voyant-travel/custom-fields/contracts`
  re-export their previous surface, so existing imports keep working.

- Updated dependencies [ed8610c]
  - @voyant-travel/app-manifest@0.1.0
  - @voyant-travel/custom-fields@0.2.23
  - @voyant-travel/webhook-delivery@0.5.11

## 0.14.1

### Patch Changes

- Updated dependencies [2601445]
  - @voyant-travel/finance-contracts@0.109.0

## 0.14.0

### Minor Changes

- bf71bca: Allow installed app pages to declare deterministic navigation order, structural groups, and host-item anchors, and resolve those contributions through the admin shell without changing existing flat appended pages.

### Patch Changes

- Updated dependencies [bf71bca]
  - @voyant-travel/admin@0.134.0

## 0.13.0

### Minor Changes

- 5fa76aa: Publish the admin UI extension slot vocabulary from the contract package.

  `ADMIN_UI_EXTENSION_SLOTS` and `AdminUiExtensionSlot` now live in
  `@voyant-travel/admin-extension-sdk`, which is the dependency-free package an
  extension author already installs. `@voyant-travel/admin` and
  `@voyant-travel/apps` derive from it instead of restating it.

  The list was previously maintained twice — once in
  `packages/admin/src/ui-extensions/registry.ts` for the shell that renders the
  slots, and once in `packages/apps/src/contracts.ts` as the enum the manifest
  schema validates against. They agreed only by discipline, and a slot added to
  one would have been rejected by the schema or left unrendered by the shell.

  `@voyant-travel/admin` keeps exporting `ADMIN_UI_EXTENSION_SLOTS`,
  `AdminUiExtensionSlot`, and `isAdminUiExtensionSlot`, and `@voyant-travel/apps`
  keeps exporting `APP_ADMIN_EXTENSION_SLOTS`, so no consumer import changes.

### Patch Changes

- Updated dependencies [0c30250]
- Updated dependencies [5fa76aa]
  - @voyant-travel/core@0.137.0
  - @voyant-travel/admin-extension-sdk@0.3.0
  - @voyant-travel/admin@0.133.0
  - @voyant-travel/custom-fields@0.2.22
  - @voyant-travel/db@0.119.1
  - @voyant-travel/hono@0.138.1
  - @voyant-travel/webhook-delivery@0.5.10

## 0.12.17

### Patch Changes

- Updated dependencies [e87d4de]
  - @voyant-travel/hono@0.138.0
  - @voyant-travel/custom-fields@0.2.21
  - @voyant-travel/webhook-delivery@0.5.9
  - @voyant-travel/admin@0.132.0

## 0.12.16

### Patch Changes

- c30b6b0: Remove the `drizzle-orm` dependency from `@voyant-travel/finance-contracts`.

  `FinanceAppApiRuntime` took a concrete `PostgresJsDatabase` for a handle it only
  ever passes through — it never calls a method on it — which forced a Drizzle
  dependency into a package ADR-0002 requires to stay dependency-light. The handle
  is now a type parameter, `FinanceAppApiRuntime<TDatabase = unknown>`, and the
  implementing runtimes instantiate it as
  `FinanceAppApiRuntime<PostgresJsDatabase>`.

  Consumers that write the bare `FinanceAppApiRuntime` still compile; the handle
  resolves to `unknown` for them, so an implementer relying on the previous
  implicit `PostgresJsDatabase` should instantiate the parameter explicitly.

- Updated dependencies [c30b6b0]
- Updated dependencies [d92a98a]
  - @voyant-travel/finance-contracts@0.108.0
  - @voyant-travel/hono@0.137.0
  - @voyant-travel/custom-fields@0.2.20
  - @voyant-travel/webhook-delivery@0.5.8

## 0.12.15

### Patch Changes

- Updated dependencies [52c794d]
- Updated dependencies [52c794d]
- Updated dependencies [52c794d]
  - @voyant-travel/hono@0.136.0
  - @voyant-travel/custom-fields@0.2.19
  - @voyant-travel/webhook-delivery@0.5.7

## 0.12.14

### Patch Changes

- Updated dependencies [8adeb23]
- Updated dependencies [6d0b4b4]
- Updated dependencies [7496159]
- Updated dependencies [fa75fe3]
  - @voyant-travel/db@0.119.0
  - @voyant-travel/hono@0.135.0
  - @voyant-travel/custom-fields@0.2.18
  - @voyant-travel/types@0.109.10
  - @voyant-travel/webhook-delivery@0.5.6
  - @voyant-travel/admin@0.131.1

## 0.12.13

### Patch Changes

- @voyant-travel/admin@0.131.0

## 0.12.12

### Patch Changes

- Updated dependencies [1873611]
  - @voyant-travel/admin@0.130.0

## 0.12.11

### Patch Changes

- Updated dependencies [952d817]
  - @voyant-travel/core@0.136.0
  - @voyant-travel/custom-fields@0.2.17
  - @voyant-travel/db@0.118.5
  - @voyant-travel/hono@0.134.5
  - @voyant-travel/webhook-delivery@0.5.5
  - @voyant-travel/finance-contracts@0.107.3

## 0.12.10

### Patch Changes

- Updated dependencies [3651ff7]
  - @voyant-travel/core@0.135.0
  - @voyant-travel/custom-fields@0.2.16
  - @voyant-travel/db@0.118.4
  - @voyant-travel/hono@0.134.4
  - @voyant-travel/webhook-delivery@0.5.4

## 0.12.9

### Patch Changes

- Updated dependencies [b07a0a3]
  - @voyant-travel/core@0.134.0
  - @voyant-travel/custom-fields@0.2.15
  - @voyant-travel/db@0.118.3
  - @voyant-travel/hono@0.134.3
  - @voyant-travel/webhook-delivery@0.5.3

## 0.12.8

### Patch Changes

- Updated dependencies [bf548af]
- Updated dependencies [a6460e2]
- Updated dependencies [8a4f3cd]
  - @voyant-travel/core@0.133.0
  - @voyant-travel/custom-fields@0.2.14
  - @voyant-travel/db@0.118.2
  - @voyant-travel/hono@0.134.2
  - @voyant-travel/webhook-delivery@0.5.2

## 0.12.7

### Patch Changes

- 6b1e647: Add first-class operator webhook subscription settings, delivery history, test and replay actions, permission checks, secret redaction, and protected outbound delivery.

  Start the generic Postgres delivery worker only when the webhook module is selected, and compose the new settings surface into the standard operator package.

- Updated dependencies [6b1e647]
  - @voyant-travel/webhook-delivery@0.5.0

## 0.12.6

### Patch Changes

- Updated dependencies [90d44c0]
  - @voyant-travel/admin@0.129.0

## 0.12.5

### Patch Changes

- Updated dependencies [a668d0d]
  - @voyant-travel/core@0.132.0
  - @voyant-travel/custom-fields@0.2.13
  - @voyant-travel/db@0.118.1
  - @voyant-travel/hono@0.134.1
  - @voyant-travel/webhook-delivery@0.4.9

## 0.12.4

### Patch Changes

- Updated dependencies [f945310]
- Updated dependencies [9848276]
- Updated dependencies [dffbdad]
- Updated dependencies [f2c9404]
  - @voyant-travel/db@0.118.0
  - @voyant-travel/core@0.131.0
  - @voyant-travel/hono@0.134.0
  - @voyant-travel/custom-fields@0.2.12
  - @voyant-travel/types@0.109.9
  - @voyant-travel/webhook-delivery@0.4.8

## 0.12.3

### Patch Changes

- 34348fe: Support consented upgrades of existing managed Marketplace installations and reconcile legacy unsigned webhook subscriptions before activation.

## 0.12.2

### Patch Changes

- Updated dependencies [9db4363]
  - @voyant-travel/hono@0.133.0
  - @voyant-travel/custom-fields@0.2.11

## 0.12.1

### Patch Changes

- 2b6429d: Add a managed-only App API setup-completion operation whose app, release, and
  runtime-installation identity comes exclusively from the verified OAuth access
  token context.

## 0.12.0

### Minor Changes

- 406cebb: Add host-owned app webhook signing-key provisioning, confirmation-gated subscriptions, selected external-event durable intake, app-specific worker composition, a resident Node worker lifecycle, and server-authorized replay.

## 0.11.1

### Patch Changes

- Updated dependencies [b320e4f]
  - @voyant-travel/hono@0.132.0
  - @voyant-travel/custom-fields@0.2.10

## 0.11.0

### Minor Changes

- 2bcafc9: Render installed apps' full-page admin surfaces (`admin.pages[]`) as first-class operator sidebar entries with an icon and label, routing to `AppExtensionPage`.

  - Apps: add an optional app-declared nav `icon` (HTTPS-only) to each admin page plus an app-level default `icon` on the manifest, resolved into each page at normalize time; the resolver threads the icon through `ResolvedAppPage`.
  - Admin: add an optional runtime navigation hook (`AdminExtension.useRuntimeNavItems`) merged after static navigation; the shell calls it for every extension in stable order. The UI-extensions factory now contributes app-page nav entries and a single param route (`apps/$installationId/$pageKey`) that renders the matching installed page. Add `createRemoteNavIcon`, which renders the remote icon URL as a hardened `<img>` (no-referrer, lazy, decorative) with a generic lucide fallback on missing/invalid/broken images. The app-page route's "unavailable" copy is localized via the operator admin messages catalog, and its static route title accepts an optional localized `labels` override.
  - i18n: add `appPageTitle` and `appPageUnavailable` operator admin chrome messages (en + ro).

  Pausing or uninstalling an app drops its pages from the resolver, so both the nav entry and the route target disappear on the next query.

### Patch Changes

- Updated dependencies [2bcafc9]
  - @voyant-travel/admin@0.128.0

## 0.10.4

### Patch Changes

- Updated dependencies [43e7754]
  - @voyant-travel/db@0.117.0
  - @voyant-travel/custom-fields@0.2.9
  - @voyant-travel/hono@0.131.2
  - @voyant-travel/types@0.109.8
  - @voyant-travel/webhook-delivery@0.4.7

## 0.10.3

### Patch Changes

- Updated dependencies [abc32b6]
  - @voyant-travel/db@0.116.0
  - @voyant-travel/custom-fields@0.2.8
  - @voyant-travel/hono@0.131.1
  - @voyant-travel/types@0.109.7
  - @voyant-travel/webhook-delivery@0.4.6

## 0.10.2

### Patch Changes

- Updated dependencies [a160a81]
  - @voyant-travel/core@0.130.0
  - @voyant-travel/db@0.115.0
  - @voyant-travel/hono@0.131.0
  - @voyant-travel/custom-fields@0.2.7
  - @voyant-travel/webhook-delivery@0.4.5
  - @voyant-travel/types@0.109.6

## 0.10.1

### Patch Changes

- Updated dependencies [b8b25b7]
  - @voyant-travel/core@0.129.0
  - @voyant-travel/custom-fields@0.2.6
  - @voyant-travel/db@0.114.15
  - @voyant-travel/hono@0.130.1
  - @voyant-travel/webhook-delivery@0.4.4

## 0.10.0

### Minor Changes

- 6ccc360: Add the provider-neutral managed Marketplace acquisition port, opaque install-intent admission,
  signed setup-handoff contract, dynamic native consent disclosures, and browser-facing app OAuth
  approval with PKCE state and nonce preservation. Provision only the publisher-held OAuth client
  secret verifier and notify managed authority after Marketplace uninstall for signed cleanup.

## 0.9.1

### Patch Changes

- Updated dependencies [f6f22e7]
  - @voyant-travel/core@0.128.0
  - @voyant-travel/hono@0.130.0
  - @voyant-travel/custom-fields@0.2.5
  - @voyant-travel/db@0.114.14
  - @voyant-travel/webhook-delivery@0.4.3

## 0.9.0

### Minor Changes

- 9c06938: Bind managed remote-app OAuth and extension sessions to stable workload environments and per-app contract generations, and allow manifests to disclose publisher-custodied encrypted secrets.

### Patch Changes

- Updated dependencies [9c06938]
  - @voyant-travel/core@0.127.1
  - @voyant-travel/hono@0.129.2

## 0.8.0

### Minor Changes

- 96c91b9: Compose provider-neutral remote-app OAuth and session exchange from host-owned
  runtime inputs, add exact client-authenticated route posture, and augment app
  access-token resolution without replacing staff authentication.

### Patch Changes

- Updated dependencies [96c91b9]
  - @voyant-travel/hono@0.129.0
  - @voyant-travel/custom-fields@0.2.4

## 0.7.0

### Minor Changes

- d2d7384: Expose provider-neutral finance issuance hydration, external-reference writeback,
  and invoice/proforma issuance webhooks through the remote App API boundary.

### Patch Changes

- Updated dependencies [d2d7384]
  - @voyant-travel/finance-contracts@0.107.0

## 0.6.3

### Patch Changes

- Updated dependencies [117fa05]
  - @voyant-travel/core@0.127.0
  - @voyant-travel/custom-fields@0.2.3
  - @voyant-travel/db@0.114.13
  - @voyant-travel/hono@0.128.6
  - @voyant-travel/webhook-delivery@0.4.2

## 0.6.2

### Patch Changes

- Updated dependencies [698ddb6]
  - @voyant-travel/core@0.126.0
  - @voyant-travel/custom-fields@0.2.2
  - @voyant-travel/db@0.114.11
  - @voyant-travel/hono@0.128.4
  - @voyant-travel/webhook-delivery@0.4.1

## 0.6.1

### Patch Changes

- 5498853: Mount the apps module in the standard operator distribution and publish its runtime contributor and admin OpenAPI coverage.

## 0.6.0

### Minor Changes

- 5fe9918: Expose installation read-model and lifecycle admin routes (list/detail/audit, install, pause/resume/uninstall/activate, purge-preview) for the governance UI.
- 5fe9918: Add the app governance and developer admin UI (RFC Phase 2, "App Governance
  UI"). Introduces `@voyant-travel/apps-react`, a `*-react` package following the
  `custom-fields-react` conventions (query-options, provider, admin page
  registration, i18n): an Installed Apps list + detail surface (status, granted /
  optional / revoked scopes, contributed extensions, webhook subscription health,
  recent audit activity, active release + available/blocked updates with
  human-readable blocked reasons), pause / resume / uninstall (values-retained)
  and a separated privileged purge preview; an OAuth consent screen that renders
  required + individually-deniable optional grants and completes activation; and a
  permission-gated custom-app developer surface (create registration, validate and
  create releases, view/rotate credentials shown once, restricted install link,
  activate an ingested release). Registers a top-level "Apps" navigation module in
  the operator admin gated on the `apps` access resource. Extends the
  `@voyant-travel/apps` admin API with installation read-model and lifecycle
  routes backing the UI.

### Patch Changes

- 5fe9918: Resolve the install deployment id per request (body → `VOYANT_CLOUD_DEPLOYMENT_ID` env → construction option) so the standard runtime's Install App flow no longer fails with `app_deployment_required`, and make the restricted install link (`/apps?installApp=<id>`) open the app-preselected consent flow.

## 0.5.0

### Minor Changes

- a461920: Add the iframe admin session-token broker (RFC Phase 3): HKDF-signed,
  context-separated short-lived session tokens carrying issuer, app audience,
  installation, deployment, viewer, entity/slot context, iat/exp, and a unique
  token id. Issuance records the token id and audits it; the backend exchange
  verifies audience/deployment binding, consumes the token id once (rejecting
  replay, expiry, and context mismatch), and swaps it for online actor access via
  the existing OAuth actor-token-exchange primitive bounded by viewer ∩ app
  grants. Adds the `app_session_tokens` table (migration idx 4) and its TypeID
  prefix.

### Patch Changes

- Updated dependencies [a461920]
- Updated dependencies [a461920]
- Updated dependencies [a461920]
  - @voyant-travel/admin@0.127.0
  - @voyant-travel/admin-extension-sdk@0.2.0

## 0.4.0

### Minor Changes

- 3a90c27: Publish the first versioned remote App API surface with app-token routing,
  service-boundary installation and scope checks, custom-field owner isolation,
  finance action approval enforcement, webhook/audit self-read endpoints, and
  runtime app-token resolution.
- 3a90c27: Add remote app OAuth authorization, token, rotation, revocation, and app-token auth context support.

### Patch Changes

- 3a90c27: Mount the App API under `/v1/app/*` so its endpoints are reachable, enforce the token's own (possibly narrowed) scope set on every App API call, and treat resource/action `remoteSafe` flags as grantable during OAuth consent.
- Updated dependencies [3a90c27]
- Updated dependencies [3a90c27]
  - @voyant-travel/core@0.125.2
  - @voyant-travel/types@0.109.4
  - @voyant-travel/hono@0.128.3

## 0.3.0

### Minor Changes

- 9fc7801: Add remote app OAuth authorization, token, rotation, revocation, and app-token auth context support.

### Patch Changes

- Updated dependencies [9fc7801]
  - @voyant-travel/core@0.125.1
  - @voyant-travel/hono@0.128.2

## 0.2.0

### Minor Changes

- 04b031d: Deliver installed app webhook subscriptions through the durable webhook delivery plane with app envelopes, signing key rotation support, lifecycle-aware health, and replay helpers.
- 0868f18: Add the app registry foundation with closed manifest validation, deterministic release compilation, protected manifest ingestion, and admin API wiring.
- 027ca08: Add the app installation aggregate, lifecycle service, reconciliation tables, and TypeID prefixes for app installation records.

### Patch Changes

- Updated dependencies [04b031d]
- Updated dependencies [0868f18]
  - @voyant-travel/webhook-delivery@0.4.0
  - @voyant-travel/admin@0.126.2
