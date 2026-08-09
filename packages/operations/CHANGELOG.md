# @voyant-travel/operations

## 0.22.14

### Patch Changes

- de549da: Allow graph-selected admin modules to expose an import-cheap shell descriptor
  while their route loaders and page implementations remain dynamically loaded,
  and apply the seam to the Operations admin surface.
- Updated dependencies [6e2c539]
  - @voyant-travel/bookings@0.240.10

## 0.22.13

### Patch Changes

- ed455e6: Claim every supported approved departure-planning mutation inside its handler transaction and replay the authoritative or audited command result instead of redispatching. Explicitly withhold projection rebuilds until they have a transaction-aware durable implementation.
- Updated dependencies [b95e995]
- Updated dependencies [b760ac6]
- Updated dependencies [4c2b4ce]
- Updated dependencies [de6e62a]
- Updated dependencies [27140ec]
  - @voyant-travel/catalog@0.253.0
  - @voyant-travel/products-contracts@0.111.2

## 0.22.12

### Patch Changes

- Updated dependencies [8fc2d25]
  - @voyant-travel/products-contracts@0.111.0
  - @voyant-travel/bookings@0.240.5

## 0.22.11

### Patch Changes

- Updated dependencies [21a28ef]
  - @voyant-travel/catalog@0.252.0
  - @voyant-travel/core@0.140.3
  - @voyant-travel/products-contracts@0.110.4

## 0.22.10

### Patch Changes

- Updated dependencies [afb6866]
- Updated dependencies [5d1b298]
  - @voyant-travel/db@0.121.0
  - @voyant-travel/action-ledger@0.115.16
  - @voyant-travel/bookings@0.240.3
  - @voyant-travel/catalog@0.251.2
  - @voyant-travel/hono@0.142.2
  - @voyant-travel/identity@0.236.7
  - @voyant-travel/types@0.109.13
  - @voyant-travel/core@0.140.2

## 0.22.9

### Patch Changes

- 3cbf7fb: Bound resident Node database pools to four connections by default, allow an
  explicit `DATABASE_MAX_CONNECTIONS` override, and only attach dashboard cache
  headers after an aggregate response succeeds so transient server errors are not
  cached by browsers.
- Updated dependencies [3cbf7fb]
  - @voyant-travel/bookings@0.240.2
  - @voyant-travel/db@0.120.7

## 0.22.8

### Patch Changes

- Updated dependencies [688f164]
  - @voyant-travel/catalog@0.251.0
  - @voyant-travel/products-contracts@0.110.3

## 0.22.7

### Patch Changes

- Updated dependencies [56e2050]
  - @voyant-travel/catalog@0.250.0
  - @voyant-travel/products-contracts@0.110.2

## 0.22.6

### Patch Changes

- Updated dependencies [484b207]
  - @voyant-travel/finance-contracts@0.113.0
  - @voyant-travel/catalog@0.249.1

## 0.22.5

### Patch Changes

- 4f9a097: The retired ledger sources a package absorbed are declared in `package.json`, so
  the source-free managed image can see them.

  A module consolidation moves another package's migration tags under a new ledger
  source name. The ledger is keyed `(source, tag)`, so a database that already
  applied them looks for `availability/0000_availability_baseline` while the plan
  offers `operations/0000_availability_baseline` — nothing matches, and the moved
  baseline re-runs against the tables the retired package built.

  `MigrationSource.legacyNames` is the mapping, and the previous release made it
  authorable as `legacySources` on the graph migration facet. That declaration is
  invisible to the managed image, which is **source-free**: it resolves a module by
  package NAME, reads its committed `migrations/` folder, and never resolves a
  graph. So every deployment carrying the retired history was blocked, and only
  those — a fresh database has nothing to adopt, which is why CI did not see it.

  The declaration therefore moves to package metadata, `voyant.legacyMigrationSources`,
  next to `requiresSchemas` and for the same reason:

  - `loadModuleBundleSource` reads it, so the managed runtime adopts the identities
    without a graph;
  - `buildMigrationPlan` resolves it from the same package record, so the
    graph-driven plan reads one declaration rather than a second one that can drift;
  - `VoyantGraphMigrationFacet.legacySources` is removed — a facet field that only
    half the callers can read is worse than none.

  `verify:migration-cutline` now fails when a source the cutline manifest records
  as absorbed is not claimed by the absorbing package, and when a claimed source
  still ships its own migrations folder.

  Unchanged: this is for a pure ownership move, where the tags carry over
  byte-identical and their content hashes still match. Changed SQL is still
  rejected.

  Fixes voyant#4330.

  - @voyant-travel/core@0.140.1

## 0.22.4

### Patch Changes

- Updated dependencies [7b8ef95]
  - @voyant-travel/core@0.140.0
  - @voyant-travel/catalog@0.249.0
  - @voyant-travel/action-ledger@0.115.15
  - @voyant-travel/bookings@0.240.1
  - @voyant-travel/db@0.120.6
  - @voyant-travel/hono@0.142.1
  - @voyant-travel/identity@0.236.6

## 0.22.3

### Patch Changes

- Updated dependencies [1be6b76]
  - @voyant-travel/finance-contracts@0.112.0
  - @voyant-travel/catalog@0.248.1

## 0.22.2

### Patch Changes

- Updated dependencies [6c77f7d]
- Updated dependencies [d98648a]
  - @voyant-travel/catalog@0.248.0
  - @voyant-travel/bookings@0.240.0
  - @voyant-travel/finance-contracts@0.111.0
  - @voyant-travel/products-contracts@0.110.1

## 0.22.1

### Patch Changes

- Updated dependencies [380dad7]
  - @voyant-travel/catalog@0.247.0

## 0.22.0

### Minor Changes

- e8bd000: chore: retire compatibility surface nothing reaches

  Fourteen compatibility surfaces in private packages had no caller left anywhere in
  the repository — not in product code, not in tests, and in several cases not
  even a re-export. Each one is now gone rather than carried. Nothing here touches
  a published package, a database column, or an API response an external
  storefront could read; those cases are inventoried for a separate decision.

  - **`@voyant-travel/catalog`** — the `./indexer/contract` subpath and the
    one-line re-export behind it. Every importer in the repository, including
    catalog's own modules, already names
    `@voyant-travel/catalog-contracts/indexer/contract`; the contracts package has
    been the canonical dependency since the engine contracts moved out of the
    runtime. The README and the catalog/promotions architecture docs no longer
    describe the alias.
  - **`@voyant-travel/framework`** — `generateCustomSourcePluginManifests`, an
    alias of `generateCustomSourceExtensionManifests` left over from the "plugin"
    classification retirement, and the `providers` option on
    `VoyantNodeRuntimeOptions` / `createVoyantNodeApp`. The option was merged
    under `resources` on every path; no host, generated artifact or test ever
    passed it.
  - **`@voyant-travel/hono`** — `LIVE_LIMITS`, two constants from the pre-C2
    limiter. Limits are configured per policy through `RateLimitPolicy`; the
    constants were re-exported twice and read nowhere.
  - **`@voyant-travel/legal`** — `contractSeriesService.findSingleActiveByScope`,
    a pass-through to `findDefaultActiveByScope`. Callers and tests already use
    the canonical name.
  - **`@voyant-travel/finance`** — `externalProvider`, `externalNumber` and
    `externalSeriesName` on `InvoiceVoidedEvent`. The single emitter never set
    them and `invoiceVoidedPayloadSchema` is `additionalProperties: false`, so
    they could not travel to a subscriber even if something had.
  - **`@voyant-travel/finance-react`** — the `orderId` filter on
    `FinancePaymentSessionListFilters`. Its only reader was the
    `legacyOrderId ?? orderId` fallback in the query builder, which now reads
    `legacyOrderId` directly.
  - **`@voyant-travel/operations-react`** — `KpiStrip` and
    `aggregateSlotFinancials`. The roll-up summed whatever page of the allocation
    manifest happened to be loaded, using its own paid-amount rule; the departure
    workspace reads whole-departure figures from `GET /slots/{id}/summary`
    instead. `KpiStrip` was not reachable from the package surface at all.

  A second group carried no `@deprecated` tag, only a "back-compat" comment, and
  was equally unreachable:

  - **`@voyant-travel/operations`** — the `UpdateSlotRuntime` alias of
    `SlotMutationRuntime`, left over from when the runtime type covered updates
    only. Zero references, including tests.
  - **`@voyant-travel/inventory`** — the flat `productLinkable` alias of
    `inventoryProductCompatibilityLinkable`, exported from three places. Both real
    callers (inventory's and legal's `standard-links`) import the canonical symbol
    and rename it locally. The compatibility linkable itself stays: it is what
    keeps the `products` module name resolving.
  - **`@voyant-travel/inventory-react`** — `extras-compat.ts`, a forwarder to
    `./extras.js`. Its two importers were both inside the package.
  - **`@voyant-travel/bookings`** — `getLegacyTransactionLinkFromBookingOrigin`
    and `LegacyBookingTransactionLink`, a reader for pre-Voyant transaction ids on
    a booking origin. Nothing called it; its only exercise was a unit test, which
    goes with it. The origin columns and the `legacy_transaction` origin source
    are untouched — this removes a reader, not the data.
  - **`@voyant-travel/bookings-react`, `@voyant-travel/distribution-react`** — slot
    ids re-exported from the detail hosts "for backwards compatibility". Every
    consumer already imports them from the lean `./slots.js` the comment points
    at, which is the whole reason that module exists. The distribution-react one
    was already annotated as an unused export.

  The three deleted files are pinned in `retired-paths.json` so they stay deleted.

### Patch Changes

- Updated dependencies [e8bd000]
  - @voyant-travel/bookings@0.239.0
  - @voyant-travel/catalog@0.246.0
  - @voyant-travel/hono@0.142.0
  - @voyant-travel/action-ledger@0.115.14
  - @voyant-travel/identity@0.236.5

## 0.21.0

### Minor Changes

- 3f5ea82: feat: compatibility redirects with usage counting and acceptance dashboard metrics

  Instrument the transitional surfaces so their removal can later be gated on
  evidence rather than assumption. Nothing is deleted here.

  - **Compatibility redirects (`@voyant-travel/core`).** `resolveLegacyRedirect`
    maps the four superseded deep-link families — Extras, scheduled Catalog,
    Product detail, and operator Availability — to their canonical successors for
    the measured compatibility period. `resolveAndCountLegacyRedirect` resolves
    and counts a hit in one call for a route middleware, and never fails the
    redirect if the counter does.
  - **Usage counting.** `LegacyPathUsageStore` counts hits per stable route key;
    the in-memory store seeds every known key at zero so "usage is zero" is an
    explicit, checkable fact for the release review rather than a missing row.
  - **Acceptance metrics (`@voyant-travel/operations`).**
    `computeAcceptanceMetrics` reports readiness failures, reconciliation drift,
    unassigned travelers, missing costs, legacy-path usage, and rollup
    disagreement over injectable providers. Every field is a count or a
    route-keyed usage row — no traveler PII is read or emitted.

- 3f5ea82: feat: serve the compatibility redirects and the acceptance metrics

  The redirect table and the metrics aggregator were built and unit-tested but
  nothing called either, so the redirects redirected nothing and the usage counter
  read zero because no request could ever reach it — the one reading that would
  have licensed deleting the surfaces it exists to protect. Both are now wired to
  a request.

  - **`legacyRedirects` (`@voyant-travel/hono/middleware/legacy-redirects`)** is
    the HTTP edge for `resolveAndCountLegacyRedirect`: a superseded deep link
    answers `308` to its canonical successor, carries its query string across, and
    records the hit. It is mounted unconditionally by `serveAdminHost`, ahead of
    static serving and auth — the only seam that sees these origin-root UI paths —
    and deliberately not by the framework app, where a storefront's `/catalog/*`
    content would collide with the compatibility table.
  - **`getLegacyPathUsageStore` / `setLegacyPathUsageStore`
    (`@voyant-travel/core`)** bind one usage store per process, so the counter the
    middleware writes is the counter the dashboard reads. A multi-process
    deployment binds a durable store; until it does, "usage is zero" is only that
    process's zero.
  - **`GET /v1/admin/operations/acceptance/aggregates`** serves
    `computeAcceptanceMetrics` over `createAcceptanceMetricsProviders`, following
    the existing `/aggregates` dashboard convention. Readiness failures,
    reconciliation drift and unassigned travelers are single raw-SQL counts; the
    two money signals come from the departure-profitability port that already
    backs the departure workspace, and the envelope reports whether that provider
    was bound so an unmeasured zero is not read as a measured one. The response is
    uncached: legacy-path usage gates a deletion review and must not answer from a
    snapshot. No traveler column is projected by any statement.

### Patch Changes

- Updated dependencies [3f5ea82]
- Updated dependencies [3f5ea82]
- Updated dependencies [3f5ea82]
- Updated dependencies [3f5ea82]
  - @voyant-travel/products-contracts@0.110.0
  - @voyant-travel/core@0.139.0
  - @voyant-travel/hono@0.141.0
  - @voyant-travel/bookings@0.238.4
  - @voyant-travel/action-ledger@0.115.13
  - @voyant-travel/availability@0.4.1
  - @voyant-travel/catalog@0.245.1
  - @voyant-travel/db@0.120.3
  - @voyant-travel/identity@0.236.4

## 0.20.1

### Patch Changes

- Updated dependencies [076c246]
  - @voyant-travel/catalog@0.245.0
  - @voyant-travel/products-contracts@0.109.5

## 0.20.0

### Minor Changes

- 9a10fa5: Cover the departure room-block and rooming-preference writes with agent Tools

  Slot allocation is the one Operations family that agents can already act on:
  attaching and detaching a departure's fleet resources and placing travelers are
  Tools. The three allocation writes #4216 added were not, so an agent could plan a
  departure's coach but not draw its rooms from a contracted block, hand them back,
  or record what a traveler asked for — while every neighbouring write was reachable.

  Adds `materialize_departure_room_block`, `release_departure_room_block` and
  `set_departure_traveler_rooming_preferences`, each delegating to the service the
  existing admin route already calls, so there is one write path and not two.
  Releasing carries the destructive posture for the same reason detaching a coach
  does: re-drawing the block returns the rooms but not the rooming plan.

### Patch Changes

- Updated dependencies [68d90d9]
  - @voyant-travel/products-contracts@0.109.4

## 0.19.0

### Minor Changes

- 64df424: feat(operations): materialize real room inventory and produce a rooming list

  Before this, the only checked property of a room position was its maximum
  capacity. Room type, bed configuration, accessibility and the occupancy band a
  unit was contracted at all existed as data and were consulted, at most, as a
  _sort key_ in the auto-allocator — which is to say they could be silently
  ignored. A room position was sortable, not checkable.

  - **Positions carry their constraints.** `allocation_resources` and
    `product_option_resource_templates` gain `occupancy_min` (plus `occupancy_max`
    on the template), `room_type_id`, `bed_configuration`, `accessible` and an
    age band. `accessible` is promoted out of `flags`; the three historical flag
    keys are still honoured so rows written before this keep their meaning.
    A CHECK constraint rejects a minimum occupancy above the capacity.
  - **`generateFromRooms` stops discarding data.** It collapsed
    `occupancyMax ?? occupancyMin` into one number, so a triple sold to two people
    was indistinguishable from a double sold to two. It now carries the floor and
    the age band across from `option_units`.
  - **One constraint evaluator, three callers.** `room-constraints.ts` is pure
    over already-loaded facts and is shared by the assignment guard, the
    auto-allocator's filters and the conflicts projection, so the three can never
    disagree. Blocking violations (room type, unit, option, age band,
    unaccompanied minor, adult/child mixing) reject an assignment with 409 and a
    structured payload; advisory ones (bed preference, accessibility, occupancy
    floor) are reported, never a wall.
  - **Overrides are on the record.** `PATCH .../travelers/{id}` accepts
    `override: { reason }`. The reason and the exact list of rules it waived are
    written into the audit entry's `after` payload, inside the same transaction as
    the assignment.
  - **The auto-allocator filters instead of merely preferring.** Accessibility and
    option/unit matching were sort keys; they are now filters, given up one at a
    time in a documented order (bed preference → room type → option → option unit
    → age band → accessibility) with every relaxation reported as a
    `compromise`. A label prefix ("DBL #1") stays a preference — it is a name an
    operator typed, not something anyone contracted. Oversubscription is no longer
    an opaque `skipped` integer: `unplaced` names the sharing group, the
    travelers, the reason and the largest free block.
  - **Rooms can come from a contracted block.**
    `POST .../allocation/room-blocks/materialize` creates the positions **and**
    takes the matching `room_block_nights` pickup in one transaction, sized by the
    block's tightest night; the delete leg gives them back by reversing the
    pickup. Same authority split as the fleet-resource link:
    `allocation_resources` is what the departure operates, the nightly ledger is
    the cross-departure conflict oracle, and there is exactly one write path.
    Accommodations-less deployments get a clean 400.
  - **The preferences are enterable.**
    `PATCH .../travelers/{id}/rooming-preferences` and a workspace dialog write
    the bed preference and booked room type the rules check against. They were
    previously reachable only through the admin travel-details API.
  - **The rooming list is a rooming list.** The CSV is one row per occupant with
    the room type, bed configuration, occupancy band and accessibility a hotel
    needs, plus the booking, sharing group and bed preference. Rooms nobody holds
    still emit a row so a paid-for empty bed is visible. The print view becomes
    the supplier-facing sheet for room-shaped kinds; seat-shaped kinds keep the
    compact manifest.
  - **New conflict codes:** `under_occupied_resource`, `bed_preference_unmet`,
    `unaccompanied_minor`, `adult_child_mixing`. `incompatible_assignment` now
    also covers a room-type mismatch.

### Patch Changes

- Updated dependencies [64df424]
  - @voyant-travel/availability@0.4.0

## 0.18.3

### Patch Changes

- Updated dependencies [9ef6a65]
- Updated dependencies [9ef6a65]
  - @voyant-travel/catalog@0.244.0
  - @voyant-travel/products-contracts@0.109.3

## 0.18.2

### Patch Changes

- Updated dependencies [ef8871d]
  - @voyant-travel/catalog@0.243.0
  - @voyant-travel/products-contracts@0.109.2

## 0.18.1

### Patch Changes

- Updated dependencies [b52433d]
  - @voyant-travel/catalog@0.242.0
  - @voyant-travel/products-contracts@0.109.1

## 0.18.0

### Minor Changes

- 3d793c1: feat: materialize Product Day Services into Departure operations (spine)

  The spine of the multi-day tracer (voyant#4035). A Product's day services were a
  costing list with no operational shape, `product_versions.snapshot` had zero
  readers, and a departure had no per-day structure. This wires the first path
  from a frozen Product Version to immutable per-departure service lines.

  - **A typed snapshot reader** (`@voyant-travel/products-contracts`):
    `parseProductVersionSnapshot` validates the frozen `product_versions.snapshot`
    shape and fails loudly on anything it does not recognise rather than returning
    an empty itinerary. Pure zod, reusable by inventory and operations (and
    voyant#4189).
  - **Operational fields on `product_day_services`**: local start/end time and
    duration, a Place/facility reference, an `inclusion_role`
    (`included` | `optional`), traveller applicability, and a supplier reference
    alongside the existing loose `supplier_service_id`. Propagated through
    validation, service, admin routes, and the inventory-react authoring form.
  - **A `departure_service_operations` table** (`@voyant-travel/operations`) with
    its own `departure_service_operation_status` enum
    (`planned` → … → `completed`, plus `cancelled` / `exception`) and a transition
    guard — deliberately not overloading the capacity-shaped
    `availability_slot_status`.
  - **Idempotent materialization** from the frozen snapshot, mapping day N to the
    departure date + (N-1) in the slot timezone, keyed on
    `(slot_id, source_day_service_id)`. Wired into both slot-creation paths. A
    later Product edit does not mutate an already-materialized departure — proven
    by an integration test.

  Spine only: no run-sheet UI and no supplier-operations changes, which are
  follow-ups.

### Patch Changes

- Updated dependencies [3d793c1]
  - @voyant-travel/products-contracts@0.109.0

## 0.17.4

### Patch Changes

- Updated dependencies [0976af1]
- Updated dependencies [558e652]
  - @voyant-travel/catalog@0.241.0
  - @voyant-travel/bookings@0.238.3

## 0.17.3

### Patch Changes

- Updated dependencies [9b9e8ac]
  - @voyant-travel/catalog@0.240.0

## 0.17.2

### Patch Changes

- Updated dependencies [da20433]
  - @voyant-travel/catalog@0.239.0

## 0.17.1

### Patch Changes

- Updated dependencies [d2a571f]
  - @voyant-travel/catalog@0.238.0

## 0.17.0

### Minor Changes

- 0404299: feat(operations): attach a Resource to a departure, materialize seats, allocate atomically

  A coach could not be pointed at the departure it operates, could not be laid out
  before the first sale, and the plan's conflicts were computed nowhere the server
  could see.

  - **A departure can attach a fleet `resources` record.** `allocation_resources`
    gains a `"resource"` ref producer that writes the departure's container and
    the cross-departure `resource_slot_assignments` commitment in one transaction,
    adopting an assignment the Resources admin already made rather than
    duplicating it, and refusing a coach already committed to an overlapping
    departure. `docs/architecture/operated-departure-logistics.md` records which
    table is authoritative for what.
  - **`vehicle_seat` templates materialize.** `default_count` counts vehicles and
    each one gets its full seat map, so an empty coach can be drawn before the
    departure has sold a seat. Previously only the pax-derived path created seats,
    which needed bookings to already exist.
  - **Idempotency parity.** Both materialisation paths now skip existing resources
    at `(kind, ref)` granularity and report `skippedExisting`. The pax-derived
    path used to raise `409 Resources already exist`; a retried request is now a
    visible no-op.
  - **`POST /slots/{id}/allocation/auto-allocate/preview`** returns the plan
    without writing it, and is the first production caller of
    `validateSlotAllocationCapacity`.
  - **`POST /slots/{id}/allocation/travelers/assignments`** places a set of
    travelers in one transaction, so a sharing group can no longer land
    half-placed. Per-traveler `expectedResourceId` is an optimistic-concurrency
    precondition.
  - **`GET /slots/{id}/allocation/conflicts`** is a server-side projection with
    stable codes covering unassigned, over-capacity, duplicate, inaccessible,
    incompatible, oversubscribed group and split group, so UI, CSV and print
    agree. The unused client-side `buildValidationIssues` / `ValidationSummary`
    are removed.
  - **Seat exports are reachable.** `export-rooming-list` takes a `kind`, and the
    filename union gains `seating`.
  - **Retry and revision safety.** Allocation mutations accept an
    `Idempotency-Key`, resource update/delete and fleet detach accept
    `expectedUpdatedAt`, and the new legs append action-ledger mutation entries.

## 0.16.0

### Minor Changes

- 3552f14: Wake the expired-hold reaper instead of polling for it.

  An availability hold records the instant it becomes reapable, so nothing has to
  poll to discover that work. `operations.release-expired-availability-holds` is
  now `wakeup: true`: placing or extending a hold reports the new expiry, the
  reaper re-arms itself from the earliest outstanding expiry after every run, and
  the cron drops to a six-hourly backstop for a wake lost to a restart.

  Hosts gain a target-neutral way to carry that request.
  `VoyantRuntimeHostPrimitives.jobs.wakeAt(jobId, at)` asks the deployment to
  invoke a wakeable job at an instant; the Node host arms one in-process timer per
  job, keeps the earliest pending instant, and declines anything past its horizon.
  A requested wake is a prompt and never durable — the declared cadence stays the
  recovery authority, as it already is for a wake arriving over
  `POST /__voyant/jobs/:id`.

  On a managed deployment this is what stops an idle tenant from paying for its
  database. A tenant with no live holds now arms nothing and never wakes its
  compute for this job; one with holds wakes exactly when there is capacity to
  give back, which is sooner than the fifteen-minute sweep it replaces.

### Patch Changes

- Updated dependencies [3552f14]
  - @voyant-travel/core@0.138.0
  - @voyant-travel/action-ledger@0.115.12
  - @voyant-travel/availability@0.3.1
  - @voyant-travel/bookings@0.238.2
  - @voyant-travel/catalog@0.237.1
  - @voyant-travel/db@0.120.2
  - @voyant-travel/hono@0.140.1
  - @voyant-travel/identity@0.236.3

## 0.15.0

### Minor Changes

- e1c5e39: Bind every new departure to its Product Version, not just generated ones.

  The version binding landed with only recurring generation resolving a version
  automatically; a departure created through the admin route recorded none. That
  left the guarantee — a departure can always name the definition it sells —
  true of the bulk path but not the manual one.

  `createSlot` now resolves the product's currently published version itself, and
  generation falls back to the same resolver when no override is supplied. An
  explicit `productVersionId` still wins, so a caller can materialize against a
  chosen version.

  The version is read through a local `productVersionsRef`, the same escape hatch
  `productsRef` and `productOptionsRef` already use: Inventory owns
  `product_versions` and already depends on Operations, so importing it would
  close a dependency cycle.

  `service-core.ts` had grown past the size gate while owning four unrelated
  aggregates, which blocked touching it at all. Availability rules and start
  times move to `service-rules.ts` and the shared static-availability guard to
  `service-product-guard.ts` — pure moves with no behaviour change, leaving slot
  and closeout lifecycle behind. `availabilityService` re-exports everything as
  before, so no caller changes.

## 0.14.0

### Minor Changes

- a3c04c4: Record which Product Version an operated departure was materialized from.

  A departure had no way to name the Product definition it sells. Editing a
  product silently changed what every existing departure appeared to offer,
  including ones already sold — the gap the product model RFC calls out as the
  reason a departure cannot be reconciled, operated, or costed against a stable
  definition.

  `availability_slots` gains `product_version_id`. It is a soft reference:
  `product_versions` is owned by Inventory and a cross-domain foreign key would
  violate schema discipline, so the column stays plain text exactly like
  `product_id` beside it.

  Recurring generation resolves the version **once per rule**, so a publish
  landing mid-run cannot split one generation batch across two definitions, and a
  later run never rewrites departures an earlier run already bound. The version
  arrives through a resolver supplied by the deployment rather than a direct
  read — Inventory already depends on Operations, so reaching back the other way
  would close a dependency cycle. `resolveCurrentProductVersionId` on the
  Inventory side returns the highest version number, which is deterministic by
  construction.

  Departures created before this column existed are **reported, not backfilled**.
  The only signal available after the fact is what the product looks like today,
  which is precisely what may have changed since the departure was sold;
  assigning that retroactively would manufacture false provenance for exactly the
  records where provenance matters most. `reportUnboundDepartures` and
  `listUnboundDepartures` expose an operator-review queue that excludes departures
  which have already run, since their provenance can no longer affect what is
  sold. `countDeparturesOnVersion` gives the impact set for a product edit.

  Slot creation accepts an explicit `productVersionId`, so a caller can
  materialize a departure against a chosen version.

### Patch Changes

- Updated dependencies [a3c04c4]
  - @voyant-travel/availability@0.3.0

## 0.13.7

### Patch Changes

- Updated dependencies [06a79a0]
- Updated dependencies [06a79a0]
  - @voyant-travel/bookings@0.238.0
  - @voyant-travel/catalog@0.237.0

## 0.13.6

### Patch Changes

- Updated dependencies [c35841b]
  - @voyant-travel/hono@0.140.0
  - @voyant-travel/catalog@0.236.0
  - @voyant-travel/action-ledger@0.115.11
  - @voyant-travel/bookings@0.237.2
  - @voyant-travel/identity@0.236.2
  - @voyant-travel/core@0.137.2

## 0.13.5

### Patch Changes

- Updated dependencies [4c694f6]
  - @voyant-travel/catalog@0.235.0

## 0.13.4

### Patch Changes

- Updated dependencies [2bc1570]
- Updated dependencies [2bc1570]
- Updated dependencies [14033fb]
  - @voyant-travel/db@0.120.0
  - @voyant-travel/hono@0.139.0
  - @voyant-travel/bookings@0.237.1
  - @voyant-travel/action-ledger@0.115.10
  - @voyant-travel/availability@0.2.30
  - @voyant-travel/catalog@0.234.2
  - @voyant-travel/identity@0.236.1
  - @voyant-travel/types@0.109.12

## 0.13.3

### Patch Changes

- Updated dependencies [f69e880]
  - @voyant-travel/bookings-contracts@0.114.0
  - @voyant-travel/bookings@0.237.0
  - @voyant-travel/catalog@0.234.1

## 0.13.2

### Patch Changes

- Updated dependencies [eeaa5b5]
  - @voyant-travel/catalog@0.234.0
  - @voyant-travel/bookings@0.236.0
  - @voyant-travel/identity@0.236.0

## 0.13.1

### Patch Changes

- @voyant-travel/bookings@0.235.0
- @voyant-travel/catalog@0.233.0
- @voyant-travel/identity@0.235.0

## 0.13.0

### Minor Changes

- 9f412dd: Add the Booking Platform v1 action projection: authoritative Catalog, Finance,
  and Legal obligation readers, an Operations work queue with deterministic
  incremental and rebuild jobs, a redacted storefront next-action API, explicit
  Payment Schedule timezones, and reminder scheduling from projected deadlines.

### Patch Changes

- Updated dependencies [051e6e3]
- Updated dependencies [536ebfc]
- Updated dependencies [46005bf]
- Updated dependencies [c986bd5]
- Updated dependencies [9f412dd]
- Updated dependencies [2ed62d3]
  - @voyant-travel/catalog@0.232.0
  - @voyant-travel/bookings@0.234.0
  - @voyant-travel/core@0.137.1
  - @voyant-travel/bookings-contracts@0.113.0
  - @voyant-travel/db@0.119.4
  - @voyant-travel/identity@0.234.0

## 0.12.2

### Patch Changes

- Updated dependencies [5ed518e]
- Updated dependencies [15c1c64]
  - @voyant-travel/catalog@0.231.0
  - @voyant-travel/db@0.119.3
  - @voyant-travel/identity@0.233.0

## 0.12.1

### Patch Changes

- Updated dependencies [e93c0a7]
  - @voyant-travel/catalog@0.230.0
  - @voyant-travel/identity@0.232.0

## 0.12.0

### Minor Changes

- f7adc5b: Expose a shared operated-departure logistics workspace for room, vehicle, and
  seat assignments, with same-slot parent validation and vehicle-seat invariants.

### Patch Changes

- Updated dependencies [f7adc5b]
  - @voyant-travel/catalog@0.229.0
  - @voyant-travel/identity@0.231.0

## 0.11.14

### Patch Changes

- Updated dependencies [72c6753]
- Updated dependencies [79606bb]
  - @voyant-travel/catalog@0.228.0
  - @voyant-travel/identity@0.230.0

## 0.11.13

### Patch Changes

- Updated dependencies [5d3b563]
- Updated dependencies [f25ad34]
- Updated dependencies [2601445]
  - @voyant-travel/catalog@0.227.0
  - @voyant-travel/identity@0.229.0

## 0.11.12

### Patch Changes

- @voyant-travel/catalog@0.226.0
- @voyant-travel/identity@0.228.0

## 0.11.11

### Patch Changes

- @voyant-travel/catalog@0.225.0
- @voyant-travel/db@0.119.2
- @voyant-travel/identity@0.227.0

## 0.11.10

### Patch Changes

- Updated dependencies [6036dc4]
  - @voyant-travel/catalog@0.224.0
  - @voyant-travel/identity@0.226.0

## 0.11.9

### Patch Changes

- Updated dependencies [4fe6f79]
- Updated dependencies [276d44d]
- Updated dependencies [0c30250]
  - @voyant-travel/tools@0.10.0
  - @voyant-travel/core@0.137.0
  - @voyant-travel/catalog@0.223.0
  - @voyant-travel/action-ledger@0.115.9
  - @voyant-travel/identity@0.225.0
  - @voyant-travel/availability@0.2.29
  - @voyant-travel/db@0.119.1
  - @voyant-travel/hono@0.138.1

## 0.11.8

### Patch Changes

- Updated dependencies [e87d4de]
  - @voyant-travel/hono@0.138.0
  - @voyant-travel/action-ledger@0.115.8
  - @voyant-travel/catalog@0.222.0
  - @voyant-travel/identity@0.224.0

## 0.11.7

### Patch Changes

- Updated dependencies [fae0f36]
  - @voyant-travel/tools@0.9.0
  - @voyant-travel/action-ledger@0.115.7
  - @voyant-travel/catalog@0.221.0
  - @voyant-travel/identity@0.223.0

## 0.11.6

### Patch Changes

- @voyant-travel/catalog@0.220.0
- @voyant-travel/identity@0.222.0

## 0.11.5

### Patch Changes

- Updated dependencies [d92a98a]
  - @voyant-travel/hono@0.137.0
  - @voyant-travel/action-ledger@0.115.6
  - @voyant-travel/catalog@0.219.1
  - @voyant-travel/identity@0.221.1

## 0.11.4

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
- Updated dependencies [52c794d]
- Updated dependencies [52c794d]
  - @voyant-travel/catalog@0.219.0
  - @voyant-travel/action-ledger@0.115.5
  - @voyant-travel/hono@0.136.0
  - @voyant-travel/tools@0.8.0
  - @voyant-travel/identity@0.221.0

## 0.11.3

### Patch Changes

- Updated dependencies [8adeb23]
- Updated dependencies [6d0b4b4]
- Updated dependencies [7496159]
- Updated dependencies [fa75fe3]
  - @voyant-travel/action-ledger@0.115.4
  - @voyant-travel/db@0.119.0
  - @voyant-travel/hono@0.135.0
  - @voyant-travel/catalog@0.218.0
  - @voyant-travel/availability@0.2.28
  - @voyant-travel/identity@0.220.0
  - @voyant-travel/types@0.109.10

## 0.11.2

### Patch Changes

- Updated dependencies [6df3ab4]
  - @voyant-travel/tools@0.7.2
  - @voyant-travel/catalog@0.217.0
  - @voyant-travel/identity@0.219.0

## 0.11.1

### Patch Changes

- @voyant-travel/catalog@0.216.0
- @voyant-travel/identity@0.218.0

## 0.11.0

### Minor Changes

- d3f16d5: Add exhaustive atomic product unit-configuration previews and confirmed applies, make departure creation durably idempotent with immediate projection signals, serialize partial departure timing updates with optional stale-snapshot conflicts while preserving patch compatibility, keep departure product ownership immutable, and label departure times with their configured timezone.

### Patch Changes

- @voyant-travel/catalog@0.215.0
- @voyant-travel/identity@0.217.0

## 0.10.8

### Patch Changes

- a653664: Add a provider-neutral `scale-to-zero` recovery profile for package-owned jobs,
  including channel-push subscribers, and expose safe durable-send,
  payment-reconciliation, promotion-reindex, and channel-push jobs to payload-free
  wakeups.
- Updated dependencies [a653664]
  - @voyant-travel/catalog@0.214.1
  - @voyant-travel/db@0.118.6

## 0.10.7

### Patch Changes

- @voyant-travel/catalog@0.214.0
- @voyant-travel/identity@0.216.0

## 0.10.6

### Patch Changes

- @voyant-travel/catalog@0.213.0
- @voyant-travel/identity@0.215.0

## 0.10.5

### Patch Changes

- @voyant-travel/catalog@0.212.0
- @voyant-travel/identity@0.214.0

## 0.10.4

### Patch Changes

- @voyant-travel/catalog@0.211.0
- @voyant-travel/identity@0.213.0

## 0.10.3

### Patch Changes

- Updated dependencies [e7ab7a6]
  - @voyant-travel/catalog@0.210.0
  - @voyant-travel/identity@0.212.0

## 0.10.2

### Patch Changes

- Updated dependencies [5026d3f]
  - @voyant-travel/catalog@0.209.0
  - @voyant-travel/identity@0.211.0

## 0.10.1

### Patch Changes

- @voyant-travel/catalog@0.208.0
- @voyant-travel/identity@0.210.0

## 0.10.0

### Minor Changes

- 8abbdd6: Add `create_departure` and `update_departure` agent tools.

  Operations shipped eight tools, all read-only, while its manifest declared `operations:write` and `operations:delete` scopes that nothing consumed. `compose_product` deliberately leaves departures out, so an agent could compose a product and then had no way to make it sellable — asked for "a tour running every Saturday in September", it created the product and reported that it had no tool for the departures. Both actions are ledgered and reversible.

### Patch Changes

- @voyant-travel/catalog@0.207.0
- @voyant-travel/identity@0.209.0

## 0.9.5

### Patch Changes

- 7547f67: Declare the expired-hold job's runtime port as a requirement, not only as something provided. Composition accepted the provide-only declaration and then rejected the port when the job actually fired, so the reaper failed on every run with `composeVoyantGraphRuntime: module "@voyant-travel/operations" requested undeclared port "operations.expired-holds-job"`.
  - @voyant-travel/catalog@0.206.0
  - @voyant-travel/identity@0.208.0

## 0.9.4

### Patch Changes

- 486044e: Schedule the abandoned-checkout hold reaper.

  `availability_holds` decrement `availability_slots.remaining_pax` as soon as a checkout reserves seats, and only `releaseExpiredHolds` gives that capacity back. That reaper shipped with no caller, so every abandoned checkout ate into a departure permanently. `operations.release-expired-availability-holds` now runs it on the same cadence as the booking-hold expiry job.

## 0.9.3

### Patch Changes

- 2cfce32: Fix Max/MCP tool failures: ISO aggregate date params, journal catalog overlay nodes, cruise ORDER BY NULLS LAST syntax, trips approval policy names, room-block missing room-type NOT_FOUND, and APPROVAL_REQUIRED fingerprint echo.
- Updated dependencies [2cfce32]
  - @voyant-travel/catalog@0.205.2

## 0.9.2

### Patch Changes

- @voyant-travel/catalog@0.205.0
- @voyant-travel/identity@0.207.0

## 0.9.1

### Patch Changes

- Updated dependencies [5daf427]
  - @voyant-travel/hono@0.134.6
  - @voyant-travel/catalog@0.204.0
  - @voyant-travel/identity@0.206.0

## 0.9.0

### Minor Changes

- 58baffe: Remove callable Tool name aliases from the standard Operator graph. MCP and
  other callers must use canonical Tool names only; previous compatibility names
  (for example `crm_*`, `legal_contract_*`, `availability_*`, `dashboard_summary`,
  `read_setup_state`, `products_compose`, `invoices_issue_from_booking`) no longer
  dispatch.

  Stop publicly exporting the deprecated Relationships Tools
  `add_relationship_note`, `add_relationship_contact_method`, and
  `add_relationship_address`. Use the person- or organization-specific add Tools
  selected by the graph instead.

  See the consolidated [caller migration
  page](../docs/migrations/removed-tool-aliases.md) for the complete old →
  canonical name mapping.

### Patch Changes

- @voyant-travel/catalog@0.203.0
- @voyant-travel/identity@0.205.0

## 0.8.47

### Patch Changes

- @voyant-travel/catalog@0.202.0
- @voyant-travel/identity@0.204.0

## 0.8.46

### Patch Changes

- Updated dependencies [17f1239]
  - @voyant-travel/catalog@0.201.0
  - @voyant-travel/tools@0.7.0
  - @voyant-travel/identity@0.203.0

## 0.8.45

### Patch Changes

- @voyant-travel/catalog@0.200.0
- @voyant-travel/identity@0.202.0

## 0.8.44

### Patch Changes

- Updated dependencies [a02a76b]
  - @voyant-travel/tools@0.6.0
  - @voyant-travel/catalog@0.199.1
  - @voyant-travel/identity@0.201.1

## 0.8.43

### Patch Changes

- @voyant-travel/catalog@0.199.0
- @voyant-travel/identity@0.201.0

## 0.8.42

### Patch Changes

- Updated dependencies [952d817]
  - @voyant-travel/catalog@0.198.0
  - @voyant-travel/core@0.136.0
  - @voyant-travel/availability@0.2.27
  - @voyant-travel/db@0.118.5
  - @voyant-travel/hono@0.134.5
  - @voyant-travel/identity@0.200.0

## 0.8.41

### Patch Changes

- Updated dependencies [3651ff7]
- Updated dependencies [c03ff60]
  - @voyant-travel/core@0.135.0
  - @voyant-travel/catalog@0.197.0
  - @voyant-travel/availability@0.2.26
  - @voyant-travel/db@0.118.4
  - @voyant-travel/hono@0.134.4
  - @voyant-travel/identity@0.199.0

## 0.8.40

### Patch Changes

- @voyant-travel/catalog@0.196.0
- @voyant-travel/identity@0.198.0

## 0.8.39

### Patch Changes

- Updated dependencies [b07a0a3]
  - @voyant-travel/core@0.134.0
  - @voyant-travel/tools@0.5.0
  - @voyant-travel/identity@0.197.0
  - @voyant-travel/availability@0.2.25
  - @voyant-travel/catalog@0.195.0
  - @voyant-travel/db@0.118.3
  - @voyant-travel/hono@0.134.3

## 0.8.38

### Patch Changes

- Updated dependencies [58020ec]
- Updated dependencies [bf548af]
- Updated dependencies [a6460e2]
- Updated dependencies [8a4f3cd]
- Updated dependencies
  - @voyant-travel/catalog@0.194.0
  - @voyant-travel/core@0.133.0
  - @voyant-travel/identity@0.196.0
  - @voyant-travel/tools@0.4.0
  - @voyant-travel/availability@0.2.24
  - @voyant-travel/db@0.118.2
  - @voyant-travel/hono@0.134.2

## 0.8.37

### Patch Changes

- @voyant-travel/catalog@0.193.0
- @voyant-travel/identity@0.195.0

## 0.8.36

### Patch Changes

- Updated dependencies [dd370ca]
  - @voyant-travel/catalog@0.192.0
  - @voyant-travel/core@0.132.1
  - @voyant-travel/identity@0.194.0

## 0.8.35

### Patch Changes

- Updated dependencies [a43267a]
- Updated dependencies [90d44c0]
- Updated dependencies [2c79bef]
  - @voyant-travel/catalog@0.191.0
  - @voyant-travel/identity@0.193.0

## 0.8.34

### Patch Changes

- Updated dependencies [a668d0d]
  - @voyant-travel/core@0.132.0
  - @voyant-travel/availability@0.2.23
  - @voyant-travel/catalog@0.190.1
  - @voyant-travel/db@0.118.1
  - @voyant-travel/hono@0.134.1
  - @voyant-travel/identity@0.192.1

## 0.8.33

### Patch Changes

- @voyant-travel/catalog@0.190.0
- @voyant-travel/identity@0.192.0

## 0.8.32

### Patch Changes

- @voyant-travel/catalog@0.189.0
- @voyant-travel/identity@0.191.0

## 0.8.31

### Patch Changes

- Updated dependencies [228b57d]
- Updated dependencies [f945310]
- Updated dependencies [9848276]
- Updated dependencies [dffbdad]
- Updated dependencies [f2c9404]
  - @voyant-travel/catalog@0.188.0
  - @voyant-travel/db@0.118.0
  - @voyant-travel/core@0.131.0
  - @voyant-travel/hono@0.134.0
  - @voyant-travel/availability@0.2.22
  - @voyant-travel/identity@0.190.0
  - @voyant-travel/types@0.109.9

## 0.8.30

### Patch Changes

- Updated dependencies [d9ff078]
  - @voyant-travel/catalog@0.187.0
  - @voyant-travel/identity@0.189.0

## 0.8.29

### Patch Changes

- Updated dependencies [9db4363]
  - @voyant-travel/hono@0.133.0
  - @voyant-travel/catalog@0.186.0
  - @voyant-travel/identity@0.188.0

## 0.8.28

### Patch Changes

- @voyant-travel/catalog@0.185.0
- @voyant-travel/identity@0.187.0

## 0.8.27

### Patch Changes

- @voyant-travel/catalog@0.184.0
- @voyant-travel/identity@0.186.0

## 0.8.26

### Patch Changes

- @voyant-travel/catalog@0.183.0
- @voyant-travel/identity@0.185.0

## 0.8.25

### Patch Changes

- @voyant-travel/catalog@0.182.0
- @voyant-travel/identity@0.184.0

## 0.8.24

### Patch Changes

- @voyant-travel/catalog@0.181.0
- @voyant-travel/identity@0.183.0

## 0.8.23

### Patch Changes

- Updated dependencies [b320e4f]
  - @voyant-travel/hono@0.132.0
  - @voyant-travel/catalog@0.180.1
  - @voyant-travel/identity@0.182.1

## 0.8.22

### Patch Changes

- @voyant-travel/catalog@0.180.0
- @voyant-travel/identity@0.182.0

## 0.8.21

### Patch Changes

- @voyant-travel/catalog@0.179.0
- @voyant-travel/identity@0.181.0

## 0.8.20

### Patch Changes

- @voyant-travel/catalog@0.178.0
- @voyant-travel/identity@0.180.0

## 0.8.19

### Patch Changes

- @voyant-travel/catalog@0.177.0
- @voyant-travel/identity@0.179.0

## 0.8.18

### Patch Changes

- @voyant-travel/catalog@0.176.0
- @voyant-travel/identity@0.178.0

## 0.8.17

### Patch Changes

- Updated dependencies [43e7754]
  - @voyant-travel/db@0.117.0
  - @voyant-travel/availability@0.2.21
  - @voyant-travel/catalog@0.175.0
  - @voyant-travel/hono@0.131.2
  - @voyant-travel/identity@0.177.0
  - @voyant-travel/types@0.109.8

## 0.8.16

### Patch Changes

- Updated dependencies [abc32b6]
  - @voyant-travel/db@0.116.0
  - @voyant-travel/availability@0.2.20
  - @voyant-travel/catalog@0.174.0
  - @voyant-travel/hono@0.131.1
  - @voyant-travel/identity@0.176.0
  - @voyant-travel/types@0.109.7

## 0.8.15

### Patch Changes

- Updated dependencies [a160a81]
  - @voyant-travel/core@0.130.0
  - @voyant-travel/db@0.115.0
  - @voyant-travel/hono@0.131.0
  - @voyant-travel/catalog@0.173.0
  - @voyant-travel/availability@0.2.19
  - @voyant-travel/identity@0.175.0
  - @voyant-travel/types@0.109.6

## 0.8.14

### Patch Changes

- Updated dependencies [b8b25b7]
  - @voyant-travel/core@0.129.0
  - @voyant-travel/availability@0.2.18
  - @voyant-travel/catalog@0.172.0
  - @voyant-travel/db@0.114.15
  - @voyant-travel/hono@0.130.1
  - @voyant-travel/identity@0.174.0

## 0.8.13

### Patch Changes

- @voyant-travel/catalog@0.171.0
- @voyant-travel/identity@0.173.0

## 0.8.12

### Patch Changes

- Updated dependencies [f6f22e7]
  - @voyant-travel/core@0.128.0
  - @voyant-travel/hono@0.130.0
  - @voyant-travel/catalog@0.170.0
  - @voyant-travel/availability@0.2.17
  - @voyant-travel/db@0.114.14
  - @voyant-travel/identity@0.172.0

## 0.8.11

### Patch Changes

- Updated dependencies [96c91b9]
  - @voyant-travel/hono@0.129.0
  - @voyant-travel/catalog@0.169.1
  - @voyant-travel/identity@0.171.1

## 0.8.10

### Patch Changes

- @voyant-travel/catalog@0.169.0
- @voyant-travel/identity@0.171.0

## 0.8.9

### Patch Changes

- Updated dependencies [117fa05]
  - @voyant-travel/core@0.127.0
  - @voyant-travel/availability@0.2.16
  - @voyant-travel/catalog@0.168.0
  - @voyant-travel/db@0.114.13
  - @voyant-travel/hono@0.128.6
  - @voyant-travel/identity@0.170.0

## 0.8.8

### Patch Changes

- Updated dependencies [698ddb6]
  - @voyant-travel/core@0.126.0
  - @voyant-travel/availability@0.2.15
  - @voyant-travel/catalog@0.167.1
  - @voyant-travel/db@0.114.11
  - @voyant-travel/hono@0.128.4
  - @voyant-travel/identity@0.169.1

## 0.8.7

### Patch Changes

- 590d256: Republish with dependency ranges resolved. The prior tarballs for these packages
  carry raw `workspace:` specifiers (they were published outside the pnpm-aware
  release flow) and cannot be installed by consumers. Also fixes the `runtime`
  package's `prepack`, which rebuilt the entire workspace dependency closure on
  every publish — the slow build stalled the release train's publish step past its
  timeout and wedged the whole batch. `prepack` now builds only the package itself,
  matching every other package.
  - @voyant-travel/catalog@0.167.0
  - @voyant-travel/identity@0.169.0

## 0.8.6

### Patch Changes

- @voyant-travel/catalog@0.166.0
- @voyant-travel/identity@0.168.0

## 0.8.5

### Patch Changes

- @voyant-travel/catalog@0.165.0
- @voyant-travel/identity@0.167.0

## 0.8.4

### Patch Changes

- @voyant-travel/catalog@0.164.0
- @voyant-travel/identity@0.166.0

## 0.8.3

### Patch Changes

- @voyant-travel/catalog@0.163.0
- @voyant-travel/identity@0.165.0

## 0.8.2

### Patch Changes

- Updated dependencies [fc3224a]
  - @voyant-travel/catalog@0.162.0
  - @voyant-travel/identity@0.164.0

## 0.8.1

### Patch Changes

- Updated dependencies [52352c4]
- Updated dependencies [52352c4]
- Updated dependencies [52352c4]
- Updated dependencies [52352c4]
- Updated dependencies [52352c4]
  - @voyant-travel/core@0.125.0
  - @voyant-travel/catalog@0.161.0
  - @voyant-travel/availability@0.2.14
  - @voyant-travel/db@0.114.9
  - @voyant-travel/hono@0.128.1
  - @voyant-travel/identity@0.163.0

## 0.8.0

### Minor Changes

- 8f0fa26: Make Hono the explicit sole server API runtime while moving package and
  deployment interfaces to role-based API vocabulary. Replace Hono-prefixed module,
  extension, bundle, lazy-route, and factory names with `Api*` names; move
  router-named domain runtime entry points to `./api-runtime`; and remove the old
  names without compatibility aliases.

### Patch Changes

- Updated dependencies [8f0fa26]
  - @voyant-travel/catalog@0.160.0
  - @voyant-travel/hono@0.128.0
  - @voyant-travel/identity@0.162.0
  - @voyant-travel/db@0.114.8

## 0.7.1

### Patch Changes

- Updated dependencies [a1842a7]
  - @voyant-travel/hono@0.127.2
  - @voyant-travel/catalog@0.159.0
  - @voyant-travel/identity@0.161.0

## 0.7.0

### Minor Changes

- 372f4f4: Add a separately selectable Operations-owned dashboard Tool that composes the real aggregate
  services from Bookings, Finance, Inventory, Distribution, and Operations without crossing domain
  persistence boundaries. Require every underlying read scope and return structural source
  projections, KPIs, and bounded alerts.

  Complete the Quotes proposal lifecycle Tool surface with snapshot, send, accept, and decline
  capabilities, structural JSON-safe outputs, compatibility aliases, staff-only grants,
  confirmation, and graph-ledger/approval policy.

- 90e8d6d: Expose module-owned, staff-scoped read Tools for availability overview and dashboard aggregates,
  recurrence rules, start times, departures, and closeouts. Bind each Tool to the selected graph and
  its read action, contribute Operations services to MCP context, and support bounded departure
  windows plus hosted-consumer compatibility aliases.

### Patch Changes

- Updated dependencies [cabf662]
- Updated dependencies [5617f37]
- Updated dependencies [7ac40a0]
- Updated dependencies [b8cef4c]
- Updated dependencies [d9e8984]
- Updated dependencies [db5adce]
- Updated dependencies [c9b6144]
- Updated dependencies [6604f9e]
- Updated dependencies [ff87f68]
  - @voyant-travel/core@0.124.0
  - @voyant-travel/tools@0.3.0
  - @voyant-travel/availability@0.2.13
  - @voyant-travel/catalog@0.158.0
  - @voyant-travel/identity@0.160.0
  - @voyant-travel/db@0.114.7
  - @voyant-travel/hono@0.127.1

## 0.6.14

### Patch Changes

- 49f55d0: Keep catalog booking and checkout as a two-phase flow, and atomically convert
  owned-product availability holds into on-hold booking allocations without
  consuming capacity twice. Hold placement and release are now idempotent across
  retries and duplicate tokens, converted holds retain an audit link to their
  booking allocation, and checkout-only intents receive structured validation
  errors from the reservation route.
- Updated dependencies [7e9f77a]
- Updated dependencies [49f55d0]
- Updated dependencies [9c85101]
  - @voyant-travel/core@0.123.0
  - @voyant-travel/hono@0.127.0
  - @voyant-travel/availability@0.2.12
  - @voyant-travel/catalog@0.157.0
  - @voyant-travel/db@0.114.6
  - @voyant-travel/identity@0.159.0

## 0.6.13

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
  - @voyant-travel/availability@0.2.11
  - @voyant-travel/catalog@0.156.0
  - @voyant-travel/core@0.122.2
  - @voyant-travel/db@0.114.5
  - @voyant-travel/identity@0.158.0
  - @voyant-travel/types@0.109.2

## 0.6.12

### Patch Changes

- Updated dependencies [0808b21]
  - @voyant-travel/catalog@0.155.0
  - @voyant-travel/identity@0.157.0

## 0.6.11

### Patch Changes

- 8d62a7c: Republish every affected TypeScript package without broken declaration maps so the corrected artifact
  policy reaches npm instead of applying only to future incidental package releases.
- Updated dependencies [8d62a7c]
- Updated dependencies [7916020]
- Updated dependencies [8d62a7c]
  - @voyant-travel/core@0.122.1
  - @voyant-travel/db@0.114.4
  - @voyant-travel/types@0.109.1
  - @voyant-travel/catalog@0.154.1
  - @voyant-travel/allotments@0.2.1
  - @voyant-travel/availability@0.2.10
  - @voyant-travel/hono@0.126.3
  - @voyant-travel/identity@0.156.1

## 0.6.10

### Patch Changes

- @voyant-travel/catalog@0.154.0
- @voyant-travel/db@0.114.3
- @voyant-travel/identity@0.156.0

## 0.6.9

### Patch Changes

- Updated dependencies [cc85042]
- Updated dependencies [07a6ee3]
  - @voyant-travel/core@0.122.0
  - @voyant-travel/db@0.114.2
  - @voyant-travel/hono@0.126.2
  - @voyant-travel/availability@0.2.9
  - @voyant-travel/catalog@0.153.1
  - @voyant-travel/identity@0.155.1

## 0.6.8

### Patch Changes

- Updated dependencies [3f6694b]
  - @voyant-travel/core@0.121.0
  - @voyant-travel/availability@0.2.8
  - @voyant-travel/catalog@0.153.0
  - @voyant-travel/db@0.114.1
  - @voyant-travel/hono@0.126.1
  - @voyant-travel/identity@0.155.0

## 0.6.7

### Patch Changes

- Updated dependencies [4d0eeed]
- Updated dependencies [bef5b7c]
  - @voyant-travel/hono@0.126.0
  - @voyant-travel/types@0.109.0
  - @voyant-travel/db@0.114.0
  - @voyant-travel/core@0.120.0
  - @voyant-travel/catalog@0.152.0
  - @voyant-travel/identity@0.154.0
  - @voyant-travel/availability@0.2.7

## 0.6.6

### Patch Changes

- 490d132: Move standard first-party admin factories, package copy, slots, contributions, and icons into selected deployment graph composition.
- 490d132: Replace temporary nested owner exports with intentional validation, linkable, scheduling, and workflow public surfaces.
- 490d132: Move platform and operations OpenAPI authority into the owning package manifests and publish their committed documents from package-local exports.
- 490d132: Make package and project declarations the sole selected access authority, removing legacy catalog overlays and runtime synthesis.
- 490d132: Remove the final Operator admin factory compatibility registry by composing cross-domain behavior through package-owned selected graph slots and contributions.
- Updated dependencies [c65b05c]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [047c3f9]
- Updated dependencies [490d132]
- Updated dependencies [c65b05c]
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
- Updated dependencies [047c3f9]
- Updated dependencies [282892e]
- Updated dependencies [490d132]
  - @voyant-travel/db@0.113.0
  - @voyant-travel/core@0.119.0
  - @voyant-travel/catalog@0.151.0
  - @voyant-travel/hono@0.125.1
  - @voyant-travel/availability@0.2.6
  - @voyant-travel/types@0.108.1
  - @voyant-travel/identity@0.153.0

## 0.6.5

### Patch Changes

- Updated dependencies [e68bdc1]
- Updated dependencies [d771be3]
- Updated dependencies [8e67fe8]
- Updated dependencies [26fe0e5]
- Updated dependencies [8f4c242]
- Updated dependencies [d771be3]
- Updated dependencies [8f537b0]
- Updated dependencies [d26a820]
- Updated dependencies [d771be3]
- Updated dependencies [bd7a830]
  - @voyant-travel/catalog@0.150.0
  - @voyant-travel/core@0.118.0
  - @voyant-travel/types@0.108.0
  - @voyant-travel/hono@0.125.0
  - @voyant-travel/identity@0.152.0
  - @voyant-travel/availability@0.2.5
  - @voyant-travel/db@0.112.2

## 0.6.4

### Patch Changes

- Updated dependencies [c66f9a5]
  - @voyant-travel/core@0.117.0
  - @voyant-travel/availability@0.2.4
  - @voyant-travel/catalog@0.149.4
  - @voyant-travel/db@0.112.1
  - @voyant-travel/hono@0.124.1
  - @voyant-travel/identity@0.151.4

## 0.6.3

### Patch Changes

- Updated dependencies [ca90eb5]
  - @voyant-travel/db@0.112.0
  - @voyant-travel/hono@0.124.0
  - @voyant-travel/availability@0.2.3
  - @voyant-travel/catalog@0.149.3
  - @voyant-travel/identity@0.151.3
  - @voyant-travel/types@0.107.3

## 0.6.2

### Patch Changes

- Updated dependencies [8576451]
  - @voyant-travel/core@0.116.0
  - @voyant-travel/availability@0.2.2
  - @voyant-travel/catalog@0.149.2
  - @voyant-travel/db@0.111.2
  - @voyant-travel/hono@0.123.2
  - @voyant-travel/identity@0.151.2

## 0.6.1

### Patch Changes

- Updated dependencies [e4e6621]
- Updated dependencies [953e418]
- Updated dependencies [2153e48]
  - @voyant-travel/core@0.115.0
  - @voyant-travel/catalog@0.149.1
  - @voyant-travel/hono@0.123.0
  - @voyant-travel/availability@0.2.1
  - @voyant-travel/db@0.111.1
  - @voyant-travel/identity@0.151.1

## 0.6.0

### Minor Changes

- e3dc5a9: Declare package-owned admin route and copy facets for vertical modules with existing public admin extensions.
- a370024: Publish package-owned deployment manifests for identity, relationships, finance,
  and operations graph surfaces.
- e3dc5a9: Declare package-owned Node deployment facets for product events, subscribers, workflows, access resources, tools, actions, and retain-data lifecycle behavior.

### Patch Changes

- Updated dependencies [a370024]
- Updated dependencies [a370024]
- Updated dependencies [e3dc5a9]
- Updated dependencies [e3dc5a9]
- Updated dependencies [e3dc5a9]
- Updated dependencies [a370024]
- Updated dependencies [e3dc5a9]
- Updated dependencies [e3dc5a9]
- Updated dependencies [a370024]
- Updated dependencies [a370024]
- Updated dependencies [a370024]
- Updated dependencies [e3dc5a9]
- Updated dependencies [a370024]
- Updated dependencies [e3dc5a9]
- Updated dependencies [e3dc5a9]
- Updated dependencies [e3dc5a9]
- Updated dependencies [e3dc5a9]
- Updated dependencies [e3dc5a9]
  - @voyant-travel/core@0.114.0
  - @voyant-travel/catalog@0.149.0
  - @voyant-travel/availability@0.2.0
  - @voyant-travel/db@0.111.0
  - @voyant-travel/identity@0.151.0
  - @voyant-travel/hono@0.122.4
  - @voyant-travel/types@0.107.2

## 0.5.23

### Patch Changes

- Updated dependencies [496f2ef]
  - @voyant-travel/core@0.113.0
  - @voyant-travel/catalog@0.148.0
  - @voyant-travel/db@0.110.2
  - @voyant-travel/hono@0.122.3
  - @voyant-travel/identity@0.150.0

## 0.5.22

### Patch Changes

- 5e1d221: Publish `voyant.package.v1` compatibility metadata from first-party
  schema-owning packages so deployment graph package admission can validate their
  framework, target, and deployment-mode compatibility before runtime imports.
- Updated dependencies [5e1d221]
- Updated dependencies [682d7d0]
  - @voyant-travel/availability@0.1.3
  - @voyant-travel/catalog@0.147.1
  - @voyant-travel/db@0.110.1
  - @voyant-travel/identity@0.149.1
  - @voyant-travel/hono@0.122.2

## 0.5.21

### Patch Changes

- @voyant-travel/catalog@0.147.0
- @voyant-travel/identity@0.149.0

## 0.5.20

### Patch Changes

- @voyant-travel/catalog@0.146.0
- @voyant-travel/identity@0.148.0

## 0.5.19

### Patch Changes

- @voyant-travel/catalog@0.145.0
- @voyant-travel/identity@0.147.0

## 0.5.18

### Patch Changes

- @voyant-travel/catalog@0.144.0
- @voyant-travel/identity@0.146.0

## 0.5.17

### Patch Changes

- Updated dependencies [4829ef3]
  - @voyant-travel/catalog@0.143.0
  - @voyant-travel/identity@0.145.0

## 0.5.16

### Patch Changes

- @voyant-travel/catalog@0.142.0
- @voyant-travel/identity@0.144.0

## 0.5.15

### Patch Changes

- Updated dependencies [425f92e]
  - @voyant-travel/db@0.110.0
  - @voyant-travel/hono@0.122.0
  - @voyant-travel/core@0.112.3
  - @voyant-travel/availability@0.1.2
  - @voyant-travel/catalog@0.141.0
  - @voyant-travel/identity@0.143.0
  - @voyant-travel/types@0.107.1

## 0.5.14

### Patch Changes

- @voyant-travel/catalog@0.140.0
- @voyant-travel/identity@0.142.0

## 0.5.13

### Patch Changes

- Updated dependencies [6711f4c]
  - @voyant-travel/catalog@0.139.0
  - @voyant-travel/identity@0.141.0

## 0.5.12

### Patch Changes

- @voyant-travel/catalog@0.138.0
- @voyant-travel/identity@0.140.0

## 0.5.11

### Patch Changes

- ecff8cf: Fix silently-unbookable availability slots and opaque bootstrap errors (#2833)

  - `createSlot` now seeds `remaining_pax = initial_pax` for a bounded slot when
    the caller omits `remainingPax`, so a slot created via
    `{ initialPax, unlimited: false }` no longer lands with `remaining_pax = NULL`
    and read as sold out from birth by the booking engine's capacity reservation.
  - `reserveBooking` tolerates an option-less slot (`option_id = NULL`): such a
    slot is not option-scoped, so an item carrying a derived option id no longer
    fails `slot_option_mismatch`. This unblocks storefront compat bootstrap, which
    derives and stamps an option id onto the booking item.
  - The storefront bootstrap error contract maps `slot_product_mismatch` and
    `slot_option_mismatch` to dedicated codes (`SLOT_PRODUCT_MISMATCH`,
    `SLOT_OPTION_MISMATCH`) instead of collapsing them into the generic
    `BOOTSTRAP_FAILED` fallback.

## 0.5.10

### Patch Changes

- Updated dependencies [c9a356f]
- Updated dependencies [689a289]
- Updated dependencies [6474f42]
- Updated dependencies [5786f63]
- Updated dependencies [22f0457]
  - @voyant-travel/types@0.107.0
  - @voyant-travel/core@0.112.0
  - @voyant-travel/hono@0.121.0
  - @voyant-travel/catalog@0.137.0
  - @voyant-travel/identity@0.139.0
  - @voyant-travel/db@0.109.5

## 0.5.9

### Patch Changes

- f1090b7: Align resource assignment detail schemas around `assignedAt`, reject orphan or incoherent slot assignment lifecycle payloads, and surface assignment target validation in the admin UI.
- 42f662c: Reject inverted, duplicate, and overlapping resource closeout windows and surface matching admin form validation.
- fead555: Prevent operations resource PATCH payloads from applying create defaults to omitted fields.
- Updated dependencies [1cb9cba]
- Updated dependencies [131ff9b]
  - @voyant-travel/hono@0.120.0
  - @voyant-travel/catalog@0.136.3
  - @voyant-travel/identity@0.138.2

## 0.5.8

### Patch Changes

- Updated dependencies [86fbb05]
  - @voyant-travel/hono@0.119.0
  - @voyant-travel/catalog@0.136.2
  - @voyant-travel/identity@0.138.1

## 0.5.7

### Patch Changes

- dd03968: Validate operations resource local references and duplicate pool memberships with deterministic 404/409 API errors. Duplicate resource pool memberships are now deduplicated during migration before a unique index enforces the invariant.
- Updated dependencies [2d3b039]
  - @voyant-travel/catalog@0.136.1

## 0.5.6

### Patch Changes

- @voyant-travel/catalog@0.136.0
- @voyant-travel/identity@0.138.0

## 0.5.5

### Patch Changes

- ed5463f: Reject invalid availability API payloads for impossible slot timing, capacity
  overages, mismatched local dates, and malformed recurrence rules.

## 0.5.4

### Patch Changes

- fcb8b88: Add catalog-authoring validation for transfer pickup/dropoff rules, block static availability for dynamic products, and require scheduled products to have a future open departure before publishing.

## 0.5.3

### Patch Changes

- Updated dependencies [9a1197b]
  - @voyant-travel/hono@0.118.0
  - @voyant-travel/catalog@0.135.1
  - @voyant-travel/identity@0.137.1

## 0.5.2

### Patch Changes

- Updated dependencies [7c5ee80]
  - @voyant-travel/hono@0.117.0
  - @voyant-travel/catalog@0.135.0
  - @voyant-travel/identity@0.137.0

## 0.5.1

### Patch Changes

- 12a1eb2: Expose client-safe subpaths for validation schemas, linkable metadata, template authoring metadata, finance payment-policy primitives, and Hono reporter utilities. Move browser-facing React/operator imports off mixed runtime barrels so client bundles do not pull Hono request context or other server-only runtime code.
- Updated dependencies [12a1eb2]
  - @voyant-travel/hono@0.116.2
  - @voyant-travel/identity@0.136.2

## 0.5.0

### Minor Changes

- 787c852: Space blocks + shared allotment-lifecycle primitive (Phase 2b).

  - New `@voyant-travel/allotments`: the canonical allotment lifecycle contract
    (status state machine, counter math, pickup-progress derivation, slot
    enumeration) — one contract reused by type-specific tables (RFC §9-Q2).
  - accommodations: room-block service refactored onto the shared primitive
    (behavior-preserving; enum values unchanged, no migration).
  - operations: `space_blocks` / `space_block_slots` / `space_block_pickups` —
    held function-space inventory over a date range, the 2nd allotment consumer;
    transactional pickup/reversal/cutoff service + admin routes + `spaceBlockLinkable`.
  - schema-kit: TypeID prefixes `spbl` / `spsl` / `sppu`.

### Patch Changes

- Updated dependencies [787c852]
- Updated dependencies [293e5e4]
  - @voyant-travel/allotments@0.2.0
  - @voyant-travel/hono@0.116.1
  - @voyant-travel/db@0.109.2
  - @voyant-travel/catalog@0.134.0
  - @voyant-travel/identity@0.136.0

## 0.4.0

### Minor Changes

- 924d201: Room-block allotment (Phase 1) + MICE program spine.

  - accommodations: `room_blocks` / `room_block_nights` / `room_block_pickups` with
    per-night counters, CHECK invariants, an append-only pickup ledger, and a
    transactional pickup/reversal/cutoff-release service; first
    `accommodationsHonoModule` (registered in the framework standard set) +
    `roomBlockLinkable`.
  - operations: `property` / `facility` linkable definitions.
  - mice (new): `mice_programs` umbrella + admin routes + `programLinkable`,
    mounted operator-local.
  - schema-kit: TypeID prefixes `hrbn` / `hrbp` / `prog`.

- f311826: Function spaces + capacity-by-layout (operations) and agenda sessions (mice) — Phase 2.

  - operations: `function_spaces` (venue sub-spaces, nestable via `parentSpaceId`
    for combinable rooms / exhibition booths) + `function_space_capacities`
    (per-layout headcount: theater / classroom / banquet / cabaret / boardroom /
    u_shape / reception / hollow_square); service + admin routes + `functionSpaceLinkable`.
  - mice: `mice_program_sessions` (timed, capacity-bound agenda items with
    session type + optional function-space link) + `mice_session_inclusions`
    (F&B / AV / materials / signage); service + admin routes + `sessionLinkable`.
  - schema-kit: TypeID prefixes `fnsp` / `fnsc` / `mpss` / `mssi`.

### Patch Changes

- @voyant-travel/db@0.109.1
- @voyant-travel/catalog@0.133.0
- @voyant-travel/identity@0.135.0

## 0.3.1

### Patch Changes

- Updated dependencies [684b321]
- Updated dependencies [2542715]
  - @voyant-travel/hono@0.116.0
  - @voyant-travel/catalog@0.132.1
  - @voyant-travel/identity@0.134.1

## 0.3.0

### Minor Changes

- 51f7dea: Share one list-response contract instead of per-module copies (voyant#2109).

  `@voyant-travel/types` now owns the canonical offset-paginated list envelope: the `ListResponse<T>` type + `listResponse(data, { total, limit, offset })` builder, plus the zod `paginationSchema` (coerced `limit` 1–200 default 50, `offset` ≥0 default 0) and the `listResponseSchema(item)` factory. Both server services and `*-react` clients import from this single source.

  Server side: every module's local `paginate()` / inline `{ data, total, limit, offset }` construction now routes through the shared `listResponse` builder, and the count read is standardized on `count` internally — fixing the drift where finance, notifications and the legal contracts/policies services read `countResult[0]?.total` while every other module read `countResult[0]?.count` (their `count(*)` selects were aliased `total`; they are now aliased `count`). The returned shape is byte-for-byte identical.

  Client side: the ~23 copied `paginatedEnvelope` zod schemas across the `*-react` packages are replaced by re-exporting the shared `listResponseSchema` factory under the same `paginatedEnvelope` name, so consumers are unchanged.

  Input alignment: `finance-contracts` and `legal-contracts` pagination `limit` caps were raised from `.max(100)` to `.max(200)` to match the framework-wide max.

  Additive and non-breaking.

### Patch Changes

- Updated dependencies [04b257c]
- Updated dependencies [78c15fa]
- Updated dependencies [51f7dea]
  - @voyant-travel/hono@0.115.0
  - @voyant-travel/types@0.106.0
  - @voyant-travel/identity@0.134.0
  - @voyant-travel/catalog@0.132.0

## 0.2.8

### Patch Changes

- Updated dependencies [4abf9a2]
  - @voyant-travel/hono@0.114.0
  - @voyant-travel/db@0.109.0
  - @voyant-travel/catalog@0.131.0
  - @voyant-travel/identity@0.133.0
  - @voyant-travel/availability@0.1.1

## 0.2.7

### Patch Changes

- Updated dependencies [6a0edd2]
  - @voyant-travel/catalog@0.130.0
  - @voyant-travel/identity@0.132.0

## 0.2.6

### Patch Changes

- Updated dependencies [021ec00]
  - @voyant-travel/hono@0.113.0
  - @voyant-travel/core@0.111.0
  - @voyant-travel/catalog@0.129.1
  - @voyant-travel/identity@0.131.1
  - @voyant-travel/db@0.108.5

## 0.2.5

### Patch Changes

- ba89f0b: Let admin departure edits choose and persist a product option so existing departures with a missing option can be repaired from the UI. Explicit slot option links are now validated against the slot product while product-level generated slots can still omit an option.

## 0.2.4

### Patch Changes

- @voyant-travel/catalog@0.129.0
- @voyant-travel/identity@0.131.0

## 0.2.3

### Patch Changes

- @voyant-travel/catalog@0.128.0
- @voyant-travel/identity@0.130.0

## 0.2.2

### Patch Changes

- Updated dependencies [7779772]
  - @voyant-travel/catalog@0.127.0
  - @voyant-travel/identity@0.129.0

## 0.2.1

### Patch Changes

- @voyant-travel/catalog@0.126.0
- @voyant-travel/identity@0.128.0

## 0.2.0

### Minor Changes

- 435a5d1: Extract the availability domain into a new foundational `@voyant-travel/availability` package, and complete D.2 per-package migration onboarding for the last schema-owning packages.

  - **@voyant-travel/availability (new):** owns the `availability_*` schema (slots, rules, start times, holds, pickups, capacity) — previously buried in operations. Ships its own D.2 migration.
  - **operations:** its availability **services and routes stay**, now importing the schema from `@voyant-travel/availability` (the barrel re-exports it for runtime consumers); operations' migration no longer owns the availability tables. Fixes the module direction — bookings/operations/accommodations consume availability, rather than reaching into operations for an inventory primitive.
  - **bookings:** drops the hard cross-package FK from `booking_allocations.availability_slot_id` to `availability_slots` (it referenced a stale local duplicate); the column is now a plain indexed id per module decoupling. The refund workflow keeps a runtime-only reference to the availability table.
  - **framework-migrations:** bundle migration drops the removed FK constraint.

  All package sources verified column-for-column against the bundle and apply together cleanly on a fresh D.2 database (union).

### Patch Changes

- Updated dependencies [435a5d1]
  - @voyant-travel/availability@0.1.0
  - @voyant-travel/catalog@0.125.0
  - @voyant-travel/identity@0.127.0

## 0.1.7

### Patch Changes

- 4893352: D.2 slice 1 (batch 3) — operations now owns and ships its migration history (drizzle.migrations.config.ts, db:generate, generated migrations/ baseline in `files`). Its declared cross-package FK into @voyant-travel/identity (identityAddresses) resolves via the closure (identity applied first). Verified column-for-column against the framework bundle, and the full fresh-D.2 union still applies cleanly. See `docs/architecture/migration-collector-d2.md`.
- Updated dependencies [1841ce2]
  - @voyant-travel/db@0.108.4
  - @voyant-travel/identity@0.126.1
  - @voyant-travel/catalog@0.124.1

## 0.1.6

### Patch Changes

- @voyant-travel/catalog@0.124.0
- @voyant-travel/identity@0.126.0

## 0.1.5

### Patch Changes

- @voyant-travel/db@0.108.3
- @voyant-travel/catalog@0.123.0
- @voyant-travel/identity@0.125.0
- @voyant-travel/hono@0.112.2

## 0.1.4

### Patch Changes

- @voyant-travel/hono@0.112.1
- @voyant-travel/catalog@0.122.0
- @voyant-travel/identity@0.124.0

## 0.1.3

### Patch Changes

- Updated dependencies [98f4a40]
- Updated dependencies [a3bd51c]
- Updated dependencies [3b27dcc]
- Updated dependencies [39d48fe]
- Updated dependencies [d222e9f]
  - @voyant-travel/core@0.110.0
  - @voyant-travel/hono@0.112.0
  - @voyant-travel/catalog@0.121.0
  - @voyant-travel/db@0.108.2
  - @voyant-travel/identity@0.123.0

## 0.1.2

### Patch Changes

- @voyant-travel/catalog@0.120.0
- @voyant-travel/identity@0.122.0

## 0.1.1

### Patch Changes

- Updated dependencies [11095db]
- Updated dependencies [13fe70b]
- Updated dependencies [9ea7220]
  - @voyant-travel/catalog@0.119.0
  - @voyant-travel/hono@0.111.0
  - @voyant-travel/identity@0.121.0

## 0.1.0

### Minor Changes

- 3408b2a: Move availability, allocation UI, resources, ground logistics, and places source
  under Operations owner paths. The old operated-execution package names are
  removed from the v1 workspace surface while first-party runtime, React, and
  operator imports use `@voyant-travel/operations` and `@voyant-travel/operations-react`
  surfaces.

### Patch Changes

- eb17d3d: Add owner-path schema manifest metadata for Commerce and Operations, expose the
  Distribution counterparty interface, and refresh operator schema/link generated
  artifacts for the v1 package restructure.
- 47fef18: Retarget first-party imports from the removed beta package names to their owner
  packages. Operated product UI now imports Inventory React, commercial UI imports
  Commerce React, supplier UI imports Distribution React, checkout UI imports
  Finance React, and operated place/availability schema references import
  Operations owner paths.
- Updated dependencies [c9ec9f8]
- Updated dependencies [6bff46f]
  - @voyant-travel/catalog@0.118.0
  - @voyant-travel/hono@0.110.0
  - @voyant-travel/identity@0.120.0
