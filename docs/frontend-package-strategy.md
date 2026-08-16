# Frontend Package Strategy

> Note (2026-06): shadcn registry blocks have been retired — the registry source,
> `apps/registry`, and `registry:build` were deleted per
> `docs/architecture/packaged-admin-rfc.md` §5. Domain UI now ships through
> React runtime packages and surface packages such as `admin` / `storefront`.
> Separate `*-ui` packages are no longer a target package layer; reusable module
> components live in the corresponding `*-react` package.

Voyant separates frontend acceleration into three layers:

1. `@voyant-travel/<module>`
   Domain and runtime logic. These packages stay transport- and framework-agnostic where possible.
2. Framework-agnostic SDK packages when a cross-module public workflow needs a
   stable client facade, for example `@voyant-travel/public-api-client`.
3. `@voyant-travel/<module>-react`
   React runtime helpers and reusable module UI for a module. These packages
   provide hooks, query keys, typed clients, providers, frontend view-model
   helpers, and reusable components that are not specific to one app shell.

`admin`, `storefront`, and product-distribution packages own shell composition,
navigation, page assembly, and deployment-specific presentation.

The standard Operator product shell is versioned in
`@voyant-travel/operator-standard`; `@voyant-travel/admin-host` remains the
product-neutral workspace host. The operator starter retains only generated
graph inputs, project extension folders, and generic router/Start/style
entrypoints. Package manifests select presentation factories, and generated
artifacts connect those factories to the product shell. Standard providers,
auth and i18n adapters, public/storefront routes, API documentation, and product
presentation must not be copied into `apps/operator/src`.

## Why This Split Exists

Starter apps should not force developers to build every screen from the raw domain package surface. A developer who adds relationships, proposals, bookings, products, or finance should have a fast path:

1. install the domain module
2. install the React runtime package for that module
3. compose final pages inside `admin`, `storefront`, or the app/starter

That gives Voyant a better product shape than a monolithic starter-only UI and avoids turning every backend/domain package into a React-specific dependency.

## Naming Rules

- Domain/runtime packages keep simple names like `@voyant-travel/relationships`, `@voyant-travel/proposals`, `@voyant-travel/bookings`, `@voyant-travel/inventory`, and `@voyant-travel/operations`.
- React packages use `-react`, for example `@voyant-travel/relationships-react`.
  They own hooks, clients, providers, view-model helpers, and reusable module
  components.
- Shared physical-place UI should use `@voyant-travel/operations-react` and
  place-first names such as `PlaceCombobox` / `PlaceBadge`. `facilityId`
  remains a table-era field name where existing schemas require it.
- Do not create new `*-ui` packages. If a historical `*-ui` package exists,
  fold it into the corresponding `*-react` package as part of v1 cleanup.
- Surface packages such as `admin` and `storefront` own page assembly and should
  not be replaced by domain React packages.

## What Belongs In `-react`

- Context providers
- typed fetch clients for module-local contracts, or React Query wrappers around
  a framework-agnostic SDK when a workflow spans modules
- React Query hooks
- mutation hooks
- query key helpers
- frontend-oriented schemas and record types
- cards
- tables
- dialogs
- forms
- detail panes
- filter bars
- page sections and module-specific UI building blocks

Do not put a single app-specific screen in a module React package. Keep that in
the surface/app package until a reusable component Interface exists.

## Tailwind v4 Package Styles

Packages that render Tailwind classes from shipped component code must expose a
CSS helper at `@voyant-travel/<package>/styles.css`. Consumers should import only the
helpers for packages they install, for example:

```css
@import "@voyant-travel/ui/styles.css";
@import "@voyant-travel/admin/styles.css";
@import "@voyant-travel/bookings-react/styles.css";
```

`@voyant-travel/ui/styles.css` is the canonical base import and includes the shared
Voyant UI globals. Domain UI helpers such as
`@voyant-travel/bookings-react/styles.css` and `@voyant-travel/operations-react/styles.css`
only expose Tailwind source-detection directives for package components.

## What Does Not Belong In `-react`

- core business rules already owned by `@voyant-travel/<module>`
- deployment-specific route trees
- app shell navigation
- starter-specific theming and layout

## Client-Safe Domain Imports

Browser-facing code must not import a domain package root when that root also
exports server runtime, Hono routes, schema wiring, or deployment modules. Use a
narrow package subpath that contains only the browser-safe primitive or contract
needed by the UI. For example, payment-policy editors and storefront journey
code import `@voyant-travel/finance/payment-policy`, not
`@voyant-travel/finance`, because the finance root barrel also wires Hono route
modules.

The same rule applies to static metadata and authoring helpers. Operator link
definitions import linkables from package `linkables` subpaths, contract
template authoring imports `@voyant-travel/legal/contracts/template-authoring`,
and React packages import schemas from validation subpaths such as
`@voyant-travel/operations/validation`, `@voyant-travel/notifications/validation`,
and `@voyant-travel/commerce/markets/validation`.

When a UI needs a reusable domain primitive that only exists on a mixed root
barrel, add a dedicated subpath export for that primitive and move browser code
to the subpath. Add or update a checker when the rule is mechanical; the current
client-boundary check is `pnpm verify:client-package-boundaries`.

Small static datasets used by the public base UI package may instead be
committed as UI-private generated projections of a canonical internal source.
The projection must preserve the component-visible records and ordering and
must have a drift check in `verify:architecture`; it is not a second authored
authority or a reason to publish the source package.

## Module UI Migration

The old combined customer-and-sales surface is split before v1:

- `@voyant-travel/relationships` and `@voyant-travel/relationships-react` own people,
  organizations, activities, profile context, documents, and customer signals.
- `@voyant-travel/proposals` and `@voyant-travel/proposals-react` own pipelines, stages,
  proposals, proposal versions, and proposal lifecycle UI.

Future module candidates should add `-react` only when they justify reusable
React runtime helpers or reusable module components. Not every Module needs a
React package immediately.

Inventory is one of those justified module React packages:
`@voyant-travel/inventory-react` is the operated product authoring UI target for
Product structure, Product Versions, product-internal components, and owned
publication lifecycle. Operated-authoring surfaces should be added under
Inventory React.

Commerce follows the same v1 owner-path rule: `@voyant-travel/commerce-react` owns
the reusable Markets, Pricing, Promotions, and Sellability React/admin source
under Commerce React. The old split commercial React package names are removed
from the v1 workspace surface.
