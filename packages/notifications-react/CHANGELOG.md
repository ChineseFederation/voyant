# @voyant-travel/notifications-react

## 0.142.0

### Patch Changes

- Updated dependencies [bf20d76]
  - @voyant-travel/ui@0.110.0
  - @voyant-travel/admin@0.131.0
  - @voyant-travel/notifications@0.142.0

## 0.141.4

### Patch Changes

- @voyant-travel/notifications@0.141.4

## 0.141.3

### Patch Changes

- @voyant-travel/notifications@0.141.3

## 0.141.2

### Patch Changes

- @voyant-travel/notifications@0.141.2

## 0.141.1

### Patch Changes

- @voyant-travel/notifications@0.141.1

## 0.141.0

### Patch Changes

- Updated dependencies [9c6ca9d]
  - @voyant-travel/notifications@0.141.0

## 0.140.1

### Patch Changes

- @voyant-travel/notifications@0.140.1

## 0.140.0

### Patch Changes

- Updated dependencies [1873611]
  - @voyant-travel/admin@0.130.0
  - @voyant-travel/i18n@0.118.0
  - @voyant-travel/notifications@0.140.0

## 0.139.5

### Patch Changes

- @voyant-travel/notifications@0.139.5

## 0.139.4

### Patch Changes

- Updated dependencies [5daf427]
  - @voyant-travel/i18n@0.117.3
  - @voyant-travel/notifications@0.139.4

## 0.139.3

### Patch Changes

- @voyant-travel/notifications@0.139.3

## 0.139.2

### Patch Changes

- @voyant-travel/notifications@0.139.2

## 0.139.1

### Patch Changes

- @voyant-travel/notifications@0.139.1

## 0.139.0

### Patch Changes

- Updated dependencies [3201e48]
  - @voyant-travel/notifications@0.139.0

## 0.138.1

### Patch Changes

- @voyant-travel/notifications@0.138.1

## 0.138.0

### Patch Changes

- Updated dependencies [5e03ae7]
  - @voyant-travel/notifications@0.138.0

## 0.137.0

### Patch Changes

- Updated dependencies [952d817]
  - @voyant-travel/notifications@0.137.0
  - @voyant-travel/ui@0.109.6

## 0.136.2

### Patch Changes

- @voyant-travel/notifications@0.136.2

## 0.136.1

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
- e2cb9f5: Bring the Romanian (ro) admin translations in line with the plain-language
  English copy pass — re-translating the updated strings so the Romanian UI drops
  the same jargon and reads as clearly as the English. Values only; en/ro key
  parity and ICU placeholders preserved.
- e2cb9f5: Make form and dialog select triggers full-width. The shared `SelectTrigger`
  defaults to `w-fit`, so selects that sit in a form or dialog next to full-width
  inputs rendered noticeably narrower. Add `w-full` at those call sites (filter
  popovers, dialogs, and stacked form fields). Toolbar and inline selects that
  carry an intentional fixed width are left unchanged.
- e2cb9f5: Align off-scale spacing utilities to the shared scale: gap-5 to gap-4, p-5 to
  p-6, space-y-5 to space-y-4, space-y-8 to space-y-6, p-10/p-12 to p-8, gap-8 to
  gap-6. Keeps spacing on the consistent 1/2/3/4/6/8 scale used across the app.
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
  - @voyant-travel/i18n@0.117.2
  - @voyant-travel/admin@0.129.1
  - @voyant-travel/ui@0.109.5
  - @voyant-travel/notifications@0.136.1

## 0.136.0

### Patch Changes

- Updated dependencies [a4cf038]
  - @voyant-travel/notifications@0.136.0

## 0.135.2

### Patch Changes

- @voyant-travel/notifications@0.135.2

## 0.135.1

### Patch Changes

- @voyant-travel/notifications@0.135.1

## 0.135.0

### Patch Changes

- Updated dependencies [58020ec]
  - @voyant-travel/notifications@0.135.0

## 0.134.2

### Patch Changes

- @voyant-travel/notifications@0.134.2

## 0.134.1

### Patch Changes

- @voyant-travel/notifications@0.134.1

## 0.134.0

### Patch Changes

- Updated dependencies [90d44c0]
  - @voyant-travel/admin@0.129.0
  - @voyant-travel/i18n@0.117.0
  - @voyant-travel/notifications@0.134.0

## 0.133.3

### Patch Changes

- @voyant-travel/notifications@0.133.3

## 0.133.2

### Patch Changes

- @voyant-travel/notifications@0.133.2

## 0.133.1

### Patch Changes

- @voyant-travel/notifications@0.133.1

## 0.133.0

### Patch Changes

- Updated dependencies [228b57d]
- Updated dependencies [f2c9404]
  - @voyant-travel/notifications@0.133.0
  - @voyant-travel/types@0.109.9

## 0.132.14

### Patch Changes

- @voyant-travel/notifications@0.132.14

## 0.132.13

### Patch Changes

- @voyant-travel/notifications@0.132.13
- @voyant-travel/ui@0.109.4

## 0.132.12

### Patch Changes

- @voyant-travel/notifications@0.132.12

## 0.132.11

### Patch Changes

- @voyant-travel/notifications@0.132.11

## 0.132.10

### Patch Changes

- @voyant-travel/notifications@0.132.10

## 0.132.9

### Patch Changes

- @voyant-travel/notifications@0.132.9

## 0.132.8

### Patch Changes

- @voyant-travel/notifications@0.132.8

## 0.132.7

### Patch Changes

- Updated dependencies [f0f51b4]
  - @voyant-travel/i18n@0.116.0
  - @voyant-travel/admin@0.128.3
  - @voyant-travel/notifications@0.132.7

## 0.132.6

### Patch Changes

- @voyant-travel/notifications@0.132.6

## 0.132.5

### Patch Changes

- @voyant-travel/notifications@0.132.5

## 0.132.4

### Patch Changes

- Updated dependencies [464815c]
  - @voyant-travel/i18n@0.115.1
  - @voyant-travel/notifications@0.132.4

## 0.132.3

### Patch Changes

- Updated dependencies [c2ca4a3]
  - @voyant-travel/i18n@0.115.0
  - @voyant-travel/admin@0.128.2
  - @voyant-travel/notifications@0.132.3

## 0.132.2

### Patch Changes

- Updated dependencies [ecf1680]
  - @voyant-travel/i18n@0.114.0
  - @voyant-travel/notifications@0.132.2
  - @voyant-travel/admin@0.128.1

## 0.132.1

### Patch Changes

- @voyant-travel/notifications@0.132.1

## 0.132.0

### Patch Changes

- Updated dependencies [2bcafc9]
  - @voyant-travel/admin@0.128.0
  - @voyant-travel/i18n@0.113.0
  - @voyant-travel/notifications@0.132.0

## 0.131.10

### Patch Changes

- @voyant-travel/notifications@0.131.10
- @voyant-travel/types@0.109.8

## 0.131.9

### Patch Changes

- @voyant-travel/notifications@0.131.9
- @voyant-travel/types@0.109.7

## 0.131.8

### Patch Changes

- @voyant-travel/notifications@0.131.8
- @voyant-travel/types@0.109.6

## 0.131.7

### Patch Changes

- @voyant-travel/notifications@0.131.7

## 0.131.6

### Patch Changes

- @voyant-travel/notifications@0.131.6

## 0.131.5

### Patch Changes

- @voyant-travel/notifications@0.131.5
- @voyant-travel/ui@0.109.3

## 0.131.4

### Patch Changes

- @voyant-travel/notifications@0.131.4

## 0.131.3

### Patch Changes

- @voyant-travel/notifications@0.131.3

## 0.131.2

### Patch Changes

- Updated dependencies [117fa05]
  - @voyant-travel/i18n@0.112.1
  - @voyant-travel/notifications@0.131.2

## 0.131.1

### Patch Changes

- @voyant-travel/notifications@0.131.1

## 0.131.0

### Patch Changes

- Updated dependencies [a461920]
- Updated dependencies [a461920]
  - @voyant-travel/admin@0.127.0
  - @voyant-travel/notifications@0.131.0

## 0.130.8

### Patch Changes

- @voyant-travel/notifications@0.130.8

## 0.130.7

### Patch Changes

- @voyant-travel/notifications@0.130.7

## 0.130.6

### Patch Changes

- Updated dependencies [0868f18]
- Updated dependencies [3062a73]
  - @voyant-travel/admin@0.126.2
  - @voyant-travel/i18n@0.112.0
  - @voyant-travel/notifications@0.130.6

## 0.130.5

### Patch Changes

- @voyant-travel/notifications@0.130.5

## 0.130.4

### Patch Changes

- @voyant-travel/notifications@0.130.4

## 0.130.3

### Patch Changes

- @voyant-travel/notifications@0.130.3

## 0.130.2

### Patch Changes

- 7a7fd97: Strengthen the internationalization platform across the operator and package UI.

  Add ICU message formatting, explicit locale and time-zone formatters, hierarchical
  locale fallback, validated runtime overrides, account-authoritative preferences,
  localized setup and navigation surfaces, and fail-closed catalog and UI-literal
  checks. Package message providers now accept an optional time zone and expose the
  shared formatting capabilities to package-owned UI.

- Updated dependencies [7a7fd97]
  - @voyant-travel/admin@0.126.1
  - @voyant-travel/i18n@0.111.3
  - @voyant-travel/notifications@0.130.2

## 0.130.1

### Patch Changes

- Updated dependencies [5941d2c]
  - @voyant-travel/i18n@0.111.2
  - @voyant-travel/notifications@0.130.1

## 0.130.0

### Patch Changes

- Updated dependencies [8f0fa26]
  - @voyant-travel/notifications@0.130.0

## 0.129.0

### Patch Changes

- Updated dependencies [c1e37f2]
  - @voyant-travel/admin@0.126.0
  - @voyant-travel/notifications@0.129.0

## 0.128.1

### Patch Changes

- Updated dependencies [f819273]
- Updated dependencies [6604f9e]
  - @voyant-travel/notifications@0.128.1

## 0.128.0

### Patch Changes

- b459761: Accept current Lucide releases in public peer ranges so the standard Operator package closure
  resolves for external npm consumers.
- Updated dependencies [766d24b]
- Updated dependencies [7e9f77a]
- Updated dependencies [82ffd12]
- Updated dependencies [6147b93]
- Updated dependencies [b459761]
  - @voyant-travel/ui@0.109.2
  - @voyant-travel/admin@0.125.0
  - @voyant-travel/notifications@0.128.0

## 0.127.0

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
  - @voyant-travel/notifications@0.127.0
  - @voyant-travel/types@0.109.2

## 0.126.5

### Patch Changes

- @voyant-travel/notifications@0.126.5

## 0.126.4

### Patch Changes

- 8d62a7c: Republish every affected TypeScript package without broken declaration maps so the corrected artifact
  policy reaches npm instead of applying only to future incidental package releases.
- Updated dependencies [8d62a7c]
- Updated dependencies [8d62a7c]
  - @voyant-travel/types@0.109.1
  - @voyant-travel/admin@0.123.3
  - @voyant-travel/i18n@0.111.1
  - @voyant-travel/notifications@0.126.4
  - @voyant-travel/react@0.104.2
  - @voyant-travel/ui@0.109.1

## 0.126.3

### Patch Changes

- Updated dependencies [bbe6396]
  - @voyant-travel/i18n@0.111.0
  - @voyant-travel/notifications@0.126.3
  - @voyant-travel/admin@0.123.2

## 0.126.2

### Patch Changes

- @voyant-travel/notifications@0.126.2

## 0.126.1

### Patch Changes

- @voyant-travel/notifications@0.126.1

## 0.126.0

### Patch Changes

- 8bd906f: Breaking beta cleanup: remove the deprecated `onInsertVariable` and
  `onInsertSnippet` props from `ContractTemplateAuthoringHelp`. The helper only
  supports copying template values and snippets to the clipboard; consumers
  should remove these ignored callbacks. Also remove the inert Legal and
  Notifications caller wiring.
- Updated dependencies [4d0eeed]
- Updated dependencies [8bd906f]
  - @voyant-travel/types@0.109.0
  - @voyant-travel/ui@0.109.0
  - @voyant-travel/notifications@0.126.0
  - @voyant-travel/admin@0.123.0

## 0.125.0

### Patch Changes

- 490d132: Move standard first-party admin factories, package copy, slots, contributions, and icons into selected deployment graph composition.
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
- Updated dependencies [490d132]
- Updated dependencies [490d132]
  - @voyant-travel/notifications@0.125.0
  - @voyant-travel/admin@0.122.0
  - @voyant-travel/types@0.108.1

## 0.124.0

### Patch Changes

- Updated dependencies [d771be3]
- Updated dependencies [02b4103]
- Updated dependencies [d771be3]
- Updated dependencies [d771be3]
  - @voyant-travel/notifications@0.124.0
  - @voyant-travel/types@0.108.0
  - @voyant-travel/admin@0.121.0

## 0.123.5

### Patch Changes

- Updated dependencies [e5aa097]
- Updated dependencies [1081483]
- Updated dependencies [6e3ec4e]
  - @voyant-travel/notifications@0.123.5

## 0.123.4

### Patch Changes

- @voyant-travel/notifications@0.123.4
- @voyant-travel/types@0.107.3

## 0.123.3

### Patch Changes

- @voyant-travel/notifications@0.123.3

## 0.123.2

### Patch Changes

- @voyant-travel/notifications@0.123.2

## 0.123.1

### Patch Changes

- @voyant-travel/notifications@0.123.1

## 0.123.0

### Patch Changes

- Updated dependencies [a370024]
- Updated dependencies [a370024]
- Updated dependencies [e3dc5a9]
  - @voyant-travel/notifications@0.123.0
  - @voyant-travel/types@0.107.2

## 0.122.2

### Patch Changes

- @voyant-travel/notifications@0.122.2

## 0.122.1

### Patch Changes

- Updated dependencies [5e1d221]
  - @voyant-travel/notifications@0.122.1

## 0.122.0

### Patch Changes

- Updated dependencies [a97e845]
  - @voyant-travel/admin@0.120.0
  - @voyant-travel/notifications@0.122.0

## 0.121.0

### Patch Changes

- Updated dependencies [8a665f3]
  - @voyant-travel/admin@0.119.0
  - @voyant-travel/notifications@0.121.0

## 0.120.0

### Patch Changes

- @voyant-travel/admin@0.118.0
- @voyant-travel/notifications@0.120.0

## 0.119.0

### Patch Changes

- Updated dependencies [ecdf0fc]
  - @voyant-travel/admin@0.117.0
  - @voyant-travel/notifications@0.119.0

## 0.118.6

### Patch Changes

- @voyant-travel/notifications@0.118.6

## 0.118.5

### Patch Changes

- @voyant-travel/notifications@0.118.5

## 0.118.4

### Patch Changes

- @voyant-travel/ui@0.108.11
- @voyant-travel/notifications@0.118.4
- @voyant-travel/types@0.107.1

## 0.118.3

### Patch Changes

- @voyant-travel/notifications@0.118.3

## 0.118.2

### Patch Changes

- Updated dependencies [0811565]
  - @voyant-travel/notifications@0.118.2

## 0.118.1

### Patch Changes

- @voyant-travel/notifications@0.118.1

## 0.118.0

### Patch Changes

- Updated dependencies [62e87ee]
  - @voyant-travel/admin@0.116.0
  - @voyant-travel/i18n@0.110.0
  - @voyant-travel/notifications@0.118.0

## 0.117.0

### Patch Changes

- Updated dependencies [c9a356f]
- Updated dependencies [fc71db1]
- Updated dependencies [05961f1]
  - @voyant-travel/types@0.107.0
  - @voyant-travel/notifications@0.117.0
  - @voyant-travel/admin@0.115.4

## 0.116.13

### Patch Changes

- Updated dependencies [f1090b7]
- Updated dependencies [42f662c]
  - @voyant-travel/i18n@0.109.8
  - @voyant-travel/notifications@0.116.13

## 0.116.12

### Patch Changes

- Updated dependencies [b254511]
  - @voyant-travel/ui@0.108.10
  - @voyant-travel/notifications@0.116.12

## 0.116.11

### Patch Changes

- @voyant-travel/notifications@0.116.11

## 0.116.10

### Patch Changes

- b064936: Fix notification template detail previews so the built-in sample JSON is submitted and loop sample values are structured arrays.
- 412ed62: Fix notification template create/edit status controls so active templates persist correctly.
- 1e5251d: Fix reminder stage channel template selection so active templates can be picked by slug and submitted as `templateSlug`.
- Updated dependencies [4c18cc6]
- Updated dependencies [0b57296]
- Updated dependencies [1e5251d]
  - @voyant-travel/notifications@0.116.10
  - @voyant-travel/ui@0.108.9

## 0.116.9

### Patch Changes

- Updated dependencies [89cc2c4]
  - @voyant-travel/notifications@0.116.9

## 0.116.8

### Patch Changes

- @voyant-travel/notifications@0.116.8

## 0.116.7

### Patch Changes

- @voyant-travel/notifications@0.116.7

## 0.116.6

### Patch Changes

- 12a1eb2: Expose client-safe subpaths for validation schemas, linkable metadata, template authoring metadata, finance payment-policy primitives, and Hono reporter utilities. Move browser-facing React/operator imports off mixed runtime barrels so client bundles do not pull Hono request context or other server-only runtime code.
- Updated dependencies [12a1eb2]
  - @voyant-travel/notifications@0.116.6

## 0.116.5

### Patch Changes

- Updated dependencies [7cb6fa7]
  - @voyant-travel/i18n@0.109.0
  - @voyant-travel/admin@0.115.2
  - @voyant-travel/ui@0.108.2
  - @voyant-travel/notifications@0.116.5

## 0.116.4

### Patch Changes

- @voyant-travel/notifications@0.116.4

## 0.116.3

### Patch Changes

- @voyant-travel/notifications@0.116.3

## 0.116.2

### Patch Changes

- Updated dependencies [fac9297]
  - @voyant-travel/notifications@0.116.2

## 0.116.1

### Patch Changes

- @voyant-travel/notifications@0.116.1

## 0.116.0

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
  - @voyant-travel/notifications@0.116.0
  - @voyant-travel/admin@0.115.1

## 0.115.0

### Patch Changes

- Updated dependencies [4abf9a2]
  - @voyant-travel/admin@0.115.0
  - @voyant-travel/i18n@0.108.0
  - @voyant-travel/notifications@0.115.0
  - @voyant-travel/ui@0.108.1

## 0.114.9

### Patch Changes

- @voyant-travel/notifications@0.114.9

## 0.114.8

### Patch Changes

- @voyant-travel/notifications@0.114.8

## 0.114.7

### Patch Changes

- Updated dependencies [310565b]
  - @voyant-travel/i18n@0.107.3
  - @voyant-travel/notifications@0.114.7

## 0.114.6

### Patch Changes

- Updated dependencies [dbea53e]
  - @voyant-travel/i18n@0.107.2
  - @voyant-travel/notifications@0.114.6

## 0.114.5

### Patch Changes

- @voyant-travel/notifications@0.114.5

## 0.114.4

### Patch Changes

- @voyant-travel/notifications@0.114.4

## 0.114.3

### Patch Changes

- @voyant-travel/notifications@0.114.3

## 0.114.2

### Patch Changes

- Updated dependencies [1841ce2]
  - @voyant-travel/notifications@0.114.2

## 0.114.1

### Patch Changes

- @voyant-travel/notifications@0.114.1

## 0.114.0

### Patch Changes

- Updated dependencies [a74471e]
- Updated dependencies [a74471e]
  - @voyant-travel/i18n@0.107.0
  - @voyant-travel/ui@0.108.0
  - @voyant-travel/admin@0.114.0
  - @voyant-travel/notifications@0.114.0

## 0.113.0

### Patch Changes

- Updated dependencies [4f92198]
  - @voyant-travel/ui@0.107.0
  - @voyant-travel/admin@0.113.0
  - @voyant-travel/notifications@0.113.0

## 0.112.0

### Patch Changes

- Updated dependencies [94890c3]
- Updated dependencies [cb9b04b]
  - @voyant-travel/admin@0.112.0
  - @voyant-travel/notifications@0.112.0

## 0.111.12

### Patch Changes

- d406a85: Default reminder stages without `maxSendsInStage` to one send so a final stage cannot repeat indefinitely unless a finite repeat cap is configured.

  Update the reminder stage editor copy and defaults so blank max-send caps are presented as the one-send default instead of unlimited repeats.

- Updated dependencies [d406a85]
  - @voyant-travel/notifications@0.111.12

## 0.111.11

### Patch Changes

- @voyant-travel/notifications@0.111.11

## 0.111.10

### Patch Changes

- @voyant-travel/notifications@0.111.10

## 0.111.9

### Patch Changes

- eef1a00: Republish notification and UI consumer packages so stale beta artifacts no longer reference legacy notification package specifiers.
- Updated dependencies [eef1a00]
  - @voyant-travel/admin@0.111.2
  - @voyant-travel/notifications@0.111.9

## 0.111.8

### Patch Changes

- Updated dependencies [dd71543]
  - @voyant-travel/admin@0.111.1
  - @voyant-travel/notifications@0.111.8

## 0.111.7

### Patch Changes

- 1595c69: Split oversized notification reminder services and promotions/notification React modules into focused internal files while preserving existing public exports and behavior.
- Updated dependencies [1595c69]
  - @voyant-travel/notifications@0.111.7

## 0.111.6

### Patch Changes

- @voyant-travel/notifications@0.111.6

## 0.111.5

### Patch Changes

- @voyant-travel/notifications@0.111.5
- @voyant-travel/ui@0.106.1

## 0.111.4

### Patch Changes

- @voyant-travel/notifications@0.111.4

## 0.111.3

### Patch Changes

- @voyant-travel/notifications@0.111.3

## 0.111.2

### Patch Changes

- @voyant-travel/notifications@0.111.2

## 0.111.1

### Patch Changes

- @voyant-travel/notifications@0.111.1

## 0.111.0

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
  - @voyant-travel/admin@0.111.0
  - @voyant-travel/notifications@0.111.0

## 0.110.1

### Patch Changes

- @voyant-travel/notifications@0.110.1

## 0.110.0

### Patch Changes

- Updated dependencies [9c909e2]
  - @voyant-travel/admin@0.110.0
  - @voyant-travel/notifications@0.110.0

## 0.109.0

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

- Updated dependencies [faec538]
  - @voyant-travel/admin@0.109.0
  - @voyant-travel/notifications@0.109.0

## 0.108.0

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
  - @voyant-travel/notifications@0.108.0

## 0.107.0

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

- Updated dependencies [eeb23df]
  - @voyant-travel/admin@0.107.0
  - @voyant-travel/notifications@0.107.0

## 0.106.0

### Patch Changes

- @voyant-travel/notifications@0.106.0

## 0.105.2

### Patch Changes

- @voyant-travel/notifications@0.105.2

## 0.105.1

### Patch Changes

- @voyant-travel/notifications@0.105.1

## 0.105.0

### Patch Changes

- @voyant-travel/notifications@0.105.0

## 0.104.5

### Patch Changes

- Updated dependencies [a0e117b]
  - @voyant-travel/notifications@0.104.5

## 0.104.4

### Patch Changes

- @voyant-travel/notifications@0.104.4

## 0.104.3

### Patch Changes

- Updated dependencies [28c5eb3]
  - @voyant-travel/notifications@0.104.3

## 0.104.2

### Patch Changes

- @voyant-travel/notifications@0.104.2

## 0.104.1

### Patch Changes

- Updated dependencies [ba5daa6]
  - @voyant-travel/notifications@0.104.1
  - @voyant-travel/react@0.104.1

## 0.104.0

### Patch Changes

- @voyant-travel/notifications@0.104.0
- @voyant-travel/react@0.104.0

## 0.103.0

### Patch Changes

- @voyant-travel/notifications@0.103.0
- @voyant-travel/react@0.103.0

## 0.102.0

### Patch Changes

- @voyant-travel/notifications@0.102.0
- @voyant-travel/react@0.102.0

## 0.101.2

### Patch Changes

- @voyant-travel/notifications@0.101.2
- @voyant-travel/react@0.101.2

## 0.101.1

### Patch Changes

- @voyant-travel/notifications@0.101.1
- @voyant-travel/react@0.101.1

## 0.101.0

### Patch Changes

- @voyant-travel/notifications@0.101.0
- @voyant-travel/react@0.101.0

## 0.100.0

### Patch Changes

- @voyant-travel/notifications@0.100.0
- @voyant-travel/react@0.100.0

## 0.99.0

### Patch Changes

- @voyant-travel/notifications@0.99.0
- @voyant-travel/react@0.99.0

## 0.98.0

### Patch Changes

- @voyant-travel/notifications@0.98.0
- @voyant-travel/react@0.98.0

## 0.97.0

### Patch Changes

- @voyant-travel/notifications@0.97.0
- @voyant-travel/react@0.97.0

## 0.96.0

### Patch Changes

- @voyant-travel/notifications@0.96.0
- @voyant-travel/react@0.96.0

## 0.95.0

### Patch Changes

- @voyant-travel/notifications@0.95.0
- @voyant-travel/react@0.95.0

## 0.94.0

### Patch Changes

- @voyant-travel/notifications@0.94.0
- @voyant-travel/react@0.94.0

## 0.93.0

### Patch Changes

- @voyant-travel/notifications@0.93.0
- @voyant-travel/react@0.93.0

## 0.92.0

### Patch Changes

- @voyant-travel/notifications@0.92.0
- @voyant-travel/react@0.92.0

## 0.91.0

### Patch Changes

- @voyant-travel/notifications@0.91.0
- @voyant-travel/react@0.91.0

## 0.90.0

### Patch Changes

- @voyant-travel/notifications@0.90.0
- @voyant-travel/react@0.90.0

## 0.89.0

### Patch Changes

- @voyant-travel/notifications@0.89.0
- @voyant-travel/react@0.89.0

## 0.88.0

### Patch Changes

- @voyant-travel/notifications@0.88.0
- @voyant-travel/react@0.88.0

## 0.87.1

### Patch Changes

- @voyant-travel/notifications@0.87.1
- @voyant-travel/react@0.87.1

## 0.87.0

### Patch Changes

- @voyant-travel/notifications@0.87.0
- @voyant-travel/react@0.87.0

## 0.86.0

### Patch Changes

- @voyant-travel/notifications@0.86.0
- @voyant-travel/react@0.86.0

## 0.85.4

### Patch Changes

- @voyant-travel/notifications@0.85.4
- @voyant-travel/react@0.85.4

## 0.85.3

### Patch Changes

- @voyant-travel/notifications@0.85.3
- @voyant-travel/react@0.85.3

## 0.85.2

### Patch Changes

- @voyant-travel/notifications@0.85.2
- @voyant-travel/react@0.85.2

## 0.85.1

### Patch Changes

- @voyant-travel/notifications@0.85.1
- @voyant-travel/react@0.85.1

## 0.85.0

### Patch Changes

- @voyant-travel/notifications@0.85.0
- @voyant-travel/react@0.85.0

## 0.84.4

### Patch Changes

- @voyant-travel/notifications@0.84.4
- @voyant-travel/react@0.84.4

## 0.84.3

### Patch Changes

- @voyant-travel/notifications@0.84.3
- @voyant-travel/react@0.84.3

## 0.84.2

### Patch Changes

- @voyant-travel/notifications@0.84.2
- @voyant-travel/react@0.84.2

## 0.84.1

### Patch Changes

- @voyant-travel/notifications@0.84.1
- @voyant-travel/react@0.84.1

## 0.84.0

### Patch Changes

- @voyant-travel/notifications@0.84.0
- @voyant-travel/react@0.84.0

## 0.83.1

### Patch Changes

- @voyant-travel/notifications@0.83.1
- @voyant-travel/react@0.83.1

## 0.83.0

### Patch Changes

- @voyant-travel/notifications@0.83.0
- @voyant-travel/react@0.83.0

## 0.82.1

### Patch Changes

- @voyant-travel/notifications@0.82.1
- @voyant-travel/react@0.82.1

## 0.82.0

### Patch Changes

- @voyant-travel/notifications@0.82.0
- @voyant-travel/react@0.82.0

## 0.81.21

### Patch Changes

- @voyant-travel/notifications@0.81.21
- @voyant-travel/react@0.81.21

## 0.81.20

### Patch Changes

- @voyant-travel/notifications@0.81.20
- @voyant-travel/react@0.81.20

## 0.81.19

### Patch Changes

- @voyant-travel/notifications@0.81.19
- @voyant-travel/react@0.81.19

## 0.81.18

### Patch Changes

- @voyant-travel/notifications@0.81.18
- @voyant-travel/react@0.81.18

## 0.81.17

### Patch Changes

- @voyant-travel/notifications@0.81.17
- @voyant-travel/react@0.81.17

## 0.81.16

### Patch Changes

- @voyant-travel/notifications@0.81.16
- @voyant-travel/react@0.81.16

## 0.81.15

### Patch Changes

- @voyant-travel/notifications@0.81.15
- @voyant-travel/react@0.81.15

## 0.81.14

### Patch Changes

- @voyant-travel/notifications@0.81.14
- @voyant-travel/react@0.81.14

## 0.81.13

### Patch Changes

- @voyant-travel/notifications@0.81.13
- @voyant-travel/react@0.81.13

## 0.81.12

### Patch Changes

- @voyant-travel/notifications@0.81.12
- @voyant-travel/react@0.81.12

## 0.81.11

### Patch Changes

- @voyant-travel/notifications@0.81.11
- @voyant-travel/react@0.81.11

## 0.81.10

### Patch Changes

- @voyant-travel/notifications@0.81.10
- @voyant-travel/react@0.81.10

## 0.81.9

### Patch Changes

- @voyant-travel/notifications@0.81.9
- @voyant-travel/react@0.81.9

## 0.81.8

### Patch Changes

- @voyant-travel/notifications@0.81.8
- @voyant-travel/react@0.81.8

## 0.81.7

### Patch Changes

- @voyant-travel/notifications@0.81.7
- @voyant-travel/react@0.81.7

## 0.81.6

### Patch Changes

- @voyant-travel/notifications@0.81.6
- @voyant-travel/react@0.81.6

## 0.81.5

### Patch Changes

- @voyant-travel/notifications@0.81.5
- @voyant-travel/react@0.81.5

## 0.81.4

### Patch Changes

- @voyant-travel/notifications@0.81.4
- @voyant-travel/react@0.81.4

## 0.81.3

### Patch Changes

- @voyant-travel/notifications@0.81.3
- @voyant-travel/react@0.81.3

## 0.81.2

### Patch Changes

- @voyant-travel/notifications@0.81.2
- @voyant-travel/react@0.81.2

## 0.81.1

### Patch Changes

- @voyant-travel/notifications@0.81.1
- @voyant-travel/react@0.81.1

## 0.81.0

### Patch Changes

- @voyant-travel/notifications@0.81.0
- @voyant-travel/react@0.81.0

## 0.80.18

### Patch Changes

- @voyant-travel/notifications@0.80.18
- @voyant-travel/react@0.80.18

## 0.80.17

### Patch Changes

- @voyant-travel/notifications@0.80.17
- @voyant-travel/react@0.80.17

## 0.80.16

### Patch Changes

- @voyant-travel/notifications@0.80.16
- @voyant-travel/react@0.80.16

## 0.80.15

### Patch Changes

- @voyant-travel/notifications@0.80.15
- @voyant-travel/react@0.80.15

## 0.80.14

### Patch Changes

- @voyant-travel/notifications@0.80.14
- @voyant-travel/react@0.80.14

## 0.80.13

### Patch Changes

- @voyant-travel/notifications@0.80.13
- @voyant-travel/react@0.80.13

## 0.80.12

### Patch Changes

- @voyant-travel/notifications@0.80.12
- @voyant-travel/react@0.80.12

## 0.80.11

### Patch Changes

- @voyant-travel/notifications@0.80.11
- @voyant-travel/react@0.80.11

## 0.80.10

### Patch Changes

- @voyant-travel/notifications@0.80.10
- @voyant-travel/react@0.80.10

## 0.80.9

### Patch Changes

- @voyant-travel/notifications@0.80.9
- @voyant-travel/react@0.80.9

## 0.80.8

### Patch Changes

- @voyant-travel/notifications@0.80.8
- @voyant-travel/react@0.80.8

## 0.80.7

### Patch Changes

- @voyant-travel/notifications@0.80.7
- @voyant-travel/react@0.80.7

## 0.80.6

### Patch Changes

- @voyant-travel/notifications@0.80.6
- @voyant-travel/react@0.80.6

## 0.80.5

### Patch Changes

- @voyant-travel/notifications@0.80.5
- @voyant-travel/react@0.80.5

## 0.80.4

### Patch Changes

- @voyant-travel/notifications@0.80.4
- @voyant-travel/react@0.80.4

## 0.80.3

### Patch Changes

- @voyant-travel/notifications@0.80.3
- @voyant-travel/react@0.80.3

## 0.80.2

### Patch Changes

- @voyant-travel/notifications@0.80.2
- @voyant-travel/react@0.80.2

## 0.80.1

### Patch Changes

- @voyant-travel/notifications@0.80.1
- @voyant-travel/react@0.80.1

## 0.80.0

### Patch Changes

- @voyant-travel/notifications@0.80.0
- @voyant-travel/react@0.80.0

## 0.79.0

### Patch Changes

- @voyant-travel/notifications@0.79.0
- @voyant-travel/react@0.79.0

## 0.78.0

### Patch Changes

- @voyant-travel/notifications@0.78.0
- @voyant-travel/react@0.78.0

## 0.77.13

### Patch Changes

- @voyant-travel/notifications@0.77.13
- @voyant-travel/react@0.77.13

## 0.77.12

### Patch Changes

- Updated dependencies [bf74cd4]
  - @voyant-travel/notifications@0.77.12
  - @voyant-travel/react@0.77.12

## 0.77.11

### Patch Changes

- @voyant-travel/notifications@0.77.11
- @voyant-travel/react@0.77.11

## 0.77.10

### Patch Changes

- @voyant-travel/notifications@0.77.10
- @voyant-travel/react@0.77.10

## 0.77.9

### Patch Changes

- @voyant-travel/notifications@0.77.9
- @voyant-travel/react@0.77.9

## 0.77.8

### Patch Changes

- @voyant-travel/notifications@0.77.8
- @voyant-travel/react@0.77.8

## 0.77.7

### Patch Changes

- @voyant-travel/notifications@0.77.7
- @voyant-travel/react@0.77.7

## 0.77.6

### Patch Changes

- @voyant-travel/notifications@0.77.6
- @voyant-travel/react@0.77.6

## 0.77.5

### Patch Changes

- @voyant-travel/notifications@0.77.5
- @voyant-travel/react@0.77.5

## 0.77.4

### Patch Changes

- @voyant-travel/notifications@0.77.4
- @voyant-travel/react@0.77.4

## 0.77.3

### Patch Changes

- @voyant-travel/notifications@0.77.3
- @voyant-travel/react@0.77.3

## 0.77.2

### Patch Changes

- @voyant-travel/notifications@0.77.2
- @voyant-travel/react@0.77.2

## 0.77.1

### Patch Changes

- @voyant-travel/notifications@0.77.1
- @voyant-travel/react@0.77.1

## 0.77.0

### Patch Changes

- @voyant-travel/notifications@0.77.0
- @voyant-travel/react@0.77.0

## 0.76.0

### Patch Changes

- @voyant-travel/notifications@0.76.0
- @voyant-travel/react@0.76.0

## 0.75.7

### Patch Changes

- @voyant-travel/notifications@0.75.7
- @voyant-travel/react@0.75.7

## 0.75.6

### Patch Changes

- @voyant-travel/notifications@0.75.6
- @voyant-travel/react@0.75.6

## 0.75.5

### Patch Changes

- @voyant-travel/notifications@0.75.5
- @voyant-travel/react@0.75.5

## 0.75.4

### Patch Changes

- @voyant-travel/notifications@0.75.4
- @voyant-travel/react@0.75.4

## 0.75.3

### Patch Changes

- @voyant-travel/notifications@0.75.3
- @voyant-travel/react@0.75.3

## 0.75.2

### Patch Changes

- @voyant-travel/notifications@0.75.2
- @voyant-travel/react@0.75.2

## 0.75.1

### Patch Changes

- @voyant-travel/notifications@0.75.1
- @voyant-travel/react@0.75.1

## 0.75.0

### Patch Changes

- @voyant-travel/notifications@0.75.0
- @voyant-travel/react@0.75.0

## 0.74.2

### Patch Changes

- @voyant-travel/notifications@0.74.2
- @voyant-travel/react@0.74.2

## 0.74.1

### Patch Changes

- @voyant-travel/notifications@0.74.1
- @voyant-travel/react@0.74.1

## 0.74.0

### Patch Changes

- @voyant-travel/notifications@0.74.0
- @voyant-travel/react@0.74.0

## 0.73.1

### Patch Changes

- @voyant-travel/notifications@0.73.1
- @voyant-travel/react@0.73.1

## 0.73.0

### Patch Changes

- @voyant-travel/notifications@0.73.0
- @voyant-travel/react@0.73.0

## 0.72.0

### Patch Changes

- @voyant-travel/notifications@0.72.0
- @voyant-travel/react@0.72.0

## 0.71.0

### Patch Changes

- @voyant-travel/notifications@0.71.0
- @voyant-travel/react@0.71.0

## 0.70.0

### Patch Changes

- @voyant-travel/notifications@0.70.0
- @voyant-travel/react@0.70.0

## 0.69.1

### Patch Changes

- @voyant-travel/notifications@0.69.1
- @voyant-travel/react@0.69.1

## 0.69.0

### Patch Changes

- @voyant-travel/notifications@0.69.0
- @voyant-travel/react@0.69.0

## 0.68.0

### Patch Changes

- @voyant-travel/notifications@0.68.0
- @voyant-travel/react@0.68.0

## 0.67.0

### Patch Changes

- @voyant-travel/notifications@0.67.0
- @voyant-travel/react@0.67.0

## 0.66.6

### Patch Changes

- @voyant-travel/notifications@0.66.6
- @voyant-travel/react@0.66.6

## 0.66.5

### Patch Changes

- @voyant-travel/notifications@0.66.5
- @voyant-travel/react@0.66.5

## 0.66.4

### Patch Changes

- @voyant-travel/notifications@0.66.4
- @voyant-travel/react@0.66.4

## 0.66.3

### Patch Changes

- @voyant-travel/notifications@0.66.3
- @voyant-travel/react@0.66.3

## 0.66.2

### Patch Changes

- @voyant-travel/notifications@0.66.2
- @voyant-travel/react@0.66.2

## 0.66.1

### Patch Changes

- @voyant-travel/notifications@0.66.1
- @voyant-travel/react@0.66.1

## 0.66.0

### Patch Changes

- @voyant-travel/notifications@0.66.0
- @voyant-travel/react@0.66.0

## 0.65.0

### Patch Changes

- @voyant-travel/notifications@0.65.0
- @voyant-travel/react@0.65.0

## 0.64.1

### Patch Changes

- Updated dependencies [572dde4]
  - @voyant-travel/notifications@0.64.1
  - @voyant-travel/react@0.64.1

## 0.64.0

### Patch Changes

- Updated dependencies [6d0c8f3]
  - @voyant-travel/notifications@0.64.0
  - @voyant-travel/react@0.64.0

## 0.63.1

### Patch Changes

- @voyant-travel/notifications@0.63.1
- @voyant-travel/react@0.63.1

## 0.63.0

### Patch Changes

- @voyant-travel/notifications@0.63.0
- @voyant-travel/react@0.63.0

## 0.62.3

### Patch Changes

- @voyant-travel/notifications@0.62.3
- @voyant-travel/react@0.62.3

## 0.62.2

### Patch Changes

- @voyant-travel/notifications@0.62.2
- @voyant-travel/react@0.62.2

## 0.62.1

### Patch Changes

- @voyant-travel/notifications@0.62.1
- @voyant-travel/react@0.62.1

## 0.62.0

### Patch Changes

- @voyant-travel/notifications@0.62.0
- @voyant-travel/react@0.62.0

## 0.61.0

### Patch Changes

- @voyant-travel/notifications@0.61.0
- @voyant-travel/react@0.61.0

## 0.60.0

### Patch Changes

- @voyant-travel/notifications@0.60.0
- @voyant-travel/react@0.60.0

## 0.59.0

### Patch Changes

- @voyant-travel/notifications@0.59.0
- @voyant-travel/react@0.59.0

## 0.58.0

### Patch Changes

- @voyant-travel/notifications@0.58.0
- @voyant-travel/react@0.58.0

## 0.57.0

### Patch Changes

- @voyant-travel/notifications@0.57.0
- @voyant-travel/react@0.57.0

## 0.56.0

### Patch Changes

- @voyant-travel/notifications@0.56.0
- @voyant-travel/react@0.56.0

## 0.55.1

### Patch Changes

- @voyant-travel/notifications@0.55.1
- @voyant-travel/react@0.55.1

## 0.55.0

### Patch Changes

- @voyant-travel/notifications@0.55.0
- @voyant-travel/react@0.55.0

## 0.54.0

### Patch Changes

- @voyant-travel/notifications@0.54.0
- @voyant-travel/react@0.54.0

## 0.53.2

### Patch Changes

- @voyant-travel/notifications@0.53.2
- @voyant-travel/react@0.53.2

## 0.53.1

### Patch Changes

- @voyant-travel/notifications@0.53.1
- @voyant-travel/react@0.53.1

## 0.53.0

### Patch Changes

- @voyant-travel/notifications@0.53.0
- @voyant-travel/react@0.53.0

## 0.52.4

### Patch Changes

- @voyant-travel/notifications@0.52.4
- @voyant-travel/react@0.52.4

## 0.52.3

### Patch Changes

- @voyant-travel/notifications@0.52.3
- @voyant-travel/react@0.52.3

## 0.52.2

### Patch Changes

- Updated dependencies [3e09123]
  - @voyant-travel/notifications@0.52.2
  - @voyant-travel/react@0.52.2

## 0.52.1

### Patch Changes

- @voyant-travel/notifications@0.52.1
- @voyant-travel/react@0.52.1

## 0.52.0

### Patch Changes

- @voyant-travel/notifications@0.52.0
- @voyant-travel/react@0.52.0

## 0.51.1

### Patch Changes

- @voyant-travel/notifications@0.51.1
- @voyant-travel/react@0.51.1

## 0.51.0

### Patch Changes

- @voyant-travel/notifications@0.51.0
- @voyant-travel/react@0.51.0

## 0.50.8

### Patch Changes

- @voyant-travel/notifications@0.50.8
- @voyant-travel/react@0.50.8

## 0.50.7

### Patch Changes

- @voyant-travel/notifications@0.50.7
- @voyant-travel/react@0.50.7

## 0.50.6

### Patch Changes

- @voyant-travel/notifications@0.50.6
- @voyant-travel/react@0.50.6

## 0.50.5

### Patch Changes

- @voyant-travel/notifications@0.50.5
- @voyant-travel/react@0.50.5

## 0.50.4

### Patch Changes

- @voyant-travel/notifications@0.50.4
- @voyant-travel/react@0.50.4

## 0.50.3

### Patch Changes

- @voyant-travel/notifications@0.50.3
- @voyant-travel/react@0.50.3

## 0.50.2

### Patch Changes

- @voyant-travel/notifications@0.50.2
- @voyant-travel/react@0.50.2

## 0.50.1

### Patch Changes

- @voyant-travel/notifications@0.50.1
- @voyant-travel/react@0.50.1

## 0.50.0

### Patch Changes

- @voyant-travel/notifications@0.50.0
- @voyant-travel/react@0.50.0

## 0.49.0

### Patch Changes

- Updated dependencies [3029f10]
  - @voyant-travel/notifications@0.49.0
  - @voyant-travel/react@0.49.0

## 0.48.0

### Patch Changes

- @voyant-travel/notifications@0.48.0
- @voyant-travel/react@0.48.0

## 0.47.0

### Patch Changes

- @voyant-travel/notifications@0.47.0
- @voyant-travel/react@0.47.0

## 0.46.0

### Patch Changes

- @voyant-travel/notifications@0.46.0
- @voyant-travel/react@0.46.0

## 0.45.0

### Patch Changes

- @voyant-travel/notifications@0.45.0
- @voyant-travel/react@0.45.0

## 0.44.0

### Patch Changes

- @voyant-travel/notifications@0.44.0
- @voyant-travel/react@0.44.0

## 0.43.0

### Patch Changes

- @voyant-travel/notifications@0.43.0
- @voyant-travel/react@0.43.0

## 0.42.0

### Patch Changes

- @voyant-travel/notifications@0.42.0
- @voyant-travel/react@0.42.0

## 0.41.3

### Patch Changes

- @voyant-travel/notifications@0.41.3
- @voyant-travel/react@0.41.3

## 0.41.2

### Patch Changes

- @voyant-travel/notifications@0.41.2
- @voyant-travel/react@0.41.2

## 0.41.1

### Patch Changes

- @voyant-travel/notifications@0.41.1
- @voyant-travel/react@0.41.1

## 0.41.0

### Patch Changes

- @voyant-travel/notifications@0.41.0
- @voyant-travel/react@0.41.0

## 0.40.1

### Patch Changes

- @voyant-travel/notifications@0.40.1
- @voyant-travel/react@0.40.1

## 0.40.0

### Patch Changes

- @voyant-travel/notifications@0.40.0
- @voyant-travel/react@0.40.0

## 0.39.0

### Patch Changes

- @voyant-travel/notifications@0.39.0
- @voyant-travel/react@0.39.0

## 0.38.2

### Patch Changes

- @voyant-travel/notifications@0.38.2
- @voyant-travel/react@0.38.2

## 0.38.1

### Patch Changes

- @voyant-travel/notifications@0.38.1
- @voyant-travel/react@0.38.1

## 0.38.0

### Patch Changes

- @voyant-travel/notifications@0.38.0
- @voyant-travel/react@0.38.0

## 0.37.1

### Patch Changes

- @voyant-travel/notifications@0.37.1
- @voyant-travel/react@0.37.1

## 0.37.0

### Patch Changes

- @voyant-travel/notifications@0.37.0
- @voyant-travel/react@0.37.0

## 0.36.0

### Patch Changes

- @voyant-travel/notifications@0.36.0
- @voyant-travel/react@0.36.0

## 0.35.0

### Patch Changes

- @voyant-travel/notifications@0.35.0
- @voyant-travel/react@0.35.0

## 0.34.0

### Patch Changes

- @voyant-travel/notifications@0.34.0
- @voyant-travel/react@0.34.0

## 0.33.1

### Patch Changes

- @voyant-travel/notifications@0.33.1
- @voyant-travel/react@0.33.1

## 0.33.0

### Patch Changes

- @voyant-travel/notifications@0.33.0
- @voyant-travel/react@0.33.0

## 0.32.3

### Patch Changes

- @voyant-travel/notifications@0.32.3
- @voyant-travel/react@0.32.3

## 0.32.2

### Patch Changes

- @voyant-travel/notifications@0.32.2
- @voyant-travel/react@0.32.2

## 0.32.1

### Patch Changes

- @voyant-travel/notifications@0.32.1
- @voyant-travel/react@0.32.1

## 0.32.0

### Patch Changes

- @voyant-travel/notifications@0.32.0
- @voyant-travel/react@0.32.0

## 0.31.4

### Patch Changes

- @voyant-travel/notifications@0.31.4
- @voyant-travel/react@0.31.4

## 0.31.3

### Patch Changes

- @voyant-travel/notifications@0.31.3
- @voyant-travel/react@0.31.3

## 0.31.2

### Patch Changes

- @voyant-travel/notifications@0.31.2
- @voyant-travel/react@0.31.2

## 0.31.1

### Patch Changes

- @voyant-travel/notifications@0.31.1
- @voyant-travel/react@0.31.1

## 0.31.0

### Patch Changes

- @voyant-travel/notifications@0.31.0
- @voyant-travel/react@0.31.0

## 0.30.7

### Patch Changes

- @voyant-travel/notifications@0.30.7
- @voyant-travel/react@0.30.7

## 0.30.6

### Patch Changes

- @voyant-travel/notifications@0.30.6
- @voyant-travel/react@0.30.6

## 0.30.5

### Patch Changes

- @voyant-travel/notifications@0.30.5
- @voyant-travel/react@0.30.5

## 0.30.4

### Patch Changes

- @voyant-travel/notifications@0.30.4
- @voyant-travel/react@0.30.4

## 0.30.3

### Patch Changes

- @voyant-travel/notifications@0.30.3
- @voyant-travel/react@0.30.3

## 0.30.2

### Patch Changes

- @voyant-travel/notifications@0.30.2
- @voyant-travel/react@0.30.2

## 0.30.1

### Patch Changes

- @voyant-travel/notifications@0.30.1
- @voyant-travel/react@0.30.1

## 0.30.0

### Patch Changes

- @voyant-travel/notifications@0.30.0
- @voyant-travel/react@0.30.0

## 0.29.0

### Minor Changes

- 4a6523e: Reminder sequences UI (#488).

  New `@voyant-travel/notifications-ui` package with the reminder-sequence editing surface:

  - `<StageList />` — ordered stages per rule, with reorder + delete and an embedded channel list.
  - `<StageEditorDialog />` — anchor / window / cadence (`once` | `every_n_days` | `escalating(buckets[])`) / `maxSendsInStage` / `respectQuietHours`.
  - `<StageChannelList />` + `<StageChannelEditorDialog />` — per-stage multi-channel rows (channel, template, recipient kind, optional role).
  - `<NotificationSettingsForm />` — quiet hours / blackout dates / weekend skip / recipient daily cap / suppression window.
  - `<RemindersPreviewList />` — read-only "what would fire on this date" table with reasoning per row.
  - Full en/ro i18n with `NotificationsUiMessagesProvider`.

  Hooks added to `@voyant-travel/notifications-react`:

  - `useReminderRuleStages`, `useReminderRuleStageMutation` (create, update, delete, reorder)
  - `useReminderStageChannels`, `useReminderStageChannelMutation`
  - `useNotificationSettings`, `useNotificationSettingsMutation`
  - `useRemindersPreview`

  Operator template wires up three new routes (`/notifications/reminder-rules/:id`, `/notifications/preview`, `/notifications/settings`) and the operator nav gains Preview + Settings entries.

### Patch Changes

- 4a6523e: Drop legacy single-offset reminder path; polish channel editor (#488).

  Stage channel editor:

  - Replaces the two free-text "Template id / Template slug" fields with
    a single async `<TemplatePicker>` (typeahead via `AsyncCombobox`)
    filtered by the channel selected at the top of the dialog. Picking
    a template now resolves to the template id directly — no more
    guessing slugs. Switching channel clears the picked template since
    the next list will be filtered.
  - Provider becomes a `<Select>` with **Automatic** / **Resend
    (email)** / **Twilio (SMS)** options. "Automatic" maps to `null`
    (use the deployment default for that channel).
  - Drops the freeform "Recipient role" field. Recipient resolution is
    driven by the booking's primary contact / first traveler today;
    the role tag wasn't actually consulted by the dispatcher.

  Backend cleanup (we're in beta — no users, no compat needed):

  - Drops the `relative_days_from_due_date` column from
    `notification_reminder_rules` (migration
    `0003_drop_legacy_columns.sql`).
  - Drops the `holiday_calendar` column from `notification_settings`
    (UI was already gone; the underlying public-holidays integration is
    out of scope for this iteration).
  - Removes the legacy single-offset dispatcher path entirely:
    `queueDueReminders` and `runDueReminders` now delegate straight to
    the stage-aware versions, and the four legacy helpers
    (`queueBookingPaymentScheduleReminder`,
    `queueInvoiceReminder`, `sendBookingPaymentScheduleReminder`,
    `sendInvoiceReminder`) plus the `ruleHasStages` skip check are
    deleted. Net ~500 lines removed from `service-reminders.ts`.
  - `relativeDaysFromDueDate` removed from validation, the run-summary
    schema, the notifications-react record schema, the operator
    template detail page, the legacy rule dialog, and the checkout
    service's reminder-runs join projection.
  - Legacy integration tests `reminders.test.ts` and
    `reminder-tasks.test.ts` are deleted; the stage-based
    `reminder-sequences.test.ts` covers the path that survives.

- Updated dependencies [4a6523e]
- Updated dependencies [4a6523e]
- Updated dependencies [4a6523e]
- Updated dependencies [4a6523e]
- Updated dependencies [4a6523e]
  - @voyant-travel/notifications@0.29.0
  - @voyant-travel/react@0.29.0

## 0.28.3

### Patch Changes

- @voyant-travel/notifications@0.28.3
- @voyant-travel/react@0.28.3

## 0.28.2

### Patch Changes

- @voyant-travel/notifications@0.28.2
- @voyant-travel/react@0.28.2

## 0.28.1

### Patch Changes

- @voyant-travel/notifications@0.28.1
- @voyant-travel/react@0.28.1

## 0.28.0

### Patch Changes

- @voyant-travel/notifications@0.28.0
- @voyant-travel/react@0.28.0

## 0.27.0

### Patch Changes

- @voyant-travel/notifications@0.27.0
- @voyant-travel/react@0.27.0

## 0.26.9

### Patch Changes

- @voyant-travel/notifications@0.26.9
- @voyant-travel/react@0.26.9

## 0.26.8

### Patch Changes

- @voyant-travel/notifications@0.26.8
- @voyant-travel/react@0.26.8

## 0.26.7

### Patch Changes

- @voyant-travel/notifications@0.26.7
- @voyant-travel/react@0.26.7

## 0.26.6

### Patch Changes

- @voyant-travel/notifications@0.26.6
- @voyant-travel/react@0.26.6

## 0.26.5

### Patch Changes

- @voyant-travel/notifications@0.26.5
- @voyant-travel/react@0.26.5

## 0.26.4

### Patch Changes

- @voyant-travel/notifications@0.26.4
- @voyant-travel/react@0.26.4

## 0.26.3

### Patch Changes

- @voyant-travel/notifications@0.26.3
- @voyant-travel/react@0.26.3

## 0.26.2

### Patch Changes

- @voyant-travel/notifications@0.26.2
- @voyant-travel/react@0.26.2

## 0.26.1

### Patch Changes

- @voyant-travel/notifications@0.26.1
- @voyant-travel/react@0.26.1

## 0.26.0

### Patch Changes

- @voyant-travel/notifications@0.26.0
- @voyant-travel/react@0.26.0

## 0.25.0

### Patch Changes

- @voyant-travel/notifications@0.25.0
- @voyant-travel/react@0.25.0

## 0.24.3

### Patch Changes

- @voyant-travel/notifications@0.24.3
- @voyant-travel/react@0.24.3

## 0.24.2

### Patch Changes

- @voyant-travel/notifications@0.24.2
- @voyant-travel/react@0.24.2

## 0.24.1

### Patch Changes

- @voyant-travel/notifications@0.24.1
- @voyant-travel/react@0.24.1

## 0.24.0

### Patch Changes

- @voyant-travel/notifications@0.24.0
- @voyant-travel/react@0.24.0

## 0.23.0

### Patch Changes

- @voyant-travel/notifications@0.23.0
- @voyant-travel/react@0.23.0

## 0.22.0

### Patch Changes

- @voyant-travel/notifications@0.22.0
- @voyant-travel/react@0.22.0

## 0.21.1

### Patch Changes

- @voyant-travel/notifications@0.21.1
- @voyant-travel/react@0.21.1

## 0.21.0

### Minor Changes

- 6427bad: Release the booking journey architecture train.

  This adds booking hold policy support, richer traveler and booking journey flows, operator tax policy configuration, finance billing and tax policy APIs, notification reminder target and delivery tooling, and the template/runtime wiring needed for the operator storefront checkout flow.

### Patch Changes

- Updated dependencies [6427bad]
  - @voyant-travel/notifications@0.21.0
  - @voyant-travel/react@0.21.0

## 0.20.0

### Patch Changes

- @voyant-travel/notifications@0.20.0
- @voyant-travel/react@0.20.0

## 0.19.0

### Patch Changes

- @voyant-travel/notifications@0.19.0
- @voyant-travel/react@0.19.0

## 0.18.0

### Patch Changes

- @voyant-travel/notifications@0.18.0
- @voyant-travel/react@0.18.0

## 0.17.0

### Patch Changes

- Updated dependencies [66d722d]
- Updated dependencies [66d722d]
- Updated dependencies [66d722d]
  - @voyant-travel/notifications@0.17.0
  - @voyant-travel/react@0.17.0

## 0.16.0

### Patch Changes

- @voyant-travel/notifications@0.16.0
- @voyant-travel/react@0.16.0

## 0.15.0

### Patch Changes

- @voyant-travel/notifications@0.15.0
- @voyant-travel/react@0.15.0

## 0.14.0

### Patch Changes

- Updated dependencies [93fd1a5]
  - @voyant-travel/notifications@0.14.0
  - @voyant-travel/react@0.14.0

## 0.13.0

### Patch Changes

- @voyant-travel/notifications@0.13.0
- @voyant-travel/react@0.13.0

## 0.12.0

### Patch Changes

- @voyant-travel/notifications@0.12.0
- @voyant-travel/react@0.12.0

## 0.11.0

### Patch Changes

- @voyant-travel/notifications@0.11.0
- @voyant-travel/react@0.11.0

## 0.10.0

### Patch Changes

- @voyant-travel/notifications@0.10.0
- @voyant-travel/react@0.10.0

## 0.9.0

### Patch Changes

- @voyant-travel/notifications@0.9.0
- @voyant-travel/react@0.9.0

## 0.8.0

### Patch Changes

- @voyant-travel/notifications@0.8.0
- @voyant-travel/react@0.8.0

## 0.7.0

### Patch Changes

- @voyant-travel/notifications@0.7.0
- @voyant-travel/react@0.7.0

## 0.6.9

### Patch Changes

- @voyant-travel/notifications@0.6.9
- @voyant-travel/react@0.6.9
