# @voyant-travel/media-react

## 0.8.0

### Patch Changes

- @voyant-travel/media@0.6.4
- @voyant-travel/admin@0.132.0

## 0.7.2

### Patch Changes

- Updated dependencies [7496159]
  - @voyant-travel/i18n@0.119.0
  - @voyant-travel/media@0.6.1
  - @voyant-travel/types@0.109.10
  - @voyant-travel/admin@0.131.1

## 0.7.1

### Patch Changes

- Updated dependencies [9c2bb8c]
  - @voyant-travel/media@0.6.0

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

## 0.5.0

### Minor Changes

- 9e57a5d: Add localized alt text, canonical delivery URLs, and an optional authenticated
  site/CMS bridge to the shared media library.

### Patch Changes

- Updated dependencies [9e57a5d]
  - @voyant-travel/media@0.5.0

## 0.4.1

### Patch Changes

- e2cb9f5: Fix double page padding. The admin shell already applies consistent page
  padding around the content area, but a number of page and loading-skeleton
  components still added their own `p-6` on top, pushing their content ~24px
  further in than the page header and leaving pages inconsistently indented.
  Those redundant root paddings are removed so every page's content lines up with
  the header and with each other. Dialog, portal, and card paddings are
  unchanged.
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
- e2cb9f5: Replace native browser dialogs with styled UI-package dialogs across the admin
  surface. Adds `confirmDialog`/`ConfirmDialogHost` and `promptDialog`/
  `PromptDialogHost` to `@voyant-travel/ui`, mounts both hosts once in the
  operator admin shell, and migrates every `window.confirm`/`window.prompt` call
  and stray `window.alert` in the `*-react` packages to the styled equivalents
  (destructive confirmations rendered with the destructive action variant). Also
  fixes the event-catalog "selected event contracts" count to use ICU plural
  formatting.
- e2cb9f5: Visual polish pass. Remove duplicated empty-state text in the media library and
  the product media section (the same message no longer appears twice), and clean
  up remaining "CRM" jargon the plain-language pass missed in the person/company
  create dialogs, flight contact picker, and booking traveler picker (now
  "contacts"/"contact" instead of "CRM").
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

## 0.4.0

### Patch Changes

- Updated dependencies [90d44c0]
  - @voyant-travel/admin@0.129.0
  - @voyant-travel/i18n@0.117.0

## 0.3.3

### Patch Changes

- d8afba4: Media picker polish: widen the picker dialog (`sm:max-w-5xl`, 4-column grid on
  large screens) so more assets are visible at once, and render a muted image icon
  when a thumbnail fails to load (missing bytes, an undecodable file, or a
  security-downgraded content type such as inline SVG) instead of the browser's
  broken-image glyph.

  The `sm:max-w-5xl` matches the base dialog's `sm:` max-width variant so
  tailwind-merge replaces it (a base-variant class like `max-w-3xl` would not).

## 0.3.2

### Patch Changes

- ff02608: Media library polish:

  - Rename the admin route from `/media-library` to `/media` (nav + default host base path).
  - Move folder creation from an inline sidebar form into a dialog.
  - Give uploaded objects a file extension in their storage key so the byte-serving route (which sends `X-Content-Type-Options: nosniff`) infers the correct `Content-Type` — raster images and PDFs now render instead of downloading as `application/octet-stream`.

- Updated dependencies [ff02608]
  - @voyant-travel/media@0.4.1

## 0.3.1

### Patch Changes

- 4b225b1: Polish the media library layout. Add standard page padding (`p-6`) to the
  browse surface so it no longer sits flush against the shell edges, and move the
  asset detail/edit form out of a permanent inline right column into a right-side
  sheet that opens when an asset is selected and closes back to the grid. This
  reclaims the horizontal space the empty "Select an asset" column wasted and
  gives the edit form more room.

## 0.3.0

### Minor Changes

- f0f51b4: Add the Media library admin navigation surface. The media deployment manifest
  now declares an `admin` block with a runtime factory, route, and navigation
  entry, and `@voyant-travel/media-react/admin` exposes
  `createSelectedMediaAdminExtension`, which contributes a "Media library"
  navigation item plus a route that renders the `<MediaLibrary>` browse surface.
  The operator navigation catalogue gains the `mediaLibrary` label in English and
  Romanian.

### Patch Changes

- Updated dependencies [f0f51b4]
  - @voyant-travel/media@0.4.0
  - @voyant-travel/i18n@0.116.0
  - @voyant-travel/admin@0.128.3

## 0.2.1

### Patch Changes

- 05aa1d5: Exclude test files from the build so `dist` no longer emits `*.test.*` outputs.
- Updated dependencies [05aa1d5]
- Updated dependencies [05aa1d5]
- Updated dependencies [05aa1d5]
  - @voyant-travel/media@0.3.0

## 0.2.0

### Minor Changes

- 3bac6e6: Add `@voyant-travel/media-react` — the React client for the consolidated media
  library. The package ships a zod fetch client and TanStack Query hooks over the
  media library API (`/v1/admin/media-library/*`, served by
  `@voyant-travel/media`), reusing that package's request/validation schemas.

  It provides two browse surfaces:

  - `<MediaLibrary>` — the full admin browse experience: folder rail, filters
    (type, tag, format, name search), an upload dropzone that writes into the
    library, a grid/list toggle, and a detail panel for renaming, editing alt
    text and tags, folder membership, and a "where used" view. Deleting an asset
    that is still in use surfaces the service's guard clearly.
  - `<MediaPicker>` — a host-agnostic single/multi-select picker other surfaces
    can embed, with a type filter, search, inline upload that lands in the library
    and auto-selects, and an `onSelect(assets)` callback.

  Hooks: `useMediaAssets`, `useMediaAsset`, `useAssetUpload`, `useUpdateAsset`,
  `useDeleteAsset`, `useFolders`, `useFolderMutation`, and `useAssetUsage`, plus
  an English/Romanian message catalog. This is a standalone package; wiring the
  routes into the operator and embedding the picker into product media are
  follow-up slices.
