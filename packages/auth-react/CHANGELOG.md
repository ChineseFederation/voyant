# @voyant-travel/auth-react

## 0.150.1

### Patch Changes

- bdc0443: Add admin channel binding and publication management UI.

## 0.150.0

### Patch Changes

- Updated dependencies [bf71bca]
  - @voyant-travel/admin@0.134.0
  - @voyant-travel/auth@0.150.0

## 0.149.0

### Patch Changes

- Updated dependencies [0c30250]
- Updated dependencies [5fa76aa]
  - @voyant-travel/auth@0.149.0
  - @voyant-travel/admin@0.133.0

## 0.148.0

### Patch Changes

- @voyant-travel/auth@0.148.0
- @voyant-travel/admin@0.132.0

## 0.147.1

## 0.147.0

### Minor Changes

- 90361d6: Ship the MCP connector consent screen in every admin auth mode.

  `/mcp-consent` was contributed as part of the local-auth presentation, alongside
  `sign-in`, `sign-up`, and the password-reset pages. A deployment running
  `VOYANT_ADMIN_AUTH_MODE=voyant-cloud` deliberately does not select that
  contribution, so it shipped no consent page: an MCP connector registered and
  authorized successfully, then landed on a 404 at the last step before the grant.

  That was a miscategorisation. The consent screen is not a local-auth page — it
  is an OAuth authorization decision point, and the authorization server issuing
  connector grants is local to the deployment in every auth mode, which is why
  `/auth/oauth2/consent` and `/auth/oauth2/get-client` are already reachable in
  cloud mode.

  The screen now has its own presentation, `@voyant-travel/mcp#presentation.consent`,
  declared by the MCP module and mounted from a new
  `@voyant-travel/auth-react/mcp-consent-routes` export. It ships whenever the MCP
  transport ships, and a broker-authenticated Operator gets it without also
  getting a local sign-in and sign-up page. `createLocalAuthRouteContribution` no
  longer returns an `mcpConsent` route, and the generated route host moved from
  `(auth)/mcp-consent.tsx` to `(mcp)/mcp-consent.tsx`; the public path
  `/mcp-consent` is unchanged.

### Patch Changes

- @voyant-travel/auth@0.147.0

## 0.146.2

## 0.146.1

### Patch Changes

- @voyant-travel/auth@0.146.1

## 0.146.0

### Minor Changes

- 7496159: Add an OAuth 2.1 authorization server so chat assistants can connect to the deployment's MCP endpoint by URL alone.

  Claude and ChatGPT add remote MCP servers by pasting a URL — there is nowhere to supply an API token — so they follow the MCP authorization spec instead: dynamic client registration (RFC 7591), authorization code + PKCE, and a browser consent step. This adds that server on the admin realm via `@better-auth/oauth-provider`, with `oauth_client` / `oauth_access_token` / `oauth_refresh_token` / `oauth_consent` / `jwks` tables.

  The grant is coarse (`mcp:read`, optionally `mcp:write`) because a consent screen cannot ask a travel agent about fifty resource scopes. Effective permissions are re-derived per request from the approving staff member's current role, intersected with the actions their owning packages mark remote-safe and non-sensitive — so a connector never exceeds the person who approved it, and narrowing someone's role immediately narrows every connector they approved.

  Access tokens are signed JWTs verified against the published JWKS. Because a JWT cannot be withdrawn once signed, the resource server also re-checks the connector's consent row on every request, so disconnecting a connector takes effect on its next call rather than whenever its token happens to expire.

  Discovery documents are served at the origin root, with authorization-server endpoints rewritten onto the public API base — the Hono app strips that prefix before the auth handler sees a request, so the URLs Better Auth advertises would otherwise point at the admin SPA instead of the authorization server.

### Patch Changes

- Updated dependencies [6d0b4b4]
- Updated dependencies [7496159]
- Updated dependencies [7496159]
  - @voyant-travel/auth@0.146.0
  - @voyant-travel/i18n@0.119.0
  - @voyant-travel/types@0.109.10
  - @voyant-travel/admin@0.131.1

## 0.145.0

### Patch Changes

- Updated dependencies [bf20d76]
  - @voyant-travel/ui@0.110.0
  - @voyant-travel/admin@0.131.0
  - @voyant-travel/auth@0.145.0

## 0.144.0

### Patch Changes

- Updated dependencies [1873611]
  - @voyant-travel/admin@0.130.0
  - @voyant-travel/i18n@0.118.0
  - @voyant-travel/auth@0.144.0

## 0.143.9

### Patch Changes

- Updated dependencies [5541809]
  - @voyant-travel/auth@0.143.9

## 0.143.8

### Patch Changes

- Updated dependencies [36db91f]
  - @voyant-travel/auth@0.143.8

## 0.143.7

### Patch Changes

- Updated dependencies [cb7221d]
  - @voyant-travel/auth@0.143.7

## 0.143.6

### Patch Changes

- @voyant-travel/auth@0.143.6

## 0.143.5

### Patch Changes

- Updated dependencies [a02a76b]
  - @voyant-travel/auth@0.143.5

## 0.143.4

### Patch Changes

- @voyant-travel/auth@0.143.4
- @voyant-travel/ui@0.109.6

## 0.143.3

### Patch Changes

- @voyant-travel/auth@0.143.3

## 0.143.2

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
  - @voyant-travel/auth@0.143.2

## 0.143.1

### Patch Changes

- @voyant-travel/auth@0.143.1

## 0.143.0

### Patch Changes

- Updated dependencies [58020ec]
  - @voyant-travel/auth@0.143.0

## 0.142.1

### Patch Changes

- Updated dependencies [84dd9cb]
  - @voyant-travel/auth@0.142.1

## 0.142.0

### Patch Changes

- Updated dependencies [90d44c0]
  - @voyant-travel/admin@0.129.0
  - @voyant-travel/i18n@0.117.0
  - @voyant-travel/auth@0.142.0

## 0.141.5

### Patch Changes

- @voyant-travel/auth@0.141.5

## 0.141.4

### Patch Changes

- @voyant-travel/auth@0.141.4
- @voyant-travel/types@0.109.9

## 0.141.3

### Patch Changes

- @voyant-travel/auth@0.141.3
- @voyant-travel/ui@0.109.4

## 0.141.2

### Patch Changes

- Updated dependencies [f0f51b4]
  - @voyant-travel/i18n@0.116.0
  - @voyant-travel/admin@0.128.3
  - @voyant-travel/auth@0.141.2

## 0.141.1

### Patch Changes

- @voyant-travel/auth@0.141.1

## 0.141.0

### Patch Changes

- Updated dependencies [f0a0e09]
  - @voyant-travel/auth@0.141.0

## 0.140.3

### Patch Changes

- Updated dependencies [7cbfa51]
  - @voyant-travel/auth@0.140.3

## 0.140.2

### Patch Changes

- Updated dependencies [c2ca4a3]
  - @voyant-travel/i18n@0.115.0
  - @voyant-travel/admin@0.128.2
  - @voyant-travel/auth@0.140.2

## 0.140.1

### Patch Changes

- Updated dependencies [ecf1680]
  - @voyant-travel/i18n@0.114.0
  - @voyant-travel/admin@0.128.1
  - @voyant-travel/auth@0.140.1

## 0.140.0

### Minor Changes

- 4f34425: Add the operator Storefronts admin surface on top of the storefront runtime port.

  The Auth package gains an operator-scoped storefront admin API (CRUD, allowed
  origins, reveal-once key issue/rotate/revoke, account policy + auth methods, and
  provider credential management), wired into the selected admin graph. Auth React
  gains the "Storefronts" admin surface (list, per-storefront detail, keys with
  show-once reveal, customer account settings, and provider credentials), with the
  former top-level "Sites" surface reparented as a sub-view. Business buyer-account
  controls are gated on the runtime capability derived from whether customer
  business-account onboarding is wired.

### Patch Changes

- Updated dependencies [4f34425]
  - @voyant-travel/auth@0.140.0

## 0.139.0

### Patch Changes

- Updated dependencies [2bcafc9]
  - @voyant-travel/admin@0.128.0
  - @voyant-travel/i18n@0.113.0
  - @voyant-travel/auth@0.139.0

## 0.138.0

### Patch Changes

- Updated dependencies [43e7754]
  - @voyant-travel/auth@0.138.0
  - @voyant-travel/types@0.109.8

## 0.137.0

### Minor Changes

- abc32b6: Add customer business-account onboarding contracts, durable request workflows,
  deployment-composed runtime wiring, staff-guarded administration, Better Auth
  organization invitation acceptance, the framework-neutral storefront client,
  React provider operations, and the capability-gated operator page.

### Patch Changes

- Updated dependencies [abc32b6]
  - @voyant-travel/auth@0.137.0
  - @voyant-travel/types@0.109.7

## 0.136.0

### Patch Changes

- Updated dependencies [a160a81]
  - @voyant-travel/auth@0.136.0
  - @voyant-travel/types@0.109.6

## 0.135.1

### Patch Changes

- @voyant-travel/auth@0.135.1

## 0.135.0

### Patch Changes

- Updated dependencies [16e2c2c]
  - @voyant-travel/auth@0.135.0

## 0.134.0

### Patch Changes

- Updated dependencies [f6f22e7]
  - @voyant-travel/auth@0.134.0
  - @voyant-travel/ui@0.109.3

## 0.133.5

### Patch Changes

- Updated dependencies [1881293]
  - @voyant-travel/auth@0.133.5

## 0.133.4

### Patch Changes

- @voyant-travel/auth@0.133.4

## 0.133.3

### Patch Changes

- Updated dependencies [117fa05]
  - @voyant-travel/i18n@0.112.1
  - @voyant-travel/auth@0.133.3

## 0.133.2

### Patch Changes

- 07334a7: Split operator and storefront authentication into isolated Better Auth realms,
  add provider-neutral identity adapters, and support managed WorkOS-backed admin
  sessions alongside merchant-configurable customer email and social login.
- Updated dependencies [07334a7]
  - @voyant-travel/auth@0.133.2

## 0.133.1

### Patch Changes

- @voyant-travel/auth@0.133.1

## 0.133.0

### Patch Changes

- Updated dependencies [a461920]
- Updated dependencies [a461920]
  - @voyant-travel/admin@0.127.0
  - @voyant-travel/auth@0.133.0

## 0.132.5

### Patch Changes

- Updated dependencies [0868f18]
- Updated dependencies [3062a73]
  - @voyant-travel/admin@0.126.2
  - @voyant-travel/i18n@0.112.0
  - @voyant-travel/auth@0.132.5

## 0.132.4

### Patch Changes

- Updated dependencies [2c863ab]
  - @voyant-travel/auth@0.132.4
  - @voyant-travel/types@0.109.3

## 0.132.3

### Patch Changes

- @voyant-travel/auth@0.132.3

## 0.132.2

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
  - @voyant-travel/auth@0.132.2

## 0.132.1

### Patch Changes

- @voyant-travel/auth@0.132.1

## 0.132.0

### Patch Changes

- Updated dependencies [c1e37f2]
  - @voyant-travel/admin@0.126.0
  - @voyant-travel/auth@0.132.0

## 0.131.0

### Patch Changes

- Updated dependencies [848b581]
  - @voyant-travel/auth@0.131.0

## 0.130.0

### Minor Changes

- 82ffd12: Add persisted organization-level first-run setup guidance composed from the
  selected admin graph. Standard Operator deployments now collect package-owned
  business profile, storefront, market, fiscal, navigation, team, and first-product
  steps while keeping domain mutations in their existing package surfaces.
- 6147b93: Add a package-owned `/settings/team` surface backed by a graph-selected,
  provider-neutral team-management runtime port. Better Auth and Voyant Cloud now
  adapt roster, invitation, role, deactivation, capability, and nullable activity
  data behind the same server-enforced contract. Move the team route, page, copy,
  and icon from the admin shell into Auth and Auth React.

### Patch Changes

- Updated dependencies [766d24b]
- Updated dependencies [7e9f77a]
- Updated dependencies [82ffd12]
- Updated dependencies [a98ec27]
- Updated dependencies [6147b93]
- Updated dependencies [b459761]
  - @voyant-travel/ui@0.109.2
  - @voyant-travel/admin@0.125.0
  - @voyant-travel/auth@0.130.0

## 0.129.0

### Minor Changes

- 73ab096: Standardize first-party packages on package-owned deployment manifests, provider selection,
  access metadata, concrete event contracts, selected admin navigation, and published runtime
  references. Add Bookings Extras as an independently selected graph unit and remove the central
  admin navigation catalog.
  Link facets now distinguish entity `linkable` metadata from executable `definition` exports, and
  generated Node registries reject malformed definitions before service registration.
  Provider-owned required config and secrets now apply only when that provider is selected, so
  local and in-memory deployments do not require credentials for inactive remote providers.

### Patch Changes

- Updated dependencies [73ab096]
  - @voyant-travel/admin@0.124.0
  - @voyant-travel/auth@0.129.0
  - @voyant-travel/types@0.109.2

## 0.128.3

### Patch Changes

- 8d62a7c: Republish every affected TypeScript package without broken declaration maps so the corrected artifact
  policy reaches npm instead of applying only to future incidental package releases.
- Updated dependencies [8d62a7c]
- Updated dependencies [8d62a7c]
  - @voyant-travel/auth@0.128.3
  - @voyant-travel/types@0.109.1
  - @voyant-travel/admin@0.123.3
  - @voyant-travel/i18n@0.111.1
  - @voyant-travel/react@0.104.2
  - @voyant-travel/ui@0.109.1

## 0.128.2

### Patch Changes

- Updated dependencies [bbe6396]
  - @voyant-travel/i18n@0.111.0
  - @voyant-travel/admin@0.123.2
  - @voyant-travel/auth@0.128.2

## 0.128.1

### Patch Changes

- @voyant-travel/auth@0.128.1

## 0.128.0

### Patch Changes

- Updated dependencies [4bc540f]
  - @voyant-travel/auth@0.128.0

## 0.127.0

### Patch Changes

- Updated dependencies [4d0eeed]
- Updated dependencies [8bd906f]
- Updated dependencies [d4fa159]
  - @voyant-travel/types@0.109.0
  - @voyant-travel/ui@0.109.0
  - @voyant-travel/auth@0.127.0
  - @voyant-travel/admin@0.123.0

## 0.126.0

### Minor Changes

- 490d132: Own the local admin auth route contribution, page orchestration, and bootstrap policy in the package so generic generated route hosts only bind the selected contribution.

### Patch Changes

- 490d132: Own invitation redemption presentation and local authentication bootstrap policy in the auth React package.
- 490d132: Make package and project declarations the sole selected access authority, removing legacy catalog overlays and runtime synthesis.
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
  - @voyant-travel/auth@0.126.0
  - @voyant-travel/admin@0.122.0
  - @voyant-travel/types@0.108.1

## 0.125.0

### Minor Changes

- d771be3: Compile selected graph access catalogs, make Bookings the first package-owned access authority, and
  wire exact-pair catalog validation through runtime authorization and permission editors.

### Patch Changes

- Updated dependencies [d771be3]
- Updated dependencies [d771be3]
  - @voyant-travel/types@0.108.0
  - @voyant-travel/auth@0.125.0
  - @voyant-travel/admin@0.121.0

## 0.124.2

### Patch Changes

- @voyant-travel/auth@0.124.2
- @voyant-travel/types@0.107.3

## 0.124.1

### Patch Changes

- @voyant-travel/auth@0.124.1
- @voyant-travel/types@0.107.2

## 0.124.0

### Patch Changes

- Updated dependencies [a97e845]
  - @voyant-travel/admin@0.120.0
  - @voyant-travel/auth@0.124.0

## 0.123.0

### Patch Changes

- Updated dependencies [8a665f3]
  - @voyant-travel/admin@0.119.0
  - @voyant-travel/auth@0.123.0

## 0.122.0

### Patch Changes

- @voyant-travel/admin@0.118.0
- @voyant-travel/auth@0.122.0

## 0.121.0

### Patch Changes

- Updated dependencies [ecdf0fc]
  - @voyant-travel/admin@0.117.0
  - @voyant-travel/auth@0.121.0

## 0.120.2

### Patch Changes

- @voyant-travel/auth@0.120.2
- @voyant-travel/ui@0.108.11
- @voyant-travel/types@0.107.1

## 0.120.1

### Patch Changes

- Updated dependencies [c2a0daf]
  - @voyant-travel/auth@0.120.1

## 0.120.0

### Patch Changes

- Updated dependencies [62e87ee]
  - @voyant-travel/admin@0.116.0
  - @voyant-travel/i18n@0.110.0
  - @voyant-travel/auth@0.120.0

## 0.119.1

### Patch Changes

- Updated dependencies [56dfb00]
  - @voyant-travel/auth@0.119.1

## 0.119.0

### Patch Changes

- Updated dependencies [c9a356f]
  - @voyant-travel/types@0.107.0
  - @voyant-travel/auth@0.119.0
  - @voyant-travel/admin@0.115.4

## 0.118.2

### Patch Changes

- Updated dependencies [5ffd426]
  - @voyant-travel/auth@0.118.2

## 0.118.1

### Patch Changes

- Updated dependencies [7cb6fa7]
  - @voyant-travel/i18n@0.109.0
  - @voyant-travel/admin@0.115.2
  - @voyant-travel/ui@0.108.2
  - @voyant-travel/auth@0.118.1

## 0.118.0

### Patch Changes

- Updated dependencies [51f7dea]
  - @voyant-travel/types@0.106.0
  - @voyant-travel/admin@0.115.1
  - @voyant-travel/auth@0.118.0

## 0.117.0

### Patch Changes

- Updated dependencies [4abf9a2]
  - @voyant-travel/types@0.105.0
  - @voyant-travel/auth@0.117.0
  - @voyant-travel/admin@0.115.0
  - @voyant-travel/i18n@0.108.0
  - @voyant-travel/ui@0.108.1

## 0.116.1

### Patch Changes

- Updated dependencies [b6fa89d]
  - @voyant-travel/auth@0.116.1

## 0.116.0

### Patch Changes

- Updated dependencies [a74471e]
- Updated dependencies [a74471e]
  - @voyant-travel/i18n@0.107.0
  - @voyant-travel/ui@0.108.0
  - @voyant-travel/admin@0.114.0
  - @voyant-travel/auth@0.116.0

## 0.115.0

### Patch Changes

- Updated dependencies [4f92198]
  - @voyant-travel/ui@0.107.0
  - @voyant-travel/admin@0.113.0
  - @voyant-travel/auth@0.115.0

## 0.114.0

### Patch Changes

- Updated dependencies [94890c3]
- Updated dependencies [cb9b04b]
  - @voyant-travel/admin@0.112.0
  - @voyant-travel/auth@0.114.0

## 0.113.5

### Patch Changes

- eef1a00: Republish notification and UI consumer packages so stale beta artifacts no longer reference legacy notification package specifiers.
- Updated dependencies [eef1a00]
  - @voyant-travel/admin@0.111.2
  - @voyant-travel/auth@0.113.5

## 0.113.4

### Patch Changes

- Updated dependencies [28898ad]
  - @voyant-travel/auth@0.113.4
  - @voyant-travel/ui@0.106.2

## 0.113.3

### Patch Changes

- @voyant-travel/auth@0.113.3
- @voyant-travel/types@0.104.5

## 0.113.2

### Patch Changes

- @voyant-travel/auth@0.113.2
- @voyant-travel/ui@0.106.1

## 0.113.1

### Patch Changes

- @voyant-travel/auth@0.113.1
- @voyant-travel/types@0.104.4

## 0.113.0

### Patch Changes

- Updated dependencies [7255353]
  - @voyant-travel/auth@0.113.0
  - @voyant-travel/types@0.104.3

## 0.112.1

### Patch Changes

- @voyant-travel/auth@0.112.1
- @voyant-travel/types@0.104.2

## 0.112.0

### Patch Changes

- Updated dependencies [41b08db]
  - @voyant-travel/admin@0.111.0
  - @voyant-travel/auth@0.112.0

## 0.111.0

### Patch Changes

- Updated dependencies [9c909e2]
  - @voyant-travel/admin@0.110.0
  - @voyant-travel/auth@0.111.0

## 0.110.0

### Patch Changes

- Updated dependencies [faec538]
  - @voyant-travel/admin@0.109.0
  - @voyant-travel/auth@0.110.0

## 0.109.0

### Patch Changes

- Updated dependencies [478aa7c]
  - @voyant-travel/admin@0.108.0
  - @voyant-travel/auth@0.109.0

## 0.108.0

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
  - @voyant-travel/auth@0.108.0

## 0.107.0

### Patch Changes

- @voyant-travel/auth@0.107.0

## 0.106.0

### Patch Changes

- @voyant-travel/auth@0.106.0

## 0.105.0

### Patch Changes

- @voyant-travel/auth@0.105.0

## 0.104.1

### Patch Changes

- @voyant-travel/auth@0.104.1
- @voyant-travel/react@0.104.1
- @voyant-travel/types@0.104.1

## 0.104.0

### Patch Changes

- @voyant-travel/auth@0.104.0
- @voyant-travel/react@0.104.0
- @voyant-travel/types@0.104.0

## 0.103.0

### Patch Changes

- @voyant-travel/auth@0.103.0
- @voyant-travel/react@0.103.0
- @voyant-travel/types@0.103.0

## 0.102.0

### Patch Changes

- @voyant-travel/auth@0.102.0
- @voyant-travel/react@0.102.0
- @voyant-travel/types@0.102.0

## 0.101.2

### Patch Changes

- @voyant-travel/auth@0.101.2
- @voyant-travel/react@0.101.2
- @voyant-travel/types@0.101.2

## 0.101.1

### Patch Changes

- @voyant-travel/auth@0.101.1
- @voyant-travel/react@0.101.1
- @voyant-travel/types@0.101.1

## 0.101.0

### Patch Changes

- @voyant-travel/auth@0.101.0
- @voyant-travel/react@0.101.0
- @voyant-travel/types@0.101.0

## 0.100.0

### Patch Changes

- @voyant-travel/auth@0.100.0
- @voyant-travel/react@0.100.0
- @voyant-travel/types@0.100.0

## 0.99.0

### Patch Changes

- @voyant-travel/auth@0.99.0
- @voyant-travel/react@0.99.0
- @voyant-travel/types@0.99.0

## 0.98.0

### Patch Changes

- @voyant-travel/auth@0.98.0
- @voyant-travel/react@0.98.0
- @voyant-travel/types@0.98.0

## 0.97.0

### Patch Changes

- @voyant-travel/auth@0.97.0
- @voyant-travel/react@0.97.0
- @voyant-travel/types@0.97.0

## 0.96.0

### Patch Changes

- @voyant-travel/auth@0.96.0
- @voyant-travel/react@0.96.0
- @voyant-travel/types@0.96.0

## 0.95.0

### Patch Changes

- @voyant-travel/auth@0.95.0
- @voyant-travel/react@0.95.0
- @voyant-travel/types@0.95.0

## 0.94.0

### Patch Changes

- @voyant-travel/auth@0.94.0
- @voyant-travel/react@0.94.0
- @voyant-travel/types@0.94.0

## 0.93.0

### Patch Changes

- @voyant-travel/auth@0.93.0
- @voyant-travel/react@0.93.0
- @voyant-travel/types@0.93.0

## 0.92.0

### Patch Changes

- @voyant-travel/auth@0.92.0
- @voyant-travel/react@0.92.0
- @voyant-travel/types@0.92.0

## 0.91.0

### Patch Changes

- @voyant-travel/auth@0.91.0
- @voyant-travel/react@0.91.0
- @voyant-travel/types@0.91.0

## 0.90.0

### Patch Changes

- @voyant-travel/auth@0.90.0
- @voyant-travel/react@0.90.0
- @voyant-travel/types@0.90.0

## 0.89.0

### Patch Changes

- @voyant-travel/auth@0.89.0
- @voyant-travel/react@0.89.0
- @voyant-travel/types@0.89.0

## 0.88.0

### Patch Changes

- @voyant-travel/auth@0.88.0
- @voyant-travel/react@0.88.0
- @voyant-travel/types@0.88.0

## 0.87.1

### Patch Changes

- @voyant-travel/auth@0.87.1
- @voyant-travel/react@0.87.1
- @voyant-travel/types@0.87.1

## 0.87.0

### Patch Changes

- @voyant-travel/auth@0.87.0
- @voyant-travel/react@0.87.0
- @voyant-travel/types@0.87.0

## 0.86.0

### Patch Changes

- @voyant-travel/auth@0.86.0
- @voyant-travel/react@0.86.0
- @voyant-travel/types@0.86.0

## 0.85.4

### Patch Changes

- @voyant-travel/auth@0.85.4
- @voyant-travel/react@0.85.4
- @voyant-travel/types@0.85.4

## 0.85.3

### Patch Changes

- @voyant-travel/auth@0.85.3
- @voyant-travel/react@0.85.3
- @voyant-travel/types@0.85.3

## 0.85.2

### Patch Changes

- @voyant-travel/auth@0.85.2
- @voyant-travel/react@0.85.2
- @voyant-travel/types@0.85.2

## 0.85.1

### Patch Changes

- @voyant-travel/auth@0.85.1
- @voyant-travel/react@0.85.1
- @voyant-travel/types@0.85.1

## 0.85.0

### Patch Changes

- @voyant-travel/auth@0.85.0
- @voyant-travel/react@0.85.0
- @voyant-travel/types@0.85.0

## 0.84.4

### Patch Changes

- @voyant-travel/auth@0.84.4
- @voyant-travel/react@0.84.4
- @voyant-travel/types@0.84.4

## 0.84.3

### Patch Changes

- @voyant-travel/auth@0.84.3
- @voyant-travel/react@0.84.3
- @voyant-travel/types@0.84.3

## 0.84.2

### Patch Changes

- @voyant-travel/auth@0.84.2
- @voyant-travel/react@0.84.2
- @voyant-travel/types@0.84.2

## 0.84.1

### Patch Changes

- @voyant-travel/auth@0.84.1
- @voyant-travel/react@0.84.1
- @voyant-travel/types@0.84.1

## 0.84.0

### Patch Changes

- @voyant-travel/auth@0.84.0
- @voyant-travel/react@0.84.0
- @voyant-travel/types@0.84.0

## 0.83.1

### Patch Changes

- @voyant-travel/auth@0.83.1
- @voyant-travel/react@0.83.1
- @voyant-travel/types@0.83.1

## 0.83.0

### Patch Changes

- @voyant-travel/auth@0.83.0
- @voyant-travel/react@0.83.0
- @voyant-travel/types@0.83.0

## 0.82.1

### Patch Changes

- Updated dependencies [728bc12]
  - @voyant-travel/auth@0.82.1
  - @voyant-travel/react@0.82.1
  - @voyant-travel/types@0.82.1

## 0.82.0

### Patch Changes

- @voyant-travel/auth@0.82.0
- @voyant-travel/react@0.82.0
- @voyant-travel/types@0.82.0

## 0.81.21

### Patch Changes

- @voyant-travel/auth@0.81.21
- @voyant-travel/react@0.81.21
- @voyant-travel/types@0.81.21

## 0.81.20

### Patch Changes

- @voyant-travel/auth@0.81.20
- @voyant-travel/react@0.81.20
- @voyant-travel/types@0.81.20

## 0.81.19

### Patch Changes

- @voyant-travel/auth@0.81.19
- @voyant-travel/react@0.81.19
- @voyant-travel/types@0.81.19

## 0.81.18

### Patch Changes

- @voyant-travel/auth@0.81.18
- @voyant-travel/react@0.81.18
- @voyant-travel/types@0.81.18

## 0.81.17

### Patch Changes

- @voyant-travel/auth@0.81.17
- @voyant-travel/react@0.81.17
- @voyant-travel/types@0.81.17

## 0.81.16

### Patch Changes

- @voyant-travel/auth@0.81.16
- @voyant-travel/react@0.81.16
- @voyant-travel/types@0.81.16

## 0.81.15

### Patch Changes

- @voyant-travel/auth@0.81.15
- @voyant-travel/react@0.81.15
- @voyant-travel/types@0.81.15

## 0.81.14

### Patch Changes

- @voyant-travel/auth@0.81.14
- @voyant-travel/react@0.81.14
- @voyant-travel/types@0.81.14

## 0.81.13

### Patch Changes

- @voyant-travel/auth@0.81.13
- @voyant-travel/react@0.81.13
- @voyant-travel/types@0.81.13

## 0.81.12

### Patch Changes

- Updated dependencies [308bad0]
  - @voyant-travel/auth@0.81.12
  - @voyant-travel/react@0.81.12
  - @voyant-travel/types@0.81.12

## 0.81.11

### Patch Changes

- @voyant-travel/auth@0.81.11
- @voyant-travel/react@0.81.11
- @voyant-travel/types@0.81.11

## 0.81.10

### Patch Changes

- @voyant-travel/auth@0.81.10
- @voyant-travel/react@0.81.10
- @voyant-travel/types@0.81.10

## 0.81.9

### Patch Changes

- @voyant-travel/auth@0.81.9
- @voyant-travel/react@0.81.9
- @voyant-travel/types@0.81.9

## 0.81.8

### Patch Changes

- @voyant-travel/auth@0.81.8
- @voyant-travel/react@0.81.8
- @voyant-travel/types@0.81.8

## 0.81.7

### Patch Changes

- @voyant-travel/auth@0.81.7
- @voyant-travel/react@0.81.7
- @voyant-travel/types@0.81.7

## 0.81.6

### Patch Changes

- @voyant-travel/auth@0.81.6
- @voyant-travel/react@0.81.6
- @voyant-travel/types@0.81.6

## 0.81.5

### Patch Changes

- @voyant-travel/auth@0.81.5
- @voyant-travel/react@0.81.5
- @voyant-travel/types@0.81.5

## 0.81.4

### Patch Changes

- @voyant-travel/auth@0.81.4
- @voyant-travel/react@0.81.4
- @voyant-travel/types@0.81.4

## 0.81.3

### Patch Changes

- @voyant-travel/auth@0.81.3
- @voyant-travel/react@0.81.3
- @voyant-travel/types@0.81.3

## 0.81.2

### Patch Changes

- @voyant-travel/auth@0.81.2
- @voyant-travel/react@0.81.2
- @voyant-travel/types@0.81.2

## 0.81.1

### Patch Changes

- @voyant-travel/auth@0.81.1
- @voyant-travel/react@0.81.1
- @voyant-travel/types@0.81.1

## 0.81.0

### Patch Changes

- @voyant-travel/auth@0.81.0
- @voyant-travel/react@0.81.0
- @voyant-travel/types@0.81.0

## 0.80.18

### Patch Changes

- @voyant-travel/auth@0.80.18
- @voyant-travel/react@0.80.18
- @voyant-travel/types@0.80.18

## 0.80.17

### Patch Changes

- @voyant-travel/auth@0.80.17
- @voyant-travel/react@0.80.17
- @voyant-travel/types@0.80.17

## 0.80.16

### Patch Changes

- @voyant-travel/auth@0.80.16
- @voyant-travel/react@0.80.16
- @voyant-travel/types@0.80.16

## 0.80.15

### Patch Changes

- @voyant-travel/auth@0.80.15
- @voyant-travel/react@0.80.15
- @voyant-travel/types@0.80.15

## 0.80.14

### Patch Changes

- @voyant-travel/auth@0.80.14
- @voyant-travel/react@0.80.14
- @voyant-travel/types@0.80.14

## 0.80.13

### Patch Changes

- @voyant-travel/auth@0.80.13
- @voyant-travel/react@0.80.13
- @voyant-travel/types@0.80.13

## 0.80.12

### Patch Changes

- @voyant-travel/auth@0.80.12
- @voyant-travel/react@0.80.12
- @voyant-travel/types@0.80.12

## 0.80.11

### Patch Changes

- @voyant-travel/auth@0.80.11
- @voyant-travel/react@0.80.11
- @voyant-travel/types@0.80.11

## 0.80.10

### Patch Changes

- @voyant-travel/auth@0.80.10
- @voyant-travel/react@0.80.10
- @voyant-travel/types@0.80.10

## 0.80.9

### Patch Changes

- @voyant-travel/auth@0.80.9
- @voyant-travel/react@0.80.9
- @voyant-travel/types@0.80.9

## 0.80.8

### Patch Changes

- @voyant-travel/auth@0.80.8
- @voyant-travel/react@0.80.8
- @voyant-travel/types@0.80.8

## 0.80.7

### Patch Changes

- @voyant-travel/auth@0.80.7
- @voyant-travel/react@0.80.7
- @voyant-travel/types@0.80.7

## 0.80.6

### Patch Changes

- @voyant-travel/auth@0.80.6
- @voyant-travel/react@0.80.6
- @voyant-travel/types@0.80.6

## 0.80.5

### Patch Changes

- @voyant-travel/auth@0.80.5
- @voyant-travel/react@0.80.5
- @voyant-travel/types@0.80.5

## 0.80.4

### Patch Changes

- @voyant-travel/auth@0.80.4
- @voyant-travel/react@0.80.4
- @voyant-travel/types@0.80.4

## 0.80.3

### Patch Changes

- @voyant-travel/auth@0.80.3
- @voyant-travel/react@0.80.3
- @voyant-travel/types@0.80.3

## 0.80.2

### Patch Changes

- @voyant-travel/auth@0.80.2
- @voyant-travel/react@0.80.2
- @voyant-travel/types@0.80.2

## 0.80.1

### Patch Changes

- @voyant-travel/auth@0.80.1
- @voyant-travel/react@0.80.1
- @voyant-travel/types@0.80.1

## 0.80.0

### Patch Changes

- @voyant-travel/auth@0.80.0
- @voyant-travel/react@0.80.0
- @voyant-travel/types@0.80.0

## 0.79.0

### Patch Changes

- @voyant-travel/auth@0.79.0
- @voyant-travel/react@0.79.0
- @voyant-travel/types@0.79.0

## 0.78.0

### Patch Changes

- @voyant-travel/auth@0.78.0
- @voyant-travel/react@0.78.0
- @voyant-travel/types@0.78.0

## 0.77.13

### Patch Changes

- @voyant-travel/auth@0.77.13
- @voyant-travel/react@0.77.13
- @voyant-travel/types@0.77.13

## 0.77.12

### Patch Changes

- @voyant-travel/auth@0.77.12
- @voyant-travel/react@0.77.12
- @voyant-travel/types@0.77.12

## 0.77.11

### Patch Changes

- @voyant-travel/auth@0.77.11
- @voyant-travel/react@0.77.11
- @voyant-travel/types@0.77.11

## 0.77.10

### Patch Changes

- @voyant-travel/auth@0.77.10
- @voyant-travel/react@0.77.10
- @voyant-travel/types@0.77.10

## 0.77.9

### Patch Changes

- @voyant-travel/auth@0.77.9
- @voyant-travel/react@0.77.9
- @voyant-travel/types@0.77.9

## 0.77.8

### Patch Changes

- @voyant-travel/auth@0.77.8
- @voyant-travel/react@0.77.8
- @voyant-travel/types@0.77.8

## 0.77.7

### Patch Changes

- @voyant-travel/auth@0.77.7
- @voyant-travel/react@0.77.7
- @voyant-travel/types@0.77.7

## 0.77.6

### Patch Changes

- @voyant-travel/auth@0.77.6
- @voyant-travel/react@0.77.6
- @voyant-travel/types@0.77.6

## 0.77.5

### Patch Changes

- @voyant-travel/auth@0.77.5
- @voyant-travel/react@0.77.5
- @voyant-travel/types@0.77.5

## 0.77.4

### Patch Changes

- @voyant-travel/auth@0.77.4
- @voyant-travel/react@0.77.4
- @voyant-travel/types@0.77.4

## 0.77.3

### Patch Changes

- @voyant-travel/auth@0.77.3
- @voyant-travel/react@0.77.3
- @voyant-travel/types@0.77.3

## 0.77.2

### Patch Changes

- @voyant-travel/auth@0.77.2
- @voyant-travel/react@0.77.2
- @voyant-travel/types@0.77.2

## 0.77.1

### Patch Changes

- @voyant-travel/auth@0.77.1
- @voyant-travel/react@0.77.1
- @voyant-travel/types@0.77.1

## 0.77.0

### Patch Changes

- @voyant-travel/auth@0.77.0
- @voyant-travel/react@0.77.0
- @voyant-travel/types@0.77.0

## 0.76.0

### Patch Changes

- @voyant-travel/auth@0.76.0
- @voyant-travel/react@0.76.0
- @voyant-travel/types@0.76.0

## 0.75.7

### Patch Changes

- @voyant-travel/auth@0.75.7
- @voyant-travel/react@0.75.7
- @voyant-travel/types@0.75.7

## 0.75.6

### Patch Changes

- @voyant-travel/auth@0.75.6
- @voyant-travel/react@0.75.6
- @voyant-travel/types@0.75.6

## 0.75.5

### Patch Changes

- @voyant-travel/auth@0.75.5
- @voyant-travel/react@0.75.5
- @voyant-travel/types@0.75.5

## 0.75.4

### Patch Changes

- @voyant-travel/auth@0.75.4
- @voyant-travel/react@0.75.4
- @voyant-travel/types@0.75.4

## 0.75.3

### Patch Changes

- @voyant-travel/auth@0.75.3
- @voyant-travel/react@0.75.3
- @voyant-travel/types@0.75.3

## 0.75.2

### Patch Changes

- @voyant-travel/auth@0.75.2
- @voyant-travel/react@0.75.2
- @voyant-travel/types@0.75.2

## 0.75.1

### Patch Changes

- @voyant-travel/auth@0.75.1
- @voyant-travel/react@0.75.1
- @voyant-travel/types@0.75.1

## 0.75.0

### Patch Changes

- @voyant-travel/auth@0.75.0
- @voyant-travel/react@0.75.0
- @voyant-travel/types@0.75.0

## 0.74.2

### Patch Changes

- @voyant-travel/auth@0.74.2
- @voyant-travel/react@0.74.2
- @voyant-travel/types@0.74.2

## 0.74.1

### Patch Changes

- @voyant-travel/auth@0.74.1
- @voyant-travel/react@0.74.1
- @voyant-travel/types@0.74.1

## 0.74.0

### Patch Changes

- @voyant-travel/auth@0.74.0
- @voyant-travel/react@0.74.0
- @voyant-travel/types@0.74.0

## 0.73.1

### Patch Changes

- @voyant-travel/auth@0.73.1
- @voyant-travel/react@0.73.1
- @voyant-travel/types@0.73.1

## 0.73.0

### Patch Changes

- @voyant-travel/auth@0.73.0
- @voyant-travel/react@0.73.0
- @voyant-travel/types@0.73.0

## 0.72.0

### Patch Changes

- @voyant-travel/auth@0.72.0
- @voyant-travel/react@0.72.0
- @voyant-travel/types@0.72.0

## 0.71.0

### Patch Changes

- @voyant-travel/auth@0.71.0
- @voyant-travel/react@0.71.0
- @voyant-travel/types@0.71.0

## 0.70.0

### Patch Changes

- @voyant-travel/auth@0.70.0
- @voyant-travel/react@0.70.0
- @voyant-travel/types@0.70.0

## 0.69.1

### Patch Changes

- @voyant-travel/auth@0.69.1
- @voyant-travel/react@0.69.1
- @voyant-travel/types@0.69.1

## 0.69.0

### Patch Changes

- @voyant-travel/auth@0.69.0
- @voyant-travel/react@0.69.0
- @voyant-travel/types@0.69.0

## 0.68.0

### Patch Changes

- @voyant-travel/auth@0.68.0
- @voyant-travel/react@0.68.0
- @voyant-travel/types@0.68.0

## 0.67.0

### Patch Changes

- @voyant-travel/auth@0.67.0
- @voyant-travel/react@0.67.0
- @voyant-travel/types@0.67.0

## 0.66.6

### Patch Changes

- @voyant-travel/auth@0.66.6
- @voyant-travel/react@0.66.6
- @voyant-travel/types@0.66.6

## 0.66.5

### Patch Changes

- @voyant-travel/auth@0.66.5
- @voyant-travel/react@0.66.5
- @voyant-travel/types@0.66.5

## 0.66.4

### Patch Changes

- @voyant-travel/auth@0.66.4
- @voyant-travel/react@0.66.4
- @voyant-travel/types@0.66.4

## 0.66.3

### Patch Changes

- @voyant-travel/auth@0.66.3
- @voyant-travel/react@0.66.3
- @voyant-travel/types@0.66.3

## 0.66.2

### Patch Changes

- @voyant-travel/auth@0.66.2
- @voyant-travel/react@0.66.2
- @voyant-travel/types@0.66.2

## 0.66.1

### Patch Changes

- @voyant-travel/auth@0.66.1
- @voyant-travel/react@0.66.1
- @voyant-travel/types@0.66.1

## 0.66.0

### Patch Changes

- @voyant-travel/auth@0.66.0
- @voyant-travel/react@0.66.0
- @voyant-travel/types@0.66.0

## 0.65.0

### Patch Changes

- @voyant-travel/auth@0.65.0
- @voyant-travel/react@0.65.0
- @voyant-travel/types@0.65.0

## 0.64.1

### Patch Changes

- @voyant-travel/auth@0.64.1
- @voyant-travel/react@0.64.1
- @voyant-travel/types@0.64.1

## 0.64.0

### Patch Changes

- @voyant-travel/auth@0.64.0
- @voyant-travel/react@0.64.0
- @voyant-travel/types@0.64.0

## 0.63.1

### Patch Changes

- @voyant-travel/auth@0.63.1
- @voyant-travel/react@0.63.1
- @voyant-travel/types@0.63.1

## 0.63.0

### Patch Changes

- @voyant-travel/auth@0.63.0
- @voyant-travel/react@0.63.0
- @voyant-travel/types@0.63.0

## 0.62.3

### Patch Changes

- @voyant-travel/auth@0.62.3
- @voyant-travel/react@0.62.3
- @voyant-travel/types@0.62.3

## 0.62.2

### Patch Changes

- @voyant-travel/auth@0.62.2
- @voyant-travel/react@0.62.2
- @voyant-travel/types@0.62.2

## 0.62.1

### Patch Changes

- @voyant-travel/auth@0.62.1
- @voyant-travel/react@0.62.1
- @voyant-travel/types@0.62.1

## 0.62.0

### Patch Changes

- @voyant-travel/auth@0.62.0
- @voyant-travel/react@0.62.0
- @voyant-travel/types@0.62.0

## 0.61.0

### Patch Changes

- @voyant-travel/auth@0.61.0
- @voyant-travel/react@0.61.0
- @voyant-travel/types@0.61.0

## 0.60.0

### Patch Changes

- @voyant-travel/auth@0.60.0
- @voyant-travel/react@0.60.0
- @voyant-travel/types@0.60.0

## 0.59.0

### Patch Changes

- @voyant-travel/auth@0.59.0
- @voyant-travel/react@0.59.0
- @voyant-travel/types@0.59.0

## 0.58.0

### Patch Changes

- @voyant-travel/auth@0.58.0
- @voyant-travel/react@0.58.0
- @voyant-travel/types@0.58.0

## 0.57.0

### Patch Changes

- @voyant-travel/auth@0.57.0
- @voyant-travel/react@0.57.0
- @voyant-travel/types@0.57.0

## 0.56.0

### Patch Changes

- @voyant-travel/auth@0.56.0
- @voyant-travel/react@0.56.0
- @voyant-travel/types@0.56.0

## 0.55.1

### Patch Changes

- @voyant-travel/auth@0.55.1
- @voyant-travel/react@0.55.1
- @voyant-travel/types@0.55.1

## 0.55.0

### Patch Changes

- @voyant-travel/auth@0.55.0
- @voyant-travel/react@0.55.0
- @voyant-travel/types@0.55.0

## 0.54.0

### Patch Changes

- @voyant-travel/auth@0.54.0
- @voyant-travel/react@0.54.0
- @voyant-travel/types@0.54.0

## 0.53.2

### Patch Changes

- @voyant-travel/auth@0.53.2
- @voyant-travel/react@0.53.2
- @voyant-travel/types@0.53.2

## 0.53.1

### Patch Changes

- @voyant-travel/auth@0.53.1
- @voyant-travel/react@0.53.1
- @voyant-travel/types@0.53.1

## 0.53.0

### Patch Changes

- @voyant-travel/auth@0.53.0
- @voyant-travel/react@0.53.0
- @voyant-travel/types@0.53.0

## 0.52.4

### Patch Changes

- @voyant-travel/auth@0.52.4
- @voyant-travel/react@0.52.4
- @voyant-travel/types@0.52.4

## 0.52.3

### Patch Changes

- @voyant-travel/auth@0.52.3
- @voyant-travel/react@0.52.3
- @voyant-travel/types@0.52.3

## 0.52.2

### Patch Changes

- @voyant-travel/auth@0.52.2
- @voyant-travel/react@0.52.2
- @voyant-travel/types@0.52.2

## 0.52.1

### Patch Changes

- @voyant-travel/auth@0.52.1
- @voyant-travel/react@0.52.1
- @voyant-travel/types@0.52.1

## 0.52.0

### Patch Changes

- Updated dependencies [1468e12]
- Updated dependencies [1468e12]
  - @voyant-travel/auth@0.52.0
  - @voyant-travel/react@0.52.0
  - @voyant-travel/types@0.52.0

## 0.51.1

### Patch Changes

- @voyant-travel/auth@0.51.1
- @voyant-travel/react@0.51.1
- @voyant-travel/types@0.51.1

## 0.51.0

### Patch Changes

- @voyant-travel/auth@0.51.0
- @voyant-travel/react@0.51.0
- @voyant-travel/types@0.51.0

## 0.50.8

### Patch Changes

- @voyant-travel/auth@0.50.8
- @voyant-travel/react@0.50.8
- @voyant-travel/types@0.50.8

## 0.50.7

### Patch Changes

- @voyant-travel/auth@0.50.7
- @voyant-travel/react@0.50.7
- @voyant-travel/types@0.50.7

## 0.50.6

### Patch Changes

- @voyant-travel/auth@0.50.6
- @voyant-travel/react@0.50.6
- @voyant-travel/types@0.50.6

## 0.50.5

### Patch Changes

- Updated dependencies [c2b36ce]
  - @voyant-travel/auth@0.50.5
  - @voyant-travel/react@0.50.5
  - @voyant-travel/types@0.50.5

## 0.50.4

### Patch Changes

- Updated dependencies [d1f7559]
  - @voyant-travel/auth@0.50.4
  - @voyant-travel/react@0.50.4
  - @voyant-travel/types@0.50.4

## 0.50.3

### Patch Changes

- @voyant-travel/auth@0.50.3
- @voyant-travel/react@0.50.3
- @voyant-travel/types@0.50.3

## 0.50.2

### Patch Changes

- @voyant-travel/auth@0.50.2
- @voyant-travel/react@0.50.2
- @voyant-travel/types@0.50.2

## 0.50.1

### Patch Changes

- @voyant-travel/auth@0.50.1
- @voyant-travel/react@0.50.1
- @voyant-travel/types@0.50.1

## 0.50.0

### Patch Changes

- @voyant-travel/auth@0.50.0
- @voyant-travel/react@0.50.0
- @voyant-travel/types@0.50.0

## 0.49.0

### Patch Changes

- @voyant-travel/auth@0.49.0
- @voyant-travel/react@0.49.0
- @voyant-travel/types@0.49.0

## 0.48.0

### Patch Changes

- @voyant-travel/auth@0.48.0
- @voyant-travel/react@0.48.0
- @voyant-travel/types@0.48.0

## 0.47.0

### Patch Changes

- @voyant-travel/auth@0.47.0
- @voyant-travel/react@0.47.0
- @voyant-travel/types@0.47.0

## 0.46.0

### Patch Changes

- @voyant-travel/auth@0.46.0
- @voyant-travel/react@0.46.0
- @voyant-travel/types@0.46.0

## 0.45.0

### Patch Changes

- @voyant-travel/auth@0.45.0
- @voyant-travel/react@0.45.0
- @voyant-travel/types@0.45.0

## 0.44.0

### Patch Changes

- @voyant-travel/auth@0.44.0
- @voyant-travel/react@0.44.0
- @voyant-travel/types@0.44.0

## 0.43.0

### Minor Changes

- d07215e: Add first-class API token rotation and audit-facing token context. The auth facade now supports `POST /auth/api-tokens/:keyId/rotate`, the React hooks and UI expose rotation, and Hono request context includes `apiTokenId` for downstream audit log writers.

### Patch Changes

- Updated dependencies [d07215e]
  - @voyant-travel/auth@0.43.0
  - @voyant-travel/react@0.43.0
  - @voyant-travel/types@0.43.0

## 0.42.0

### Patch Changes

- @voyant-travel/auth@0.42.0
- @voyant-travel/react@0.42.0
- @voyant-travel/types@0.42.0

## 0.41.3

### Patch Changes

- @voyant-travel/auth@0.41.3
- @voyant-travel/react@0.41.3
- @voyant-travel/types@0.41.3

## 0.41.2

### Patch Changes

- @voyant-travel/auth@0.41.2
- @voyant-travel/react@0.41.2
- @voyant-travel/types@0.41.2

## 0.41.1

### Patch Changes

- @voyant-travel/auth@0.41.1
- @voyant-travel/react@0.41.1
- @voyant-travel/types@0.41.1

## 0.41.0

### Patch Changes

- @voyant-travel/auth@0.41.0
- @voyant-travel/react@0.41.0
- @voyant-travel/types@0.41.0

## 0.40.1

### Patch Changes

- @voyant-travel/auth@0.40.1
- @voyant-travel/react@0.40.1
- @voyant-travel/types@0.40.1

## 0.40.0

### Patch Changes

- @voyant-travel/auth@0.40.0
- @voyant-travel/react@0.40.0
- @voyant-travel/types@0.40.0

## 0.39.0

### Patch Changes

- @voyant-travel/auth@0.39.0
- @voyant-travel/react@0.39.0
- @voyant-travel/types@0.39.0

## 0.38.2

### Patch Changes

- @voyant-travel/auth@0.38.2
- @voyant-travel/react@0.38.2
- @voyant-travel/types@0.38.2

## 0.38.1

### Patch Changes

- @voyant-travel/auth@0.38.1
- @voyant-travel/react@0.38.1
- @voyant-travel/types@0.38.1

## 0.38.0

### Patch Changes

- @voyant-travel/auth@0.38.0
- @voyant-travel/react@0.38.0
- @voyant-travel/types@0.38.0

## 0.37.1

### Patch Changes

- @voyant-travel/auth@0.37.1
- @voyant-travel/react@0.37.1
- @voyant-travel/types@0.37.1

## 0.37.0

### Minor Changes

- 208792f: Add shared organization invitation acceptance hooks and a router-agnostic accept-invitation page.
- 5c0cd16: Add shared account self-service profile helpers, account mutation hooks, and reusable account page/forms.
- 7bf14d8: Add shared email verification helpers and a router-agnostic VerifyEmailPage for Better Auth token and email OTP flows.
- 5686880: Add the shared account profile update contract, React mutation helper, and card-less onboarding profile completion page.
- 9ec9d4d: Add reusable password reset hooks and shared forgot/reset password auth UI pages.
- 36d145f: Add a reusable email/password sign-in hook and shared auth-ui sign-in page.
- 2b0b492: Add a reusable email/password sign-up hook and shared auth-ui sign-up page, with
  app-owned submission support for invitation-token registration.

### Patch Changes

- Updated dependencies [5c0cd16]
- Updated dependencies [5686880]
  - @voyant-travel/auth@0.37.0
  - @voyant-travel/react@0.37.0
  - @voyant-travel/types@0.37.0

## 0.36.0

### Patch Changes

- @voyant-travel/auth@0.36.0
- @voyant-travel/react@0.36.0
- @voyant-travel/types@0.36.0

## 0.35.0

### Patch Changes

- @voyant-travel/auth@0.35.0
- @voyant-travel/react@0.35.0
- @voyant-travel/types@0.35.0

## 0.34.0

### Patch Changes

- @voyant-travel/auth@0.34.0
- @voyant-travel/react@0.34.0
- @voyant-travel/types@0.34.0

## 0.33.1

### Patch Changes

- @voyant-travel/auth@0.33.1
- @voyant-travel/react@0.33.1
- @voyant-travel/types@0.33.1

## 0.33.0

### Patch Changes

- @voyant-travel/auth@0.33.0
- @voyant-travel/react@0.33.0
- @voyant-travel/types@0.33.0

## 0.32.3

### Patch Changes

- @voyant-travel/auth@0.32.3
- @voyant-travel/react@0.32.3
- @voyant-travel/types@0.32.3

## 0.32.2

### Patch Changes

- @voyant-travel/auth@0.32.2
- @voyant-travel/react@0.32.2
- @voyant-travel/types@0.32.2

## 0.32.1

### Patch Changes

- 085c01b: Expose a shared `/auth/api-tokens` management facade for permissioned Better Auth API keys and document the React hooks' expected route contract.
- Updated dependencies [085c01b]
  - @voyant-travel/auth@0.32.1
  - @voyant-travel/react@0.32.1
  - @voyant-travel/types@0.32.1

## 0.32.0

### Patch Changes

- @voyant-travel/auth@0.32.0
- @voyant-travel/react@0.32.0
- @voyant-travel/types@0.32.0

## 0.31.4

### Patch Changes

- @voyant-travel/auth@0.31.4
- @voyant-travel/react@0.31.4
- @voyant-travel/types@0.31.4

## 0.31.3

### Patch Changes

- @voyant-travel/auth@0.31.3
- @voyant-travel/react@0.31.3
- @voyant-travel/types@0.31.3

## 0.31.2

### Patch Changes

- 54ddc93: Add API token management powered by Better Auth API keys, including reusable React hooks, a shared auth UI package, canonical permission presets, and API-key route permission guards.
- Updated dependencies [54ddc93]
  - @voyant-travel/auth@0.31.2
  - @voyant-travel/react@0.31.2
  - @voyant-travel/types@0.31.2

## 0.31.1

### Patch Changes

- @voyant-travel/auth@0.31.1
- @voyant-travel/react@0.31.1

## 0.31.0

### Patch Changes

- @voyant-travel/auth@0.31.0
- @voyant-travel/react@0.31.0

## 0.30.7

### Patch Changes

- @voyant-travel/auth@0.30.7
- @voyant-travel/react@0.30.7

## 0.30.6

### Patch Changes

- @voyant-travel/auth@0.30.6
- @voyant-travel/react@0.30.6

## 0.30.5

### Patch Changes

- @voyant-travel/auth@0.30.5
- @voyant-travel/react@0.30.5

## 0.30.4

### Patch Changes

- @voyant-travel/auth@0.30.4
- @voyant-travel/react@0.30.4

## 0.30.3

### Patch Changes

- @voyant-travel/auth@0.30.3
- @voyant-travel/react@0.30.3

## 0.30.2

### Patch Changes

- @voyant-travel/auth@0.30.2
- @voyant-travel/react@0.30.2

## 0.30.1

### Patch Changes

- @voyant-travel/auth@0.30.1
- @voyant-travel/react@0.30.1

## 0.30.0

### Patch Changes

- @voyant-travel/auth@0.30.0
- @voyant-travel/react@0.30.0

## 0.29.0

### Patch Changes

- @voyant-travel/auth@0.29.0
- @voyant-travel/react@0.29.0

## 0.28.3

### Patch Changes

- @voyant-travel/auth@0.28.3
- @voyant-travel/react@0.28.3

## 0.28.2

### Patch Changes

- @voyant-travel/auth@0.28.2
- @voyant-travel/react@0.28.2

## 0.28.1

### Patch Changes

- @voyant-travel/auth@0.28.1
- @voyant-travel/react@0.28.1

## 0.28.0

### Patch Changes

- @voyant-travel/auth@0.28.0
- @voyant-travel/react@0.28.0

## 0.27.0

### Patch Changes

- @voyant-travel/auth@0.27.0
- @voyant-travel/react@0.27.0

## 0.26.9

### Patch Changes

- @voyant-travel/auth@0.26.9
- @voyant-travel/react@0.26.9

## 0.26.8

### Patch Changes

- @voyant-travel/auth@0.26.8
- @voyant-travel/react@0.26.8

## 0.26.7

### Patch Changes

- @voyant-travel/auth@0.26.7
- @voyant-travel/react@0.26.7

## 0.26.6

### Patch Changes

- @voyant-travel/auth@0.26.6
- @voyant-travel/react@0.26.6

## 0.26.5

### Patch Changes

- @voyant-travel/auth@0.26.5
- @voyant-travel/react@0.26.5

## 0.26.4

### Patch Changes

- @voyant-travel/auth@0.26.4
- @voyant-travel/react@0.26.4

## 0.26.3

### Patch Changes

- @voyant-travel/auth@0.26.3
- @voyant-travel/react@0.26.3

## 0.26.2

### Patch Changes

- ffdb485: Make `auth.user.email` nullable and add `phone_number` columns so phone-only signups (Better Auth phone-OTP plugin) no longer need a synthetic `<phone>@phone.protravel.ro` placeholder (closes #441).

  Schema: drops the email-only `UNIQUE` on `auth.user.email`, alters the column to nullable, adds `phone_number` (text, nullable) + `phone_number_verified` (boolean, default false), creates partial unique indexes (`user_email_unique WHERE email IS NOT NULL`, `user_phone_unique WHERE phone_number IS NOT NULL`), and a check constraint `user_email_or_phone CHECK (email IS NOT NULL OR phone_number IS NOT NULL)` so a row must carry at least one identifier. Migration ships `templates/operator/migrations/0025_user_email_nullable_phone.sql`.

  Consumer cleanup:

  - `@voyant-travel/auth`'s `CurrentUser` type and `getCurrentUser` / `ensureCurrentUserProfile` now treat email as nullable; phone-only signups fall through provisioning instead of being rejected.
  - `@voyant-travel/auth-react`'s `currentUserSchema` and `organizationMemberUserSchema` accept null email; `currentUserSchema` also exposes the new `phoneNumber` field.
  - `@voyant-travel/customer-portal`'s profile read/write paths handle null `authUser.email`: `getAccessibleBookingIds` and `hasBookingAccess` skip the email-match branch for phone-only users (linked-person matching still works), and `bootstrap` skips email-keyed candidate lookup. Existing email-based flows are unchanged.

  Out of scope for this PR (deferred):

  - Wiring the Better Auth phone-OTP plugin in `@voyant-travel/auth/src/server.ts` (needs SMS provider + signup route work). The schema is now ready for it; the plugin wiring lands in a follow-up.

- Updated dependencies [ffdb485]
  - @voyant-travel/auth@0.26.2
  - @voyant-travel/react@0.26.2

## 0.26.1

### Patch Changes

- @voyant-travel/auth@0.26.1
- @voyant-travel/react@0.26.1

## 0.26.0

### Patch Changes

- @voyant-travel/auth@0.26.0
- @voyant-travel/react@0.26.0

## 0.25.0

### Patch Changes

- @voyant-travel/auth@0.25.0
- @voyant-travel/react@0.25.0

## 0.24.3

### Patch Changes

- @voyant-travel/auth@0.24.3
- @voyant-travel/react@0.24.3

## 0.24.2

### Patch Changes

- @voyant-travel/auth@0.24.2
- @voyant-travel/react@0.24.2

## 0.24.1

### Patch Changes

- ed635c7: Expose consistent Tailwind v4 style helper imports across admin and UI packages,
  and document single-tenant auth shell bootstrap without mandatory workspace
  organization routes.
  - @voyant-travel/auth@0.24.1
  - @voyant-travel/react@0.24.1

## 0.24.0

### Patch Changes

- @voyant-travel/auth@0.24.0
- @voyant-travel/react@0.24.0

## 0.23.0

### Patch Changes

- @voyant-travel/auth@0.23.0
- @voyant-travel/react@0.23.0

## 0.22.0

### Patch Changes

- @voyant-travel/auth@0.22.0
- @voyant-travel/react@0.22.0

## 0.21.1

### Patch Changes

- @voyant-travel/auth@0.21.1
- @voyant-travel/react@0.21.1

## 0.21.0

### Patch Changes

- @voyant-travel/auth@0.21.0
- @voyant-travel/react@0.21.0

## 0.20.0

### Patch Changes

- @voyant-travel/auth@0.20.0
- @voyant-travel/react@0.20.0

## 0.19.0

### Patch Changes

- @voyant-travel/auth@0.19.0
- @voyant-travel/react@0.19.0

## 0.18.0

### Patch Changes

- @voyant-travel/auth@0.18.0
- @voyant-travel/react@0.18.0

## 0.17.0

### Patch Changes

- @voyant-travel/auth@0.17.0
- @voyant-travel/react@0.17.0

## 0.16.0

### Patch Changes

- @voyant-travel/auth@0.16.0
- @voyant-travel/react@0.16.0

## 0.15.0

### Patch Changes

- @voyant-travel/auth@0.15.0
- @voyant-travel/react@0.15.0

## 0.14.0

### Patch Changes

- @voyant-travel/auth@0.14.0
- @voyant-travel/react@0.14.0

## 0.13.0

### Patch Changes

- @voyant-travel/auth@0.13.0
- @voyant-travel/react@0.13.0

## 0.12.0

### Patch Changes

- @voyant-travel/auth@0.12.0
- @voyant-travel/react@0.12.0

## 0.11.0

### Patch Changes

- @voyant-travel/auth@0.11.0
- @voyant-travel/react@0.11.0

## 0.10.0

### Patch Changes

- @voyant-travel/auth@0.10.0
- @voyant-travel/react@0.10.0

## 0.9.0

### Patch Changes

- @voyant-travel/auth@0.9.0
- @voyant-travel/react@0.9.0

## 0.8.0

### Patch Changes

- @voyant-travel/auth@0.8.0
- @voyant-travel/react@0.8.0

## 0.7.0

### Patch Changes

- @voyant-travel/auth@0.7.0
- @voyant-travel/react@0.7.0

## 0.6.9

### Patch Changes

- @voyant-travel/auth@0.6.9
- @voyant-travel/react@0.6.9

## 0.6.8

### Patch Changes

- @voyant-travel/auth@0.6.8
- @voyant-travel/react@0.6.8

## 0.6.7

### Patch Changes

- @voyant-travel/auth@0.6.7
- @voyant-travel/react@0.6.7

## 0.6.6

### Patch Changes

- @voyant-travel/auth@0.6.6
- @voyant-travel/react@0.6.6

## 0.6.5

### Patch Changes

- @voyant-travel/auth@0.6.5
- @voyant-travel/react@0.6.5

## 0.6.4

### Patch Changes

- @voyant-travel/auth@0.6.4
- @voyant-travel/react@0.6.4

## 0.6.3

### Patch Changes

- @voyant-travel/auth@0.6.3
- @voyant-travel/react@0.6.3

## 0.6.2

### Patch Changes

- @voyant-travel/auth@0.6.2
- @voyant-travel/react@0.6.2

## 0.6.1

### Patch Changes

- @voyant-travel/auth@0.6.1
- @voyant-travel/react@0.6.1

## 0.6.0

### Patch Changes

- @voyant-travel/auth@0.6.0
- @voyant-travel/react@0.6.0

## 0.5.0

### Patch Changes

- @voyant-travel/auth@0.5.0
- @voyant-travel/react@0.5.0

## 0.4.5

### Patch Changes

- @voyant-travel/auth@0.4.5
- @voyant-travel/react@0.4.5

## 0.4.4

### Patch Changes

- @voyant-travel/auth@0.4.4
- @voyant-travel/react@0.4.4

## 0.4.3

### Patch Changes

- @voyant-travel/auth@0.4.3
- @voyant-travel/react@0.4.3

## 0.4.2

### Patch Changes

- @voyant-travel/auth@0.4.2
- @voyant-travel/react@0.4.2

## 0.4.1

### Patch Changes

- a49630a: Extend the public finance surface with customer-safe document lookup by reference
  and add typed organization member/invitation exports in `@voyant-travel/auth-react`
  for shared team-management UIs.
  - @voyant-travel/auth@0.4.1
  - @voyant-travel/react@0.4.1

## 0.4.0

### Patch Changes

- @voyant-travel/auth@0.4.0
- @voyant-travel/react@0.4.0

## 0.3.1

### Patch Changes

- @voyant-travel/auth@0.3.1
- @voyant-travel/react@0.3.1
