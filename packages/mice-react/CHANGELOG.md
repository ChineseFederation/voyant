# @voyant-travel/mice-react

## 0.76.0

### Patch Changes

- Updated dependencies [1873611]
  - @voyant-travel/admin@0.130.0
  - @voyant-travel/i18n@0.118.0
  - @voyant-travel/relationships-react@0.208.0
  - @voyant-travel/mice@0.64.0

## 0.75.0

### Patch Changes

- @voyant-travel/mice@0.63.0
- @voyant-travel/relationships-react@0.207.0

## 0.74.0

### Patch Changes

- Updated dependencies [5daf427]
  - @voyant-travel/i18n@0.117.3
  - @voyant-travel/relationships-react@0.206.0
  - @voyant-travel/mice@0.62.0

## 0.73.0

### Patch Changes

- @voyant-travel/mice@0.61.0
- @voyant-travel/relationships-react@0.205.0

## 0.72.0

### Patch Changes

- @voyant-travel/relationships-react@0.204.0
- @voyant-travel/mice@0.60.0

## 0.71.0

### Patch Changes

- @voyant-travel/mice@0.59.0
- @voyant-travel/relationships-react@0.203.0

## 0.70.0

### Patch Changes

- @voyant-travel/mice@0.58.0
- @voyant-travel/relationships-react@0.202.0

## 0.69.0

### Patch Changes

- @voyant-travel/mice@0.57.0
- @voyant-travel/relationships-react@0.201.0

## 0.68.0

### Patch Changes

- Updated dependencies [952d817]
  - @voyant-travel/utils@0.110.0
  - @voyant-travel/mice@0.56.0
  - @voyant-travel/relationships-react@0.200.0
  - @voyant-travel/ui@0.109.6

## 0.67.0

### Patch Changes

- @voyant-travel/mice@0.55.0
- @voyant-travel/relationships-react@0.199.0

## 0.66.1

### Patch Changes

- e2cb9f5: Give every admin screen consistent page spacing. Previously each page invented
  its own padding (`p-6`, `px-6 py-6 lg:px-8`, `container mx-auto py-6` with no
  horizontal padding, or none at all), so screens like the booking engine had no
  spacing while others differed.

  The admin workspace layout now wraps the page outlet in a single padded content
  region (`px-4 py-6 md:px-6`), and the per-page root padding was removed so it no
  longer double-pads (max-width caps are kept). The full-height settings two-pane
  bleeds back out of that padding and re-applies its own so it stays edge-to-edge.

- e2cb9f5: Move heavy multi-field forms from centered dialogs to side sheets. Create/edit
  forms with more than a handful of fields (invoices, bookings, travelers,
  markets, pricing rules, policies, suppliers, resources, legal templates,
  notification templates, and similar) were rendered as centered modals; per the
  dialog-vs-sheet guidance, complex multi-field editing belongs in a side sheet
  that keeps the parent screen visible. Confirmations, media viewers, and short
  one-to-three-field dialogs are unchanged.
- e2cb9f5: Make form-field grids responsive on mobile. Two-column (and three/four-column) field grids that previously rendered multiple columns at every width now stack to a single column on small screens and expand at the `sm`/`lg` breakpoints, so forms and dialogs are no longer cramped on phones.
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
  - @voyant-travel/relationships-react@0.198.1
  - @voyant-travel/admin@0.129.1
  - @voyant-travel/ui@0.109.5

## 0.66.0

### Patch Changes

- @voyant-travel/mice@0.54.0
- @voyant-travel/relationships-react@0.198.0

## 0.65.0

### Patch Changes

- @voyant-travel/mice@0.53.0
- @voyant-travel/relationships-react@0.197.0

## 0.64.0

### Patch Changes

- Updated dependencies [0190317]
  - @voyant-travel/mice@0.52.0
  - @voyant-travel/relationships-react@0.196.0

## 0.63.0

### Patch Changes

- @voyant-travel/mice@0.51.0
- @voyant-travel/relationships-react@0.195.0

## 0.62.0

### Patch Changes

- @voyant-travel/relationships-react@0.194.0
- @voyant-travel/mice@0.50.0

## 0.61.0

### Patch Changes

- Updated dependencies [90d44c0]
  - @voyant-travel/admin@0.129.0
  - @voyant-travel/i18n@0.117.0
  - @voyant-travel/relationships-react@0.193.0
  - @voyant-travel/mice@0.49.0

## 0.60.0

### Patch Changes

- @voyant-travel/relationships-react@0.192.0
- @voyant-travel/mice@0.48.0

## 0.59.0

### Patch Changes

- @voyant-travel/relationships-react@0.191.0
- @voyant-travel/mice@0.47.0

## 0.58.0

### Patch Changes

- @voyant-travel/mice@0.46.0
- @voyant-travel/types@0.109.9
- @voyant-travel/relationships-react@0.190.0

## 0.57.0

### Patch Changes

- @voyant-travel/relationships-react@0.189.0
- @voyant-travel/mice@0.45.0

## 0.56.0

### Patch Changes

- Updated dependencies [9db4363]
  - @voyant-travel/utils@0.109.0
  - @voyant-travel/mice@0.44.0
  - @voyant-travel/relationships-react@0.188.0
  - @voyant-travel/ui@0.109.4

## 0.55.0

### Patch Changes

- @voyant-travel/relationships-react@0.187.0
- @voyant-travel/mice@0.43.0

## 0.54.0

### Patch Changes

- @voyant-travel/relationships-react@0.186.0
- @voyant-travel/mice@0.42.0

## 0.53.0

### Patch Changes

- @voyant-travel/relationships-react@0.185.0
- @voyant-travel/mice@0.41.0

## 0.52.0

### Patch Changes

- @voyant-travel/relationships-react@0.184.0
- @voyant-travel/mice@0.40.0

## 0.51.0

### Patch Changes

- @voyant-travel/relationships-react@0.183.0
- @voyant-travel/mice@0.39.0

## 0.50.1

### Patch Changes

- Updated dependencies [f0f51b4]
  - @voyant-travel/i18n@0.116.0
  - @voyant-travel/admin@0.128.3
  - @voyant-travel/relationships-react@0.182.1

## 0.50.0

### Patch Changes

- @voyant-travel/relationships-react@0.182.0
- @voyant-travel/mice@0.38.0

## 0.49.0

### Patch Changes

- Updated dependencies [464815c]
  - @voyant-travel/i18n@0.115.1
  - @voyant-travel/relationships-react@0.181.0
  - @voyant-travel/mice@0.37.0

## 0.48.1

### Patch Changes

- Updated dependencies [c2ca4a3]
  - @voyant-travel/i18n@0.115.0
  - @voyant-travel/admin@0.128.2
  - @voyant-travel/relationships-react@0.180.1

## 0.48.0

### Patch Changes

- Updated dependencies [ecf1680]
  - @voyant-travel/i18n@0.114.0
  - @voyant-travel/admin@0.128.1
  - @voyant-travel/relationships-react@0.180.0
  - @voyant-travel/mice@0.36.0

## 0.47.0

### Patch Changes

- @voyant-travel/relationships-react@0.179.0
- @voyant-travel/mice@0.35.0

## 0.46.0

### Patch Changes

- Updated dependencies [2bcafc9]
  - @voyant-travel/admin@0.128.0
  - @voyant-travel/i18n@0.113.0
  - @voyant-travel/relationships-react@0.178.0
  - @voyant-travel/mice@0.34.0

## 0.45.0

### Patch Changes

- @voyant-travel/mice@0.33.0
- @voyant-travel/types@0.109.8
- @voyant-travel/relationships-react@0.177.0

## 0.44.0

### Patch Changes

- @voyant-travel/mice@0.32.0
- @voyant-travel/types@0.109.7
- @voyant-travel/relationships-react@0.176.0

## 0.43.0

### Patch Changes

- @voyant-travel/mice@0.31.0
- @voyant-travel/types@0.109.6
- @voyant-travel/relationships-react@0.175.0

## 0.42.0

### Patch Changes

- @voyant-travel/mice@0.30.0
- @voyant-travel/relationships-react@0.174.0

## 0.41.0

### Patch Changes

- @voyant-travel/relationships-react@0.173.0
- @voyant-travel/mice@0.29.0

## 0.40.0

### Patch Changes

- Updated dependencies [f6f22e7]
  - @voyant-travel/utils@0.108.0
  - @voyant-travel/mice@0.28.0
  - @voyant-travel/relationships-react@0.172.0
  - @voyant-travel/ui@0.109.3

## 0.39.0

### Patch Changes

- @voyant-travel/relationships-react@0.171.0
- @voyant-travel/mice@0.27.0

## 0.38.0

### Patch Changes

- Updated dependencies [117fa05]
  - @voyant-travel/i18n@0.112.1
  - @voyant-travel/mice@0.26.0
  - @voyant-travel/relationships-react@0.170.0

## 0.37.0

### Patch Changes

- Updated dependencies [a461920]
- Updated dependencies [a461920]
  - @voyant-travel/admin@0.127.0
  - @voyant-travel/relationships-react@0.169.0
  - @voyant-travel/mice@0.25.0

## 0.36.0

### Patch Changes

- @voyant-travel/relationships-react@0.168.0
- @voyant-travel/mice@0.24.0

## 0.35.0

### Patch Changes

- @voyant-travel/relationships-react@0.167.0
- @voyant-travel/mice@0.23.0

## 0.34.0

### Patch Changes

- Updated dependencies [0868f18]
- Updated dependencies [3062a73]
  - @voyant-travel/admin@0.126.2
  - @voyant-travel/i18n@0.112.0
  - @voyant-travel/relationships-react@0.166.0
  - @voyant-travel/mice@0.22.0

## 0.33.0

### Patch Changes

- @voyant-travel/relationships-react@0.165.0
- @voyant-travel/mice@0.21.0

## 0.32.0

### Patch Changes

- @voyant-travel/relationships-react@0.164.0
- @voyant-travel/mice@0.20.0

## 0.31.0

### Patch Changes

- Updated dependencies [52352c4]
- Updated dependencies [52352c4]
  - @voyant-travel/relationships-react@0.163.0
  - @voyant-travel/mice@0.19.0

## 0.30.0

### Patch Changes

- Updated dependencies [8f0fa26]
  - @voyant-travel/mice@0.18.0
  - @voyant-travel/relationships-react@0.162.0

## 0.29.0

### Patch Changes

- Updated dependencies [c1e37f2]
  - @voyant-travel/admin@0.126.0
  - @voyant-travel/relationships-react@0.161.0
  - @voyant-travel/mice@0.17.0

## 0.28.0

### Patch Changes

- Updated dependencies [4f66e89]
  - @voyant-travel/mice@0.16.0
  - @voyant-travel/relationships-react@0.160.0

## 0.27.0

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
  - @voyant-travel/relationships-react@0.159.0
  - @voyant-travel/mice@0.15.0

## 0.26.0

### Patch Changes

- Updated dependencies [73ab096]
  - @voyant-travel/admin@0.124.0
  - @voyant-travel/mice@0.14.0
  - @voyant-travel/relationships-react@0.158.0
  - @voyant-travel/types@0.109.2

## 0.25.0

### Patch Changes

- @voyant-travel/relationships-react@0.157.0
- @voyant-travel/mice@0.13.0

## 0.24.1

### Patch Changes

- 8d62a7c: Republish every affected TypeScript package without broken declaration maps so the corrected artifact
  policy reaches npm instead of applying only to future incidental package releases.
- Updated dependencies [8d62a7c]
- Updated dependencies [8d62a7c]
  - @voyant-travel/types@0.109.1
  - @voyant-travel/utils@0.107.1
  - @voyant-travel/admin@0.123.3
  - @voyant-travel/i18n@0.111.1
  - @voyant-travel/mice@0.12.1
  - @voyant-travel/react@0.104.2
  - @voyant-travel/relationships-react@0.156.1
  - @voyant-travel/ui@0.109.1

## 0.24.0

### Patch Changes

- Updated dependencies [bbe6396]
  - @voyant-travel/i18n@0.111.0
  - @voyant-travel/mice@0.12.0
  - @voyant-travel/admin@0.123.2
  - @voyant-travel/relationships-react@0.156.0

## 0.23.0

### Patch Changes

- @voyant-travel/mice@0.11.0
- @voyant-travel/relationships-react@0.155.0

## 0.22.0

### Patch Changes

- Updated dependencies [4d0eeed]
- Updated dependencies [8bd906f]
  - @voyant-travel/types@0.109.0
  - @voyant-travel/utils@0.107.0
  - @voyant-travel/ui@0.109.0
  - @voyant-travel/mice@0.10.0
  - @voyant-travel/admin@0.123.0
  - @voyant-travel/relationships-react@0.154.0

## 0.21.0

### Patch Changes

- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [c65b05c]
- Updated dependencies [490d132]
- Updated dependencies [047c3f9]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
  - @voyant-travel/mice@0.9.0
  - @voyant-travel/admin@0.122.0
  - @voyant-travel/relationships-react@0.153.0
  - @voyant-travel/types@0.108.1

## 0.20.0

### Minor Changes

- c54cd3d: Declare the package-owned MICE admin factory as a selected-graph runtime while
  preserving its existing routes, destinations, localized navigation, icon, and
  selection behavior.

### Patch Changes

- Updated dependencies [c54cd3d]
- Updated dependencies [d771be3]
- Updated dependencies [d771be3]
  - @voyant-travel/mice@0.8.0
  - @voyant-travel/types@0.108.0
  - @voyant-travel/admin@0.121.0
  - @voyant-travel/relationships-react@0.152.0
  - @voyant-travel/utils@0.106.1

## 0.19.0

### Patch Changes

- Updated dependencies [a370024]
- Updated dependencies [a370024]
- Updated dependencies [e3dc5a9]
- Updated dependencies [e3dc5a9]
  - @voyant-travel/mice@0.7.0
  - @voyant-travel/types@0.107.2
  - @voyant-travel/relationships-react@0.151.0

## 0.18.0

### Patch Changes

- @voyant-travel/mice@0.6.10
- @voyant-travel/relationships-react@0.150.0

## 0.17.0

### Patch Changes

- Updated dependencies [a97e845]
  - @voyant-travel/admin@0.120.0
  - @voyant-travel/relationships-react@0.149.0

## 0.16.0

### Patch Changes

- Updated dependencies [8a665f3]
  - @voyant-travel/admin@0.119.0
  - @voyant-travel/relationships-react@0.148.0

## 0.15.0

### Patch Changes

- @voyant-travel/admin@0.118.0
- @voyant-travel/relationships-react@0.147.0

## 0.14.0

### Patch Changes

- Updated dependencies [ecdf0fc]
  - @voyant-travel/admin@0.117.0
  - @voyant-travel/relationships-react@0.146.0

## 0.13.0

### Patch Changes

- @voyant-travel/mice@0.6.8
- @voyant-travel/relationships-react@0.145.0

## 0.12.0

### Patch Changes

- @voyant-travel/mice@0.6.7
- @voyant-travel/relationships-react@0.144.0

## 0.11.0

### Patch Changes

- Updated dependencies [425f92e]
  - @voyant-travel/utils@0.106.0
  - @voyant-travel/relationships-react@0.143.0
  - @voyant-travel/ui@0.108.11
  - @voyant-travel/mice@0.6.6
  - @voyant-travel/types@0.107.1

## 0.10.0

### Patch Changes

- @voyant-travel/relationships-react@0.142.0

## 0.9.0

### Patch Changes

- @voyant-travel/relationships-react@0.141.0

## 0.8.0

### Patch Changes

- Updated dependencies [62e87ee]
  - @voyant-travel/admin@0.116.0
  - @voyant-travel/i18n@0.110.0
  - @voyant-travel/relationships-react@0.140.0

## 0.7.0

### Patch Changes

- 53a90b1: Render an em dash in the MICE agenda Time column when a session has no start time instead of repeating the day date.
- 2453207: Use the relationships person combobox when adding MICE delegates instead of asking admins for raw person IDs.
- 0ecded6: Expose MICE rooming assignment and booking linkage workflows on the program detail UI.
- Updated dependencies [c9a356f]
- Updated dependencies [2453207]
- Updated dependencies [922d0fd]
- Updated dependencies [f000bb3]
- Updated dependencies [28c59ea]
- Updated dependencies [2613dfb]
  - @voyant-travel/types@0.107.0
  - @voyant-travel/mice@0.6.5
  - @voyant-travel/relationships-react@0.139.0
  - @voyant-travel/admin@0.115.4
  - @voyant-travel/utils@0.105.6

## 0.6.0

### Minor Changes

- ed31e95: MICE Programs — create and edit a program (the list was previously a dead end).

  `@voyant-travel/mice`: `updateProgramSchema` now accepts `null` on the optional
  fields (destination, dates, pax, currency, budget, code, org/contact refs) so a
  PATCH can **clear** them — `.partial()` alone only allowed omitting a key, which
  left the previous value in place. The columns are already nullable and
  `updateProgram` spreads the body into `.set()`, so no migration is needed.

  `@voyant-travel/mice-react`:

  - New `ProgramFormDialog` (`./ui`): a create/edit form covering name, type,
    lifecycle status, destination, dates, estimated/confirmed pax, currency, and
    budget. Pax/budget are validated as non-negative numbers; the dialog resets
    on close.
  - `ProgramsPage` now always shows a **New program** button wired to the dialog,
    and lands the operator straight in the new program's detail on create — so
    the agenda / delegates / sourcing surfaces are reachable. (The button used to
    render only when the host passed an `onCreate` callback, which it never did,
    leaving the list with no way to create anything.)
  - `ProgramDetailPage` gains an **Edit** action (same dialog) so the lifecycle
    status, pax, dates, and budget are operable after creation, plus a
    dates · pax meta line in the header.

### Patch Changes

- Updated dependencies [ed31e95]
  - @voyant-travel/mice@0.6.0

## 0.5.1

### Patch Changes

- fbab921: MICE admin surfaces — consistency polish across the program views.

  - `ProgramsPage` and `ProgramSessionsSection` now request the backend's max
    page and show a "Showing the first N" notice when capped, matching the
    delegates and RFP surfaces (no silent truncation). The Programs admin SSR
    loader limit is bumped to match the page so its prefetch still hits the
    query key.
  - The create-session and add-delegate dialogs reset their form on every close
    (cancel/escape), matching the enroll/RFP dialogs — a cancelled draft no
    longer reappears on reopen.

## 0.5.0

### Minor Changes

- dc6c26d: MICE Programs **Sourcing** surface — RFP → bid → award on the program detail
  page (the final RFC voyant#1489 Phase 4 surface).

  - `ProgramRfpsSection` (`./ui`): lists a program's RFPs (title, status, due)
    and creates new ones in place. "Manage" opens the sourcing funnel for one
    RFP — invite suppliers, record bids, and award to a winning bid — rendered
    inside `ProgramDetailPage`. Only operator-settable statuses are offered;
    `awarded` / `accepted` / `rejected` are reached solely through the award flow.
  - `useRfp` (RFP detail with embedded invitations + bids) and `useRfpMutation`
    (create RFP / invite / record bid / award), with schemas
    `rfpSingleResponse`, `rfpDetailResponse`, `bidSingleResponse`,
    `invitationSingleResponse`, and `awardResponse`. Funnel mutations invalidate
    both the RFP list and the RFP detail so the manage view refreshes in place.

## 0.4.0

### Minor Changes

- 31a2f27: MICE Programs **Delegates** surface — roster + session enrollment on the
  program detail page.

  - `ProgramDelegatesSection` (`./ui`): lists a program's delegates (role,
    status), adds new ones in place (role, status, optional person), and enrolls
    a delegate into one of the program's agenda sessions — rendered inside
    `ProgramDetailPage` below the Agenda. The roster requests the backend's max
    page (500) and says so when a program hits the cap rather than silently
    dropping delegates.
  - `useDelegateMutation` hook (create / update / enroll) invalidating the
    delegates list root; `delegateSingleResponse` + `enrollmentRecordSchema`
    schemas for the POST/PATCH/enroll responses.

- e585844: MICE Programs **Agenda** surface — sessions on the program detail page.

  - `ProgramSessionsSection` (`./ui`): lists a program's agenda sessions and
    creates new ones in place (title, type, day, track, capacity, registration),
    rendered inside `ProgramDetailPage` below the cost sheet. Sessions are a
    program's agenda, not a top-level surface, so they nest in the detail.
  - `useSessionMutation` hook (create + update) invalidating the owning program's
    session list, plus the `sessionSingleResponse` schema for the POST/PATCH
    responses.

## 0.3.0

### Minor Changes

- 7cb6fa7: Package-delivered MICE admin surface (`@voyant-travel/mice-react/admin`).

  - New `./admin` entry exporting `createMiceAdminExtension` — contributes the
    Programs nav item (spliced after Bookings) plus the route implementations for
    the programs list (`/mice`) and a program's detail (`/mice/$id`, where the
    per-currency cost sheet lives). Picked up by `voyant admin generate` via the
    `<module>-react/admin` convention; resolves the `mice.program.list` /
    `mice.program.detail` semantic destinations.
  - `@voyant-travel/i18n`: new `nav.mice` operator-admin label (en "Programs",
    ro "Programe").

### Patch Changes

- Updated dependencies [7cb6fa7]
  - @voyant-travel/i18n@0.109.0
  - @voyant-travel/admin@0.115.2
  - @voyant-travel/ui@0.108.2

## 0.2.0

### Minor Changes

- af9b46e: New `@voyant-travel/mice-react` package — the React data layer + hooks for the
  MICE admin API, plus the Programs UI.

  - Typed client/schemas/query-keys/query-options + `@tanstack/react-query` hooks
    for all MICE surfaces: programs (+ cost sheet), sessions, delegates, rooming,
    RFPs (`usePrograms`, `useProgram`, `useProgramCostSheet`, `useProgramMutation`,
    `useProgramSessions`, `useProgramDelegates`, `useProgramRooming`,
    `useProgramRfps`).
  - Programs UI components (`./ui`): `ProgramsPage` (list), `ProgramDetailPage`,
    and `ProgramCostSheetPanel` — the P&L renders **per currency** (no FX),
    matching the cost-sheet service.

  Follow-ups: the `./admin` extension + operator admin-generate wiring, en/ro
  i18n, and the remaining admin surfaces (sessions, delegates, rooming, RFP/bids).
