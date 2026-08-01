# Voyant Data Model And Schema Authoring

This guide defines how Voyant modules should model data without inventing a
framework-specific schema DSL on top of Drizzle.

The goal is straightforward:

- keep module data models explicit and easy to reason about
- keep cross-module coupling low
- make schema patterns repeatable across packages
- keep migrations owned by the app/starter layer

Voyant should stay Drizzle-first. The cleanup here is about consistency and
discipline, not replacing the underlying tooling.

For deeper guidance on composite indexes, partial indexes, scoped uniqueness,
and check constraints, see
[`index-and-constraint-policy.md`](./index-and-constraint-policy.md).

## Core Rules

### 1. Modules own their own tables

A module should own the tables that define its domain.

That includes:

- its canonical records
- local foreign keys between its own tables
- local indexes and constraints
- local relations used by its own service layer

Examples:

- `bookings`, `bookingParticipants`, and `bookingItems` belong to the bookings
  module
- `invoices` and `payments` belong to the finance module
- `contracts` and `contractAttachments` belong to the legal module

Rule:

If a table represents the canonical state of one module, keep it inside that
module instead of spreading ownership across multiple packages.

### 2. Use normal relations inside a module boundary

Inside a single module, use ordinary relational modeling:

- foreign keys
- Drizzle relations
- junction tables where needed

Do not avoid normal relational design inside a module just because Voyant also
has a link system for cross-module associations.

Rule:

If the relationship is inside one module boundary, model it directly in SQL.

### 3. Use links and query across module boundaries

When two modules need to be connected, prefer Voyant links and application-
layer query traversal instead of direct cross-module table coupling.

That means:

- do not add a direct foreign key from one module's canonical table to another
  module's canonical table by default
- do not make one module import another module's schema just to establish a
  hard relational dependency
- use links when the relationship crosses a module boundary
- use query/runtime traversal to read the combined graph

Examples:

- bookings related to offers or orders
- products related to external refs
- bookings related to finance or legal surfaces where the owning data lives in
  another module

Rule:

Cross-module relationships should be explicit at the framework/runtime level,
not hidden as direct schema coupling.

For the current pair-first link baseline and the threshold for richer
relationship records, see
[`link-metadata-and-relationship-policy.md`](./link-metadata-and-relationship-policy.md).

If linked reads eventually need denormalized support, keep that as an explicit
derived read-model concern rather than baking it into schema coupling by
default. See
[`cross-module-indexing-and-projection-policy.md`](./cross-module-indexing-and-projection-policy.md).

### 4. Keep schema definitions and relations separate

Prefer splitting schema authoring into:

- `schema-core.ts` or `schema.ts` for tables, columns, indexes, and constraints
- `schema-relations.ts` for Drizzle relation declarations

This keeps ownership and data shape clear and makes it easier to scan:

- what data exists
- what invariants exist
- how records relate

Rule:

Tables first, relations second. Do not bury core table shape in large relation
files or mix relation declarations throughout service code.

## Column And Type Conventions

### 5. Prefer explicit typed columns over generic blobs

Use real typed columns for stable business fields:

- identifiers
- statuses
- dates
- amounts
- codes
- booleans
- structured enums

Avoid pushing stable domain fields into `jsonb` just because it is faster to
 write initially.

Bad fit for `jsonb`:

- reusable business entities
- fields you routinely filter or sort by
- values that should participate in relational constraints
- data that other modules/services will treat as a stable contract

Good fit for `jsonb`:

- metadata
- shape-flexible edge data
- integration payload snapshots
- provider-specific or transport-specific extension fields

Rule:

If the field is part of the stable domain contract, give it a real column.
If it is edge metadata or flexible integration payload, `jsonb` is acceptable.

### 6. Always expose inferred row and input types

Use Drizzle's inferred types as the primary source of truth for row and insert
shapes.

Prefer patterns like:

```ts
export type Booking = typeof bookings.$inferSelect
export type InsertBooking = typeof bookings.$inferInsert
```

This keeps service and route code aligned with the schema instead of drifting
into handwritten parallel types.

Rule:

Schema-owned records should export inferred select/insert types unless there is
 a strong reason to define a narrower DTO on top.

### 7. Be intentional about nullable fields

Nullability should communicate domain meaning, not implementation indecision.

Use nullable columns when:

- the value is genuinely optional
- it becomes available later in the lifecycle
- the data may not exist for all variants of the record

Do not use nullable columns to avoid deciding on validation or lifecycle rules.

## Indexes, Constraints, And Invariants

### 8. Put stable local invariants in the database

Use the database to enforce invariants that are:

- local to one module
- stable
- cheap to validate at write time

Examples:

- uniqueness of a business identifier
- valid enum-like status storage
- one-primary-per-scope patterns when backed by the right key design

Application validation is still necessary, but stable local rules should not
live only in service code.

Rule:

If violating the invariant would always be invalid regardless of caller or
workflow, consider enforcing it in the schema.

### 9. Add indexes deliberately, not mechanically

Indexes should support known query patterns, not just habit.

Common candidates:

- foreign key columns that are frequently joined
- lookup identifiers like booking numbers or invoice numbers
- lifecycle fields used in background work, such as status + due date
- scoped uniqueness constraints

Avoid adding indexes to every field by reflex. Every index increases write and
maintenance cost.

Rule:

Add indexes for real lookup and join patterns that exist in routes, services,
workflows, or background processing.

When the review needs more specific guidance on composite or partial indexes,
use [`index-and-constraint-policy.md`](./index-and-constraint-policy.md)
instead of inventing package-local rules ad hoc.

## Migration Ownership

### 10. Templates and apps own migrations

Voyant packages define schemas. Apps and starters own migration
generation and application.

That means:

- packages export schema
- apps/apps own `drizzle.config.ts`
- apps/apps own the actual migration directories and generated SQL

This keeps final app composition in one place and avoids package-level migration
 collisions when multiple modules are assembled together.

Rule:

Packages declare schema. Apps own migrations.

## Practical Authoring Checklist

When adding or changing schema in a Voyant module:

1. Decide whether the data belongs to this module at all.
2. If the relationship is local, use normal foreign keys and relations.
3. If the relationship crosses a module boundary, use links/query instead of a
   direct foreign key by default.
4. Use typed columns for stable domain fields.
5. Use `jsonb` only for metadata or flexible edge payloads.
6. Export inferred row/input types from the schema file.
7. Add only the indexes and constraints that match real invariants and query
   patterns.
8. Keep migration generation in the app/starter layer.

If the index or constraint needs more than a one-line rationale, record the
shape against the active policy in
[`index-and-constraint-policy.md`](./index-and-constraint-policy.md).

## Non-Goals

This guide does not introduce:

- a new schema DSL
- a framework-specific ORM wrapper
- a requirement that every cross-package connection use exactly the same storage
  strategy

The purpose is consistency, not ceremony.
