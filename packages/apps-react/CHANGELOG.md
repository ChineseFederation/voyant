# @voyant-travel/apps-react

## 0.10.0

### Patch Changes

- Updated dependencies [bf71bca]
  - @voyant-travel/admin@0.134.0

## 0.9.0

### Patch Changes

- Updated dependencies [5fa76aa]
  - @voyant-travel/admin@0.133.0

## 0.8.0

### Patch Changes

- @voyant-travel/admin@0.132.0

## 0.7.1

### Patch Changes

- Updated dependencies [7496159]
  - @voyant-travel/i18n@0.119.0
  - @voyant-travel/types@0.109.10
  - @voyant-travel/admin@0.131.1

## 0.7.0

### Patch Changes

- Updated dependencies [bf20d76]
  - @voyant-travel/ui@0.110.0
  - @voyant-travel/admin@0.131.0

## 0.6.0

### Patch Changes

- Updated dependencies [1873611]
  - @voyant-travel/admin@0.130.0
  - @voyant-travel/i18n@0.118.0

## 0.5.1

### Patch Changes

- e2cb9f5: Give every admin screen consistent page spacing. Previously each page invented
  its own padding (`p-6`, `px-6 py-6 lg:px-8`, `container mx-auto py-6` with no
  horizontal padding, or none at all), so screens like the booking engine had no
  spacing while others differed.

  The admin workspace layout now wraps the page outlet in a single padded content
  region (`px-4 py-6 md:px-6`), and the per-page root padding was removed so it no
  longer double-pads (max-width caps are kept). The full-height settings two-pane
  bleeds back out of that padding and re-applies its own so it stays edge-to-edge.

- e2cb9f5: Fix double page padding. The admin shell already applies consistent page
  padding around the content area, but a number of page and loading-skeleton
  components still added their own `p-6` on top, pushing their content ~24px
  further in than the page header and leaving pages inconsistently indented.
  Those redundant root paddings are removed so every page's content lines up with
  the header and with each other. Dialog, portal, and card paddings are
  unchanged.
- e2cb9f5: Make form and dialog select triggers full-width. The shared `SelectTrigger`
  defaults to `w-fit`, so selects that sit in a form or dialog next to full-width
  inputs rendered noticeably narrower. Add `w-full` at those call sites (filter
  popovers, dialogs, and stacked form fields). Toolbar and inline selects that
  carry an intentional fixed width are left unchanged.
- e2cb9f5: Align off-scale spacing utilities to the shared scale: gap-5 to gap-4, p-5 to
  p-6, space-y-5 to space-y-4, space-y-8 to space-y-6, p-10/p-12 to p-8, gap-8 to
  gap-6. Keeps spacing on the consistent 1/2/3/4/6/8 scale used across the app.
- Updated dependencies [e2cb9f5]
- Updated dependencies [e2cb9f5]
- Updated dependencies [e2cb9f5]
- Updated dependencies [e2cb9f5]
- Updated dependencies [e2cb9f5]
- Updated dependencies [e2cb9f5]
- Updated dependencies [e2cb9f5]
- Updated dependencies [e2cb9f5]
- Updated dependencies [e2cb9f5]
- Updated dependencies [e2cb9f5]
- Updated dependencies [e2cb9f5]
- Updated dependencies [e2cb9f5]
  - @voyant-travel/i18n@0.117.2
  - @voyant-travel/admin@0.129.1
  - @voyant-travel/ui@0.109.5

## 0.5.0

### Patch Changes

- Updated dependencies [90d44c0]
  - @voyant-travel/admin@0.129.0
  - @voyant-travel/i18n@0.117.0

## 0.4.4

### Patch Changes

- 34348fe: Support consented upgrades of existing managed Marketplace installations and reconcile legacy unsigned webhook subscriptions before activation.

## 0.4.3

### Patch Changes

- Updated dependencies [f0f51b4]
  - @voyant-travel/i18n@0.116.0
  - @voyant-travel/admin@0.128.3

## 0.4.2

### Patch Changes

- Updated dependencies [c2ca4a3]
  - @voyant-travel/i18n@0.115.0
  - @voyant-travel/admin@0.128.2

## 0.4.1

### Patch Changes

- Updated dependencies [ecf1680]
  - @voyant-travel/i18n@0.114.0
  - @voyant-travel/admin@0.128.1

## 0.4.0

### Patch Changes

- Updated dependencies [2bcafc9]
  - @voyant-travel/admin@0.128.0
  - @voyant-travel/i18n@0.113.0

## 0.3.2

### Patch Changes

- a145a8f: Deduplicate concurrent Marketplace install-intent resolution so the managed consent screen remains usable when it remounts during the handoff.
  - @voyant-travel/types@0.109.6

## 0.3.1

### Patch Changes

- 0f9bd93: Share host-owned human-readable permission labels between Marketplace discovery and managed consent.
- Updated dependencies [0f9bd93]
  - @voyant-travel/types@0.109.5

## 0.3.0

### Minor Changes

- 6ccc360: Add the provider-neutral managed Marketplace acquisition port, opaque install-intent admission,
  signed setup-handoff contract, dynamic native consent disclosures, and browser-facing app OAuth
  approval with PKCE state and nonce preservation. Provision only the publisher-held OAuth client
  secret verifier and notify managed authority after Marketplace uninstall for signed cleanup.

## 0.2.0

### Minor Changes

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
