# @voyant-travel/admin-react

## 0.134.1

### Patch Changes

- Updated dependencies [f7adc5b]
  - @voyant-travel/admin-contracts@0.105.0

## 0.134.0

## 0.133.0

## 0.132.0

### Minor Changes

- 0f7888e: Fold `@voyant-travel/admin-client` into `@voyant-travel/admin-react`.

  The client was a single-export package whose only consumer was `admin-react`,
  which already re-exported all of it — so the split cost a package and a
  published version line without giving anyone a smaller surface to depend on.

  Its modules now live at `@voyant-travel/admin-react/client`, and the root export
  is unchanged: everything previously reachable from `@voyant-travel/admin-react`
  still is, including the `@voyant-travel/admin-contracts` surface the client
  re-exported.

  **`@voyant-travel/admin-client` will no longer be published.** Anything importing
  it should import `@voyant-travel/admin-react` (same surface) or
  `@voyant-travel/admin-react/client` for just the HTTP client and auth.

### Patch Changes

- Updated dependencies [0f7888e]
  - @voyant-travel/admin-contracts@0.104.19

## 0.131.1

### Patch Changes

- @voyant-travel/admin-client@0.131.1

## 0.131.0

### Patch Changes

- @voyant-travel/admin-client@0.131.0

## 0.130.0

### Patch Changes

- @voyant-travel/admin-client@0.130.0

## 0.129.2

### Patch Changes

- @voyant-travel/admin-client@0.129.2

## 0.129.1

### Patch Changes

- @voyant-travel/admin-client@0.129.1

## 0.129.0

### Patch Changes

- @voyant-travel/admin-client@0.129.0

## 0.128.3

### Patch Changes

- @voyant-travel/admin-client@0.128.3

## 0.128.2

### Patch Changes

- @voyant-travel/admin-client@0.128.2

## 0.128.1

### Patch Changes

- @voyant-travel/admin-client@0.128.1

## 0.128.0

### Patch Changes

- @voyant-travel/admin-client@0.128.0

## 0.127.0

### Patch Changes

- @voyant-travel/admin-client@0.127.0

## 0.126.2

### Patch Changes

- @voyant-travel/admin-client@0.126.2

## 0.126.1

### Patch Changes

- @voyant-travel/admin-client@0.126.1

## 0.126.0

### Patch Changes

- @voyant-travel/admin-client@0.126.0

## 0.125.0

### Patch Changes

- @voyant-travel/admin-client@0.125.0

## 0.124.0

### Patch Changes

- @voyant-travel/admin-client@0.124.0

## 0.123.3

### Patch Changes

- 8d62a7c: Republish every affected TypeScript package without broken declaration maps so the corrected artifact
  policy reaches npm instead of applying only to future incidental package releases.
- Updated dependencies [8d62a7c]
  - @voyant-travel/admin-client@0.123.3

## 0.123.2

### Patch Changes

- @voyant-travel/admin-client@0.123.2

## 0.123.1

### Patch Changes

- @voyant-travel/admin-client@0.123.1

## 0.123.0

### Patch Changes

- @voyant-travel/admin-client@0.123.0

## 0.122.0

### Minor Changes

- 490d132: Package reusable admin host destinations, dashboard and extension composition,
  current-user bindings, and realtime invalidation presentation.

### Patch Changes

- @voyant-travel/admin-client@0.122.0

## 0.121.0

### Patch Changes

- @voyant-travel/admin-client@0.121.0

## 0.120.0

### Patch Changes

- @voyant-travel/admin-client@0.120.0

## 0.119.0

### Patch Changes

- @voyant-travel/admin-client@0.119.0

## 0.118.0

### Minor Changes

- 8fca06e: Add `@voyant-travel/admin-react/user` — a reusable current-user context
  (`UserProvider` / `useUser`) for the managed-profile admin host (Phase 2 of
  voyant#3044).

  The provider reads the current user via React Query and takes `getCurrentUser`
  injected (typically the deployment's auth-runtime port), so it carries no
  auth-client dependency and is shared by managed and self-host admin hosts. It
  lifts the operator starter's local `UserProvider`/`useUser` into a package; the
  starter's provider becomes a thin adopter that wires its auth runtime.

### Patch Changes

- @voyant-travel/admin-client@0.118.0

## 0.117.0

### Patch Changes

- @voyant-travel/admin-client@0.117.0

## 0.116.0

### Patch Changes

- @voyant-travel/admin-client@0.116.0

## 0.115.4

### Patch Changes

- @voyant-travel/admin-client@0.115.4

## 0.115.3

### Patch Changes

- @voyant-travel/admin-client@0.115.3

## 0.115.2

### Patch Changes

- @voyant-travel/admin-client@0.115.2

## 0.115.1

### Patch Changes

- @voyant-travel/admin-client@0.115.1

## 0.115.0

### Patch Changes

- @voyant-travel/admin-client@0.115.0

## 0.114.0

### Patch Changes

- @voyant-travel/admin-client@0.114.0

## 0.113.0

### Patch Changes

- @voyant-travel/admin-client@0.113.0

## 0.112.0

### Patch Changes

- @voyant-travel/admin-client@0.112.0

## 0.111.5

### Patch Changes

- @voyant-travel/admin-client@0.111.5

## 0.111.4

### Patch Changes

- @voyant-travel/admin-client@0.111.4

## 0.111.3

### Patch Changes

- @voyant-travel/admin-client@0.111.3

## 0.111.2

### Patch Changes

- eef1a00: Republish notification and UI consumer packages so stale beta artifacts no longer reference legacy notification package specifiers.
- Updated dependencies [eef1a00]
  - @voyant-travel/admin-client@0.111.2

## 0.111.1

### Patch Changes

- @voyant-travel/admin-client@0.111.1

## 0.111.0

### Patch Changes

- @voyant-travel/admin-client@0.111.0

## 0.110.0

### Patch Changes

- @voyant-travel/admin-client@0.110.0

## 0.109.0

### Patch Changes

- @voyant-travel/admin-client@0.109.0

## 0.108.0

### Patch Changes

- @voyant-travel/admin-client@0.108.0

## 0.107.0

### Patch Changes

- @voyant-travel/admin-client@0.107.0

## 0.106.0

### Patch Changes

- @voyant-travel/admin-client@0.106.0

## 0.105.2

### Patch Changes

- @voyant-travel/admin-client@0.105.2

## 0.105.1

### Patch Changes

- @voyant-travel/admin-client@0.105.1

## 0.105.0

### Patch Changes

- @voyant-travel/admin-client@0.105.0

## 0.104.2

### Patch Changes

- @voyant-travel/admin-client@0.104.2

## 0.104.1

### Patch Changes

- @voyant-travel/admin-client@0.104.1

## 0.104.0

### Patch Changes

- @voyant-travel/admin-client@0.104.0

## 0.103.0

### Patch Changes

- @voyant-travel/admin-client@0.103.0

## 0.102.0

### Patch Changes

- @voyant-travel/admin-client@0.102.0

## 0.101.2

### Patch Changes

- @voyant-travel/admin-client@0.101.2

## 0.101.1

### Patch Changes

- @voyant-travel/admin-client@0.101.1

## 0.101.0

### Patch Changes

- Updated dependencies [8e7b56a]
  - @voyant-travel/admin-client@0.101.0

## 0.100.0

### Minor Changes

- 061bef2: Expand the Admin API SDK (#1411).

  - **admin-contracts (5.2):** add operation descriptors for CRM (people +
    organizations CRUD, plus the PII-gated person-document reveal), legal
    (contracts CRUD + issue/void, policies CRUD + cancellation evaluation), and
    products (read surface: list/get). Inputs derive from the canonical
    `@voyant-travel/crm-contracts` / `@voyant-travel/legal-contracts` route schemas; outputs
    are loose client-facing projections. Scopes follow the path+method convention
    `requireActor` enforces (GET→`:read`, POST/PATCH→`:write`, DELETE→`:delete`).
  - **admin-client:** typed `crm`, `legal`, and `products` namespaces over the new
    descriptors.
  - **admin-react (5.3):** new package — a generic React Query adapter over the
    admin client. `AdminClientProvider`/`useAdminClient`, plus descriptor-driven
    `useAdminQuery`, `useAdminMutation`, and `useCapabilities`. Works for any
    operation descriptor (current or future) rather than bespoke per-screen hooks.

### Patch Changes

- Updated dependencies [061bef2]
  - @voyant-travel/admin-client@0.100.0
