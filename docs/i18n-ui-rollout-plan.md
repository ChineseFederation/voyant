# UI I18n Rollout Plan

Status: archived pre-v1 rollout history.

> Note (2026-06): `templates/dmc`, `apps/dev`, and the shadcn registry (`apps/registry` + `packages/ui/registry`) have since been deleted per the packaged-admin RFC (§5); path references to them below are historical.
> Separate `*-ui` packages were also folded into their corresponding `*-react`
> packages for v1. Package names such as `products-ui`, `pricing-ui`, and
> `resources-ui` below are historical rollout labels, not current public
> package guidance. Use [`frontend-package-strategy.md`](./frontend-package-strategy.md)
> for current frontend package rules.

## Goal

Move all reusable UI and registry surfaces onto a package-owned i18n seam so:

- user-facing strings are translated consistently
- locale-aware formatting is correct
- English-only apps only import English
- bilingual apps import only the locales they support
- registry copies stop drifting from package-owned copy

This plan is intentionally incremental. Each PR should leave the repo in a releasable state.

## Non-Goals

- Do not build a second i18n runtime beside `@voyant-travel/i18n`.
- Do not keep adding ad hoc `labels?: { ... }` bags for new strings.
- Do not centralize every reusable UI string under `packages/i18n/src/admin/*`.
- Do not force every app to ship every locale.

## Target Architecture

### Shared runtime

`@voyant-travel/i18n` remains the only runtime and utility module. It owns:

- `LocaleMessageDefinitions<T>`
- `LocaleMessageOverrides<T>`
- fallback and locale-resolution behavior
- provider and hook primitives
- parity-check utilities

### Package-owned seam

Each `packages/*-ui` package owns its own message contract and provider.

Canonical package shape:

```text
packages/<module>-ui/
  src/
    i18n/
      messages.ts
      en.ts
      ro.ts
      provider.tsx
      index.ts
```

Canonical exports:

- `type <Module>UiMessages`
- `type <Module>UiMessageOverrides`
- `<module>UiEn`
- `<module>UiRo`
- `<Module>UiMessagesProvider`
- `use<Module>UiMessages()`
- `use<Module>UiI18n()`
- `resolve<Module>UiMessages()`

### Per-locale imports

Packages must expose locale-specific entrypoints so English-only apps do not bundle Romanian.

Canonical `package.json` additions:

```json
{
  "exports": {
    ".": "./src/index.ts",
    "./i18n": "./src/i18n/index.ts",
    "./i18n/en": "./src/i18n/en.ts",
    "./i18n/ro": "./src/i18n/ro.ts",
    "./components/*": "./src/components/*.tsx"
  }
}
```

### Formatting

Packages must not format through host-default locale APIs like:

- `toLocaleString(undefined, ...)`
- `toLocaleDateString()`
- `toLocaleTimeString()`

Instead, package hooks should expose locale-aware helpers backed by explicit `locale`:

- `formatCurrency`
- `formatNumber`
- `formatDate`
- `formatDateTime`

### Registry ownership

`packages/ui/registry/*` does not own independent translation text.

Preferred rule:

- registry surfaces consume package-owned message contracts where a package exists

Fallback rule for domains without a matching `*-ui` package:

- registry surface owns a domain-level i18n seam inside the registry folder until a reusable package exists

## Cross-Cutting Rules

### New code rules

For `packages/*-ui/src` and `packages/ui/registry/*`:

- no new hardcoded user-facing English
- no new component-local default label dictionaries unless the copy is truly caller-owned
- no direct locale formatting without explicit locale

### Override rules

Continue using one override shape:

```ts
type LocaleMessageOverrides<T> = {
  shared?: DeepPartial<T> | null
  locales?: Partial<Record<string, DeepPartial<T>>> | null
}
```

Use package wrappers around this type, not custom per-component override formats.

### Testing rules

Each i18n-enabled package must test:

- locale fallback
- locale parity
- override merge behavior
- locale-aware formatter behavior

Do not snapshot every prose string.

## PR Sequence

## PR-1: Runtime And Tooling Foundation

### Scope

Establish the shared mechanics required by every package rollout.

### Files to add

- `packages/i18n/src/package-runtime.tsx`
- `packages/i18n/src/package-formatters.ts`
- `scripts/check-package-i18n-parity.ts`
- `scripts/check-ui-hardcoded-strings.ts`

### Files to change

- `packages/i18n/src/index.ts`
- `scripts/check-i18n-parity.ts`
- `docs/i18n.md`
- root `package.json`

### Deliverables

- package-facing helper utilities built on top of the current runtime
- generalized parity checker that can validate package-owned definitions
- CI script for suspicious hardcoded UI strings
- docs updated to state that reusable UI defaults live in the owning package

### Notes

Do not migrate any package in this PR.

## PR-2: `cruises-ui` Pilot

### Scope

Make `cruises-ui` the reference implementation.

### Files to add

- `packages/cruises-react/src/i18n/messages.ts`
- `packages/cruises-react/src/i18n/en.ts`
- `packages/cruises-react/src/i18n/ro.ts`
- `packages/cruises-react/src/i18n/provider.tsx`
- `packages/cruises-react/src/i18n/index.ts`
- `packages/cruises-react/src/i18n.test.tsx`

### Files to change

- `packages/cruises-react/package.json`
- `packages/cruises-react/src/index.ts`
- `packages/cruises-react/src/components/enrichment-program-list.tsx`
- `packages/cruises-react/src/components/external-badge.tsx`
- `packages/cruises-react/src/components/pricing-grid.tsx`
- `packages/cruises-react/src/components/quote-display.tsx`

### Deliverables

- all current `cruises-ui` literals moved to the package message contract
- explicit `en` and `ro`
- locale-aware money and date formatting
- per-locale exports
- parity and fallback tests

### Acceptance criteria

- no embedded English remains in `packages/cruises-react/src/components/*` except API-provided content
- English-only apps can import `@voyant-travel/cruises-react/i18n/en` without importing `ro`

## PR-3: `packages/ui/registry/cruises` Alignment

### Scope

Stop registry cruises from owning divergent copy.

### Files to change

- `packages/ui/registry/cruises/cruise-card.tsx`
- `packages/ui/registry/cruises/cruise-list.tsx`
- `packages/ui/registry/cruises/enrichment-program-list.tsx`
- `packages/ui/registry/cruises/external-badge.tsx`
- `packages/ui/registry/cruises/pricing-grid.tsx`
- `packages/ui/registry/cruises/quote-display.tsx`
- any local registry wrapper files required for provider wiring

### Deliverables

- registry cruises reuse the same message contract and formatting rules as `cruises-ui`

## PR-4: `charters-ui` And Registry Charters

### Scope

Validate the same pattern on a second domain with money, status, and provenance copy.

### Files to add

- `packages/charters-react/src/i18n/messages.ts`
- `packages/charters-react/src/i18n/en.ts`
- `packages/charters-react/src/i18n/ro.ts`
- `packages/charters-react/src/i18n/provider.tsx`
- `packages/charters-react/src/i18n/index.ts`
- `packages/charters-react/src/i18n.test.tsx`

### Files to change

- `packages/charters-react/package.json`
- `packages/charters-react/src/index.ts`
- `packages/charters-react/src/components/*`
- `packages/ui/registry/charters/*`

### Deliverables

- reusable external badge, APA, and quote-like display strings all localized through one seam

## PR-5: `bookings-ui`

### Scope

Migrate the highest-leverage booking flow components first.

### Files to add

- `packages/bookings-react/src/i18n/messages.ts`
- `packages/bookings-react/src/i18n/en.ts`
- `packages/bookings-react/src/i18n/ro.ts`
- `packages/bookings-react/src/i18n/provider.tsx`
- `packages/bookings-react/src/i18n/index.ts`
- `packages/bookings-react/src/i18n.test.tsx`

### Files to change

- `packages/bookings-react/package.json`
- `packages/bookings-react/src/index.ts`
- `packages/bookings-react/src/components/passengers-section.tsx`
- `packages/bookings-react/src/components/payment-schedule-section.tsx`
- `packages/bookings-react/src/components/person-picker-section.tsx`
- `packages/bookings-react/src/components/price-breakdown-section.tsx`
- `packages/bookings-react/src/components/product-picker-section.tsx`
- `packages/bookings-react/src/components/rooms-stepper-section.tsx`
- `packages/bookings-react/src/components/shared-room-section.tsx`
- remaining user-facing components in the package

### Deliverables

- remove the current pattern of package-local `DEFAULT_LABELS`
- replace it with one package-owned message contract

## PR-6: `products-ui`

### Scope

Convert the large operator-facing product CRUD surface.

### Files to add

- `packages/products-react/src/i18n/messages.ts`
- `packages/products-react/src/i18n/en.ts`
- `packages/products-react/src/i18n/ro.ts`
- `packages/products-react/src/i18n/provider.tsx`
- `packages/products-react/src/i18n/index.ts`
- `packages/products-react/src/i18n.test.tsx`

### Files to change

- `packages/products-react/package.json`
- `packages/products-react/src/index.ts`
- all dialog, form, section, and list components with embedded copy

### Deliverables

- all create/edit/delete/status text removed from components

## PR-7: `pricing-ui`

### Scope

Convert rules, categories, schedules, policy, and combobox surfaces.

### Files to add

- `packages/pricing-react/src/i18n/messages.ts`
- `packages/pricing-react/src/i18n/en.ts`
- `packages/pricing-react/src/i18n/ro.ts`
- `packages/pricing-react/src/i18n/provider.tsx`
- `packages/pricing-react/src/i18n/index.ts`
- `packages/pricing-react/src/i18n.test.tsx`

### Files to change

- `packages/pricing-react/package.json`
- `packages/pricing-react/src/index.ts`
- all dialogs, pages, lists, and comboboxes with embedded copy

### Deliverables

- localized empty states, dialog titles, button labels, and policy/rule wording

## Removed: legacy hotel-operations UI

Status: removed by the accommodation resale boundary work. Do not reintroduce
the old hotel-operations UI as an i18n rollout slice. Accommodation resale UI
should move through catalog, storefront, products, bookings, or a narrowly
named accommodation resale surface. See
[`architecture/accommodation-resale-boundary.md`](./architecture/accommodation-resale-boundary.md).

Former scope: room inventory, maintenance, rate-plan admin, housekeeping, and
other hotel-operations surfaces. These are no longer part of the active
first-party UI registry.

## PR-9: `resources-ui`

### Scope

Convert dashboard, tables, filters, and status wording.

### Files to add

- `packages/resources-react/src/i18n/messages.ts`
- `packages/resources-react/src/i18n/en.ts`
- `packages/resources-react/src/i18n/ro.ts`
- `packages/resources-react/src/i18n/provider.tsx`
- `packages/resources-react/src/i18n/index.ts`
- `packages/resources-react/src/i18n.test.tsx`

### Files to change

- `packages/resources-react/package.json`
- `packages/resources-react/src/index.ts`
- `packages/resources-react/src/components/resources-overview.tsx`
- `packages/resources-react/src/components/resources-tabs-primary.tsx`
- `packages/resources-react/src/components/resources-tabs-secondary.tsx`
- remaining resource components

## PR-10: Remaining `*-ui` Packages

### Packages in this wave

- `booking-requirements-ui`
- `crm-ui`
- `distribution-ui`
- `external-refs-ui`
- `extras-ui`
- `finance-ui`
- `identity-ui`
- `legal-ui`
- `markets-ui`
- `sellability-ui`
- `suppliers-ui`

### Per-package file additions

For each package in this wave add:

- `src/i18n/messages.ts`
- `src/i18n/en.ts`
- `src/i18n/ro.ts`
- `src/i18n/provider.tsx`
- `src/i18n/index.ts`
- `src/i18n.test.tsx`

### Per-package file changes

For each package in this wave change:

- `package.json`
- `src/index.ts`
- all user-facing components with embedded copy or host-default formatting

### Suggested batching

Split this wave into 2-3 PRs by related domains rather than one giant PR:

- PR-10A: `booking-requirements-ui`, `identity-ui`, `crm-ui`, `external-refs-ui`
- PR-10B: `legal-ui`, `finance-ui`, `markets-ui`, `distribution-ui`
- PR-10C: `extras-ui`, `sellability-ui`, `suppliers-ui`

## PR-11: Registry Rollout

### Scope

Bring all registry domains into alignment with package-owned i18n seams.

### Registry folders

- `packages/ui/registry/booking-requirements`
- `packages/ui/registry/bookings`
- `packages/ui/registry/charters`
- `packages/ui/registry/crm`
- `packages/ui/registry/cruises`
- `packages/ui/registry/distribution`
- `packages/ui/registry/external-refs`
- `packages/ui/registry/extras`
- `packages/ui/registry/finance`
- `packages/ui/registry/ground`
- `packages/ui/registry/identity`
- `packages/ui/registry/legal`
- `packages/ui/registry/markets`
- `packages/ui/registry/notifications`
- `packages/ui/registry/pricing`
- `packages/ui/registry/products`
- `packages/ui/registry/resources`
- `packages/ui/registry/sellability`
- `packages/ui/registry/suppliers`
- `packages/ui/registry/transactions`

### Ownership rule

- if a matching `*-ui` package exists, the registry must consume that package seam
- if no matching package exists, the registry owns a temporary domain seam and should be tracked for extraction later

### Deliverables

- no registry folder owns silently divergent copy from a reusable package

## PR-12: App Composition And Template Adoption

### Scope

Make the operator and DMC apps import only the locales they support.

### Files likely to change

- `packages/i18n/src/admin/app-operator.ts`
- `packages/i18n/src/admin/app-dmc.ts`
- `apps/operator/src/lib/admin-i18n.ts`
- `apps/operator/src/lib/admin-i18n.tsx`
- `templates/dmc/src/lib/admin-i18n.ts`
- `templates/dmc/src/lib/admin-i18n.tsx`
- any app-side locale bootstrap modules

### Deliverables

- English-only apps import English only
- bilingual apps import English and Romanian only
- app bundles compose package-owned message definitions instead of owning their own copies where reusable UI is involved

## Package Ownership Matrix

### Packages with a matching registry domain

- `booking-requirements-ui` owns `packages/ui/registry/booking-requirements`
- `bookings-ui` owns `packages/ui/registry/bookings`
- `charters-ui` owns `packages/ui/registry/charters`
- `crm-ui` owns `packages/ui/registry/crm`
- `cruises-ui` owns `packages/ui/registry/cruises`
- `distribution-ui` owns `packages/ui/registry/distribution`
- `external-refs-ui` owns `packages/ui/registry/external-refs`
- `extras-ui` owns `packages/ui/registry/extras`
- `finance-ui` owns `packages/ui/registry/finance`
- `identity-ui` owns `packages/ui/registry/identity`
- `legal-ui` owns `packages/ui/registry/legal`
- `markets-ui` owns `packages/ui/registry/markets`
- `pricing-ui` owns `packages/ui/registry/pricing`
- `products-ui` owns `packages/ui/registry/products`
- `resources-ui` owns `packages/ui/registry/resources`
- `sellability-ui` owns `packages/ui/registry/sellability`
- `suppliers-ui` owns `packages/ui/registry/suppliers`

### Registry-only domains to track separately

- `auth`
- `ground`
- `notifications`
- `transactions`
- `ui`

These should either:

- gain their own reusable package later, or
- own a temporary registry-local i18n seam with the same runtime rules

## Required CI Gates

Add or enforce the following commands in CI:

- admin parity check
- package parity check
- hardcoded UI string scan
- package typecheck
- targeted tests for changed package i18n seams

Suggested command set:

```sh
pnpm i18n:check
pnpm i18n:check:packages
pnpm i18n:check:ui-literals
```

## Review Checklist Per PR

- package exposes per-locale entrypoints
- no user-facing English literals remain in touched components
- no host-default locale formatting remains in touched components
- `en` and `ro` shapes match
- fallback behavior is tested
- registry copy is aligned if applicable
- app imports only required locales

## Recommended Execution Order

1. PR-1 runtime and tooling
2. PR-2 `cruises-ui`
3. PR-3 registry cruises
4. PR-4 `charters-ui`
5. PR-5 `bookings-ui`
6. PR-6 `products-ui`
7. PR-7 `pricing-ui`
8. Removed legacy hotel-operations UI
9. PR-9 `resources-ui`
10. PR-10 remaining `*-ui` packages
11. PR-11 registry rollout
12. PR-12 app composition and template adoption

## Exit Criteria

The rollout is complete when:

- every `packages/*-ui` package has a package-owned i18n seam
- every registry domain either reuses a package seam or has a tracked temporary seam
- no user-facing reusable UI strings are hardcoded in English
- all money, number, date, and date-time formatting is locale-aware
- English-only apps do not import Romanian
- bilingual apps import only the locales they support
- CI blocks regressions
