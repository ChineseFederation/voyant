# Voyant Admin Architecture

This guide defines how Voyant should treat the admin surface as a shared runtime
and extension boundary.

The goal is simple:

- keep the admin shell and runtime shared
- make extension points explicit instead of ad hoc
- keep UI blocks, runtime hooks, and admin extensions as separate layers
- support admin localization without confusing it for business-content
  translation

The admin should be a first-class framework surface, not just starter-local UI.

## Core Rules

### 1. Keep the admin shell and runtime shared

Voyant should keep a shared admin runtime layer for:

- shared providers
- auth-aware admin context
- locale/timezone runtime
- base layout primitives and shared admin concerns

That shared layer should live in the common admin/runtime packages rather than
being reimplemented in each template.

Rule:

The admin runtime should be framework-owned even when the final shell/layout is
starter-owned.

### 2. Keep the final admin shell starter-owned

Starters should still own:

- the final admin shell composition
- overall layout decisions
- product-specific navigation defaults
- app-owned route composition

This keeps Voyant flexible without making the admin surface unstructured.

Rule:

Voyant should own the shared admin runtime and extension seams, while templates
own the final shell and composition.

### 3. Bootstrap first-party admin shells from one authenticated contract

Voyant-owned templates and apps are single-tenant per deployment. The base
authenticated admin shell must render once the current user/session is ready.
Better Auth organization state, workspace switching, active organization
selection, and team-management bootstrap are optional app-owned feature paths,
not shell prerequisites.

The standard shell reads `GET /auth/shell-bootstrap`. Version 1 contains the
current user, active module ids, feature entitlements, effective navigation
preferences, lightweight extension descriptors, and an explicit compatibility
descriptor. The response is authenticated and carries `Cache-Control: private,
no-store` plus `Vary: Cookie, Authorization`; neither a CDN nor a shared browser
cache may reuse one member's snapshot for another request.

The auth runtime owns authentication and the stable envelope. A managed host
supplies live, request-scoped additions through `resolveShellBootstrap`, which
receives the already authenticated user. This is the tenant-isolation boundary:
the resolver must use its deployment context and that user id, never a tenant or
member id supplied by the browser. A self-hosted host may omit the resolver and
still serves the same contract with empty entitlement, preference, and dynamic
extension snapshots.

The route guard writes shell-critical snapshots into React Query before child
loaders render. This prevents the sidebar and extension seams from immediately
re-fetching the same data and lets TanStack's existing router dehydrate/hydrate
path carry it across SSR. Full organization, billing, and extension manifests
remain deferred until after the shell is interactive. Entitlement query state
is focus/event invalidated and has no polling interval.

Rule:

`/auth/shell-bootstrap` is the first-party shell bootstrap boundary. Do not make
`/auth/workspace/*` or `/auth/organization/*` shell prerequisites, and do not
put secrets or full extension manifests in the bootstrap response.

For Voyant Cloud-provisioned deployments, `/auth/me` is still backed by a local
Better Auth session. The browser reaches that local session through the
Voyant Cloud broker flow, but the admin shell should not need to know WorkOS or
platform organization ids. Cloud mode changes the sign-in path, not the
provider-neutral current-user contract consumed by the admin runtime.

## Extension Surface

### 4. Make admin extension points explicit

The admin should expose stable extension points such as:

- admin UI routes
- navigation contributions
- widget or injection slots
- detail-panel or summary-card contributions where appropriate

These should be treated as first-class extension seams, not as informal app
patch points.

Rule:

Admin customization should happen through explicit extension points before full
route/shell override.

### 5. Admin UI routes are part of the extension model

Modules, extensions, or app-owned code may need dedicated admin pages.

Those should plug into the admin surface as a recognized route class rather than
feeling like unrelated starter-local pages.

Rule:

Admin pages contributed by packages should be treated as a supported extension
surface.

### Setup guidance composes from the selected admin graph

Packages may contribute setup steps through `AdminExtension.setupSteps`. Step
IDs, ordering, completion predicates, prefill interpretation, and actions stay
package-owned. The admin host composes only selected extensions and delegates
organization-level setup persistence to one selected `setupFlow` contribution.
Each contributing package also declares the stable step ID and `skippable`
policy in `admin.setupSteps`. Selected graph metadata is the server-side
authority for persistence, so clients cannot admit steps or relax required-step
policy.

The setup shell may persist setup lifecycle state, but it must use existing
package surfaces for domain changes. Fresh-instance inference may seed the
persisted state once; it must not remain the source of truth or gate access to
the rest of the admin.

Rule:

Setup is selected-graph guidance, not a central package catalog or a boot gate.

### 6. Navigation contributions should stay narrow and predictable

The admin should allow packages to contribute navigation entries without
turning navigation into an opaque runtime registry.

Navigation contributions should stay:

- typed
- explicit
- predictable in placement and labeling

Rule:

Navigation contribution is an admin extension seam, not a generic dynamic menu
system.

### 7. Widgets and injection zones should be selective

Not every admin screen should be endlessly injectable.

Voyant should expose widget/injection zones only where extensibility is
genuinely useful, such as:

- booking detail side panels
- finance summary cards
- legal/document action areas
- product detail operational add-ons

Rule:

Admin widget slots should be intentional and few, not everywhere by default.

### Route-only extensions may opt into a lazy implementation boundary

The resolved graph is the shell's lightweight descriptor authority. An admin
facet may declare `loading: "lazy-routes"` only when it contributes routes or
settings pages and no shell-critical navigation, setup steps, slots, or widget
contributions. The generated admin bundle then emits route metadata plus a
dynamic factory loader instead of a static implementation import.

The route remains known to TanStack Router, so direct navigation and intent
preloading work. Its loader checks the active-module snapshot from the
authenticated shell bootstrap before importing the implementation. Disabled
modules fail before code download, while import and implementation failures use
the route's bounded loading/error boundary. The dynamic import is cached after
the first successful resolution.

This is an explicit graph policy, not a heuristic. A package that owns setup,
widgets, runtime navigation, or slots stays eager until those contributions have
their own complete lightweight descriptors. Moving such a package behind the
route-only boundary would silently remove shell behavior and is rejected by the
artifact generator.

Rule:

Use `admin.loading: "lazy-routes"` only for descriptor-complete route/settings
extensions. Never infer laziness from a filename or package category.

## UI Layering

### 8. Keep runtime hooks and source-installed UI blocks separate

Voyant already has complementary frontend layers:

- shared React/runtime packages
- source-installed UI blocks and registry components
- admin extension points

These are not competing ideas.

The layering should be:

- admin extension surface decides where UI may attach
- shared runtime packages provide hooks/providers and admin context
- source-installed UI blocks provide editable presentation building blocks

Rule:

Do not replace source-installed UI blocks with the admin extension surface, and
do not use blocks as a substitute for explicit admin extension points.

### 9. Preserve the source-installed UI strategy

Voyant should keep:

- `@voyant-travel/*-react`
- `@voyant-travel/admin`
- the registry/source-installed UI approach

That strategy gives teams editable UI while the framework still owns the runtime
and extension contracts.

Rule:

Editable UI blocks are part of the frontend strategy and should remain
complementary to admin extension points.

## Localization

### 10. Separate admin UI locale from business-content locale

Admin UI language is not the same thing as product or content translation.

Examples:

- admin labels, actions, and navigation are UI locale concerns
- product titles, descriptions, and contract copy are business-content concerns

A Romanian customer may want the admin UI in Romanian while still managing
English or German travel content.

Rule:

Admin UI localization and business-content localization must stay separate.

### 11. Use a clear admin locale resolution order

The admin locale should resolve through a simple preference hierarchy:

1. explicit user override
2. app or deployment default admin locale
3. browser language on first sign-in
4. fallback to `en`

This keeps the model simple while supporting mixed-language teams.

Rule:

Admin locale resolution should prefer user choice first, then app/deployment
default, then browser-derived bootstrap, then English fallback.

### 12. Locale formatting should include timezone-aware presentation

Admin locale/runtime should drive:

- text translations
- date formatting
- time formatting
- number and currency formatting

Timezone should remain user-driven where appropriate.

Rule:

Admin localization should include formatting/runtime concerns, not just string
translation.

## Practical Checklist

When adding or reviewing an admin capability in Voyant:

1. Decide whether it belongs in the shared admin runtime or the starter-owned
   shell.
2. Use the versioned authenticated shell bootstrap as the base shell dependency.
3. Keep workspace/organization/team-management bootstrap behind explicit
   app-owned routes.
4. Prefer explicit admin UI routes, nav contributions, or widget slots over
   shell patching.
5. Keep the extension point narrow and typed.
6. Use shared runtime hooks/providers instead of duplicating admin context.
7. Keep source-installed UI blocks as the editable presentation layer.
8. Treat admin UI locale separately from business-content translation.
9. Resolve admin locale through user override, app/deployment default, browser
   bootstrap, then English fallback.

## Non-Goals

This guide does not introduce:

- a fully closed admin product
- a giant plugin runtime for admin UI
- a replacement for the source-installed UI strategy

The point is a clear shared admin runtime and extension surface, not a more
rigid dashboard framework.
