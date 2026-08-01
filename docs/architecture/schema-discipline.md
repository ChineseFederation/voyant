# Schema discipline

This document captures the rules that keep Voyant's per-module schemas
shippable as independent packages.

## The FK rule

> **Intra-domain FKs are fine. Cross-domain FKs MUST go through a link table.**

Concretely:

- A reference between two tables defined in **the same package** uses
  Drizzle's `.references(() => other.id, { onDelete: ... })` and creates a
  real Postgres FK constraint.
- A reference between two tables defined in **different packages** uses a
  plain `text("foo_id")` column plus a `defineLink(...)` declaration at the
  template level.

### Why

Each module is a separately publishable package. Cross-package
`.references()` calls force schema co-installation: a consumer who
installs a vertical source package but not the target module that owns the
referenced table cannot create that foreign-key constraint. For example, a
standalone vertical should not create a hard FK into Operations places or
Inventory Product tables unless it is a documented vertical-extension
exception. That breaks the module-as-a-package boundary.

Links keep the wiring explicit at the template (deployment) layer:
- The source package exports a `LinkableDefinition` (e.g.
  `personLinkable`, `productLinkable`).
- The starter declares `defineLink(personLinkable, productLinkable)` in
  `apps/<name>/src/links/`.
- `voyant db sync-links` materialises a pivot table whose lifecycle is
  owned by the starter, not either feature module.

### When you're adding a column

1. Is the target table defined in the same package?
   - **Yes.** Use `.references()`. Done.
2. Is the column for an association the *template* manages, not the
   module itself?
   - **Yes.** Add `text("foo_id")` (indexed if appropriate), export a
     `*Linkable` from each side, and call `defineLink(...)` in the
     consuming template's `src/links/`.
3. Is the column for a *required vertical extension* (e.g.
   `booking_product_details.booking_id` → `bookings.id`)?
   - In rare cases, this is allowed even cross-package because the
     extension package depends on the parent (one-way) and is never used
     without it. Document the exception in code with a comment.

## Known violations (as of 2026-04-25)

The audit below was produced by grepping `\.references\(.*=>.*\.id` across
every `packages/*/src/schema*.ts` and `packages/*/src/schema/*.ts` file,
then filtering to imports that cross package boundaries (excluding shared
helpers like `@voyant-travel/db/lib/typeid-column` and type-only imports of
`KmsEnvelope`).

Type-only imports (`import type { ... }`) and `relations(...)`-only
references are excluded — they don't create FK constraints.

| Source package | Target package (table) | File(s) | Status |
|---|---|---|---|
| `ground` | `facilities` / target `places` (`facilities`) | `schema-dispatch.ts`, `schema-operations.ts`, `schema-operators.ts` | Resolved in #1790: `facilityId` columns are loose ids with indexes. |
| `ground` | `identity` (`identity_addresses`) | `schema-dispatch.ts`, `schema-operations.ts` | 6 |
| `accommodations` | `facilities` / target `places` (`properties`) | `schema-bookings.ts`, `schema-inventory.ts` | Resolved in #1790: `propertyId` columns are loose ids with indexes. |
| `accommodations` | `bookings` (`booking_items`) | `schema-bookings.ts` | 1 |
| `suppliers` | `facilities` / target `places` (`facilities`) | `schema.ts` | Resolved in #1790: `primaryFacilityId` / `facilityId` columns are loose ids with indexes. |

Unresolved rows remain follow-up issues: convert the `.references()` call to a
plain `text()` column + `defineLink()` at the template level. File issues
per-package so the work parallelises.

## Soft-delete discipline

Tables that declare `deletedAt` are filtered automatically by
`createCrudService(...)`'s `list` / `count` / `listAndCount` / `retrieve`
methods. The default is "active rows only"; pass `includeDeleted: true`
to opt back in (admin recycle bins, audit reports, reconciliation jobs).

For ad-hoc queries that don't go through `createCrudService`, compose
`whereActive(table)` from `@voyant-travel/db/lifecycle` into the WHERE clause:

```ts
import { and, eq } from "drizzle-orm"
import { whereActive } from "@voyant-travel/db/lifecycle"

await db
  .select()
  .from(bookings)
  .where(and(eq(bookings.organizationId, orgId), whereActive(bookings)))
```

`whereActive(table)` returns `undefined` for tables without `deletedAt`,
so `and(other, undefined)` collapses cleanly — the helper is safe to
apply unconditionally.

`hasSoftDelete(table)` is exported alongside for code paths that need to
branch on whether soft-delete applies (e.g. when generating dynamic
clauses).

## Migration generation & ordering

A deployment's schema migration plan is **derived from package manifests
selected by `voyant.config.ts`**, not hand-listed in starter config. Package
schema and migration facets plus transitive schema requirements are resolved
into disposable `.voyant/` graph artifacts.

Rules:

- **Never copy package schemas or migrations into a starter.** Select the owning
  module/plugin in `voyant.config.ts`; the graph migration plan consumes its
  published migration history.
- **Local modules own their migration history beside their schema.** Keep
  `src/modules/<name>/schema.ts`, its Drizzle config, and
  `src/modules/<name>/migrations/` together. Generate SQL with Drizzle Kit
  directly and declare that module-scoped folder as a deployment migration
  source. Do not collapse local module histories into a root aggregate folder.
- **Reusable modules and plugins ship migrations.** Their package manifest
  declares the package-owned migration facet, and the published tarball contains
  the SQL and journal. A consuming application neither regenerates nor copies it.
- **Generation and application are separate.** ORM tooling such as Drizzle Kit
  generates committed migrations. `voyant migrate` only applies the admitted,
  immutable graph plan; it never generates SQL during deployment.
- **New Drizzle migrations use timestamp prefixes.** Pass `--prefix timestamp`
  when invoking Drizzle Kit directly, so concurrently-authored migrations never
  collide on a sequential index. The pre-existing sequential migrations stay
  as-is.
- **Pre-existing duplicate prefixes are baselined**, not rewritten, in
  `migrations/duplicate-prefixes.baseline.json`. `voyant db doctor` fails only
  on *new* (un-baselined) collisions.
- **Cross-module link tables are owned by the package declaring the link.** Its
  append-only migration must safely adopt an object created by the retired
  deployment migration history.
- **`voyant db doctor --fail-on-drift` gates CI** — it cross-checks manifest
  resolvability, schema parity, generated-manifest freshness, duplicate prefixes
  (vs the baseline), and that every link table is in the latest snapshot.

Generated project artifacts live only under `.voyant/` and are disposable.
