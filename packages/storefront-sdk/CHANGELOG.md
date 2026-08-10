# @voyant-travel/storefront-sdk

## 0.267.0

### Patch Changes

- Updated dependencies [7dbd3c7]
- Updated dependencies [2544ff4]
  - @voyant-travel/finance@0.246.0

## 0.266.0

### Patch Changes

- Updated dependencies [b95e995]
- Updated dependencies [5602eff]
- Updated dependencies [231acfa]
- Updated dependencies [e363b1b]
- Updated dependencies [6945d07]
- Updated dependencies [e06888c]
- Updated dependencies [b760ac6]
- Updated dependencies [d359373]
- Updated dependencies [4c2b4ce]
  - @voyant-travel/catalog-contracts@0.131.0
  - @voyant-travel/storefront@0.255.0

## 0.265.0

### Patch Changes

- Updated dependencies [e0e62f3]
- Updated dependencies [6b672c0]
- Updated dependencies [03a91d0]
- Updated dependencies [334e990]
- Updated dependencies [34713bd]
  - @voyant-travel/storefront@0.254.0
  - @voyant-travel/catalog-contracts@0.130.0

## 0.264.0

### Patch Changes

- Updated dependencies [21a28ef]
  - @voyant-travel/catalog-contracts@0.129.0

## 0.263.0

### Patch Changes

- Updated dependencies [c8b9c1e]
  - @voyant-travel/finance@0.245.0

## 0.262.0

### Patch Changes

- Updated dependencies [688f164]
  - @voyant-travel/catalog-contracts@0.128.0

## 0.261.0

### Patch Changes

- Updated dependencies [56e2050]
  - @voyant-travel/catalog-contracts@0.127.0

## 0.260.0

### Patch Changes

- Updated dependencies [484b207]
  - @voyant-travel/finance@0.244.0

## 0.259.0

### Patch Changes

- @voyant-travel/storefront@0.253.0

## 0.258.0

### Patch Changes

- Updated dependencies [1be6b76]
  - @voyant-travel/finance@0.243.0
  - @voyant-travel/storefront@0.252.0

## 0.257.0

### Patch Changes

- Updated dependencies [6c77f7d]
- Updated dependencies [d98648a]
  - @voyant-travel/catalog-contracts@0.126.0
  - @voyant-travel/bookings@0.240.0
  - @voyant-travel/finance@0.242.0
  - @voyant-travel/storefront@0.251.0

## 0.256.0

### Patch Changes

- Updated dependencies [380dad7]
  - @voyant-travel/finance@0.241.0
  - @voyant-travel/storefront@0.250.0

## 0.255.0

### Patch Changes

- @voyant-travel/storefront@0.249.0

## 0.254.0

### Patch Changes

- Updated dependencies [e8bd000]
  - @voyant-travel/bookings@0.239.0
  - @voyant-travel/finance@0.240.0
  - @voyant-travel/storefront@0.248.0

## 0.253.0

### Patch Changes

- @voyant-travel/storefront@0.247.0

## 0.252.0

### Patch Changes

- Updated dependencies [076c246]
  - @voyant-travel/catalog-contracts@0.125.0
  - @voyant-travel/storefront@0.246.0

## 0.251.0

### Patch Changes

- Updated dependencies [9ef6a65]
- Updated dependencies [9ef6a65]
  - @voyant-travel/catalog-contracts@0.124.0

## 0.250.0

### Minor Changes

- ef8871d: Validate the selection against the published Booking Requirements.

  Requirements reached the host in the earlier phases of #4188 but stayed
  advisory: nothing checked that the selection a host collected answered the
  descriptor the server published. A host that rendered the wrong field set did
  not error — it collected a plausible-looking set and failed at commit, or
  committed something incomplete. That is the #4113 class of bug.

  `validateSelectionAgainstRequirements(requirements, selection)` is the one
  validator, in `@voyant-travel/catalog-contracts/booking-engine/requirements-validation`.
  It walks what the descriptor declares — pax band windows and cross-band
  dependencies, required configure sub-steps, required traveler and booking
  fields — and returns machine-readable `{ requirementKey, reason }` entries, never
  prose. The Booking Session calls it at quote time so a host learns what is
  missing while it can still fix it, and again at commit because the server never
  trusts that the client quoted first.

  A Quote now carries `requirementsFingerprint` alongside `priceFingerprint`,
  computed the same way. `commitBookingSessionV1` requires the client to echo the
  fingerprint it rendered against, and the commit path re-derives and compares
  exactly as `price_changed` does. Two new recoverable outcomes on
  `bookingSessionLifecycleErrorV1`: `selection_incomplete` (with the unsatisfied
  list, `update_selection`) and `requirements_changed` (`request_fresh_quote`).
  No Booking, Allocation, or supplier operation is created when either fires.

  The lifecycle conformance suite holds third-party verticals to the same
  contract: a satisfying selection must commit on an otherwise clear path, an
  unsatisfying one must produce no side effects, and every entry a descriptor
  marks required must be something the validator actually checks.

  Migration `20260804190000_booking_session_quote_requirements_fingerprint`
  expires in-flight Quotes rather than backfilling a fingerprint no descriptor
  produced.

### Patch Changes

- Updated dependencies [ef8871d]
  - @voyant-travel/catalog-contracts@0.123.0

## 0.249.0

### Patch Changes

- Updated dependencies [b52433d]
  - @voyant-travel/catalog-contracts@0.122.0

## 0.248.0

### Patch Changes

- @voyant-travel/storefront@0.245.0

## 0.247.0

### Patch Changes

- Updated dependencies [0976af1]
  - @voyant-travel/catalog-contracts@0.121.0

## 0.246.0

### Patch Changes

- Updated dependencies [9b9e8ac]
  - @voyant-travel/catalog-contracts@0.120.0
  - @voyant-travel/storefront@0.244.0

## 0.245.0

### Patch Changes

- Updated dependencies [da20433]
  - @voyant-travel/catalog-contracts@0.119.0
  - @voyant-travel/storefront@0.243.0

## 0.244.0

### Patch Changes

- Updated dependencies [d2a571f]
  - @voyant-travel/catalog-contracts@0.118.0
  - @voyant-travel/storefront@0.242.0

## 0.243.0

### Patch Changes

- Updated dependencies [645a219]
- Updated dependencies [b3cfd05]
- Updated dependencies [b7bb6c8]
  - @voyant-travel/finance@0.239.0
  - @voyant-travel/storefront@0.241.0

## 0.242.0

### Patch Changes

- @voyant-travel/storefront@0.240.0

## 0.241.0

### Patch Changes

- Updated dependencies [06a79a0]
- Updated dependencies [06a79a0]
  - @voyant-travel/finance@0.238.0
  - @voyant-travel/bookings@0.238.0
  - @voyant-travel/catalog-contracts@0.117.0
  - @voyant-travel/storefront@0.239.0

## 0.240.0

### Patch Changes

- Updated dependencies [4c694f6]
  - @voyant-travel/catalog-contracts@0.116.0

## 0.239.0

### Patch Changes

- Updated dependencies [f69e880]
  - @voyant-travel/bookings-contracts@0.114.0
  - @voyant-travel/bookings@0.237.0
  - @voyant-travel/finance@0.237.0

## 0.238.0

### Patch Changes

- Updated dependencies [eeaa5b5]
  - @voyant-travel/finance@0.236.0
  - @voyant-travel/storefront@0.238.0
  - @voyant-travel/bookings@0.236.0

## 0.237.0

### Patch Changes

- @voyant-travel/finance@0.235.0
- @voyant-travel/storefront@0.237.0
- @voyant-travel/bookings@0.235.0

## 0.236.0

### Minor Changes

- 2ed62d3: Remove the beta Booking-backed session and low-level public Booking creation
  surfaces. Custom storefronts now construct reservations exclusively through
  Catalog Booking Session v1, while Bookings exposes only committed-reservation
  overview and guest-access routes.

### Patch Changes

- Updated dependencies [46005bf]
- Updated dependencies [9f412dd]
- Updated dependencies [2ed62d3]
  - @voyant-travel/bookings@0.234.0
  - @voyant-travel/bookings-contracts@0.113.0
  - @voyant-travel/finance@0.234.0
  - @voyant-travel/storefront@0.236.0

## 0.235.0

### Patch Changes

- Updated dependencies [15c1c64]
  - @voyant-travel/bookings-contracts@0.112.0
  - @voyant-travel/bookings@0.233.0
  - @voyant-travel/finance@0.233.0
  - @voyant-travel/storefront@0.235.0

## 0.234.0

### Patch Changes

- Updated dependencies [e93c0a7]
  - @voyant-travel/catalog-contracts@0.115.0
  - @voyant-travel/storefront@0.234.0
  - @voyant-travel/bookings@0.232.0
  - @voyant-travel/finance@0.232.0

## 0.233.0

### Patch Changes

- @voyant-travel/storefront@0.233.0
- @voyant-travel/bookings@0.231.0
- @voyant-travel/finance@0.231.0

## 0.232.0

### Patch Changes

- Updated dependencies [72c6753]
- Updated dependencies [79606bb]
  - @voyant-travel/finance@0.230.0
  - @voyant-travel/bookings@0.230.0
  - @voyant-travel/catalog-contracts@0.114.0
  - @voyant-travel/storefront@0.232.0

## 0.231.1

## 0.231.0

### Minor Changes

- 5d3b563: Complete the Booking Session v1 owned Product tracer with server-derived access context,
  creation-only anonymous capability material, idempotent Quote/Hold/update/abandon/Commit
  operations, and production Commit wiring through the admitted Finance self-service create
  transaction callback.
- 2601445: Continue owned Product Booking Session Commit through an idempotent pre-Booking
  Finance payment session, selected payment adapter, and atomic transfer to the
  created Booking. Expose typed payment-required continuation and recovery through
  the shared route contract, Storefront SDK, and React hooks.

### Patch Changes

- f25ad34: Add the Booking Platform v1 lifecycle commitment-policy schemas and reusable conformance scenarios.

  Implement the first owned Product Booking Session v1 tracer with exact-revision
  Quote, capability-gated public mutations, real-capacity Hold, atomic Commit
  outcome, persistent repository adapter, Storefront SDK, and React hook surfaces.

- Updated dependencies [5d3b563]
- Updated dependencies [f25ad34]
- Updated dependencies [2601445]
  - @voyant-travel/catalog-contracts@0.113.0
  - @voyant-travel/finance@0.229.0
  - @voyant-travel/storefront@0.231.0
  - @voyant-travel/bookings@0.229.0

## 0.230.0

### Patch Changes

- @voyant-travel/bookings@0.228.0
- @voyant-travel/finance@0.228.0
- @voyant-travel/storefront@0.230.0

## 0.229.0

### Patch Changes

- Updated dependencies [e65bd25]
  - @voyant-travel/bookings@0.227.0
  - @voyant-travel/finance@0.227.0
  - @voyant-travel/storefront@0.229.0

## 0.228.0

### Patch Changes

- Updated dependencies [6beffa2]
  - @voyant-travel/bookings@0.226.0
  - @voyant-travel/finance@0.226.0
  - @voyant-travel/storefront@0.228.0

## 0.227.0

### Patch Changes

- Updated dependencies [4fe6f79]
- Updated dependencies [276d44d]
- Updated dependencies [0c30250]
  - @voyant-travel/finance@0.225.0
  - @voyant-travel/storefront@0.227.0
  - @voyant-travel/bookings@0.225.0

## 0.226.0

### Patch Changes

- @voyant-travel/bookings@0.224.0
- @voyant-travel/finance@0.224.0
- @voyant-travel/storefront@0.226.0

## 0.225.1

## 0.225.0

### Patch Changes

- Updated dependencies [fae0f36]
- Updated dependencies [d02a4e8]
  - @voyant-travel/storefront@0.225.0
  - @voyant-travel/bookings@0.223.0
  - @voyant-travel/finance@0.223.0

## 0.224.0

### Patch Changes

- @voyant-travel/bookings@0.222.0
- @voyant-travel/finance@0.222.0
- @voyant-travel/storefront@0.224.0

## 0.223.1

## 0.223.0

### Patch Changes

- Updated dependencies [52c794d]
- Updated dependencies [52c794d]
- Updated dependencies [52c794d]
- Updated dependencies [52c794d]
- Updated dependencies [52c794d]
- Updated dependencies [52c794d]
- Updated dependencies [52c794d]
- Updated dependencies [52c794d]
- Updated dependencies [52c794d]
- Updated dependencies [52c794d]
- Updated dependencies [52c794d]
  - @voyant-travel/bookings@0.221.0
  - @voyant-travel/finance@0.221.0
  - @voyant-travel/storefront@0.223.0

## 0.222.0

### Patch Changes

- Updated dependencies [8adeb23]
  - @voyant-travel/bookings@0.220.0
  - @voyant-travel/finance@0.220.0
  - @voyant-travel/storefront@0.222.0

## 0.221.1

### Patch Changes

- Updated dependencies [268f341]
  - @voyant-travel/storefront@0.221.1

## 0.221.0

### Patch Changes

- @voyant-travel/storefront@0.221.0
- @voyant-travel/bookings@0.219.0
- @voyant-travel/finance@0.219.0

## 0.220.0

### Patch Changes

- Updated dependencies [a799849]
  - @voyant-travel/bookings@0.218.0
  - @voyant-travel/finance@0.218.0
  - @voyant-travel/storefront@0.220.0

## 0.219.0

### Patch Changes

- @voyant-travel/storefront@0.219.0
- @voyant-travel/bookings@0.217.0
- @voyant-travel/finance@0.217.0

## 0.218.1

### Patch Changes

- Updated dependencies [a653664]
  - @voyant-travel/bookings@0.216.2
  - @voyant-travel/storefront@0.218.1

## 0.218.0

### Patch Changes

- Updated dependencies [903c754]
  - @voyant-travel/bookings@0.216.0
  - @voyant-travel/finance@0.216.0
  - @voyant-travel/storefront@0.218.0

## 0.217.0

### Patch Changes

- @voyant-travel/finance@0.215.0
- @voyant-travel/storefront@0.217.0
- @voyant-travel/bookings@0.215.0

## 0.216.0

### Patch Changes

- @voyant-travel/bookings@0.214.0
- @voyant-travel/finance@0.214.0
- @voyant-travel/storefront@0.216.0

## 0.215.0

### Patch Changes

- @voyant-travel/storefront@0.215.0
- @voyant-travel/bookings@0.213.0
- @voyant-travel/finance@0.213.0

## 0.214.0

### Patch Changes

- @voyant-travel/bookings@0.212.0
- @voyant-travel/finance@0.212.0
- @voyant-travel/storefront@0.214.0

## 0.213.0

### Patch Changes

- @voyant-travel/bookings@0.211.0
- @voyant-travel/finance@0.211.0
- @voyant-travel/storefront@0.213.0

## 0.212.0

### Patch Changes

- @voyant-travel/bookings@0.210.0
- @voyant-travel/finance@0.210.0
- @voyant-travel/storefront@0.212.0

## 0.211.0

### Patch Changes

- @voyant-travel/storefront@0.211.0
- @voyant-travel/bookings@0.209.0
- @voyant-travel/finance@0.209.0

## 0.210.0

### Patch Changes

- @voyant-travel/bookings@0.208.0
- @voyant-travel/finance@0.208.0
- @voyant-travel/storefront@0.210.0

## 0.209.2

### Patch Changes

- Updated dependencies [560f7c3]
- Updated dependencies [560f7c3]
  - @voyant-travel/bookings@0.207.1
  - @voyant-travel/storefront@0.209.2

## 0.209.1

### Patch Changes

- Updated dependencies [accb1cf]
- Updated dependencies [accb1cf]
  - @voyant-travel/finance@0.207.1
  - @voyant-travel/storefront@0.209.1

## 0.209.0

### Patch Changes

- Updated dependencies [4979d3b]
  - @voyant-travel/bookings@0.207.0
  - @voyant-travel/finance@0.207.0
  - @voyant-travel/storefront@0.209.0

## 0.208.0

### Patch Changes

- Updated dependencies [5daf427]
  - @voyant-travel/storefront@0.208.0
  - @voyant-travel/finance@0.206.0
  - @voyant-travel/bookings@0.206.0

## 0.207.0

### Patch Changes

- Updated dependencies [58baffe]
  - @voyant-travel/finance@0.205.0
  - @voyant-travel/storefront@0.207.0
  - @voyant-travel/bookings@0.205.0

## 0.206.0

### Patch Changes

- @voyant-travel/bookings@0.204.0
- @voyant-travel/finance@0.204.0
- @voyant-travel/storefront@0.206.0

## 0.205.0

### Minor Changes

- 17f1239: Replace the inline Finance booking-create HTTP and dual-create surfaces with one
  handler-admitted, idempotent created-target Tool command. Booking rows, dependent
  finance records, the canonical action-ledger result, and domain-event outbox
  entries now settle in one transaction; exact retries resolve the original booking.

  Remove the retired booking-create React mutation, sheet, page, and slot shortcut.
  Unmount the legacy admin new/journey routes and semantic destinations, remove
  catalog and inventory booking actions, and remove the standard storefront
  `/shop/book/:entityModule/:entityId` route plus its booking page/journey exports.
  Catalog browsing, booking read/detail, customer-portal sessions, and reusable
  draft sections remain available; new booking creation is a Finance staff Tool.
  Remove raw Bookings, Charter, and Cruise creation APIs and Tools. Delete the
  dormant Catalog owned-commit contract and Inventory, Accommodations, Cruises,
  Commerce, Storefront, and Storefront SDK booking-row creation bridges rather
  than retaining unavailable legacy mutations. Require registry-minted,
  unforgeable handler admission plus a single-use Finance-specific mutation lease
  for Bookings domain settlement, and remove the Finance command's public
  subpath.

### Patch Changes

- Updated dependencies [17f1239]
  - @voyant-travel/finance@0.203.0
  - @voyant-travel/bookings@0.203.0
  - @voyant-travel/storefront@0.205.0

## 0.204.0

### Patch Changes

- @voyant-travel/bookings@0.202.0
- @voyant-travel/finance@0.202.0
- @voyant-travel/storefront@0.204.0

## 0.203.1

### Patch Changes

- Updated dependencies [a02a76b]
  - @voyant-travel/bookings@0.201.1
  - @voyant-travel/finance@0.201.1
  - @voyant-travel/storefront@0.203.1

## 0.203.0

### Patch Changes

- Updated dependencies [5e03ae7]
  - @voyant-travel/finance@0.201.0
  - @voyant-travel/storefront@0.203.0
  - @voyant-travel/bookings@0.201.0

## 0.202.0

### Patch Changes

- @voyant-travel/storefront@0.202.0
- @voyant-travel/bookings@0.200.0
- @voyant-travel/finance@0.200.0

## 0.201.0

### Patch Changes

- @voyant-travel/bookings@0.199.0
- @voyant-travel/finance@0.199.0
- @voyant-travel/storefront@0.201.0

## 0.200.1

### Patch Changes

- @voyant-travel/bookings@0.198.1
- @voyant-travel/finance@0.198.1
- @voyant-travel/storefront@0.200.1

## 0.200.0

### Patch Changes

- @voyant-travel/storefront@0.200.0
- @voyant-travel/bookings@0.198.0
- @voyant-travel/finance@0.198.0

## 0.199.0

### Patch Changes

- Updated dependencies [b07a0a3]
  - @voyant-travel/bookings@0.197.0
  - @voyant-travel/finance@0.197.0
  - @voyant-travel/storefront@0.199.0

## 0.198.0

### Patch Changes

- Updated dependencies [bba4fec]
- Updated dependencies [58020ec]
- Updated dependencies [bf548af]
- Updated dependencies [a6460e2]
- Updated dependencies
  - @voyant-travel/storefront@0.198.0
  - @voyant-travel/finance@0.196.0
  - @voyant-travel/bookings@0.196.0

## 0.197.0

### Patch Changes

- Updated dependencies [e3a1e17]
  - @voyant-travel/bookings@0.195.0
  - @voyant-travel/finance@0.195.0
  - @voyant-travel/storefront@0.197.0

## 0.196.0

### Patch Changes

- @voyant-travel/bookings@0.194.0
- @voyant-travel/finance@0.194.0
- @voyant-travel/storefront@0.196.0

## 0.195.0

### Patch Changes

- @voyant-travel/storefront@0.195.0
- @voyant-travel/bookings@0.193.0
- @voyant-travel/finance@0.193.0

## 0.194.1

### Patch Changes

- @voyant-travel/bookings@0.192.1
- @voyant-travel/finance@0.192.1
- @voyant-travel/storefront@0.194.1

## 0.194.0

### Patch Changes

- Updated dependencies [e68a705]
  - @voyant-travel/finance@0.192.0
  - @voyant-travel/storefront@0.194.0
  - @voyant-travel/bookings@0.192.0

## 0.193.0

### Patch Changes

- Updated dependencies [f6aa3a1]
  - @voyant-travel/finance@0.191.0
  - @voyant-travel/storefront@0.193.0
  - @voyant-travel/bookings@0.191.0

## 0.192.1

### Patch Changes

- Updated dependencies [bacae5e]
  - @voyant-travel/storefront@0.192.1

## 0.192.0

### Patch Changes

- Updated dependencies [228b57d]
- Updated dependencies [f2c9404]
  - @voyant-travel/bookings@0.190.0
  - @voyant-travel/finance@0.190.0
  - @voyant-travel/storefront@0.192.0

## 0.191.0

### Patch Changes

- @voyant-travel/bookings@0.189.0
- @voyant-travel/finance@0.189.0
- @voyant-travel/storefront@0.191.0

## 0.190.0

### Patch Changes

- @voyant-travel/bookings@0.188.0
- @voyant-travel/finance@0.188.0
- @voyant-travel/storefront@0.190.0

## 0.189.1

### Patch Changes

- Updated dependencies [406cebb]
  - @voyant-travel/storefront@0.189.1

## 0.189.0

### Patch Changes

- @voyant-travel/bookings@0.187.0
- @voyant-travel/finance@0.187.0
- @voyant-travel/storefront@0.189.0

## 0.188.0

### Patch Changes

- @voyant-travel/bookings@0.186.0
- @voyant-travel/finance@0.186.0
- @voyant-travel/storefront@0.188.0

## 0.187.0

### Patch Changes

- Updated dependencies [e7e90bf]
  - @voyant-travel/finance@0.185.0
  - @voyant-travel/storefront@0.187.0
  - @voyant-travel/bookings@0.185.0

## 0.186.0

### Patch Changes

- @voyant-travel/bookings@0.184.0
- @voyant-travel/finance@0.184.0
- @voyant-travel/storefront@0.186.0

## 0.185.0

### Patch Changes

- Updated dependencies [8d370ef]
  - @voyant-travel/storefront@0.185.0
  - @voyant-travel/finance@0.183.0
  - @voyant-travel/bookings@0.183.0

## 0.184.2

### Patch Changes

- @voyant-travel/bookings@0.182.2
- @voyant-travel/finance@0.182.4
- @voyant-travel/storefront@0.184.2

## 0.184.1

### Patch Changes

- @voyant-travel/bookings@0.182.1
- @voyant-travel/finance@0.182.3
- @voyant-travel/storefront@0.184.1

## 0.184.0

### Patch Changes

- @voyant-travel/storefront@0.184.0
- @voyant-travel/bookings@0.182.0
- @voyant-travel/finance@0.182.0

## 0.183.0

### Patch Changes

- Updated dependencies [464815c]
- Updated dependencies [464815c]
  - @voyant-travel/finance@0.181.0
  - @voyant-travel/bookings@0.181.0
  - @voyant-travel/storefront@0.183.0

## 0.182.1

### Patch Changes

- @voyant-travel/finance@0.180.1
- @voyant-travel/bookings@0.180.1
- @voyant-travel/storefront@0.182.1

## 0.182.0

### Minor Changes

- ecf1680: Remove the redundant singular storefront branding admin surface and make the
  organization (operator) profile the single home for org brand identity.

  Storefronts are plural (many per org, managed under the top-level "Storefronts"
  surface). The leftover singular "storefront" Settings page edited a separate
  branding blob (logo/favicon/brand mark/colors/languages) that duplicated brand
  identity already modeled on the operator profile. Per-storefront visuals are a
  developer's frontend concern, not an admin one, so the surface and its storage
  schema are dropped.

  - storefront: drop the module `admin` block (branding settings page + branding
    setup step) and remove the `branding` shape from the storefront settings
    schema, service, admin/public routes, and OpenAPI documents. No database
    migration is required — storefront branding was never persisted to a table;
    it lived only in static deployment settings.
  - storefront-react / storefront-sdk: remove `createSelectedStorefrontAdminExtension`,
    the storefront settings page/form, and the `./admin`, `./ui`, and
    `./components/storefront-settings-page` package exports. `StorefrontSettingsRecord`
    and the settings schemas no longer carry `branding`.
  - operator-settings-react / i18n / legal: rename the user-facing "Operator
    profile" label to "Organization" ("Organizație" in Romanian) across the
    settings nav, page title, saved-toast copy, and contract template-authoring
    descriptions. The API path, `operator_profile` table, ids, and query keys are
    unchanged.

### Patch Changes

- Updated dependencies [ecf1680]
  - @voyant-travel/storefront@0.182.0
  - @voyant-travel/bookings@0.180.0
  - @voyant-travel/finance@0.180.0

## 0.181.0

### Patch Changes

- @voyant-travel/storefront@0.181.0
- @voyant-travel/bookings@0.179.0
- @voyant-travel/finance@0.179.0

## 0.180.0

### Patch Changes

- @voyant-travel/bookings@0.178.0
- @voyant-travel/finance@0.178.0
- @voyant-travel/storefront@0.180.0

## 0.179.0

### Patch Changes

- @voyant-travel/bookings@0.177.0
- @voyant-travel/finance@0.177.0
- @voyant-travel/storefront@0.179.0

## 0.178.0

### Patch Changes

- Updated dependencies [abc32b6]
  - @voyant-travel/storefront@0.178.0
  - @voyant-travel/bookings@0.176.0
  - @voyant-travel/finance@0.176.0

## 0.177.0

### Patch Changes

- Updated dependencies [a160a81]
  - @voyant-travel/bookings@0.175.0
  - @voyant-travel/storefront@0.177.0
  - @voyant-travel/finance@0.175.0

## 0.176.0

### Patch Changes

- Updated dependencies [b8b25b7]
  - @voyant-travel/bookings@0.174.0
  - @voyant-travel/finance@0.174.0
  - @voyant-travel/storefront@0.176.0

## 0.175.0

### Patch Changes

- @voyant-travel/bookings@0.173.0
- @voyant-travel/finance@0.173.0
- @voyant-travel/storefront@0.175.0

## 0.174.0

### Patch Changes

- Updated dependencies [f6f22e7]
  - @voyant-travel/bookings@0.172.0
  - @voyant-travel/finance@0.172.0
  - @voyant-travel/storefront@0.174.0

## 0.173.1

### Patch Changes

- @voyant-travel/bookings@0.171.1
- @voyant-travel/finance@0.171.1
- @voyant-travel/storefront@0.173.1

## 0.173.0

### Patch Changes

- Updated dependencies [d2d7384]
  - @voyant-travel/finance@0.171.0
  - @voyant-travel/storefront@0.173.0
  - @voyant-travel/bookings@0.171.0

## 0.172.0

### Patch Changes

- @voyant-travel/bookings@0.170.0
- @voyant-travel/finance@0.170.0
- @voyant-travel/storefront@0.172.0

## 0.171.2

### Patch Changes

- Updated dependencies [07334a7]
  - @voyant-travel/storefront@0.171.2

## 0.171.1

### Patch Changes

- @voyant-travel/bookings@0.169.1
- @voyant-travel/finance@0.169.2
- @voyant-travel/storefront@0.171.1

## 0.171.0

### Patch Changes

- Updated dependencies [590d256]
  - @voyant-travel/finance@0.169.0
  - @voyant-travel/bookings@0.169.0
  - @voyant-travel/storefront@0.171.0

## 0.170.0

### Patch Changes

- Updated dependencies [158c3a0]
  - @voyant-travel/finance@0.168.0
  - @voyant-travel/storefront@0.170.0
  - @voyant-travel/bookings@0.168.0

## 0.169.0

### Patch Changes

- Updated dependencies [ca3713e]
  - @voyant-travel/finance@0.167.0
  - @voyant-travel/storefront@0.169.0
  - @voyant-travel/bookings@0.167.0

## 0.168.0

### Patch Changes

- Updated dependencies [c3bdcbc]
- Updated dependencies [3062a73]
- Updated dependencies [926ea47]
  - @voyant-travel/finance@0.166.0
  - @voyant-travel/storefront@0.168.0
  - @voyant-travel/bookings@0.166.0

## 0.167.0

### Patch Changes

- Updated dependencies [d6a9973]
  - @voyant-travel/finance@0.165.0
  - @voyant-travel/storefront@0.167.0
  - @voyant-travel/bookings@0.165.0

## 0.166.0

### Patch Changes

- @voyant-travel/bookings@0.164.0
- @voyant-travel/finance@0.164.0
- @voyant-travel/storefront@0.166.0

## 0.165.0

### Patch Changes

- Updated dependencies [52352c4]
- Updated dependencies [52352c4]
- Updated dependencies [52352c4]
- Updated dependencies [52352c4]
- Updated dependencies [52352c4]
  - @voyant-travel/bookings@0.163.0
  - @voyant-travel/finance@0.163.0
  - @voyant-travel/storefront@0.165.0

## 0.164.0

### Patch Changes

- Updated dependencies [8f0fa26]
  - @voyant-travel/bookings@0.162.0
  - @voyant-travel/finance@0.162.0
  - @voyant-travel/storefront@0.164.0

## 0.163.0

### Patch Changes

- Updated dependencies [85bfe2c]
  - @voyant-travel/finance@0.161.0
  - @voyant-travel/bookings@0.161.0
  - @voyant-travel/storefront@0.163.0

## 0.162.0

### Patch Changes

- Updated dependencies [701ccc4]
- Updated dependencies [5f15e2e]
- Updated dependencies [372f4f4]
- Updated dependencies [a2fd806]
- Updated dependencies [db5adce]
- Updated dependencies [eae32f8]
- Updated dependencies [6604f9e]
  - @voyant-travel/bookings@0.160.0
  - @voyant-travel/finance@0.160.0
  - @voyant-travel/storefront@0.162.0

## 0.161.0

### Patch Changes

- Updated dependencies [49f55d0]
- Updated dependencies [82ffd12]
- Updated dependencies [552acbf]
- Updated dependencies [9c85101]
  - @voyant-travel/bookings@0.159.0
  - @voyant-travel/finance@0.159.0
  - @voyant-travel/storefront@0.161.0

## 0.160.0

### Patch Changes

- Updated dependencies [73ab096]
  - @voyant-travel/bookings@0.158.0
  - @voyant-travel/finance@0.158.0
  - @voyant-travel/storefront@0.160.0

## 0.159.0

### Patch Changes

- @voyant-travel/bookings@0.157.0
- @voyant-travel/finance@0.157.0
- @voyant-travel/storefront@0.159.0

## 0.158.1

### Patch Changes

- 8d62a7c: Republish every affected TypeScript package without broken declaration maps so the corrected artifact
  policy reaches npm instead of applying only to future incidental package releases.
- Updated dependencies [8d62a7c]
  - @voyant-travel/bookings@0.156.1
  - @voyant-travel/finance@0.156.1
  - @voyant-travel/storefront@0.158.1

## 0.158.0

### Patch Changes

- Updated dependencies [bbe6396]
  - @voyant-travel/finance@0.156.0
  - @voyant-travel/bookings@0.156.0
  - @voyant-travel/storefront@0.158.0

## 0.157.2

### Patch Changes

- Updated dependencies [d83d237]
  - @voyant-travel/bookings@0.155.2
  - @voyant-travel/finance@0.155.2
  - @voyant-travel/storefront@0.157.2

## 0.157.1

### Patch Changes

- Updated dependencies [cc85042]
  - @voyant-travel/bookings@0.155.1
  - @voyant-travel/finance@0.155.1
  - @voyant-travel/storefront@0.157.1

## 0.157.0

### Patch Changes

- Updated dependencies [3f6694b]
  - @voyant-travel/storefront@0.157.0
  - @voyant-travel/bookings@0.155.0
  - @voyant-travel/finance@0.155.0

## 0.156.0

### Patch Changes

- Updated dependencies [4d0eeed]
  - @voyant-travel/finance@0.154.0
  - @voyant-travel/bookings@0.154.0
  - @voyant-travel/storefront@0.156.0

## 0.155.0

### Patch Changes

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
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
  - @voyant-travel/bookings@0.153.0
  - @voyant-travel/finance@0.153.0
  - @voyant-travel/storefront@0.155.0

## 0.154.0

### Patch Changes

- Updated dependencies [60b1970]
- Updated dependencies [977c1bd]
- Updated dependencies [8f4c242]
- Updated dependencies [d771be3]
- Updated dependencies [263fb4d]
  - @voyant-travel/finance@0.152.0
  - @voyant-travel/storefront@0.154.0
  - @voyant-travel/bookings@0.152.0

## 0.153.4

### Patch Changes

- Updated dependencies [e5aa097]
- Updated dependencies [01d5034]
- Updated dependencies [1081483]
  - @voyant-travel/bookings@0.151.5
  - @voyant-travel/finance@0.151.4
  - @voyant-travel/storefront@0.153.4

## 0.153.3

### Patch Changes

- @voyant-travel/bookings@0.151.4
- @voyant-travel/finance@0.151.3
- @voyant-travel/storefront@0.153.3

## 0.153.2

### Patch Changes

- @voyant-travel/bookings@0.151.3
- @voyant-travel/finance@0.151.2
- @voyant-travel/storefront@0.153.2

## 0.153.1

### Patch Changes

- Updated dependencies [e4e6621]
  - @voyant-travel/bookings@0.151.1
  - @voyant-travel/finance@0.151.1
  - @voyant-travel/storefront@0.153.1

## 0.153.0

### Patch Changes

- Updated dependencies [a370024]
- Updated dependencies [e3dc5a9]
- Updated dependencies [a370024]
- Updated dependencies [a370024]
- Updated dependencies [e3dc5a9]
- Updated dependencies [a370024]
- Updated dependencies [a370024]
- Updated dependencies [a370024]
- Updated dependencies [e3dc5a9]
- Updated dependencies [e3dc5a9]
- Updated dependencies [e3dc5a9]
  - @voyant-travel/storefront@0.153.0
  - @voyant-travel/finance@0.151.0
  - @voyant-travel/bookings@0.151.0

## 0.152.0

### Patch Changes

- Updated dependencies [496f2ef]
  - @voyant-travel/bookings@0.150.0
  - @voyant-travel/finance@0.150.0
  - @voyant-travel/storefront@0.152.0

## 0.151.1

### Patch Changes

- Updated dependencies [5e1d221]
  - @voyant-travel/bookings@0.149.1
  - @voyant-travel/finance@0.149.1
  - @voyant-travel/storefront@0.151.1

## 0.151.0

### Patch Changes

- @voyant-travel/bookings@0.149.0
- @voyant-travel/finance@0.149.0
- @voyant-travel/storefront@0.151.0

## 0.150.0

### Patch Changes

- @voyant-travel/bookings@0.148.0
- @voyant-travel/finance@0.148.0
- @voyant-travel/storefront@0.150.0

## 0.149.0

### Patch Changes

- @voyant-travel/bookings@0.147.0
- @voyant-travel/finance@0.147.0
- @voyant-travel/storefront@0.149.0

## 0.148.0

### Patch Changes

- @voyant-travel/bookings@0.146.0
- @voyant-travel/finance@0.146.0
- @voyant-travel/storefront@0.148.0

## 0.147.0

### Patch Changes

- @voyant-travel/bookings@0.145.0
- @voyant-travel/finance@0.145.0
- @voyant-travel/storefront@0.147.0

## 0.146.0

### Patch Changes

- Updated dependencies [ba6c30a]
  - @voyant-travel/bookings@0.144.0
  - @voyant-travel/finance@0.144.0
  - @voyant-travel/storefront@0.146.0

## 0.145.0

### Patch Changes

- @voyant-travel/bookings@0.143.0
- @voyant-travel/finance@0.143.0
- @voyant-travel/storefront@0.145.0

## 0.144.0

### Patch Changes

- @voyant-travel/storefront@0.144.0
- @voyant-travel/bookings@0.142.0
- @voyant-travel/finance@0.142.0

## 0.143.0

### Patch Changes

- @voyant-travel/bookings@0.141.0
- @voyant-travel/finance@0.141.0
- @voyant-travel/storefront@0.143.0

## 0.142.0

### Patch Changes

- @voyant-travel/storefront@0.142.0
- @voyant-travel/bookings@0.140.0
- @voyant-travel/finance@0.140.0

## 0.141.2

### Patch Changes

- ec207bd: Resolve localized public departure itinerary reads by accepting `languageTag`/`lang`
  query parameters, applying day and segment translations with base-content fallback,
  and exposing the query through first-party storefront clients.
- Updated dependencies [ec207bd]
  - @voyant-travel/storefront@0.141.2

## 0.141.1

### Patch Changes

- Updated dependencies [ecff8cf]
  - @voyant-travel/bookings@0.139.2
  - @voyant-travel/storefront@0.141.1

## 0.141.0

### Patch Changes

- Updated dependencies [fc71db1]
- Updated dependencies [fc71db1]
- Updated dependencies [52c52fc]
  - @voyant-travel/bookings@0.139.0
  - @voyant-travel/finance@0.139.0
  - @voyant-travel/storefront@0.141.0

## 0.140.2

### Patch Changes

- @voyant-travel/bookings@0.138.6
- @voyant-travel/finance@0.138.8
- @voyant-travel/storefront@0.140.2

## 0.140.1

### Patch Changes

- Updated dependencies [b254511]
- Updated dependencies [141bd2b]
  - @voyant-travel/bookings@0.138.5
  - @voyant-travel/finance@0.138.7
  - @voyant-travel/storefront@0.140.1

## 0.140.0

### Patch Changes

- @voyant-travel/bookings@0.138.0
- @voyant-travel/finance@0.138.0
- @voyant-travel/storefront@0.140.0

## 0.139.5

### Patch Changes

- @voyant-travel/storefront@0.139.5

## 0.139.4

### Patch Changes

- @voyant-travel/bookings@0.137.6
- @voyant-travel/storefront@0.139.4

## 0.139.3

### Patch Changes

- @voyant-travel/storefront@0.139.3

## 0.139.2

### Patch Changes

- Updated dependencies [ce0f92d]
  - @voyant-travel/storefront@0.139.2
  - @voyant-travel/finance@0.137.7

## 0.139.1

### Patch Changes

- Updated dependencies [9a1197b]
  - @voyant-travel/storefront@0.139.1
  - @voyant-travel/finance@0.137.1
  - @voyant-travel/bookings@0.137.1

## 0.139.0

### Patch Changes

- @voyant-travel/bookings@0.137.0
- @voyant-travel/finance@0.137.0
- @voyant-travel/storefront@0.139.0

## 0.138.0

### Patch Changes

- @voyant-travel/storefront@0.138.0
- @voyant-travel/bookings@0.136.0
- @voyant-travel/finance@0.136.0

## 0.137.0

### Patch Changes

- @voyant-travel/storefront@0.137.0
- @voyant-travel/bookings@0.135.0
- @voyant-travel/finance@0.135.0

## 0.136.1

### Patch Changes

- @voyant-travel/bookings@0.134.1
- @voyant-travel/finance@0.134.1
- @voyant-travel/storefront@0.136.1

## 0.136.0

### Patch Changes

- Updated dependencies [51f7dea]
  - @voyant-travel/bookings@0.134.0
  - @voyant-travel/finance@0.134.0
  - @voyant-travel/storefront@0.136.0

## 0.135.0

### Patch Changes

- Updated dependencies [4abf9a2]
  - @voyant-travel/bookings@0.133.0
  - @voyant-travel/finance@0.133.0
  - @voyant-travel/storefront@0.135.0

## 0.134.0

### Patch Changes

- @voyant-travel/bookings@0.132.0
- @voyant-travel/finance@0.132.0
- @voyant-travel/storefront@0.134.0

## 0.133.1

### Patch Changes

- @voyant-travel/bookings@0.131.1
- @voyant-travel/finance@0.131.2
- @voyant-travel/storefront@0.133.1

## 0.133.0

### Patch Changes

- @voyant-travel/bookings@0.131.0
- @voyant-travel/finance@0.131.0
- @voyant-travel/storefront@0.133.0

## 0.132.0

### Patch Changes

- @voyant-travel/bookings@0.130.0
- @voyant-travel/finance@0.130.0
- @voyant-travel/storefront@0.132.0

## 0.131.1

### Patch Changes

- Updated dependencies [733bf33]
  - @voyant-travel/storefront@0.131.1

## 0.131.0

### Patch Changes

- @voyant-travel/bookings@0.129.0
- @voyant-travel/finance@0.129.0
- @voyant-travel/storefront@0.131.0

## 0.130.0

### Patch Changes

- Updated dependencies [63e99ca]
  - @voyant-travel/storefront@0.130.0

## 0.129.0

### Patch Changes

- @voyant-travel/storefront@0.129.0
- @voyant-travel/bookings@0.128.0
- @voyant-travel/finance@0.128.0

## 0.128.0

### Patch Changes

- Updated dependencies [435a5d1]
  - @voyant-travel/bookings@0.127.0
  - @voyant-travel/storefront@0.128.0
  - @voyant-travel/finance@0.127.0

## 0.127.1

### Patch Changes

- Updated dependencies [1841ce2]
  - @voyant-travel/finance@0.126.1
  - @voyant-travel/storefront@0.127.1

## 0.127.0

### Patch Changes

- @voyant-travel/storefront@0.127.0
- @voyant-travel/bookings@0.126.0
- @voyant-travel/finance@0.126.0

## 0.126.0

### Patch Changes

- @voyant-travel/storefront@0.126.0
- @voyant-travel/bookings@0.125.0
- @voyant-travel/finance@0.125.0

## 0.125.0

### Patch Changes

- @voyant-travel/bookings@0.124.0
- @voyant-travel/finance@0.124.0
- @voyant-travel/storefront@0.125.0

## 0.124.0

### Patch Changes

- Updated dependencies [04681f3]
- Updated dependencies [e9d9dbb]
- Updated dependencies [39d48fe]
  - @voyant-travel/bookings@0.123.0
  - @voyant-travel/finance@0.123.0
  - @voyant-travel/storefront@0.124.0

## 0.123.1

### Patch Changes

- Updated dependencies [832ac35]
  - @voyant-travel/bookings@0.122.1
  - @voyant-travel/storefront@0.123.1

## 0.123.0

### Patch Changes

- Updated dependencies [c9de9c4]
- Updated dependencies [14f4234]
- Updated dependencies [89d4ca9]
- Updated dependencies [51dd276]
  - @voyant-travel/finance@0.122.0
  - @voyant-travel/storefront@0.123.0
  - @voyant-travel/bookings@0.122.0

## 0.122.0

### Patch Changes

- Updated dependencies [13fe70b]
- Updated dependencies [13fe70b]
  - @voyant-travel/finance@0.121.0
  - @voyant-travel/storefront@0.122.0
  - @voyant-travel/bookings@0.121.0

## 0.121.2

### Patch Changes

- Updated dependencies [756213e]
  - @voyant-travel/bookings@0.120.2
  - @voyant-travel/storefront@0.121.2

## 0.121.1

### Patch Changes

- @voyant-travel/bookings@0.120.1
- @voyant-travel/finance@0.120.1
- @voyant-travel/storefront@0.121.1

## 0.121.0

### Patch Changes

- 9e970a5: Move checkout collection orchestration and React payment collection surfaces
  behind Finance owner paths. The old Checkout workspace packages are removed
  from the v1 branch while payment plugins, storefront SDK helpers, and the
  operator starter retarget Finance checkout interfaces.
- Updated dependencies [2f1228a]
- Updated dependencies [efc803c]
- Updated dependencies [d92d1a8]
- Updated dependencies [6bff46f]
- Updated dependencies [3cc83b6]
- Updated dependencies [0fa993c]
- Updated dependencies [9e970a5]
- Updated dependencies [b711b04]
- Updated dependencies [44c3875]
- Updated dependencies [23fc4bd]
- Updated dependencies [47fef18]
- Updated dependencies [2c9c4a4]
- Updated dependencies [c8189fc]
- Updated dependencies [f916094]
- Updated dependencies [6196b3b]
- Updated dependencies [e80e3d3]
  - @voyant-travel/bookings@0.120.0
  - @voyant-travel/storefront@0.121.0
  - @voyant-travel/finance@0.120.0

## 0.120.1

### Patch Changes

- Updated dependencies [f71eddf]
  - @voyant-travel/storefront@0.120.1

## 0.120.0

### Patch Changes

- Updated dependencies [f25e790]
  - @voyant-travel/storefront@0.120.0
  - @voyant-travel/bookings@0.119.1

## 0.119.0

### Patch Changes

- @voyant-travel/bookings@0.119.0
- @voyant-travel/checkout@0.119.0
- @voyant-travel/storefront@0.119.0

## 0.118.0

### Patch Changes

- Updated dependencies [004fc38]
  - @voyant-travel/storefront@0.118.0
  - @voyant-travel/bookings@0.118.0
  - @voyant-travel/checkout@0.118.0

## 0.117.1

### Patch Changes

- Updated dependencies [b7056f1]
- Updated dependencies [b7056f1]
- Updated dependencies [b7056f1]
  - @voyant-travel/bookings@0.117.1
  - @voyant-travel/checkout@0.117.1
  - @voyant-travel/storefront@0.117.1

## 0.117.0

### Patch Changes

- Updated dependencies [7255353]
  - @voyant-travel/bookings@0.117.0
  - @voyant-travel/checkout@0.117.0
  - @voyant-travel/storefront@0.117.0

## 0.116.0

### Patch Changes

- Updated dependencies [418fa82]
  - @voyant-travel/storefront@0.116.0
  - @voyant-travel/bookings@0.116.0
  - @voyant-travel/checkout@0.116.0

## 0.115.0

### Patch Changes

- @voyant-travel/bookings@0.115.0
- @voyant-travel/checkout@0.115.0
- @voyant-travel/storefront@0.115.0

## 0.114.0

### Patch Changes

- @voyant-travel/bookings@0.114.0
- @voyant-travel/checkout@0.114.0
- @voyant-travel/storefront@0.114.0

## 0.113.0

### Patch Changes

- @voyant-travel/bookings@0.113.0
- @voyant-travel/checkout@0.113.0
- @voyant-travel/storefront@0.113.0

## 0.112.0

### Patch Changes

- @voyant-travel/bookings@0.112.0
- @voyant-travel/checkout@0.112.0
- @voyant-travel/storefront@0.112.0

## 0.111.0

### Patch Changes

- @voyant-travel/bookings@0.111.0
- @voyant-travel/checkout@0.111.0
- @voyant-travel/storefront@0.111.0

## 0.110.0

### Patch Changes

- @voyant-travel/bookings@0.110.0
- @voyant-travel/checkout@0.110.0
- @voyant-travel/storefront@0.110.0

## 0.109.0

### Patch Changes

- @voyant-travel/bookings@0.109.0
- @voyant-travel/checkout@0.109.0
- @voyant-travel/storefront@0.109.0

## 0.108.0

### Patch Changes

- @voyant-travel/bookings@0.108.0
- @voyant-travel/storefront@0.108.0
- @voyant-travel/checkout@0.108.0

## 0.107.1

### Patch Changes

- @voyant-travel/bookings@0.107.1
- @voyant-travel/checkout@0.107.1
- @voyant-travel/storefront@0.107.1

## 0.107.0

### Patch Changes

- @voyant-travel/storefront@0.107.0
- @voyant-travel/bookings@0.107.0
- @voyant-travel/checkout@0.107.0

## 0.106.0

### Patch Changes

- @voyant-travel/storefront@0.106.0
- @voyant-travel/bookings@0.106.0
- @voyant-travel/checkout@0.106.0

## 0.105.0

### Patch Changes

- @voyant-travel/bookings@0.105.0
- @voyant-travel/storefront@0.105.0
- @voyant-travel/checkout@0.105.0

## 0.104.1

### Patch Changes

- @voyant-travel/bookings@0.104.1
- @voyant-travel/checkout@0.104.1
- @voyant-travel/storefront@0.104.1

## 0.104.0

### Patch Changes

- @voyant-travel/bookings@0.104.0
- @voyant-travel/checkout@0.104.0
- @voyant-travel/storefront@0.104.0

## 0.103.0

### Patch Changes

- @voyant-travel/bookings@0.103.0
- @voyant-travel/checkout@0.103.0
- @voyant-travel/storefront@0.103.0

## 0.102.0

### Patch Changes

- @voyant-travel/bookings@0.102.0
- @voyant-travel/checkout@0.102.0
- @voyant-travel/storefront@0.102.0

## 0.101.2

### Patch Changes

- @voyant-travel/bookings@0.101.2
- @voyant-travel/checkout@0.101.2
- @voyant-travel/storefront@0.101.2

## 0.101.1

### Patch Changes

- Updated dependencies [f736ba5]
  - @voyant-travel/bookings@0.101.1
  - @voyant-travel/checkout@0.101.1
  - @voyant-travel/storefront@0.101.1

## 0.101.0

### Patch Changes

- @voyant-travel/bookings@0.101.0
- @voyant-travel/checkout@0.101.0
- @voyant-travel/storefront@0.101.0

## 0.100.0

### Patch Changes

- @voyant-travel/bookings@0.100.0
- @voyant-travel/checkout@0.100.0
- @voyant-travel/storefront@0.100.0

## 0.99.0

### Patch Changes

- @voyant-travel/bookings@0.99.0
- @voyant-travel/checkout@0.99.0
- @voyant-travel/storefront@0.99.0

## 0.98.0

### Patch Changes

- @voyant-travel/bookings@0.98.0
- @voyant-travel/checkout@0.98.0
- @voyant-travel/storefront@0.98.0

## 0.97.0

### Patch Changes

- @voyant-travel/bookings@0.97.0
- @voyant-travel/checkout@0.97.0
- @voyant-travel/storefront@0.97.0

## 0.96.0

### Patch Changes

- @voyant-travel/bookings@0.96.0
- @voyant-travel/checkout@0.96.0
- @voyant-travel/storefront@0.96.0

## 0.95.0

### Patch Changes

- @voyant-travel/bookings@0.95.0
- @voyant-travel/checkout@0.95.0
- @voyant-travel/storefront@0.95.0

## 0.94.0

### Patch Changes

- @voyant-travel/bookings@0.94.0
- @voyant-travel/checkout@0.94.0
- @voyant-travel/storefront@0.94.0

## 0.93.0

### Patch Changes

- @voyant-travel/bookings@0.93.0
- @voyant-travel/checkout@0.93.0
- @voyant-travel/storefront@0.93.0

## 0.92.0

### Patch Changes

- Updated dependencies [5de3d72]
  - @voyant-travel/bookings@0.92.0
  - @voyant-travel/checkout@0.92.0
  - @voyant-travel/storefront@0.92.0

## 0.91.0

### Patch Changes

- @voyant-travel/bookings@0.91.0
- @voyant-travel/checkout@0.91.0
- @voyant-travel/storefront@0.91.0

## 0.90.0

### Patch Changes

- @voyant-travel/bookings@0.90.0
- @voyant-travel/checkout@0.90.0
- @voyant-travel/storefront@0.90.0

## 0.89.0

### Patch Changes

- @voyant-travel/bookings@0.89.0
- @voyant-travel/checkout@0.89.0
- @voyant-travel/storefront@0.89.0

## 0.88.0

### Patch Changes

- @voyant-travel/bookings@0.88.0
- @voyant-travel/checkout@0.88.0
- @voyant-travel/storefront@0.88.0

## 0.87.1

### Patch Changes

- @voyant-travel/bookings@0.87.1
- @voyant-travel/checkout@0.87.1
- @voyant-travel/storefront@0.87.1

## 0.87.0

### Patch Changes

- @voyant-travel/bookings@0.87.0
- @voyant-travel/checkout@0.87.0
- @voyant-travel/storefront@0.87.0

## 0.86.0

### Patch Changes

- @voyant-travel/bookings@0.86.0
- @voyant-travel/checkout@0.86.0
- @voyant-travel/storefront@0.86.0

## 0.85.4

### Patch Changes

- @voyant-travel/bookings@0.85.4
- @voyant-travel/checkout@0.85.4
- @voyant-travel/storefront@0.85.4

## 0.85.3

### Patch Changes

- @voyant-travel/bookings@0.85.3
- @voyant-travel/checkout@0.85.3
- @voyant-travel/storefront@0.85.3

## 0.85.2

### Patch Changes

- Updated dependencies [2aac1f9]
  - @voyant-travel/bookings@0.85.2
  - @voyant-travel/checkout@0.85.2
  - @voyant-travel/storefront@0.85.2

## 0.85.1

### Patch Changes

- @voyant-travel/bookings@0.85.1
- @voyant-travel/checkout@0.85.1
- @voyant-travel/storefront@0.85.1

## 0.85.0

### Patch Changes

- @voyant-travel/bookings@0.85.0
- @voyant-travel/checkout@0.85.0
- @voyant-travel/storefront@0.85.0

## 0.84.4

### Patch Changes

- @voyant-travel/bookings@0.84.4
- @voyant-travel/checkout@0.84.4
- @voyant-travel/storefront@0.84.4

## 0.84.3

### Patch Changes

- Updated dependencies [9eadf50]
  - @voyant-travel/bookings@0.84.3
  - @voyant-travel/checkout@0.84.3
  - @voyant-travel/storefront@0.84.3

## 0.84.2

### Patch Changes

- @voyant-travel/bookings@0.84.2
- @voyant-travel/checkout@0.84.2
- @voyant-travel/storefront@0.84.2

## 0.84.1

### Patch Changes

- @voyant-travel/bookings@0.84.1
- @voyant-travel/checkout@0.84.1
- @voyant-travel/storefront@0.84.1

## 0.84.0

### Patch Changes

- @voyant-travel/bookings@0.84.0
- @voyant-travel/checkout@0.84.0
- @voyant-travel/storefront@0.84.0

## 0.83.1

### Patch Changes

- @voyant-travel/bookings@0.83.1
- @voyant-travel/checkout@0.83.1
- @voyant-travel/storefront@0.83.1

## 0.83.0

### Patch Changes

- @voyant-travel/bookings@0.83.0
- @voyant-travel/checkout@0.83.0
- @voyant-travel/storefront@0.83.0

## 0.82.1

### Patch Changes

- @voyant-travel/bookings@0.82.1
- @voyant-travel/checkout@0.82.1
- @voyant-travel/storefront@0.82.1

## 0.82.0

### Patch Changes

- @voyant-travel/bookings@0.82.0
- @voyant-travel/checkout@0.82.0
- @voyant-travel/storefront@0.82.0

## 0.81.21

### Patch Changes

- Updated dependencies [b9fb5b0]
  - @voyant-travel/bookings@0.81.21
  - @voyant-travel/checkout@0.81.21
  - @voyant-travel/storefront@0.81.21

## 0.81.20

### Patch Changes

- Updated dependencies [e60a50d]
  - @voyant-travel/bookings@0.81.20
  - @voyant-travel/checkout@0.81.20
  - @voyant-travel/storefront@0.81.20

## 0.81.19

### Patch Changes

- Updated dependencies [62e4be5]
  - @voyant-travel/bookings@0.81.19
  - @voyant-travel/checkout@0.81.19
  - @voyant-travel/storefront@0.81.19

## 0.81.18

### Patch Changes

- @voyant-travel/bookings@0.81.18
- @voyant-travel/checkout@0.81.18
- @voyant-travel/storefront@0.81.18

## 0.81.17

### Patch Changes

- @voyant-travel/bookings@0.81.17
- @voyant-travel/checkout@0.81.17
- @voyant-travel/storefront@0.81.17

## 0.81.16

### Patch Changes

- Updated dependencies [0a617cc]
  - @voyant-travel/bookings@0.81.16
  - @voyant-travel/checkout@0.81.16
  - @voyant-travel/storefront@0.81.16

## 0.81.15

### Patch Changes

- @voyant-travel/bookings@0.81.15
- @voyant-travel/checkout@0.81.15
- @voyant-travel/storefront@0.81.15

## 0.81.14

### Patch Changes

- @voyant-travel/bookings@0.81.14
- @voyant-travel/checkout@0.81.14
- @voyant-travel/storefront@0.81.14

## 0.81.13

### Patch Changes

- Updated dependencies [28dca55]
  - @voyant-travel/bookings@0.81.13
  - @voyant-travel/checkout@0.81.13
  - @voyant-travel/storefront@0.81.13

## 0.81.12

### Patch Changes

- @voyant-travel/bookings@0.81.12
- @voyant-travel/checkout@0.81.12
- @voyant-travel/storefront@0.81.12

## 0.81.11

### Patch Changes

- @voyant-travel/bookings@0.81.11
- @voyant-travel/checkout@0.81.11
- @voyant-travel/storefront@0.81.11

## 0.81.10

### Patch Changes

- @voyant-travel/bookings@0.81.10
- @voyant-travel/checkout@0.81.10
- @voyant-travel/storefront@0.81.10

## 0.81.9

### Patch Changes

- Updated dependencies [1a58939]
  - @voyant-travel/bookings@0.81.9
  - @voyant-travel/checkout@0.81.9
  - @voyant-travel/storefront@0.81.9

## 0.81.8

### Patch Changes

- Updated dependencies [688ac4f]
  - @voyant-travel/bookings@0.81.8
  - @voyant-travel/checkout@0.81.8
  - @voyant-travel/storefront@0.81.8

## 0.81.7

### Patch Changes

- Updated dependencies [410cd17]
  - @voyant-travel/bookings@0.81.7
  - @voyant-travel/checkout@0.81.7
  - @voyant-travel/storefront@0.81.7

## 0.81.6

### Patch Changes

- @voyant-travel/bookings@0.81.6
- @voyant-travel/checkout@0.81.6
- @voyant-travel/storefront@0.81.6

## 0.81.5

### Patch Changes

- @voyant-travel/bookings@0.81.5
- @voyant-travel/checkout@0.81.5
- @voyant-travel/storefront@0.81.5

## 0.81.4

### Patch Changes

- Updated dependencies [6daefc4]
  - @voyant-travel/bookings@0.81.4
  - @voyant-travel/checkout@0.81.4
  - @voyant-travel/storefront@0.81.4

## 0.81.3

### Patch Changes

- Updated dependencies [f157bcd]
  - @voyant-travel/bookings@0.81.3
  - @voyant-travel/checkout@0.81.3
  - @voyant-travel/storefront@0.81.3

## 0.81.2

### Patch Changes

- @voyant-travel/bookings@0.81.2
- @voyant-travel/checkout@0.81.2
- @voyant-travel/storefront@0.81.2

## 0.81.1

### Patch Changes

- @voyant-travel/bookings@0.81.1
- @voyant-travel/checkout@0.81.1
- @voyant-travel/storefront@0.81.1

## 0.81.0

### Patch Changes

- Updated dependencies [f35e63c]
  - @voyant-travel/bookings@0.81.0
  - @voyant-travel/checkout@0.81.0
  - @voyant-travel/storefront@0.81.0

## 0.80.18

### Patch Changes

- @voyant-travel/bookings@0.80.18
- @voyant-travel/checkout@0.80.18
- @voyant-travel/storefront@0.80.18

## 0.80.17

### Patch Changes

- @voyant-travel/bookings@0.80.17
- @voyant-travel/checkout@0.80.17
- @voyant-travel/storefront@0.80.17

## 0.80.16

### Patch Changes

- @voyant-travel/bookings@0.80.16
- @voyant-travel/checkout@0.80.16
- @voyant-travel/storefront@0.80.16

## 0.80.15

### Patch Changes

- Updated dependencies [0d8d14e]
  - @voyant-travel/bookings@0.80.15
  - @voyant-travel/checkout@0.80.15
  - @voyant-travel/storefront@0.80.15

## 0.80.14

### Patch Changes

- @voyant-travel/bookings@0.80.14
- @voyant-travel/checkout@0.80.14
- @voyant-travel/storefront@0.80.14

## 0.80.13

### Patch Changes

- @voyant-travel/bookings@0.80.13
- @voyant-travel/checkout@0.80.13
- @voyant-travel/storefront@0.80.13

## 0.80.12

### Patch Changes

- @voyant-travel/bookings@0.80.12
- @voyant-travel/checkout@0.80.12
- @voyant-travel/storefront@0.80.12

## 0.80.11

### Patch Changes

- @voyant-travel/bookings@0.80.11
- @voyant-travel/checkout@0.80.11
- @voyant-travel/storefront@0.80.11

## 0.80.10

### Patch Changes

- @voyant-travel/bookings@0.80.10
- @voyant-travel/checkout@0.80.10
- @voyant-travel/storefront@0.80.10

## 0.80.9

### Patch Changes

- Updated dependencies [37aa8b6]
  - @voyant-travel/bookings@0.80.9
  - @voyant-travel/checkout@0.80.9
  - @voyant-travel/storefront@0.80.9

## 0.80.8

### Patch Changes

- @voyant-travel/bookings@0.80.8
- @voyant-travel/checkout@0.80.8
- @voyant-travel/storefront@0.80.8

## 0.80.7

### Patch Changes

- @voyant-travel/bookings@0.80.7
- @voyant-travel/checkout@0.80.7
- @voyant-travel/storefront@0.80.7

## 0.80.6

### Patch Changes

- @voyant-travel/bookings@0.80.6
- @voyant-travel/checkout@0.80.6
- @voyant-travel/storefront@0.80.6

## 0.80.5

### Patch Changes

- @voyant-travel/bookings@0.80.5
- @voyant-travel/checkout@0.80.5
- @voyant-travel/storefront@0.80.5

## 0.80.4

### Patch Changes

- @voyant-travel/bookings@0.80.4
- @voyant-travel/checkout@0.80.4
- @voyant-travel/storefront@0.80.4

## 0.80.3

### Patch Changes

- @voyant-travel/bookings@0.80.3
- @voyant-travel/checkout@0.80.3
- @voyant-travel/storefront@0.80.3

## 0.80.2

### Patch Changes

- Updated dependencies [7a94871]
- Updated dependencies [9d6be13]
  - @voyant-travel/bookings@0.80.2
  - @voyant-travel/checkout@0.80.2
  - @voyant-travel/storefront@0.80.2

## 0.80.1

### Patch Changes

- @voyant-travel/bookings@0.80.1
- @voyant-travel/checkout@0.80.1
- @voyant-travel/storefront@0.80.1

## 0.80.0

### Patch Changes

- @voyant-travel/bookings@0.80.0
- @voyant-travel/checkout@0.80.0
- @voyant-travel/storefront@0.80.0

## 0.79.0

### Patch Changes

- @voyant-travel/bookings@0.79.0
- @voyant-travel/checkout@0.79.0
- @voyant-travel/storefront@0.79.0

## 0.78.0

### Patch Changes

- @voyant-travel/bookings@0.78.0
- @voyant-travel/checkout@0.78.0
- @voyant-travel/storefront@0.78.0

## 0.77.13

### Patch Changes

- @voyant-travel/bookings@0.77.13
- @voyant-travel/checkout@0.77.13
- @voyant-travel/storefront@0.77.13

## 0.77.12

### Patch Changes

- Updated dependencies [bf74cd4]
  - @voyant-travel/bookings@0.77.12
  - @voyant-travel/checkout@0.77.12
  - @voyant-travel/storefront@0.77.12

## 0.77.11

### Patch Changes

- @voyant-travel/bookings@0.77.11
- @voyant-travel/checkout@0.77.11
- @voyant-travel/storefront@0.77.11

## 0.77.10

### Patch Changes

- @voyant-travel/bookings@0.77.10
- @voyant-travel/checkout@0.77.10
- @voyant-travel/storefront@0.77.10

## 0.77.9

### Patch Changes

- @voyant-travel/bookings@0.77.9
- @voyant-travel/checkout@0.77.9
- @voyant-travel/storefront@0.77.9

## 0.77.8

### Patch Changes

- @voyant-travel/bookings@0.77.8
- @voyant-travel/checkout@0.77.8
- @voyant-travel/storefront@0.77.8

## 0.77.7

### Patch Changes

- @voyant-travel/bookings@0.77.7
- @voyant-travel/checkout@0.77.7
- @voyant-travel/storefront@0.77.7

## 0.77.6

### Patch Changes

- @voyant-travel/bookings@0.77.6
- @voyant-travel/checkout@0.77.6
- @voyant-travel/storefront@0.77.6

## 0.77.5

### Patch Changes

- @voyant-travel/bookings@0.77.5
- @voyant-travel/checkout@0.77.5
- @voyant-travel/storefront@0.77.5

## 0.77.4

### Patch Changes

- @voyant-travel/bookings@0.77.4
- @voyant-travel/checkout@0.77.4
- @voyant-travel/storefront@0.77.4

## 0.77.3

### Patch Changes

- @voyant-travel/bookings@0.77.3
- @voyant-travel/checkout@0.77.3
- @voyant-travel/storefront@0.77.3

## 0.77.2

### Patch Changes

- @voyant-travel/bookings@0.77.2
- @voyant-travel/checkout@0.77.2
- @voyant-travel/storefront@0.77.2

## 0.77.1

### Patch Changes

- Updated dependencies [574684d]
  - @voyant-travel/bookings@0.77.1
  - @voyant-travel/checkout@0.77.1
  - @voyant-travel/storefront@0.77.1

## 0.77.0

### Patch Changes

- @voyant-travel/bookings@0.77.0
- @voyant-travel/checkout@0.77.0
- @voyant-travel/storefront@0.77.0

## 0.76.0

### Patch Changes

- @voyant-travel/bookings@0.76.0
- @voyant-travel/checkout@0.76.0
- @voyant-travel/storefront@0.76.0

## 0.75.7

### Patch Changes

- @voyant-travel/bookings@0.75.7
- @voyant-travel/checkout@0.75.7
- @voyant-travel/storefront@0.75.7

## 0.75.6

### Patch Changes

- @voyant-travel/bookings@0.75.6
- @voyant-travel/checkout@0.75.6
- @voyant-travel/storefront@0.75.6

## 0.75.5

### Patch Changes

- @voyant-travel/bookings@0.75.5
- @voyant-travel/checkout@0.75.5
- @voyant-travel/storefront@0.75.5

## 0.75.4

### Patch Changes

- @voyant-travel/bookings@0.75.4
- @voyant-travel/checkout@0.75.4
- @voyant-travel/storefront@0.75.4

## 0.75.3

### Patch Changes

- @voyant-travel/bookings@0.75.3
- @voyant-travel/checkout@0.75.3
- @voyant-travel/storefront@0.75.3

## 0.75.2

### Patch Changes

- @voyant-travel/bookings@0.75.2
- @voyant-travel/checkout@0.75.2
- @voyant-travel/storefront@0.75.2

## 0.75.1

### Patch Changes

- @voyant-travel/bookings@0.75.1
- @voyant-travel/checkout@0.75.1
- @voyant-travel/storefront@0.75.1

## 0.75.0

### Patch Changes

- Updated dependencies [1eab599]
  - @voyant-travel/bookings@0.75.0
  - @voyant-travel/checkout@0.75.0
  - @voyant-travel/storefront@0.75.0

## 0.74.2

### Patch Changes

- @voyant-travel/bookings@0.74.2
- @voyant-travel/checkout@0.74.2
- @voyant-travel/storefront@0.74.2

## 0.74.1

### Patch Changes

- @voyant-travel/bookings@0.74.1
- @voyant-travel/checkout@0.74.1
- @voyant-travel/storefront@0.74.1

## 0.74.0

### Patch Changes

- @voyant-travel/bookings@0.74.0
- @voyant-travel/checkout@0.74.0
- @voyant-travel/storefront@0.74.0

## 0.73.1

### Patch Changes

- @voyant-travel/bookings@0.73.1
- @voyant-travel/checkout@0.73.1
- @voyant-travel/storefront@0.73.1

## 0.73.0

### Patch Changes

- @voyant-travel/bookings@0.73.0
- @voyant-travel/checkout@0.73.0
- @voyant-travel/storefront@0.73.0

## 0.72.0

### Patch Changes

- @voyant-travel/bookings@0.72.0
- @voyant-travel/checkout@0.72.0
- @voyant-travel/storefront@0.72.0

## 0.71.0

### Patch Changes

- @voyant-travel/bookings@0.71.0
- @voyant-travel/checkout@0.71.0
- @voyant-travel/storefront@0.71.0

## 0.70.0

### Patch Changes

- @voyant-travel/bookings@0.70.0
- @voyant-travel/checkout@0.70.0
- @voyant-travel/storefront@0.70.0

## 0.69.1

### Patch Changes

- @voyant-travel/bookings@0.69.1
- @voyant-travel/checkout@0.69.1
- @voyant-travel/storefront@0.69.1

## 0.69.0

### Patch Changes

- @voyant-travel/bookings@0.69.0
- @voyant-travel/checkout@0.69.0
- @voyant-travel/storefront@0.69.0

## 0.68.0

### Patch Changes

- @voyant-travel/bookings@0.68.0
- @voyant-travel/checkout@0.68.0
- @voyant-travel/storefront@0.68.0

## 0.67.0

### Patch Changes

- @voyant-travel/bookings@0.67.0
- @voyant-travel/checkout@0.67.0
- @voyant-travel/storefront@0.67.0

## 0.66.6

### Patch Changes

- @voyant-travel/bookings@0.66.6
- @voyant-travel/checkout@0.66.6
- @voyant-travel/storefront@0.66.6

## 0.66.5

### Patch Changes

- Updated dependencies [ee36ef5]
  - @voyant-travel/bookings@0.66.5
  - @voyant-travel/checkout@0.66.5
  - @voyant-travel/storefront@0.66.5

## 0.66.4

### Patch Changes

- Updated dependencies [83ff2de]
  - @voyant-travel/bookings@0.66.4
  - @voyant-travel/checkout@0.66.4
  - @voyant-travel/storefront@0.66.4

## 0.66.3

### Patch Changes

- @voyant-travel/bookings@0.66.3
- @voyant-travel/checkout@0.66.3
- @voyant-travel/storefront@0.66.3

## 0.66.2

### Patch Changes

- @voyant-travel/bookings@0.66.2
- @voyant-travel/checkout@0.66.2
- @voyant-travel/storefront@0.66.2

## 0.66.1

### Patch Changes

- Updated dependencies [e0b94f3]
  - @voyant-travel/bookings@0.66.1
  - @voyant-travel/checkout@0.66.1
  - @voyant-travel/storefront@0.66.1

## 0.66.0

### Patch Changes

- @voyant-travel/bookings@0.66.0
- @voyant-travel/checkout@0.66.0
- @voyant-travel/storefront@0.66.0

## 0.65.0

### Patch Changes

- @voyant-travel/bookings@0.65.0
- @voyant-travel/checkout@0.65.0
- @voyant-travel/storefront@0.65.0

## 0.64.1

### Patch Changes

- Updated dependencies [572dde4]
  - @voyant-travel/bookings@0.64.1
  - @voyant-travel/checkout@0.64.1
  - @voyant-travel/storefront@0.64.1

## 0.64.0

### Patch Changes

- Updated dependencies [6d0c8f3]
  - @voyant-travel/bookings@0.64.0
  - @voyant-travel/checkout@0.64.0
  - @voyant-travel/storefront@0.64.0

## 0.63.1

### Patch Changes

- @voyant-travel/bookings@0.63.1
- @voyant-travel/checkout@0.63.1
- @voyant-travel/storefront@0.63.1

## 0.63.0

### Patch Changes

- Updated dependencies [5bff9c3]
  - @voyant-travel/bookings@0.63.0
  - @voyant-travel/checkout@0.63.0
  - @voyant-travel/storefront@0.63.0

## 0.62.3

### Patch Changes

- @voyant-travel/bookings@0.62.3
- @voyant-travel/checkout@0.62.3
- @voyant-travel/storefront@0.62.3

## 0.62.2

### Patch Changes

- @voyant-travel/bookings@0.62.2
- @voyant-travel/checkout@0.62.2
- @voyant-travel/storefront@0.62.2

## 0.62.1

### Patch Changes

- @voyant-travel/bookings@0.62.1
- @voyant-travel/checkout@0.62.1
- @voyant-travel/storefront@0.62.1

## 0.62.0

### Patch Changes

- @voyant-travel/bookings@0.62.0
- @voyant-travel/checkout@0.62.0
- @voyant-travel/storefront@0.62.0

## 0.61.0

### Patch Changes

- @voyant-travel/bookings@0.61.0
- @voyant-travel/checkout@0.61.0
- @voyant-travel/storefront@0.61.0

## 0.60.0

### Patch Changes

- @voyant-travel/bookings@0.60.0
- @voyant-travel/checkout@0.60.0
- @voyant-travel/storefront@0.60.0

## 0.59.0

### Patch Changes

- @voyant-travel/bookings@0.59.0
- @voyant-travel/checkout@0.59.0
- @voyant-travel/storefront@0.59.0

## 0.58.0

### Patch Changes

- @voyant-travel/bookings@0.58.0
- @voyant-travel/checkout@0.58.0
- @voyant-travel/storefront@0.58.0

## 0.57.0

### Patch Changes

- @voyant-travel/bookings@0.57.0
- @voyant-travel/checkout@0.57.0
- @voyant-travel/storefront@0.57.0

## 0.56.0

### Patch Changes

- @voyant-travel/bookings@0.56.0
- @voyant-travel/checkout@0.56.0
- @voyant-travel/storefront@0.56.0

## 0.55.1

### Patch Changes

- Updated dependencies [819c847]
  - @voyant-travel/bookings@0.55.1
  - @voyant-travel/checkout@0.55.1
  - @voyant-travel/storefront@0.55.1

## 0.55.0

### Patch Changes

- @voyant-travel/bookings@0.55.0
- @voyant-travel/checkout@0.55.0
- @voyant-travel/storefront@0.55.0

## 0.54.0

### Patch Changes

- @voyant-travel/bookings@0.54.0
- @voyant-travel/checkout@0.54.0
- @voyant-travel/storefront@0.54.0

## 0.53.2

### Patch Changes

- @voyant-travel/bookings@0.53.2
- @voyant-travel/checkout@0.53.2
- @voyant-travel/storefront@0.53.2

## 0.53.1

### Patch Changes

- @voyant-travel/bookings@0.53.1
- @voyant-travel/checkout@0.53.1
- @voyant-travel/storefront@0.53.1

## 0.53.0

### Patch Changes

- Updated dependencies [a315df6]
  - @voyant-travel/bookings@0.53.0
  - @voyant-travel/checkout@0.53.0
  - @voyant-travel/storefront@0.53.0

## 0.52.4

### Patch Changes

- Updated dependencies [5d3c119]
  - @voyant-travel/bookings@0.52.4
  - @voyant-travel/checkout@0.52.4
  - @voyant-travel/storefront@0.52.4

## 0.52.3

### Patch Changes

- Updated dependencies [9679a57]
  - @voyant-travel/bookings@0.52.3
  - @voyant-travel/checkout@0.52.3
  - @voyant-travel/storefront@0.52.3

## 0.52.2

### Patch Changes

- Updated dependencies [3e09123]
  - @voyant-travel/bookings@0.52.2
  - @voyant-travel/checkout@0.52.2
  - @voyant-travel/storefront@0.52.2

## 0.52.1

### Patch Changes

- Updated dependencies [335d277]
  - @voyant-travel/bookings@0.52.1
  - @voyant-travel/checkout@0.52.1
  - @voyant-travel/storefront@0.52.1

## 0.52.0

### Patch Changes

- @voyant-travel/bookings@0.52.0
- @voyant-travel/checkout@0.52.0
- @voyant-travel/storefront@0.52.0

## 0.51.1

### Patch Changes

- @voyant-travel/bookings@0.51.1
- @voyant-travel/checkout@0.51.1
- @voyant-travel/storefront@0.51.1

## 0.51.0

### Patch Changes

- @voyant-travel/bookings@0.51.0
- @voyant-travel/checkout@0.51.0
- @voyant-travel/storefront@0.51.0

## 0.50.8

### Patch Changes

- Updated dependencies [f35014f]
  - @voyant-travel/bookings@0.50.8
  - @voyant-travel/checkout@0.50.8
  - @voyant-travel/storefront@0.50.8

## 0.50.7

### Patch Changes

- @voyant-travel/bookings@0.50.7
- @voyant-travel/checkout@0.50.7
- @voyant-travel/storefront@0.50.7

## 0.50.6

### Patch Changes

- Updated dependencies [c14f0a8]
  - @voyant-travel/bookings@0.50.6
  - @voyant-travel/checkout@0.50.6
  - @voyant-travel/storefront@0.50.6

## 0.50.5

### Patch Changes

- @voyant-travel/bookings@0.50.5
- @voyant-travel/checkout@0.50.5
- @voyant-travel/storefront@0.50.5

## 0.50.4

### Patch Changes

- @voyant-travel/bookings@0.50.4
- @voyant-travel/checkout@0.50.4
- @voyant-travel/storefront@0.50.4

## 0.50.3

### Patch Changes

- @voyant-travel/bookings@0.50.3
- @voyant-travel/checkout@0.50.3
- @voyant-travel/storefront@0.50.3

## 0.50.2

### Patch Changes

- e3630e4: Expose `bootstrapBookingSession` and `booking.bootstrapSession(...)` for the native storefront booking-session bootstrap route.
  - @voyant-travel/bookings@0.50.2
  - @voyant-travel/checkout@0.50.2
  - @voyant-travel/storefront@0.50.2

## 0.50.1

### Patch Changes

- 7b768c5: Add storefront intake SDK helpers, expand storefront payment settings with split schedules and bank-transfer account metadata, and extend finance admin aggregates with dashboard counts, totals, and filters.
- Updated dependencies [7b768c5]
  - @voyant-travel/bookings@0.50.1
  - @voyant-travel/checkout@0.50.1
  - @voyant-travel/storefront@0.50.1

## 0.50.0

### Patch Changes

- 875c76e: Extend the public departure price preview response with allocation, unit/room, extras, offer impact, and final totals blocks while preserving the existing simple quote fields.
- Updated dependencies [bf5747e]
- Updated dependencies [875c76e]
- Updated dependencies [2ca0537]
  - @voyant-travel/bookings@0.50.0
  - @voyant-travel/checkout@0.50.0
  - @voyant-travel/storefront@0.50.0

## 0.49.0

### Patch Changes

- @voyant-travel/bookings@0.49.0
- @voyant-travel/checkout@0.49.0
- @voyant-travel/storefront@0.49.0

## 0.48.0

### Patch Changes

- Updated dependencies [9132fcf]
  - @voyant-travel/bookings@0.48.0
  - @voyant-travel/checkout@0.48.0
  - @voyant-travel/storefront@0.48.0

## 0.47.0

### Patch Changes

- @voyant-travel/bookings@0.47.0
- @voyant-travel/checkout@0.47.0
- @voyant-travel/storefront@0.47.0

## 0.46.0

### Patch Changes

- @voyant-travel/bookings@0.46.0
- @voyant-travel/checkout@0.46.0
- @voyant-travel/storefront@0.46.0

## 0.45.0

### Patch Changes

- Updated dependencies [ed25837]
  - @voyant-travel/bookings@0.45.0
  - @voyant-travel/checkout@0.45.0
  - @voyant-travel/storefront@0.45.0

## 0.44.0

### Patch Changes

- @voyant-travel/bookings@0.44.0
- @voyant-travel/checkout@0.44.0
- @voyant-travel/storefront@0.44.0

## 0.43.0

### Patch Changes

- Updated dependencies [e9241a7]
  - @voyant-travel/bookings@0.43.0
  - @voyant-travel/checkout@0.43.0
  - @voyant-travel/storefront@0.43.0

## 0.42.0

### Patch Changes

- @voyant-travel/bookings@0.42.0
- @voyant-travel/checkout@0.42.0
- @voyant-travel/storefront@0.42.0

## 0.41.3

### Patch Changes

- @voyant-travel/bookings@0.41.3
- @voyant-travel/checkout@0.41.3
- @voyant-travel/storefront@0.41.3

## 0.41.2

### Patch Changes

- @voyant-travel/bookings@0.41.2
- @voyant-travel/checkout@0.41.2
- @voyant-travel/storefront@0.41.2

## 0.41.1

### Patch Changes

- @voyant-travel/bookings@0.41.1
- @voyant-travel/checkout@0.41.1
- @voyant-travel/storefront@0.41.1

## 0.41.0

### Patch Changes

- @voyant-travel/bookings@0.41.0
- @voyant-travel/checkout@0.41.0
- @voyant-travel/storefront@0.41.0

## 0.40.1

### Patch Changes

- @voyant-travel/bookings@0.40.1
- @voyant-travel/checkout@0.40.1
- @voyant-travel/storefront@0.40.1

## 0.40.0

### Patch Changes

- @voyant-travel/bookings@0.40.0
- @voyant-travel/checkout@0.40.0
- @voyant-travel/storefront@0.40.0

## 0.39.0

### Patch Changes

- Updated dependencies [f4235ea]
  - @voyant-travel/bookings@0.39.0
  - @voyant-travel/checkout@0.39.0
  - @voyant-travel/storefront@0.39.0

## 0.38.2

### Patch Changes

- @voyant-travel/bookings@0.38.2
- @voyant-travel/checkout@0.38.2
- @voyant-travel/storefront@0.38.2

## 0.38.1

### Patch Changes

- @voyant-travel/bookings@0.38.1
- @voyant-travel/checkout@0.38.1
- @voyant-travel/storefront@0.38.1

## 0.38.0

### Patch Changes

- @voyant-travel/bookings@0.38.0
- @voyant-travel/checkout@0.38.0
- @voyant-travel/storefront@0.38.0

## 0.37.1

### Patch Changes

- @voyant-travel/bookings@0.37.1
- @voyant-travel/checkout@0.37.1
- @voyant-travel/storefront@0.37.1

## 0.37.0

### Minor Changes

- 4d4658e: Add a first-class `bookingEngine` facade for custom storefront booking flows.
  The facade wraps public booking-session and checkout operations with
  flow-oriented methods, returns canonical engine snapshots, and exposes
  structured booking-engine error metadata.

### Patch Changes

- Updated dependencies [4c93561]
- Updated dependencies [dc29b79]
  - @voyant-travel/bookings@0.37.0
  - @voyant-travel/checkout@0.37.0
  - @voyant-travel/storefront@0.37.0

## 0.36.0

### Patch Changes

- Updated dependencies [15e6953]
  - @voyant-travel/bookings@0.36.0
  - @voyant-travel/checkout@0.36.0
  - @voyant-travel/storefront@0.36.0

## 0.35.0

### Patch Changes

- @voyant-travel/bookings@0.35.0
- @voyant-travel/checkout@0.35.0
- @voyant-travel/storefront@0.35.0

## 0.34.0

### Patch Changes

- @voyant-travel/bookings@0.34.0
- @voyant-travel/checkout@0.34.0
- @voyant-travel/storefront@0.34.0

## 0.33.1

### Patch Changes

- Updated dependencies [9bee9aa]
  - @voyant-travel/bookings@0.33.1
  - @voyant-travel/checkout@0.33.1
  - @voyant-travel/storefront@0.33.1

## 0.33.0

### Patch Changes

- @voyant-travel/bookings@0.33.0
- @voyant-travel/checkout@0.33.0
- @voyant-travel/storefront@0.33.0

## 0.32.3

### Patch Changes

- @voyant-travel/bookings@0.32.3
- @voyant-travel/checkout@0.32.3
- @voyant-travel/storefront@0.32.3

## 0.32.2

### Patch Changes

- @voyant-travel/bookings@0.32.2
- @voyant-travel/checkout@0.32.2
- @voyant-travel/storefront@0.32.2

## 0.32.1

### Patch Changes

- @voyant-travel/bookings@0.32.1
- @voyant-travel/checkout@0.32.1
- @voyant-travel/storefront@0.32.1

## 0.32.0

### Minor Changes

- 1a4e971: Add a framework-agnostic storefront TypeScript SDK for custom booking UIs.

  The SDK wraps existing public storefront, booking-session, and checkout
  collection contracts behind a typed client facade, and exposes derived booking
  engine state helpers for custom storefront flows.

### Patch Changes

- Updated dependencies [6ea6ded]
  - @voyant-travel/bookings@0.32.0
  - @voyant-travel/checkout@0.32.0
  - @voyant-travel/storefront@0.32.0
