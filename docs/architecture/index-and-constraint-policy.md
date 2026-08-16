# Voyant Index And Constraint Policy

This guide extends
[`data-model-schema-authoring.md`](./data-model-schema-authoring.md) with more
explicit guidance for composite indexes, partial indexes, unique constraints,
and check constraints.

The goal is narrow:

- make index and constraint choices reviewable and repeatable
- tie schema policy back to real Voyant query shapes
- improve correctness and query performance without inventing a new schema
  abstraction

Voyant stays Drizzle-first. This guide is about disciplined schema authoring,
not automated schema optimization.

## Core Rules

### 1. Start from query shape, not from column-by-column habit

An index should exist because a real read path needs it.

That read path should be visible in:

- service queries
- route handlers
- workflow queries
- daemon reconciliation passes

Rule:

When proposing an index, name the concrete query shape it supports.

### 2. Prefer one honest composite index over multiple decorative single-column indexes

If a query repeatedly filters by the same column group, model that group as a
group.

Good candidates:

- equality filters followed by a stable sort
- scoped lookups with a dominant selector tuple
- uniqueness that is only meaningful inside a parent or scope

Bad candidates:

- creating every pairwise index just because two columns can appear together
- adding a composite index before one query shape clearly dominates

Rule:

Use a composite index when the query shape is stable and repeated. Do not add
pairwise combinations speculatively.

### 3. Keep single-column indexes for independently selective filters

Single-column indexes are still appropriate when a table supports multiple
independent selectors and no one composite dominates yet.

Examples:

- optional admin list filters
- foreign-key joins
- one-off lookup identifiers

Rule:

Use single-column indexes for independent selectors. Promote to a composite
index only when one real combined pattern proves hotter than the rest.

### 4. Use unique constraints for stable business invariants

Use unique indexes when the invariant is always invalid to violate, regardless
of caller or workflow.

Examples:

- one version number per parent record
- one code per product
- one external reference per source/object identifier tuple

Rule:

If the invariant is stable and local to the table or scope, prefer a unique
constraint over service-only validation.

### 5. Use check constraints for stable local correctness rules

Check constraints are appropriate when the rule is:

- local to one row
- stable over time
- cheap to validate
- not dependent on caller-specific business flow

Examples:

- non-negative amounts
- bounded percentages
- valid date ordering when both dates exist
- mutually exclusive local flags where one row alone contains the rule

Rule:

Use a check constraint when the invalid state is universally invalid and does
not depend on workflow context.

### 6. Use partial indexes only when the predicate is stable and important

Partial indexes are useful for hot subsets such as:

- active records
- pending work
- published rows
- rows awaiting follow-up

They are not appropriate for every boolean or nullable field.

Rule:

Use a partial index only when:

- the predicate is stable
- the subset is frequently queried
- the subset is materially smaller than the full table

### 7. Do not fake search performance with ordinary btree indexes

If a query depends on:

- `ILIKE`
- multi-column text search
- related-table `exists(...)` text probing

then ordinary btree indexes are usually not the real answer.

That query may need:

- a search-specific index strategy
- a projection
- or acceptance that the read path remains baseline-grade until workload
  evidence justifies more

Rule:

Do not add decorative btree indexes for text-search-like workloads that they do
not materially improve.

## Review Heuristics

When reviewing a schema change:

1. What exact query shape is this index or constraint for?
2. Is the rule local and stable enough for the database to own it?
3. Is the shape one dominant tuple, or several independent selectors?
4. Would a partial predicate stay stable and meaningful over time?
5. Is this actually a search problem rather than an indexing problem?

## Query Audit Examples

The purpose of this section is to anchor policy in real Voyant code rather than
in generic database folklore.

### 8. Storefront verification: composite lookup is the right shape

Query:

- [`getLatestChallenge(...)`](../../packages/public-api/src/verification/service.ts)
  filters by `channel`, `destination`, and `purpose`, then orders the latest
  row by timestamps.

Schema:

- [`customerVerificationChallenges`](../../packages/public-api/src/verification/schema.ts)
  already has:
  - single-column indexes for `channel`, `destination`, `purpose`, and `status`
  - composite lookup index
    `idx_storefront_verification_lookup(channel, destination, purpose, status)`

Policy outcome:

- this is a good example of a justified composite lookup index
- if one dominant hot path becomes "pending challenge lookup" rather than
  general lookup, a partial index may become justified later
- no broader indexing framework is required

### 9. Policy assignments: keep independent selectors until one dominant tuple emerges

Query:

- [`listPolicyAssignments(...)`](../../packages/legal/src/policies/service-core.ts)
  supports multiple optional filters:
  `policyId`, `scope`, `productId`, `channelId`, `supplierId`, `marketId`,
  `organizationId`, then sorts by `priority` and `createdAt`

Schema:

- [`policyAssignments`](../../packages/legal/src/policies/schema.ts) currently
  uses single-column indexes for each optional selector plus `priority`

Policy outcome:

- this is the correct baseline
- do **not** create composite indexes for every possible nullable scope
  combination
- only promote one query path into a composite index when real usage shows one
  scope or tuple dominates

### 10. Suppliers: equality filters and text search should not be conflated

Query:

- [`listSuppliers(...)`](../../packages/distribution/src/suppliers/service-core.ts)
  filters by `type`, `status`, and `primaryFacilityId`, then sorts by
  `createdAt`
- the same query also performs `ILIKE` and `exists(...)` searches across
  identity tables

Schema:

- [`suppliers`](../../packages/distribution/src/suppliers/schema.ts) has single-column
  indexes for `type`, `status`, and `primaryFacilityId`

Policy outcome:

- the equality filters are good candidates for ordinary indexes
- the related-table text search is **not** a reason to spray more ordinary
  btree indexes across every searched text column
- if supplier search becomes a real hotspot, address it as search/projection
  work, not as decorative index inflation

### 11. Policy versions: scoped uniqueness belongs in the database

Query and invariant:

- policy versions are listed by `policyId` and ordered by descending `version`
- duplicate version numbers within one policy would always be invalid

Schema:

- [`policyVersions`](../../packages/legal/src/policies/schema.ts) uses
  `uniqueIndex("uq_policy_versions_policy_version").on(policyId, version)`

Policy outcome:

- this is the right use of a scoped unique constraint
- the invariant is local, stable, and independent of caller behavior

## Practical Checklist

When adding an index or constraint:

1. Point to the real query or invariant.
2. Decide whether the shape is one dominant tuple or several independent
   selectors.
3. Use a composite index only when the tuple is stable and repeated.
4. Use a partial index only when the predicate is stable and materially narrows
   the hot set.
5. Use a unique or check constraint only for stable local invariants.
6. If the problem is really search, say so instead of pretending it is solved
   by ordinary indexing.

## Non-Goals

This guide does not introduce:

- automatic index generation
- package-level query planners
- a schema metadata DSL for index hints
- platform-wide projection infrastructure

The goal is disciplined schema review, not a schema optimization framework.
