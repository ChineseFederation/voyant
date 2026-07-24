# @voyant-travel/legal-react

## 0.200.0

### Minor Changes

- 952d817: Replace unsafe booking-contract document generation with the Legal-owned
  durable operation/provider protocol. Legacy generation routes and direct
  generator services and exports are removed. Standard Operator now selects and
  constructs the shipped provider from its exact database, document-storage, and
  renderer bindings; startup and action activation require behavioral provider
  preflight, and pending recovery fails loudly if that provider disappears.
  Local Standard document bytes now require probed, atomic filesystem durability,
  and the bundled renderer embeds a Latin Extended Unicode font. Custom font
  bytes are also supported by the basic PDF utility. Opaque renderer/S3
  transports require explicit backend identity. Remove the
  Notifications document-bundle lifecycle callbacks, fully-paid orchestration
  subscriber, and its Realtime invalidation declaration; document generation is
  available only through admitted Legal actions.

  Recognize transaction-bound outbox appends as durable domain-event emissions
  and publish the existing Trips requirement-sourcing event contracts.

### Patch Changes

- Updated dependencies [952d817]
  - @voyant-travel/legal@0.200.0
  - @voyant-travel/bookings-react@0.200.0
  - @voyant-travel/utils@0.110.0
  - @voyant-travel/distribution-react@0.190.0
  - @voyant-travel/commerce-react@0.82.0
  - @voyant-travel/inventory-react@0.82.0
  - @voyant-travel/relationships-react@0.200.0
  - @voyant-travel/ui@0.109.6

## 0.199.0

### Patch Changes

- @voyant-travel/legal@0.199.0
- @voyant-travel/bookings-react@0.199.0
- @voyant-travel/distribution-react@0.189.0
- @voyant-travel/commerce-react@0.81.0
- @voyant-travel/inventory-react@0.81.0
- @voyant-travel/relationships-react@0.199.0

## 0.198.1

### Patch Changes

- e2cb9f5: Clean up misused Card components. Cards that added their own vertical padding on
  top of the Card's built-in padding (double-padded content) now rely on the
  card's spacing, and the booking "Internal notes" card uses a proper card header
  and title instead of a label buried in the body. Empty-state, edge-to-edge, and
  image-tile cards are unchanged.
- e2cb9f5: Give every admin screen consistent page spacing. Previously each page invented
  its own padding (`p-6`, `px-6 py-6 lg:px-8`, `container mx-auto py-6` with no
  horizontal padding, or none at all), so screens like the booking engine had no
  spacing while others differed.

  The admin workspace layout now wraps the page outlet in a single padded content
  region (`px-4 py-6 md:px-6`), and the per-page root padding was removed so it no
  longer double-pads (max-width caps are kept). The full-height settings two-pane
  bleeds back out of that padding and re-applies its own so it stays edge-to-edge.

- e2cb9f5: Replace persistent "why this action is disabled" banners with hover tooltips on
  the disabled action. On the invoice detail, the "Only draft invoices can be
  deleted" banner is gone — hovering the disabled Delete button shows that reason
  instead. Same treatment for the contract send dialog's missing-recipient banner
  on the disabled Send button.
- e2cb9f5: Fix double page padding. The admin shell already applies consistent page
  padding around the content area, but a number of page and loading-skeleton
  components still added their own `p-6` on top, pushing their content ~24px
  further in than the page header and leaving pages inconsistently indented.
  Those redundant root paddings are removed so every page's content lines up with
  the header and with each other. Dialog, portal, and card paddings are
  unchanged.
- e2cb9f5: Move heavy multi-field forms from centered dialogs to side sheets. Create/edit
  forms with more than a handful of fields (invoices, bookings, travelers,
  markets, pricing rules, policies, suppliers, resources, legal templates,
  notification templates, and similar) were rendered as centered modals; per the
  dialog-vs-sheet guidance, complex multi-field editing belongs in a side sheet
  that keeps the parent screen visible. Confirmations, media viewers, and short
  one-to-three-field dialogs are unchanged.
- e2cb9f5: Make form-field grids responsive on mobile. Two-column (and three/four-column) field grids that previously rendered multiple columns at every width now stack to a single column on small screens and expand at the `sm`/`lg` breakpoints, so forms and dialogs are no longer cramped on phones.
- e2cb9f5: Plain-language copy pass across the admin UI. Rewrites microcopy on the
  non-developer screens so it reads for travel professionals rather than
  engineers: removes developer jargon (entity, tenant, adapter/connector,
  payload, sync/reconcile internals, raw database column names and code
  fragments), strips internal/roadmap notes that leaked into user copy, cuts
  verbose and redundant helper text, and aligns terminology to the canonical
  Ubiquitous Language (Traveler over pax/guest, Supplier, Quote/Quote Version,
  "record" instead of "entity") with consistent sentence case. English catalog
  copy only; ICU placeholders and en/ro key parity preserved.
- e2cb9f5: Simplify two admin forms for non-technical users. The cancellation-policy
  refund field now takes a plain percentage (0–100) instead of basis points
  (the value is still stored as basis points under the hood). The invoice
  attachment dialog no longer asks users to type system-derived metadata (MIME
  type, file size, checksum) — those fields are removed from the form.
- e2cb9f5: Bring the Romanian (ro) admin translations in line with the plain-language
  English copy pass — re-translating the updated strings so the Romanian UI drops
  the same jargon and reads as clearly as the English. Values only; en/ro key
  parity and ICU placeholders preserved.
- e2cb9f5: Replace native browser dialogs with styled UI-package dialogs across the admin
  surface. Adds `confirmDialog`/`ConfirmDialogHost` and `promptDialog`/
  `PromptDialogHost` to `@voyant-travel/ui`, mounts both hosts once in the
  operator admin shell, and migrates every `window.confirm`/`window.prompt` call
  and stray `window.alert` in the `*-react` packages to the styled equivalents
  (destructive confirmations rendered with the destructive action variant). Also
  fixes the event-catalog "selected event contracts" count to use ICU plural
  formatting.
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
  - @voyant-travel/inventory-react@0.80.1
  - @voyant-travel/commerce-react@0.80.1
  - @voyant-travel/bookings-react@0.198.1
  - @voyant-travel/relationships-react@0.198.1
  - @voyant-travel/admin@0.129.1
  - @voyant-travel/distribution-react@0.188.1
  - @voyant-travel/ui@0.109.5
  - @voyant-travel/legal@0.198.1

## 0.198.0

### Patch Changes

- @voyant-travel/legal@0.198.0
- @voyant-travel/relationships-react@0.198.0
- @voyant-travel/bookings-react@0.198.0
- @voyant-travel/inventory-react@0.80.0
- @voyant-travel/distribution-react@0.188.0
- @voyant-travel/commerce-react@0.80.0

## 0.197.0

### Patch Changes

- Updated dependencies [26b4c9a]
  - @voyant-travel/legal@0.197.0
  - @voyant-travel/commerce-react@0.79.0
  - @voyant-travel/bookings-react@0.197.0
  - @voyant-travel/relationships-react@0.197.0
  - @voyant-travel/inventory-react@0.79.0
  - @voyant-travel/distribution-react@0.187.0

## 0.196.0

### Patch Changes

- Updated dependencies [71c08aa]
- Updated dependencies [bba4fec]
- Updated dependencies [58020ec]
  - @voyant-travel/legal@0.196.0
  - @voyant-travel/distribution-react@0.186.0
  - @voyant-travel/bookings-react@0.196.0
  - @voyant-travel/inventory-react@0.78.0
  - @voyant-travel/commerce-react@0.78.0
  - @voyant-travel/relationships-react@0.196.0

## 0.195.0

### Patch Changes

- @voyant-travel/bookings-react@0.195.0
- @voyant-travel/legal@0.195.0
- @voyant-travel/distribution-react@0.185.0
- @voyant-travel/commerce-react@0.77.0
- @voyant-travel/inventory-react@0.77.0
- @voyant-travel/relationships-react@0.195.0

## 0.194.0

### Patch Changes

- @voyant-travel/bookings-react@0.194.0
- @voyant-travel/distribution-react@0.184.0
- @voyant-travel/commerce-react@0.76.0
- @voyant-travel/inventory-react@0.76.0
- @voyant-travel/relationships-react@0.194.0
- @voyant-travel/legal@0.194.0

## 0.193.0

### Patch Changes

- Updated dependencies [90d44c0]
  - @voyant-travel/admin@0.129.0
  - @voyant-travel/i18n@0.117.0
  - @voyant-travel/inventory-react@0.75.0
  - @voyant-travel/bookings-react@0.193.0
  - @voyant-travel/legal@0.193.0
  - @voyant-travel/commerce-react@0.75.0
  - @voyant-travel/distribution-react@0.183.0
  - @voyant-travel/relationships-react@0.193.0

## 0.192.1

### Patch Changes

- @voyant-travel/legal@0.192.1
- @voyant-travel/bookings-react@0.192.1
- @voyant-travel/distribution-react@0.182.1

## 0.192.0

### Patch Changes

- @voyant-travel/bookings-react@0.192.0
- @voyant-travel/inventory-react@0.74.0
- @voyant-travel/distribution-react@0.182.0
- @voyant-travel/commerce-react@0.74.0
- @voyant-travel/relationships-react@0.192.0
- @voyant-travel/legal@0.192.0

## 0.191.0

### Patch Changes

- @voyant-travel/bookings-react@0.191.0
- @voyant-travel/inventory-react@0.73.0
- @voyant-travel/legal@0.191.0
- @voyant-travel/distribution-react@0.181.0
- @voyant-travel/commerce-react@0.73.0
- @voyant-travel/relationships-react@0.191.0

## 0.190.0

### Patch Changes

- @voyant-travel/bookings-react@0.190.0
- @voyant-travel/legal@0.190.0
- @voyant-travel/commerce-react@0.72.0
- @voyant-travel/types@0.109.9
- @voyant-travel/distribution-react@0.180.0
- @voyant-travel/inventory-react@0.72.0
- @voyant-travel/relationships-react@0.190.0

## 0.189.0

### Patch Changes

- @voyant-travel/bookings-react@0.189.0
- @voyant-travel/inventory-react@0.71.0
- @voyant-travel/distribution-react@0.179.0
- @voyant-travel/commerce-react@0.71.0
- @voyant-travel/relationships-react@0.189.0
- @voyant-travel/legal@0.189.0

## 0.188.0

### Patch Changes

- Updated dependencies [9db4363]
  - @voyant-travel/utils@0.109.0
  - @voyant-travel/legal@0.188.0
  - @voyant-travel/commerce-react@0.70.0
  - @voyant-travel/inventory-react@0.70.0
  - @voyant-travel/relationships-react@0.188.0
  - @voyant-travel/ui@0.109.4
  - @voyant-travel/bookings-react@0.188.0
  - @voyant-travel/distribution-react@0.178.0

## 0.187.1

### Patch Changes

- @voyant-travel/legal@0.187.1

## 0.187.0

### Patch Changes

- Updated dependencies [0b7f213]
  - @voyant-travel/inventory-react@0.69.0
  - @voyant-travel/bookings-react@0.187.0
  - @voyant-travel/commerce-react@0.69.0
  - @voyant-travel/distribution-react@0.177.0
  - @voyant-travel/relationships-react@0.187.0
  - @voyant-travel/legal@0.187.0

## 0.186.0

### Patch Changes

- Updated dependencies [5af8682]
  - @voyant-travel/inventory-react@0.68.0
  - @voyant-travel/bookings-react@0.186.0
  - @voyant-travel/commerce-react@0.68.0
  - @voyant-travel/distribution-react@0.176.0
  - @voyant-travel/relationships-react@0.186.0
  - @voyant-travel/legal@0.186.0

## 0.185.0

### Patch Changes

- @voyant-travel/bookings-react@0.185.0
- @voyant-travel/inventory-react@0.67.0
- @voyant-travel/legal@0.185.0
- @voyant-travel/distribution-react@0.175.0
- @voyant-travel/commerce-react@0.67.0
- @voyant-travel/relationships-react@0.185.0

## 0.184.0

### Patch Changes

- Updated dependencies [a33c590]
  - @voyant-travel/inventory-react@0.66.0
  - @voyant-travel/bookings-react@0.184.0
  - @voyant-travel/commerce-react@0.66.0
  - @voyant-travel/distribution-react@0.174.0
  - @voyant-travel/relationships-react@0.184.0
  - @voyant-travel/legal@0.184.0

## 0.183.0

### Patch Changes

- @voyant-travel/bookings-react@0.183.0
- @voyant-travel/inventory-react@0.65.0
- @voyant-travel/distribution-react@0.173.0
- @voyant-travel/commerce-react@0.65.0
- @voyant-travel/relationships-react@0.183.0
- @voyant-travel/legal@0.183.0

## 0.182.4

### Patch Changes

- Updated dependencies [f0f51b4]
  - @voyant-travel/i18n@0.116.0
  - @voyant-travel/admin@0.128.3
  - @voyant-travel/bookings-react@0.182.2
  - @voyant-travel/commerce-react@0.64.1
  - @voyant-travel/distribution-react@0.172.2
  - @voyant-travel/inventory-react@0.64.1
  - @voyant-travel/relationships-react@0.182.1
  - @voyant-travel/legal@0.182.4

## 0.182.3

### Patch Changes

- @voyant-travel/legal@0.182.3
- @voyant-travel/bookings-react@0.182.1
- @voyant-travel/distribution-react@0.172.1

## 0.182.2

### Patch Changes

- @voyant-travel/legal@0.182.2

## 0.182.1

### Patch Changes

- @voyant-travel/legal@0.182.1

## 0.182.0

### Patch Changes

- @voyant-travel/bookings-react@0.182.0
- @voyant-travel/inventory-react@0.64.0
- @voyant-travel/distribution-react@0.172.0
- @voyant-travel/commerce-react@0.64.0
- @voyant-travel/relationships-react@0.182.0
- @voyant-travel/legal@0.182.0

## 0.181.1

### Patch Changes

- @voyant-travel/legal@0.181.1

## 0.181.0

### Patch Changes

- Updated dependencies [464815c]
  - @voyant-travel/i18n@0.115.1
  - @voyant-travel/legal@0.181.0
  - @voyant-travel/bookings-react@0.181.0
  - @voyant-travel/inventory-react@0.63.0
  - @voyant-travel/distribution-react@0.171.0
  - @voyant-travel/commerce-react@0.63.0
  - @voyant-travel/relationships-react@0.181.0

## 0.180.1

### Patch Changes

- Updated dependencies [c2ca4a3]
  - @voyant-travel/i18n@0.115.0
  - @voyant-travel/legal@0.180.1
  - @voyant-travel/admin@0.128.2
  - @voyant-travel/bookings-react@0.180.1
  - @voyant-travel/commerce-react@0.62.1
  - @voyant-travel/distribution-react@0.170.1
  - @voyant-travel/inventory-react@0.62.1
  - @voyant-travel/relationships-react@0.180.1

## 0.180.0

### Patch Changes

- Updated dependencies [ecf1680]
  - @voyant-travel/i18n@0.114.0
  - @voyant-travel/legal@0.180.0
  - @voyant-travel/bookings-react@0.180.0
  - @voyant-travel/inventory-react@0.62.0
  - @voyant-travel/admin@0.128.1
  - @voyant-travel/commerce-react@0.62.0
  - @voyant-travel/distribution-react@0.170.0
  - @voyant-travel/relationships-react@0.180.0

## 0.179.0

### Patch Changes

- @voyant-travel/bookings-react@0.179.0
- @voyant-travel/inventory-react@0.61.0
- @voyant-travel/distribution-react@0.169.0
- @voyant-travel/commerce-react@0.61.0
- @voyant-travel/relationships-react@0.179.0
- @voyant-travel/legal@0.179.0

## 0.178.0

### Patch Changes

- Updated dependencies [2bcafc9]
  - @voyant-travel/admin@0.128.0
  - @voyant-travel/i18n@0.113.0
  - @voyant-travel/bookings-react@0.178.0
  - @voyant-travel/commerce-react@0.60.0
  - @voyant-travel/distribution-react@0.168.0
  - @voyant-travel/inventory-react@0.60.0
  - @voyant-travel/relationships-react@0.178.0
  - @voyant-travel/legal@0.178.0

## 0.177.0

### Patch Changes

- @voyant-travel/legal@0.177.0
- @voyant-travel/types@0.109.8
- @voyant-travel/bookings-react@0.177.0
- @voyant-travel/inventory-react@0.59.0
- @voyant-travel/distribution-react@0.167.0
- @voyant-travel/commerce-react@0.59.0
- @voyant-travel/relationships-react@0.177.0

## 0.176.0

### Patch Changes

- @voyant-travel/legal@0.176.0
- @voyant-travel/types@0.109.7
- @voyant-travel/bookings-react@0.176.0
- @voyant-travel/inventory-react@0.58.0
- @voyant-travel/distribution-react@0.166.0
- @voyant-travel/commerce-react@0.58.0
- @voyant-travel/relationships-react@0.176.0

## 0.175.0

### Patch Changes

- @voyant-travel/bookings-react@0.175.0
- @voyant-travel/legal@0.175.0
- @voyant-travel/types@0.109.6
- @voyant-travel/inventory-react@0.57.0
- @voyant-travel/distribution-react@0.165.0
- @voyant-travel/commerce-react@0.57.0
- @voyant-travel/relationships-react@0.175.0

## 0.174.0

### Patch Changes

- @voyant-travel/legal@0.174.0
- @voyant-travel/bookings-react@0.174.0
- @voyant-travel/inventory-react@0.56.0
- @voyant-travel/distribution-react@0.164.0
- @voyant-travel/commerce-react@0.56.0
- @voyant-travel/relationships-react@0.174.0

## 0.173.0

### Patch Changes

- @voyant-travel/bookings-react@0.173.0
- @voyant-travel/inventory-react@0.55.0
- @voyant-travel/distribution-react@0.163.0
- @voyant-travel/commerce-react@0.55.0
- @voyant-travel/relationships-react@0.173.0
- @voyant-travel/legal@0.173.0

## 0.172.0

### Patch Changes

- Updated dependencies [f6f22e7]
  - @voyant-travel/utils@0.108.0
  - @voyant-travel/bookings-react@0.172.0
  - @voyant-travel/legal@0.172.0
  - @voyant-travel/inventory-react@0.54.0
  - @voyant-travel/commerce-react@0.54.0
  - @voyant-travel/relationships-react@0.172.0
  - @voyant-travel/ui@0.109.3
  - @voyant-travel/distribution-react@0.162.0

## 0.171.1

### Patch Changes

- @voyant-travel/legal@0.171.1
- @voyant-travel/bookings-react@0.171.1
- @voyant-travel/distribution-react@0.161.1

## 0.171.0

### Patch Changes

- @voyant-travel/bookings-react@0.171.0
- @voyant-travel/inventory-react@0.53.0
- @voyant-travel/legal@0.171.0
- @voyant-travel/distribution-react@0.161.0
- @voyant-travel/commerce-react@0.53.0
- @voyant-travel/relationships-react@0.171.0

## 0.170.0

### Minor Changes

- 117fa05: Generate managed-deployment contracts from operator-authored default templates and number series without deployment-specific workflows. Add reusable light- and dark-mode horizontal logo and icon assets to Operator Profile, expose them to contract templates, and provide accessible drag-and-drop upload controls. Introduce a shared document-renderer port and zero-code HTTP adapter so managed deployments can use a private platform renderer while self-hosters can swap in their own renderer for contracts and brochures.

### Patch Changes

- Updated dependencies [117fa05]
  - @voyant-travel/i18n@0.112.1
  - @voyant-travel/legal@0.170.0
  - @voyant-travel/bookings-react@0.170.0
  - @voyant-travel/inventory-react@0.52.0
  - @voyant-travel/distribution-react@0.160.0
  - @voyant-travel/commerce-react@0.52.0
  - @voyant-travel/relationships-react@0.170.0

## 0.169.1

### Patch Changes

- @voyant-travel/legal@0.169.1
- @voyant-travel/bookings-react@0.169.1
- @voyant-travel/distribution-react@0.159.1

## 0.169.0

### Patch Changes

- Updated dependencies [a461920]
- Updated dependencies [a461920]
  - @voyant-travel/admin@0.127.0
  - @voyant-travel/bookings-react@0.169.0
  - @voyant-travel/commerce-react@0.51.0
  - @voyant-travel/distribution-react@0.159.0
  - @voyant-travel/inventory-react@0.51.0
  - @voyant-travel/relationships-react@0.169.0
  - @voyant-travel/legal@0.169.0

## 0.168.0

### Patch Changes

- @voyant-travel/bookings-react@0.168.0
- @voyant-travel/inventory-react@0.50.0
- @voyant-travel/legal@0.168.0
- @voyant-travel/distribution-react@0.158.0
- @voyant-travel/commerce-react@0.50.0
- @voyant-travel/relationships-react@0.168.0

## 0.167.0

### Patch Changes

- @voyant-travel/commerce-react@0.49.0
- @voyant-travel/legal@0.167.0
- @voyant-travel/bookings-react@0.167.0
- @voyant-travel/inventory-react@0.49.0
- @voyant-travel/distribution-react@0.157.0
- @voyant-travel/relationships-react@0.167.0

## 0.166.0

### Patch Changes

- Updated dependencies [0868f18]
- Updated dependencies [3062a73]
  - @voyant-travel/admin@0.126.2
  - @voyant-travel/i18n@0.112.0
  - @voyant-travel/commerce-react@0.48.0
  - @voyant-travel/legal@0.166.0
  - @voyant-travel/bookings-react@0.166.0
  - @voyant-travel/inventory-react@0.48.0
  - @voyant-travel/distribution-react@0.156.0
  - @voyant-travel/relationships-react@0.166.0

## 0.165.0

### Patch Changes

- @voyant-travel/bookings-react@0.165.0
- @voyant-travel/inventory-react@0.47.0
- @voyant-travel/legal@0.165.0
- @voyant-travel/distribution-react@0.155.0
- @voyant-travel/commerce-react@0.47.0
- @voyant-travel/relationships-react@0.165.0

## 0.164.0

### Patch Changes

- @voyant-travel/bookings-react@0.164.0
- @voyant-travel/distribution-react@0.154.0
- @voyant-travel/commerce-react@0.46.0
- @voyant-travel/inventory-react@0.46.0
- @voyant-travel/relationships-react@0.164.0
- @voyant-travel/legal@0.164.0

## 0.163.0

### Patch Changes

- Updated dependencies [52352c4]
- Updated dependencies [52352c4]
  - @voyant-travel/relationships-react@0.163.0
  - @voyant-travel/bookings-react@0.163.0
  - @voyant-travel/legal@0.163.0
  - @voyant-travel/distribution-react@0.153.0
  - @voyant-travel/inventory-react@0.45.0
  - @voyant-travel/commerce-react@0.45.0

## 0.162.2

### Patch Changes

- 7a7fd97: Strengthen the internationalization platform across the operator and package UI.

  Add ICU message formatting, explicit locale and time-zone formatters, hierarchical
  locale fallback, validated runtime overrides, account-authoritative preferences,
  localized setup and navigation surfaces, and fail-closed catalog and UI-literal
  checks. Package message providers now accept an optional time zone and expose the
  shared formatting capabilities to package-owned UI.

- Updated dependencies [7a7fd97]
  - @voyant-travel/admin@0.126.1
  - @voyant-travel/bookings-react@0.162.2
  - @voyant-travel/commerce-react@0.44.1
  - @voyant-travel/distribution-react@0.152.1
  - @voyant-travel/i18n@0.111.3
  - @voyant-travel/inventory-react@0.44.1
  - @voyant-travel/relationships-react@0.162.1
  - @voyant-travel/legal@0.162.2

## 0.162.1

### Patch Changes

- Updated dependencies [5941d2c]
  - @voyant-travel/i18n@0.111.2
  - @voyant-travel/legal@0.162.1
  - @voyant-travel/bookings-react@0.162.1

## 0.162.0

### Patch Changes

- Updated dependencies [8f0fa26]
  - @voyant-travel/legal@0.162.0
  - @voyant-travel/bookings-react@0.162.0
  - @voyant-travel/commerce-react@0.44.0
  - @voyant-travel/distribution-react@0.152.0
  - @voyant-travel/inventory-react@0.44.0
  - @voyant-travel/relationships-react@0.162.0

## 0.161.0

### Patch Changes

- Updated dependencies [c1e37f2]
  - @voyant-travel/admin@0.126.0
  - @voyant-travel/bookings-react@0.161.0
  - @voyant-travel/commerce-react@0.43.0
  - @voyant-travel/distribution-react@0.151.0
  - @voyant-travel/inventory-react@0.43.0
  - @voyant-travel/relationships-react@0.161.0
  - @voyant-travel/legal@0.161.0

## 0.160.0

### Patch Changes

- Updated dependencies [33cc782]
  - @voyant-travel/legal@0.160.0
  - @voyant-travel/bookings-react@0.160.0
  - @voyant-travel/inventory-react@0.42.0
  - @voyant-travel/commerce-react@0.42.0
  - @voyant-travel/distribution-react@0.150.0
  - @voyant-travel/relationships-react@0.160.0

## 0.159.0

### Patch Changes

- Updated dependencies [766d24b]
- Updated dependencies [7e9f77a]
- Updated dependencies [49f55d0]
- Updated dependencies [82ffd12]
- Updated dependencies [6147b93]
- Updated dependencies [b459761]
  - @voyant-travel/ui@0.109.2
  - @voyant-travel/distribution-react@0.149.0
  - @voyant-travel/inventory-react@0.41.0
  - @voyant-travel/admin@0.125.0
  - @voyant-travel/bookings-react@0.159.0
  - @voyant-travel/commerce-react@0.41.0
  - @voyant-travel/relationships-react@0.159.0
  - @voyant-travel/legal@0.159.0

## 0.158.0

### Patch Changes

- 73ab096: Standardize first-party packages on package-owned deployment manifests, provider selection,
  access metadata, concrete event contracts, selected admin navigation, and published runtime
  references. Add Bookings Extras as an independently selected graph unit and remove the central
  admin navigation catalog.
  Link facets now distinguish entity `linkable` metadata from executable `definition` exports, and
  generated Node registries reject malformed definitions before service registration.
  Provider-owned required config and secrets now apply only when that provider is selected, so
  local and in-memory deployments do not require credentials for inactive remote providers.
- Updated dependencies [73ab096]
  - @voyant-travel/admin@0.124.0
  - @voyant-travel/distribution-react@0.148.0
  - @voyant-travel/bookings-react@0.158.0
  - @voyant-travel/commerce-react@0.40.0
  - @voyant-travel/inventory-react@0.40.0
  - @voyant-travel/legal@0.158.0
  - @voyant-travel/relationships-react@0.158.0
  - @voyant-travel/types@0.109.2

## 0.157.0

### Patch Changes

- @voyant-travel/bookings-react@0.157.0
- @voyant-travel/inventory-react@0.39.0
- @voyant-travel/distribution-react@0.147.0
- @voyant-travel/commerce-react@0.39.0
- @voyant-travel/relationships-react@0.157.0
- @voyant-travel/legal@0.157.0

## 0.156.1

### Patch Changes

- 8d62a7c: Republish every affected TypeScript package without broken declaration maps so the corrected artifact
  policy reaches npm instead of applying only to future incidental package releases.
- Updated dependencies [8d62a7c]
- Updated dependencies [8d62a7c]
  - @voyant-travel/commerce-react@0.38.1
  - @voyant-travel/types@0.109.1
  - @voyant-travel/utils@0.107.1
  - @voyant-travel/admin@0.123.3
  - @voyant-travel/bookings-react@0.156.1
  - @voyant-travel/distribution-react@0.146.1
  - @voyant-travel/i18n@0.111.1
  - @voyant-travel/inventory-react@0.38.1
  - @voyant-travel/legal@0.156.1
  - @voyant-travel/react@0.104.2
  - @voyant-travel/relationships-react@0.156.1
  - @voyant-travel/ui@0.109.1

## 0.156.0

### Patch Changes

- Updated dependencies [bbe6396]
  - @voyant-travel/bookings-react@0.156.0
  - @voyant-travel/i18n@0.111.0
  - @voyant-travel/inventory-react@0.38.0
  - @voyant-travel/legal@0.156.0
  - @voyant-travel/distribution-react@0.146.0
  - @voyant-travel/admin@0.123.2
  - @voyant-travel/commerce-react@0.38.0
  - @voyant-travel/relationships-react@0.156.0

## 0.155.1

### Patch Changes

- Updated dependencies [cc85042]
  - @voyant-travel/legal@0.155.1
  - @voyant-travel/bookings-react@0.155.1
  - @voyant-travel/distribution-react@0.145.1

## 0.155.0

### Patch Changes

- Updated dependencies [bb6e890]
  - @voyant-travel/legal@0.155.0
  - @voyant-travel/bookings-react@0.155.0
  - @voyant-travel/inventory-react@0.37.0
  - @voyant-travel/distribution-react@0.145.0
  - @voyant-travel/commerce-react@0.37.0
  - @voyant-travel/relationships-react@0.155.0

## 0.154.0

### Patch Changes

- 8bd906f: Breaking beta cleanup: remove the deprecated `onInsertVariable` and
  `onInsertSnippet` props from `ContractTemplateAuthoringHelp`. The helper only
  supports copying template values and snippets to the clipboard; consumers
  should remove these ignored callbacks. Also remove the inert Legal and
  Notifications caller wiring.
- Updated dependencies [4d0eeed]
- Updated dependencies [8bd906f]
  - @voyant-travel/types@0.109.0
  - @voyant-travel/utils@0.107.0
  - @voyant-travel/legal@0.154.0
  - @voyant-travel/ui@0.109.0
  - @voyant-travel/admin@0.123.0
  - @voyant-travel/bookings-react@0.154.0
  - @voyant-travel/commerce-react@0.36.0
  - @voyant-travel/distribution-react@0.144.0
  - @voyant-travel/inventory-react@0.36.0
  - @voyant-travel/relationships-react@0.154.0

## 0.153.0

### Patch Changes

- 490d132: Move standard first-party admin factories, package copy, slots, contributions, and icons into selected deployment graph composition.
- Updated dependencies [047c3f9]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [c65b05c]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
  - @voyant-travel/legal@0.153.0
  - @voyant-travel/bookings-react@0.153.0
  - @voyant-travel/admin@0.122.0
  - @voyant-travel/commerce-react@0.35.0
  - @voyant-travel/distribution-react@0.143.0
  - @voyant-travel/relationships-react@0.153.0
  - @voyant-travel/inventory-react@0.35.0
  - @voyant-travel/types@0.108.1

## 0.152.0

### Patch Changes

- Updated dependencies [a799a34]
- Updated dependencies [d771be3]
- Updated dependencies [d771be3]
  - @voyant-travel/legal@0.152.0
  - @voyant-travel/types@0.108.0
  - @voyant-travel/admin@0.121.0
  - @voyant-travel/commerce-react@0.34.0
  - @voyant-travel/relationships-react@0.152.0
  - @voyant-travel/bookings-react@0.152.0
  - @voyant-travel/distribution-react@0.142.0
  - @voyant-travel/inventory-react@0.34.0
  - @voyant-travel/utils@0.106.1

## 0.151.4

### Patch Changes

- @voyant-travel/legal@0.151.4
- @voyant-travel/bookings-react@0.151.5
- @voyant-travel/distribution-react@0.141.5

## 0.151.3

### Patch Changes

- @voyant-travel/legal@0.151.3
- @voyant-travel/types@0.107.3
- @voyant-travel/bookings-react@0.151.4
- @voyant-travel/distribution-react@0.141.4

## 0.151.2

### Patch Changes

- @voyant-travel/legal@0.151.2
- @voyant-travel/bookings-react@0.151.3
- @voyant-travel/distribution-react@0.141.3

## 0.151.1

### Patch Changes

- @voyant-travel/legal@0.151.1
- @voyant-travel/bookings-react@0.151.1
- @voyant-travel/distribution-react@0.141.1

## 0.151.0

### Patch Changes

- Updated dependencies [a370024]
- Updated dependencies [e3dc5a9]
- Updated dependencies [a370024]
- Updated dependencies [e3dc5a9]
  - @voyant-travel/legal@0.151.0
  - @voyant-travel/commerce-react@0.33.0
  - @voyant-travel/inventory-react@0.33.0
  - @voyant-travel/bookings-react@0.151.0
  - @voyant-travel/distribution-react@0.141.0
  - @voyant-travel/types@0.107.2
  - @voyant-travel/relationships-react@0.151.0

## 0.150.0

### Patch Changes

- @voyant-travel/bookings-react@0.150.0
- @voyant-travel/legal@0.150.0
- @voyant-travel/distribution-react@0.140.0
- @voyant-travel/commerce-react@0.32.0
- @voyant-travel/inventory-react@0.32.0
- @voyant-travel/relationships-react@0.150.0

## 0.149.1

### Patch Changes

- Updated dependencies [5e1d221]
  - @voyant-travel/legal@0.149.1
  - @voyant-travel/bookings-react@0.149.1
  - @voyant-travel/distribution-react@0.139.1

## 0.149.0

### Patch Changes

- Updated dependencies [a97e845]
  - @voyant-travel/admin@0.120.0
  - @voyant-travel/bookings-react@0.149.0
  - @voyant-travel/commerce-react@0.31.0
  - @voyant-travel/distribution-react@0.139.0
  - @voyant-travel/inventory-react@0.31.0
  - @voyant-travel/relationships-react@0.149.0
  - @voyant-travel/legal@0.149.0

## 0.148.0

### Patch Changes

- Updated dependencies [8a665f3]
  - @voyant-travel/admin@0.119.0
  - @voyant-travel/bookings-react@0.148.0
  - @voyant-travel/commerce-react@0.30.0
  - @voyant-travel/distribution-react@0.138.0
  - @voyant-travel/inventory-react@0.30.0
  - @voyant-travel/relationships-react@0.148.0
  - @voyant-travel/legal@0.148.0

## 0.147.0

### Patch Changes

- @voyant-travel/admin@0.118.0
- @voyant-travel/bookings-react@0.147.0
- @voyant-travel/commerce-react@0.29.0
- @voyant-travel/distribution-react@0.137.0
- @voyant-travel/inventory-react@0.29.0
- @voyant-travel/relationships-react@0.147.0
- @voyant-travel/legal@0.147.0

## 0.146.0

### Patch Changes

- Updated dependencies [ecdf0fc]
  - @voyant-travel/admin@0.117.0
  - @voyant-travel/bookings-react@0.146.0
  - @voyant-travel/commerce-react@0.28.0
  - @voyant-travel/distribution-react@0.136.0
  - @voyant-travel/inventory-react@0.28.0
  - @voyant-travel/relationships-react@0.146.0
  - @voyant-travel/legal@0.146.0

## 0.145.0

### Patch Changes

- @voyant-travel/bookings-react@0.145.0
- @voyant-travel/distribution-react@0.135.0
- @voyant-travel/inventory-react@0.27.0
- @voyant-travel/commerce-react@0.27.0
- @voyant-travel/relationships-react@0.145.0
- @voyant-travel/legal@0.145.0

## 0.144.0

### Patch Changes

- @voyant-travel/bookings-react@0.144.0
- @voyant-travel/legal@0.144.0
- @voyant-travel/distribution-react@0.134.0
- @voyant-travel/commerce-react@0.26.0
- @voyant-travel/inventory-react@0.26.0
- @voyant-travel/relationships-react@0.144.0

## 0.143.0

### Patch Changes

- Updated dependencies [425f92e]
  - @voyant-travel/utils@0.106.0
  - @voyant-travel/commerce-react@0.25.0
  - @voyant-travel/inventory-react@0.25.0
  - @voyant-travel/legal@0.143.0
  - @voyant-travel/relationships-react@0.143.0
  - @voyant-travel/ui@0.108.11
  - @voyant-travel/types@0.107.1
  - @voyant-travel/bookings-react@0.143.0
  - @voyant-travel/distribution-react@0.133.0

## 0.142.0

### Patch Changes

- @voyant-travel/commerce-react@0.24.0
- @voyant-travel/bookings-react@0.142.0
- @voyant-travel/distribution-react@0.132.0
- @voyant-travel/inventory-react@0.24.0
- @voyant-travel/relationships-react@0.142.0
- @voyant-travel/legal@0.142.0

## 0.141.0

### Patch Changes

- @voyant-travel/bookings-react@0.141.0
- @voyant-travel/inventory-react@0.23.0
- @voyant-travel/distribution-react@0.131.0
- @voyant-travel/commerce-react@0.23.0
- @voyant-travel/relationships-react@0.141.0
- @voyant-travel/legal@0.141.0

## 0.140.0

### Patch Changes

- Updated dependencies [62e87ee]
  - @voyant-travel/admin@0.116.0
  - @voyant-travel/i18n@0.110.0
  - @voyant-travel/bookings-react@0.140.0
  - @voyant-travel/commerce-react@0.22.0
  - @voyant-travel/distribution-react@0.130.0
  - @voyant-travel/inventory-react@0.22.0
  - @voyant-travel/relationships-react@0.140.0
  - @voyant-travel/legal@0.140.0

## 0.139.0

### Patch Changes

- Updated dependencies [c9a356f]
- Updated dependencies [7d4a405]
- Updated dependencies [2613dfb]
- Updated dependencies [a45a0d3]
- Updated dependencies [f3b8bef]
- Updated dependencies [fcad28b]
  - @voyant-travel/types@0.107.0
  - @voyant-travel/commerce-react@0.21.0
  - @voyant-travel/distribution-react@0.129.0
  - @voyant-travel/relationships-react@0.139.0
  - @voyant-travel/admin@0.115.4
  - @voyant-travel/bookings-react@0.139.0
  - @voyant-travel/inventory-react@0.21.0
  - @voyant-travel/legal@0.139.0
  - @voyant-travel/utils@0.105.6

## 0.138.2

### Patch Changes

- Updated dependencies [f1090b7]
- Updated dependencies [42f662c]
  - @voyant-travel/i18n@0.109.8
  - @voyant-travel/legal@0.138.2
  - @voyant-travel/bookings-react@0.138.6
  - @voyant-travel/distribution-react@0.128.4

## 0.138.1

### Patch Changes

- Updated dependencies [b254511]
- Updated dependencies [141bd2b]
  - @voyant-travel/bookings-react@0.138.5
  - @voyant-travel/ui@0.108.10
  - @voyant-travel/legal@0.138.1
  - @voyant-travel/distribution-react@0.128.3

## 0.138.0

### Patch Changes

- @voyant-travel/distribution-react@0.128.0
- @voyant-travel/legal@0.138.0
- @voyant-travel/bookings-react@0.138.0
- @voyant-travel/commerce-react@0.20.0
- @voyant-travel/inventory-react@0.20.0
- @voyant-travel/relationships-react@0.138.0

## 0.137.9

### Patch Changes

- Updated dependencies [14845ee]
- Updated dependencies [04aa601]
  - @voyant-travel/distribution-react@0.127.3
  - @voyant-travel/i18n@0.109.6
  - @voyant-travel/legal@0.137.9

## 0.137.8

### Patch Changes

- Updated dependencies [cb8df9c]
- Updated dependencies [f6c8fcf]
- Updated dependencies [1d65f48]
  - @voyant-travel/bookings-react@0.137.6
  - @voyant-travel/legal@0.137.8

## 0.137.7

### Patch Changes

- Updated dependencies [5288b85]
- Updated dependencies [cc29167]
  - @voyant-travel/legal@0.137.7

## 0.137.6

### Patch Changes

- Updated dependencies [5928f32]
  - @voyant-travel/legal@0.137.6

## 0.137.5

### Patch Changes

- 7b82e5a: Navigate contract detail users back to the contracts list after deleting a draft or void contract.
- 8466f47: Fix the legal number series create dialog preview so edited pad length values render immediately.
- 8f2a6d9: Add accessible names and hover titles to legal template and number-series row action buttons.
- 53f949c: Filter legal policy detail acceptances by the current policy so unrelated policy version acceptances are not shown.
- Updated dependencies [53f949c]
- Updated dependencies [0b57296]
- Updated dependencies [7ee0420]
  - @voyant-travel/legal@0.137.5
  - @voyant-travel/commerce-react@0.19.1
  - @voyant-travel/ui@0.108.9
  - @voyant-travel/bookings-react@0.137.5

## 0.137.4

### Patch Changes

- Updated dependencies [bcea95d]
  - @voyant-travel/legal@0.137.4

## 0.137.3

### Patch Changes

- Updated dependencies [5145a69]
  - @voyant-travel/legal@0.137.3

## 0.137.2

### Patch Changes

- Updated dependencies [d2df4c1]
  - @voyant-travel/legal@0.137.2

## 0.137.1

### Patch Changes

- Updated dependencies [9a1197b]
  - @voyant-travel/bookings-react@0.137.1
  - @voyant-travel/inventory-react@0.19.1
  - @voyant-travel/legal@0.137.1
  - @voyant-travel/distribution-react@0.127.1

## 0.137.0

### Patch Changes

- @voyant-travel/legal@0.137.0
- @voyant-travel/commerce-react@0.19.0
- @voyant-travel/bookings-react@0.137.0
- @voyant-travel/distribution-react@0.127.0
- @voyant-travel/inventory-react@0.19.0
- @voyant-travel/relationships-react@0.137.0

## 0.136.2

### Patch Changes

- 12a1eb2: Expose client-safe subpaths for validation schemas, linkable metadata, template authoring metadata, finance payment-policy primitives, and Hono reporter utilities. Move browser-facing React/operator imports off mixed runtime barrels so client bundles do not pull Hono request context or other server-only runtime code.
- Updated dependencies [12a1eb2]
  - @voyant-travel/commerce-react@0.18.2
  - @voyant-travel/distribution-react@0.126.2
  - @voyant-travel/inventory-react@0.18.2
  - @voyant-travel/legal@0.136.2
  - @voyant-travel/bookings-react@0.136.2

## 0.136.1

### Patch Changes

- Updated dependencies [7cb6fa7]
  - @voyant-travel/i18n@0.109.0
  - @voyant-travel/admin@0.115.2
  - @voyant-travel/bookings-react@0.136.1
  - @voyant-travel/commerce-react@0.18.1
  - @voyant-travel/distribution-react@0.126.1
  - @voyant-travel/inventory-react@0.18.1
  - @voyant-travel/relationships-react@0.136.1
  - @voyant-travel/ui@0.108.2
  - @voyant-travel/legal@0.136.1

## 0.136.0

### Patch Changes

- @voyant-travel/bookings-react@0.136.0
- @voyant-travel/distribution-react@0.126.0
- @voyant-travel/inventory-react@0.18.0
- @voyant-travel/commerce-react@0.18.0
- @voyant-travel/relationships-react@0.136.0
- @voyant-travel/legal@0.136.0

## 0.135.0

### Patch Changes

- @voyant-travel/bookings-react@0.135.0
- @voyant-travel/distribution-react@0.125.0
- @voyant-travel/inventory-react@0.17.0
- @voyant-travel/commerce-react@0.17.0
- @voyant-travel/relationships-react@0.135.0
- @voyant-travel/legal@0.135.0

## 0.134.1

### Patch Changes

- @voyant-travel/legal@0.134.1
- @voyant-travel/bookings-react@0.134.1
- @voyant-travel/distribution-react@0.124.1

## 0.134.0

### Minor Changes

- 51f7dea: Share one list-response contract instead of per-module copies (voyant#2109).

  `@voyant-travel/types` now owns the canonical offset-paginated list envelope: the `ListResponse<T>` type + `listResponse(data, { total, limit, offset })` builder, plus the zod `paginationSchema` (coerced `limit` 1–200 default 50, `offset` ≥0 default 0) and the `listResponseSchema(item)` factory. Both server services and `*-react` clients import from this single source.

  Server side: every module's local `paginate()` / inline `{ data, total, limit, offset }` construction now routes through the shared `listResponse` builder, and the count read is standardized on `count` internally — fixing the drift where finance, notifications and the legal contracts/policies services read `countResult[0]?.total` while every other module read `countResult[0]?.count` (their `count(*)` selects were aliased `total`; they are now aliased `count`). The returned shape is byte-for-byte identical.

  Client side: the ~23 copied `paginatedEnvelope` zod schemas across the `*-react` packages are replaced by re-exporting the shared `listResponseSchema` factory under the same `paginatedEnvelope` name, so consumers are unchanged.

  Input alignment: `finance-contracts` and `legal-contracts` pagination `limit` caps were raised from `.max(100)` to `.max(200)` to match the framework-wide max.

  Additive and non-breaking.

### Patch Changes

- Updated dependencies [51f7dea]
  - @voyant-travel/types@0.106.0
  - @voyant-travel/legal@0.134.0
  - @voyant-travel/bookings-react@0.134.0
  - @voyant-travel/commerce-react@0.16.0
  - @voyant-travel/distribution-react@0.124.0
  - @voyant-travel/inventory-react@0.16.0
  - @voyant-travel/relationships-react@0.134.0
  - @voyant-travel/admin@0.115.1
  - @voyant-travel/utils@0.105.4

## 0.133.0

### Patch Changes

- Updated dependencies [4abf9a2]
  - @voyant-travel/admin@0.115.0
  - @voyant-travel/i18n@0.108.0
  - @voyant-travel/legal@0.133.0
  - @voyant-travel/utils@0.105.3
  - @voyant-travel/bookings-react@0.133.0
  - @voyant-travel/commerce-react@0.15.0
  - @voyant-travel/distribution-react@0.123.0
  - @voyant-travel/inventory-react@0.15.0
  - @voyant-travel/relationships-react@0.133.0
  - @voyant-travel/ui@0.108.1

## 0.132.0

### Patch Changes

- @voyant-travel/bookings-react@0.132.0
- @voyant-travel/distribution-react@0.122.0
- @voyant-travel/inventory-react@0.14.0
- @voyant-travel/commerce-react@0.14.0
- @voyant-travel/relationships-react@0.132.0
- @voyant-travel/legal@0.132.0

## 0.131.1

### Patch Changes

- @voyant-travel/legal@0.131.1
- @voyant-travel/bookings-react@0.131.1
- @voyant-travel/distribution-react@0.121.1

## 0.131.0

### Patch Changes

- Updated dependencies [310565b]
  - @voyant-travel/i18n@0.107.3
  - @voyant-travel/bookings-react@0.131.0
  - @voyant-travel/distribution-react@0.121.0
  - @voyant-travel/inventory-react@0.13.0
  - @voyant-travel/commerce-react@0.13.0
  - @voyant-travel/relationships-react@0.131.0
  - @voyant-travel/legal@0.131.0

## 0.130.0

### Patch Changes

- Updated dependencies [dbea53e]
  - @voyant-travel/i18n@0.107.2
  - @voyant-travel/bookings-react@0.130.0
  - @voyant-travel/distribution-react@0.120.0
  - @voyant-travel/inventory-react@0.12.0
  - @voyant-travel/commerce-react@0.12.0
  - @voyant-travel/relationships-react@0.130.0
  - @voyant-travel/legal@0.130.0

## 0.129.1

### Patch Changes

- Updated dependencies [466e576]
  - @voyant-travel/legal@0.129.1

## 0.129.0

### Patch Changes

- @voyant-travel/distribution-react@0.119.0
- @voyant-travel/bookings-react@0.129.0
- @voyant-travel/inventory-react@0.11.0
- @voyant-travel/commerce-react@0.11.0
- @voyant-travel/relationships-react@0.129.0
- @voyant-travel/legal@0.129.0

## 0.128.0

### Patch Changes

- @voyant-travel/inventory-react@0.10.0
- @voyant-travel/bookings-react@0.128.0
- @voyant-travel/commerce-react@0.10.0
- @voyant-travel/distribution-react@0.118.0
- @voyant-travel/relationships-react@0.128.0
- @voyant-travel/legal@0.128.0

## 0.127.0

### Patch Changes

- @voyant-travel/bookings-react@0.127.0
- @voyant-travel/legal@0.127.0
- @voyant-travel/distribution-react@0.117.0
- @voyant-travel/inventory-react@0.9.0
- @voyant-travel/commerce-react@0.9.0
- @voyant-travel/relationships-react@0.127.0

## 0.126.1

### Patch Changes

- Updated dependencies [1841ce2]
  - @voyant-travel/legal@0.126.1
  - @voyant-travel/distribution-react@0.116.1

## 0.126.0

### Patch Changes

- Updated dependencies [84b9d4b]
  - @voyant-travel/legal@0.126.0
  - @voyant-travel/commerce-react@0.8.0
  - @voyant-travel/bookings-react@0.126.0
  - @voyant-travel/distribution-react@0.116.0
  - @voyant-travel/inventory-react@0.8.0
  - @voyant-travel/relationships-react@0.126.0

## 0.125.0

### Patch Changes

- Updated dependencies [a74471e]
- Updated dependencies [a74471e]
  - @voyant-travel/i18n@0.107.0
  - @voyant-travel/ui@0.108.0
  - @voyant-travel/admin@0.114.0
  - @voyant-travel/bookings-react@0.125.0
  - @voyant-travel/commerce-react@0.7.0
  - @voyant-travel/distribution-react@0.115.0
  - @voyant-travel/inventory-react@0.7.0
  - @voyant-travel/relationships-react@0.125.0
  - @voyant-travel/legal@0.125.0

## 0.124.0

### Patch Changes

- Updated dependencies [4f92198]
  - @voyant-travel/ui@0.107.0
  - @voyant-travel/admin@0.113.0
  - @voyant-travel/commerce-react@0.6.0
  - @voyant-travel/distribution-react@0.114.0
  - @voyant-travel/inventory-react@0.6.0
  - @voyant-travel/bookings-react@0.124.0
  - @voyant-travel/relationships-react@0.124.0
  - @voyant-travel/legal@0.124.0

## 0.123.0

### Patch Changes

- Updated dependencies [94890c3]
- Updated dependencies [cb9b04b]
  - @voyant-travel/admin@0.112.0
  - @voyant-travel/bookings-react@0.123.0
  - @voyant-travel/commerce-react@0.5.0
  - @voyant-travel/distribution-react@0.113.0
  - @voyant-travel/inventory-react@0.5.0
  - @voyant-travel/relationships-react@0.123.0
  - @voyant-travel/legal@0.123.0

## 0.122.0

### Patch Changes

- Updated dependencies [85caeef]
- Updated dependencies [85a13d3]
  - @voyant-travel/legal@0.122.0
  - @voyant-travel/inventory-react@0.4.0
  - @voyant-travel/commerce-react@0.4.0
  - @voyant-travel/bookings-react@0.122.0
  - @voyant-travel/distribution-react@0.112.0
  - @voyant-travel/relationships-react@0.122.0

## 0.121.0

### Patch Changes

- Updated dependencies [503a634]
  - @voyant-travel/legal@0.121.0
  - @voyant-travel/commerce-react@0.3.0
  - @voyant-travel/inventory-react@0.3.0
  - @voyant-travel/bookings-react@0.121.0
  - @voyant-travel/distribution-react@0.111.0
  - @voyant-travel/relationships-react@0.121.0

## 0.120.2

### Patch Changes

- Updated dependencies [756213e]
  - @voyant-travel/legal@0.120.2
  - @voyant-travel/bookings-react@0.120.2

## 0.120.1

### Patch Changes

- eef1a00: Republish notification and UI consumer packages so stale beta artifacts no longer reference legacy notification package specifiers.
- Updated dependencies [eef1a00]
  - @voyant-travel/admin@0.111.2
  - @voyant-travel/bookings-react@0.120.1
  - @voyant-travel/commerce-react@0.2.1
  - @voyant-travel/distribution-react@0.110.4
  - @voyant-travel/inventory-react@0.2.1
  - @voyant-travel/relationships-react@0.120.1
  - @voyant-travel/legal@0.120.1

## 0.120.0

### Minor Changes

- c3f4fa0: Move Legal acceptance, contract, and term records to target refs with explicit legacy transaction compatibility fields.

### Patch Changes

- 47fef18: Retarget first-party imports from the removed beta package names to their owner
  packages. Operated product UI now imports Inventory React, commercial UI imports
  Commerce React, supplier UI imports Distribution React, checkout UI imports
  Finance React, and operated place/availability schema references import
  Operations owner paths.
- Updated dependencies [dd71543]
- Updated dependencies [97d520c]
- Updated dependencies [85f9ce1]
- Updated dependencies [3cc83b6]
- Updated dependencies [44c3875]
- Updated dependencies [3408b2a]
- Updated dependencies [3e160d3]
- Updated dependencies [65b3782]
- Updated dependencies [a101971]
- Updated dependencies [c3f4fa0]
- Updated dependencies [47fef18]
  - @voyant-travel/admin@0.111.1
  - @voyant-travel/commerce-react@0.2.0
  - @voyant-travel/inventory-react@0.2.0
  - @voyant-travel/bookings-react@0.120.0
  - @voyant-travel/distribution-react@0.110.0
  - @voyant-travel/legal@0.120.0
  - @voyant-travel/relationships-react@0.120.0

## 0.119.2

### Patch Changes

- b402bcd: Split oversized legal contract generation and dialog modules into smaller internal files while preserving existing public exports and behavior.
- Updated dependencies [b402bcd]
  - @voyant-travel/legal@0.119.2

## 0.119.1

### Patch Changes

- @voyant-travel/legal@0.119.1
- @voyant-travel/bookings-react@0.119.1
- @voyant-travel/crm-react@0.119.1
- @voyant-travel/distribution-react@0.109.6
- @voyant-travel/markets-react@0.107.5
- @voyant-travel/products-react@0.119.1
- @voyant-travel/suppliers-react@0.111.6

## 0.119.0

### Patch Changes

- Updated dependencies [b0f1e21]
  - @voyant-travel/utils@0.105.0
  - @voyant-travel/legal@0.119.0
  - @voyant-travel/crm-react@0.119.0
  - @voyant-travel/products-react@0.119.0
  - @voyant-travel/ui@0.106.1
  - @voyant-travel/bookings-react@0.119.0
  - @voyant-travel/distribution-react@0.109.5
  - @voyant-travel/markets-react@0.107.4
  - @voyant-travel/suppliers-react@0.111.5

## 0.118.0

### Patch Changes

- @voyant-travel/products-react@0.118.0
- @voyant-travel/bookings-react@0.118.0
- @voyant-travel/crm-react@0.118.0
- @voyant-travel/distribution-react@0.109.4
- @voyant-travel/legal@0.118.0
- @voyant-travel/suppliers-react@0.111.4

## 0.117.1

### Patch Changes

- @voyant-travel/legal@0.117.1
- @voyant-travel/bookings-react@0.117.1
- @voyant-travel/crm-react@0.117.1
- @voyant-travel/distribution-react@0.109.3
- @voyant-travel/markets-react@0.107.3
- @voyant-travel/products-react@0.117.1
- @voyant-travel/suppliers-react@0.111.3

## 0.117.0

### Patch Changes

- @voyant-travel/legal@0.117.0
- @voyant-travel/bookings-react@0.117.0
- @voyant-travel/crm-react@0.117.0
- @voyant-travel/distribution-react@0.109.2
- @voyant-travel/markets-react@0.107.2
- @voyant-travel/products-react@0.117.0
- @voyant-travel/suppliers-react@0.111.2

## 0.116.0

### Patch Changes

- @voyant-travel/legal@0.116.0
- @voyant-travel/products-react@0.116.0
- @voyant-travel/bookings-react@0.116.0
- @voyant-travel/crm-react@0.116.0
- @voyant-travel/distribution-react@0.109.1
- @voyant-travel/markets-react@0.107.1
- @voyant-travel/suppliers-react@0.111.1

## 0.115.0

### Minor Changes

- 41b08db: Packaged-admin final sweep: the CORE admin pages ship from
  `@voyant-travel/admin-app` as a built-in extension, and index redirects become
  contribution-driven. The operator deleted its last 18 core route files
  (12 settings files, `/account`, the dashboard host, and the 4 domain index
  redirects) plus the superseded settings/account components.

  - `@voyant-travel/admin`: `AdminUiRouteContribution` grows `redirectTo?: string`
    (a redirect contribution counts as implemented on its own — host binders
    emit a before-load redirect, which also covers SSR) and `children?:
AdminUiRouteContribution[]` (nested child contributions under a layout
    contribution; child paths are parent-relative, `"/"` is the index). New
    `findAdminRouteContribution` does the depth-first lookup;
    `requireImplementedAdminRoute` accepts redirect contributions and
    resolves nested children.
  - `@voyant-travel/admin-app`: new `createAdminCoreExtension(options)` (exported
    from the root and `./core-extension`) — the `core` extension contributing
    `/` (the dashboard page behind a lazy chunk; hosts supply an SSR
    aggregates loader via `dashboard.loader`), `/account` (auth-react's
    packaged `AccountPage`), and the `/settings` area: a packaged layout
    (grouped sub-nav + outlet, labels resolved reactively from the operator
    admin messages) with nested children — an index redirect (default
    `/settings/channels`) and the nine built-in pages (team, API tokens,
    channels, taxes, cost categories, pricing categories, price catalogs,
    product types, product tags). Surfaces eject with `false`; built-in
    settings pages drop via `settings.omit`; app-custom settings pages splice
    in via `settings.extraPages` (the operator's Operator Profile page uses
    this). The binder gains redirect support (`beforeLoad` throwing the
    router redirect) and `adminExtensionChildRoutes(...)` for binding
    runtime-known children the generated route module cannot emit
    statically. The new domain peers (auth/distribution/finance/pricing/
    products react) are optional and only loaded by the lazy page/loader
    chunks.
  - `@voyant-travel/catalog-react` / `@voyant-travel/finance-react` /
    `@voyant-travel/legal-react` / `@voyant-travel/notifications-react`: the admin
    extensions contribute their index redirect (`/catalog` →
    `/catalog/products`, `/finance` → `/finance/invoices`, `/legal` →
    `/legal/contracts`, `/notifications` → `/notifications/templates`),
    replacing the operator's redirect route files.
  - Host typed-link merge note: extension routes now REPLACE file routes on
    key conflicts in the merged route-type maps (`Omit` before the
    intersection) — the pathless workspace layout claims `/` in the generated
    file types once the index file route is deleted, while at runtime `/` is
    the core extension's dashboard route.

### Patch Changes

- Updated dependencies [41b08db]
- Updated dependencies [6d496d0]
  - @voyant-travel/admin@0.111.0
  - @voyant-travel/products-react@0.115.0
  - @voyant-travel/bookings-react@0.115.0
  - @voyant-travel/crm-react@0.115.0
  - @voyant-travel/distribution-react@0.109.0
  - @voyant-travel/suppliers-react@0.111.0
  - @voyant-travel/legal@0.115.0

## 0.114.0

### Patch Changes

- Updated dependencies [f7bd971]
  - @voyant-travel/distribution-react@0.108.0
  - @voyant-travel/bookings-react@0.114.0
  - @voyant-travel/products-react@0.114.0
  - @voyant-travel/crm-react@0.114.0
  - @voyant-travel/legal@0.114.0
  - @voyant-travel/suppliers-react@0.110.1

## 0.113.0

### Patch Changes

- Updated dependencies [9c909e2]
  - @voyant-travel/bookings-react@0.113.0
  - @voyant-travel/admin@0.110.0
  - @voyant-travel/crm-react@0.113.0
  - @voyant-travel/suppliers-react@0.110.0
  - @voyant-travel/products-react@0.113.0
  - @voyant-travel/legal@0.113.0
  - @voyant-travel/distribution-react@0.107.3

## 0.112.0

### Minor Changes

- 279f97c: Slim the admin entry barrels so the host's workspace-chrome chunk stops pinning domain data layers and page hosts (operator client entry: 3.74 MB → 1.83 MB).

  - Route contribution loaders now resolve query options / page-data helpers via dynamic `import()` inside the loader body, keeping clients + response schemas (and the backend validation graphs they pull) out of the eagerly evaluated entry chunk.
  - `@voyant-travel/<domain>-react/admin` barrels no longer re-export page/host/dialog/widget component **values** (packaged-admin RFC §4.8 endgame rule: specific modules, never barrels). Their prop **types** still re-export from the barrels; import component values from their specific modules instead (e.g. `@voyant-travel/bookings-react/admin/booking-detail-host`). New `./admin/*` subpath exports on `@voyant-travel/bookings-react` and `@voyant-travel/availability-react` cover the known host-side imports.
  - Widget slot ids moved into lean `admin/slots` modules (`bookings-react`, `crm-react`, `suppliers-react`); the host modules re-export them, so existing imports keep working.
  - Widget contributions (`PersonBookingsWidget`, the four finance cards) now mount through Suspense-wrapped `React.lazy` loaders, so their chunks fetch when the slot actually renders.
  - Search schemas stay synchronous: `catalogSearchSchema` re-exports from the schema-only `catalog-search-params` module instead of the catalog main barrel; the bookings search contracts already lived in the admin entry.
  - Resources detail-page skeletons extracted to `components/resource-detail-skeletons` (re-exported from the page modules) so `pendingComponent`s no longer pin the detail pages into the entry graph.

- faec538: Generated destination resolver maps (packaged-admin RFC §4.7 endgame).

  `AdminUiRouteContribution` gains `destination?: AdminDestinationKey` +
  `destinationParams?: Record<string, string>`: a route contribution now
  DECLARES which semantic destination key its path satisfies by pure param
  interpolation (e.g. `/suppliers/$id` satisfying
  `"supplier.detail": { supplierId: string }` via `{ id: "supplierId" }`).
  The eight domain packages annotate their 29 route-backed destinations, so
  `voyant admin generate --destinations` can emit the host's resolver map
  instead of the host hand-writing it — the operator's map shrank to
  `{ ...generatedAdminDestinations, ...custom }` with only seven genuinely
  custom resolvers (search-param construction, multi-route targets, and
  host-owned pages), and `voyant admin doctor` gates on drift between the
  annotations and the generated module.

### Patch Changes

- Updated dependencies [279f97c]
- Updated dependencies [faec538]
  - @voyant-travel/bookings-react@0.112.0
  - @voyant-travel/crm-react@0.112.0
  - @voyant-travel/suppliers-react@0.109.0
  - @voyant-travel/admin@0.109.0
  - @voyant-travel/products-react@0.112.0
  - @voyant-travel/legal@0.112.0
  - @voyant-travel/distribution-react@0.107.2

## 0.111.0

### Minor Changes

- 478aa7c: Packaged-admin RFC §4.8 endgame — the code-assembled extension route tree.
  Package-delivered admin pages exist as NO per-route files in the host: the
  operator deleted ~50 thin host route files across all 10 admin domains; the
  route tree for extension routes is assembled in code from the contributions
  and grafted under the file-based workspace layout, with typed links intact.

  - `@voyant-travel/admin`: `AdminUiRouteContribution` grows `page?: () =>
Promise<AdminRoutePageModule>` — a lazy page-module loader (pages stay
    code-split, hover/intent preloading fetches the chunk ahead of
    navigation). The resolved component receives `AdminRoutePageProps`
    (`params`/`search`/`updateSearch`/`title`), dissolving the old "zero-prop
    components only" restriction — param-taking detail pages need no host
    route file. `AdminRouteLoaderContext` gains `params`. New helpers:
    `requireImplementedAdminRoute` (loud failure at module evaluation when a
    bound contribution loses its implementation) and `adminRoutePageModule`
    (adapter for zero-prop / all-optional-prop hosts).
  - `@voyant-travel/admin-app`: new binder — `adminExtensionRouteOptions(extension,
routeId, runtime)` returns router-facing route options (lazy component,
    loader bound to `{ queryClient, runtime, params }`, per-route `ssr`,
    boundaries) ready to spread into a code-based `createRoute({...})`, and
    `attachAdminExtensionRoutes(routeTree, parentRoute, routes)` grafts the
    built routes under the workspace layout idempotently (replace-by-path,
    dev-server re-evaluation safe).
  - All 10 `*-react` admin extensions now carry full route implementations:
    lazy `page` loaders (dynamic imports of the specific host modules, never
    the admin barrel), loaders moved verbatim from the operator route files
    (SSR modes preserved exactly, `data-only` included), pending skeletons,
    and search contracts. Bookings adds host-composition options
    (`indexHeaderActions`, `detailPageComponent` + exported
    `BookingDetailPageComponentProps`) so app-owned composition rides through
    the factory instead of a route file. Finance's supplier-invoices pages
    stay metadata-only (app-owned upload/supplier-picker/cross-domain search
    wiring) and remain host route files.

  Hosts bind everything in one checked-in generated module
  (`src/admin.routes.generated.tsx`): per route a `createRoute` call with the
  path literal + typed search schema, spreading the binder options, plus
  `AdminExtensionRoutesBy*` typed-link maps that `router.tsx` merges with the
  generated `FileRouteTypes` via `_addFileTypes` — `Link`/`navigate` stay
  fully typed for file routes and extension routes alike.

### Patch Changes

- Updated dependencies [478aa7c]
  - @voyant-travel/admin@0.108.0
  - @voyant-travel/bookings-react@0.111.0
  - @voyant-travel/crm-react@0.111.0
  - @voyant-travel/suppliers-react@0.108.0
  - @voyant-travel/products-react@0.111.0
  - @voyant-travel/legal@0.111.0
  - @voyant-travel/distribution-react@0.107.1

## 0.110.0

### Minor Changes

- 6c27159: Merge each module's `*-ui` package into its `*-react` sibling (#1652). The
  `*-react` package is now the whole client tier: the headless exports (root,
  `./hooks`, `./client`, `./provider`) are unchanged, and the styled tier moves
  in under new subpaths — `./ui` (the old `*-ui` root barrel), `./components/*`,
  `./admin`, `./i18n`, `./i18n/en`, `./i18n/ro`, and `./styles.css`.

  Migration from `@voyant-travel/<module>-ui`:

  - `@voyant-travel/<module>-ui` → `@voyant-travel/<module>-react/ui`
  - `@voyant-travel/<module>-ui/<subpath>` → `@voyant-travel/<module>-react/<subpath>`
  - package.json: drop the `-ui` dependency; `-react` covers both tiers.

  Styled-tier peers (`@voyant-travel/ui`, `@voyant-travel/admin`, `@tanstack/react-table`,
  `sonner`, `react-hook-form`, sibling `*-react` hooks packages) are optional
  peers — headless consumers that only import the root/`hooks`/`client` subpaths
  do not need them. The 27 `@voyant-travel/*-ui` packages are deprecated on npm in
  favor of these subpaths; `@voyant-travel/allocation-ui` and
  `@voyant-travel/workflow-runs-ui` (no `-react` sibling) are unaffected.

### Patch Changes

- Updated dependencies [6c27159]
- Updated dependencies [eeb23df]
  - @voyant-travel/bookings-react@0.110.0
  - @voyant-travel/crm-react@0.110.0
  - @voyant-travel/distribution-react@0.107.0
  - @voyant-travel/markets-react@0.107.0
  - @voyant-travel/products-react@0.110.0
  - @voyant-travel/suppliers-react@0.107.0
  - @voyant-travel/admin@0.107.0
  - @voyant-travel/legal@0.110.0

## 0.109.0

### Patch Changes

- @voyant-travel/legal@0.109.0

## 0.108.0

### Patch Changes

- @voyant-travel/legal@0.108.0

## 0.107.1

### Patch Changes

- @voyant-travel/legal@0.107.1

## 0.107.0

### Patch Changes

- @voyant-travel/legal@0.107.0

## 0.106.3

### Patch Changes

- Updated dependencies [801b3e8]
  - @voyant-travel/legal@0.106.3

## 0.106.2

### Patch Changes

- Updated dependencies [b743087]
  - @voyant-travel/legal@0.106.2

## 0.106.1

### Patch Changes

- Updated dependencies [8f2a93c]
  - @voyant-travel/legal@0.106.1

## 0.106.0

### Patch Changes

- @voyant-travel/legal@0.106.0

## 0.105.0

### Patch Changes

- @voyant-travel/legal@0.105.0

## 0.104.1

### Patch Changes

- @voyant-travel/legal@0.104.1
- @voyant-travel/react@0.104.1

## 0.104.0

### Patch Changes

- @voyant-travel/legal@0.104.0
- @voyant-travel/react@0.104.0

## 0.103.0

### Patch Changes

- @voyant-travel/legal@0.103.0
- @voyant-travel/react@0.103.0

## 0.102.0

### Patch Changes

- @voyant-travel/legal@0.102.0
- @voyant-travel/react@0.102.0

## 0.101.2

### Patch Changes

- Updated dependencies [577eaf5]
  - @voyant-travel/legal@0.101.2
  - @voyant-travel/react@0.101.2

## 0.101.1

### Patch Changes

- @voyant-travel/legal@0.101.1
- @voyant-travel/react@0.101.1

## 0.101.0

### Patch Changes

- @voyant-travel/legal@0.101.0
- @voyant-travel/react@0.101.0

## 0.100.0

### Patch Changes

- @voyant-travel/legal@0.100.0
- @voyant-travel/react@0.100.0

## 0.99.0

### Patch Changes

- @voyant-travel/legal@0.99.0
- @voyant-travel/react@0.99.0

## 0.98.0

### Patch Changes

- @voyant-travel/legal@0.98.0
- @voyant-travel/react@0.98.0

## 0.97.0

### Patch Changes

- @voyant-travel/legal@0.97.0
- @voyant-travel/react@0.97.0

## 0.96.0

### Patch Changes

- @voyant-travel/legal@0.96.0
- @voyant-travel/react@0.96.0

## 0.95.0

### Patch Changes

- @voyant-travel/legal@0.95.0
- @voyant-travel/react@0.95.0

## 0.94.0

### Patch Changes

- @voyant-travel/legal@0.94.0
- @voyant-travel/react@0.94.0

## 0.93.0

### Patch Changes

- @voyant-travel/legal@0.93.0
- @voyant-travel/react@0.93.0

## 0.92.0

### Patch Changes

- @voyant-travel/legal@0.92.0
- @voyant-travel/react@0.92.0

## 0.91.0

### Patch Changes

- @voyant-travel/legal@0.91.0
- @voyant-travel/react@0.91.0

## 0.90.0

### Patch Changes

- @voyant-travel/legal@0.90.0
- @voyant-travel/react@0.90.0

## 0.89.0

### Patch Changes

- @voyant-travel/legal@0.89.0
- @voyant-travel/react@0.89.0

## 0.88.0

### Patch Changes

- @voyant-travel/legal@0.88.0
- @voyant-travel/react@0.88.0

## 0.87.1

### Patch Changes

- @voyant-travel/legal@0.87.1
- @voyant-travel/react@0.87.1

## 0.87.0

### Patch Changes

- @voyant-travel/legal@0.87.0
- @voyant-travel/react@0.87.0

## 0.86.0

### Patch Changes

- @voyant-travel/legal@0.86.0
- @voyant-travel/react@0.86.0

## 0.85.4

### Patch Changes

- @voyant-travel/legal@0.85.4
- @voyant-travel/react@0.85.4

## 0.85.3

### Patch Changes

- @voyant-travel/legal@0.85.3
- @voyant-travel/react@0.85.3

## 0.85.2

### Patch Changes

- @voyant-travel/legal@0.85.2
- @voyant-travel/react@0.85.2

## 0.85.1

### Patch Changes

- @voyant-travel/legal@0.85.1
- @voyant-travel/react@0.85.1

## 0.85.0

### Patch Changes

- @voyant-travel/legal@0.85.0
- @voyant-travel/react@0.85.0

## 0.84.4

### Patch Changes

- @voyant-travel/legal@0.84.4
- @voyant-travel/react@0.84.4

## 0.84.3

### Patch Changes

- @voyant-travel/legal@0.84.3
- @voyant-travel/react@0.84.3

## 0.84.2

### Patch Changes

- @voyant-travel/legal@0.84.2
- @voyant-travel/react@0.84.2

## 0.84.1

### Patch Changes

- @voyant-travel/legal@0.84.1
- @voyant-travel/react@0.84.1

## 0.84.0

### Patch Changes

- Updated dependencies [4ea42b3]
  - @voyant-travel/legal@0.84.0
  - @voyant-travel/react@0.84.0

## 0.83.1

### Patch Changes

- @voyant-travel/legal@0.83.1
- @voyant-travel/react@0.83.1

## 0.83.0

### Patch Changes

- @voyant-travel/legal@0.83.0
- @voyant-travel/react@0.83.0

## 0.82.1

### Patch Changes

- @voyant-travel/legal@0.82.1
- @voyant-travel/react@0.82.1

## 0.82.0

### Patch Changes

- Updated dependencies [577f909]
  - @voyant-travel/legal@0.82.0
  - @voyant-travel/react@0.82.0

## 0.81.21

### Patch Changes

- @voyant-travel/legal@0.81.21
- @voyant-travel/react@0.81.21

## 0.81.20

### Patch Changes

- @voyant-travel/legal@0.81.20
- @voyant-travel/react@0.81.20

## 0.81.19

### Patch Changes

- @voyant-travel/legal@0.81.19
- @voyant-travel/react@0.81.19

## 0.81.18

### Patch Changes

- Updated dependencies [93874e4]
  - @voyant-travel/legal@0.81.18
  - @voyant-travel/react@0.81.18

## 0.81.17

### Patch Changes

- @voyant-travel/legal@0.81.17
- @voyant-travel/react@0.81.17

## 0.81.16

### Patch Changes

- Updated dependencies [0a617cc]
  - @voyant-travel/legal@0.81.16
  - @voyant-travel/react@0.81.16

## 0.81.15

### Patch Changes

- @voyant-travel/legal@0.81.15
- @voyant-travel/react@0.81.15

## 0.81.14

### Patch Changes

- @voyant-travel/legal@0.81.14
- @voyant-travel/react@0.81.14

## 0.81.13

### Patch Changes

- Updated dependencies [36421aa]
  - @voyant-travel/legal@0.81.13
  - @voyant-travel/react@0.81.13

## 0.81.12

### Patch Changes

- @voyant-travel/legal@0.81.12
- @voyant-travel/react@0.81.12

## 0.81.11

### Patch Changes

- @voyant-travel/legal@0.81.11
- @voyant-travel/react@0.81.11

## 0.81.10

### Patch Changes

- @voyant-travel/legal@0.81.10
- @voyant-travel/react@0.81.10

## 0.81.9

### Patch Changes

- Updated dependencies [1a58939]
  - @voyant-travel/legal@0.81.9
  - @voyant-travel/react@0.81.9

## 0.81.8

### Patch Changes

- @voyant-travel/legal@0.81.8
- @voyant-travel/react@0.81.8

## 0.81.7

### Patch Changes

- @voyant-travel/legal@0.81.7
- @voyant-travel/react@0.81.7

## 0.81.6

### Patch Changes

- @voyant-travel/legal@0.81.6
- @voyant-travel/react@0.81.6

## 0.81.5

### Patch Changes

- @voyant-travel/legal@0.81.5
- @voyant-travel/react@0.81.5

## 0.81.4

### Patch Changes

- @voyant-travel/legal@0.81.4
- @voyant-travel/react@0.81.4

## 0.81.3

### Patch Changes

- @voyant-travel/legal@0.81.3
- @voyant-travel/react@0.81.3

## 0.81.2

### Patch Changes

- @voyant-travel/legal@0.81.2
- @voyant-travel/react@0.81.2

## 0.81.1

### Patch Changes

- @voyant-travel/legal@0.81.1
- @voyant-travel/react@0.81.1

## 0.81.0

### Patch Changes

- @voyant-travel/legal@0.81.0
- @voyant-travel/react@0.81.0

## 0.80.18

### Patch Changes

- @voyant-travel/legal@0.80.18
- @voyant-travel/react@0.80.18

## 0.80.17

### Patch Changes

- @voyant-travel/legal@0.80.17
- @voyant-travel/react@0.80.17

## 0.80.16

### Patch Changes

- @voyant-travel/legal@0.80.16
- @voyant-travel/react@0.80.16

## 0.80.15

### Patch Changes

- @voyant-travel/legal@0.80.15
- @voyant-travel/react@0.80.15

## 0.80.14

### Patch Changes

- @voyant-travel/legal@0.80.14
- @voyant-travel/react@0.80.14

## 0.80.13

### Patch Changes

- @voyant-travel/legal@0.80.13
- @voyant-travel/react@0.80.13

## 0.80.12

### Patch Changes

- @voyant-travel/legal@0.80.12
- @voyant-travel/react@0.80.12

## 0.80.11

### Patch Changes

- @voyant-travel/legal@0.80.11
- @voyant-travel/react@0.80.11

## 0.80.10

### Patch Changes

- Updated dependencies [97cae5e]
  - @voyant-travel/legal@0.80.10
  - @voyant-travel/react@0.80.10

## 0.80.9

### Patch Changes

- @voyant-travel/legal@0.80.9
- @voyant-travel/react@0.80.9

## 0.80.8

### Patch Changes

- @voyant-travel/legal@0.80.8
- @voyant-travel/react@0.80.8

## 0.80.7

### Patch Changes

- @voyant-travel/legal@0.80.7
- @voyant-travel/react@0.80.7

## 0.80.6

### Patch Changes

- @voyant-travel/legal@0.80.6
- @voyant-travel/react@0.80.6

## 0.80.5

### Patch Changes

- @voyant-travel/legal@0.80.5
- @voyant-travel/react@0.80.5

## 0.80.4

### Patch Changes

- @voyant-travel/legal@0.80.4
- @voyant-travel/react@0.80.4

## 0.80.3

### Patch Changes

- Updated dependencies [6d816bb]
  - @voyant-travel/legal@0.80.3
  - @voyant-travel/react@0.80.3

## 0.80.2

### Patch Changes

- @voyant-travel/legal@0.80.2
- @voyant-travel/react@0.80.2

## 0.80.1

### Patch Changes

- Updated dependencies [9a71c89]
  - @voyant-travel/legal@0.80.1
  - @voyant-travel/react@0.80.1

## 0.80.0

### Patch Changes

- @voyant-travel/legal@0.80.0
- @voyant-travel/react@0.80.0

## 0.79.0

### Patch Changes

- @voyant-travel/legal@0.79.0
- @voyant-travel/react@0.79.0

## 0.78.0

### Patch Changes

- @voyant-travel/legal@0.78.0
- @voyant-travel/react@0.78.0

## 0.77.13

### Patch Changes

- @voyant-travel/legal@0.77.13
- @voyant-travel/react@0.77.13

## 0.77.12

### Patch Changes

- @voyant-travel/legal@0.77.12
- @voyant-travel/react@0.77.12

## 0.77.11

### Patch Changes

- @voyant-travel/legal@0.77.11
- @voyant-travel/react@0.77.11

## 0.77.10

### Patch Changes

- @voyant-travel/legal@0.77.10
- @voyant-travel/react@0.77.10

## 0.77.9

### Patch Changes

- @voyant-travel/legal@0.77.9
- @voyant-travel/react@0.77.9

## 0.77.8

### Patch Changes

- @voyant-travel/legal@0.77.8
- @voyant-travel/react@0.77.8

## 0.77.7

### Patch Changes

- @voyant-travel/legal@0.77.7
- @voyant-travel/react@0.77.7

## 0.77.6

### Patch Changes

- @voyant-travel/legal@0.77.6
- @voyant-travel/react@0.77.6

## 0.77.5

### Patch Changes

- @voyant-travel/legal@0.77.5
- @voyant-travel/react@0.77.5

## 0.77.4

### Patch Changes

- @voyant-travel/legal@0.77.4
- @voyant-travel/react@0.77.4

## 0.77.3

### Patch Changes

- @voyant-travel/legal@0.77.3
- @voyant-travel/react@0.77.3

## 0.77.2

### Patch Changes

- @voyant-travel/legal@0.77.2
- @voyant-travel/react@0.77.2

## 0.77.1

### Patch Changes

- @voyant-travel/legal@0.77.1
- @voyant-travel/react@0.77.1

## 0.77.0

### Patch Changes

- Updated dependencies [1da934d]
  - @voyant-travel/legal@0.77.0
  - @voyant-travel/react@0.77.0

## 0.76.0

### Patch Changes

- @voyant-travel/legal@0.76.0
- @voyant-travel/react@0.76.0

## 0.75.7

### Patch Changes

- @voyant-travel/legal@0.75.7
- @voyant-travel/react@0.75.7

## 0.75.6

### Patch Changes

- @voyant-travel/legal@0.75.6
- @voyant-travel/react@0.75.6

## 0.75.5

### Patch Changes

- @voyant-travel/legal@0.75.5
- @voyant-travel/react@0.75.5

## 0.75.4

### Patch Changes

- @voyant-travel/legal@0.75.4
- @voyant-travel/react@0.75.4

## 0.75.3

### Patch Changes

- Updated dependencies [38167cd]
  - @voyant-travel/legal@0.75.3
  - @voyant-travel/react@0.75.3

## 0.75.2

### Patch Changes

- @voyant-travel/legal@0.75.2
- @voyant-travel/react@0.75.2

## 0.75.1

### Patch Changes

- @voyant-travel/legal@0.75.1
- @voyant-travel/react@0.75.1

## 0.75.0

### Patch Changes

- @voyant-travel/legal@0.75.0
- @voyant-travel/react@0.75.0

## 0.74.2

### Patch Changes

- @voyant-travel/legal@0.74.2
- @voyant-travel/react@0.74.2

## 0.74.1

### Patch Changes

- @voyant-travel/legal@0.74.1
- @voyant-travel/react@0.74.1

## 0.74.0

### Patch Changes

- @voyant-travel/legal@0.74.0
- @voyant-travel/react@0.74.0

## 0.73.1

### Patch Changes

- @voyant-travel/legal@0.73.1
- @voyant-travel/react@0.73.1

## 0.73.0

### Minor Changes

- 856da86: Add a package-level booking contract generation endpoint and wire the booking contract card to generate from the default template and active number series.

### Patch Changes

- Updated dependencies [856da86]
  - @voyant-travel/legal@0.73.0
  - @voyant-travel/react@0.73.0

## 0.72.0

### Patch Changes

- @voyant-travel/legal@0.72.0
- @voyant-travel/react@0.72.0

## 0.71.0

### Patch Changes

- @voyant-travel/legal@0.71.0
- @voyant-travel/react@0.71.0

## 0.70.0

### Patch Changes

- @voyant-travel/legal@0.70.0
- @voyant-travel/react@0.70.0

## 0.69.1

### Patch Changes

- @voyant-travel/legal@0.69.1
- @voyant-travel/react@0.69.1

## 0.69.0

### Patch Changes

- @voyant-travel/legal@0.69.0
- @voyant-travel/react@0.69.0

## 0.68.0

### Patch Changes

- @voyant-travel/legal@0.68.0
- @voyant-travel/react@0.68.0

## 0.67.0

### Patch Changes

- @voyant-travel/legal@0.67.0
- @voyant-travel/react@0.67.0

## 0.66.6

### Patch Changes

- @voyant-travel/legal@0.66.6
- @voyant-travel/react@0.66.6

## 0.66.5

### Patch Changes

- @voyant-travel/legal@0.66.5
- @voyant-travel/react@0.66.5

## 0.66.4

### Patch Changes

- @voyant-travel/legal@0.66.4
- @voyant-travel/react@0.66.4

## 0.66.3

### Patch Changes

- @voyant-travel/legal@0.66.3
- @voyant-travel/react@0.66.3

## 0.66.2

### Patch Changes

- @voyant-travel/legal@0.66.2
- @voyant-travel/react@0.66.2

## 0.66.1

### Patch Changes

- @voyant-travel/legal@0.66.1
- @voyant-travel/react@0.66.1

## 0.66.0

### Patch Changes

- @voyant-travel/legal@0.66.0
- @voyant-travel/react@0.66.0

## 0.65.0

### Patch Changes

- @voyant-travel/legal@0.65.0
- @voyant-travel/react@0.65.0

## 0.64.1

### Patch Changes

- @voyant-travel/legal@0.64.1
- @voyant-travel/react@0.64.1

## 0.64.0

### Patch Changes

- Updated dependencies [6d0c8f3]
  - @voyant-travel/legal@0.64.0
  - @voyant-travel/react@0.64.0

## 0.63.1

### Patch Changes

- @voyant-travel/legal@0.63.1
- @voyant-travel/react@0.63.1

## 0.63.0

### Patch Changes

- @voyant-travel/legal@0.63.0
- @voyant-travel/react@0.63.0

## 0.62.3

### Patch Changes

- @voyant-travel/legal@0.62.3
- @voyant-travel/react@0.62.3

## 0.62.2

### Patch Changes

- @voyant-travel/legal@0.62.2
- @voyant-travel/react@0.62.2

## 0.62.1

### Patch Changes

- @voyant-travel/legal@0.62.1
- @voyant-travel/react@0.62.1

## 0.62.0

### Patch Changes

- @voyant-travel/legal@0.62.0
- @voyant-travel/react@0.62.0

## 0.61.0

### Patch Changes

- @voyant-travel/legal@0.61.0
- @voyant-travel/react@0.61.0

## 0.60.0

### Patch Changes

- @voyant-travel/legal@0.60.0
- @voyant-travel/react@0.60.0

## 0.59.0

### Patch Changes

- @voyant-travel/legal@0.59.0
- @voyant-travel/react@0.59.0

## 0.58.0

### Patch Changes

- @voyant-travel/legal@0.58.0
- @voyant-travel/react@0.58.0

## 0.57.0

### Patch Changes

- @voyant-travel/legal@0.57.0
- @voyant-travel/react@0.57.0

## 0.56.0

### Patch Changes

- @voyant-travel/legal@0.56.0
- @voyant-travel/react@0.56.0

## 0.55.1

### Patch Changes

- @voyant-travel/legal@0.55.1
- @voyant-travel/react@0.55.1

## 0.55.0

### Patch Changes

- @voyant-travel/legal@0.55.0
- @voyant-travel/react@0.55.0

## 0.54.0

### Patch Changes

- @voyant-travel/legal@0.54.0
- @voyant-travel/react@0.54.0

## 0.53.2

### Patch Changes

- @voyant-travel/legal@0.53.2
- @voyant-travel/react@0.53.2

## 0.53.1

### Patch Changes

- @voyant-travel/legal@0.53.1
- @voyant-travel/react@0.53.1

## 0.53.0

### Patch Changes

- @voyant-travel/legal@0.53.0
- @voyant-travel/react@0.53.0

## 0.52.4

### Patch Changes

- @voyant-travel/legal@0.52.4
- @voyant-travel/react@0.52.4

## 0.52.3

### Patch Changes

- @voyant-travel/legal@0.52.3
- @voyant-travel/react@0.52.3

## 0.52.2

### Patch Changes

- 3e09123: Contracts/templates UI refresh.

  - `ContractDetailPage`, `ContractsPage`, `PoliciesPage`, and `TemplatesPage` rebuilt around the shared table primitives with sort/filter/empty-state parity. Detail page now surfaces lifecycle actions inline rather than in a side panel.
  - New `ContractSendDialog` for kicking off the contract-send flow with recipient/CC selection and i18n strings (EN + RO).
  - `useContractMutation` invalidates the contract list + detail queries after lifecycle transitions so list rows reflect the new state immediately.
  - `@voyant-travel/legal` lifecycle/routes/service updated to expose the data the new dialog needs (recipient hydration, send payload) and to surface lifecycle validation errors with structured codes.

- Updated dependencies [3e09123]
  - @voyant-travel/legal@0.52.2
  - @voyant-travel/react@0.52.2

## 0.52.1

### Patch Changes

- @voyant-travel/legal@0.52.1
- @voyant-travel/react@0.52.1

## 0.52.0

### Patch Changes

- @voyant-travel/legal@0.52.0
- @voyant-travel/react@0.52.0

## 0.51.1

### Patch Changes

- @voyant-travel/legal@0.51.1
- @voyant-travel/react@0.51.1

## 0.51.0

### Patch Changes

- @voyant-travel/legal@0.51.0
- @voyant-travel/react@0.51.0

## 0.50.8

### Patch Changes

- @voyant-travel/legal@0.50.8
- @voyant-travel/react@0.50.8

## 0.50.7

### Patch Changes

- @voyant-travel/legal@0.50.7
- @voyant-travel/react@0.50.7

## 0.50.6

### Patch Changes

- @voyant-travel/legal@0.50.6
- @voyant-travel/react@0.50.6

## 0.50.5

### Patch Changes

- @voyant-travel/legal@0.50.5
- @voyant-travel/react@0.50.5

## 0.50.4

### Patch Changes

- @voyant-travel/legal@0.50.4
- @voyant-travel/react@0.50.4

## 0.50.3

### Patch Changes

- @voyant-travel/legal@0.50.3
- @voyant-travel/react@0.50.3

## 0.50.2

### Patch Changes

- @voyant-travel/legal@0.50.2
- @voyant-travel/react@0.50.2

## 0.50.1

### Patch Changes

- @voyant-travel/legal@0.50.1
- @voyant-travel/react@0.50.1

## 0.50.0

### Patch Changes

- 140d0ad: Add an opinionated contract lifecycle with stage history, transition validation, and domain events for issue/send/sign/execute/void transitions.
- Updated dependencies [140d0ad]
  - @voyant-travel/legal@0.50.0
  - @voyant-travel/react@0.50.0

## 0.49.0

### Patch Changes

- @voyant-travel/legal@0.49.0
- @voyant-travel/react@0.49.0

## 0.48.0

### Patch Changes

- @voyant-travel/legal@0.48.0
- @voyant-travel/react@0.48.0

## 0.47.0

### Patch Changes

- Updated dependencies [65408c6]
  - @voyant-travel/legal@0.47.0
  - @voyant-travel/react@0.47.0

## 0.46.0

### Minor Changes

- 72b99b2: Add explicit default storefront contract templates with optional channel scoping and selector fallback support.

### Patch Changes

- Updated dependencies [72b99b2]
  - @voyant-travel/legal@0.46.0
  - @voyant-travel/react@0.46.0

## 0.45.0

### Patch Changes

- @voyant-travel/legal@0.45.0
- @voyant-travel/react@0.45.0

## 0.44.0

### Patch Changes

- @voyant-travel/legal@0.44.0
- @voyant-travel/react@0.44.0

## 0.43.0

### Patch Changes

- @voyant-travel/legal@0.43.0
- @voyant-travel/react@0.43.0

## 0.42.0

### Patch Changes

- @voyant-travel/legal@0.42.0
- @voyant-travel/react@0.42.0

## 0.41.3

### Patch Changes

- @voyant-travel/legal@0.41.3
- @voyant-travel/react@0.41.3

## 0.41.2

### Patch Changes

- @voyant-travel/legal@0.41.2
- @voyant-travel/react@0.41.2

## 0.41.1

### Patch Changes

- @voyant-travel/legal@0.41.1
- @voyant-travel/react@0.41.1

## 0.41.0

### Patch Changes

- @voyant-travel/legal@0.41.0
- @voyant-travel/react@0.41.0

## 0.40.1

### Patch Changes

- @voyant-travel/legal@0.40.1
- @voyant-travel/react@0.40.1

## 0.40.0

### Patch Changes

- @voyant-travel/legal@0.40.0
- @voyant-travel/react@0.40.0

## 0.39.0

### Patch Changes

- @voyant-travel/legal@0.39.0
- @voyant-travel/react@0.39.0

## 0.38.2

### Patch Changes

- @voyant-travel/legal@0.38.2
- @voyant-travel/react@0.38.2

## 0.38.1

### Patch Changes

- @voyant-travel/legal@0.38.1
- @voyant-travel/react@0.38.1

## 0.38.0

### Patch Changes

- @voyant-travel/legal@0.38.0
- @voyant-travel/react@0.38.0

## 0.37.1

### Patch Changes

- @voyant-travel/legal@0.37.1
- @voyant-travel/react@0.37.1

## 0.37.0

### Patch Changes

- @voyant-travel/legal@0.37.0
- @voyant-travel/react@0.37.0

## 0.36.0

### Patch Changes

- @voyant-travel/legal@0.36.0
- @voyant-travel/react@0.36.0

## 0.35.0

### Patch Changes

- @voyant-travel/legal@0.35.0
- @voyant-travel/react@0.35.0

## 0.34.0

### Minor Changes

- 24b6624: Add person-aware contract list search, hydrate contract person details, and expose a ContractsPage person filter.

### Patch Changes

- 6e4a90f: Polish the contract detail page with a clearer header, tabbed document and signature sections, and a file-first attachment dialog.
- Updated dependencies [6e4a90f]
- Updated dependencies [24b6624]
- Updated dependencies [a37d4af]
  - @voyant-travel/legal@0.34.0
  - @voyant-travel/react@0.34.0

## 0.33.1

### Patch Changes

- @voyant-travel/legal@0.33.1
- @voyant-travel/react@0.33.1

## 0.33.0

### Patch Changes

- @voyant-travel/legal@0.33.0
- @voyant-travel/react@0.33.0

## 0.32.3

### Patch Changes

- @voyant-travel/legal@0.32.3
- @voyant-travel/react@0.32.3

## 0.32.2

### Patch Changes

- @voyant-travel/legal@0.32.2
- @voyant-travel/react@0.32.2

## 0.32.1

### Patch Changes

- @voyant-travel/legal@0.32.1
- @voyant-travel/react@0.32.1

## 0.32.0

### Patch Changes

- @voyant-travel/legal@0.32.0
- @voyant-travel/react@0.32.0

## 0.31.4

### Patch Changes

- @voyant-travel/legal@0.31.4
- @voyant-travel/react@0.31.4

## 0.31.3

### Patch Changes

- @voyant-travel/legal@0.31.3
- @voyant-travel/react@0.31.3

## 0.31.2

### Patch Changes

- @voyant-travel/legal@0.31.2
- @voyant-travel/react@0.31.2

## 0.31.1

### Patch Changes

- @voyant-travel/legal@0.31.1
- @voyant-travel/react@0.31.1

## 0.31.0

### Patch Changes

- @voyant-travel/legal@0.31.0
- @voyant-travel/react@0.31.0

## 0.30.7

### Patch Changes

- @voyant-travel/legal@0.30.7
- @voyant-travel/react@0.30.7

## 0.30.6

### Patch Changes

- @voyant-travel/legal@0.30.6
- @voyant-travel/react@0.30.6

## 0.30.5

### Patch Changes

- @voyant-travel/legal@0.30.5
- @voyant-travel/react@0.30.5

## 0.30.4

### Patch Changes

- @voyant-travel/legal@0.30.4
- @voyant-travel/react@0.30.4

## 0.30.3

### Patch Changes

- @voyant-travel/legal@0.30.3
- @voyant-travel/react@0.30.3

## 0.30.2

### Patch Changes

- @voyant-travel/legal@0.30.2
- @voyant-travel/react@0.30.2

## 0.30.1

### Patch Changes

- @voyant-travel/legal@0.30.1
- @voyant-travel/react@0.30.1

## 0.30.0

### Patch Changes

- @voyant-travel/legal@0.30.0
- @voyant-travel/react@0.30.0

## 0.29.0

### Patch Changes

- Updated dependencies [3af39d1]
  - @voyant-travel/legal@0.29.0
  - @voyant-travel/react@0.29.0

## 0.28.3

### Patch Changes

- @voyant-travel/legal@0.28.3
- @voyant-travel/react@0.28.3

## 0.28.2

### Patch Changes

- @voyant-travel/legal@0.28.2
- @voyant-travel/react@0.28.2

## 0.28.1

### Patch Changes

- @voyant-travel/legal@0.28.1
- @voyant-travel/react@0.28.1

## 0.28.0

### Patch Changes

- @voyant-travel/legal@0.28.0
- @voyant-travel/react@0.28.0

## 0.27.0

### Patch Changes

- @voyant-travel/legal@0.27.0
- @voyant-travel/react@0.27.0

## 0.26.9

### Patch Changes

- @voyant-travel/legal@0.26.9
- @voyant-travel/react@0.26.9

## 0.26.8

### Patch Changes

- @voyant-travel/legal@0.26.8
- @voyant-travel/react@0.26.8

## 0.26.7

### Patch Changes

- @voyant-travel/legal@0.26.7
- @voyant-travel/react@0.26.7

## 0.26.6

### Patch Changes

- @voyant-travel/legal@0.26.6
- @voyant-travel/react@0.26.6

## 0.26.5

### Patch Changes

- @voyant-travel/legal@0.26.5
- @voyant-travel/react@0.26.5

## 0.26.4

### Patch Changes

- @voyant-travel/legal@0.26.4
- @voyant-travel/react@0.26.4

## 0.26.3

### Patch Changes

- @voyant-travel/legal@0.26.3
- @voyant-travel/react@0.26.3

## 0.26.2

### Patch Changes

- @voyant-travel/legal@0.26.2
- @voyant-travel/react@0.26.2

## 0.26.1

### Patch Changes

- @voyant-travel/legal@0.26.1
- @voyant-travel/react@0.26.1

## 0.26.0

### Patch Changes

- @voyant-travel/legal@0.26.0
- @voyant-travel/react@0.26.0

## 0.25.0

### Patch Changes

- @voyant-travel/legal@0.25.0
- @voyant-travel/react@0.25.0

## 0.24.3

### Patch Changes

- @voyant-travel/legal@0.24.3
- @voyant-travel/react@0.24.3

## 0.24.2

### Patch Changes

- @voyant-travel/legal@0.24.2
- @voyant-travel/react@0.24.2

## 0.24.1

### Patch Changes

- @voyant-travel/legal@0.24.1
- @voyant-travel/react@0.24.1

## 0.24.0

### Patch Changes

- @voyant-travel/legal@0.24.0
- @voyant-travel/react@0.24.0

## 0.23.0

### Patch Changes

- @voyant-travel/legal@0.23.0
- @voyant-travel/react@0.23.0

## 0.22.0

### Patch Changes

- @voyant-travel/legal@0.22.0
- @voyant-travel/react@0.22.0

## 0.21.1

### Patch Changes

- @voyant-travel/legal@0.21.1
- @voyant-travel/react@0.21.1

## 0.21.0

### Patch Changes

- Updated dependencies [6427bad]
  - @voyant-travel/legal@0.21.0
  - @voyant-travel/react@0.21.0

## 0.20.0

### Patch Changes

- @voyant-travel/legal@0.20.0
- @voyant-travel/react@0.20.0

## 0.19.0

### Patch Changes

- @voyant-travel/legal@0.19.0
- @voyant-travel/react@0.19.0

## 0.18.0

### Patch Changes

- Updated dependencies [8932f60]
  - @voyant-travel/legal@0.18.0
  - @voyant-travel/react@0.18.0

## 0.17.0

### Patch Changes

- Updated dependencies [66d722d]
  - @voyant-travel/legal@0.17.0
  - @voyant-travel/react@0.17.0

## 0.16.0

### Patch Changes

- @voyant-travel/legal@0.16.0
- @voyant-travel/react@0.16.0

## 0.15.0

### Patch Changes

- @voyant-travel/legal@0.15.0
- @voyant-travel/react@0.15.0

## 0.14.0

### Patch Changes

- @voyant-travel/legal@0.14.0
- @voyant-travel/react@0.14.0

## 0.13.0

### Patch Changes

- @voyant-travel/legal@0.13.0
- @voyant-travel/react@0.13.0

## 0.12.0

### Patch Changes

- @voyant-travel/legal@0.12.0
- @voyant-travel/react@0.12.0

## 0.11.0

### Patch Changes

- @voyant-travel/legal@0.11.0
- @voyant-travel/react@0.11.0

## 0.10.0

### Patch Changes

- Updated dependencies [29a581a]
  - @voyant-travel/legal@0.10.0
  - @voyant-travel/react@0.10.0

## 0.9.0

### Patch Changes

- @voyant-travel/legal@0.9.0
- @voyant-travel/react@0.9.0

## 0.8.0

### Minor Changes

- 24dc253: End-to-end contract generation workflow for the operator template. Four-PR batch riding together on the fixed train:

  **Template renderer filters (#270)** — Three new Liquid filters registered on `@voyant-travel/utils`' shared template engine: `currency`, `cents` (integer cents → currency string), `format_date` with short/medium/long/iso presets. Picked up automatically by `renderStructuredTemplate` consumers (`@voyant-travel/legal`, `@voyant-travel/notifications`).

  **Auto-generate on booking.confirmed (#271)** — `createLegalHonoModule` now accepts `autoGenerateContractOnConfirmed`: an opt-in subscriber that, on every `booking.confirmed` event, creates a contract against the configured template slug, renders its Liquid body with booking + traveler variables, and delegates to the configured PDF generator. Discriminated outcome (`template_not_found` / `template_version_missing` / `booking_not_found` / `contract_create_failed` / `document_failed` / `ok`) surfaces misconfigs at bootstrap. New `findTemplateBySlug` + `findSeriesByName` helpers on the template/series services. `@voyant-travel/legal` now depends on `@voyant-travel/bookings` (no cycle).

  **Booking contract card hook plumbing (#272)** — `@voyant-travel/legal-react` gains `generateDocument` + `regenerateDocument` mutations on `useLegalContractMutation`, `LegalContractsListFilters` now carries `bookingId` / `personId` / `organizationId` (already server-side-supported), new `legalContractGenerateDocumentResponse` schema. Paired registry component `voyant-legal-booking-contract-card` lists contracts for a booking with download + regenerate actions.

  **Operator wiring (#273)** — Operator template now resolves a PDF document generator from the `DOCUMENTS_BUCKET` R2 binding, enables `autoGenerateContractOnConfirmed` against slug `customer-sales-agreement`, and its seed script now writes a proper Liquid-templated contract body + a `contract_template_versions` row so the auto-generate flow resolves end-to-end from first confirm.

### Patch Changes

- Updated dependencies [24dc253]
  - @voyant-travel/legal@0.8.0
  - @voyant-travel/react@0.8.0

## 0.7.0

### Patch Changes

- @voyant-travel/legal@0.7.0
- @voyant-travel/react@0.7.0

## 0.6.9

### Patch Changes

- @voyant-travel/legal@0.6.9
- @voyant-travel/react@0.6.9

## 0.6.8

### Patch Changes

- Updated dependencies [b218885]
- Updated dependencies [b218885]
  - @voyant-travel/legal@0.6.8
  - @voyant-travel/react@0.6.8

## 0.6.7

### Patch Changes

- @voyant-travel/legal@0.6.7
- @voyant-travel/react@0.6.7

## 0.6.6

### Patch Changes

- @voyant-travel/legal@0.6.6
- @voyant-travel/react@0.6.6

## 0.6.5

### Patch Changes

- @voyant-travel/legal@0.6.5
- @voyant-travel/react@0.6.5

## 0.6.4

### Patch Changes

- @voyant-travel/legal@0.6.4
- @voyant-travel/react@0.6.4

## 0.6.3

### Patch Changes

- @voyant-travel/legal@0.6.3
- @voyant-travel/react@0.6.3

## 0.6.2

### Patch Changes

- @voyant-travel/legal@0.6.2
- @voyant-travel/react@0.6.2

## 0.6.1

### Patch Changes

- @voyant-travel/legal@0.6.1
- @voyant-travel/react@0.6.1

## 0.6.0

### Patch Changes

- @voyant-travel/legal@0.6.0
- @voyant-travel/react@0.6.0

## 0.5.0

### Minor Changes

- ce72e29: Flesh out the operator booking workspace with React hooks for the sections that already existed on the backend.

  - `@voyant-travel/bookings-react`: add hooks for booking items (`useBookingItems`, `useBookingItemMutation`), item-traveler assignment (`useBookingItemTravelers`, `useBookingItemTravelerMutation`), documents (`useBookingDocuments`, `useBookingDocumentMutation`), cancellation (`useBookingCancelMutation`), and convert-from-product (`useBookingConvertMutation`).
  - `@voyant-travel/finance-react`: add hooks for booking payment schedules (`useBookingPaymentSchedules`, `useBookingPaymentScheduleMutation`) and booking guarantees (`useBookingGuarantees`, `useBookingGuaranteeMutation`).
  - `@voyant-travel/legal-react`: add policy resolution (`useResolvePolicy`) and cancellation evaluation (`useEvaluateCancellation`) hooks that power the structured booking cancellation workflow.

### Patch Changes

- @voyant-travel/legal@0.5.0
- @voyant-travel/react@0.5.0

## 0.4.5

### Patch Changes

- Updated dependencies [e3f6e72]
  - @voyant-travel/legal@0.4.5
  - @voyant-travel/react@0.4.5

## 0.4.4

### Patch Changes

- @voyant-travel/legal@0.4.4
- @voyant-travel/react@0.4.4

## 0.4.3

### Patch Changes

- @voyant-travel/legal@0.4.3
- @voyant-travel/react@0.4.3

## 0.4.2

### Patch Changes

- Updated dependencies [8de4602]
  - @voyant-travel/legal@0.4.2
  - @voyant-travel/react@0.4.2

## 0.4.1

### Patch Changes

- @voyant-travel/legal@0.4.1
- @voyant-travel/react@0.4.1

## 0.4.0

### Patch Changes

- Updated dependencies [e84fe0f]
- Updated dependencies [e84fe0f]
- Updated dependencies [e84fe0f]
- Updated dependencies [e84fe0f]
  - @voyant-travel/legal@0.4.0
  - @voyant-travel/react@0.4.0

## 0.3.1

### Patch Changes

- Updated dependencies [8566f2d]
  - @voyant-travel/legal@0.3.1
  - @voyant-travel/react@0.3.1

## 0.3.0

### Patch Changes

- Updated dependencies [e57725d]
  - @voyant-travel/legal@0.3.0
  - @voyant-travel/react@0.3.0
